-- Engine configuration table for admin-controlled engine visibility
-- Controls which humanizer engines are displayed to users, their tier (free/premium),
-- display order, and whether they are enabled or disabled.

CREATE TABLE IF NOT EXISTS public.engine_config (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  engine_id   TEXT NOT NULL UNIQUE,         -- e.g. 'oxygen', 'ninja', 'ghost_mini'
  label       TEXT NOT NULL,                -- Display name shown in UI
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,-- Whether visible to users
  premium     BOOLEAN NOT NULL DEFAULT FALSE,-- Whether gated behind premium toggle
  sort_order  INTEGER NOT NULL DEFAULT 0,   -- Display order (ascending)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed with current engine defaults
INSERT INTO public.engine_config (engine_id, label, enabled, premium, sort_order) VALUES
  ('oxygen',          'Oxygen',          true,  false, 1),
  ('omega',           'Omega',           true,  false, 2),
  ('nuru',            'Nuru',            true,  false, 3),
  ('humara_v1_3',     'Humara v1.3',     true,  false, 4),
  ('ghost_mini',      'Ghost Mini',      true,  false, 5),
  ('ghost_mini_v1_2', 'Ghost Mini v1.2', true,  false, 6),
  ('ghost_pro',       'Ghost Pro',       true,  false, 7),
  ('ninja',           'Ninja',           true,  false, 8),
  ('undetectable',    'Undetectable',    true,  false, 9),
  ('fast_v11',        'V1.1',            true,  true,  10),
  ('humara',          'Humara',          true,  true,  11)
ON CONFLICT (engine_id) DO NOTHING;

-- Allow public read access (users need to see which engines are available)
ALTER TABLE public.engine_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read engine_config"
  ON public.engine_config FOR SELECT
  USING (true);

-- Only service role (admin API) can modify
CREATE POLICY "Service role can manage engine_config"
  ON public.engine_config FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
