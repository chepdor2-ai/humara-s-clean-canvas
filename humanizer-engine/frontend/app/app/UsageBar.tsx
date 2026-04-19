'use client';
import { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import { useAuth } from '../AuthProvider';
import { supabase } from '../../lib/supabase';

interface UsageData {
  wordsUsed: number;
  wordsLimit: number;
  isUnlimited: boolean;
  monthlyUsed: number;
  monthlyLimit: number;
  daysRemaining: number;
  planName: string;
}

interface UsageContextValue {
  usage: UsageData | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Optimistically add words to the count without waiting for a server round-trip */
  addWords: (count: number) => void;
  /** Apply exact totals returned by the backend immediately. */
  setUsageTotals: (wordsUsed: number, wordsLimit?: number) => void;
}

const UsageContext = createContext<UsageContextValue | null>(null);

const FREE_DEFAULTS: UsageData = {
  wordsUsed: 0,
  wordsLimit: 1000,
  isUnlimited: false,
  monthlyUsed: 0,
  monthlyLimit: 30000,
  daysRemaining: 0,
  planName: 'Free',
};

export function useUsage(): UsageContextValue {
  const ctx = useContext(UsageContext);
  return ctx ?? {
    usage: FREE_DEFAULTS,
    loading: false,
    refresh: async () => {},
    addWords: () => {},
    setUsageTotals: () => {},
  };
}

function useCountUp(target: number, duration: number = 1000) {
  const [count, setCount] = useState(0);
  const prevTargetRef = useRef(target);

  useEffect(() => {
    if (prevTargetRef.current === target) return;
    
    const start = prevTargetRef.current;
    const increment = (target - start) / (duration / 16);
    const startTime = Date.now();
    
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= duration) {
        setCount(target);
        prevTargetRef.current = target;
        clearInterval(timer);
      } else {
        setCount(Math.floor(start + increment * (elapsed / 16)));
      }
    }, 16);
    
    return () => clearInterval(timer);
  }, [target, duration]);

  return count;
}

function parseUsageResponse(data: Record<string, unknown>): UsageData {
  const usedFast = Number(data.words_used_fast ?? 0);
  const usedStealth = Number(data.words_used_stealth ?? 0);
  const limitFast = Number(data.words_limit_fast ?? 0);
  const limitStealth = Number(data.words_limit_stealth ?? 0);
  const totalUsed = usedFast + usedStealth;
  const rawLimit = limitFast + limitStealth;
  const planName = String(data.plan_name ?? 'Free');
  const lowerPlanName = planName.trim().toLowerCase();
  const isFree = lowerPlanName === 'free';
  const isUnlimited = Boolean(data.is_unlimited) || rawLimit < 0 || lowerPlanName.includes('unlimited');
  const totalLimit = isUnlimited ? -1 : (rawLimit > 0 ? rawLimit : (isFree ? 1000 : 0));
  const daysRemaining = Number(data.days_remaining ?? 0);
  const cycleDays = daysRemaining > 0 ? Math.max(1, Math.min(30, daysRemaining)) : 30;
  const monthlyLimit = isUnlimited ? -1 : totalLimit * 30;
  const monthlyUsed = isUnlimited
    ? totalUsed
    : Math.min(monthlyLimit, Math.max(0, totalUsed + (30 - cycleDays) * totalLimit));
  return {
    wordsUsed: totalUsed,
    wordsLimit: totalLimit,
    isUnlimited,
    monthlyUsed,
    monthlyLimit,
    daysRemaining,
    planName,
  };
}

async function fetchUsageData(accessToken: string | undefined, userId: string): Promise<UsageData | null> {
  // Prefer server API (service-role) to avoid RLS/RPC privilege issues.
  if (accessToken) {
    try {
      const res = await fetch('/api/usage', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        return parseUsageResponse(data);
      }
    } catch {}
  }

  // Fallback to direct RPC
  const rpc = await supabase.rpc('get_usage_stats', { p_user_id: userId });
  if (!rpc.error && rpc.data) {
    return parseUsageResponse(rpc.data);
  }

  console.warn('Usage RPC unavailable:', rpc.error?.message);
  return null;
}

