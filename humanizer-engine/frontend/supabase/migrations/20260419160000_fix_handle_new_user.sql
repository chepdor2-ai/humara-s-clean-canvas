-- ══════════════════════════════════════════════════════════
-- FIX: handle_new_user() trigger — bullet-proof for Google OAuth sign-up
-- The old trigger would throw if:
--   • no 'free' plan exists in the plans table
--   • the subscriptions insert had a constraint violation
--   • the usage table had unexpected NOT NULL columns
-- This version catches all errors and never blocks user creation.
-- ══════════════════════════════════════════════════════════

-- 1) Ensure a 'free' plan always exists (matching actual plans table schema)
INSERT INTO public.plans (
  name, display_name, price_monthly, price_yearly,
  daily_words_fast, daily_words_stealth, duration_days,
  max_style_profiles, engines, features, is_active
)
VALUES (
  'free', 'Free', 0.00, 0.00,
  1000, 0, 0,
  1, ARRAY['oxygen','easy','ninja_1'],
  '["1,000 words/day","Core engines","Basic AI detection"]'::jsonb, true
)
ON CONFLICT (name) DO NOTHING;

-- 2) Replace the trigger function with a resilient version
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_free_plan_id UUID;
BEGIN
  -- Safely look up the free plan (may not exist in edge cases)
  SELECT id INTO v_free_plan_id FROM public.plans WHERE name = 'free' LIMIT 1;

  -- Create profile (safe: ON CONFLICT DO NOTHING)
  BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url, plan_id)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
      COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
      v_free_plan_id
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] profile insert failed for %: %', NEW.id, SQLERRM;
  END;

  -- Create free subscription (safe: catches any constraint error)
  BEGIN
    IF v_free_plan_id IS NOT NULL THEN
      INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_end)
      VALUES (
        NEW.id,
        v_free_plan_id,
        'active',
        NOW() + INTERVAL '365 days'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] subscription insert failed for %: %', NEW.id, SQLERRM;
  END;

  -- Create initial daily usage record (safe: catches any constraint error)
  BEGIN
    INSERT INTO public.usage (user_id, usage_date, words_limit_fast, words_limit_stealth, days_remaining)
    VALUES (NEW.id, CURRENT_DATE, 1000, 0, 365)
    ON CONFLICT (user_id, usage_date) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] usage insert failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- 3) Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
