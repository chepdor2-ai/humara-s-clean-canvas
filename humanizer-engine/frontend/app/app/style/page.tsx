'use client';
import { useState, useEffect, useCallback } from 'react';
import { Palette, PenTool, Save, Trash2, Plus, RotateCcw, Check, X, Edit3 } from 'lucide-react';
import { useAuth } from '../../AuthProvider';

interface StyleProfile {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  avg_sentence_length: number;
  hedging_rate: number;
  passive_voice_rate: number;
  lexical_diversity: number;
  created_at: string;
}

const TONE_MAP: Record<string, string> = {
  'Academic Default': 'Formal',
  'Blog Casual': 'Conversational',
  'Technical Report': 'Professional',
};

const TONE_OPTIONS = ['Formal', 'Conversational', 'Professional', 'Creative', 'Minimalist'];

export default function StylePage() {
  const { session } = useAuth();
  const [profiles, setProfiles] = useState<StyleProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formTone, setFormTone] = useState('Formal');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const headers = useCallback((): HeadersInit => {
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
  }, [session?.access_token]);

  const fetchProfiles = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/style-profiles', { headers: headers() });
      const data = await res.json();
      setProfiles(data.profiles || []);
    } catch {}
    setLoading(false);
  }, [session?.access_token, headers]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const toneToParams = (tone: string) => {
    switch (tone) {
      case 'Formal': return { avg_sentence_length: 24, hedging_rate: 0.18, passive_voice_rate: 0.25, lexical_diversity: 0.68 };
      case 'Conversational': return { avg_sentence_length: 14, hedging_rate: 0.08, passive_voice_rate: 0.08, lexical_diversity: 0.52 };
      case 'Professional': return { avg_sentence_length: 20, hedging_rate: 0.12, passive_voice_rate: 0.2, lexical_diversity: 0.62 };
      case 'Creative': return { avg_sentence_length: 16, hedging_rate: 0.05, passive_voice_rate: 0.1, lexical_diversity: 0.72 };
      case 'Minimalist': return { avg_sentence_length: 10, hedging_rate: 0.03, passive_voice_rate: 0.05, lexical_diversity: 0.45 };
      default: return { avg_sentence_length: 22, hedging_rate: 0.15, passive_voice_rate: 0.2, lexical_diversity: 0.62 };
    }
  };

  const createProfile = async () => {
    if (!session?.access_token || !formName.trim()) return;
    setCreating(true);
    try {
      const params = toneToParams(formTone);
      const res = await fetch('/api/style-profiles', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ name: formName.trim(), description: formDesc.trim(), ...params }),
      });
      const data = await res.json();
      if (data.success && data.profile) {
        setProfiles(prev => [data.profile, ...prev]);
        resetForm();
      }
    } catch {}
    setCreating(false);
  };

  const updateProfile = async () => {
    if (!session?.access_token || !editingId || !formName.trim()) return;
    setCreating(true);
    try {
      const params = toneToParams(formTone);
      const res = await fetch('/api/style-profiles', {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ id: editingId, name: formName.trim(), description: formDesc.trim(), ...params }),
      });
      const data = await res.json();
      if (data.success && data.profile) {
        setProfiles(prev => prev.map(p => p.id === editingId ? data.profile : p));
        resetForm();
      }
    } catch {}
    setCreating(false);
  };

  const deleteProfile = async (id: string) => {
    if (!session?.access_token) return;
    setDeletingId(id);
    try {
      await fetch(`/api/style-profiles?id=${id}`, { method: 'DELETE', headers: headers() });
      setProfiles(prev => prev.filter(p => p.id !== id));
    } catch {}
    setDeletingId(null);
  };

  const setDefault = async (id: string) => {
    if (!session?.access_token) return;
    setActivatingId(id);
    try {
      // Unset all defaults first, then set the selected one
      for (const p of profiles) {
        if (p.is_default && p.id !== id) {
          await fetch('/api/style-profiles', {
            method: 'PATCH',
            headers: headers(),
            body: JSON.stringify({ id: p.id, is_default: false }),
          });
        }
      }
      const res = await fetch('/api/style-profiles', {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ id, is_default: true }),
      });
      const data = await res.json();
      if (data.success) {
        setProfiles(prev => prev.map(p => ({ ...p, is_default: p.id === id })));
      }
    } catch {}
    setActivatingId(null);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormName('');
    setFormDesc('');
    setFormTone('Formal');
  };

  const startEdit = (p: StyleProfile) => {
    setEditingId(p.id);
    setFormName(p.name);
    setFormDesc(p.description);
    // Infer tone from profile params
    if (p.avg_sentence_length <= 12) setFormTone('Minimalist');
    else if (p.avg_sentence_length <= 15) setFormTone('Conversational');
    else if (p.passive_voice_rate >= 0.2) setFormTone('Formal');
    else setFormTone('Professional');
    setShowForm(true);
  };

  const getTone = (p: StyleProfile) => {
    if (TONE_MAP[p.name]) return TONE_MAP[p.name];
    if (p.avg_sentence_length <= 12) return 'Minimalist';
    if (p.avg_sentence_length <= 15) return 'Conversational';
    if (p.passive_voice_rate >= 0.22) return 'Formal';
    if (p.lexical_diversity >= 0.68) return 'Creative';
    return 'Professional';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-3">
            <Palette className="text-brand-600 w-7 h-7" /> Style Profiles
          </h1>
          <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1">Create profiles so your writing always points to you.</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> New Profile
          </button>
        )}
      </header>

      {/* Create/Edit form */}
      {showForm && (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{editingId ? 'Edit Profile' : 'Create New Profile'}</h2>
            <button onClick={resetForm} title="Close" className="p-1.5 text-slate-500 dark:text-zinc-400 hover:text-slate-600 dark:text-zinc-300 rounded-lg hover:bg-slate-100 dark:bg-zinc-800 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Profile Name</label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Academic Default"
                className="w-full px-3 py-2.5 text-sm border border-slate-300 dark:border-zinc-700 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Tone</label>
              <select
                value={formTone}
                onChange={e => setFormTone(e.target.value)}
                title="Select tone"
                className="w-full px-3 py-2.5 text-sm border border-slate-300 dark:border-zinc-700 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {TONE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Description</label>
            <textarea
              value={formDesc}
              onChange={e => setFormDesc(e.target.value)}
              placeholder="Describe this writing style..."
              rows={2}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 dark:border-zinc-700 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={editingId ? updateProfile : createProfile}
              disabled={creating || !formName.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {creating ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingId ? 'Update' : 'Create'}
            </button>
            <button onClick={resetForm} className="px-4 py-2.5 text-sm text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white font-medium transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Profiles grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><RotateCcw className="w-6 h-6 text-brand-600 animate-spin" /></div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800">
          <PenTool className="w-12 h-12 text-slate-400 dark:text-zinc-600 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-zinc-400 font-medium">No style profiles yet</p>
          <p className="text-sm text-slate-500 dark:text-zinc-500 mt-1">Create your first profile to customize humanization output.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map(profile => (
            <div
              key={profile.id}
              className={`group relative p-6 border rounded-xl transition-all ${
                profile.is_default
                  ? 'bg-brand-600 text-white border-brand-700 shadow-lg shadow-brand-900/30'
                  : 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white border-slate-200 dark:border-zinc-800 hover:border-brand-700 hover:shadow-md'
              }`}
            >
              {/* Actions */}
              <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => startEdit(profile)} title="Edit profile" className={`p-1.5 rounded-lg transition-colors ${profile.is_default ? 'hover:bg-white/20 text-white/80' : 'hover:bg-slate-100 dark:bg-zinc-800 text-slate-400'}`}>
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => deleteProfile(profile.id)}
                  disabled={deletingId === profile.id}
                  className={`p-1.5 rounded-lg transition-colors ${profile.is_default ? 'hover:bg-white/20 text-white/80' : 'hover:bg-red-50 dark:hover:bg-red-950 text-slate-400 hover:text-red-500'}`}
                >
                  {deletingId === profile.id ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="flex items-center justify-between mb-4">
                <PenTool className={`w-5 h-5 ${profile.is_default ? 'text-slate-900 dark:text-white' : 'text-brand-600'}`} />
                {profile.is_default ? (
                  <span className="text-xs font-medium bg-white dark:bg-brand-950 text-brand-600 dark:text-brand-400 px-2.5 py-1 rounded-full">Active</span>
                ) : (
                  <button
                    onClick={() => setDefault(profile.id)}
                    disabled={activatingId === profile.id}
                    className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:bg-brand-950 hover:text-brand-600 transition-colors"
                  >
                    {activatingId === profile.id ? <RotateCcw className="w-3 h-3 animate-spin inline" /> : 'Set Active'}
                  </button>
                )}
              </div>

              <h3 className="text-lg font-semibold mb-1">{profile.name}</h3>
              <p className={`text-xs font-medium mb-3 ${profile.is_default ? 'text-white/70' : 'text-slate-500 dark:text-zinc-500'}`}>
                {getTone(profile)}
              </p>
              <p className={`text-sm leading-relaxed ${profile.is_default ? 'text-white/80' : 'text-slate-500 dark:text-zinc-400'}`}>
                {profile.description || 'No description set.'}
              </p>

              <div className={`mt-4 pt-3 border-t text-xs flex items-center gap-3 ${profile.is_default ? 'border-white/20 text-white/60' : 'border-slate-200 dark:border-zinc-800 text-slate-400'}`}>
                <span>Created {new Date(profile.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

