'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../AuthProvider';
import { supabase } from '../../../lib/supabase';
import { Users, CreditCard, FileText, BarChart3, MessageSquare, Shield, Search, RefreshCw, ChevronDown, Cpu, GripVertical, Eye, EyeOff, Crown, Save, AlertCircle, CheckCircle2, Copy, ExternalLink } from 'lucide-react';

/* ── Types ──────────────────────────────────────────────────────────── */
interface AdminStats { totalUsers: number; activeSubscriptions: number; totalDocuments: number; totalFeedback: number; revenueThisMonth: number; }
interface UserRow { id: string; full_name: string; email?: string; plan_name?: string; created_at: string; onboarding_done: boolean; }
interface SubRow { id: string; user_id: string; plan_name: string; status: string; current_period_end: string; }
interface DocRow { id: string; user_id: string; title: string; engine_used: string; input_word_count: number; output_ai_score: number | null; created_at: string; }
interface FeedbackRow { id: string; user_id: string; rating: number; comment: string; category: string; created_at: string; }
interface EngineConfigRow { id: string; engine_id: string; label: string; enabled: boolean; premium: boolean; sort_order: number; updated_at: string; }

type Tab = 'overview' | 'engines' | 'users' | 'subscriptions' | 'documents' | 'feedback';

const ADMIN_EMAILS = ['maguna956@gmail.com', 'maxwellotieno11@gmail.com']; // Admin emails

