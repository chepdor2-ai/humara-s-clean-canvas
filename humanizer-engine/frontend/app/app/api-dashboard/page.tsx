'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../AuthProvider';
import { Key, BarChart3, Zap, Globe, Clock, TrendingUp, Copy, Check, Plus, Trash2, Settings2, ArrowRight, AlertTriangle, Code2, ExternalLink, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  last_used: string | null;
  requests: number;
  is_active: boolean;
  created_at: string;
  monthly_words_used?: number;
  daily_requests_used?: number;
}

interface UsageDay {
  date: string;
  requests: number;
  words: number;
  errors: number;
}

interface EngineUsage {
  engine: string;
  requests: number;
}

interface UsageStats {
  plan: string;
  summary: {
    total_requests: number;
    total_input_words: number;
    total_output_words: number;
    avg_latency_ms: number;
    success_rate: number;
    error_count: number;
  };
  quota: {
    daily_requests_used: number;
    daily_requests_limit: number;
    monthly_words_used: number;
    monthly_words_limit: number;
  };
  daily_breakdown: UsageDay[];
  engine_breakdown: EngineUsage[];
}

type Tab = 'overview' | 'keys' | 'usage' | 'settings';

const ENGINE_NAMES: Record<string, string> = {
  oxygen: 'Humara 2.0',
  ozone: 'Humara 2.1',
  easy: 'Humara 2.2',
  oxygen3: 'Humara 3.0',
  humara_v3_3: 'Humara 2.4',
  nuru_v2: 'Nuru 2.0',
  ghost_pro_wiki: 'Wikipedia',
};

const ENGINE_COLORS: Record<string, string> = {
  oxygen: '#8b5cf6',
  ozone: '#6366f1',
  easy: '#10b981',
  oxygen3: '#3b82f6',
  humara_v3_3: '#f59e0b',
  nuru_v2: '#ef4444',
  ghost_pro_wiki: '#06b6d4',
};

