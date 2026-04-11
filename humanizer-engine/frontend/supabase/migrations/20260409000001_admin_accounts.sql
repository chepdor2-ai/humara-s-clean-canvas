-- Admin accounts creation SQL
-- These accounts were created via the Supabase Admin API on 2026-04-09
--
-- maguna956@gmail.com   (ID: 24a19462-8dc7-46c1-a51a-03df04f2450d) — already existed, password reset
-- maxwellotieno11@gmail.com (ID: 75966b43-81a0-443c-aafb-30b83dbae9cd) — newly created
--
-- Both have password: kemoda11  (set via Admin API, email auto-confirmed)
--
-- To grant admin access, ensure ADMIN_EMAILS env var includes these emails:
--   ADMIN_EMAILS=maguna956@gmail.com,maxwellotieno11@gmail.com

-- Create profiles for admin users if they don't already exist
DO $$
DECLARE
  v_plan_id UUID;
BEGIN
  -- Never hardcode plan UUIDs: they differ per database.
  -- Prefer Business for admins, fallback to Professional, then Free.
  SELECT id INTO v_plan_id
  FROM public.plans
  WHERE name IN ('business', 'professional', 'free')
  ORDER BY CASE name
    WHEN 'business' THEN 1
    WHEN 'professional' THEN 2
    WHEN 'free' THEN 3
    ELSE 99
  END
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'No plans found in public.plans. Run the schema migration first.';
  END IF;

  -- Only insert profiles if the auth users exist.
  INSERT INTO public.profiles (id, full_name, plan_id, onboarding_done)
  SELECT u.id,
         CASE u.id
           WHEN '24a19462-8dc7-46c1-a51a-03df04f2450d' THEN 'Admin Maguna'
           WHEN '75966b43-81a0-443c-aafb-30b83dbae9cd' THEN 'Admin Maxwell'
           ELSE 'Admin'
         END,
         v_plan_id,
         TRUE
  FROM auth.users u
  WHERE u.id IN ('24a19462-8dc7-46c1-a51a-03df04f2450d', '75966b43-81a0-443c-aafb-30b83dbae9cd')
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    plan_id = EXCLUDED.plan_id,
    onboarding_done = TRUE;
END $$;
