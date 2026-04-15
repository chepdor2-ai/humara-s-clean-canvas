'use client';
import { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import { useAuth } from '../AuthProvider';
import { supabase } from '../../lib/supabase';

interface UsageData {
  wordsUsed: number;
  wordsLimit: number;
  daysRemaining: number;
  planName: string;
}

interface UsageContextValue {
  usage: UsageData | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Optimistically add words to the count without waiting for a server round-trip */
  addWords: (count: number) => void;
}

const UsageContext = createContext<UsageContextValue | null>(null);

export function useUsage(): UsageContextValue {
  const ctx = useContext(UsageContext);
  if (ctx) return ctx;
  // Fallback for components rendered outside the provider (e.g. dashboard, settings)
  return useFallbackUsage();
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

function parseUsageResponse(data: any): UsageData {
  const totalUsed = (data.words_used_fast || 0) + (data.words_used_stealth || 0);
  const rawLimit = (data.words_limit_fast || 0) + (data.words_limit_stealth || 0);
  const planName = String(data.plan_name || 'Free');
  const isFree = planName.trim().toLowerCase() === 'free';
  const totalLimit = rawLimit > 0 ? rawLimit : (isFree ? 1000 : 0);
  return {
    wordsUsed: totalUsed,
    wordsLimit: totalLimit,
    daysRemaining: data.days_remaining || 0,
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

const FREE_DEFAULTS: UsageData = { wordsUsed: 0, wordsLimit: 1000, daysRemaining: 0, planName: 'Free' };

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

  useEffect(() => { 
    if (!user) {
      setUsage(FREE_DEFAULTS);
      setLoading(false);
      return;
    }
    refresh(); 
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh, user]);

  return { usage, loading, refresh, addWords };
}

/** Standalone hook for pages that are outside the UsageProvider (dashboard, settings) */
function useFallbackUsage(): UsageContextValue {
  const internal = useUsageInternal();
  return internal;
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

  const pct = usage.wordsLimit > 0 ? Math.min(100, (usage.wordsUsed / usage.wordsLimit) * 100) : 0;
  const barColor = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-brand-500';

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
        <span className="text-[9px] text-slate-500 dark:text-zinc-500 tabular-nums">{wordsCount.toLocaleString()}/{usage.wordsLimit.toLocaleString()}</span>
      </div>
    </div>
  );
}
