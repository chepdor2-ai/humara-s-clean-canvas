import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase';
import crypto from 'crypto';

export const maxDuration = 120;

// ── API Key Authentication Helper ─────────────────────────────────
async function authenticateApiKey(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer hum_')) {
    return { error: 'Missing or invalid API key. Use: Authorization: Bearer hum_xxx', status: 401 };
  }

  const apiKey = authHeader.replace('Bearer ', '');
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const supabase = createServiceClient();

  // Look up key
  const { data: keyRow, error: keyError } = await supabase
    .from('api_keys')
    .select('id, user_id, name, is_active, api_plan_id, monthly_words_used, daily_requests_used, last_daily_reset, last_monthly_reset, requests')
    .eq('key_hash', keyHash)
    .single();

  if (keyError || !keyRow) {
    return { error: 'Invalid API key.', status: 401 };
  }

  if (!keyRow.is_active) {
    return { error: 'API key has been revoked.', status: 403 };
  }

  // Get API plan limits (default to hobby if no plan)
  let plan = { monthly_words: 50000, daily_requests: 100, engines: ['oxygen', 'easy'], rate_limit_per_minute: 10, display_name: 'Hobby' };
  if (keyRow.api_plan_id) {
    const { data: planRow } = await supabase
      .from('api_plans')
      .select('*')
      .eq('id', keyRow.api_plan_id)
      .single();
    if (planRow) {
      plan = planRow;
    }
  }

  // Reset daily counter if new day
  const today = new Date().toISOString().split('T')[0];
  if (keyRow.last_daily_reset !== today) {
    await supabase.from('api_keys').update({ daily_requests_used: 0, last_daily_reset: today }).eq('id', keyRow.id);
    keyRow.daily_requests_used = 0;
  }

  // Reset monthly counter if new month
  const thisMonth = today.slice(0, 7);
  const lastReset = keyRow.last_monthly_reset ? String(keyRow.last_monthly_reset).slice(0, 7) : '';
  if (lastReset !== thisMonth) {
    await supabase.from('api_keys').update({ monthly_words_used: 0, last_monthly_reset: today }).eq('id', keyRow.id);
    keyRow.monthly_words_used = 0;
  }

  // Check daily request limit
  if (keyRow.daily_requests_used >= plan.daily_requests) {
    return {
      error: `Daily request limit reached (${plan.daily_requests} requests/day). Upgrade your API plan for more.`,
      status: 429,
      headers: { 'X-RateLimit-Limit': String(plan.daily_requests), 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': 'tomorrow' },
    };
  }

  return { keyRow, plan, supabase };
}

