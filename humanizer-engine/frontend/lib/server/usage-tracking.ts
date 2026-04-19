import type { SupabaseClient } from '@supabase/supabase-js';

type UsageStatsPayload = {
  words_used_fast: number;
  words_used_stealth: number;
  words_limit_fast: number;
  words_limit_stealth: number;
  is_unlimited: boolean;
  requests_today: number;
  days_remaining: number;
  plan_name: string;
  plan_key: string;
};

type PlanSnapshot = {
  dailyWordsFast: number;
  dailyWordsStealth: number;
  daysRemaining: number;
  planName: string;
  planKey: string;
};

const FREE_PLAN: PlanSnapshot = {
  dailyWordsFast: 1000,
  dailyWordsStealth: 0,
  daysRemaining: 0,
  planName: 'Free',
  planKey: 'free',
};

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function unwrapPlan(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return (value[0] as Record<string, unknown> | undefined) ?? null;
  }
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return null;
}

async function getPlanSnapshot(supabase: SupabaseClient, userId: string): Promise<PlanSnapshot> {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('current_period_end, plans(name, display_name, daily_words_fast, daily_words_stealth)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gt('current_period_end', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return FREE_PLAN;
    }

    const plan = unwrapPlan((data as Record<string, unknown>).plans);
    const endAt = String((data as Record<string, unknown>).current_period_end ?? '');
    const endTime = Date.parse(endAt);
    const daysRemaining = Number.isFinite(endTime)
      ? Math.max(0, Math.ceil((endTime - Date.now()) / 86_400_000))
      : 0;

    return {
      dailyWordsFast: Number(plan?.daily_words_fast ?? FREE_PLAN.dailyWordsFast),
      dailyWordsStealth: Number(plan?.daily_words_stealth ?? FREE_PLAN.dailyWordsStealth),
      daysRemaining,
      planName: String(plan?.display_name ?? FREE_PLAN.planName),
      planKey: String(plan?.name ?? FREE_PLAN.planKey),
    };
  } catch {
    return FREE_PLAN;
  }
}

async function getTodayDocumentUsage(supabase: SupabaseClient, userId: string) {
  const dayStart = startOfUtcDay(new Date()).toISOString();
  const dayEnd = endOfUtcDay(new Date()).toISOString();

  const { data, count, error } = await supabase
    .from('documents')
    .select('input_word_count', { count: 'exact' })
    .eq('user_id', userId)
    .gte('created_at', dayStart)
    .lt('created_at', dayEnd);

  if (error) {
    console.warn('Document-based usage fallback failed:', error.message, error.details);
    return { wordsUsed: 0, requestsToday: 0 };
  }

  const wordsUsed = (data ?? []).reduce((sum, row) => sum + Number(row.input_word_count ?? 0), 0);
  return {
    wordsUsed,
    requestsToday: count ?? data?.length ?? 0,
  };
}

function toUsageStatsPayload(plan: PlanSnapshot, wordsUsed: number, requestsToday: number): UsageStatsPayload {
  return {
    words_used_fast: wordsUsed,
    words_used_stealth: 0,
    words_limit_fast: plan.dailyWordsFast,
    words_limit_stealth: plan.dailyWordsStealth,
    is_unlimited: plan.dailyWordsFast < 0 || plan.dailyWordsStealth < 0,
    requests_today: requestsToday,
    days_remaining: plan.daysRemaining,
    plan_name: plan.planName,
    plan_key: plan.planKey,
  };
}

export async function getUsageStatsCompat(supabase: SupabaseClient, userId: string): Promise<UsageStatsPayload> {
  const rpc = await supabase.rpc('get_usage_stats', { p_user_id: userId });
  if (!rpc.error && rpc.data) {
    return rpc.data as UsageStatsPayload;
  }

  if (rpc.error) {
    console.warn('get_usage_stats RPC failed, using compatibility fallback:', rpc.error.message, rpc.error.details);
  }

  const [plan, todayUsage] = await Promise.all([
    getPlanSnapshot(supabase, userId),
    getTodayDocumentUsage(supabase, userId),
  ]);

  return toUsageStatsPayload(plan, todayUsage.wordsUsed, todayUsage.requestsToday);
}

