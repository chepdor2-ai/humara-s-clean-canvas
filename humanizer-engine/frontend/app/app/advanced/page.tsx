'use client';
import { useState, useCallback } from 'react';
import { Sliders, Gauge, FlaskConical, BarChart3, Upload, FileText, RotateCcw, Check, Download, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../AuthProvider';

export default function AdvancedPage() {
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<'tuning' | 'batch' | 'analytics'>('tuning');

  // Parameter tuning
  const [strength, setStrength] = useState(50);
  const [burstiness, setBurstiness] = useState(60);
  const [vocabDiversity, setVocabDiversity] = useState(55);
  const [meaningWeight, setMeaningWeight] = useState(80);

  // Batch processing
  const [batchTexts, setBatchTexts] = useState<string[]>([]);
  const [batchResults, setBatchResults] = useState<string[]>([]);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchEngine, setBatchEngine] = useState('ghost_pro');

  const headers = useCallback((): HeadersInit => {
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
  }, [session?.access_token]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const texts: string[] = [];
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        if (content) {
          texts.push(content);
          setBatchTexts([...texts]);
        }
      };
      reader.readAsText(file);
    });
  };

  const processBatch = async () => {
    if (!session?.access_token || batchTexts.length === 0) return;
    setBatchProcessing(true);
    setBatchProgress(0);
    const results: string[] = [];

    for (let i = 0; i < batchTexts.length; i++) {
      try {
        const res = await fetch('/api/humanize', {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ text: batchTexts[i], engine: batchEngine, strength: 'medium', tone: 'neutral' }),
        });
        const data = await res.json();
        results.push(data.humanized || data.error || 'Failed');
      } catch {
        results.push('Error processing this text');
      }
      setBatchProgress(Math.round(((i + 1) / batchTexts.length) * 100));
    }

    setBatchResults(results);
    setBatchProcessing(false);
  };

  const downloadResults = () => {
    const output = batchResults.map((r, i) => `=== Document ${i + 1} ===\n${r}`).join('\n\n');
    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'humanized-batch.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const Slider = ({ label, value, onChange, desc }: { label: string; value: number; onChange: (v: number) => void; desc: string }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-600 dark:text-zinc-300">{label}</label>
        <span className="text-sm font-semibold text-brand-600">{value}%</span>
      </div>
      <input type="range" min={0} max={100} value={value} onChange={e => onChange(Number(e.target.value))} title={label} className="w-full h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-full appearance-none cursor-pointer accent-brand-600" />
      <p className="text-xs text-slate-500 dark:text-slate-400">{desc}</p>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-3">
          <FlaskConical className="text-brand-600 w-7 h-7" /> Advanced Tools
        </h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Fine-tune engine parameters and run batch operations.</p>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-zinc-800 rounded-lg w-fit">
        {[
          { id: 'tuning' as const, label: 'Parameter Tuning', icon: Sliders },
          { id: 'batch' as const, label: 'Batch Processing', icon: Gauge },
          { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === tab.id ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-600 dark:text-zinc-300'}`}>
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Parameter Tuning */}
      {activeTab === 'tuning' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-6">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Humanization Parameters</h2>
            <Slider label="Rewrite Strength" value={strength} onChange={setStrength} desc="Higher = more aggressive rewriting, lower = closer to original" />
            <Slider label="Burstiness" value={burstiness} onChange={setBurstiness} desc="Sentence length variation. Higher = more varied, more human-like" />
            <Slider label="Vocabulary Diversity" value={vocabDiversity} onChange={setVocabDiversity} desc="Range of vocabulary used in replacements" />
            <Slider label="Meaning Preservation" value={meaningWeight} onChange={setMeaningWeight} desc="Higher = stricter semantic similarity to the original" />
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Preview</h2>
            <div className="p-4 bg-slate-100 dark:bg-zinc-800 rounded-lg border border-slate-300 dark:border-zinc-700 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
                <span>Estimated output profile:</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg border border-slate-300 dark:border-zinc-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Avg Sentence Length</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">{Math.round(12 + burstiness * 0.16)} words</p>
                </div>
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg border border-slate-300 dark:border-zinc-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Lexical Diversity</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">{(0.4 + vocabDiversity * 0.004).toFixed(2)}</p>
                </div>
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg border border-slate-300 dark:border-zinc-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Rewrite Coverage</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">{Math.round(strength * 0.8 + 10)}%</p>
                </div>
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg border border-slate-300 dark:border-zinc-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Meaning Score</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">{(0.7 + meaningWeight * 0.003).toFixed(2)}</p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-brand-950/30 rounded-lg border border-brand-800">
              <p className="text-xs text-brand-300"><strong>Tip:</strong> These parameters are applied on top of the engine&apos;s defaults. Use the humanizer page to test with different settings.</p>
            </div>
          </div>
        </div>
      )}

      {/* Batch Processing */}
      {activeTab === 'batch' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Upload Documents</h2>
            <div className="flex items-center gap-4">
              <select value={batchEngine} onChange={e => setBatchEngine(e.target.value)} title="Select engine" className="px-3 py-2.5 text-sm border border-slate-300 dark:border-zinc-700 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="humara_v1_3">Humara v1.3 (Stealth)</option>
                <option value="ghost_pro">Ghost Pro (Hybrid)</option>
                <option value="ghost_mini">Ghost Mini (Fast)</option>
                <option value="ninja">Ninja (4-Layer)</option>
                <option value="fast_v11">V1.1 (15-Phase)</option>
              </select>
              <label className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-sm font-medium text-slate-600 dark:text-zinc-300 hover:bg-zinc-700 cursor-pointer transition-colors">
                <Upload className="w-4 h-4" /> Upload .txt files
                <input type="file" accept=".txt" multiple onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            {batchTexts.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-slate-500 dark:text-zinc-400">{batchTexts.length} document{batchTexts.length !== 1 ? 's' : ''} loaded</p>
                {batchTexts.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-zinc-800 rounded-lg border border-slate-300 dark:border-zinc-700">
                    <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <span className="text-sm text-slate-600 dark:text-zinc-300 truncate flex-1">Document {i + 1} — {t.split(/\s+/).length} words</span>
                    {batchResults[i] && <Check className="w-4 h-4 text-emerald-500" />}
                  </div>
                ))}
              </div>
            )}

            {batchProcessing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 dark:text-zinc-400 flex items-center gap-2"><RotateCcw className="w-4 h-4 animate-spin" /> Processing...</span>
                  <span className="font-medium text-brand-600">{batchProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-zinc-700 rounded-full h-2">
                  <div className="bg-brand-600 h-2 rounded-full transition-all" style={{ width: `${batchProgress}%` }} />
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button onClick={processBatch} disabled={batchProcessing || batchTexts.length === 0} className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                {batchProcessing ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Gauge className="w-4 h-4" />}
                Process All
              </button>
              {batchResults.length > 0 && (
                <button onClick={downloadResults} className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 text-sm font-medium rounded-lg hover:bg-zinc-700 transition-colors">
                  <Download className="w-4 h-4" /> Download Results
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Analytics */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6">
            <div className="flex items-center gap-3 mb-6">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <p className="text-sm text-slate-500 dark:text-zinc-400">Analytics dashboard is populated as you humanize more documents. Start processing to see trends.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 bg-slate-100 dark:bg-zinc-800 rounded-xl border border-slate-300 dark:border-zinc-700">
                <p className="text-xs text-slate-500 dark:text-zinc-400 mb-1">Total Documents</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white">—</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Humanized this month</p>
              </div>
              <div className="p-5 bg-slate-100 dark:bg-zinc-800 rounded-xl border border-slate-300 dark:border-zinc-700">
                <p className="text-xs text-slate-500 dark:text-zinc-400 mb-1">Avg AI Score After</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white">—</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Cross all detectors</p>
              </div>
              <div className="p-5 bg-slate-100 dark:bg-zinc-800 rounded-xl border border-slate-300 dark:border-zinc-700">
                <p className="text-xs text-slate-500 dark:text-zinc-400 mb-1">Most Used Engine</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white">—</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Based on usage patterns</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

