-- ============================================================
-- Grant Premium Subscription to All Current Users (1 Year)
-- + Admin Accounts Get Unlimited (Business plan, 10 years)
-- 
-- Run this in Supabase SQL Editor after running the schema migration.
-- Safe to run multiple times — expires current active subs and recreates them.
-- ============================================================

-- Ensure required plans exist (idempotent upsert by name)
INSERT INTO public.plans (name, display_name, price_monthly, price_yearly, daily_words_fast, daily_words_stealth, duration_days, max_style_profiles, engines, features) VALUES
  ('professional', 'Professional', 20.00, 17.00,  80000, 0, 30,  5, '{"oxygen","ozone","easy"}', '["80,000 words/day","3 Engines","All Features"]'),
  ('business',     'Business',     35.00, 29.75, 200000, 0, 30, -1, '{"oxygen","ozone","easy"}', '["200,000 words/day","3 Engines","All Features"]')
ON CONFLICT (name) DO UPDATE SET
  display_name        = EXCLUDED.display_name,
  price_monthly       = EXCLUDED.price_monthly,
  price_yearly        = EXCLUDED.price_yearly,
  daily_words_fast    = EXCLUDED.daily_words_fast,
  daily_words_stealth = EXCLUDED.daily_words_stealth,
  duration_days       = EXCLUDED.duration_days,
  max_style_profiles  = EXCLUDED.max_style_profiles,
  engines             = EXCLUDED.engines,
  features            = EXCLUDED.features;

-- ── 1. Give ALL current users a Professional subscription for 1 year ──
DO $$
DECLARE
  v_plan_id UUID;
BEGIN
  SELECT id INTO v_plan_id FROM public.plans WHERE name = 'professional' LIMIT 1;
  
  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Professional plan not found. Run the schema migration first.';
  END IF;

  -- Expire any existing active subscriptions first
  UPDATE public.subscriptions
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'active';

  -- Create new 1-year Professional subscription for each user (set-based)
  INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
  SELECT u.id, v_plan_id, 'active', NOW(), NOW() + INTERVAL '365 days'
  FROM auth.users u;

  -- Ensure every user has a profile and point it to the Professional plan
  INSERT INTO public.profiles (id, plan_id, updated_at)
  SELECT u.id, v_plan_id, NOW()
  FROM auth.users u
  ON CONFLICT (id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    updated_at = EXCLUDED.updated_at;

  RAISE NOTICE 'All users granted Professional plan for 1 year.';
END $$;

-- ── 2. Upgrade admins to Business plan with unlimited (10 years) ──────
-- Admin emails: maguna956@gmail.com, maxwellotieno11@gmail.com
DO $$
DECLARE
  v_business_id UUID;
  v_admin_emails TEXT[] := ARRAY['maguna956@gmail.com', 'maxwellotieno11@gmail.com'];
  v_email TEXT;
BEGIN
  SELECT id INTO v_business_id FROM public.plans WHERE name = 'business' LIMIT 1;
  
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Business plan not found. Run the schema migration first.';
  END IF;

  FOREACH v_email IN ARRAY v_admin_emails LOOP
    -- Use email lookup per admin
    PERFORM 1;
    
    -- Expire any existing subscriptions for this admin
    UPDATE public.subscriptions
    SET status = 'expired', updated_at = NOW()
    WHERE user_id = (SELECT id FROM auth.users WHERE email = v_email LIMIT 1)
      AND status = 'active';
    
    -- Create 10-year Business subscription (effectively unlimited)
    INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
    SELECT u.id, v_business_id, 'active', NOW(), NOW() + INTERVAL '3650 days'
    FROM auth.users u
    WHERE u.email = v_email;

    -- Ensure profile exists + update plan
    INSERT INTO public.profiles (id, plan_id, updated_at)
    SELECT u.id, v_business_id, NOW()
    FROM auth.users u
    WHERE u.email = v_email
    ON CONFLICT (id) DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      updated_at = EXCLUDED.updated_at;

    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
      RAISE NOTICE 'Admin % upgraded to Business plan (10 years).', v_email;
    ELSE
      RAISE NOTICE 'Admin % not found in auth.users — skipped.', v_email;
    END IF;
  END LOOP;
END $$;
