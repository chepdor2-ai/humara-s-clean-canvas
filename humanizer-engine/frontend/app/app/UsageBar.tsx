'use client';
import { useState, useEffect, useCallback } from 'react';
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

  useEffect(() => { refresh(); }, [refresh]);

  return { usage, loading, refresh };
}

export default function UsageBar() {
  const { usage, loading } = useUsage();

  if (loading || !usage) return null;

  const fastPct = usage.wordsLimitFast > 0 ? Math.min(100, (usage.wordsUsedFast / usage.wordsLimitFast) * 100) : 0;
  const stealthPct = usage.wordsLimitStealth > 0 ? Math.min(100, (usage.wordsUsedStealth / usage.wordsLimitStealth) * 100) : 0;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Daily Usage</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-brand-600 dark:text-brand-400">{usage.planName}</span>
          <span className="text-[10px] text-slate-400">{usage.daysRemaining}d left</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-500">Fast & Standard</span>
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">
              {usage.wordsUsedFast.toLocaleString()}/{usage.wordsLimitFast.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${fastPct > 90 ? 'bg-red-500' : fastPct > 70 ? 'bg-amber-500' : 'bg-brand-500'}`}
              style={{ width: `${fastPct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-500">Stealth</span>
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">
              {usage.wordsUsedStealth.toLocaleString()}/{usage.wordsLimitStealth.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${stealthPct > 90 ? 'bg-red-500' : stealthPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${stealthPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
