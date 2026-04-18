-- ============================================================
-- Word Count + Realtime Upgrade
-- Date: 2026-04-19
-- Goal:
--   1) Update paid plan quotas/prices
--   2) Add true unlimited handling for the $50 plan
--   3) Harden usage functions for active/non-expired subscriptions
--   4) Enable Supabase realtime on usage/subscriptions/plans
-- ============================================================

-- ── 1) Plan limits + pricing (idempotent upsert) ───────────
-- Notes:
--   - free: fallback tier
--   - business: $50/mo, unlimited daily words (stored as -1 sentinel)
INSERT INTO public.plans (
  name,
  display_name,
  price_monthly,
  price_yearly,
  daily_words_fast,
  daily_words_stealth,
  duration_days,
  max_style_profiles,
  engines,
  features,
  is_active
) VALUES
(
  'free',
  'Free',
  0.00,
  0.00,
  1000,
  0,
  0,
  1,
  '{"oxygen","ozone","easy"}',
  '["1,000 words/day", "Core engines", "Basic support"]'::jsonb,
  true
),
(
  'starter',
  'Starter',
  5.00,
  4.25,
  20000,
  0,
  30,
  1,
  '{"oxygen","ozone","easy","oxygen3","humara_v3_3","nuru_v2","ghost_pro_wiki"}',
  '["20,000 words/day", "All engine modes", "Email support"]'::jsonb,
  true
),
(
  'creator',
  'Creator',
  10.00,
  8.50,
  50000,
  0,
  30,
  3,
  '{"oxygen","ozone","easy","oxygen3","humara_v3_3","nuru_v2","ghost_pro_wiki"}',
  '["50,000 words/day", "All engine modes", "Priority support", "Style memory"]'::jsonb,
  true
),
(
  'professional',
  'Professional',
  20.00,
  17.00,
  100000,
  0,
  30,
  5,
  '{"oxygen","ozone","easy","oxygen3","humara_v3_3","nuru_v2","ghost_pro_wiki"}',
  '["100,000 words/day", "All engine modes", "API access", "Priority support"]'::jsonb,
  true
),
(
  'business',
  'Business Unlimited',
  50.00,
  42.50,
  -1,
  0,
  30,
  -1,
  '{"oxygen","ozone","easy","oxygen3","humara_v3_3","nuru_v2","ghost_pro_wiki"}',
  '["Unlimited daily words", "All engine modes", "API access", "Dedicated support"]'::jsonb,
  true
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  daily_words_fast = EXCLUDED.daily_words_fast,
  daily_words_stealth = EXCLUDED.daily_words_stealth,
  duration_days = EXCLUDED.duration_days,
  max_style_profiles = EXCLUDED.max_style_profiles,
  engines = EXCLUDED.engines,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active;

-- ── 2) Normalize todays usage limits to active plan values ──
WITH latest_plan AS (
  SELECT DISTINCT ON (s.user_id)
    s.user_id,
    p.daily_words_fast,
    p.daily_words_stealth
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.status = 'active'
    AND s.current_period_end > NOW()
  ORDER BY s.user_id, s.created_at DESC
)
UPDATE public.usage u
SET
  words_limit_fast = lp.daily_words_fast,
  words_limit_stealth = lp.daily_words_stealth,
  updated_at = NOW()
FROM latest_plan lp
WHERE u.user_id = lp.user_id
  AND u.usage_date = CURRENT_DATE;

-- ── 3) increment_usage with unlimited support ──────────────
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id UUID,
  p_words INTEGER,
  p_engine_type TEXT DEFAULT 'fast'
)
RETURNS JSONB AS $$
DECLARE
  current_usage RECORD;
  v_limit_fast INTEGER;
  v_limit_stealth INTEGER;
  v_is_unlimited BOOLEAN;
  v_total_used INTEGER;
  v_total_limit INTEGER;