function useUsageInternal() {
  const { user, session } = useAuth();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchUsageData(session?.access_token, user.id);
      if (data) {
        setUsage(data);
      } else {
        setUsage(prev => prev ?? FREE_DEFAULTS);
      }
    } catch (err) {
      console.error('Usage fetch error:', err);
      setUsage(prev => prev ?? FREE_DEFAULTS);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, user]);

  const addWords = useCallback((count: number) => {
    setUsage(prev => {
      if (!prev) return prev;
      return { ...prev, wordsUsed: prev.wordsUsed + count };
    });
  }, []);

  const setUsageTotals = useCallback((wordsUsed: number, wordsLimit?: number) => {
    setUsage(prev => {
      const base = prev ?? FREE_DEFAULTS;
      const nextLimit = typeof wordsLimit === 'number' && Number.isFinite(wordsLimit)
        ? wordsLimit
        : base.wordsLimit;
      const nextUnlimited = nextLimit < 0 || base.isUnlimited;
      return {
        ...base,
        wordsUsed,
        wordsLimit: nextLimit,
        isUnlimited: nextUnlimited,
        monthlyUsed: nextUnlimited ? wordsUsed : Math.max(base.monthlyUsed, wordsUsed),
        monthlyLimit: nextUnlimited ? -1 : Math.max(base.monthlyLimit, nextLimit > 0 ? nextLimit * 30 : base.monthlyLimit),
      };
    });
  }, []);

  useEffect(() => { 
    if (!user) {
      setUsage(FREE_DEFAULTS);
      setLoading(false);
      return;
    }
    void refresh();

    // Keep a slow polling fallback alongside realtime in case websocket drops.
    const interval = setInterval(() => { void refresh(); }, 30000);

    const channel = supabase
      .channel(`usage-live-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'usage', filter: `user_id=eq.${user.id}` },
        () => { void refresh(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${user.id}` },
        () => { void refresh(); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'plans' },
        () => { void refresh(); }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Usage realtime channel error');
        }
      });

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [refresh, user?.id]);

  return { usage, loading, refresh, addWords, setUsageTotals };
}

/** Wrap the main /app page with this so UsageBar and page.tsx share one piece of state */
export function UsageProvider({ children }: { children: ReactNode }) {
  const value = useUsageInternal();
  return <UsageContext.Provider value={value}>{children}</UsageContext.Provider>;
}

export default function UsageBar() {
  const { usage, loading } = useUsage();
  const wordsCount = useCountUp(usage?.wordsUsed || 0, 800);

  if (loading || !usage) return null;

  const isUnlimitedPlan = usage.isUnlimited || usage.wordsLimit < 0;
  const pct = isUnlimitedPlan ? 100 : (usage.wordsLimit > 0 ? Math.min(100, (usage.wordsUsed / usage.wordsLimit) * 100) : 0);
  const barColor = isUnlimitedPlan ? 'bg-emerald-500' : (pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-brand-500');

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs sm:text-sm font-extrabold text-emerald-600 dark:text-brand-400 bg-emerald-50 dark:bg-brand-950/30 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg border border-emerald-200 dark:border-brand-800/40">{usage.planName}</span>
        {usage.daysRemaining > 0 && <span className="text-[10px] text-slate-500 dark:text-zinc-500">{usage.daysRemaining}d left</span>}
      </div>
      <div className="flex items-center gap-1.5 min-w-[140px] sm:min-w-[200px]">
        <span className="text-[9px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">Words</span>
        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-zinc-800/50 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[9px] text-slate-500 dark:text-zinc-500 tabular-nums">
          {isUnlimitedPlan ? `${wordsCount.toLocaleString()}/Unlimited` : `${wordsCount.toLocaleString()}/${usage.wordsLimit.toLocaleString()}`}
        </span>
      </div>
    </div>
  );
}
