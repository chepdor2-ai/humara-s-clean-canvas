'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../AuthProvider';
import { supabase } from '../../../lib/supabase';
import { Users, CreditCard, FileText, BarChart3, MessageSquare, Shield, Search, RefreshCw, ChevronDown, Cpu, GripVertical, Eye, EyeOff, Crown, Save, AlertCircle, CheckCircle2, Copy, ExternalLink, Ban, UserCheck, Clock, Edit3, X, ChevronLeft, ChevronRight } from 'lucide-react';

/* â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface AdminStats { totalUsers: number; activeSubscriptions: number; totalDocuments: number; totalFeedback: number; revenueThisMonth: number; suspendedUsers: number; }
interface UserRow {
  id: string;
  full_name: string;
  email?: string;
  plan_id?: string;
  created_at: string;
  onboarding_done: boolean;
  plans?: { id: string; name: string; display_name: string; price_monthly: number; daily_words_fast: number; daily_words_stealth: number };
  subscriptions?: { id: string; status: string; plan_name: string; current_period_start: string; current_period_end: string }[];
}
interface SubRow { id: string; user_id: string; plan_name: string; status: string; current_period_end: string; }
interface DocRow { id: string; user_id: string; title: string; engine_used: string; input_word_count: number; output_ai_score: number | null; created_at: string; }
interface FeedbackRow { id: string; user_id: string; rating: number; comment: string; category: string; created_at: string; }
interface EngineConfigRow { id: string; engine_id: string; label: string; enabled: boolean; premium: boolean; sort_order: number; updated_at: string; }

type Tab = 'overview' | 'engines' | 'users' | 'subscriptions' | 'documents' | 'feedback';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'maguna956@gmail.com,maxwellotieno11@gmail.com').split(',').map(e => e.trim());

const AVAILABLE_PLANS = ['free', 'starter', 'creator', 'professional', 'business'];

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

  // User management modal state
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<string>('');
  const [modalPlan, setModalPlan] = useState('starter');
  const [modalDays, setModalDays] = useState(30);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalMessage, setModalMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Pagination
  const [userPage, setUserPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const usersPerPage = 20;

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

  const getAuthToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, subsRes, docsRes, fbRes, paymentsRes, suspendedRes] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('documents').select('*', { count: 'exact', head: true }),
        supabase.from('feedback').select('*', { count: 'exact', head: true }),
        supabase.from('payments').select('amount').eq('status', 'succeeded'),
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'suspended'),
      ]);

      const revenue = (paymentsRes.data || []).reduce((sum: number, p: { amount: number }) => sum + Number(p.amount), 0);
      setStats({
        totalUsers: usersRes.count || 0,
        activeSubscriptions: subsRes.count || 0,
        totalDocuments: docsRes.count || 0,
        totalFeedback: fbRes.count || 0,
        revenueThisMonth: revenue,
        suspendedUsers: suspendedRes.count || 0,
      });

      const [sData, dData, fData] = await Promise.all([
        supabase.from('subscriptions').select('id, user_id, status, current_period_end, plans(display_name)').order('created_at', { ascending: false }).limit(100),
        supabase.from('documents').select('id, user_id, title, engine_used, input_word_count, output_ai_score, created_at').order('created_at', { ascending: false }).limit(100),
        supabase.from('feedback').select('id, user_id, rating, comment, category, created_at').order('created_at', { ascending: false }).limit(100),
      ]);

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

  // Fetch users with pagination using the admin API
  const fetchUsers = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/admin/users?page=${userPage}&limit=${usersPerPage}&search=${encodeURIComponent(search)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTotalUsers(data.total || 0);
      }
    } catch (err) {
      console.error('Fetch users error:', err);
    }
  }, [getAuthToken, userPage, search, usersPerPage]);

  const fetchEngines = useCallback(async () => {
    try {
      const token = await getAuthToken();
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
  }, [getAuthToken]);

  useEffect(() => {
    if (isAdmin) {
      fetchData();
      fetchEngines();
    }
  }, [isAdmin, fetchData, fetchEngines]);

  useEffect(() => {
    if (isAdmin && tab === 'users') {
      fetchUsers();
    }
  }, [isAdmin, tab, fetchUsers]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Access Denied</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-500">You do not have admin privileges.</p>
        </div>
      </div>
    );
  }

  /* â”€â”€ User Management Actions â”€â”€ */
  const handleUserAction = async (action: string, extraParams: Record<string, unknown> = {}) => {
    if (!selectedUser) return;
    setModalLoading(true);
    setModalMessage(null);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ user_id: selectedUser.id, action, ...extraParams }),
      });
      const data = await res.json();
      if (data.success) {
        setModalMessage({ type: 'success', text: data.message });
        fetchUsers();
        fetchData();
      } else {
        setModalMessage({ type: 'error', text: data.error || 'Action failed' });
      }
    } catch {
      setModalMessage({ type: 'error', text: 'Network error' });
    } finally {
      setModalLoading(false);
    }
  };

  const openUserModal = (u: UserRow) => {
    setSelectedUser(u);
    setUserModalOpen(true);
    setModalAction('');
    setModalMessage(null);
    setModalPlan('starter');
    setModalDays(30);
  };

  /* â”€â”€ Engine management helpers â”€â”€ */
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
      setEngineMessage({ type: 'error', text: 'Cannot save â€” the engine_config table does not exist yet.' });
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
      const token = await getAuthToken();
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

  const getUserSubscription = (u: UserRow) => {
    if (!u.subscriptions || !Array.isArray(u.subscriptions) || u.subscriptions.length === 0) return null;
    return u.subscriptions[0];
  };

  const getSubscriptionStatus = (u: UserRow) => {
    const sub = getUserSubscription(u);
    if (!sub) return 'free';
    return sub.status;
  };

  const getSubscriptionDaysLeft = (u: UserRow) => {
    const sub = getUserSubscription(u);
    if (!sub?.current_period_end) return null;
    const end = new Date(sub.current_period_end);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'engines', label: 'Engines', icon: Cpu },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'feedback', label: 'Feedback', icon: MessageSquare },
  ];

  const totalUserPages = Math.ceil(totalUsers / usersPerPage);

  return (
    <div className="animate-in fade-in duration-500">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Admin Dashboard</h1>
          <p className="text-[13px] text-slate-500 dark:text-zinc-500">Manage users, subscriptions, and platform data</p>
        </div>
        <button onClick={() => { fetchData(); if (tab === 'users') fetchUsers(); }} disabled={loading} className="text-xs font-medium text-slate-500 dark:text-zinc-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-100 dark:bg-zinc-800 transition-colors flex items-center gap-1.5 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 bg-white dark:bg-zinc-900 rounded-lg p-1 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
              tab === t.id ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-zinc-500 hover:text-white'
            }`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total Users', val: stats.totalUsers, icon: Users, color: 'text-purple-400' },
            { label: 'Active Subs', val: stats.activeSubscriptions, icon: CreditCard, color: 'text-emerald-400' },
            { label: 'Suspended', val: stats.suspendedUsers, icon: Ban, color: 'text-red-400' },
            { label: 'Documents', val: stats.totalDocuments, icon: FileText, color: 'text-cyan-400' },
            { label: 'Feedback', val: stats.totalFeedback, icon: MessageSquare, color: 'text-amber-400' },
            { label: 'Revenue', val: `$${stats.revenueThisMonth.toFixed(0)}`, icon: BarChart3, color: 'text-purple-400' },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-[#0c0c14] border border-slate-200 dark:border-zinc-800/60 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase tracking-wider">{s.label}</span>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{s.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* â”€â”€ Engines Management Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === 'engines' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white dark:bg-[#0c0c14] border border-slate-200 dark:border-zinc-800/60 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase tracking-wider">Enabled</span>
                <Eye className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{enabledCount} <span className="text-sm font-normal text-slate-500 dark:text-zinc-500">/ {engineDraft.length}</span></p>
            </div>
            <div className="bg-white dark:bg-[#0c0c14] border border-slate-200 dark:border-zinc-800/60 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase tracking-wider">Free Tier</span>
                <Cpu className="w-4 h-4 text-purple-400" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{freeCount}</p>
            </div>
            <div className="bg-white dark:bg-[#0c0c14] border border-slate-200 dark:border-zinc-800/60 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase tracking-wider">Premium</span>
                <Crown className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{premiumCount}</p>
            </div>
          </div>

          {!engineTableExists && (
            <div className="bg-amber-950/30 border border-amber-800 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1 space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-amber-200">Database Setup Required</h3>
                    <p className="text-xs text-amber-300 mt-1">The <code className="bg-amber-900 px-1 rounded text-[11px]">engine_config</code> table doesn&apos;t exist yet.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        const sql = `CREATE TABLE IF NOT EXISTS public.engine_config (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), engine_id TEXT NOT NULL UNIQUE, label TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, premium BOOLEAN NOT NULL DEFAULT FALSE, sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
                        navigator.clipboard.writeText(sql);
                        setSetupSqlCopied(true);
                        setTimeout(() => setSetupSqlCopied(false), 2000);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
                    >
                      {setupSqlCopied ? <><CheckCircle2 className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy SQL</>}
                    </button>
                    <button onClick={fetchEngines} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-900/30 rounded-lg transition-colors">
                      <RefreshCw className="w-3.5 h-3.5" /> Verify
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {engineMessage && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
              engineMessage.type === 'success' ? 'bg-emerald-950/30 text-emerald-300 border border-emerald-800' : 'bg-red-950/30 text-red-300 border border-red-800'
            }`}>
              {engineMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              {engineMessage.text}
            </div>
          )}

          <div className="bg-white dark:bg-[#0c0c14] border border-slate-200 dark:border-zinc-800/60 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Engine Configuration</h3>
                <p className="text-[11px] text-slate-500 dark:text-zinc-500 mt-0.5">Drag to reorder. Toggle visibility and tier.</p>
              </div>
              <div className="flex items-center gap-2">
                {engineDirty && (
                  <button onClick={resetEngines} className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-zinc-400 hover:text-white rounded-lg hover:bg-slate-100 dark:bg-zinc-800 transition-colors">Reset</button>
                )}
                <button onClick={saveEngines} disabled={!engineDirty || engineSaving}
                  className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${engineDirty ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-500 cursor-not-allowed'}`}>
                  {engineSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  {engineSaving ? 'Savingâ€¦' : 'Save'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-[32px_1fr_80px_80px_80px_80px] gap-2 px-4 py-2 border-b border-slate-200 dark:border-zinc-800/50 text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
              <div></div><div>Engine</div><div className="text-center">Visible</div><div className="text-center">Tier</div><div className="text-center">Order</div><div className="text-center">Status</div>
            </div>

            {engineDraft.map((eng, idx) => (
              <div key={eng.engine_id} draggable onDragStart={() => handleDragStart(idx)} onDragOver={(e) => handleDragOver(e, idx)} onDragEnd={handleDragEnd}
                className={`grid grid-cols-[32px_1fr_80px_80px_80px_80px] gap-2 px-4 py-3 items-center border-b border-slate-200 dark:border-zinc-800/30 last:border-b-0 transition-colors ${dragIdx === idx ? 'bg-purple-950/20' : 'hover:bg-slate-100 dark:bg-zinc-800/50'} ${!eng.enabled ? 'opacity-50' : ''}`}>
                <div className="cursor-grab active:cursor-grabbing text-slate-400 dark:text-zinc-600 hover:text-slate-500 dark:text-zinc-400"><GripVertical className="w-4 h-4" /></div>
                <div className="flex items-center gap-2">
                  <input value={eng.label} onChange={(e) => updateEngineDraft(idx, 'label', e.target.value)}
                    className="text-sm font-semibold text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-zinc-600 focus:border-purple-400 outline-none transition-colors py-0.5 w-full max-w-[180px]" />
                  <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-500">{eng.engine_id}</span>
                </div>
                <div className="flex justify-center">
                  <button onClick={() => updateEngineDraft(idx, 'enabled', !eng.enabled)} className={`p-1.5 rounded-lg transition-colors ${eng.enabled ? 'text-emerald-400 bg-emerald-950/30' : 'text-slate-500 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-800'}`}>
                    {eng.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex justify-center">
                  <button onClick={() => updateEngineDraft(idx, 'premium', !eng.premium)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors ${eng.premium ? 'bg-amber-900/30 text-amber-400' : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400'}`}>
                    {eng.premium ? 'Pro' : 'Free'}
                  </button>
                </div>
                <div className="flex justify-center items-center gap-1">
                  <button onClick={() => moveEngine(idx, idx - 1)} disabled={idx === 0} className="text-slate-500 dark:text-zinc-500 hover:text-slate-600 dark:text-zinc-300 disabled:opacity-30 p-0.5"><ChevronDown className="w-3.5 h-3.5 rotate-180" /></button>
                  <span className="text-xs font-mono text-slate-500 dark:text-zinc-500 w-5 text-center">{idx + 1}</span>
                  <button onClick={() => moveEngine(idx, idx + 1)} disabled={idx === engineDraft.length - 1} className="text-slate-500 dark:text-zinc-500 hover:text-slate-600 dark:text-zinc-300 disabled:opacity-30 p-0.5"><ChevronDown className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex justify-center">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${eng.enabled ? 'bg-emerald-950/40 text-emerald-400' : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-500'}`}>
                    {eng.enabled ? 'Live' : 'Off'}
                  </span>
                </div>
              </div>
            ))}
            {engineDraft.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-zinc-500">No engine configuration found.</div>}
          </div>
        </div>
      )}

      {/* â”€â”€ Users Management Tab (enhanced) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#0c0c14] border border-slate-200 dark:border-zinc-800/60 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800/50 flex items-center gap-3">
              <Search className="w-4 h-4 text-slate-500 dark:text-zinc-500" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setUserPage(1); }}
                placeholder="Search by name or emailâ€¦"
                className="flex-1 text-sm bg-transparent outline-none text-slate-900 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-600"
              />
              <span className="text-xs text-slate-500 dark:text-zinc-500">{totalUsers} users</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-800/50 text-left">
                    <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">User</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">Plan</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">Days Left</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">Joined</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const sub = getUserSubscription(u);
                    const status = getSubscriptionStatus(u);
                    const daysLeft = getSubscriptionDaysLeft(u);
                    return (
                      <tr key={u.id} className="border-b border-slate-200 dark:border-zinc-800/30 last:border-b-0 hover:bg-slate-100 dark:bg-zinc-800/50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white text-sm">{u.full_name || 'Unnamed'}</p>
                            <p className="text-xs text-slate-500 dark:text-zinc-500">{u.email || u.id.slice(0, 12) + 'â€¦'}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium text-slate-600 dark:text-zinc-300 capitalize">
                            {sub?.plan_name || u.plans?.display_name || 'Free'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            status === 'active' ? 'bg-emerald-950/40 text-emerald-400' :
                            status === 'suspended' ? 'bg-red-950/40 text-red-400' :
                            'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-500'
                          }`}>
                            {status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {daysLeft !== null ? (
                            <span className={`text-xs font-medium ${daysLeft <= 3 ? 'text-red-400' : daysLeft <= 7 ? 'text-amber-400' : 'text-slate-500 dark:text-zinc-400'}`}>
                              {daysLeft > 0 ? `${daysLeft}d` : 'Expired'}
                            </span>
                          ) : <span className="text-xs text-slate-400 dark:text-zinc-600">â€”</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-zinc-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => openUserModal(u)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-purple-400 bg-purple-950/30 hover:bg-purple-900/40 rounded-lg transition-colors"
                          >
                            <Edit3 className="w-3 h-3" /> Manage
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalUserPages > 1 && (
              <div className="px-4 py-3 border-t border-slate-200 dark:border-zinc-800/50 flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-zinc-500">Page {userPage} of {totalUserPages}</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setUserPage(p => Math.max(1, p - 1))} disabled={userPage <= 1}
                    className="p-1.5 text-slate-500 dark:text-zinc-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-100 dark:bg-zinc-800 transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))} disabled={userPage >= totalUserPages}
                    className="p-1.5 text-slate-500 dark:text-zinc-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-100 dark:bg-zinc-800 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* â”€â”€ User Management Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {userModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setUserModalOpen(false)}>
          <div className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selectedUser.full_name || 'Unnamed User'}</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">{selectedUser.email || selectedUser.id}</p>
              </div>
              <button onClick={() => setUserModalOpen(false)} className="p-2 text-slate-500 dark:text-zinc-400 hover:text-white rounded-lg hover:bg-slate-100 dark:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Current status */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-100 dark:bg-zinc-800 rounded-xl p-3">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">Status</p>
                  <p className={`text-sm font-bold mt-1 capitalize ${getSubscriptionStatus(selectedUser) === 'active' ? 'text-emerald-400' : getSubscriptionStatus(selectedUser) === 'suspended' ? 'text-red-400' : 'text-slate-500 dark:text-zinc-400'}`}>
                    {getSubscriptionStatus(selectedUser)}
                  </p>
                </div>
                <div className="bg-slate-100 dark:bg-zinc-800 rounded-xl p-3">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">Plan</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-1 capitalize">{getUserSubscription(selectedUser)?.plan_name || 'Free'}</p>
                </div>
                <div className="bg-slate-100 dark:bg-zinc-800 rounded-xl p-3">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">Days Left</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{getSubscriptionDaysLeft(selectedUser) ?? 'â€”'}</p>
                </div>
                <div className="bg-slate-100 dark:bg-zinc-800 rounded-xl p-3">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">Joined</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{new Date(selectedUser.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Status message */}
              {modalMessage && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
                  modalMessage.type === 'success' ? 'bg-emerald-950/30 text-emerald-300 border border-emerald-800' : 'bg-red-950/30 text-red-300 border border-red-800'
                }`}>
                  {modalMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {modalMessage.text}
                </div>
              )}

              {/* Quick Actions */}
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-3">Quick Actions</p>
                <div className="flex flex-wrap gap-2">
                  {getSubscriptionStatus(selectedUser) !== 'suspended' ? (
                    <button
                      onClick={() => handleUserAction('suspend')}
                      disabled={modalLoading}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-400 bg-red-950/30 hover:bg-red-900/40 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Ban className="w-3.5 h-3.5" /> Suspend User
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUserAction('unsuspend')}
                      disabled={modalLoading}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-400 bg-emerald-950/30 hover:bg-emerald-900/40 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <UserCheck className="w-3.5 h-3.5" /> Unsuspend User
                    </button>
                  )}
                  <button
                    onClick={() => handleUserAction('reset_usage')}
                    disabled={modalLoading}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-400 bg-amber-950/30 hover:bg-amber-900/40 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Reset Usage
                  </button>
                </div>
              </div>

              {/* Set Subscription */}
              <div className="border-t border-slate-200 dark:border-zinc-800 pt-5">
                <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-3">Set Subscription</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">Plan</label>
                      <select
                        value={modalPlan}
                        onChange={e => setModalPlan(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        title="Select plan"
                      >
                        {AVAILABLE_PLANS.map(p => (
                          <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">Duration (days)</label>
                      <input
                        type="number"
                        value={modalDays}
                        onChange={e => setModalDays(parseInt(e.target.value) || 1)}
                        min={1}
                        max={365}
                        className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleUserAction('set_plan', { plan_name: modalPlan, days: modalDays })}
                      disabled={modalLoading}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-900 dark:text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {modalLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                      Set Plan for {modalDays} Days
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-600">Subscription starts now and counts down from {modalDays} days.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subscriptions tab */}
      {tab === 'subscriptions' && (
        <div className="bg-white dark:bg-[#0c0c14] border border-slate-200 dark:border-zinc-800/60 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800/50 text-left">
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">User ID</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">Plan</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">Expires</th>
                </tr>
              </thead>
              <tbody>
                {subs.map(s => (
                  <tr key={s.id} className="border-b border-slate-200 dark:border-zinc-800/30 last:border-b-0 hover:bg-slate-100 dark:bg-zinc-800/50">
                    <td className="px-4 py-3 text-slate-500 dark:text-zinc-500 font-mono text-xs">{s.user_id.slice(0, 8)}â€¦</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{s.plan_name}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-emerald-950/40 text-emerald-400' : s.status === 'suspended' ? 'bg-red-950/40 text-red-400' : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-500'}`}>{s.status}</span></td>
                    <td className="px-4 py-3 text-slate-500 dark:text-zinc-500 text-xs">{new Date(s.current_period_end).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Documents tab */}
      {tab === 'documents' && (
        <div className="bg-white dark:bg-[#0c0c14] border border-slate-200 dark:border-zinc-800/60 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800/50 text-left">
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">Title</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">Engine</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">Words</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">AI Score</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id} className="border-b border-slate-200 dark:border-zinc-800/30 last:border-b-0 hover:bg-slate-100 dark:bg-zinc-800/50">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white truncate max-w-[200px]">{d.title}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-zinc-500 text-xs">{d.engine_used || 'â€”'}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-zinc-400 tabular-nums">{d.input_word_count}</td>
                    <td className="px-4 py-3">{d.output_ai_score !== null ? <span className={`text-xs font-bold ${d.output_ai_score <= 20 ? 'text-emerald-400' : 'text-red-400'}`}>{Math.round(d.output_ai_score)}%</span> : 'â€”'}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-zinc-500 text-xs">{new Date(d.created_at).toLocaleDateString()}</td>
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
            <div key={f.id} className="bg-white dark:bg-[#0c0c14] border border-slate-200 dark:border-zinc-800/60 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <div key={s} className={`w-3 h-3 rounded-full ${s <= (f.rating || 0) ? 'bg-amber-400' : 'bg-slate-100 dark:bg-zinc-800'}`} />
                    ))}
                  </div>
                  <span className="text-xs font-medium text-slate-500 dark:text-zinc-500 uppercase">{f.category || 'General'}</span>
                </div>
                <span className="text-xs text-slate-500 dark:text-zinc-500">{new Date(f.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">{f.comment || 'No comment'}</p>
            </div>
          ))}
          {feedback.length === 0 && <p className="text-center text-sm text-slate-500 dark:text-zinc-500 py-8">No feedback yet</p>}
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

