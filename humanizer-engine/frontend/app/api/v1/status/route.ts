import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRuntimeHealthReport } from '@/lib/ops/runtime-health';

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function buildPublicPayload(report: Awaited<ReturnType<typeof getRuntimeHealthReport>>) {
  const availableEngines = report.engines
    .filter((engine) => engine.status === 'healthy')
    .map((engine) => engine.id);

  return {
    status: report.status,
    version: report.version,
    environment: report.environment,
    runtime: {
      deep_checks: report.deepChecks,
      required_env_ready: report.summary.required_env_ready,
      available_engine_count: report.summary.available_engine_count,
      total_engine_count: report.summary.total_engine_count,
      payments_enabled: report.summary.payments_enabled,
      admin_configured: report.summary.admin_configured,
      site_url_configured: report.summary.site_url_configured,
      available_engines: availableEngines,
    },
    engines: report.engines.map(({ id, name, description, tier, status, detail }) => ({
      id,
      name,
      description,
      tier,
      status,
      detail,
    })),
    strengths: ['light', 'medium', 'strong'],
    tones: ['neutral', 'academic', 'professional', 'simple', 'creative', 'technical', 'wikipedia'],
    limits: {
      max_text_length: 50000,
      max_word_count: 10000,
    },
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deep = url.searchParams.get('deep') === '1';
  const report = await getRuntimeHealthReport({ deep });
  const authHeader = request.headers.get('authorization');
  const publicPayload = buildPublicPayload(report);
  const responseStatus = report.status === 'unhealthy' ? 503 : 200;

  if (!authHeader?.startsWith('Bearer hum_')) {
    return NextResponse.json({
      success: true,
      data: publicPayload,
    }, { status: responseStatus });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({
      error: 'Server configuration is incomplete.',
      code: 'SERVICE_UNAVAILABLE',
    }, { status: 503 });
  }

  const apiKey = authHeader.replace('Bearer ', '');
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const { data: keyRow } = await supabase
    .from('api_keys')
    .select('id, user_id, is_active, requests')
    .eq('key_hash', keyHash)
    .single();

  if (!keyRow || !keyRow.is_active) {
    return NextResponse.json({ error: 'Invalid or revoked API key.', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  let monthlyWordsUsed = 0;
  let dailyRequestsUsed = 0;
  let apiPlanId: string | null = null;

  const { data: extRow } = await supabase
    .from('api_keys')
    .select('monthly_words_used, daily_requests_used, api_plan_id')
    .eq('id', keyRow.id)
    .single();
  if (extRow) {
    monthlyWordsUsed = extRow.monthly_words_used ?? 0;
    dailyRequestsUsed = extRow.daily_requests_used ?? 0;
    apiPlanId = extRow.api_plan_id ?? null;
  }

  let plan = {
    monthly_words: 50000,
    daily_requests: 100,
    engines: publicPayload.runtime.available_engines,
    rate_limit_per_minute: 10,
    display_name: 'Default',
  };

  if (apiPlanId) {
    const { data: planRow } = await supabase
      .from('api_plans')
      .select('display_name, monthly_words, daily_requests, engines, rate_limit_per_minute')
      .eq('id', apiPlanId)
      .single();

    if (planRow) {
      plan = {
        monthly_words: planRow.monthly_words ?? plan.monthly_words,
        daily_requests: planRow.daily_requests ?? plan.daily_requests,
        engines: Array.isArray(planRow.engines) ? planRow.engines : plan.engines,
        rate_limit_per_minute: planRow.rate_limit_per_minute ?? plan.rate_limit_per_minute,
        display_name: planRow.display_name ?? plan.display_name,
      };
    }
  }

  const availablePlanEngines = plan.engines.filter((engineId) => publicPayload.runtime.available_engines.includes(engineId));

  return NextResponse.json({
    success: true,
    data: {
      ...publicPayload,
      plan: plan.display_name,
      available_engines: availablePlanEngines,
      usage: {
        daily_requests_used: dailyRequestsUsed,
        daily_requests_limit: plan.daily_requests,
        monthly_words_used: monthlyWordsUsed,
        monthly_words_limit: plan.monthly_words,
      },
      rate_limit: {
        requests_per_minute: plan.rate_limit_per_minute,
      },
      total_requests: keyRow.requests || 0,
    },
  }, { status: responseStatus });
}
