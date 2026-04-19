-- ============================================================
-- HUMARA AI — Comprehensive Database Migration
-- Date: 2026-04-19
-- Safe to run on ANY existing Supabase project (all idempotent)
--
-- Changes in this migration:
--   1)  Ensure all extensions exist
--   2)  Create / patch all tables (IF NOT EXISTS + ADD COLUMN IF NOT EXISTS)
--   3)  Fix subscriptions status CHECK (add 'expired')
--   4)  Upsert plans with UPDATED pricing:
--         Free: 1,000 words/day
--         Starter ($5): 20,000 words/day
--         Creator ($10): 50,000 words/day
--         Professional ($20): 100,000 words/day
--         Business Unlimited ($50): Unlimited (-1 sentinel)
--   5)  Add paystack tracking columns to subscriptions + payments
--   6)  Ensure all indexes exist
--   7)  Idempotent RLS policies on every table
--   8)  Engine config table for admin toggles
--   9)  Notifications table
--   10) handle_new_user() trigger — auto-create profile + free subscription
--   11) increment_usage() — unlimited-aware, creates row if none exists
--   12) get_usage_stats() — unlimited-aware, returns current day stats
--   13) purge_expired_document_text() — NULLs text 20 min after creation
--   14) pg_cron job — runs cleanup every 5 minutes
--   15) Realtime publication for usage / subscriptions / plans
-- ============================================================


