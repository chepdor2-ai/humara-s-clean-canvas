'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, LogOut, Settings, User, Bell, Key, HelpCircle, CheckCircle2, Copy, Check, Plus, Trash2, RotateCcw, Save, Mail, Shield, ExternalLink, Crown, Clock } from 'lucide-react';
import { useAuth } from '../../AuthProvider';
import { useUsage } from '../UsageBar';

const PLAN_COLORS: Record<string, string> = {
  starter: '#64748b',
  creator: '#6366f1',
  professional: '#10b981',
  business: '#f59e0b',
};

type Tab = 'profile' | 'billing' | 'api-keys' | 'notifications' | 'support';

const NAV_ITEMS: { label: string; id: Tab; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: 'Profile', id: 'profile', icon: User },
  { label: 'Billing & Plans', id: 'billing', icon: CreditCard },
  { label: 'API Keys', id: 'api-keys', icon: Key },
  { label: 'Notifications', id: 'notifications', icon: Bell },
  { label: 'Support', id: 'support', icon: HelpCircle },
];

interface Profile {
  full_name: string | null;
  email: string;
  use_case: string | null;
  avatar_url: string | null;
  plans?: { name: string; display_name: string; price_monthly: number; daily_words_fast: number; daily_words_stealth: number; features: string[] };
}

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  last_used: string | null;
  requests: number;
  is_active: boolean;
  created_at: string;
}