export default function ApiDashboardPage() {
  const { session } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const headers = useCallback(() => {
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
  }, [session?.access_token]);

  // Fetch API keys
  useEffect(() => {
    if (!session?.access_token) return;
    setKeysLoading(true);
    fetch('/api/api-keys', { headers: headers() as HeadersInit })
      .then(r => r.json())
      .then(d => setKeys(d.keys || []))
      .catch(() => {})
      .finally(() => setKeysLoading(false));
  }, [session?.access_token, headers]);

  // Fetch usage stats (when we have an active key)
  const fetchUsage = useCallback(async () => {
    if (!session?.access_token) return;
    setUsageLoading(true);
    try {
      // Use the internal API for usage stats (session-based)
      const activeKey = keys.find(k => k.is_active);
      if (!activeKey) return;
      // Fallback: build stats from api_keys data
      setUsageStats({
        plan: 'API',
        summary: {
          total_requests: keys.reduce((sum, k) => sum + (k.requests || 0), 0),
          total_input_words: 0,
          total_output_words: 0,
          avg_latency_ms: 0,
          success_rate: 100,
          error_count: 0,
        },
        quota: {
          daily_requests_used: activeKey.daily_requests_used || 0,
          daily_requests_limit: 100,
          monthly_words_used: activeKey.monthly_words_used || 0,
          monthly_words_limit: 50000,
        },
        daily_breakdown: [],
        engine_breakdown: [],
      });
    } catch {
      // ignore
    } finally {
      setUsageLoading(false);
    }
  }, [session?.access_token, keys, headers]);

  useEffect(() => {
    if (keys.length > 0) fetchUsage();
  }, [keys, fetchUsage]);

  const createKey = async () => {
    if (!session?.access_token || !newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: headers() as HeadersInit,
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (data.success && data.key) {
        setNewKeyValue(data.key);
        setKeys(prev => [{ id: data.id, name: data.name, key_prefix: data.key_prefix, last_used: null, requests: 0, is_active: true, created_at: data.created_at }, ...prev]);
        setNewKeyName('');
      }
    } catch {
      // ignore
    } finally {
      setCreatingKey(false);
    }
  };

  const revokeKey = async (keyId: string) => {
    if (!session?.access_token) return;
    await fetch(`/api/api-keys?id=${keyId}`, { method: 'DELETE', headers: headers() as HeadersInit });
    setKeys(prev => prev.map(k => k.id === keyId ? { ...k, is_active: false } : k));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const totalRequests = keys.reduce((sum, k) => sum + (k.requests || 0), 0);
  const activeKeys = keys.filter(k => k.is_active).length;
  const wordsUsed = usageStats?.quota.monthly_words_used || 0;
  const wordsLimit = usageStats?.quota.monthly_words_limit || 50000;

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-3">
              <Code2 className="text-brand-600 w-7 h-7" /> API Dashboard
            </h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Manage keys, monitor usage, and configure your API access</p>
          </div>
          <div className="flex gap-2">
            <Link href="/app/docs" className="text-sm text-brand-600 dark:text-purple-400 hover:text-brand-500 dark:hover:text-purple-300 flex items-center gap-1 bg-brand-50 dark:bg-purple-950/30 px-3 py-1.5 rounded-lg border border-brand-200 dark:border-purple-800/40">
              Docs <ExternalLink className="w-3 h-3" />
            </Link>
            <Link href="/api-pricing" className="text-sm text-brand-600 dark:text-purple-400 hover:text-brand-500 dark:hover:text-purple-300 flex items-center gap-1 bg-brand-50 dark:bg-purple-950/30 px-3 py-1.5 rounded-lg border border-brand-200 dark:border-purple-800/40">
              Plans <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 dark:bg-zinc-800/50 p-1 rounded-lg w-fit">
        {[
          { id: 'overview' as Tab, label: 'Overview', icon: BarChart3 },
          { id: 'keys' as Tab, label: 'API Keys', icon: Key },
          { id: 'usage' as Tab, label: 'Usage', icon: TrendingUp },
          { id: 'settings' as Tab, label: 'Model Settings', icon: Settings2 },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t.id ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300'}`}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Overview Tab ───────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Requests', value: totalRequests.toLocaleString(), icon: Zap, color: 'text-purple-500' },
              { label: 'Active Keys', value: String(activeKeys), icon: Key, color: 'text-emerald-500' },
              { label: 'Words Used', value: `${(wordsUsed / 1000).toFixed(1)}K / ${(wordsLimit / 1000).toFixed(0)}K`, icon: Globe, color: 'text-blue-500' },
              { label: 'Avg Latency', value: usageStats?.summary.avg_latency_ms ? `${usageStats.summary.avg_latency_ms}ms` : '—', icon: Clock, color: 'text-amber-500' },
            ].map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-4 h-4 ${s.color}`} />
                    <span className="text-xs font-medium text-slate-500 dark:text-zinc-500">{s.label}</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{s.value}</p>
                </div>
              );
            })}
          </div>

          {/* Word quota bar */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">Monthly Word Usage</span>
              <span className="text-xs text-slate-500 dark:text-zinc-500">{wordsUsed.toLocaleString()} / {wordsLimit.toLocaleString()}</span>
            </div>
            <div className="h-3 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all" style={{ width: `${Math.min(100, (wordsUsed / wordsLimit) * 100)}%` }} />
            </div>
          </div>

          {/* Quick actions */}
          <div className="grid sm:grid-cols-3 gap-4">
            <button onClick={() => setTab('keys')} className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5 text-left hover:border-purple-300 dark:hover:border-purple-700 transition-colors">
              <Key className="w-5 h-5 text-purple-500 mb-2" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Manage API Keys</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Create, view, and revoke API keys</p>
            </button>
            <Link href="/app/docs" className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5 text-left hover:border-purple-300 dark:hover:border-purple-700 transition-colors block">
              <Code2 className="w-5 h-5 text-blue-500 mb-2" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">API Documentation</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Endpoints, SDKs, and examples</p>
            </Link>
            <button onClick={() => setTab('settings')} className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5 text-left hover:border-purple-300 dark:hover:border-purple-700 transition-colors">
              <Settings2 className="w-5 h-5 text-emerald-500 mb-2" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Model Settings</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Configure engines, strength, and tones</p>
            </button>
          </div>
        </div>
      )}

      {/* ── Keys Tab ───────────────────────────────────────────── */}
      {tab === 'keys' && (
        <div className="space-y-6">
          {/* Create key */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Create New API Key</h2>
            <div className="flex gap-3">
              <input type="text" placeholder="Key name (e.g., My App)" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} maxLength={100} className="flex-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
              <button onClick={createKey} disabled={creatingKey || !newKeyName.trim()} className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                <Plus className="w-4 h-4" /> Create
              </button>
            </div>
          </div>

          {/* New key reveal */}
          {newKeyValue && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/40 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-1">API Key Created — Copy it now!</h3>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-3">This key will only be shown once. Store it securely.</p>
                  <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800">
                    <code className="flex-1 text-sm font-mono text-slate-900 dark:text-white break-all">{newKeyValue}</code>
                    <button onClick={() => copyToClipboard(newKeyValue)} className="shrink-0 p-2 rounded-md bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-colors">
                      {copiedKey ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <button onClick={() => setNewKeyValue(null)} className="mt-3 text-xs text-emerald-600 dark:text-emerald-400 hover:underline">Dismiss</button>
            </div>
          )}

          {/* Keys list */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Your API Keys</h2>
            </div>
            {keysLoading ? (
              <div className="p-8 text-center"><RefreshCw className="w-5 h-5 text-slate-400 dark:text-zinc-500 animate-spin mx-auto" /></div>
            ) : keys.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-zinc-500">No API keys yet. Create one above to get started.</div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-zinc-800">
                {keys.map(key => (
                  <div key={key.id} className={`px-5 py-4 flex items-center justify-between gap-4 ${!key.is_active ? 'opacity-50' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{key.name}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${key.is_active ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950' : 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950'}`}>
                          {key.is_active ? 'Active' : 'Revoked'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-zinc-500">
                        <code className="font-mono">{key.key_prefix}</code>
                        <span>{key.requests} requests</span>
                        <span>Created {new Date(key.created_at).toLocaleDateString()}</span>
                        {key.last_used && <span>Last used {new Date(key.last_used).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    {key.is_active && (
                      <button onClick={() => revokeKey(key.id)} className="p-2 text-slate-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors" title="Revoke key">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Usage Tab ──────────────────────────────────────────── */}
      {tab === 'usage' && (
        <div className="space-y-6">
          {/* Quota cards */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5">
              <h3 className="text-xs font-medium text-slate-500 dark:text-zinc-500 mb-2">Daily Requests</h3>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{usageStats?.quota.daily_requests_used || 0} <span className="text-sm font-normal text-slate-500 dark:text-zinc-500">/ {usageStats?.quota.daily_requests_limit || 100}</span></p>
              <div className="h-2 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, ((usageStats?.quota.daily_requests_used || 0) / (usageStats?.quota.daily_requests_limit || 100)) * 100)}%` }} />
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5">
              <h3 className="text-xs font-medium text-slate-500 dark:text-zinc-500 mb-2">Monthly Words</h3>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{(wordsUsed / 1000).toFixed(1)}K <span className="text-sm font-normal text-slate-500 dark:text-zinc-500">/ {(wordsLimit / 1000).toFixed(0)}K</span></p>
              <div className="h-2 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(100, (wordsUsed / wordsLimit) * 100)}%` }} />
              </div>
            </div>
          </div>

          {/* Summary stats */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">30-Day Summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-zinc-500 mb-1">Total Requests</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{usageStats?.summary.total_requests.toLocaleString() || '0'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-zinc-500 mb-1">Words Processed</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{((usageStats?.summary.total_input_words || 0) / 1000).toFixed(1)}K</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-zinc-500 mb-1">Success Rate</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{usageStats?.summary.success_rate || 100}%</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-zinc-500 mb-1">Avg Latency</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{usageStats?.summary.avg_latency_ms || 0}ms</p>
              </div>
            </div>
          </div>

          {/* Engine breakdown */}
          {usageStats?.engine_breakdown && usageStats.engine_breakdown.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Engine Distribution</h3>
              <div className="space-y-3">
                {usageStats.engine_breakdown.map(e => {
                  const maxReq = Math.max(...usageStats.engine_breakdown.map(x => x.requests));
                  return (
                    <div key={e.engine} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-slate-700 dark:text-zinc-300 w-24 shrink-0">{ENGINE_NAMES[e.engine] || e.engine}</span>
                      <div className="flex-1 h-5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(e.requests / maxReq) * 100}%`, backgroundColor: ENGINE_COLORS[e.engine] || '#8b5cf6' }} />
                      </div>
                      <span className="text-xs text-slate-500 dark:text-zinc-500 w-16 text-right">{e.requests}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Model Settings Tab ─────────────────────────────────── */}
      {tab === 'settings' && <ModelSettings />}
    </div>
  );
}

function ModelSettings() {
  const [selectedEngine, setSelectedEngine] = useState('oxygen');
  const [strength, setStrength] = useState('medium');
  const [tone, setTone] = useState('neutral');
  const [strictMeaning, setStrictMeaning] = useState(true);
  const [noContractions, setNoContractions] = useState(false);
  const [postProcessing, setPostProcessing] = useState(true);
  const [copied, setCopied] = useState(false);

  const engines = [
    { id: 'oxygen', name: 'Humara 2.0', desc: 'GPTZero killer — best for academic papers', tier: 'Hobby+', speed: 'Medium', quality: 'High' },
    { id: 'ozone', name: 'Humara 2.1', desc: 'ZeroGPT/SEO cleaner — blog & marketing content', tier: 'Developer+', speed: 'Medium', quality: 'High' },
    { id: 'easy', name: 'Humara 2.2', desc: 'General-purpose — works on everything', tier: 'Hobby+', speed: 'Fast', quality: 'Good' },
    { id: 'oxygen3', name: 'Humara 3.0', desc: 'Fine-tuned model — sentence-independent processing', tier: 'Developer+', speed: 'Fast', quality: 'Very High' },
    { id: 'humara_v3_3', name: 'Humara 2.4', desc: 'Strongest — triple fallback + detector feedback', tier: 'Business+', speed: 'Slow', quality: 'Highest' },
    { id: 'nuru_v2', name: 'Nuru 2.0', desc: 'Deep restructuring — 40%+ structural change', tier: 'Developer+', speed: 'Medium', quality: 'High' },
    { id: 'ghost_pro_wiki', name: 'Wikipedia', desc: 'Encyclopedic NPOV — citation-aware', tier: 'Developer+', speed: 'Slow', quality: 'High' },
  ];

  const generateCurlCommand = () => {
    const params: Record<string, unknown> = {
      text: 'Your AI-generated text here',
      engine: selectedEngine,
      strength,
      tone,
    };
    if (!strictMeaning) params.strict_meaning = false;
    if (noContractions) params.no_contractions = true;
    if (!postProcessing) params.enable_post_processing = false;

    return `curl -X POST https://humaragpt.com/api/v1/humanize \\
  -H "Authorization: Bearer hum_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(params, null, 2)}'`;
  };

  const copyCommand = () => {
    navigator.clipboard.writeText(generateCurlCommand());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Engine Selection */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Select Engine</h2>
        <div className="grid gap-2">
          {engines.map(e => (
            <button key={e.id} onClick={() => setSelectedEngine(e.id)} className={`flex items-center gap-4 p-3 rounded-lg border text-left transition-all ${selectedEngine === e.id ? 'bg-purple-50 dark:bg-purple-950/30 border-purple-300 dark:border-purple-700 ring-1 ring-purple-500/20' : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'}`}>
              <div className={`w-3 h-3 rounded-full border-2 ${selectedEngine === e.id ? 'border-purple-500 bg-purple-500' : 'border-slate-300 dark:border-zinc-600'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{e.name}</span>
                  <code className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono bg-slate-100 dark:bg-zinc-800 px-1 py-0.5 rounded">{e.id}</code>
                  <span className="text-[10px] font-bold text-purple-500 bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.5 rounded-full">{e.tier}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{e.desc}</p>
              </div>
              <div className="text-right shrink-0 hidden sm:block">
                <div className="text-[10px] text-slate-400 dark:text-zinc-500">Speed: <span className="text-slate-600 dark:text-zinc-300">{e.speed}</span></div>
                <div className="text-[10px] text-slate-400 dark:text-zinc-500">Quality: <span className="text-slate-600 dark:text-zinc-300">{e.quality}</span></div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Parameters */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Strength</h3>
          <div className="space-y-2">
            {[
              { val: 'light', label: 'Light', desc: '~15-25% change, preserves style' },
              { val: 'medium', label: 'Medium', desc: '~30-45% change, balanced' },
              { val: 'strong', label: 'Strong', desc: '~50-70% change, max AI removal' },
            ].map(s => (
              <button key={s.val} onClick={() => setStrength(s.val)} className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${strength === s.val ? 'bg-purple-50 dark:bg-purple-950/30 border-purple-300 dark:border-purple-700' : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'}`}>
                <div className={`w-2.5 h-2.5 rounded-full ${strength === s.val ? 'bg-purple-500' : 'bg-slate-300 dark:bg-zinc-600'}`} />
                <div>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{s.label}</span>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">{s.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Tone</h3>
          <div className="grid grid-cols-2 gap-2">
            {['neutral', 'academic', 'professional', 'simple', 'creative', 'technical', 'wikipedia'].map(t => (
              <button key={t} onClick={() => setTone(t)} className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all capitalize ${tone === t ? 'bg-purple-50 dark:bg-purple-950/30 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300' : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Toggles */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Advanced Options</h3>
        {[
          { label: 'Strict Meaning Preservation', desc: 'Minimize semantic drift from original text', value: strictMeaning, setter: setStrictMeaning },
          { label: 'No Contractions', desc: 'Expand all contractions (don\'t → do not)', value: noContractions, setter: setNoContractions },
          { label: 'Post-Processing', desc: 'Apply grammar cleanup and formatting passes', value: postProcessing, setter: setPostProcessing },
        ].map(opt => (
          <div key={opt.label} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-700 dark:text-zinc-300">{opt.label}</p>
              <p className="text-xs text-slate-500 dark:text-zinc-500">{opt.desc}</p>
            </div>
            <button onClick={() => opt.setter(!opt.value)} title={opt.label} className={`relative w-10 h-5 rounded-full transition-colors ${opt.value ? 'bg-purple-600' : 'bg-slate-300 dark:bg-zinc-600'}`}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${opt.value ? 'left-[22px]' : 'left-[2px]'}`} />
            </button>
          </div>
        ))}
      </div>

      {/* Generated command */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Generated API Request</h3>
          <button onClick={copyCommand} className="text-xs text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 transition-colors">
            {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
          </button>
        </div>
        <div className="bg-slate-950 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300 font-mono leading-relaxed whitespace-pre-wrap">{generateCurlCommand()}</pre>
        </div>
      </div>
    </div>
  );
}
