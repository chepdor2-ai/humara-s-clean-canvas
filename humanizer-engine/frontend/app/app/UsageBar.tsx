'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../AuthProvider';
import { supabase } from '../../lib/supabase';

interface UsageData {
  wordsUsedFast: number;
  wordsUsedStealth: number;
  wordsLimitFast: number;
  wordsLimitStealth: number;
  daysRemaining: number;
  planName: string;
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

export function useUsage() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc('get_usage_stats', { p_user_id: user.id });
      if (!error && data) {
        setUsage({
          wordsUsedFast: data.words_used_fast || 0,
          wordsUsedStealth: data.words_used_stealth || 0,
          wordsLimitFast: data.words_limit_fast || 20000,
          wordsLimitStealth: data.words_limit_stealth || 10000,
          daysRemaining: data.days_remaining || 0,
          planName: data.plan_name || 'Starter',
        });
      }
    } catch (err) {
      console.error('Usage fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { 
    refresh(); 
    // Auto-refresh every 10 seconds
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { usage, loading, refresh };
}

export default function UsageBar() {
  const { usage, loading } = useUsage();
  const fastCount = useCountUp(usage?.wordsUsedFast || 0, 800);
  const stealthCount = useCountUp(usage?.wordsUsedStealth || 0, 800);

  if (loading || !usage) return null;

  const fastPct = usage.wordsLimitFast > 0 ? Math.min(100, (usage.wordsUsedFast / usage.wordsLimitFast) * 100) : 0;
  const stealthPct = usage.wordsLimitStealth > 0 ? Math.min(100, (usage.wordsUsedStealth / usage.wordsLimitStealth) * 100) : 0;

  // Get plan color for glow effect
  const planColors: Record<string, string> = {
    'Starter': '#a855f7',
    'Pro': '#3b82f6',
    'Premium': '#f59e0b',
    'Enterprise': '#10b981',
  };
  const planColor = planColors[usage.planName] || '#a855f7';

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-extrabold text-brand-400 bg-brand-950/30 px-2.5 py-1 rounded-lg border border-brand-800/40">{usage.planName}</span>
        <span className="text-[10px] text-zinc-500">{usage.daysRemaining}d left</span>
      </div>
      <div className="flex items-center gap-1.5 min-w-[180px]">
        <span className="text-[9px] font-semibold text-zinc-500 uppercase">Fast</span>
        <div className="flex-1 h-1.5 bg-zinc-800/50 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${fastPct > 90 ? 'bg-red-500' : fastPct > 70 ? 'bg-amber-500' : 'bg-brand-500'}`}
            style={{ width: `${fastPct}%` }} />
        </div>
        <span className="text-[9px] text-zinc-500 tabular-nums">{fastCount.toLocaleString()}/{usage.wordsLimitFast.toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-1.5 min-w-[180px]">
        <span className="text-[9px] font-semibold text-zinc-500 uppercase">Stealth</span>
        <div className="flex-1 h-1.5 bg-zinc-800/50 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${stealthPct > 90 ? 'bg-red-500' : stealthPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
            style={{ width: `${stealthPct}%` }} />
        </div>
        <span className="text-[9px] text-zinc-500 tabular-nums">{stealthCount.toLocaleString()}/{usage.wordsLimitStealth.toLocaleString()}</span>
      </div>
    </div>
  );
}
