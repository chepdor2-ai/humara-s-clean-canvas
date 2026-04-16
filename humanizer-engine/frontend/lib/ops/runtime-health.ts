import { createClient } from '@supabase/supabase-js';

export type RuntimeStatus = 'healthy' | 'degraded' | 'unhealthy' | 'skipped';

type EnvKey =
  | 'ADMIN_EMAILS'
  | 'EASY_API_KEY'
  | 'NEXT_PUBLIC_ADMIN_EMAILS'
  | 'NEXT_PUBLIC_PAYSTACK_CALLBACK_URL'
  | 'NEXT_PUBLIC_SITE_URL'
  | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  | 'NEXT_PUBLIC_SUPABASE_URL'
  | 'OPENAI_API_KEY'
  | 'OXYGEN3_API_URL'
  | 'OZONE_API_KEY'
  | 'PAYSTACK_SECRET_KEY'
  | 'SUPABASE_SERVICE_ROLE_KEY';

type EngineCatalogEntry = {
  id: string;
  name: string;
  description: string;
  tier: 'hobby' | 'developer' | 'business';
  requiredEnv?: EnvKey[];
};

export type EngineHealthEntry = EngineCatalogEntry & {
  status: RuntimeStatus;
  detail: string;
};

const PLACEHOLDER_PATTERNS = [
  /^your[_-]/i,
  /^replace[_-]/i,
  /example\.com/i,
  /https?:\/\/your[-.]/i,
  /_here$/i,
  /changeme/i,
];

const REQUIRED_ENV_KEYS: EnvKey[] = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
];

const OPTIONAL_ENV_KEYS: EnvKey[] = [
  'NEXT_PUBLIC_SITE_URL',
  'PAYSTACK_SECRET_KEY',
  'NEXT_PUBLIC_PAYSTACK_CALLBACK_URL',
  'ADMIN_EMAILS',
  'NEXT_PUBLIC_ADMIN_EMAILS',
];

export const ENGINE_CATALOG: EngineCatalogEntry[] = [
  {
    id: 'oxygen',
    name: 'Humara 2.0',
    description: 'GPTZero killer mode',
    tier: 'hobby',
  },
  {
    id: 'ozone',
    name: 'Humara 2.1',
    description: 'ZeroGPT and Surfer SEO cleaner',
    tier: 'developer',
    requiredEnv: ['OZONE_API_KEY'],
  },
  {
    id: 'easy',
    name: 'Humara 2.2',
    description: 'Broad-spectrum general-purpose',
    tier: 'hobby',
    requiredEnv: ['EASY_API_KEY'],
  },
  {
    id: 'oxygen3',
    name: 'Humara 3.0',
    description: 'Fine-tuned 270K pairs model',
    tier: 'developer',
    requiredEnv: ['OXYGEN3_API_URL'],
  },
  {
    id: 'humara_v3_3',
    name: 'Humara 2.4',
    description: 'Strongest GPTZero killer',
    tier: 'business',
  },
  {
    id: 'nuru_v2',
    name: 'Nuru 2.0',
    description: 'Deep sentence restructuring',
    tier: 'developer',
  },
  {
    id: 'ghost_pro_wiki',
    name: 'Wikipedia',
    description: 'Encyclopedic neutral point-of-view mode',
    tier: 'developer',
  },
];

function readConfiguredEnv(key: EnvKey): string | undefined {
  const value = process.env[key];
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed)) ? undefined : trimmed;
}

function summarizeEnv(keys: EnvKey[]) {
  const configured = keys.filter((key) => readConfiguredEnv(key));
  const missing = keys.filter((key) => !readConfiguredEnv(key));
  return { configured, missing };
}

function buildEngineHealth(): EngineHealthEntry[] {
  return ENGINE_CATALOG.map((engine) => {
    const requiredEnv = engine.requiredEnv ?? [];
    const missing = requiredEnv.filter((key) => !readConfiguredEnv(key));

    return {
      ...engine,
      status: missing.length === 0 ? 'healthy' : 'degraded',
      detail: missing.length === 0
        ? 'Ready'
        : `Waiting for ${missing.length} configuration value${missing.length === 1 ? '' : 's'}`,
    };
  });
}