-- ══════════════════════════════════════════════════════════
-- 0.  EXTENSIONS
-- ══════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ══════════════════════════════════════════════════════════
-- 1.  PLANS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.plans (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                TEXT        NOT NULL UNIQUE,
  display_name        TEXT        NOT NULL,
  price_monthly       NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly        NUMERIC(10,2) NOT NULL DEFAULT 0,
  daily_words_fast    INTEGER     NOT NULL DEFAULT 0,
  daily_words_stealth INTEGER     NOT NULL DEFAULT 0,
  duration_days       INTEGER     NOT NULL DEFAULT 30,
  max_style_profiles  INTEGER     NOT NULL DEFAULT 1,
  engines             TEXT[]      NOT NULL DEFAULT ARRAY['oxygen','easy'],
  features            JSONB       NOT NULL DEFAULT '[]',
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Patch any missing columns on plans
DO $patch_plans$
BEGIN
  ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS price_yearly       NUMERIC(10,2) NOT NULL DEFAULT 0;
  ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS daily_words_fast   INTEGER       NOT NULL DEFAULT 0;
  ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS daily_words_stealth INTEGER      NOT NULL DEFAULT 0;
  ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS duration_days      INTEGER       NOT NULL DEFAULT 30;
  ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_style_profiles INTEGER       NOT NULL DEFAULT 1;
  ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS engines            TEXT[];
  ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS features           JSONB         NOT NULL DEFAULT '[]';
  ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS is_active          BOOLEAN       NOT NULL DEFAULT TRUE;
EXCEPTION WHEN OTHERS THEN NULL;
END $patch_plans$;

-- Upsert plans with UPDATED pricing (2026-04-19)
-- $5/mo = 20k/day, $10/mo = 50k/day, $20/mo = 100k/day, $50/mo = Unlimited
INSERT INTO public.plans (name, display_name, price_monthly, price_yearly, daily_words_fast, daily_words_stealth, duration_days, max_style_profiles, engines, features, is_active)
VALUES
  ('free',         'Free',               0.00,   0.00,      1000, 0,  0,  1,
   ARRAY['oxygen','easy','ninja_1'],
   '["1,000 words/day","Core engines","Basic AI detection"]'::jsonb, true),

  ('starter',      'Starter',            5.00,   4.25,     20000, 0, 30,  1,
   ARRAY['oxygen','easy','ninja_1','humara_v3_3','nuru_v2','ghost_pro_wiki','king','antipangram'],
   '["20,000 words/day","All engine modes","Full detector suite","Email support"]'::jsonb, true),

  ('creator',      'Creator',           10.00,   8.50,     50000, 0, 30,  3,
   ARRAY['oxygen','easy','ninja_1','humara_v3_3','nuru_v2','ghost_pro_wiki','king','antipangram','ninja_3','ninja_2','ninja_5','ghost_trial_2','phantom'],
   '["50,000 words/day","All engine modes","Priority support","Style memory (3 slots)"]'::jsonb, true),

  ('professional', 'Professional',      20.00,  17.00,    100000, 0, 30,  5,
   ARRAY['oxygen','easy','ninja_1','humara_v3_3','nuru_v2','ghost_pro_wiki','king','antipangram','ninja_3','ninja_2','ninja_5','ghost_trial_2','phantom'],
   '["100,000 words/day","All engine modes","API access","Priority support","Style memory (5 slots)"]'::jsonb, true),

  ('business',     'Business Unlimited',50.00,  42.50,        -1, 0, 30, -1,
   ARRAY['oxygen','easy','ninja_1','humara_v3_3','nuru_v2','ghost_pro_wiki','king','antipangram','ninja_3','ninja_2','ninja_5','ghost_trial_2','phantom'],
   '["Unlimited daily words","All engine modes","Full API access","Dedicated support"]'::jsonb, true)
ON CONFLICT (name) DO UPDATE SET
  display_name        = EXCLUDED.display_name,
  price_monthly       = EXCLUDED.price_monthly,
  price_yearly        = EXCLUDED.price_yearly,
  daily_words_fast    = EXCLUDED.daily_words_fast,
  daily_words_stealth = EXCLUDED.daily_words_stealth,
  duration_days       = EXCLUDED.duration_days,
  max_style_profiles  = EXCLUDED.max_style_profiles,
  engines             = EXCLUDED.engines,
  features            = EXCLUDED.features,
  is_active           = EXCLUDED.is_active;


-- ══════════════════════════════════════════════════════════
-- 2.  PROFILES
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT,
  avatar_url      TEXT,
  plan_id         UUID        REFERENCES public.plans(id),
  use_case        TEXT        CHECK (use_case IN ('academic','content_seo','general')),
  onboarding_done BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $patch_profiles$
BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url      TEXT;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_id         UUID REFERENCES public.plans(id);
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS use_case        TEXT;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_done BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW();
EXCEPTION WHEN OTHERS THEN NULL;
END $patch_profiles$;


-- ══════════════════════════════════════════════════════════
-- 3.  SUBSCRIPTIONS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id                 UUID        NOT NULL REFERENCES public.plans(id),
  status                  TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','canceled','past_due','trialing','expired')),
  current_period_start    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  cancel_at_period_end    BOOLEAN     NOT NULL DEFAULT FALSE,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  paystack_reference      TEXT,
  paystack_customer_code  TEXT,
  billing_period          TEXT        CHECK (billing_period IN ('monthly','yearly')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $patch_subs$
BEGIN
  ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('active','canceled','past_due','trialing','expired'));

  ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT;
  ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
  ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS paystack_reference     TEXT;
  ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT;
  ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_period         TEXT
    CHECK (billing_period IN ('monthly','yearly'));
  ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end   BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW();
EXCEPTION WHEN OTHERS THEN NULL;
END $patch_subs$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user   ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);


-- ══════════════════════════════════════════════════════════
-- 4.  USAGE
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.usage (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date          DATE        NOT NULL DEFAULT CURRENT_DATE,
  words_used_fast     INTEGER     NOT NULL DEFAULT 0,
  words_used_stealth  INTEGER     NOT NULL DEFAULT 0,
  words_limit_fast    INTEGER     NOT NULL DEFAULT 1000,
  words_limit_stealth INTEGER     NOT NULL DEFAULT 0,
  requests            INTEGER     NOT NULL DEFAULT 0,
  days_remaining      INTEGER     NOT NULL DEFAULT 30,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, usage_date)
);

DO $patch_usage$
BEGIN
  ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS words_used_fast    INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS words_used_stealth INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS words_limit_fast   INTEGER NOT NULL DEFAULT 1000;
  ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS words_limit_stealth INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS requests           INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS days_remaining     INTEGER NOT NULL DEFAULT 30;
  ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();
EXCEPTION WHEN OTHERS THEN NULL;
END $patch_usage$;

-- Ensure unique constraint
DO $usage_uniq$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usage_user_id_usage_date_key'
  ) THEN
    ALTER TABLE public.usage ADD CONSTRAINT usage_user_id_usage_date_key UNIQUE (user_id, usage_date);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $usage_uniq$;

