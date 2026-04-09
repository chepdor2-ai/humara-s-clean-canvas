-- ============================================================
-- Unified Word Count Migration
-- 2026-04-10: Simplify plans to single word pool, add free tier
-- ============================================================

-- ── 1. Update plans: unified word counts, only oxygen/ozone/easy ───
-- Move profiles referencing old plans to the 'free' plan first
DO $$ 
DECLARE v_free_id UUID;
BEGIN
  -- Ensure free plan exists
  INSERT INTO public.plans (name, display_name, price_monthly, daily_words_fast, daily_words_stealth, engines)
  VALUES ('free', 'Free', 0, 1000, 0, '{"oxygen","ozone","easy"}')
  ON CONFLICT (name) DO NOTHING;
  
  SELECT id INTO v_free_id FROM public.plans WHERE name = 'free';
  
  -- Reassign profiles and subscriptions from old plans
  UPDATE public.profiles SET plan_id = v_free_id
  WHERE plan_id IN (SELECT id FROM public.plans WHERE name NOT IN ('free','starter','creator','professional','business'));
  
  UPDATE public.subscriptions SET plan_id = v_free_id, status = 'expired'
  WHERE plan_id IN (SELECT id FROM public.plans WHERE name NOT IN ('free','starter','creator','professional','business'));
  
  -- Now safe to delete old plans
  DELETE FROM public.plans WHERE name NOT IN ('free','starter','creator','professional','business');
END $$;

INSERT INTO public.plans (name, display_name, price_monthly, price_yearly, daily_words_fast, daily_words_stealth, duration_days, max_style_profiles, engines, features) VALUES
  ('free',         'Free',           0.00,  0.00,   1000, 0, 0,  1, '{"oxygen","ozone","easy"}', '["1,000 words/day","3 Engines","Basic AI Detection"]'),
  ('starter',      'Starter',        5.00,  4.25,  10000, 0, 30, 1, '{"oxygen","ozone","easy"}', '["10,000 words/day","3 Engines","Full AI Detection","Email Support"]'),
  ('creator',      'Creator',       10.00,  8.50,  30000, 0, 30, 3, '{"oxygen","ozone","easy"}', '["30,000 words/day","3 Engines","Full Detector Suite","Style Memory (3 slots)","Priority Support"]'),
  ('professional', 'Professional',  20.00, 17.00,  80000, 0, 30, 5, '{"oxygen","ozone","easy"}', '["80,000 words/day","3 Engines","All Features","Style Memory (5 slots)","API Access"]'),
  ('business',     'Business',      35.00, 29.75, 200000, 0, 30, -1, '{"oxygen","ozone","easy"}', '["200,000 words/day","3 Engines","All Features","Unlimited Style Profiles","Full API Access","Dedicated Manager"]')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  daily_words_fast = EXCLUDED.daily_words_fast,
  daily_words_stealth = EXCLUDED.daily_words_stealth,
  duration_days = EXCLUDED.duration_days,
  max_style_profiles = EXCLUDED.max_style_profiles,
  engines = EXCLUDED.engines,
  features = EXCLUDED.features;

-- ── 2. Updated increment_usage with 1000 free default ──────
CREATE OR REPLACE FUNCTION public.increment_usage(p_user_id UUID, p_words INTEGER, p_engine_type TEXT DEFAULT 'fast')
RETURNS JSONB AS $$
DECLARE
  current_usage RECORD;
  v_limit_fast INTEGER;
  v_limit_stealth INTEGER;
BEGIN
  SELECT p.daily_words_fast, p.daily_words_stealth INTO v_limit_fast, v_limit_stealth
  FROM public.subscriptions s
  JOIN public.plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id AND s.status = 'active'
  ORDER BY s.created_at DESC LIMIT 1;

  -- Free tier defaults
  IF v_limit_fast IS NULL THEN v_limit_fast := 1000; END IF;
  IF v_limit_stealth IS NULL THEN v_limit_stealth := 0; END IF;

  INSERT INTO public.usage (user_id, usage_date, words_used_fast, words_used_stealth, words_limit_fast, words_limit_stealth, requests)
  VALUES (
    p_user_id, CURRENT_DATE,
    CASE WHEN p_engine_type IN ('fast','standard') THEN p_words ELSE 0 END,
    CASE WHEN p_engine_type IN ('stealth','undetectable') THEN p_words ELSE 0 END,
    v_limit_fast, v_limit_stealth, 1
  )
  ON CONFLICT (user_id, usage_date) DO UPDATE SET
    words_used_fast = public.usage.words_used_fast + CASE WHEN p_engine_type IN ('fast','standard') THEN p_words ELSE 0 END,
    words_used_stealth = public.usage.words_used_stealth + CASE WHEN p_engine_type IN ('stealth','undetectable') THEN p_words ELSE 0 END,
    words_limit_fast = v_limit_fast,
    words_limit_stealth = v_limit_stealth,
    requests = public.usage.requests + 1,
    updated_at = NOW()
  RETURNING * INTO current_usage;

  -- Unified quota check (combine fast+stealth into one pool)
  IF (current_usage.words_used_fast + current_usage.words_used_stealth) > (v_limit_fast + v_limit_stealth) THEN
    RETURN jsonb_build_object('allowed', false,
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

-- ── 3. Updated get_usage_stats with Free defaults ──────────
CREATE OR REPLACE FUNCTION public.get_usage_stats(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_usage RECORD;
  v_plan RECORD;
  v_sub RECORD;
  v_doc_count INTEGER;
  v_total_words BIGINT;
  v_avg_ai_defeated NUMERIC;
  v_days_remaining INTEGER;
BEGIN
  SELECT * INTO v_usage FROM public.usage
  WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;

  SELECT s.*, p.* INTO v_sub
  FROM public.subscriptions s
  JOIN public.plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id AND s.status = 'active'
  ORDER BY s.created_at DESC LIMIT 1;

  SELECT p.* INTO v_plan
  FROM public.subscriptions s
  JOIN public.plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id AND s.status = 'active'
  ORDER BY s.created_at DESC LIMIT 1;

  IF v_sub IS NOT NULL THEN
    v_days_remaining := GREATEST(0, (v_sub.current_period_end::DATE - CURRENT_DATE));
  ELSE
    v_days_remaining := 0;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(output_word_count), 0)
  INTO v_doc_count, v_total_words
  FROM public.documents WHERE user_id = p_user_id;

  SELECT COALESCE(AVG(input_ai_score - output_ai_score), 0)
  INTO v_avg_ai_defeated
  FROM public.documents
  WHERE user_id = p_user_id AND input_ai_score IS NOT NULL AND output_ai_score IS NOT NULL;

  RETURN jsonb_build_object(
    'words_used_fast', COALESCE(v_usage.words_used_fast, 0),
    'words_used_stealth', COALESCE(v_usage.words_used_stealth, 0),
    'words_limit_fast', COALESCE(v_plan.daily_words_fast, 1000),
    'words_limit_stealth', COALESCE(v_plan.daily_words_stealth, 0),
    'requests_today', COALESCE(v_usage.requests, 0),
    'days_remaining', v_days_remaining,
    'plan_name', COALESCE(v_plan.display_name, 'Free'),
    'total_documents', v_doc_count,
    'total_words_humanized', v_total_words,
    'avg_ai_defeated', ROUND(v_avg_ai_defeated, 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
