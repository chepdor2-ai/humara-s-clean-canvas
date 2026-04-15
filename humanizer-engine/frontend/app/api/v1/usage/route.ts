import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase';
import crypto from 'crypto';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer hum_')) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const apiKey = authHeader.replace('Bearer ', '');
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const supabase = createServiceClient();

  const { data: keyRow } = await supabase
    .from('api_keys')
    .select('id, user_id, is_active, requests')
    .eq('key_hash', keyHash)
    .single();

  if (!keyRow || !keyRow.is_active) {
    return NextResponse.json({ error: 'Invalid API key.', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  // Try extended columns
  let monthlyWordsUsed = 0;
  let dailyRequestsUsed = 0;
  const { data: extRow } = await supabase
    .from('api_keys')
    .select('monthly_words_used, daily_requests_used')
    .eq('id', keyRow.id)
    .single();
  if (extRow) {
    monthlyWordsUsed = extRow.monthly_words_used ?? 0;
    dailyRequestsUsed = extRow.daily_requests_used ?? 0;
  }

  const monthlyWords = 50000;
  const dailyRequests = 100;

  // Get usage for last 30 days (table may not exist yet)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let logs: Array<{ endpoint?: string; engine?: string; input_words?: number; output_words?: number; latency_ms?: number; status_code?: number; created_at: string }> = [];
  const { data: usageLogs } = await supabase
    .from('api_usage_log')
    .select('endpoint, engine, input_words, output_words, latency_ms, status_code, created_at')
    .eq('api_key_id', keyRow.id)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(1000);
  if (usageLogs) logs = usageLogs;

  // Aggregate stats
  const totalRequests = logs.length;
  const totalInputWords = logs.reduce((sum, l) => sum + (l.input_words || 0), 0);
  const totalOutputWords = logs.reduce((sum, l) => sum + (l.output_words || 0), 0);
  const avgLatency = totalRequests > 0 ? Math.round(logs.reduce((sum, l) => sum + (l.latency_ms || 0), 0) / totalRequests) : 0;
  const errorCount = logs.filter(l => (l.status_code ?? 0) >= 400).length;
  const successRate = totalRequests > 0 ? Math.round((1 - errorCount / totalRequests) * 100 * 10) / 10 : 100;

  // Daily breakdown (last 30 days)
  const dailyMap: Record<string, { requests: number; words: number; errors: number }> = {};
  for (const log of logs) {
    const day = log.created_at.split('T')[0];
    if (!dailyMap[day]) dailyMap[day] = { requests: 0, words: 0, errors: 0 };
    dailyMap[day].requests++;
    dailyMap[day].words += log.input_words || 0;
    if ((log.status_code ?? 0) >= 400) dailyMap[day].errors++;
  }

  // Engine breakdown
  const engineMap: Record<string, number> = {};
  for (const log of logs) {
    if (log.engine) {
      engineMap[log.engine] = (engineMap[log.engine] || 0) + 1;
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      plan: 'Default',
      period: {
        start: thirtyDaysAgo.toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0],
      },
      summary: {
        total_requests: totalRequests,
        total_input_words: totalInputWords,
        total_output_words: totalOutputWords,
        avg_latency_ms: avgLatency,
        success_rate: successRate,
        error_count: errorCount,
      },
      quota: {
        daily_requests_used: dailyRequestsUsed,
        daily_requests_limit: dailyRequests,
        monthly_words_used: monthlyWordsUsed,
        monthly_words_limit: monthlyWords,
      },
      daily_breakdown: Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({ date, ...d })),
      engine_breakdown: Object.entries(engineMap)
        .sort(([, a], [, b]) => b - a)
        .map(([engine, count]) => ({ engine, requests: count })),
    },
  });
}