CREATE INDEX IF NOT EXISTS idx_usage_user_date ON public.usage(user_id, usage_date);

-- Sync today's usage limits to match current active plan
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
  words_limit_fast    = lp.daily_words_fast,
  words_limit_stealth = lp.daily_words_stealth,
  updated_at          = NOW()
FROM latest_plan lp
WHERE u.user_id   = lp.user_id
  AND u.usage_date = CURRENT_DATE;


-- ══════════════════════════════════════════════════════════
-- 5.  DOCUMENTS
--     input_text and output_text are purged 20 minutes after
--     creation (stats/metadata kept forever)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.documents (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             TEXT        NOT NULL DEFAULT 'Untitled Document',
  input_text        TEXT,                             -- NULLed after 20 min
  output_text       TEXT,                             -- NULLed after 20 min
  input_word_count  INTEGER     NOT NULL DEFAULT 0,
  output_word_count INTEGER,
  engine_used       TEXT,
  strength          TEXT        CHECK (strength  IN ('light','medium','strong')),
  tone              TEXT,
  meaning_preserved BOOLEAN,
  meaning_similarity NUMERIC(5,4),
  input_ai_score    NUMERIC(5,2),
  output_ai_score   NUMERIC(5,2),
  detector_results  JSONB,
  status            TEXT        NOT NULL DEFAULT 'completed'
                        CHECK (status IN ('processing','completed','failed')),
  text_purge_at     TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '20 minutes'),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $patch_docs$
BEGIN
  ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS title              TEXT    NOT NULL DEFAULT 'Untitled Document';
  ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS input_word_count   INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS output_word_count  INTEGER;
  ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS engine_used        TEXT;
  ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS strength           TEXT;
  ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS tone               TEXT;
  ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS meaning_preserved  BOOLEAN;
  ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS meaning_similarity NUMERIC(5,4);
  ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS input_ai_score     NUMERIC(5,2);
  ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS output_ai_score    NUMERIC(5,2);
  ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS detector_results   JSONB;
  ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS status             TEXT NOT NULL DEFAULT 'completed';
  ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();
  ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS text_purge_at TIMESTAMPTZ
    NOT NULL DEFAULT (NOW() + INTERVAL '20 minutes');
  -- Drop tone constraint if it exists (we relaxed it)
  ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_tone_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $patch_docs$;

-- Back-fill text_purge_at for existing rows that are already past 20 min
UPDATE public.documents
SET text_purge_at = NOW() + INTERVAL '1 minute'
WHERE text_purge_at IS NULL
   OR text_purge_at > created_at + INTERVAL '20 minutes';

CREATE INDEX IF NOT EXISTS idx_documents_user         ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_created      ON public.documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_user_created ON public.documents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_purge_at     ON public.documents(text_purge_at)
  WHERE input_text IS NOT NULL OR output_text IS NOT NULL;


