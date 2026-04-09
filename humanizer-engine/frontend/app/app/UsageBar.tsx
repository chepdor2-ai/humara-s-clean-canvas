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
    <div 
      className="glass-card rounded-2xl px-6 py-5 plan-glow"
      style={{ '--plan-color': planColor } as React.CSSProperties}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Current Package</span>
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-extrabold text-brand-400 bg-brand-950/30 px-3.5 py-1.5 rounded-lg border border-brand-800/40">{usage.planName}</span>
            <span className="text-[10px] text-zinc-400 bg-zinc-800/50 px-2.5 py-1 rounded-full">{usage.daysRemaining}d remaining</span>
            <span className="text-[9px] text-zinc-500 bg-zinc-900/50 px-2 py-0.5 rounded-full border border-zinc-800/40">Humara 2.0, 2.1, 2.2</span>
          </div>
        </div>
        <div className="text-[10px] text-zinc-500 font-medium">Real-time usage tracking</div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">Fast & Standard</span>
            <span className="text-[11px] font-bold text-zinc-300 tabular-nums">
              {fastCount.toLocaleString()}<span className="text-zinc-600">/{usage.wordsLimitFast.toLocaleString()}</span>
            </span>
          </div>
          <div className="h-2.5 bg-zinc-800/50 rounded-full overflow-hidden ring-1 ring-zinc-700/30">
            <div className={`h-full rounded-full transition-all duration-700 ease-out relative usage-shimmer ${fastPct > 90 ? 'bg-red-500' : fastPct > 70 ? 'bg-amber-500' : 'bg-brand-500'}`}
              style={{ width: `${fastPct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">Stealth Premium</span>
            <span className="text-[11px] font-bold text-zinc-300 tabular-nums">
              {stealthCount.toLocaleString()}<span className="text-zinc-600">/{usage.wordsLimitStealth.toLocaleString()}</span>
            </span>
          </div>
          <div className="h-2.5 bg-zinc-800/50 rounded-full overflow-hidden ring-1 ring-zinc-700/30">
            <div className={`h-full rounded-full transition-all duration-700 ease-out relative usage-shimmer ${stealthPct > 90 ? 'bg-red-500' : stealthPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${stealthPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
