'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../AuthProvider';
import { supabase } from '../../../lib/supabase';
import { Users, CreditCard, FileText, BarChart3, MessageSquare, Shield, Search, RefreshCw, ChevronDown } from 'lucide-react';

/* ── Types ──────────────────────────────────────────────────────────── */
interface AdminStats { totalUsers: number; activeSubscriptions: number; totalDocuments: number; totalFeedback: number; revenueThisMonth: number; }
interface UserRow { id: string; full_name: string; email?: string; plan_name?: string; created_at: string; onboarding_done: boolean; }
interface SubRow { id: string; user_id: string; plan_name: string; status: string; current_period_end: string; }
interface DocRow { id: string; user_id: string; title: string; engine_used: string; input_word_count: number; output_ai_score: number | null; created_at: string; }
interface FeedbackRow { id: string; user_id: string; rating: number; comment: string; category: string; created_at: string; }

type Tab = 'overview' | 'users' | 'subscriptions' | 'documents' | 'feedback';

const ADMIN_EMAILS = ['admin@humara.ai']; // Add admin emails here

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

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin, fetchData]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Access Denied</h2>
          <p className="text-sm text-slate-500">You do not have admin privileges.</p>
        </div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'feedback', label: 'Feedback', icon: MessageSquare },
  ];

  return (
    <div className="animate-in fade-in duration-500">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Admin Dashboard</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400">Manage users, subscriptions, and platform data</p>
        </div>
        <button onClick={fetchData} disabled={loading} className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
              tab === t.id ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white'
            }`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'Total Users', val: stats.totalUsers, icon: Users, color: 'text-brand-600' },
            { label: 'Active Subs', val: stats.activeSubscriptions, icon: CreditCard, color: 'text-emerald-600' },
            { label: 'Documents', val: stats.totalDocuments, icon: FileText, color: 'text-blue-600' },
            { label: 'Feedback', val: stats.totalFeedback, icon: MessageSquare, color: 'text-amber-600' },
            { label: 'Revenue', val: `$${stats.revenueThisMonth.toFixed(0)}`, icon: BarChart3, color: 'text-purple-600' },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{s.label}</span>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{s.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Users tab */}
      {tab === 'users' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <Search className="w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…"
              className="flex-1 text-sm bg-transparent outline-none text-slate-700 dark:text-slate-200 placeholder-slate-400" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-left">
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase">Name</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase">ID</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase">Onboarded</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.filter(u => !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.id.includes(search)).map(u => (
                  <tr key={u.id} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{u.full_name || 'Unnamed'}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{u.id.slice(0, 8)}…</td>
                    <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.onboarding_done ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>{u.onboarding_done ? 'Yes' : 'No'}</span></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subscriptions tab */}
      {tab === 'subscriptions' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-left">
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase">User ID</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase">Plan</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase">Expires</th>
                </tr>
              </thead>
              <tbody>
                {subs.map(s => (
                  <tr key={s.id} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{s.user_id.slice(0, 8)}…</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{s.plan_name}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600' : 'bg-red-50 dark:bg-red-950 text-red-500'}`}>{s.status}</span></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{new Date(s.current_period_end).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Documents tab */}
      {tab === 'documents' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-left">
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase">Title</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase">Engine</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase">Words</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase">AI Score</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase">Date</th>
                </tr>
              </thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white truncate max-w-[200px]">{d.title}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{d.engine_used || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums">{d.input_word_count}</td>
                    <td className="px-4 py-3">{d.output_ai_score !== null ? <span className={`text-xs font-bold ${d.output_ai_score <= 20 ? 'text-emerald-600' : 'text-red-500'}`}>{Math.round(d.output_ai_score)}%</span> : '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{new Date(d.created_at).toLocaleDateString()}</td>
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
            <div key={f.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <div key={s} className={`w-3 h-3 rounded-full ${s <= (f.rating || 0) ? 'bg-amber-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
                    ))}
                  </div>
                  <span className="text-xs font-medium text-slate-400 uppercase">{f.category || 'General'}</span>
                </div>
                <span className="text-xs text-slate-400">{new Date(f.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{f.comment || 'No comment'}</p>
            </div>
          ))}
          {feedback.length === 0 && <p className="text-center text-sm text-slate-400 py-8">No feedback yet</p>}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 text-brand-600 animate-spin" />
        </div>
      )}
    </div>
  );
}