-- ══════════════════════════════════════════════════════════
-- 6.  STYLE PROFILES
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.style_profiles (
  id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                 TEXT        NOT NULL,
  description          TEXT        DEFAULT '',
  avg_sentence_length  NUMERIC(6,2) NOT NULL DEFAULT 22.0,
  sentence_length_std  NUMERIC(6,2) NOT NULL DEFAULT 8.0,
  hedging_rate         NUMERIC(5,4) NOT NULL DEFAULT 0.18,
  clause_density       NUMERIC(5,2) NOT NULL DEFAULT 1.4,
  passive_voice_rate   NUMERIC(5,4) NOT NULL DEFAULT 0.20,
  lexical_diversity    NUMERIC(5,4) NOT NULL DEFAULT 0.62,
  avg_paragraph_length NUMERIC(5,2) NOT NULL DEFAULT 4.5,
  punctuation_rates    JSONB        NOT NULL DEFAULT '{"semicolons_per_1k":2.5,"colons_per_1k":1.8,"dashes_per_1k":1.2}',
  is_default           BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_style_profiles_user ON public.style_profiles(user_id);


-- ══════════════════════════════════════════════════════════
-- 7.  API KEYS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.api_keys (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL DEFAULT 'Default',
  key_hash   TEXT        NOT NULL,
  key_prefix TEXT        NOT NULL,
  last_used  TIMESTAMPTZ,
  requests   INTEGER     NOT NULL DEFAULT 0,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  -- Extended API quota columns
  api_plan_id             TEXT,
  monthly_words_used      INTEGER NOT NULL DEFAULT 0,
  daily_requests_used     INTEGER NOT NULL DEFAULT 0,
  last_daily_reset        TEXT,
  last_monthly_reset      TEXT
);

DO $patch_keys$
BEGIN
  ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS api_plan_id         TEXT;
  ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS monthly_words_used  INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS daily_requests_used INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS last_daily_reset    TEXT;
  ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS last_monthly_reset  TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $patch_keys$;

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON public.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.api_keys(key_hash);


-- ══════════════════════════════════════════════════════════
-- 8.  CONTACT SUBMISSIONS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL,
  subject    TEXT,
  message    TEXT        NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new','read','replied','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ══════════════════════════════════════════════════════════
-- 9.  FEEDBACK
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.feedback (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  document_id UUID        REFERENCES public.documents(id) ON DELETE SET NULL,
  rating      INTEGER     CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  category    TEXT        CHECK (category IN ('quality','speed','accuracy','bug','feature','other')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON public.feedback(user_id);


-- ══════════════════════════════════════════════════════════
-- 10.  DETECTION CACHE
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.detection_cache (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  text_hash    TEXT        NOT NULL,
  word_count   INTEGER     NOT NULL,
  overall_ai   NUMERIC(5,2) NOT NULL,
  overall_human NUMERIC(5,2) NOT NULL,
  detectors    JSONB       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_detection_cache_hash    ON public.detection_cache(text_hash);
CREATE        INDEX IF NOT EXISTS idx_detection_cache_created ON public.detection_cache(created_at);


-- ══════════════════════════════════════════════════════════
-- 11.  PAYMENTS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.payments (
  id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id       UUID         REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  amount                NUMERIC(10,2) NOT NULL,
  currency              TEXT         NOT NULL DEFAULT 'usd',
  status                TEXT         NOT NULL DEFAULT 'succeeded'
                            CHECK (status IN ('succeeded','pending','failed','refunded')),
  paystack_reference    TEXT,
  paystack_transaction_id TEXT,
  stripe_payment_id     TEXT,
  stripe_invoice_id     TEXT,
  payment_method_last4  TEXT,
  payment_method_brand  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $patch_payments$
BEGIN
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS subscription_id         UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL;
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS paystack_reference       TEXT;
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS paystack_transaction_id  TEXT;
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS stripe_payment_id        TEXT;
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS stripe_invoice_id        TEXT;
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_method_last4     TEXT;
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_method_brand     TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $patch_payments$;

CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments(user_id);


-- ══════════════════════════════════════════════════════════
-- 12.  ENGINE CONFIG (admin toggles)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.engine_config (
  engine_id   TEXT        PRIMARY KEY,
  label       TEXT,
  enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
  premium     BOOLEAN     NOT NULL DEFAULT FALSE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed engine config with new names
INSERT INTO public.engine_config (engine_id, label, enabled, premium, sort_order)
VALUES
  ('nova',         'Nova',     true, false, 1),
  ('easy',         'Swift',    true, false, 2),
  ('ninja_1',      'Ninja',    true, false, 3),
  ('antipangram',  'Pangram',  true, false, 4),
  ('humara_v3_3',  'Humarin',  true, false, 5),
  ('oxygen',       'Oxygen',   true, false, 6),
  ('king',         'King',     true, false, 7),
  ('nuru_v2',      'Nuru',     true, false, 8),
  ('ghost_pro_wiki','Ghost',   true, false, 9),
  ('ninja_3',      'Alpha',    true, false, 10),
  ('ninja_2',      'Beta',     true, false, 11),
  ('ninja_5',      'Omega',    true, false, 12),
  ('ghost_trial_2','Specter',  true, false, 13),
  ('phantom',      'Phantom',  true, false, 14)
ON CONFLICT (engine_id) DO UPDATE SET
  label      = EXCLUDED.label,
  enabled    = EXCLUDED.enabled,
  sort_order = EXCLUDED.sort_order;

-- Remove deleted engines
DELETE FROM public.engine_config WHERE engine_id IN ('ozone','conscusion_1','conscusion_12','ghost_trial_2_alt');


-- ══════════════════════════════════════════════════════════
-- 13.  NOTIFICATIONS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL DEFAULT 'info',
  title      TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  read       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);


-- ══════════════════════════════════════════════════════════
-- 14.  API PLANS (for public API)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.api_plans (
  id                     TEXT PRIMARY KEY,
  display_name           TEXT NOT NULL,
  monthly_words          INTEGER NOT NULL DEFAULT 50000,
  daily_requests         INTEGER NOT NULL DEFAULT 100,
  engines                TEXT[] NOT NULL DEFAULT ARRAY['oxygen','easy'],
  rate_limit_per_minute  INTEGER NOT NULL DEFAULT 10,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.api_plans (id, display_name, monthly_words, daily_requests, engines, rate_limit_per_minute)
VALUES
  ('hobby',       'Hobby',        50000,  100, ARRAY['oxygen','easy','humara_v3_3','nuru_v2','ghost_pro_wiki'], 10),
  ('pro',         'Pro',         200000,  500, ARRAY['oxygen','easy','humara_v3_3','nuru_v2','ghost_pro_wiki','ninja_3','ninja_2','phantom'], 30),
  ('enterprise',  'Enterprise', 1000000, 2000, ARRAY['oxygen','easy','humara_v3_3','nuru_v2','ghost_pro_wiki','ninja_3','ninja_2','ninja_5','ghost_trial_2','phantom'], 60)
ON CONFLICT (id) DO UPDATE SET
  display_name          = EXCLUDED.display_name,
  monthly_words         = EXCLUDED.monthly_words,
  daily_requests        = EXCLUDED.daily_requests,
  engines               = EXCLUDED.engines,
  rate_limit_per_minute = EXCLUDED.rate_limit_per_minute;


-- ══════════════════════════════════════════════════════════
-- 15.  API USAGE LOG (for v1 API analytics)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.api_usage_log (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id      UUID        REFERENCES public.api_keys(id) ON DELETE SET NULL,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  endpoint        TEXT,
  engine          TEXT,
  input_words     INTEGER     NOT NULL DEFAULT 0,
  output_words    INTEGER     NOT NULL DEFAULT 0,
  latency_ms      INTEGER,
  status_code     INTEGER,
  error_message   TEXT,
  ip_address      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_log_key  ON public.api_usage_log(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_log_user ON public.api_usage_log(user_id);


-- ══════════════════════════════════════════════════════════
-- 16.  ROW LEVEL SECURITY  (idempotent)
-- ══════════════════════════════════════════════════════════

-- Plans — public read
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
DO $rls_plans$
BEGIN
  CREATE POLICY "plans_select_all" ON public.plans FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $rls_plans$;

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DO $rls_profiles$
BEGIN
  CREATE POLICY "profiles_select_own"  ON public.profiles FOR SELECT USING (auth.uid() = id);
  CREATE POLICY "profiles_insert_own"  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
  CREATE POLICY "profiles_update_own"  ON public.profiles FOR UPDATE USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $rls_profiles$;

-- Subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DO $rls_subs$
BEGIN
  CREATE POLICY "subs_select_own"  ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY "subs_insert_own"  ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "subs_update_own"  ON public.subscriptions FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $rls_subs$;

-- Usage
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;
DO $rls_usage$
BEGIN
  CREATE POLICY "usage_select_own"  ON public.usage FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY "usage_insert_own"  ON public.usage FOR INSERT WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "usage_update_own"  ON public.usage FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $rls_usage$;

-- Documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DO $rls_docs$
BEGIN
  CREATE POLICY "docs_select_own"  ON public.documents FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY "docs_insert_own"  ON public.documents FOR INSERT WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "docs_update_own"  ON public.documents FOR UPDATE USING (auth.uid() = user_id);
  CREATE POLICY "docs_delete_own"  ON public.documents FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $rls_docs$;

-- Style profiles
ALTER TABLE public.style_profiles ENABLE ROW LEVEL SECURITY;
DO $rls_sp$
BEGIN
  CREATE POLICY "sp_select_own" ON public.style_profiles FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY "sp_insert_own" ON public.style_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "sp_update_own" ON public.style_profiles FOR UPDATE USING (auth.uid() = user_id);
  CREATE POLICY "sp_delete_own" ON public.style_profiles FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $rls_sp$;

-- API keys
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
DO $rls_keys$
BEGIN
  CREATE POLICY "keys_select_own" ON public.api_keys FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY "keys_insert_own" ON public.api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "keys_update_own" ON public.api_keys FOR UPDATE USING (auth.uid() = user_id);
  CREATE POLICY "keys_delete_own" ON public.api_keys FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $rls_keys$;

-- Contact submissions
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
DO $rls_contact$
BEGIN
  CREATE POLICY "contact_insert_all"  ON public.contact_submissions FOR INSERT WITH CHECK (true);
  CREATE POLICY "contact_select_own"  ON public.contact_submissions FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $rls_contact$;

-- Feedback
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
DO $rls_feedback$
BEGIN
  CREATE POLICY "fb_insert_own"  ON public.feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "fb_select_own"  ON public.feedback FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $rls_feedback$;

-- Detection cache
ALTER TABLE public.detection_cache ENABLE ROW LEVEL SECURITY;
DO $rls_cache$
BEGIN
  CREATE POLICY "cache_select_auth"  ON public.detection_cache FOR SELECT USING (auth.role() = 'authenticated');
  CREATE POLICY "cache_insert_auth"  ON public.detection_cache FOR INSERT WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $rls_cache$;

-- Payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DO $rls_pay$
BEGIN
  CREATE POLICY "pay_select_own" ON public.payments FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $rls_pay$;

-- Engine config — public read, service role write
ALTER TABLE public.engine_config ENABLE ROW LEVEL SECURITY;
DO $rls_ec$
BEGIN
  CREATE POLICY "ec_select_all" ON public.engine_config FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $rls_ec$;

-- Notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DO $rls_notif$
BEGIN
  CREATE POLICY "notif_select_own"  ON public.notifications FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY "notif_update_own"  ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $rls_notif$;

-- API usage log — service role only (no RLS policies needed, service role bypasses)
ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;

-- API plans — public read
ALTER TABLE public.api_plans ENABLE ROW LEVEL SECURITY;
DO $rls_api_plans$
BEGIN
  CREATE POLICY "api_plans_select_all" ON public.api_plans FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $rls_api_plans$;


-- ══════════════════════════════════════════════════════════
-- 17.  FUNCTIONS
-- ══════════════════════════════════════════════════════════

-- ── a) Auto-create profile + free subscription on signup ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, full_name, avatar_url, plan_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    (SELECT id FROM public.plans WHERE name = 'free' LIMIT 1)
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create free subscription (365 days)
  INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_end)
  VALUES (
    NEW.id,
    (SELECT id FROM public.plans WHERE name = 'free' LIMIT 1),
    'active',
    NOW() + INTERVAL '365 days'
  )
  ON CONFLICT DO NOTHING;

  -- Create initial daily usage record
  INSERT INTO public.usage (user_id, usage_date, words_limit_fast, words_limit_stealth, days_remaining)
  VALUES (NEW.id, CURRENT_DATE, 1000, 0, 365)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── b) get_user_id_by_email (required by webhook) ─────────
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $get_uid_email$
  SELECT id FROM auth.users
  WHERE lower(email) = lower(p_email)
  LIMIT 1;
$get_uid_email$;

-- ── c) increment_usage (unlimited-aware, robust) ──────────
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id     UUID,
  p_words       INTEGER,
  p_engine_type TEXT DEFAULT 'fast'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $increment$
DECLARE
  current_usage   RECORD;
  v_limit_fast    INTEGER;
  v_limit_stealth INTEGER;
  v_is_unlimited  BOOLEAN;
  v_total_used    INTEGER;
  v_total_limit   INTEGER;
BEGIN
  -- Get the user's daily limits from their active subscription
  SELECT p.daily_words_fast, p.daily_words_stealth
    INTO v_limit_fast, v_limit_stealth
    FROM public.subscriptions s
    JOIN public.plans p ON s.plan_id = p.id
   WHERE s.user_id = p_user_id
     AND s.status  = 'active'
     AND s.current_period_end > NOW()
   ORDER BY s.created_at DESC
   LIMIT 1;

  -- Default to free tier if no active subscription
  IF v_limit_fast    IS NULL THEN v_limit_fast    := 1000; END IF;
  IF v_limit_stealth IS NULL THEN v_limit_stealth := 0;    END IF;

  v_is_unlimited := (v_limit_fast < 0 OR v_limit_stealth < 0);

  -- Upsert today's usage row
  INSERT INTO public.usage (
    user_id, usage_date,
    words_used_fast, words_used_stealth,
    words_limit_fast, words_limit_stealth,
    requests
  ) VALUES (
    p_user_id, CURRENT_DATE,
    CASE WHEN p_engine_type IN ('fast','standard')        THEN p_words ELSE 0 END,
    CASE WHEN p_engine_type IN ('stealth','undetectable') THEN p_words ELSE 0 END,
    v_limit_fast, v_limit_stealth, 1
  )
  ON CONFLICT (user_id, usage_date) DO UPDATE SET
    words_used_fast    = public.usage.words_used_fast + EXCLUDED.words_used_fast,
    words_used_stealth = public.usage.words_used_stealth + EXCLUDED.words_used_stealth,
    words_limit_fast    = EXCLUDED.words_limit_fast,
    words_limit_stealth = EXCLUDED.words_limit_stealth,
    requests            = public.usage.requests + 1,
    updated_at          = NOW()
  RETURNING * INTO current_usage;

  v_total_used  := COALESCE(current_usage.words_used_fast, 0)
                 + COALESCE(current_usage.words_used_stealth, 0);
  v_total_limit := COALESCE(v_limit_fast, 0) + COALESCE(v_limit_stealth, 0);

  -- Check quota (skip for unlimited)
  IF NOT v_is_unlimited AND v_total_limit > 0 AND v_total_used > v_total_limit THEN
    RETURN jsonb_build_object(
      'allowed',             false,
      'is_unlimited',        false,
      'words_used_fast',     current_usage.words_used_fast,
      'words_used_stealth',  current_usage.words_used_stealth,
      'words_limit_fast',    v_limit_fast,
      'words_limit_stealth', v_limit_stealth,
      'words_used',          v_total_used,
      'words_limit',         v_total_limit,
      'remaining',           0
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed',             true,
    'is_unlimited',        v_is_unlimited,
    'words_used_fast',     current_usage.words_used_fast,
    'words_used_stealth',  current_usage.words_used_stealth,
    'words_limit_fast',    v_limit_fast,
    'words_limit_stealth', v_limit_stealth,
    'remaining_fast',      CASE WHEN v_limit_fast    < 0 THEN -1
                                ELSE GREATEST(0, v_limit_fast    - current_usage.words_used_fast)    END,
    'remaining_stealth',   CASE WHEN v_limit_stealth < 0 THEN -1
                                ELSE GREATEST(0, v_limit_stealth - current_usage.words_used_stealth) END
  );
END;
$increment$;

-- ── d) get_usage_stats (unlimited-aware) ──────────────────
CREATE OR REPLACE FUNCTION public.get_usage_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $stats$
DECLARE
  v_usage           RECORD;
  v_sub             RECORD;
  v_doc_count       INTEGER;
  v_total_words     BIGINT;
  v_avg_ai_defeated NUMERIC;
  v_days_remaining  INTEGER;
  v_limit_fast      INTEGER;
  v_limit_stealth   INTEGER;
  v_is_unlimited    BOOLEAN;
BEGIN
  -- Today's usage
  SELECT * INTO v_usage
    FROM public.usage
   WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;

  -- Active subscription + plan
  SELECT
    s.id AS sub_id, s.status,
    s.current_period_start, s.current_period_end,
    p.id AS plan_id, p.name, p.display_name,
    p.daily_words_fast, p.daily_words_stealth
  INTO v_sub
    FROM public.subscriptions s
    JOIN public.plans p ON s.plan_id = p.id
   WHERE s.user_id = p_user_id
     AND s.status  = 'active'
     AND s.current_period_end > NOW()
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF v_sub IS NOT NULL THEN
    v_days_remaining := GREATEST(0, (v_sub.current_period_end::DATE - CURRENT_DATE));
  ELSE
    v_days_remaining := 0;
  END IF;

  v_limit_fast    := COALESCE(v_sub.daily_words_fast,   1000);
  v_limit_stealth := COALESCE(v_sub.daily_words_stealth,    0);
  v_is_unlimited  := (v_limit_fast < 0 OR v_limit_stealth < 0);

  SELECT COUNT(*), COALESCE(SUM(output_word_count), 0)
    INTO v_doc_count, v_total_words
    FROM public.documents
   WHERE user_id = p_user_id;

  SELECT COALESCE(AVG(input_ai_score - output_ai_score), 0)
    INTO v_avg_ai_defeated
    FROM public.documents
   WHERE user_id       = p_user_id
     AND input_ai_score  IS NOT NULL
     AND output_ai_score IS NOT NULL;

  RETURN jsonb_build_object(
    'words_used_fast',       COALESCE(v_usage.words_used_fast, 0),
    'words_used_stealth',    COALESCE(v_usage.words_used_stealth, 0),
    'words_limit_fast',      v_limit_fast,
    'words_limit_stealth',   v_limit_stealth,
    'is_unlimited',          v_is_unlimited,
    'requests_today',        COALESCE(v_usage.requests, 0),
    'days_remaining',        v_days_remaining,
    'plan_name',             COALESCE(v_sub.display_name, 'Free'),
    'plan_key',              COALESCE(v_sub.name,         'free'),
    'total_documents',       v_doc_count,
    'total_words_humanized', v_total_words,
    'avg_ai_defeated',       ROUND(v_avg_ai_defeated, 1)
  );
END;
$stats$;

-- ── e) purge_expired_document_text ────────────────────────
CREATE OR REPLACE FUNCTION public.purge_expired_document_text()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $purge_text$
BEGIN
  -- NULL out raw text in documents past their purge time
  UPDATE public.documents
  SET
    input_text  = NULL,
    output_text = NULL,
    updated_at  = NOW()
  WHERE text_purge_at <= NOW()
    AND (input_text IS NOT NULL OR output_text IS NOT NULL);

  -- Delete detection cache rows older than 7 days
  DELETE FROM public.detection_cache
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$purge_text$;

-- ── f) Auto-update updated_at timestamp ───────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $triggers$
BEGIN
  CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $triggers$;

DO $triggers2$
BEGIN
  CREATE TRIGGER set_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $triggers2$;

DO $triggers3$
BEGIN
  CREATE TRIGGER set_usage_updated_at
    BEFORE UPDATE ON public.usage
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $triggers3$;

DO $triggers4$
BEGIN
  CREATE TRIGGER set_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $triggers4$;

DO $triggers5$
BEGIN
  CREATE TRIGGER set_style_profiles_updated_at
    BEFORE UPDATE ON public.style_profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $triggers5$;


-- ══════════════════════════════════════════════════════════
-- 18.  pg_cron — schedule text cleanup every 5 minutes
-- ══════════════════════════════════════════════════════════
DO $cron_setup$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  -- Remove any old version of this job
  PERFORM cron.unschedule('humara_purge_document_text')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'humara_purge_document_text'
  );

  -- Schedule: every 5 minutes
  PERFORM cron.schedule(
    'humara_purge_document_text',
    '*/5 * * * *',
    'SELECT public.purge_expired_document_text()'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available: text cleanup must be called manually via SELECT public.purge_expired_document_text()';
END $cron_setup$;


-- ══════════════════════════════════════════════════════════
-- 19.  REALTIME PUBLICATION
--      Enables Supabase Realtime on usage, subscriptions, plans
--      so the frontend gets live updates when word counts change
-- ══════════════════════════════════════════════════════════
DO $realtime$
DECLARE pub_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) INTO pub_exists;

  IF pub_exists THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.usage;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.plans;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.engine_config;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $realtime$;


-- ══════════════════════════════════════════════════════════
-- 20.  STORAGE BUCKET (avatars, optional)
-- ══════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, '{"image/jpeg","image/png","image/webp"}')
ON CONFLICT (id) DO NOTHING;


-- ══════════════════════════════════════════════════════════
-- End of migration
