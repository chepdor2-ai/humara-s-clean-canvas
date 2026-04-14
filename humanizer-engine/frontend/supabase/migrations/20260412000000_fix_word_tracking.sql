-- Migration: Fix word tracking & subscription creation
-- Adds helper function to look up users by email (for webhook use)
-- Adds unique index on active subscriptions per user

-- ── Helper: Look up auth.users by email (SECURITY DEFINER bypasses RLS) ──
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email TEXT)
RETURNS UUID AS $$
  SELECT id FROM auth.users WHERE email = p_email LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- ── Ensure only one active subscription per user ──
-- (Needed so the increment_usage / get_usage_stats ORDER BY + LIMIT 1 pattern is deterministic)
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_active_per_user
  ON public.subscriptions (user_id)
  WHERE status = 'active';