BEGIN
  SELECT p.daily_words_fast, p.daily_words_stealth
  INTO v_limit_fast, v_limit_stealth
  FROM public.subscriptions s
  JOIN public.plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
    AND s.current_period_end > NOW()
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_limit_fast IS NULL THEN v_limit_fast := 1000; END IF;
  IF v_limit_stealth IS NULL THEN v_limit_stealth := 0; END IF;

  v_is_unlimited := (v_limit_fast < 0 OR v_limit_stealth < 0);

  INSERT INTO public.usage (
    user_id,
    usage_date,
    words_used_fast,
    words_used_stealth,
    words_limit_fast,
    words_limit_stealth,
    requests
  )
  VALUES (
    p_user_id,
    CURRENT_DATE,
    CASE WHEN p_engine_type IN ('fast','standard') THEN p_words ELSE 0 END,
    CASE WHEN p_engine_type IN ('stealth','undetectable') THEN p_words ELSE 0 END,
    v_limit_fast,
    v_limit_stealth,
    1
  )
  ON CONFLICT (user_id, usage_date) DO UPDATE SET
    words_used_fast = public.usage.words_used_fast + CASE WHEN p_engine_type IN ('fast','standard') THEN p_words ELSE 0 END,
    words_used_stealth = public.usage.words_used_stealth + CASE WHEN p_engine_type IN ('stealth','undetectable') THEN p_words ELSE 0 END,
    words_limit_fast = v_limit_fast,
    words_limit_stealth = v_limit_stealth,
    requests = public.usage.requests + 1,
    updated_at = NOW()
  RETURNING * INTO current_usage;

  v_total_used := COALESCE(current_usage.words_used_fast, 0) + COALESCE(current_usage.words_used_stealth, 0);
  v_total_limit := COALESCE(v_limit_fast, 0) + COALESCE(v_limit_stealth, 0);

  IF NOT v_is_unlimited AND v_total_used > v_total_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'is_unlimited', false,
      'words_used_fast', current_usage.words_used_fast,
      'words_used_stealth', current_usage.words_used_stealth,
      'words_limit_fast', v_limit_fast,
      'words_limit_stealth', v_limit_stealth,
      'words_used', v_total_used,
      'words_limit', v_total_limit,
      'remaining', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'is_unlimited', v_is_unlimited,
    'words_used_fast', current_usage.words_used_fast,
    'words_used_stealth', current_usage.words_used_stealth,
    'words_limit_fast', v_limit_fast,
    'words_limit_stealth', v_limit_stealth,
    'remaining_fast', CASE WHEN v_limit_fast < 0 THEN -1 ELSE GREATEST(0, v_limit_fast - current_usage.words_used_fast) END,
    'remaining_stealth', CASE WHEN v_limit_stealth < 0 THEN -1 ELSE GREATEST(0, v_limit_stealth - current_usage.words_used_stealth) END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4) get_usage_stats with unlimited support ──────────────
CREATE OR REPLACE FUNCTION public.get_usage_stats(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_usage RECORD;
  v_sub RECORD;
  v_doc_count INTEGER;
  v_total_words BIGINT;
  v_avg_ai_defeated NUMERIC;
  v_days_remaining INTEGER;
  v_limit_fast INTEGER;
  v_limit_stealth INTEGER;
  v_is_unlimited BOOLEAN;
BEGIN
  SELECT * INTO v_usage
  FROM public.usage
  WHERE user_id = p_user_id
    AND usage_date = CURRENT_DATE;

  SELECT
    s.id AS sub_id,
    s.status,
    s.current_period_start,
    s.current_period_end,
    p.id AS plan_id,
    p.name,
    p.display_name,
    p.daily_words_fast,
    p.daily_words_stealth
  INTO v_sub
  FROM public.subscriptions s
  JOIN public.plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
    AND s.current_period_end > NOW()
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_sub IS NOT NULL THEN
    v_days_remaining := GREATEST(0, (v_sub.current_period_end::DATE - CURRENT_DATE));
  ELSE
    v_days_remaining := 0;
  END IF;

  v_limit_fast := COALESCE(v_sub.daily_words_fast, 1000);
  v_limit_stealth := COALESCE(v_sub.daily_words_stealth, 0);
  v_is_unlimited := (v_limit_fast < 0 OR v_limit_stealth < 0);

  SELECT COUNT(*), COALESCE(SUM(output_word_count), 0)
  INTO v_doc_count, v_total_words
  FROM public.documents
  WHERE user_id = p_user_id;

  SELECT COALESCE(AVG(input_ai_score - output_ai_score), 0)
  INTO v_avg_ai_defeated
  FROM public.documents
  WHERE user_id = p_user_id
    AND input_ai_score IS NOT NULL
    AND output_ai_score IS NOT NULL;

  RETURN jsonb_build_object(
    'words_used_fast', COALESCE(v_usage.words_used_fast, 0),
    'words_used_stealth', COALESCE(v_usage.words_used_stealth, 0),
    'words_limit_fast', v_limit_fast,
    'words_limit_stealth', v_limit_stealth,
    'is_unlimited', v_is_unlimited,
    'requests_today', COALESCE(v_usage.requests, 0),
    'days_remaining', v_days_remaining,
    'plan_name', COALESCE(v_sub.display_name, 'Free'),
    'plan_key', COALESCE(v_sub.name, 'free'),
    'total_documents', v_doc_count,
    'total_words_humanized', v_total_words,
    'avg_ai_defeated', ROUND(v_avg_ai_defeated, 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5) Realtime publication setup ──────────────────────────
DO $$
DECLARE
  pub_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) INTO pub_exists;

  IF pub_exists THEN
    -- Add core usage/billing tables for live updates in app clients.
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.usage;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.plans;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- ============================================================
-- End migration
-- ============================================================
