'use client';
import { useState, useEffect, useCallback } from 'react';
import { Activity, FileText, BrainCircuit, TrendingUp, Zap, BarChart3, Crown, Sparkles, ArrowUpRight, Clock, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '../../AuthProvider';
import { useUsage } from '../UsageBar';

interface Doc {
  id: string;
  title: string;
  engine_used: string;
  output_ai_score: number | null;
  created_at: string;
}

export default function DashboardHome() {
  const { session, user } = useAuth();
  const { usage } = useUsage();
  const [wordsUsed, setWordsUsed] = useState(0);
  const [profileCount, setProfileCount] = useState(0);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docTotal, setDocTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const planName = usage?.planName || 'Starter';

  const headers = useCallback((): HeadersInit => {
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) return;

    const load = async () => {
      setLoading(true);
      try {
        const [usageRes, profilesRes, docsRes] = await Promise.all([
          fetch('/api/usage', { headers: headers() }).then(r => r.json()).catch(() => null),
          fetch('/api/style-profiles', { headers: headers() }).then(r => r.json()).catch(() => null),
          fetch('/api/documents?page=1&limit=5', { headers: headers() }).then(r => r.json()).catch(() => null),
        ]);

        if (usageRes) {
          const total = (usageRes.words_used_fast || 0) + (usageRes.words_used_stealth || 0);
          setWordsUsed(total);
        }
        if (profilesRes?.profiles) setProfileCount(profilesRes.profiles.length);
        if (docsRes) {
          setDocs(docsRes.documents || []);
          setDocTotal(docsRes.total || 0);
        }
      } catch {}
      setLoading(false);
    };

    load();
  }, [session?.access_token, headers]);

  const avgScore = docs.length > 0
    ? Math.round(docs.filter(d => d.output_ai_score !== null).reduce((s, d) => s + (100 - (d.output_ai_score || 0)), 0) / Math.max(1, docs.filter(d => d.output_ai_score !== null).length))
    : 0;

  const engineLabel = (e: string) => {
    const map: Record<string, string> = { ghost_mini: 'Fast', ghost_pro: 'Standard', ninja: 'Stealth', undetectable: 'Undetectable', humara: 'Humara v1.1', fast_v11: 'Fast v1.1', oxygen: 'Humara 2.0', ozone: 'Humara 2.1', easy: 'Humara 2.2' };
    return map[e] || e || '—';
  };

  const timeAgo = (date: string) => {
    const d = Date.now() - new Date(date).getTime();
    if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
    if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
    return `${Math.floor(d / 86400000)}d ago`;
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-zinc-700 border-t-purple-500 animate-spin" />
          <span className="text-sm text-zinc-500">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || '';

  return (
    <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8 relative z-10">

      {/* ─── Header ─── */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
            {greeting}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm text-zinc-500 mt-1.5">Here&apos;s your writing activity overview</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#12121a] border border-zinc-800/60 text-xs font-medium text-zinc-300">
            <Crown className="w-3.5 h-3.5 text-purple-400" />
            {planName} Plan
          </div>
          <Link
            href="/app"
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            Humanize
          </Link>
        </div>
      </header>

      {/* ─── Stats Grid ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Words Humanized', value: wordsUsed.toLocaleString(), icon: FileText, color: 'text-purple-400', border: 'border-purple-500/10' },
          { label: 'Human Score', value: avgScore > 0 ? `${avgScore}%` : '—', icon: TrendingUp, color: 'text-emerald-400', border: 'border-emerald-500/10' },
          { label: 'Style Profiles', value: String(profileCount), icon: BrainCircuit, color: 'text-violet-400', border: 'border-violet-500/10' },
          { label: 'Documents', value: String(docTotal), icon: BarChart3, color: 'text-cyan-400', border: 'border-cyan-500/10' },
        ].map((stat, i) => (
          <div key={i} className={`bg-[#0c0c14] border ${stat.border} rounded-xl p-4 sm:p-5`}>
            <div className="flex items-center justify-between mb-3">
              <stat.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.color}`} />
              <Sparkles className="w-3 h-3 text-zinc-700" />
            </div>
            <p className="text-xl sm:text-2xl font-semibold text-white tabular-nums">{stat.value}</p>
            <p className="text-[11px] text-zinc-500 mt-1 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* ─── Two-column: Usage + Quick Actions ─── */}
      <div className="grid lg:grid-cols-5 gap-3 sm:gap-4">

        {/* Usage — spans 3 cols */}
        {usage && (
          <div className="lg:col-span-3 bg-[#0c0c14] border border-zinc-800/60 rounded-xl p-5 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-white">Today&apos;s Usage</h2>
              <span className="text-[11px] text-zinc-500 font-medium">
                {usage.daysRemaining}d remaining in cycle
              </span>
            </div>
            <div className="space-y-5">
              {[
                { label: 'Fast & Standard', used: usage.wordsUsedFast, limit: usage.wordsLimitFast, color: '#a855f7' },
                { label: 'Stealth', used: usage.wordsUsedStealth, limit: usage.wordsLimitStealth, color: '#10b981' },
              ].map((bar) => {
                const pct = bar.limit > 0 ? Math.min(100, (bar.used / bar.limit) * 100) : 0;
                const barColor = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : bar.color;
                return (
                  <div key={bar.label}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-zinc-400">{bar.label}</span>
                      <span className="text-xs text-zinc-300 tabular-nums font-medium">
                        {bar.used.toLocaleString()} <span className="text-zinc-600">/ {bar.limit.toLocaleString()}</span>
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-800/80 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${pct}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Actions — spans 2 cols */}
        <div className="lg:col-span-2 grid grid-cols-2 gap-3 sm:gap-4">
          <Link href="/app" className="group bg-[#0c0c14] border border-zinc-800/60 rounded-xl p-4 sm:p-5 hover:border-purple-500/20 transition-colors">
            <Zap className="w-5 h-5 text-purple-400 mb-3" />
            <h3 className="text-sm font-semibold text-white mb-0.5">Humanize</h3>
            <p className="text-[11px] text-zinc-500">Transform AI text</p>
          </Link>
          <Link href="/app/detector" className="group bg-[#0c0c14] border border-zinc-800/60 rounded-xl p-4 sm:p-5 hover:border-emerald-500/20 transition-colors">
            <TrendingUp className="w-5 h-5 text-emerald-400 mb-3" />
            <h3 className="text-sm font-semibold text-white mb-0.5">AI Check</h3>
            <p className="text-[11px] text-zinc-500">Detect AI content</p>
          </Link>
          <Link href="/app/style" className="group bg-[#0c0c14] border border-zinc-800/60 rounded-xl p-4 sm:p-5 hover:border-violet-500/20 transition-colors">
            <BrainCircuit className="w-5 h-5 text-violet-400 mb-3" />
            <h3 className="text-sm font-semibold text-white mb-0.5">Styles</h3>
            <p className="text-[11px] text-zinc-500">Writing profiles</p>
          </Link>
          <Link href="/app/documents" className="group bg-[#0c0c14] border border-zinc-800/60 rounded-xl p-4 sm:p-5 hover:border-cyan-500/20 transition-colors">
            <BarChart3 className="w-5 h-5 text-cyan-400 mb-3" />
            <h3 className="text-sm font-semibold text-white mb-0.5">Documents</h3>
            <p className="text-[11px] text-zinc-500">{docTotal} saved</p>
          </Link>
        </div>
      </div>

      {/* ─── Recent Documents ─── */}
      <div className="bg-[#0c0c14] border border-zinc-800/60 rounded-xl overflow-hidden">
        <div className="flex justify-between items-center px-5 sm:px-6 py-4 border-b border-zinc-800/50">
          <h2 className="text-sm font-semibold text-white">Recent Documents</h2>
          <Link href="/app/documents" className="text-purple-400 hover:text-purple-300 text-xs font-medium flex items-center gap-1 transition-colors">
            View All <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {docs.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <FileText className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm font-medium text-zinc-400">No documents yet</p>
            <p className="text-xs text-zinc-600 mt-1">Start humanizing to see results here</p>
          </div>
        ) : (
          <div>
            {docs.map((doc, idx) => (
              <div key={doc.id} className={`flex items-center justify-between px-5 sm:px-6 py-3.5 hover:bg-white/[0.02] transition-colors ${idx < docs.length - 1 ? 'border-b border-zinc-800/30' : ''}`}>
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800/50 flex items-center justify-center shrink-0">
                    <Activity className="w-3.5 h-3.5 text-zinc-500" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-zinc-200 truncate">{doc.title || 'Untitled'}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Clock className="w-3 h-3 text-zinc-600" />
                      <span className="text-[11px] text-zinc-500">{timeAgo(doc.created_at)}</span>
                      <span className="text-zinc-700">·</span>
                      <span className="text-[11px] text-zinc-500">{engineLabel(doc.engine_used)}</span>
                    </div>
                  </div>
                </div>
                {doc.output_ai_score !== null && (
                  <span className={`inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-md tabular-nums ${
                    doc.output_ai_score <= 20 ? 'bg-emerald-500/10 text-emerald-400'
                    : doc.output_ai_score <= 50 ? 'bg-amber-500/10 text-amber-400'
                    : 'bg-red-500/10 text-red-400'
                  }`}>
                    {100 - doc.output_ai_score}% Human
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

