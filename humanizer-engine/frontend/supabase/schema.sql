-- ============================================================
-- HUMARA AI — Complete Supabase Database Schema
-- Created: 2026-04-03
-- ============================================================
-- This schema covers:
--   1. User profiles (extends auth.users)
--   2. Subscription plans & user subscriptions
--   3. Usage tracking (monthly word quotas)
--   4. Documents / humanization history
--   5. Style profiles per user
--   6. API keys
--   7. Contact form submissions
--   8. Feedback
--   9. Onboarding preferences
--  10. Row Level Security (RLS) on every table
--  11. Functions & triggers for automatic profile creation
--  12. Indexes for performance
-- ============================================================

-- ── 0. Extensions ──────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. Subscription Plans (reference table) ────────────────
CREATE TABLE public.plans (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL UNIQUE,          -- 'starter', 'creator', 'professional', 'business', 'custom'
  display_name  TEXT NOT NULL,
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly  NUMERIC(10,2) NOT NULL DEFAULT 0,  -- per-month price when billed yearly (15% off)
  daily_words_fast      INTEGER NOT NULL DEFAULT 0,    -- daily limit for Fast + Standard engines
  daily_words_stealth   INTEGER NOT NULL DEFAULT 0,    -- daily limit for Stealth/Undetectable engines
  duration_days INTEGER NOT NULL DEFAULT 30,
  max_style_profiles INTEGER NOT NULL DEFAULT 1,
  engines       TEXT[] NOT NULL DEFAULT '{"ghost_mini"}',
  features      JSONB NOT NULL DEFAULT '[]',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed plans with unified word counts per day
INSERT INTO public.plans (name, display_name, price_monthly, price_yearly, daily_words_fast, daily_words_stealth, duration_days, max_style_profiles, engines, features) VALUES
  ('free',         'Free',           0.00,  0.00,  1000,     0, 0, 1, '{"oxygen","ozone","easy"}',  '["1,000 words/day","All Engines","Basic AI Detection"]'),
  ('starter',      'Starter',        5.00,  4.25,  10000,    0, 30, 1, '{"oxygen","ozone","easy"}',  '["10,000 words/day","All Engines","Full Detector Suite","Email Support"]'),
  ('creator',      'Creator',       10.00,  8.50,  30000,    0, 30, 3, '{"oxygen","ozone","easy"}',  '["30,000 words/day","All Engines","Style Memory (3 slots)","Priority Support"]'),
  ('professional', 'Professional',  20.00, 17.00,  80000,    0, 30, 5, '{"oxygen","ozone","easy"}',  '["80,000 words/day","All Engines","Style Memory (5 slots)","API Access","Priority Support"]'),
  ('business',     'Business',      35.00, 29.75, 200000,    0, 30, -1, '{"oxygen","ozone","easy"}', '["200,000 words/day","All Engines","Unlimited Style Profiles","Full API Access","Dedicated Manager"]');

-- ── 2. User Profiles ───────────────────────────────────────
CREATE TABLE public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT,
  avatar_url      TEXT,
  plan_id         UUID REFERENCES public.plans(id),
  use_case        TEXT CHECK (use_case IN ('academic', 'content_seo', 'general', NULL)),
  onboarding_done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Subscriptions ──────────────────────────────────────
CREATE TABLE public.subscriptions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id           UUID NOT NULL REFERENCES public.plans(id),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','canceled','past_due','trialing')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_customer_id   TEXT,
  stripe_subscription_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);

-- ── 4. Usage Tracking (DAILY) ──────────────────────────────
CREATE TABLE public.usage (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  words_used_fast    INTEGER NOT NULL DEFAULT 0,   -- words used on Fast/Standard engines today
  words_used_stealth INTEGER NOT NULL DEFAULT 0,   -- words used on Stealth/Undetectable engines today
  words_limit_fast   INTEGER NOT NULL DEFAULT 20000,
  words_limit_stealth INTEGER NOT NULL DEFAULT 10000,
  requests     INTEGER NOT NULL DEFAULT 0,
  days_remaining INTEGER NOT NULL DEFAULT 30,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, usage_date)
);

CREATE INDEX idx_usage_user_date ON public.usage(user_id, usage_date);

