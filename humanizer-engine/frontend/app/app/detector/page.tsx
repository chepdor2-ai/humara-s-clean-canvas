'use client';

import { useMemo, useState } from 'react';
import { Search, Trash2, RotateCcw, FileText, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';

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

/* ── Circular Score Ring ──────────────────────────────────────────────── */
const ScoreRing = ({
  score,
  size = 100,
  strokeWidth = 8,
  color,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  color: string;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#f1f5f9"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={`font-bold ${size >= 100 ? 'text-3xl' : size >= 64 ? 'text-xl' : 'text-base'}`}
          style={{ color }}
        >
          {Math.round(score)}%
        </span>
      </div>
    </div>
  );
};

/* ── Detector Brand Logos ─────────────────────────────────────────────── */
const DETECTOR_BRANDS: Record<string, { color: string; bg: string; initials: string }> = {
  GPTZero: { color: '#4F46E5', bg: '#EEF2FF', initials: 'GZ' },
  Turnitin: { color: '#DC2626', bg: '#FEF2F2', initials: 'Tn' },
  'Originality.AI': { color: '#7C3AED', bg: '#F5F3FF', initials: 'OA' },
  'Winston AI': { color: '#059669', bg: '#ECFDF5', initials: 'WA' },
  Copyleaks: { color: '#0891B2', bg: '#ECFEFF', initials: 'CL' },
};

const DetectorLogo = ({ name, size = 36 }: { name: string; size?: number }) => {
  const brand = DETECTOR_BRANDS[name] || {
    color: '#6B7280',
    bg: '#F3F4F6',
    initials: name.slice(0, 2),
  };
  return (
    <div
      className="rounded-xl flex items-center justify-center shrink-0 font-bold"
      style={{
        width: size,
        height: size,
        backgroundColor: brand.bg,
        color: brand.color,
        fontSize: size * 0.32,
      }}
    >
      {brand.initials}
    </div>
  );
};

/* ── Page ──────────────────────────────────────────────────────────────── */
export default function DetectorPage() {
  const [inputText, setInputText] = useState('');
  const [results, setResults] = useState<DetectResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState('');

  const words = useMemo(
    () => inputText.trim().split(/\s+/).filter(Boolean).length,
    [inputText],
  );

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

  const verdictLabel = (v: string) => {
    const l = v.toLowerCase();
    if (l.includes('human'))
      return { text: v, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle2 };
    if (l.includes('ai'))
      return { text: v, cls: 'text-red-600 bg-red-50 border-red-200', icon: AlertTriangle };
    return { text: v, cls: 'text-amber-600 bg-amber-50 border-amber-200', icon: ShieldCheck };
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">AI Checker</h1>
          </div>
          <p className="text-sm text-slate-500 pl-[42px]">
            Multi-detector analysis — scan your text against 5 leading AI detectors
          </p>
        </div>
        {results && (
          <span className="text-xs font-medium text-slate-400 tabular-nums">
            {results.summary.word_count} words &middot; {results.summary.sentence_count} sentences
          </span>
        )}
      </header>

      {/* ── Input Card ──────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm transition-all duration-300 focus-within:border-brand-300 focus-within:shadow-md focus-within:ring-4 focus-within:ring-brand-50">
        {/* toolbar */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            Paste or type your content
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400 font-medium tabular-nums">
            <span>{words} words</span>
            <span className="text-slate-200">|</span>
            <span>{inputText.length} chars</span>
          </div>
        </div>

        {/* textarea */}
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="w-full bg-white outline-none resize-y text-[15px] leading-[1.85] text-slate-800 placeholder:text-slate-300 p-6 min-h-[220px]"
          placeholder="Paste your text here to check for AI-generated content…"
        />

        {/* actions */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 bg-slate-50/50">
          {message ? (
            <div className="text-sm font-medium text-red-600 flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              {message}
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                setInputText('');
                setResults(null);
                setMessage('');
              }}
              className="px-4 py-2.5 border border-slate-200 bg-white rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
            <button
              onClick={handleAnalyze}
              disabled={isProcessing}
              className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-sm hover:shadow-md active:scale-[0.98]"
            >
              {isProcessing ? (
                <RotateCcw className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {isProcessing ? 'Scanning…' : 'Analyze Text'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Results Dashboard ───────────────────────────────────────── */}
      {results && (() => {
        const verdict = verdictLabel(results.summary.overall_verdict);
        const VerdictIcon = verdict.icon;
        return (
          <div className="space-y-5 animate-in slide-in-from-bottom-4 fade-in duration-700">
            {/* Score Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* AI Score — always red */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 flex items-center gap-5 shadow-sm">
                <ScoreRing
                  score={results.summary.overall_ai_score}
                  size={80}
                  strokeWidth={7}
                  color="#ef4444"
                />
                <div>
                  <h3 className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1">
                    AI Score
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-red-500 tracking-tight tabular-nums">
                      {Math.round(results.summary.overall_ai_score)}
                    </span>
                    <span className="text-base font-semibold text-red-300">%</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {results.summary.detectors_flagged_ai} detector{results.summary.detectors_flagged_ai !== 1 ? 's' : ''} flagged
                  </p>
                </div>
              </div>

              {/* Human Score — always green */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 flex items-center gap-5 shadow-sm">
                <ScoreRing
                  score={results.summary.overall_human_score}
                  size={80}
                  strokeWidth={7}
                  color="#10b981"
                />
                <div>
                  <h3 className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1">
                    Human Score
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-emerald-500 tracking-tight tabular-nums">
                      {Math.round(results.summary.overall_human_score)}
                    </span>
                    <span className="text-base font-semibold text-emerald-300">%</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {results.summary.detectors_flagged_human} detector{results.summary.detectors_flagged_human !== 1 ? 's' : ''} passed
                  </p>
                </div>
              </div>

              {/* Verdict */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-center shadow-sm">
                <h3 className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-3">
                  Final Verdict
                </h3>
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl border ${verdict.cls}`}
                  >
                    <VerdictIcon className="w-4 h-4" />
                    {verdict.text}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-3">
                  Based on {results.summary.total_detectors} detection engines
                </p>
              </div>
            </div>

            {/* Detector Breakdown */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Detector Breakdown</h3>
                <div className="flex items-center gap-4 text-[11px] font-semibold text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400" /> AI
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Human
                  </span>
                </div>
              </div>

              <div className="divide-y divide-slate-50">
                {[...results.detectors]
                  .sort((a, b) => b.ai_score - a.ai_score)
                  .map((row) => {
                    const v = row.verdict ?? (row.ai_score >= 50 ? 'AI' : 'Human');
                    const vStyle = verdictLabel(v);
                    return (
                      <div
                        key={row.detector}
                        className="group flex flex-col md:flex-row md:items-center gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors"
                      >
                        {/* Detector identity */}
                        <div className="flex items-center gap-3 md:w-[170px] shrink-0">
                          <DetectorLogo name={row.detector} />
                          <span className="text-sm font-semibold text-slate-900">
                            {row.detector}
                          </span>
                        </div>

                        {/* Score bars */}
                        <div className="flex-1 flex flex-col md:flex-row items-center gap-4">
                          {/* AI bar — always red */}
                          <div className="w-full md:flex-1 flex items-center gap-3">
                            <span className="w-10 text-xs font-bold text-right text-red-500 tabular-nums">
                              {Math.round(row.ai_score)}%
                            </span>
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-red-400 transition-all duration-700 ease-out"
                                style={{ width: `${row.ai_score}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-semibold text-slate-400 w-7">AI</span>
                          </div>

                          {/* Human bar — always green */}
                          <div className="w-full md:flex-1 flex items-center gap-3">
                            <span className="w-10 text-xs font-bold text-right text-emerald-500 tabular-nums">
                              {Math.round(row.human_score)}%
                            </span>
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-emerald-400 transition-all duration-700 ease-out"
                                style={{ width: `${row.human_score}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-semibold text-slate-400 w-7">
                              Hum
                            </span>
                          </div>
                        </div>

                        {/* Verdict */}
                        <div className="md:w-[100px] shrink-0 flex items-center justify-start md:justify-end">
                          <span
                            className={`text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-lg border ${vStyle.cls}`}
                          >
                            {v}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