export default function AdminDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Engine management state
  const [engines, setEngines] = useState<EngineConfigRow[]>([]);
  const [engineDraft, setEngineDraft] = useState<EngineConfigRow[]>([]);
  const [engineSaving, setEngineSaving] = useState(false);
  const [engineMessage, setEngineMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [engineDirty, setEngineDirty] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [engineTableExists, setEngineTableExists] = useState(true);
  const [setupSqlCopied, setSetupSqlCopied] = useState(false);

  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Stats
      const [usersRes, subsRes, docsRes, fbRes, paymentsRes] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('documents').select('*', { count: 'exact', head: true }),
        supabase.from('feedback').select('*', { count: 'exact', head: true }),
        supabase.from('payments').select('amount').eq('status', 'succeeded'),
      ]);

      const revenue = (paymentsRes.data || []).reduce((sum: number, p: { amount: number }) => sum + Number(p.amount), 0);
      setStats({
        totalUsers: usersRes.count || 0,
        activeSubscriptions: subsRes.count || 0,
        totalDocuments: docsRes.count || 0,
        totalFeedback: fbRes.count || 0,
        revenueThisMonth: revenue,
      });

      // Detailed data
      const [uData, sData, dData, fData] = await Promise.all([
        supabase.from('profiles').select('id, full_name, created_at, onboarding_done, plan_id').order('created_at', { ascending: false }).limit(100),
        supabase.from('subscriptions').select('id, user_id, status, current_period_end, plans(display_name)').order('created_at', { ascending: false }).limit(100),
        supabase.from('documents').select('id, user_id, title, engine_used, input_word_count, output_ai_score, created_at').order('created_at', { ascending: false }).limit(100),
        supabase.from('feedback').select('id, user_id, rating, comment, category, created_at').order('created_at', { ascending: false }).limit(100),
      ]);

      setUsers((uData.data || []).map((u: Record<string, unknown>) => ({ ...u, plan_name: '' } as UserRow)));
      setSubs((sData.data || []).map((s: Record<string, unknown>) => ({
        ...s,
        plan_name: (s.plans as Record<string, unknown>)?.display_name || 'Unknown',
      } as SubRow)));
      setDocs((dData.data || []) as DocRow[]);
      setFeedback((fData.data || []) as FeedbackRow[]);
    } catch (err) {
      console.error('Admin fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEngines = useCallback(async () => {
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/admin/engines', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEngineTableExists(data.tableExists !== false);
        const sorted = (data.engines || []).sort((a: EngineConfigRow, b: EngineConfigRow) => a.sort_order - b.sort_order);
        setEngines(sorted);
        setEngineDraft(sorted.map((e: EngineConfigRow) => ({ ...e })));
        setEngineDirty(false);
      }
    } catch (err) {
      console.error('Engine fetch error:', err);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchData();
      fetchEngines();
    }
  }, [isAdmin, fetchData, fetchEngines]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">Access Denied</h2>
          <p className="text-sm text-zinc-500">You do not have admin privileges.</p>
        </div>
      </div>
    );
  }

  /* ── Engine management helpers ── */
  const updateEngineDraft = (idx: number, field: keyof EngineConfigRow, value: unknown) => {
    setEngineDraft(prev => {
      const next = prev.map(e => ({ ...e }));
      (next[idx] as Record<string, unknown>)[field] = value;
      return next;
    });
    setEngineDirty(true);
    setEngineMessage(null);
  };

  const moveEngine = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= engineDraft.length) return;
    setEngineDraft(prev => {
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next.map((e, i) => ({ ...e, sort_order: i + 1 }));
    });
    setEngineDirty(true);
    setEngineMessage(null);
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      moveEngine(dragIdx, idx);
      setDragIdx(idx);
    }
  };
  const handleDragEnd = () => setDragIdx(null);

  const saveEngines = async () => {
    if (!engineTableExists) {
      setEngineMessage({ type: 'error', text: 'Cannot save — the engine_config table does not exist yet. See the setup instructions above.' });
      return;
    }
    const enabledCount = engineDraft.filter(e => e.enabled).length;
    if (enabledCount === 0) {
      setEngineMessage({ type: 'error', text: 'At least one engine must remain enabled.' });
      return;
    }

    setEngineSaving(true);
    setEngineMessage(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const payload = engineDraft.map((e, i) => ({
        engine_id: e.engine_id,
        enabled: e.enabled,
        premium: e.premium,
        sort_order: i + 1,
        label: e.label,
      }));

      const res = await fetch('/api/admin/engines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ engines: payload }),
      });

      if (res.ok) {
        setEngineMessage({ type: 'success', text: 'Engine configuration saved. Changes are live.' });
        setEngineDirty(false);
        await fetchEngines();
      } else {
        const err = await res.json();
        setEngineMessage({ type: 'error', text: err.error || 'Failed to save.' });
      }
    } catch {
      setEngineMessage({ type: 'error', text: 'Network error. Try again.' });
    } finally {
      setEngineSaving(false);
    }
  };

  const resetEngines = () => {
    setEngineDraft(engines.map(e => ({ ...e })));
    setEngineDirty(false);
    setEngineMessage(null);
  };

  const enabledCount = engineDraft.filter(e => e.enabled).length;
  const premiumCount = engineDraft.filter(e => e.enabled && e.premium).length;
  const freeCount = engineDraft.filter(e => e.enabled && !e.premium).length;

  const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'engines', label: 'Engines', icon: Cpu },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'feedback', label: 'Feedback', icon: MessageSquare },
  ];

  return (
    <div className="animate-in fade-in duration-500">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Admin Dashboard</h1>
          <p className="text-[13px] text-zinc-500">Manage users, subscriptions, and platform data</p>
        </div>
        <button onClick={fetchData} disabled={loading} className="text-xs font-medium text-zinc-400 hover:text-white px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-1.5 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
              tab === t.id ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-white'
            }`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Total Users', val: stats.totalUsers, icon: Users, color: 'text-purple-400' },
            { label: 'Active Subs', val: stats.activeSubscriptions, icon: CreditCard, color: 'text-emerald-400' },
            { label: 'Documents', val: stats.totalDocuments, icon: FileText, color: 'text-cyan-400' },
            { label: 'Feedback', val: stats.totalFeedback, icon: MessageSquare, color: 'text-amber-400' },
            { label: 'Revenue', val: `$${stats.revenueThisMonth.toFixed(0)}`, icon: BarChart3, color: 'text-purple-400' },
          ].map(s => (
            <div key={s.label} className="bg-[#0c0c14] border border-zinc-800/60 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{s.label}</span>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <p className="text-2xl font-bold text-white">{s.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Engines Management Tab ────────────────────────────────── */}
      {tab === 'engines' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#0c0c14] border border-zinc-800/60 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Enabled</span>
                <Eye className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-white">{enabledCount} <span className="text-sm font-normal text-zinc-500">/ {engineDraft.length}</span></p>
            </div>
            <div className="bg-[#0c0c14] border border-zinc-800/60 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Free Tier</span>
                <Cpu className="w-4 h-4 text-purple-400" />
              </div>
              <p className="text-2xl font-bold text-white">{freeCount}</p>
            </div>
            <div className="bg-[#0c0c14] border border-zinc-800/60 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Premium</span>
                <Crown className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-2xl font-bold text-white">{premiumCount}</p>
            </div>
          </div>

          {/* Database setup banner when engine_config table doesn't exist */}
          {!engineTableExists && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1 space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-amber-800 dark:text-amber-200">Database Setup Required</h3>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                      The <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-[11px]">engine_config</code> table doesn&apos;t exist in your Supabase database yet. 
                      The engines below are showing hardcoded defaults &mdash; changes won&apos;t persist until the table is created.
                    </p>
                  </div>
                  <details className="group">
                    <summary className="cursor-pointer text-xs font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 select-none">
                      Show setup SQL &darr;
                    </summary>
                    <pre className="mt-2 bg-zinc-950 text-green-300 text-[11px] leading-relaxed rounded-lg p-4 overflow-x-auto max-h-64 overflow-y-auto font-mono">{`CREATE TABLE IF NOT EXISTS public.engine_config (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  engine_id   TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  premium     BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.engine_config (engine_id, label, enabled, premium, sort_order) VALUES
  ('oxygen','Humara 2.0',true,false,1),
  ('ozone','Humara 2.1',true,false,2),
  ('easy','Humara 2.2',true,false,3)
ON CONFLICT (engine_id) DO NOTHING;

ALTER TABLE public.engine_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read engine_config"
  ON public.engine_config FOR SELECT USING (true);

CREATE POLICY "Service role can manage engine_config"
  ON public.engine_config FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');`}</pre>
                  </details>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        const sql = `CREATE TABLE IF NOT EXISTS public.engine_config (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  engine_id TEXT NOT NULL UNIQUE,\n  label TEXT NOT NULL,\n  enabled BOOLEAN NOT NULL DEFAULT TRUE,\n  premium BOOLEAN NOT NULL DEFAULT FALSE,\n  sort_order INTEGER NOT NULL DEFAULT 0,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\nINSERT INTO public.engine_config (engine_id, label, enabled, premium, sort_order) VALUES\n  ('oxygen','Humara 2.0',true,false,1),('ozone','Humara 2.1',true,false,2),('easy','Humara 2.2',true,false,3)\nON CONFLICT (engine_id) DO NOTHING;\n\nALTER TABLE public.engine_config ENABLE ROW LEVEL SECURITY;\n\nCREATE POLICY "Anyone can read engine_config" ON public.engine_config FOR SELECT USING (true);\n\nCREATE POLICY "Service role can manage engine_config" ON public.engine_config FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');`;
                        navigator.clipboard.writeText(sql);
                        setSetupSqlCopied(true);
                        setTimeout(() => setSetupSqlCopied(false), 2000);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
                    >
                      {setupSqlCopied ? <><CheckCircle2 className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy SQL</>}
                    </button>
                    <a
                      href="https://supabase.com/dashboard/project/lqkpjghjermvxzgkocne/sql/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open SQL Editor
                    </a>
                    <button
                      onClick={fetchEngines}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Verify Setup
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Status message */}
          {engineMessage && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
              engineMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
            }`}>
              {engineMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              {engineMessage.text}
            </div>
          )}

          {/* Engine list */}
          <div className="bg-[#0c0c14] border border-zinc-800/60 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Engine Configuration</h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">Drag to reorder. Toggle visibility and tier. Changes apply to all users immediately.</p>
              </div>
              <div className="flex items-center gap-2">
                {engineDirty && (
                  <button onClick={resetEngines} className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors">
                    Reset
                  </button>
                )}
                <button
                  onClick={saveEngines}
                  disabled={!engineDirty || engineSaving}
                  className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    engineDirty
                      ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm'
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  {engineSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  {engineSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-[32px_1fr_80px_80px_80px_80px] gap-2 px-4 py-2 border-b border-zinc-800/50 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              <div></div>
              <div>Engine</div>
              <div className="text-center">Visible</div>
              <div className="text-center">Tier</div>
              <div className="text-center">Order</div>
              <div className="text-center">Status</div>
            </div>

            {/* Engine rows */}
            {engineDraft.map((eng, idx) => (
              <div
                key={eng.engine_id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className={`grid grid-cols-[32px_1fr_80px_80px_80px_80px] gap-2 px-4 py-3 items-center border-b border-zinc-800/30 last:border-b-0 transition-colors ${
                  dragIdx === idx ? 'bg-purple-950/20' : 'hover:bg-zinc-800/50'
                } ${!eng.enabled ? 'opacity-50' : ''}`}
              >
                {/* Drag handle */}
                <div className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400">
                  <GripVertical className="w-4 h-4" />
                </div>

                {/* Engine name */}
                <div className="flex items-center gap-2">
                  <input
                    value={eng.label}
                    onChange={(e) => updateEngineDraft(idx, 'label', e.target.value)}
                    className="text-sm font-semibold text-white bg-transparent border-b border-transparent hover:border-zinc-600 focus:border-purple-400 outline-none transition-colors py-0.5 w-full max-w-[180px]"
                  />
                  <span className="text-[10px] font-mono text-zinc-500">{eng.engine_id}</span>
                </div>

                {/* Enabled toggle */}
                <div className="flex justify-center">
                  <button
                    onClick={() => updateEngineDraft(idx, 'enabled', !eng.enabled)}
                    title={eng.enabled ? 'Visible to users' : 'Hidden from users'}
                    className={`p-1.5 rounded-lg transition-colors ${
                      eng.enabled
                        ? 'text-emerald-400 bg-emerald-950/30 hover:bg-emerald-900/40'
                        : 'text-zinc-500 bg-zinc-800 hover:bg-zinc-700'
                    }`}
                  >
                    {eng.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>

                {/* Premium toggle */}
                <div className="flex justify-center">
                  <button
                    onClick={() => updateEngineDraft(idx, 'premium', !eng.premium)}
                    title={eng.premium ? 'Premium tier' : 'Free tier'}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                      eng.premium
                        ? 'bg-amber-900/30 text-amber-400 hover:bg-amber-900/50'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {eng.premium ? 'Pro' : 'Free'}
                  </button>
                </div>

                {/* Sort order */}
                <div className="flex justify-center items-center gap-1">
                  <button onClick={() => moveEngine(idx, idx - 1)} disabled={idx === 0}
                    className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed p-0.5">
                    <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                  </button>
                  <span className="text-xs font-mono text-zinc-500 w-5 text-center">{idx + 1}</span>
                  <button onClick={() => moveEngine(idx, idx + 1)} disabled={idx === engineDraft.length - 1}
                    className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed p-0.5">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Live status */}
                <div className="flex justify-center">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    eng.enabled
                      ? 'bg-emerald-950/40 text-emerald-400'
                      : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {eng.enabled ? 'Live' : 'Off'}
                  </span>
                </div>
              </div>
            ))}

            {engineDraft.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-zinc-500">
                No engine configuration found. Run the Supabase migration to seed engine_config table.
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setEngineDraft(prev => prev.map(e => ({ ...e, enabled: true })));
                setEngineDirty(true);
                setEngineMessage(null);
              }}
              className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
            >
              Enable All
            </button>
            <button
              onClick={() => {
                setEngineDraft(prev => prev.map(e => ({ ...e, premium: false })));
                setEngineDirty(true);
                setEngineMessage(null);
              }}
              className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
            >
              All Free Tier
            </button>
            <button
              onClick={() => {
                setEngineDraft(prev => prev.map(e => ({ ...e, premium: true })));
                setEngineDirty(true);
                setEngineMessage(null);
              }}
              className="px-3 py-1.5 text-xs font-medium text-amber-400 bg-amber-950/30 rounded-lg hover:bg-amber-900/30 transition-colors"
            >
              All Premium
            </button>
          </div>
        </div>
      )}

      {/* Users tab */}
      {tab === 'users' && (
        <div className="bg-[#0c0c14] border border-zinc-800/60 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center gap-3">
            <Search className="w-4 h-4 text-zinc-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…"
              className="flex-1 text-sm bg-transparent outline-none text-zinc-200 placeholder-zinc-600" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800/50 text-left">
                  <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">ID</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">Onboarded</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.filter(u => !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.id.includes(search)).map(u => (
                  <tr key={u.id} className="border-b border-zinc-800/30 last:border-b-0 hover:bg-zinc-800/50">
                    <td className="px-4 py-3 font-medium text-white">{u.full_name || 'Unnamed'}</td>
                    <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{u.id.slice(0, 8)}…</td>
                    <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.onboarding_done ? 'bg-emerald-950/40 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>{u.onboarding_done ? 'Yes' : 'No'}</span></td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subscriptions tab */}
      {tab === 'subscriptions' && (
        <div className="bg-[#0c0c14] border border-zinc-800/60 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800/50 text-left">
                  <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">User ID</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">Plan</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">Expires</th>
                </tr>
              </thead>
              <tbody>
                {subs.map(s => (
                  <tr key={s.id} className="border-b border-zinc-800/30 last:border-b-0 hover:bg-zinc-800/50">
                    <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{s.user_id.slice(0, 8)}…</td>
                    <td className="px-4 py-3 font-medium text-white">{s.plan_name}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-emerald-950/40 text-emerald-400' : 'bg-red-950/40 text-red-400'}`}>{s.status}</span></td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">{new Date(s.current_period_end).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Documents tab */}
      {tab === 'documents' && (
        <div className="bg-[#0c0c14] border border-zinc-800/60 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800/50 text-left">
                  <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">Title</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">Engine</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">Words</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">AI Score</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id} className="border-b border-zinc-800/30 last:border-b-0 hover:bg-zinc-800/50">
                    <td className="px-4 py-3 font-medium text-white truncate max-w-[200px]">{d.title}</td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">{d.engine_used || '—'}</td>
                    <td className="px-4 py-3 text-zinc-400 tabular-nums">{d.input_word_count}</td>
                    <td className="px-4 py-3">{d.output_ai_score !== null ? <span className={`text-xs font-bold ${d.output_ai_score <= 20 ? 'text-emerald-400' : 'text-red-400'}`}>{Math.round(d.output_ai_score)}%</span> : '—'}</td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">{new Date(d.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Feedback tab */}
      {tab === 'feedback' && (
        <div className="space-y-3">
          {feedback.map(f => (
            <div key={f.id} className="bg-[#0c0c14] border border-zinc-800/60 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <div key={s} className={`w-3 h-3 rounded-full ${s <= (f.rating || 0) ? 'bg-amber-400' : 'bg-zinc-800'}`} />
                    ))}
                  </div>
                  <span className="text-xs font-medium text-zinc-500 uppercase">{f.category || 'General'}</span>
                </div>
                <span className="text-xs text-zinc-500">{new Date(f.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">{f.comment || 'No comment'}</p>
            </div>
          ))}
          {feedback.length === 0 && <p className="text-center text-sm text-zinc-500 py-8">No feedback yet</p>}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 text-purple-500 animate-spin" />
        </div>
      )}
    </div>
  );
}
