'use client';

import { useMemo, useState } from 'react';
import { Search, Trash2, RotateCcw, FileText, BarChart3 } from 'lucide-react';

type DetectorRow = {
  detector: string;
  ai_score: number;
  human_score: number;
  verdict?: string;
};

type DetectResponse = {
  detectors: DetectorRow[];
  summary: {
    overall_ai_score: number;
    overall_human_score: number;
    overall_verdict: string;
    detectors_flagged_ai: number;
    detectors_flagged_human: number;
    detectors_uncertain: number;
    total_detectors: number;
    word_count: number;
    sentence_count: number;
  };
  error?: string;
};

/* ── Circular Progress Meter ──────────────────────────────────────────── */
const CircularProgress = ({ score, size = 100, strokeWidth = 8, color }: { score: number; size?: number; strokeWidth?: number; color?: string }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const resolvedColor = color || (score <= 20 ? '#10b981' : score <= 75 ? '#eab308' : '#ef4444');

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#f1f5f9" strokeWidth={strokeWidth} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={resolvedColor} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`font-bold ${size >= 100 ? 'text-2xl' : 'text-lg'}`} style={{ color: resolvedColor }}>
          {Math.round(score)}%
        </span>
      </div>
    </div>
  );
};

/* ── Detector Brand Logos ─────────────────────────────────────────────── */
const DETECTOR_BRANDS: Record<string, { color: string; bg: string; initials: string; imgUrl: string }> = {
  'GPTZero': {
    color: '#4F46E5', bg: '#EEF2FF', initials: 'GZ',
    imgUrl: 'https://www.google.com/s2/favicons?domain=gptzero.me&sz=64'
  },
  'Turnitin': {
    color: '#DC2626', bg: '#FEF2F2', initials: 'Tn',
    imgUrl: 'https://www.google.com/s2/favicons?domain=turnitin.com&sz=64'
  },
  'Originality.AI': {
    color: '#7C3AED', bg: '#F5F3FF', initials: 'OA',
    imgUrl: 'https://www.google.com/s2/favicons?domain=originality.ai&sz=64'
  },
  'Winston AI': {
    color: '#059669', bg: '#ECFDF5', initials: 'WA',
    imgUrl: 'https://www.google.com/s2/favicons?domain=gowinston.ai&sz=64'
  },
  'Copyleaks': {
    color: '#0891B2', bg: '#ECFEFF', initials: 'CL',
    imgUrl: 'https://www.google.com/s2/favicons?domain=copyleaks.com&sz=64'
  },
};

const DetectorLogo = ({ name, size = 40 }: { name: string; size?: number }) => {
  const brand = DETECTOR_BRANDS[name] || { color: '#6B7280', bg: '#F3F4F6', initials: name.slice(0, 2), imgUrl: '' };
  return (
    <div
      className="rounded-xl flex items-center justify-center shrink-0 overflow-hidden shadow-sm"
      style={{ width: size, height: size, backgroundColor: brand.bg, color: brand.color }}
    >
      {brand.imgUrl ? 
        <img src={brand.imgUrl} alt={`${name} logo`} className="w-2/3 h-2/3 object-contain" /> : 
        <span className="font-bold" style={{ fontSize: size * 0.35 }}>{brand.initials}</span>
      }
    </div>
  );
};

