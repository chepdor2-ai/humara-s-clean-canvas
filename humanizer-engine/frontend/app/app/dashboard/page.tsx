'use client';
import { useState, useEffect, useCallback } from 'react';
import { Activity, FileText, BrainCircuit, TrendingUp, Zap, BarChart3, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '../../AuthProvider';

interface Doc {
  id: string;
  title: string;
  engine_used: string;
  output_ai_score: number | null;
  created_at: string;
}

export default function DashboardHome() {
  const { session } = useAuth();
  const [wordsUsed, setWordsUsed] = useState(0);
  const [profileCount, setProfileCount] = useState(0);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docTotal, setDocTotal] = useState(0);
  const [loading, setLoading] = useState(true);

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
    const map: Record<string, string> = { ghost_mini: 'Fast', ghost_pro: 'Standard', ninja: 'Stealth', undetectable: 'Undetectable', humara: 'Humara v1.1', fast_v11: 'Humara 0' };
    return map[e] || e || '—';
  };

  const timeAgo = (date: string) => {
    const d = Date.now() - new Date(date).getTime();
    if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
    if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
    return `${Math.floor(d / 86400000)}d ago`;
  };

  const stats = [
    { label: 'Words Humanized', value: wordsUsed.toLocaleString(), icon: <FileText className="w-5 h-5 text-brand-600" /> },
    { label: 'Avg Human Score', value: avgScore > 0 ? `${avgScore}%` : '—', icon: <TrendingUp className="w-5 h-5 text-emerald-600" /> },
    { label: 'Style Profiles', value: String(profileCount), icon: <BrainCircuit className="w-5 h-5 text-blue-600" /> },
  ];

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto flex items-center justify-center py-20">
        <RotateCcw className="w-6 h-6 text-brand-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">Overview of your writing activity</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-slate-200 dark:border-zinc-800 flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-50 dark:bg-zinc-800 rounded-lg flex items-center justify-center">
              {stat.icon}
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-zinc-400">{stat.label}</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-white mt-0.5">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Link href="/app" className="bg-brand-600 hover:bg-brand-700 p-6 rounded-xl text-white transition-colors">
          <Zap className="w-5 h-5 mb-3" />
          <h3 className="text-sm font-semibold mb-1">Quick Humanize</h3>
          <p className="text-white/70 text-xs">Open the humanizer</p>
        </Link>
        <Link href="/app/style" className="bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 p-6 rounded-xl border border-slate-200 dark:border-zinc-800 transition-colors">
          <BrainCircuit className="w-5 h-5 mb-3 text-brand-600" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Style Profiles</h3>
          <p className="text-slate-500 dark:text-zinc-400 text-xs">Manage writing styles</p>
        </Link>
        <Link href="/app/documents" className="bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 p-6 rounded-xl border border-slate-200 dark:border-zinc-800 transition-colors">
          <BarChart3 className="w-5 h-5 mb-3 text-brand-600" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Documents</h3>
          <p className="text-slate-500 dark:text-zinc-400 text-xs">{docTotal} humanized document{docTotal !== 1 ? 's' : ''}</p>
        </Link>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800">
        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recent Documents</h2>
          <Link href="/app/documents" className="text-brand-600 hover:text-brand-700 text-xs font-medium">View All →</Link>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-zinc-800">
          {docs.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-slate-400 dark:text-zinc-500">No documents yet. Start humanizing!</p>
            </div>
          ) : docs.map(doc => (
            <div key={doc.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
              <div className="flex items-center gap-3">
                <Activity className="w-4 h-4 text-slate-300 dark:text-zinc-600" />
                <div>
                  <h3 className="text-sm font-medium text-slate-800 dark:text-zinc-200">{doc.title || 'Untitled'}</h3>
                  <p className="text-xs text-slate-400">{timeAgo(doc.created_at)} · {engineLabel(doc.engine_used)}</p>
                </div>
              </div>
              {doc.output_ai_score !== null && (
                <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${
                  doc.output_ai_score <= 20 ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                  : doc.output_ai_score <= 50 ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
                  : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'
                }`}>
                  {100 - doc.output_ai_score}% Human
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