-- ── 5. Documents (humanization history) ───────────────────
CREATE TABLE public.documents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             TEXT NOT NULL DEFAULT 'Untitled Document',
  input_text        TEXT NOT NULL,
  output_text       TEXT,
  input_word_count  INTEGER NOT NULL DEFAULT 0,
  output_word_count INTEGER,
  engine_used       TEXT,
  strength          TEXT CHECK (strength IN ('light','medium','strong')),
  tone              TEXT CHECK (tone IN ('natural','academic','business','direct')),
  meaning_preserved BOOLEAN,
  meaning_similarity NUMERIC(5,4),
  input_ai_score    NUMERIC(5,2),
  output_ai_score   NUMERIC(5,2),
  detector_results  JSONB,       -- full per-detector breakdown
  status            TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('processing','completed','failed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_user ON public.documents(user_id);
CREATE INDEX idx_documents_created ON public.documents(created_at DESC);
CREATE INDEX idx_documents_user_created ON public.documents(user_id, created_at DESC);

-- ── 6. Style Profiles ─────────────────────────────────────
CREATE TABLE public.style_profiles (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  description          TEXT DEFAULT '',
  avg_sentence_length  NUMERIC(6,2) NOT NULL DEFAULT 22.0,
  sentence_length_std  NUMERIC(6,2) NOT NULL DEFAULT 8.0,
  hedging_rate         NUMERIC(5,4) NOT NULL DEFAULT 0.18,
  clause_density       NUMERIC(5,2) NOT NULL DEFAULT 1.4,
  passive_voice_rate   NUMERIC(5,4) NOT NULL DEFAULT 0.20,
  lexical_diversity    NUMERIC(5,4) NOT NULL DEFAULT 0.62,
  avg_paragraph_length NUMERIC(5,2) NOT NULL DEFAULT 4.5,
  punctuation_rates    JSONB NOT NULL DEFAULT '{"semicolons_per_1k":2.5,"colons_per_1k":1.8,"dashes_per_1k":1.2}',
  is_default           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_style_profiles_user ON public.style_profiles(user_id);

-- ── 7. API Keys ───────────────────────────────────────────
CREATE TABLE public.api_keys (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Default',
  key_hash    TEXT NOT NULL,                 -- bcrypt hash of the key
  key_prefix  TEXT NOT NULL,                 -- first 8 chars for display: "hum_xxxx..."
  last_used   TIMESTAMPTZ,
  requests    INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_user ON public.api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON public.api_keys(key_hash);

-- ── 8. Contact Submissions ────────────────────────────────
CREATE TABLE public.contact_submissions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','replied','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 9. Feedback ───────────────────────────────────────────
CREATE TABLE public.feedback (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  rating      INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment     TEXT,
  category    TEXT CHECK (category IN ('quality','speed','accuracy','bug','feature','other')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feedback_user ON public.feedback(user_id);

-- ── 10. Detector Results Cache ────────────────────────────
CREATE TABLE public.detection_cache (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  text_hash       TEXT NOT NULL,             -- SHA-256 of input text
  word_count      INTEGER NOT NULL,
  overall_ai      NUMERIC(5,2) NOT NULL,
  overall_human   NUMERIC(5,2) NOT NULL,
  detectors       JSONB NOT NULL,            -- array of per-detector scores
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_detection_cache_hash ON public.detection_cache(text_hash);

-- ── 11. Payment History ───────────────────────────────────
CREATE TABLE public.payments (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id        UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  amount                 NUMERIC(10,2) NOT NULL,
  currency               TEXT NOT NULL DEFAULT 'usd',
  status                 TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('succeeded','pending','failed','refunded')),
  stripe_payment_id      TEXT,
  stripe_invoice_id      TEXT,
  payment_method_last4   TEXT,
  payment_method_brand   TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_user ON public.payments(user_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Plans are readable by everyone (public pricing page)
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plans are viewable by everyone" ON public.plans FOR SELECT USING (true);

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own subscriptions" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own subscriptions" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own subscriptions" ON public.subscriptions FOR UPDATE USING (auth.uid() = user_id);

-- Usage
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own usage" ON public.usage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own usage" ON public.usage FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own usage" ON public.usage FOR UPDATE USING (auth.uid() = user_id);

-- Documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own documents" ON public.documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own documents" ON public.documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own documents" ON public.documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own documents" ON public.documents FOR DELETE USING (auth.uid() = user_id);

-- Style profiles
ALTER TABLE public.style_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own style profiles" ON public.style_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own style profiles" ON public.style_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own style profiles" ON public.style_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own style profiles" ON public.style_profiles FOR DELETE USING (auth.uid() = user_id);

-- API keys
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own API keys" ON public.api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own API keys" ON public.api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own API keys" ON public.api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own API keys" ON public.api_keys FOR DELETE USING (auth.uid() = user_id);

-- Contact submissions
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit contact form" ON public.contact_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view own submissions" ON public.contact_submissions FOR SELECT USING (auth.uid() = user_id);

-- Feedback
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert feedback" ON public.feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own feedback" ON public.feedback FOR SELECT USING (auth.uid() = user_id);

-- Detection cache (read by all authenticated, write by all authenticated)
ALTER TABLE public.detection_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read cache" ON public.detection_cache FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can insert cache" ON public.detection_cache FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own payments" ON public.payments FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create profile + starter subscription on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  starter_plan_id UUID;
BEGIN
  -- Get the starter plan ID
  SELECT id INTO starter_plan_id FROM public.plans WHERE name = 'starter' LIMIT 1;

  -- Create profile
  INSERT INTO public.profiles (id, full_name, plan_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    starter_plan_id
  );

  -- Create starter subscription
  INSERT INTO public.subscriptions (user_id, plan_id, status)
  VALUES (NEW.id, starter_plan_id, 'active');

  -- Create initial daily usage record
  INSERT INTO public.usage (user_id, words_limit_fast, words_limit_stealth, days_remaining)
  VALUES (NEW.id, 20000, 10000, 30);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_usage_updated_at
  BEFORE UPDATE ON public.usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_style_profiles_updated_at
  BEFORE UPDATE ON public.style_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Function to increment daily usage
CREATE OR REPLACE FUNCTION public.increment_usage(p_user_id UUID, p_words INTEGER, p_engine_type TEXT DEFAULT 'fast')
RETURNS JSONB AS $$
DECLARE
  current_usage RECORD;
  v_limit_fast INTEGER;
  v_limit_stealth INTEGER;
BEGIN
  -- Get the user's daily limits from their active subscription
  SELECT p.daily_words_fast, p.daily_words_stealth INTO v_limit_fast, v_limit_stealth
  FROM public.subscriptions s
  JOIN public.plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id AND s.status = 'active'
  ORDER BY s.created_at DESC LIMIT 1;

  IF v_limit_fast IS NULL THEN v_limit_fast := 1000; END IF;
  IF v_limit_stealth IS NULL THEN v_limit_stealth := 0; END IF;

  -- Upsert daily usage record
  INSERT INTO public.usage (user_id, usage_date, words_used_fast, words_used_stealth, words_limit_fast, words_limit_stealth, requests)
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
    requests = public.usage.requests + 1,
    updated_at = NOW()
  RETURNING * INTO current_usage;

  -- Check quota
  IF p_engine_type IN ('stealth','undetectable') AND v_limit_stealth > 0 AND current_usage.words_used_stealth > v_limit_stealth THEN
    RETURN jsonb_build_object('allowed', false, 'words_used', current_usage.words_used_stealth, 'words_limit', v_limit_stealth, 'remaining', 0, 'engine_type', p_engine_type);
  END IF;
  IF p_engine_type IN ('fast','standard') AND v_limit_fast > 0 AND current_usage.words_used_fast > v_limit_fast THEN
    RETURN jsonb_build_object('allowed', false, 'words_used', current_usage.words_used_fast, 'words_limit', v_limit_fast, 'remaining', 0, 'engine_type', p_engine_type);
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

-- Function to get user's current usage stats
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
  -- Today's usage
  SELECT * INTO v_usage FROM public.usage
  WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;

  -- Active plan & subscription
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

  -- Calculate days remaining
  IF v_sub IS NOT NULL THEN
    v_days_remaining := GREATEST(0, (v_sub.current_period_end::DATE - CURRENT_DATE));
  ELSE
    v_days_remaining := 0;
  END IF;

  -- Total documents
  SELECT COUNT(*), COALESCE(SUM(output_word_count), 0)
  INTO v_doc_count, v_total_words
  FROM public.documents WHERE user_id = p_user_id;

  -- Average AI score defeated
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

-- ============================================================
-- STORAGE BUCKET (for user avatars, optional)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, '{"image/jpeg","image/png","image/webp"}')
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::TEXT = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::TEXT = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar" ON storage.objects
  FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::TEXT = (storage.foldername(name))[1]);

-- ============================================================
-- DONE
-- ============================================================