/* ── Page ──────────────────────────────────────────────────────────────── */
export default function DetectorPage() {
  const [inputText, setInputText] = useState('');
  const [results, setResults] = useState<DetectResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState('');

  const words = useMemo(() => inputText.trim().split(/\s+/).filter(Boolean).length, [inputText]);

  const handleAnalyze = async () => {
    if (!inputText.trim()) return setMessage('Please enter text to analyze.');
    if (words < 10) return setMessage('Please enter at least 10 words for analysis.');

    setIsProcessing(true);
    setMessage('');
    setResults(null);

    try {
      const response = await fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      });

      const data = (await response.json()) as DetectResponse;
      if (!response.ok || data.error) throw new Error(data.error || 'Detection failed.');
      setResults(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unexpected error.');
    } finally {
      setIsProcessing(false);
    }
  };

  const verdictStyle = (v: string) => {
    const l = v.toLowerCase();
    if (l.includes('human')) return 'text-green-600 bg-green-50 border-green-200';
    if (l.includes('ai')) return 'text-red-600 bg-red-50 border-red-200';
    return 'text-yellow-600 bg-yellow-50 border-yellow-200';
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-700">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI Detection</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Run multi-detector analysis and review every score in one place</p>
      </header>

      {/* Input / Pasting Pane */}
      <div className="bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden transition-all duration-300 focus-within:border-brand-300 focus-within:shadow-md focus-within:ring-4 focus-within:ring-brand-50/50">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/60">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-400" />
            Document Analysis
          </h2>
          <div className="flex items-center gap-3 text-xs font-semibold text-gray-500">
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 border border-gray-200 rounded-md shadow-sm">
              <span className="text-gray-900">{words}</span> words
            </div>
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 border border-gray-200 rounded-md shadow-sm">
              <span className="text-gray-900">{inputText.length}</span> chars
            </div>
          </div>
        </div>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="w-full bg-white dark:bg-slate-900 outline-none resize-y text-[15px] leading-loose text-gray-800 dark:text-gray-200 placeholder:text-gray-300 dark:placeholder:text-gray-600 p-6 min-h-[220px]"
          placeholder="Paste your text here to run it against our multi-detector engine..."
        />
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/60">
          {message ? (
            <div className="text-sm font-medium text-red-600 flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-md border border-red-100">
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              {message}
            </div>
          ) : <div />}
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setInputText(''); setResults(null); setMessage(''); }}
              className="px-5 py-2.5 border border-gray-200 bg-white rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 transition-all flex items-center gap-2 shadow-sm"
            >
              <Trash2 className="w-4 h-4" /> Clear
            </button>
            <button
              onClick={handleAnalyze}
              disabled={isProcessing}
              className="px-7 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-md hover:shadow-lg transform active:scale-[0.98]"
            >
              {isProcessing ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {isProcessing ? 'Analyzing...' : 'Analyze Text'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {results && (
        <div className="bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-700 rounded-2xl shadow-sm mt-4 overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-700">
          
          {/* Unified Summary Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100 dark:divide-slate-800 border-b border-gray-100 dark:border-slate-800 bg-gray-50/30 dark:bg-slate-800/30">
            <div className="p-6 md:p-8 flex items-center justify-center md:justify-start gap-6">
              <CircularProgress score={results.summary.overall_ai_score} size={64} strokeWidth={6} color="#ef4444" />
              <div>
                <h3 className="text-[11px] font-extrabold tracking-wide text-gray-400 mb-1">AI Score</h3>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-red-500 tracking-tight">{Math.round(results.summary.overall_ai_score)}</span>
                  <span className="text-lg font-bold text-red-300">%</span>
                </div>
              </div>
            </div>
            
            <div className="p-6 md:p-8 flex items-center justify-center md:justify-start gap-6">
              <CircularProgress score={100 - results.summary.overall_ai_score} size={64} strokeWidth={6} color="#10b981" />
              <div>
                <h3 className="text-[11px] font-extrabold tracking-wide text-gray-400 mb-1">Human Score</h3>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-emerald-500 tracking-tight">{Math.round(100 - results.summary.overall_ai_score)}</span>
                  <span className="text-lg font-bold text-emerald-300">%</span>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-8 flex flex-col justify-center items-center md:items-start">
              <h3 className="text-[11px] font-extrabold tracking-wide text-gray-400 mb-3">Final Verdict</h3>
              <div className="flex items-center gap-3">
                <span className={`text-[15px] font-black px-4 py-1.5 rounded-lg border-2 shadow-sm ${verdictStyle(results.summary.overall_verdict)}`}>
                  {results.summary.overall_verdict}
                </span>
                <span className="text-xs font-bold text-gray-400 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" />
                  {results.summary.total_detectors} checks
                </span>
              </div>
            </div>
          </div>

          {/* Premium Detector List */}
          <div className="bg-white dark:bg-slate-900">
            <div className="px-6 md:px-8 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-gray-900 dark:text-white">Detector Breakdown</h3>
              <span className="text-[11px] font-bold text-gray-400 tracking-wide">Engine Analysis</span>
            </div>
            
            <div className="divide-y divide-gray-50 dark:divide-slate-800">
              {[...results.detectors].sort((a, b) => b.ai_score - a.ai_score).map((row) => {
                const verdict = row.verdict ?? (row.ai_score >= 50 ? 'AI' : 'Human');
                return (
                  <div key={row.detector} className="group flex flex-col md:flex-row md:items-center gap-6 px-6 md:px-8 py-5 hover:bg-gray-50/60 dark:hover:bg-slate-800/60 transition-all duration-200">
                    
                    {/* Identifier */}
                    <div className="flex items-center gap-4 md:w-[220px] shrink-0 transition-transform group-hover:translate-x-1">
                      <DetectorLogo name={row.detector} size={40} />
                      <div>
                        <span className="text-[15px] font-bold text-gray-900 dark:text-white block mb-0.5">{row.detector}</span>
                        <span className="text-[11px] font-semibold text-gray-400 tracking-wide">Detection Engine</span>
                      </div>
                    </div>

                    {/* Unified Dual Bar */}
                    <div className="flex-1 flex items-center gap-4">
                      <div className="flex items-center gap-1.5 w-[70px] shrink-0 justify-end">
                        <span className="text-xs font-bold text-red-500 tabular-nums">{Math.round(row.ai_score)}%</span>
                        <span className="text-[10px] text-slate-300">AI</span>
                      </div>
                      <div className="flex-1 h-1.5 bg-emerald-400/80 dark:bg-emerald-500/60 rounded-full overflow-hidden flex shadow-inner">
                        <div className="h-full bg-red-400 dark:bg-red-500 transition-all duration-1000 ease-out" style={{ width: `${row.ai_score}%` }} />
                      </div>
                      <div className="flex items-center gap-1.5 w-[70px] shrink-0">
                        <span className="text-xs font-bold text-emerald-500 tabular-nums">{Math.round(100 - row.ai_score)}%</span>
                        <span className="text-[10px] text-slate-300">Human</span>
                      </div>
                    </div>

                    {/* Minimal Verdict Pill */}
                    <div className="md:w-[120px] shrink-0 flex items-center justify-start md:justify-end">
                      <span className={`text-[11px] font-bold tracking-widest px-3 py-1.5 rounded-md border ${verdictStyle(verdict)} bg-transparent`}>
                        {verdict}
                      </span>
                    </div>

                  </div>
                );
              })}
            </div>

            {/* Average Score */}
            <div className="px-6 md:px-8 py-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/40 dark:bg-slate-800/40 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-600 dark:text-gray-300">Average</span>
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold text-red-500 tabular-nums">
                  {Math.round(results.detectors.reduce((s, d) => s + d.ai_score, 0) / results.detectors.length)}% AI
                </span>
                <span className="text-sm font-bold text-emerald-500 tabular-nums">
                  {Math.round(100 - results.detectors.reduce((s, d) => s + d.ai_score, 0) / results.detectors.length)}% Human
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
