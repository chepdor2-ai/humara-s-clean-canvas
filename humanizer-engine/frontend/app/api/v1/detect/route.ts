import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase';
import crypto from 'crypto';
import { getDetector } from '@/lib/engine/multi-detector';

export const maxDuration = 30;

async function authenticateApiKey(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer hum_')) {
    return { error: 'Missing or invalid API key.', status: 401 };
  }
  const apiKey = authHeader.replace('Bearer ', '');
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const supabase = createServiceClient();

  const { data: keyRow, error: keyError } = await supabase
    .from('api_keys')
    .select('id, user_id, is_active, requests')
    .eq('key_hash', keyHash)
    .single();

  if (keyError || !keyRow) return { error: 'Invalid API key.', status: 401 };
  if (!keyRow.is_active) return { error: 'API key has been revoked.', status: 403 };

  // Try extended columns (may not exist yet)
  let dailyRequestsUsed = 0;
  const { data: extRow } = await supabase
    .from('api_keys')
    .select('daily_requests_used, last_daily_reset')
    .eq('id', keyRow.id)
    .single();
  if (extRow?.daily_requests_used != null) {
    dailyRequestsUsed = extRow.daily_requests_used;
    const today = new Date().toISOString().split('T')[0];
    if (extRow.last_daily_reset !== today) {
      await supabase.from('api_keys').update({ daily_requests_used: 0, last_daily_reset: today }).eq('id', keyRow.id).then(() => {});
      dailyRequestsUsed = 0;
    }
    if (dailyRequestsUsed >= 100) {
      return { error: 'Daily request limit reached.', status: 429 };
    }
  }

  return { keyRow: { ...keyRow, daily_requests_used: dailyRequestsUsed }, supabase };
}

export async function POST(request: Request) {
  const startTime = Date.now();
  const auth = await authenticateApiKey(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error, code: auth.status === 401 ? 'UNAUTHORIZED' : 'RATE_LIMITED' }, { status: auth.status });
  }
  const { keyRow, supabase } = auth;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body.', code: 'INVALID_REQUEST' }, { status: 400 });
  }

  const text = body.text as string | undefined;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'Field "text" is required.', code: 'MISSING_TEXT' }, { status: 400 });
  }
  if (text.length > 50000) {
    return NextResponse.json({ error: 'Text too long. Max 50,000 characters.', code: 'TEXT_TOO_LONG' }, { status: 400 });
  }

  try {
    const detector = getDetector();
    const analysis = detector.analyze(text);
    const latencyMs = Date.now() - startTime;

    // Update counters (safe — ignores missing columns)
    await supabase.from('api_keys').update({
      requests: (keyRow.requests || 0) + 1,
      last_used: new Date().toISOString(),
    }).eq('id', keyRow.id);

    // Log usage (safe — table may not exist)
    await supabase.from('api_usage_log').insert({
      api_key_id: keyRow.id,
      user_id: keyRow.user_id,
      endpoint: '/v1/detect',
      input_words: text.trim().split(/\s+/).length,
      output_words: 0,
      latency_ms: latencyMs,
      status_code: 200,
    }).then(() => {});

    return NextResponse.json({
      success: true,
      data: {
        overall_ai_score: analysis.summary.overall_ai_score,
        overall_human_score: analysis.summary.overall_human_score,
        detectors: analysis.detectors,
        word_count: analysis.summary.word_count,
        sentence_count: analysis.summary.sentence_count,
      },
      meta: { latency_ms: latencyMs },
    });
  } catch {
    return NextResponse.json({ error: 'Detection failed.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