// ── POST /api/v1/humanize ─────────────────────────────────────────
export async function POST(request: Request) {
  const startTime = Date.now();

  // Authenticate
  const auth = await authenticateApiKey(request);
  if ('error' in auth) {
    return NextResponse.json(
      { error: auth.error, code: auth.status === 401 ? 'UNAUTHORIZED' : auth.status === 429 ? 'RATE_LIMITED' : 'FORBIDDEN' },
      { status: auth.status, headers: auth.headers }
    );
  }

  const { keyRow, plan, supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.', code: 'INVALID_REQUEST' }, { status: 400 });
  }

  const text = body.text as string | undefined;
  const engine = (body.engine as string) || 'oxygen';
  const strength = (body.strength as string) || 'medium';
  const tone = (body.tone as string) || 'neutral';
  const strictMeaning = body.strict_meaning !== false;
  const noContractions = body.no_contractions === true;
  const enablePostProcessing = body.enable_post_processing !== false;

  // Validate text
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'Field "text" is required and must be a non-empty string.', code: 'MISSING_TEXT' }, { status: 400 });
  }

  if (text.length > 50000) {
    return NextResponse.json({ error: 'Text too long. Maximum 50,000 characters.', code: 'TEXT_TOO_LONG' }, { status: 400 });
  }

  const wordCount = text.trim().split(/\s+/).length;

  // Check monthly word limit
  if ((keyRow.monthly_words_used || 0) + wordCount > plan.monthly_words) {
    return NextResponse.json({
      error: `Monthly word limit reached. Used: ${keyRow.monthly_words_used}/${plan.monthly_words} words. Upgrade your plan.`,
      code: 'WORD_LIMIT_REACHED',
      usage: { monthly_words_used: keyRow.monthly_words_used, monthly_words_limit: plan.monthly_words },
    }, { status: 429 });
  }

  // Validate engine against plan
  const allowedEngines = plan.engines as string[];
  if (!allowedEngines.includes(engine)) {
    return NextResponse.json({
      error: `Engine "${engine}" is not available on your ${plan.display_name} plan. Available engines: ${allowedEngines.join(', ')}`,
      code: 'ENGINE_NOT_AVAILABLE',
      available_engines: allowedEngines,
    }, { status: 403 });
  }

  // Validate strength and tone
  const validStrengths = ['light', 'medium', 'strong'];
  const validTones = ['neutral', 'academic', 'professional', 'simple', 'creative', 'technical', 'wikipedia'];
  if (!validStrengths.includes(strength)) {
    return NextResponse.json({ error: `Invalid strength. Must be one of: ${validStrengths.join(', ')}`, code: 'INVALID_STRENGTH' }, { status: 400 });
  }
  if (!validTones.includes(tone)) {
    return NextResponse.json({ error: `Invalid tone. Must be one of: ${validTones.join(', ')}`, code: 'INVALID_TONE' }, { status: 400 });
  }

  try {
    // Forward to the internal humanize API
    const internalUrl = new URL('/api/humanize', request.url);
    const internalRes = await fetch(internalUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        engine,
        strength,
        tone,
        strict_meaning: strictMeaning,
        no_contractions: noContractions,
        enable_post_processing: enablePostProcessing,
      }),
    });

    const result = await internalRes.json();
    const latencyMs = Date.now() - startTime;

    // Update usage counters
    await supabase.from('api_keys').update({
      daily_requests_used: (keyRow.daily_requests_used || 0) + 1,
      monthly_words_used: (keyRow.monthly_words_used || 0) + wordCount,
      requests: (keyRow.requests || 0) + 1,
      last_used: new Date().toISOString(),
    }).eq('id', keyRow.id);

    // Log the API usage
    await supabase.from('api_usage_log').insert({
      api_key_id: keyRow.id,
      user_id: keyRow.user_id,
      endpoint: '/v1/humanize',
      engine,
      input_words: wordCount,
      output_words: result.word_count || 0,
      latency_ms: latencyMs,
      status_code: result.success ? 200 : 500,
      error_message: result.error || null,
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    });

    if (!result.success) {
      return NextResponse.json({
        error: result.error || 'Humanization failed.',
        code: 'HUMANIZATION_FAILED',
      }, { status: 500 });
    }

    // Calculate remaining quota
    const remainingDailyRequests = Math.max(0, plan.daily_requests - (keyRow.daily_requests_used || 0) - 1);
    const remainingMonthlyWords = Math.max(0, plan.monthly_words - (keyRow.monthly_words_used || 0) - wordCount);

    return NextResponse.json({
      success: true,
      data: {
        humanized: result.humanized,
        engine_used: result.engine_used || engine,
        input_word_count: wordCount,
        output_word_count: result.word_count || 0,
        meaning_preserved: result.meaning_preserved ?? true,
        meaning_similarity: result.meaning_similarity ?? null,
        ai_scores: result.output_detector_results || null,
      },
      meta: {
        latency_ms: latencyMs,
        plan: plan.display_name,
        usage: {
          daily_requests_used: (keyRow.daily_requests_used || 0) + 1,
          daily_requests_limit: plan.daily_requests,
          monthly_words_used: (keyRow.monthly_words_used || 0) + wordCount,
          monthly_words_limit: plan.monthly_words,
        },
        remaining: {
          daily_requests: remainingDailyRequests,
          monthly_words: remainingMonthlyWords,
        },
      },
    }, {
      headers: {
        'X-RateLimit-Limit': String(plan.daily_requests),
        'X-RateLimit-Remaining': String(remainingDailyRequests),
        'X-Request-Id': keyRow.id.slice(0, 8) + '-' + Date.now().toString(36),
      },
    });

  } catch (err) {
    const latencyMs = Date.now() - startTime;
    // Log failure
    await supabase.from('api_usage_log').insert({
      api_key_id: keyRow.id,
      user_id: keyRow.user_id,
      endpoint: '/v1/humanize',
      engine,
      input_words: wordCount,
      output_words: 0,
      latency_ms: latencyMs,
      status_code: 500,
      error_message: err instanceof Error ? err.message : 'Unknown error',
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    });

    return NextResponse.json({
      error: 'Internal server error.',
      code: 'INTERNAL_ERROR',
    }, { status: 500 });
  }
}

// ── GET /api/v1/humanize — Method not allowed ────────────────────
export async function GET() {
  return NextResponse.json({
    error: 'Method not allowed. Use POST.',
    code: 'METHOD_NOT_ALLOWED',
    docs: 'https://humaragpt.com/app/docs',
  }, { status: 405 });
}
