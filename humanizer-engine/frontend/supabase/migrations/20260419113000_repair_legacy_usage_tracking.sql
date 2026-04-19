-- Repair legacy monthly usage artifacts so daily word tracking can work.
-- Safe to run multiple times.

DO $repair_usage_columns$
BEGIN
  ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS usage_date DATE;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usage'
      AND column_name = 'period_start'
  ) THEN
    EXECUTE 'UPDATE public.usage SET usage_date = COALESCE(usage_date, period_start::date, CURRENT_DATE) WHERE usage_date IS NULL';
  ELSE
    UPDATE public.usage
    SET usage_date = COALESCE(usage_date, CURRENT_DATE)
    WHERE usage_date IS NULL;
  END IF;

  ALTER TABLE public.usage ALTER COLUMN usage_date SET DEFAULT CURRENT_DATE;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Legacy usage column repair skipped: %', SQLERRM;
END $repair_usage_columns$;

ALTER TABLE public.usage DROP CONSTRAINT IF EXISTS usage_user_id_period_start_key;
ALTER TABLE public.usage DROP CONSTRAINT IF EXISTS usage_user_period_start_key;
ALTER TABLE public.usage DROP CONSTRAINT IF EXISTS usage_user_date_unique;
DROP INDEX IF EXISTS public.usage_user_id_period_start_key;
DROP INDEX IF EXISTS public.idx_usage_user_period_start;
DROP INDEX IF EXISTS public.idx_usage_period_start;
DROP INDEX IF EXISTS public.idx_usage_user_period;
DROP INDEX IF EXISTS public.idx_usage_user_usage_date_unique;

DO $repair_usage_not_null$
BEGIN
  ALTER TABLE public.usage ALTER COLUMN usage_date SET NOT NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not enforce NOT NULL on public.usage.usage_date: %', SQLERRM;
END $repair_usage_not_null$;

DO $repair_usage_unique$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.usage'::regclass
      AND conname = 'usage_user_id_usage_date_key'
  ) THEN
    ALTER TABLE public.usage
      ADD CONSTRAINT usage_user_id_usage_date_key UNIQUE (user_id, usage_date);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create canonical usage unique constraint: %', SQLERRM;
END $repair_usage_unique$;

CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id     UUID,
  p_words       INTEGER,
  p_engine_type TEXT DEFAULT 'fast'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $increment$
DECLARE
  current_usage   RECORD;
  v_limit_fast    INTEGER;
  v_limit_stealth INTEGER;
  v_is_unlimited  BOOLEAN;
  v_total_used    INTEGER;
  v_total_limit   INTEGER;
BEGIN
  SELECT p.daily_words_fast, p.daily_words_stealth
    INTO v_limit_fast, v_limit_stealth
    FROM public.subscriptions s
    JOIN public.plans p ON s.plan_id = p.id
   WHERE s.user_id = p_user_id
     AND s.status  = 'active'
     AND s.current_period_end > NOW()
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF v_limit_fast    IS NULL THEN v_limit_fast    := 1000; END IF;
  IF v_limit_stealth IS NULL THEN v_limit_stealth := 0;    END IF;

  v_is_unlimited := (v_limit_fast < 0 OR v_limit_stealth < 0);

  INSERT INTO public.usage (
    user_id, usage_date,
    words_used_fast, words_used_stealth,
    words_limit_fast, words_limit_stealth,
    requests
  ) VALUES (
    p_user_id, CURRENT_DATE,
    CASE WHEN p_engine_type IN ('fast','standard')        THEN p_words ELSE 0 END,
    CASE WHEN p_engine_type IN ('stealth','undetectable') THEN p_words ELSE 0 END,
    v_limit_fast, v_limit_stealth, 1
  )
  ON CONFLICT (user_id, usage_date) DO UPDATE SET
    words_used_fast    = public.usage.words_used_fast + EXCLUDED.words_used_fast,
    words_used_stealth = public.usage.words_used_stealth + EXCLUDED.words_used_stealth,
    words_limit_fast   = EXCLUDED.words_limit_fast,
    words_limit_stealth = EXCLUDED.words_limit_stealth,
    requests           = public.usage.requests + 1,
    updated_at         = NOW()
  RETURNING * INTO current_usage;

  v_total_used  := COALESCE(current_usage.words_used_fast, 0)
                 + COALESCE(current_usage.words_used_stealth, 0);
  v_total_limit := COALESCE(v_limit_fast, 0) + COALESCE(v_limit_stealth, 0);

  IF NOT v_is_unlimited AND v_total_limit > 0 AND v_total_used > v_total_limit THEN
    RETURN jsonb_build_object(
      'allowed',             false,
      'is_unlimited',        false,
      'words_used_fast',     current_usage.words_used_fast,
      'words_used_stealth',  current_usage.words_used_stealth,
      'words_limit_fast',    v_limit_fast,
      'words_limit_stealth', v_limit_stealth,
      'words_used',          v_total_used,
      'words_limit',         v_total_limit,
      'remaining',           0
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed',             true,
    'is_unlimited',        v_is_unlimited,
    'words_used_fast',     current_usage.words_used_fast,
    'words_used_stealth',  current_usage.words_used_stealth,
    'words_limit_fast',    v_limit_fast,
    'words_limit_stealth', v_limit_stealth,
    'remaining_fast',      CASE WHEN v_limit_fast < 0 THEN -1 ELSE GREATEST(0, v_limit_fast - current_usage.words_used_fast) END,
    'remaining_stealth',   CASE WHEN v_limit_stealth < 0 THEN -1 ELSE GREATEST(0, v_limit_stealth - current_usage.words_used_stealth) END
  );
END;
$increment$;

CREATE OR REPLACE FUNCTION public.get_usage_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $stats$
DECLARE
  v_usage          RECORD;
  v_sub            RECORD;
  v_days_remaining INTEGER;
  v_limit_fast     INTEGER;
  v_limit_stealth  INTEGER;
  v_is_unlimited   BOOLEAN;
BEGIN
  SELECT * INTO v_usage
    FROM public.usage
   WHERE user_id = p_user_id
     AND usage_date = CURRENT_DATE;

  SELECT
    s.current_period_end,
    p.name,
    p.display_name,
    p.daily_words_fast,
    p.daily_words_stealth
  INTO v_sub
    FROM public.subscriptions s
    JOIN public.plans p ON s.plan_id = p.id
   WHERE s.user_id = p_user_id
     AND s.status  = 'active'
     AND s.current_period_end > NOW()
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF v_sub IS NOT NULL THEN
    v_days_remaining := GREATEST(0, (v_sub.current_period_end::DATE - CURRENT_DATE));
  ELSE
    v_days_remaining := 0;
  END IF;

  v_limit_fast    := COALESCE(v_sub.daily_words_fast, 1000);
  v_limit_stealth := COALESCE(v_sub.daily_words_stealth, 0);
  v_is_unlimited  := (v_limit_fast < 0 OR v_limit_stealth < 0);

  RETURN jsonb_build_object(
    'words_used_fast',      COALESCE(v_usage.words_used_fast, 0),
    'words_used_stealth',   COALESCE(v_usage.words_used_stealth, 0),
    'words_limit_fast',     v_limit_fast,
    'words_limit_stealth',  v_limit_stealth,
    'is_unlimited',         v_is_unlimited,
    'requests_today',       COALESCE(v_usage.requests, 0),
    'days_remaining',       v_days_remaining,
    'plan_name',            COALESCE(v_sub.display_name, 'Free'),
    'plan_key',             COALESCE(v_sub.name, 'free')
  );
END;
$stats$;