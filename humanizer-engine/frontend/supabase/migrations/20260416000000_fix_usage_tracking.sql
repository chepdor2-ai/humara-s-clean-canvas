-- Fix increment_usage: ensure current_period_end check, update limits on conflict, return consistent keys
CREATE OR REPLACE FUNCTION public.increment_usage(p_user_id UUID, p_words INTEGER, p_engine_type TEXT DEFAULT 'fast')
RETURNS JSONB AS $$
DECLARE
  current_usage RECORD;
  v_limit_fast INTEGER;
  v_limit_stealth INTEGER;
BEGIN
  -- Get limits from active (non-expired) subscription
  SELECT p.daily_words_fast, p.daily_words_stealth INTO v_limit_fast, v_limit_stealth
  FROM public.subscriptions s
  JOIN public.plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
    AND s.current_period_end > NOW()
  ORDER BY s.created_at DESC LIMIT 1;

  -- Free tier defaults
  IF v_limit_fast IS NULL THEN v_limit_fast := 1000; END IF;
  IF v_limit_stealth IS NULL THEN v_limit_stealth := 0; END IF;

  -- Upsert today's usage row
  INSERT INTO public.usage (user_id, usage_date, words_used_fast, words_used_stealth, words_limit_fast, words_limit_stealth, requests)
  VALUES (
    p_user_id, CURRENT_DATE,
    CASE WHEN p_engine_type IN ('fast','standard') THEN p_words ELSE 0 END,
    CASE WHEN p_engine_type IN ('stealth','undetectable') THEN p_words ELSE 0 END,
    v_limit_fast, v_limit_stealth, 1
  )
  ON CONFLICT (user_id, usage_date) DO UPDATE SET
    words_used_fast    = public.usage.words_used_fast + CASE WHEN p_engine_type IN ('fast','standard') THEN p_words ELSE 0 END,
    words_used_stealth = public.usage.words_used_stealth + CASE WHEN p_engine_type IN ('stealth','undetectable') THEN p_words ELSE 0 END,
    words_limit_fast   = v_limit_fast,
    words_limit_stealth = v_limit_stealth,
    requests           = public.usage.requests + 1,
    updated_at         = NOW()
  RETURNING * INTO current_usage;

  -- Unified quota check
  IF (current_usage.words_used_fast + current_usage.words_used_stealth) > (v_limit_fast + v_limit_stealth) THEN
    RETURN jsonb_build_object('allowed', false,
      'words_used_fast', current_usage.words_used_fast,
      'words_used_stealth', current_usage.words_used_stealth,
      'words_limit_fast', v_limit_fast,
      'words_limit_stealth', v_limit_stealth,
      'words_used', current_usage.words_used_fast + current_usage.words_used_stealth,
      'words_limit', v_limit_fast + v_limit_stealth,
      'remaining', 0);
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'words_used_fast', current_usage.words_used_fast,
    'words_used_stealth', current_usage.words_used_stealth,
    'words_limit_fast', v_limit_fast,
    'words_limit_stealth', v_limit_stealth,
    'remaining_fast', GREATEST(0, v_limit_fast - current_usage.words_used_fast),
    'remaining_stealth', GREATEST(0, v_limit_stealth - current_usage.words_used_stealth)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix get_usage_stats: ensure current_period_end check
CREATE OR REPLACE FUNCTION public.get_usage_stats(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_usage RECORD;
  v_sub RECORD;
  v_doc_count INTEGER;
  v_total_words BIGINT;
  v_avg_ai_defeated NUMERIC;
  v_days_remaining INTEGER;
BEGIN
  -- Today's usage
  SELECT * INTO v_usage FROM public.usage
  WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;

  -- Active subscription + plan (must not be expired)
  SELECT s.id AS sub_id, s.status, s.current_period_start, s.current_period_end,
         p.id AS plan_id, p.name, p.display_name, p.daily_words_fast, p.daily_words_stealth
  INTO v_sub
  FROM public.subscriptions s
  JOIN public.plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
    AND s.current_period_end > NOW()
  ORDER BY s.created_at DESC LIMIT 1;

  -- Days remaining
  IF v_sub IS NOT NULL THEN
    v_days_remaining := GREATEST(0, (v_sub.current_period_end::DATE - CURRENT_DATE));
  ELSE
    v_days_remaining := 0;
  END IF;

  -- Document stats
  SELECT COUNT(*), COALESCE(SUM(output_word_count), 0)
  INTO v_doc_count, v_total_words
  FROM public.documents WHERE user_id = p_user_id;

  -- Avg AI defeated
  SELECT COALESCE(AVG(input_ai_score - output_ai_score), 0)
  INTO v_avg_ai_defeated
  FROM public.documents
  WHERE user_id = p_user_id AND input_ai_score IS NOT NULL AND output_ai_score IS NOT NULL;

  RETURN jsonb_build_object(
    'words_used_fast', COALESCE(v_usage.words_used_fast, 0),
    'words_used_stealth', COALESCE(v_usage.words_used_stealth, 0),
    'words_limit_fast', COALESCE(v_sub.daily_words_fast, 1000),
    'words_limit_stealth', COALESCE(v_sub.daily_words_stealth, 0),
    'requests_today', COALESCE(v_usage.requests, 0),
    'days_remaining', v_days_remaining,
    'plan_name', COALESCE(v_sub.display_name, 'Free'),
    'total_documents', v_doc_count,
    'total_words_humanized', v_total_words,
    'avg_ai_defeated', ROUND(v_avg_ai_defeated, 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure unique constraint exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usage_user_id_usage_date_key'
  ) THEN
    ALTER TABLE public.usage ADD CONSTRAINT usage_user_id_usage_date_key UNIQUE (user_id, usage_date);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
