'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../AuthProvider';
import { supabase } from '../../lib/supabase';

interface UsageData {
  wordsUsed: number;
  wordsLimit: number;
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
  const { user, session } = useAuth();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      // Prefer server API (service-role) to avoid RLS/RPC privilege issues.
      // Fallback to direct RPC if the API isn't available.
      let data: any = null;
      let error: { message?: string } | null = null;

      if (session?.access_token) {
        const res = await fetch('/api/usage', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          data = await res.json();
        } else {
          // Continue to RPC fallback
          error = { message: `API status ${res.status}` };
        }
      }

      if (!data) {
        const rpc = await supabase.rpc('get_usage_stats', { p_user_id: user.id });
        data = rpc.data;
        error = rpc.error as any;
      }

      if (!error && data) {
        // Combine fast + stealth into single word count
        const totalUsed = (data.words_used_fast || 0) + (data.words_used_stealth || 0);
        const rawLimit = (data.words_limit_fast || 0) + (data.words_limit_stealth || 0);
        const planName = String(data.plan_name || 'Free');
        const isFree = planName.trim().toLowerCase() === 'free';
        const totalLimit = rawLimit > 0 ? rawLimit : (isFree ? 1000 : 0);
        setUsage({
          wordsUsed: totalUsed,
          wordsLimit: totalLimit,
          daysRemaining: data.days_remaining || 0,
          planName,
        });
      } else {
        // RPC failed or not deployed — show free tier defaults so bar is always visible
        console.warn('Usage RPC unavailable, using free defaults:', error?.message);
        setUsage(prev => prev ?? { wordsUsed: 0, wordsLimit: 1000, daysRemaining: 0, planName: 'Free' });
      }
    } catch (err) {
      console.error('Usage fetch error:', err);
      // Ensure bar always shows even on network / RPC errors
      setUsage(prev => prev ?? { wordsUsed: 0, wordsLimit: 1000, daysRemaining: 0, planName: 'Free' });
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, user]);

  useEffect(() => { 
    if (!user) {
      // No user yet — show free defaults, stop loading
      setUsage({ wordsUsed: 0, wordsLimit: 1000, daysRemaining: 0, planName: 'Free' });
      setLoading(false);
      return;
    }
    refresh(); 
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh, user]);

  return { usage, loading, refresh };
}

export default function UsageBar() {
  const { usage, loading } = useUsage();
  const wordsCount = useCountUp(usage?.wordsUsed || 0, 800);

  if (loading || !usage) return null;

  const pct = usage.wordsLimit > 0 ? Math.min(100, (usage.wordsUsed / usage.wordsLimit) * 100) : 0;
  const barColor = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-brand-500';

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-extrabold text-brand-400 bg-brand-950/30 px-2.5 py-1 rounded-lg border border-brand-800/40">{usage.planName}</span>
        {usage.daysRemaining > 0 && <span className="text-[10px] text-zinc-500">{usage.daysRemaining}d left</span>}
      </div>
      <div className="flex items-center gap-1.5 min-w-[200px]">
        <span className="text-[9px] font-semibold text-zinc-500 uppercase">Words</span>
        <div className="flex-1 h-1.5 bg-zinc-800/50 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[9px] text-zinc-500 tabular-nums">{wordsCount.toLocaleString()}/{usage.wordsLimit.toLocaleString()}</span>
      </div>
    </div>
  );
}
