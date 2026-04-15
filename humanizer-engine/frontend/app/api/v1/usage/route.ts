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
    .select('id, user_id, is_active, api_plan_id, monthly_words_used, daily_requests_used, requests')
    .eq('key_hash', keyHash)
    .single();

  if (!keyRow || !keyRow.is_active) {
    return NextResponse.json({ error: 'Invalid API key.', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  // Get plan
  let plan = { display_name: 'Hobby', monthly_words: 50000, daily_requests: 100 };
  if (keyRow.api_plan_id) {
    const { data: planRow } = await supabase.from('api_plans').select('*').eq('id', keyRow.api_plan_id).single();
    if (planRow) plan = planRow;
  }

  // Get usage for last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: usageLogs } = await supabase
    .from('api_usage_log')
    .select('endpoint, engine, input_words, output_words, latency_ms, status_code, created_at')
    .eq('api_key_id', keyRow.id)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(1000);

  const logs = usageLogs || [];

  // Aggregate stats
  const totalRequests = logs.length;
  const totalInputWords = logs.reduce((sum, l) => sum + (l.input_words || 0), 0);
  const totalOutputWords = logs.reduce((sum, l) => sum + (l.output_words || 0), 0);
  const avgLatency = totalRequests > 0 ? Math.round(logs.reduce((sum, l) => sum + (l.latency_ms || 0), 0) / totalRequests) : 0;
  const errorCount = logs.filter(l => l.status_code >= 400).length;
  const successRate = totalRequests > 0 ? Math.round((1 - errorCount / totalRequests) * 100 * 10) / 10 : 100;

  // Daily breakdown (last 30 days)
  const dailyMap: Record<string, { requests: number; words: number; errors: number }> = {};
  for (const log of logs) {
    const day = log.created_at.split('T')[0];
    if (!dailyMap[day]) dailyMap[day] = { requests: 0, words: 0, errors: 0 };
    dailyMap[day].requests++;
    dailyMap[day].words += log.input_words || 0;
    if (log.status_code >= 400) dailyMap[day].errors++;
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
      plan: plan.display_name,
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
        daily_requests_used: keyRow.daily_requests_used || 0,
        daily_requests_limit: plan.daily_requests,
        monthly_words_used: keyRow.monthly_words_used || 0,
        monthly_words_limit: plan.monthly_words,
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