async function runSupabaseCheck(): Promise<{ status: RuntimeStatus; detail: string }> {
  const supabaseUrl = readConfiguredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = readConfiguredEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      status: 'skipped',
      detail: 'Supabase deep check skipped because service credentials are incomplete.',
    };
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { error } = await supabase
      .from('plans')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    if (error) {
      return {
        status: 'degraded',
        detail: `Supabase responded but the plans query failed: ${error.message}`,
      };
    }

    return {
      status: 'healthy',
      detail: 'Supabase connectivity verified.',
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      detail: error instanceof Error ? error.message : 'Supabase connectivity check failed.',
    };
  }
}

function computeOverallStatus(input: {
  missingRequired: number;
  optionalWarnings: number;
  engineWarnings: number;
  paymentsReady: boolean;
  siteConfigured: boolean;
  supabaseCheckStatus: RuntimeStatus;
}): RuntimeStatus {
  if (input.missingRequired > 0 || input.supabaseCheckStatus === 'unhealthy') {
    return 'unhealthy';
  }

  if (
    input.optionalWarnings > 0
    || input.engineWarnings > 0
    || !input.paymentsReady
    || !input.siteConfigured
    || input.supabaseCheckStatus === 'degraded'
  ) {
    return 'degraded';
  }

  return 'healthy';
}

export async function getRuntimeHealthReport({ deep = false }: { deep?: boolean }) {
  const requiredEnv = summarizeEnv(REQUIRED_ENV_KEYS);
  const optionalEnv = summarizeEnv(OPTIONAL_ENV_KEYS);
  const engines = buildEngineHealth();
  const paymentsReady = Boolean(readConfiguredEnv('PAYSTACK_SECRET_KEY') && readConfiguredEnv('NEXT_PUBLIC_PAYSTACK_CALLBACK_URL'));
  const adminConfigured = Boolean(readConfiguredEnv('ADMIN_EMAILS') || readConfiguredEnv('NEXT_PUBLIC_ADMIN_EMAILS'));
  const siteConfigured = Boolean(readConfiguredEnv('NEXT_PUBLIC_SITE_URL'));
  const supabaseCheck = deep
    ? await runSupabaseCheck()
    : { status: 'skipped' as RuntimeStatus, detail: 'Deep integration checks disabled.' };
  const engineWarnings = engines.filter((engine) => engine.status !== 'healthy').length;

  const status = computeOverallStatus({
    missingRequired: requiredEnv.missing.length,
    optionalWarnings: optionalEnv.missing.length,
    engineWarnings,
    paymentsReady,
    siteConfigured,
    supabaseCheckStatus: supabaseCheck.status,
  });

  return {
    status,
    version: '3.1.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? 'development',
    deepChecks: deep,
    summary: {
      required_env_ready: requiredEnv.missing.length === 0,
      optional_warning_count: optionalEnv.missing.length,
      available_engine_count: engines.filter((engine) => engine.status === 'healthy').length,
      total_engine_count: engines.length,
      payments_enabled: paymentsReady,
      admin_configured: adminConfigured,
      site_url_configured: siteConfigured,
    },
    checks: {
      configuration: {
        status: requiredEnv.missing.length === 0 ? 'healthy' : 'unhealthy',
        required_ready: requiredEnv.missing.length === 0,
        required_count: requiredEnv.configured.length,
        required_total: REQUIRED_ENV_KEYS.length,
        optional_warnings: optionalEnv.missing.length,
      },
      integrations: {
        supabase: supabaseCheck,
        payments: {
          status: paymentsReady ? 'healthy' : 'degraded',
          detail: paymentsReady ? 'Paystack is configured.' : 'Paystack configuration is incomplete.',
        },
        admin: {
          status: adminConfigured ? 'healthy' : 'degraded',
          detail: adminConfigured ? 'Admin emails are configured.' : 'Admin emails are not configured.',
        },
        site: {
          status: siteConfigured ? 'healthy' : 'degraded',
          detail: siteConfigured ? 'Site URL is configured.' : 'NEXT_PUBLIC_SITE_URL is not configured.',
        },
      },
    },
    engines,
    internal: {
      missing_required_env: requiredEnv.missing,
      missing_optional_env: optionalEnv.missing,
    },
  };
}