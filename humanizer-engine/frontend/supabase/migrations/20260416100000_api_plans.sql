-- API Plans table for API-specific pricing
CREATE TABLE IF NOT EXISTS public.api_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  price_monthly INTEGER NOT NULL,        -- cents USD
  price_yearly INTEGER NOT NULL,         -- cents USD (per month, billed yearly)
  monthly_words INTEGER NOT NULL,
  daily_requests INTEGER NOT NULL,
  engines TEXT[] NOT NULL DEFAULT '{}',
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 10,
  features JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed API plans
INSERT INTO public.api_plans (name, display_name, price_monthly, price_yearly, monthly_words, daily_requests, engines, rate_limit_per_minute, features, sort_order) VALUES
(
  'hobby',
  'Hobby',
  900,   -- $9/mo
  765,   -- $7.65/mo yearly
  50000,
  100,
  ARRAY['oxygen', 'easy'],
  10,
  '["50K words/month", "2 engines (Humara 2.0, 2.2)", "100 requests/day", "10 req/min rate limit", "Community support", "Standard latency"]'::jsonb,
  1
),
(
  'developer',
  'Developer',
  2900,  -- $29/mo
  2465,  -- $24.65/mo yearly
  250000,
  1000,
  ARRAY['oxygen', 'ozone', 'easy', 'oxygen3', 'nuru_v2', 'ghost_pro_wiki'],
  30,
  '["250K words/month", "All 6 engines", "1,000 requests/day", "30 req/min rate limit", "Email support", "Faster latency", "Webhook callbacks", "Batch processing"]'::jsonb,
  2
),
(
  'business',
  'Business',
  7900,  -- $79/mo
  6715,  -- $67.15/mo yearly
  1000000,
  5000,
  ARRAY['oxygen', 'ozone', 'easy', 'oxygen3', 'humara_v3_3', 'nuru_v2', 'ghost_pro_wiki'],
  60,
  '["1M words/month", "All 7 engines + priority", "5,000 requests/day", "60 req/min rate limit", "Priority support (24h)", "Lowest latency", "Webhook callbacks", "Batch processing", "Custom tone profiles", "Usage analytics API"]'::jsonb,
  3
),
(
  'enterprise',
  'Enterprise',
  19900, -- $199/mo
  16915, -- $169.15/mo yearly
  5000000,
  50000,
  ARRAY['oxygen', 'ozone', 'easy', 'oxygen3', 'humara_v3_3', 'nuru_v2', 'ghost_pro_wiki'],
  120,
  '["5M words/month", "All engines + dedicated", "Unlimited requests", "120 req/min rate limit", "Dedicated support + SLA", "Lowest latency + priority queue", "Webhook callbacks", "Batch processing", "Custom tone profiles", "Usage analytics API", "Custom model fine-tuning", "99.9% uptime SLA", "SSO integration"]'::jsonb,
  4
);

-- Add api_plan_id to api_keys table
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS api_plan_id UUID REFERENCES public.api_plans(id);
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS monthly_words_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS daily_requests_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS last_daily_reset DATE;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS last_monthly_reset DATE;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS rate_limit_remaining INTEGER NOT NULL DEFAULT 10;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS rate_limit_reset TIMESTAMPTZ;

-- API usage log for analytics
CREATE TABLE IF NOT EXISTS public.api_usage_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  engine TEXT,
  input_words INTEGER NOT NULL DEFAULT 0,
  output_words INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  status_code INTEGER NOT NULL DEFAULT 200,
  error_message TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_log_key ON public.api_usage_log(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_log_user ON public.api_usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_log_created ON public.api_usage_log(created_at DESC);

-- RLS policies
ALTER TABLE public.api_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active API plans" ON public.api_plans FOR SELECT USING (is_active = true);
CREATE POLICY "Users can read own API usage logs" ON public.api_usage_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can insert API usage logs" ON public.api_usage_log FOR INSERT WITH CHECK (true);