export async function incrementUsageCompat(
  supabase: SupabaseClient,
  userId: string,
  words: number,
  engineType: string,
): Promise<UsageStatsPayload | null> {
  const rpc = await supabase.rpc('increment_usage', {
    p_user_id: userId,
    p_words: words,
    p_engine_type: engineType,
  });

  if (!rpc.error && rpc.data) {
    return rpc.data as UsageStatsPayload;
  }

  if (rpc.error) {
    console.warn('increment_usage RPC failed, trying table fallback:', rpc.error.message, rpc.error.details);
  }

  try {
    const plan = await getPlanSnapshot(supabase, userId);
    const usageDate = isoDate(new Date());
    const useFastBucket = ['fast', 'standard'].includes(engineType);
    const useStealthBucket = ['stealth', 'undetectable'].includes(engineType);

    const { data: existingUsage, error: selectError } = await supabase
      .from('usage')
      .select('words_used_fast, words_used_stealth, words_limit_fast, words_limit_stealth, requests')
      .eq('user_id', userId)
      .eq('usage_date', usageDate)
      .maybeSingle();

    if (selectError) {
      console.warn('Usage table fallback select failed:', selectError.message, selectError.details);
      return null;
    }

    const nextFast = Number(existingUsage?.words_used_fast ?? 0) + (useFastBucket ? words : 0);
    const nextStealth = Number(existingUsage?.words_used_stealth ?? 0) + (useStealthBucket ? words : 0);
    const nextRequests = Number(existingUsage?.requests ?? 0) + 1;

    if (existingUsage) {
      const { error: updateError } = await supabase
        .from('usage')
        .update({
          words_used_fast: nextFast,
          words_used_stealth: nextStealth,
          words_limit_fast: plan.dailyWordsFast,
          words_limit_stealth: plan.dailyWordsStealth,
          requests: nextRequests,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('usage_date', usageDate);

      if (updateError) {
        console.warn('Usage table fallback update failed:', updateError.message, updateError.details);
        return null;
      }

      return {
        words_used_fast: nextFast,
        words_used_stealth: nextStealth,
        words_limit_fast: plan.dailyWordsFast,
        words_limit_stealth: plan.dailyWordsStealth,
        is_unlimited: plan.dailyWordsFast < 0 || plan.dailyWordsStealth < 0,
        requests_today: nextRequests,
        days_remaining: plan.daysRemaining,
        plan_name: plan.planName,
        plan_key: plan.planKey,
      };
    }

    const { error: insertError } = await supabase.from('usage').insert({
      user_id: userId,
      usage_date: usageDate,
      words_used_fast: useFastBucket ? words : 0,
      words_used_stealth: useStealthBucket ? words : 0,
      words_limit_fast: plan.dailyWordsFast,
      words_limit_stealth: plan.dailyWordsStealth,
      requests: 1,
      days_remaining: plan.daysRemaining,
    });

    if (insertError) {
      console.warn('Usage table fallback insert failed:', insertError.message, insertError.details);
      return null;
    }

    return {
      words_used_fast: useFastBucket ? words : 0,
      words_used_stealth: useStealthBucket ? words : 0,
      words_limit_fast: plan.dailyWordsFast,
      words_limit_stealth: plan.dailyWordsStealth,
      is_unlimited: plan.dailyWordsFast < 0 || plan.dailyWordsStealth < 0,
      requests_today: 1,
      days_remaining: plan.daysRemaining,
      plan_name: plan.planName,
      plan_key: plan.planKey,
    };
  } catch (error) {
    console.warn('Usage compatibility fallback failed:', error);
    return null;
  }
}