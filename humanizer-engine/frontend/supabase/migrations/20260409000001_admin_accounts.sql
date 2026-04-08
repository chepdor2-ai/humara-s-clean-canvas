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
-- Pro plan ID: 3df59b7f-a71a-4ac3-b847-b5118b552b27
INSERT INTO public.profiles (id, full_name, plan_id, onboarding_done)
VALUES
  ('24a19462-8dc7-46c1-a51a-03df04f2450d', 'Admin Maguna', '3df59b7f-a71a-4ac3-b847-b5118b552b27', true),
  ('75966b43-81a0-443c-aafb-30b83dbae9cd', 'Admin Maxwell', '3df59b7f-a71a-4ac3-b847-b5118b552b27', true)
ON CONFLICT (id) DO UPDATE SET
  plan_id = '3df59b7f-a71a-4ac3-b847-b5118b552b27',
  onboarding_done = true;
