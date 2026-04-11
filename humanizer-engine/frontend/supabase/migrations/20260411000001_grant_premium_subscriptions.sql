-- ============================================================
-- Grant Premium Subscription to All Current Users (1 Year)
-- + Admin Accounts Get Unlimited (Business plan, 10 years)
-- 
-- Run this in Supabase SQL Editor after running the schema migration.
-- Safe to run multiple times — uses upsert logic.
-- ============================================================

-- ── 1. Give ALL current users a Professional subscription for 1 year ──
DO $$
DECLARE
  v_plan_id UUID;
  v_user RECORD;
BEGIN
  SELECT id INTO v_plan_id FROM public.plans WHERE name = 'professional';
  
  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Professional plan not found. Run the schema migration first.';
  END IF;

  -- Expire any existing active subscriptions first
  UPDATE public.subscriptions
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'active';

  -- Create new 1-year Professional subscription for each user
  FOR v_user IN SELECT id FROM auth.users LOOP
    INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
    VALUES (v_user.id, v_plan_id, 'active', NOW(), NOW() + INTERVAL '365 days');

    -- Update profile to point to professional plan
    UPDATE public.profiles SET plan_id = v_plan_id, updated_at = NOW()
    WHERE id = v_user.id;
  END LOOP;

  RAISE NOTICE 'All users granted Professional plan for 1 year.';
END $$;

-- ── 2. Upgrade admins to Business plan with unlimited (10 years) ──────
-- Admin emails: maguna956@gmail.com, maxwellotieno11@gmail.com
DO $$
DECLARE
  v_business_id UUID;
  v_admin_emails TEXT[] := ARRAY['maguna956@gmail.com', 'maxwellotieno11@gmail.com'];
  v_email TEXT;
  v_user_id UUID;
BEGIN
  SELECT id INTO v_business_id FROM public.plans WHERE name = 'business';
  
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Business plan not found. Run the schema migration first.';
  END IF;

  FOREACH v_email IN ARRAY v_admin_emails LOOP
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
    
    IF v_user_id IS NOT NULL THEN
      -- Expire any existing subscriptions for this admin
      UPDATE public.subscriptions
      SET status = 'expired', updated_at = NOW()
      WHERE user_id = v_user_id AND status = 'active';

      -- Create 10-year Business subscription (effectively unlimited)
      INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
      VALUES (v_user_id, v_business_id, 'active', NOW(), NOW() + INTERVAL '3650 days');

      -- Update profile
      UPDATE public.profiles SET plan_id = v_business_id, updated_at = NOW()
      WHERE id = v_user_id;

      RAISE NOTICE 'Admin % upgraded to Business plan (10 years).', v_email;
    ELSE
      RAISE NOTICE 'Admin % not found in auth.users — skipped.', v_email;
    END IF;
  END LOOP;
END $$;
