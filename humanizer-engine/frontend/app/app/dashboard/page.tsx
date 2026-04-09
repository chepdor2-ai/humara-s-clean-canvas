'use client';
import { useState, useEffect, useCallback } from 'react';
import { Activity, FileText, BrainCircuit, TrendingUp, Zap, BarChart3, Crown, Sparkles, Clock, ChevronRight, Shield } from 'lucide-react';
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
  const [profileCount, setProfileCount] = useState(0);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docTotal, setDocTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const planName = usage?.planName || 'Free';

  const headers = useCallback((): HeadersInit => {
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) return;
    const load = async () => {
      setLoading(true);
      try {
        const [profilesRes, docsRes] = await Promise.all([
          fetch('/api/style-profiles', { headers: headers() }).then(r => r.json()).catch(() => null),
          fetch('/api/documents?page=1&limit=5', { headers: headers() }).then(r => r.json()).catch(() => null),
        ]);
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
    const map: Record<string, string> = { oxygen: 'Humara 2.0', ozone: 'Humara 2.1', easy: 'Humara 2.2' };
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
      <div className="flex items-center justify-center py-24">
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

  // Unified word usage
  const wordsUsed = usage?.wordsUsed || 0;
  const wordsLimit = usage?.wordsLimit || 1000;
  const wordsPct = wordsLimit > 0 ? Math.min(100, (wordsUsed / wordsLimit) * 100) : 0;

  return (
    <div className="space-y-6 relative z-10">

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
            {greeting}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Your writing activity overview</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#12121a] border border-zinc-800/60 text-xs font-medium text-zinc-300">
            <Crown className="w-3.5 h-3.5 text-purple-400" />
            {planName}
          </div>
          <Link href="/app" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors">
            <Zap className="w-3.5 h-3.5" /> Humanize
          </Link>
        </div>
      </header>

      {/* Stats + Usage Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Word Usage — large card spanning 2 cols on lg */}
        <div className="col-span-2 lg:col-span-2 bg-[#0c0c14] border border-purple-500/10 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-semibold text-white">Word Usage</h2>
            </div>
            <span className="text-[11px] text-zinc-500 font-medium tabular-nums">
              {usage?.daysRemaining ? `${usage.daysRemaining}d left` : 'Daily'}
            </span>
          </div>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-white tabular-nums">{wordsUsed.toLocaleString()}</span>
              <span className="text-xs text-zinc-500">/ {wordsLimit.toLocaleString()} words</span>
            </div>
            <div className="h-2.5 bg-zinc-800/80 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${wordsPct > 90 ? 'bg-red-500' : wordsPct > 70 ? 'bg-amber-500' : 'bg-purple-500'}`}
                style={{ width: `${wordsPct}%` }} />
            </div>
            <p className="text-[11px] text-zinc-600">{Math.max(0, wordsLimit - wordsUsed).toLocaleString()} words remaining today</p>
          </div>
        </div>

        {/* Stat cards */}
        {[
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

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Link href="/app" className="group bg-[#0c0c14] border border-zinc-800/60 rounded-xl p-4 hover:border-purple-500/20 transition-colors">
          <Zap className="w-5 h-5 text-purple-400 mb-2" />
          <h3 className="text-sm font-semibold text-white">Humanize</h3>
          <p className="text-[11px] text-zinc-500">Transform AI text</p>
        </Link>
        <Link href="/app/detector" className="group bg-[#0c0c14] border border-zinc-800/60 rounded-xl p-4 hover:border-emerald-500/20 transition-colors">
          <TrendingUp className="w-5 h-5 text-emerald-400 mb-2" />
          <h3 className="text-sm font-semibold text-white">AI Check</h3>
          <p className="text-[11px] text-zinc-500">Detect AI content</p>
        </Link>
        <Link href="/app/style" className="group bg-[#0c0c14] border border-zinc-800/60 rounded-xl p-4 hover:border-violet-500/20 transition-colors">
          <BrainCircuit className="w-5 h-5 text-violet-400 mb-2" />
          <h3 className="text-sm font-semibold text-white">Styles</h3>
          <p className="text-[11px] text-zinc-500">Writing profiles</p>
        </Link>
        <Link href="/app/documents" className="group bg-[#0c0c14] border border-zinc-800/60 rounded-xl p-4 hover:border-cyan-500/20 transition-colors">
          <BarChart3 className="w-5 h-5 text-cyan-400 mb-2" />
          <h3 className="text-sm font-semibold text-white">Documents</h3>
          <p className="text-[11px] text-zinc-500">{docTotal} saved</p>
        </Link>
      </div>

      {/* Recent Documents */}
      <div className="bg-[#0c0c14] border border-zinc-800/60 rounded-xl overflow-hidden">
        <div className="flex justify-between items-center px-5 py-3.5 border-b border-zinc-800/50">
          <h2 className="text-sm font-semibold text-white">Recent Documents</h2>
          <Link href="/app/documents" className="text-purple-400 hover:text-purple-300 text-xs font-medium flex items-center gap-1 transition-colors">
            View All <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {docs.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <FileText className="w-7 h-7 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm font-medium text-zinc-400">No documents yet</p>
            <p className="text-xs text-zinc-600 mt-1">Start humanizing to see results here</p>
          </div>
        ) : (
          <div>
            {docs.map((doc, idx) => (
              <div key={doc.id} className={`flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors ${idx < docs.length - 1 ? 'border-b border-zinc-800/30' : ''}`}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-lg bg-zinc-800/50 flex items-center justify-center shrink-0">
                    <Activity className="w-3 h-3 text-zinc-500" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-zinc-200 truncate">{doc.title || 'Untitled'}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-2.5 h-2.5 text-zinc-600" />
                      <span className="text-[10px] text-zinc-500">{timeAgo(doc.created_at)}</span>
                      <span className="text-zinc-700">·</span>
                      <span className="text-[10px] text-zinc-500">{engineLabel(doc.engine_used)}</span>
                    </div>
                  </div>
                </div>
                {doc.output_ai_score !== null && (
                  <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded tabular-nums ${
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