export default function SettingsPage() {
  const { session, signOut } = useAuth();
  const { usage } = useUsage();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  // Profile state
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [useCase, setUseCase] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Notification preferences
  const [notifUsage, setNotifUsage] = useState(true);
  const [notifUpdates, setNotifUpdates] = useState(true);
  const [notifSecurity, setNotifSecurity] = useState(true);
  const [notifMarketing, setNotifMarketing] = useState(false);

  const headers = useCallback(() => {
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
  }, [session?.access_token]);

  // Fetch profile
  useEffect(() => {
    if (!session?.access_token) return;
    setProfileLoading(true);
    fetch('/api/profile', { headers: headers() as HeadersInit })
      .then(r => r.json())
      .then(d => {
        if (d.profile) {
          setProfile(d.profile);
          setFullName(d.profile.full_name || '');
          setUseCase(d.profile.use_case || '');
        }
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [session?.access_token, headers]);

  // Fetch API keys when tab opens
  useEffect(() => {
    if (activeTab !== 'api-keys' || !session?.access_token) return;
    setKeysLoading(true);
    fetch('/api/api-keys', { headers: headers() as HeadersInit })
      .then(r => r.json())
      .then(d => setApiKeys(d.keys || []))
      .catch(() => {})
      .finally(() => setKeysLoading(false));
  }, [activeTab, session?.access_token, headers]);

  const saveProfile = async () => {
    if (!session?.access_token) return;
    setSavingProfile(true);
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: headers() as HeadersInit,
        body: JSON.stringify({ full_name: fullName, use_case: useCase }),
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch {}
    setSavingProfile(false);
  };

  const createApiKey = async () => {
    if (!session?.access_token || !newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: headers() as HeadersInit,
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const d = await res.json();
      if (d.success && d.key) {
        setNewKeyValue(d.key);
        setApiKeys(prev => [{ id: d.id, name: d.name, key_prefix: d.key_prefix, last_used: null, requests: 0, is_active: true, created_at: d.created_at }, ...prev]);
        setNewKeyName('');
      }
    } catch {}
    setCreatingKey(false);
  };

  const revokeApiKey = async (id: string) => {
    if (!session?.access_token) return;
    try {
      await fetch(`/api/api-keys?id=${id}`, { method: 'DELETE', headers: headers() as HeadersInit });
      setApiKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: false } : k));
    } catch {}
  };

  const copyKey = () => {
    if (!newKeyValue) return;
    navigator.clipboard.writeText(newKeyValue);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const plan = profile?.plans;
  const planFeatures: string[] = plan?.features ? (typeof plan.features === 'string' ? JSON.parse(plan.features) : plan.features) : [];

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold text-white flex items-center gap-2">
          <Settings className="text-brand-600 w-5 h-5" /> Settings
        </h1>
        <p className="text-sm text-zinc-400 mt-0.5">Manage account, billing, and preferences</p>
      </header>

      <div className="flex bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden flex-col lg:flex-row min-h-[500px]">
        {/* Sidebar navigation */}
        <nav className="w-full lg:w-56 bg-zinc-800/50 p-4 border-b lg:border-b-0 lg:border-r border-zinc-800 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full text-left px-3 py-2.5 text-sm font-medium transition-colors flex items-center gap-2.5 rounded-lg ${
                  isActive ? 'bg-brand-950 text-brand-300' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
          <div className="pt-4 mt-4 border-t border-zinc-700">
            <button onClick={handleSignOut} className="w-full text-left px-3 py-2.5 text-sm font-medium text-red-500 hover:bg-red-950 flex items-center gap-2.5 transition-colors rounded-lg">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </nav>

        {/* Content area */}
        <section className="flex-1 p-6 overflow-y-auto">

          {/* -- Profile Tab -- */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Profile</h2>
                <p className="text-sm text-zinc-400">Update your personal information</p>
              </div>
              {profileLoading ? (
                <div className="flex items-center justify-center py-12"><RotateCcw className="w-5 h-5 text-brand-600 animate-spin" /></div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center gap-4 p-4 bg-zinc-800 rounded-xl border border-zinc-700">
                    <div className="w-14 h-14 bg-brand-900 rounded-full flex items-center justify-center text-brand-300 text-xl font-semibold">
                      {fullName ? fullName.charAt(0).toUpperCase() : (profile?.email?.charAt(0)?.toUpperCase() || 'U')}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{fullName || 'No name set'}</p>
                      <p className="text-xs text-zinc-500 flex items-center gap-1"><Mail className="w-3 h-3" /> {profile?.email}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">Full Name</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full px-3 py-2.5 text-sm border border-zinc-700 rounded-lg bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">Primary Use Case</label>
                    <select
                      value={useCase}
                      onChange={e => setUseCase(e.target.value)}
                      title="Select use case"
                      className="w-full px-3 py-2.5 text-sm border border-zinc-700 rounded-lg bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">Select use case</option>
                      <option value="academic">Academic</option>
                      <option value="content_seo">Content & SEO</option>
                      <option value="general">General</option>
                    </select>
                  </div>

                  <button
                    onClick={saveProfile}
                    disabled={savingProfile}
                    className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {profileSaved ? <><Check className="w-4 h-4" /> Saved</> : savingProfile ? <><RotateCcw className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Changes</>}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* -- Billing & Plans Tab -- */}
          {activeTab === 'billing' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Billing & Plans</h2>
                <p className="text-sm text-zinc-400">
                  {plan ? <>You are on the <strong className="text-purple-400">{plan.display_name} (${plan.price_monthly}/mo)</strong>.</> : 'Loading plan details...'}
                </p>
              </div>

              {/* Subscription countdown */}
              {usage && usage.daysRemaining > 0 && (
                <div className="flex items-center gap-3 p-4 bg-purple-950/20 border border-purple-800/30 rounded-xl">
                  <Clock className="w-5 h-5 text-purple-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">Subscription Active</p>
                    <p className={`text-xs mt-0.5 ${usage.daysRemaining <= 3 ? 'text-red-400' : usage.daysRemaining <= 7 ? 'text-amber-400' : 'text-zinc-400'}`}>
                      {usage.daysRemaining} day{usage.daysRemaining !== 1 ? 's' : ''} remaining · {usage.wordsUsed.toLocaleString()} / {usage.wordsLimit.toLocaleString()} words used today
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-2xl font-bold tabular-nums ${usage.daysRemaining <= 3 ? 'text-red-400' : 'text-white'}`}>
                      {usage.daysRemaining}
                    </span>
                    <p className="text-[10px] text-zinc-500 uppercase">days</p>
                  </div>
                </div>
              )}

              {plan && (() => {
                const pColor = PLAN_COLORS[plan.name?.toLowerCase()] || PLAN_COLORS.starter;
                return (
                  <div
                    className="plan-glow-strong p-6 rounded-2xl relative z-10 glass-card"
                    style={{ '--plan-color': pColor } as React.CSSProperties}
                  >
                    <span
                      className="absolute -top-3 right-4 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-lg flex items-center gap-1"
                      style={{ backgroundColor: pColor, boxShadow: `0 4px 14px ${pColor}40` }}
                    >
                      <Crown className="w-3 h-3" /> Current Plan
                    </span>
                    <h3 className="text-lg font-bold text-white">{plan.display_name}</h3>
                    <div className="text-3xl font-bold text-white my-3 tracking-tight">${plan.price_monthly} <span className="text-sm text-zinc-500 font-normal">/month</span></div>
                    <ul className="space-y-2.5 text-sm text-zinc-400 mb-6">
                      {planFeatures.map((f, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: pColor }} />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <a href="/pricing" className="inline-block w-full text-center py-2.5 bg-zinc-800 text-zinc-300 text-sm font-semibold hover:bg-zinc-700 transition-all border border-zinc-700 rounded-xl hover:shadow-md">
                      {plan.price_monthly > 0 ? 'Change Plan' : 'Upgrade Plan'}
                    </a>
                  </div>
                );
              })()}

              {!plan && (
                <div className="p-6 bg-zinc-800 rounded-xl border border-zinc-700 text-center">
                  <Crown className="w-8 h-8 text-zinc-500 mx-auto mb-3" />
                  <p className="text-sm text-zinc-400 mb-3">You&apos;re on the Free plan</p>
                  <a href="/pricing" className="inline-block px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-xl transition-colors">
                    Upgrade Now
                  </a>
                </div>
              )}

              <div className="pt-6 border-t border-zinc-800 space-y-4">
                <h3 className="text-sm font-semibold text-white">Payment History</h3>
                <p className="text-xs text-zinc-500">Payments are processed securely via Paystack. View your transaction history on the Paystack dashboard.</p>
                <a href="/pricing" className="text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors">View Pricing Plans &rarr;</a>
              </div>
            </div>
          )}

          {/* -- API Keys Tab -- */}
          {activeTab === 'api-keys' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">API Keys</h2>
                <p className="text-sm text-zinc-400">Create and manage API keys for programmatic access</p>
              </div>

              {/* New key alert */}
              {newKeyValue && (
                <div className="p-4 bg-emerald-950/30 border border-emerald-800 rounded-xl space-y-2">
                  <p className="text-sm font-medium text-emerald-300 flex items-center gap-2"><Shield className="w-4 h-4" /> Your new API key (copy it now � it won&apos;t be shown again):</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-700 text-white font-mono break-all">{newKeyValue}</code>
                    <button onClick={copyKey} className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors">
                      {copiedKey ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <button onClick={() => setNewKeyValue(null)} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">Dismiss</button>
                </div>
              )}

              {/* Create key */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKeyName}
                  onChange={e => setNewKeyName(e.target.value)}
                  placeholder="Key name (e.g. My App)"
                  className="flex-1 px-3 py-2.5 text-sm border border-zinc-700 rounded-lg bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  onKeyDown={e => e.key === 'Enter' && createApiKey()}
                />
                <button
                  onClick={createApiKey}
                  disabled={creatingKey || !newKeyName.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {creatingKey ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create
                </button>
              </div>

              {/* Keys list */}
              {keysLoading ? (
                <div className="flex items-center justify-center py-12"><RotateCcw className="w-5 h-5 text-brand-600 animate-spin" /></div>
              ) : apiKeys.length === 0 ? (
                <div className="text-center py-12 bg-zinc-800 rounded-xl border border-zinc-700">
                  <Key className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                  <p className="text-sm text-zinc-400">No API keys yet</p>
                  <p className="text-xs text-zinc-500 mt-1">Create one above to get started</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {apiKeys.map(k => (
                    <div key={k.id} className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${k.is_active ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-800/50 border-zinc-800 opacity-60'}`}>
                      <div className="flex items-center gap-3">
                        <Key className={`w-4 h-4 ${k.is_active ? 'text-brand-600' : 'text-zinc-500'}`} />
                        <div>
                          <p className="text-sm font-medium text-white">{k.name}</p>
                          <p className="text-xs text-zinc-500 font-mono">{k.key_prefix} � {k.requests} requests � Created {new Date(k.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      {k.is_active ? (
                        <button onClick={() => revokeApiKey(k.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-950 rounded-lg transition-colors" title="Revoke key">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-xs text-red-400 font-medium">Revoked</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* -- Notifications Tab -- */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Notifications</h2>
                <p className="text-sm text-zinc-400">Choose what you want to be notified about</p>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'Usage Alerts', desc: 'Get notified when you reach 80% and 100% of your daily word limit', value: notifUsage, set: setNotifUsage },
                  { label: 'Product Updates', desc: 'New features, engine improvements, and important announcements', value: notifUpdates, set: setNotifUpdates },
                  { label: 'Security Alerts', desc: 'Sign-in from new devices, password changes, and unusual activity', value: notifSecurity, set: setNotifSecurity },
                  { label: 'Marketing', desc: 'Tips, best practices, and promotional offers', value: notifMarketing, set: setNotifMarketing },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between p-4 bg-zinc-800 border border-zinc-700 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-white">{item.label}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => item.set(!item.value)}
                      aria-label={`Toggle ${item.label}`}
                      className={`relative w-11 h-6 rounded-full transition-colors ${item.value ? 'bg-brand-600' : 'bg-zinc-600'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${item.value ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* -- Support Tab -- */}
          {activeTab === 'support' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Support</h2>
                <p className="text-sm text-zinc-400">Get help from our team</p>
              </div>
              <div className="space-y-4">
                <a href="/contact" className="flex items-center justify-between p-5 bg-zinc-800 border border-zinc-700 rounded-xl hover:border-brand-700 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand-950 flex items-center justify-center rounded-lg"><Mail className="w-5 h-5 text-brand-600" /></div>
                    <div>
                      <p className="text-sm font-medium text-white">Contact Us</p>
                      <p className="text-xs text-zinc-500">Send a message to our support team</p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-brand-600 transition-colors" />
                </a>
                <a href="mailto:support@humaragpt.com" className="flex items-center justify-between p-5 bg-zinc-800 border border-zinc-700 rounded-xl hover:border-brand-700 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-950 flex items-center justify-center rounded-lg"><Mail className="w-5 h-5 text-purple-600" /></div>
                    <div>
                      <p className="text-sm font-medium text-white">Email Support</p>
                      <p className="text-xs text-zinc-500">support@humaragpt.com</p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-brand-600 transition-colors" />
                </a>
                <div className="p-5 bg-zinc-800 border border-zinc-700 rounded-xl">
                  <p className="text-sm font-medium text-white mb-1">Response Times</p>
                  <div className="space-y-1 text-xs text-zinc-400">
                    <p>Starter plan: within 48 hours</p>
                    <p>Creator plan: within 24 hours</p>
                    <p>Professional+ plans: within 4 hours (priority)</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

