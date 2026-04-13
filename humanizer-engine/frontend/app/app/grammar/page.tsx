'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  CheckCircle2, AlertTriangle, Info, Sparkles, Copy, Check,
  ArrowRight, Eraser, ClipboardPaste, RefreshCw, Lightbulb, Zap,
  Shield, BookOpen, Settings2, Brain, ChevronDown, ChevronUp,
  FileText, AlignLeft, TrendingUp, Waves,
} from 'lucide-react';
import Link from 'next/link';
import {
  GrammarChecker,
  type Issue,
  type Severity,
  type CorrectionResult,
  type SentenceAnalysis,
  type ScoreBreakdown,
} from '@/lib/engine/grammar-corrector';

/* ── Severity config ──────────────────────────────────────────────────────── */

const SEV: Record<Severity, { label: string; color: string; bg: string; border: string; icon: typeof AlertTriangle; dot: string; underline: string }> = {
  error:   { label: 'Error',   color: 'text-red-500',   bg: 'bg-red-50 dark:bg-red-950/30',    border: 'border-red-200 dark:border-red-800/40',    icon: AlertTriangle, dot: 'bg-red-500',   underline: 'decoration-red-500/80 bg-red-50/60 dark:bg-red-950/20' },
  warning: { label: 'Warning', color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800/40', icon: Info,          dot: 'bg-amber-500', underline: 'decoration-amber-500/80 bg-amber-50/60 dark:bg-amber-950/20' },
  style:   { label: 'Style',   color: 'text-blue-500',  bg: 'bg-blue-50 dark:bg-blue-950/30',   border: 'border-blue-200 dark:border-blue-800/40',   icon: Lightbulb,    dot: 'bg-blue-500',  underline: 'decoration-blue-500/60 bg-blue-50/60 dark:bg-blue-950/20' },
};

/* ── Score ring component ─────────────────────────────────────────────────── */

function ScoreRing({ score, label, size = 'lg', color }: { score: number; label: string; size?: 'lg' | 'sm'; color?: string }) {
  const r = size === 'lg' ? 42 : 28;
  const sv = size === 'lg' ? 100 : 70;
  const sw = size === 'lg' ? 6 : 4;
  const circ = 2 * Math.PI * r;
  const off = circ - (score / 100) * circ;
  const c = color || (score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444');

  return (
    <div className={`flex flex-col items-center gap-1 ${size === 'lg' ? 'w-28' : 'w-16'}`}>
      <div className={`relative ${size === 'lg' ? 'w-28 h-28' : 'w-16 h-16'}`}>
        <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${sv} ${sv}`}>
          <circle cx={sv / 2} cy={sv / 2} r={r} fill="none" strokeWidth={sw}
            className="stroke-slate-200 dark:stroke-zinc-800" />
          <circle cx={sv / 2} cy={sv / 2} r={r} fill="none" stroke={c} strokeWidth={sw}
            strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off}
            className="transition-all duration-700 ease-out" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-bold text-slate-900 dark:text-white ${size === 'lg' ? 'text-2xl' : 'text-sm'}`}>{score}</span>
        </div>
      </div>
      <span className={`font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider ${size === 'lg' ? 'text-[10px]' : 'text-[8px]'}`}>{label}</span>
    </div>
  );
}

/* ── Issue card ───────────────────────────────────────────────────────────── */

function IssueCard({ issue, isActive, onSelect, onApplyFix }: {
  issue: Issue; isActive: boolean; onSelect: () => void; onApplyFix: (r: string) => void;
}) {
  const cfg = SEV[issue.severity];
  const Icon = cfg.icon;

  return (
    <button onClick={onSelect} className={`w-full text-left rounded-xl border p-3 transition-all duration-200 group
      ${isActive ? `${cfg.bg} ${cfg.border} ring-2 ring-offset-1 ring-purple-400/50 dark:ring-offset-zinc-900`
        : 'bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 hover:border-purple-300 dark:hover:border-purple-700/50 hover:shadow-md'}`}
    >
      <div className="flex items-start gap-2.5">
        <div className={`mt-0.5 p-1 rounded-lg ${cfg.bg}`}>
          <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
            <span className="text-[10px] text-slate-400 dark:text-zinc-600">•</span>
            <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-medium">{issue.category}</span>
            {issue.aiDetected && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 font-bold">AI</span>
            )}
          </div>
          <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">{issue.message}</p>
          {issue.replacements.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {issue.replacements.slice(0, 3).map((rep, i) => (
                <button key={i} onClick={(e) => { e.stopPropagation(); onApplyFix(rep); }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold
                    bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400
                    border border-green-200 dark:border-green-800/40 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors">
                  <ArrowRight className="w-2.5 h-2.5" />
                  {rep || '(remove)'}
                </button>
              ))}
            </div>
          )}
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${
                issue.confidence >= 0.9 ? 'bg-green-500' : issue.confidence >= 0.7 ? 'bg-amber-400' : 'bg-red-400'
              }`} style={{ width: `${issue.confidence * 100}%` }} />
            </div>
            <span className="text-[9px] text-slate-400 dark:text-zinc-600 font-mono">{Math.round(issue.confidence * 100)}%</span>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ── Highlighted text with wavy underlines ────────────────────────────────── */

function HighlightedText({ text, issues, activeIdx, onClick }: {
  text: string; issues: Issue[]; activeIdx: number | null; onClick: (i: number) => void;
}) {
  const segments = useMemo(() => {
    if (!issues.length) return [{ text, isIssue: false, idx: -1, sev: 'error' as Severity, ai: false }];
    const sorted = [...issues].sort((a, b) => a.start - b.start);
    const parts: { text: string; isIssue: boolean; idx: number; sev: Severity; ai: boolean }[] = [];
    let cursor = 0;
    for (const issue of sorted) {
      const realIdx = issues.indexOf(issue);
      if (issue.start > cursor) parts.push({ text: text.slice(cursor, issue.start), isIssue: false, idx: -1, sev: 'error', ai: false });
      if (issue.end > cursor) {
        parts.push({ text: text.slice(Math.max(cursor, issue.start), issue.end), isIssue: true, idx: realIdx, sev: issue.severity, ai: !!issue.aiDetected });
        cursor = issue.end;
      }
    }
    if (cursor < text.length) parts.push({ text: text.slice(cursor), isIssue: false, idx: -1, sev: 'error', ai: false });
    return parts;
  }, [text, issues]);

  return (
    <div className="text-[15px] leading-[1.9] text-slate-800 dark:text-zinc-200 whitespace-pre-wrap font-[inherit]">
      {segments.map((s, i) =>
        s.isIssue ? (
          <span key={i} onClick={() => onClick(s.idx)}
            className={`underline decoration-wavy decoration-2 underline-offset-4 rounded-sm px-0.5 -mx-0.5 cursor-pointer transition-all duration-200
              ${s.ai ? 'decoration-purple-500/80 bg-purple-50/60 dark:bg-purple-950/20' : SEV[s.sev].underline}
              ${activeIdx === s.idx ? 'ring-2 ring-purple-400/60 ring-offset-1 dark:ring-offset-zinc-900' : ''} hover:opacity-80`}>
            {s.text}
          </span>
        ) : <span key={i}>{s.text}</span>
      )}
    </div>
  );
}

/* ── Sentence-by-sentence view ────────────────────────────────────────────── */

function SentenceView({ sentences, onSentenceClick, activeSentence }: {
  sentences: SentenceAnalysis[]; onSentenceClick: (i: number) => void; activeSentence: number | null;
}) {
  return (
    <div className="space-y-1.5">
      {sentences.map((s, i) => {
        const scoreColor = s.score >= 80 ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30' :
          s.score >= 50 ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30' :
          'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30';
        const borderColor = s.score >= 80 ? 'border-green-200 dark:border-green-900/40' :
          s.score >= 50 ? 'border-amber-200 dark:border-amber-900/40' : 'border-red-200 dark:border-red-900/40';
        const isActive = activeSentence === i;

        return (
          <button key={i} onClick={() => onSentenceClick(i)}
            className={`w-full text-left p-3 rounded-xl border transition-all duration-200
              ${isActive ? `${borderColor} ring-2 ring-purple-400/40 ring-offset-1 dark:ring-offset-zinc-900` :
                `border-slate-100 dark:border-zinc-800/60 hover:border-slate-300 dark:hover:border-zinc-700`}
              bg-white dark:bg-zinc-900/40`}>
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 px-2 py-1 rounded-lg text-[11px] font-bold ${scoreColor}`}>
                {s.score}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed line-clamp-2">{s.text}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {s.issues.length > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 font-semibold">
                      {s.issues.length} issue{s.issues.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {s.tense !== 'unknown' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-500">
                      {s.tense}
                    </span>
                  )}
                  {s.isPassive && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400">
                      passive
                    </span>
                  )}
                  {s.isFragment && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400">
                      fragment
                    </span>
                  )}
                  {s.isRunOn && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400">
                      run-on
                    </span>
                  )}
                  <span className="text-[9px] text-slate-400 dark:text-zinc-600">{s.wordCount}w</span>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ── Stat badge ───────────────────────────────────────────────────────────── */

function StatBadge({ count, severity }: { count: number; severity: Severity }) {
  const c = SEV[severity];
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${c.bg} ${c.color} border ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {count} {c.label}{count !== 1 ? 's' : ''}
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────────── */

const EXAMPLE = `She don't like apples. I have went to the store yesterday. Their going to a university soon. The the cat sat on a mat. He have many informations about the enviromment. Me and him went to the store , and buyed a apple. The results of the study is clear. I seen him at the park and he dont care about they're feelings. She recieve the package and then she go home. However the weather was nice outside. Dr. smith told me to come back tommorow but i cant make it. Between you and I the test was definately harder then expected.`;

type RightTab = 'issues' | 'sentences';

export default function GrammarPage() {
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState<CorrectionResult | null>(null);
  const [activeIssue, setActiveIssue] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [showCorrected, setShowCorrected] = useState(false);
  const [filterSev, setFilterSev] = useState<Severity | 'all'>('all');
  const [rightTab, setRightTab] = useState<RightTab>('issues');
  const [activeSentence, setActiveSentence] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const issueListRef = useRef<HTMLDivElement>(null);

  const checker = useMemo(() => new GrammarChecker(), []);

  const handleCheck = useCallback(async () => {
    if (!inputText.trim()) return;
    const newChecker = new GrammarChecker();
    const r = newChecker.check(inputText);

    // If AI is enabled, fetch AI highlights and merge
    if (aiEnabled) {
      setAiLoading(true);
      setResult(r); // Show rule-based results immediately
      try {
        const res = await fetch('/api/grammar-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: inputText }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.issues?.length > 0) {
            newChecker.mergeAiIssues(data.issues);
            const merged = newChecker.check(inputText);
            // Keep AI issues from the merge
            for (const ai of data.issues) {
              const exists = merged.issues.some(
                (i: Issue) => Math.abs(i.start - ai.start) < 3 && Math.abs(i.end - ai.end) < 3
              );
              if (!exists) {
                merged.issues.push({
                  ruleId: 'ai_detected', message: ai.message, severity: ai.severity as Severity,
                  start: ai.start, end: ai.end, replacements: [], confidence: 0.8,
                  category: ai.category, sentenceIndex: 0, aiDetected: true,
                });
              }
            }
            merged.issues.sort((a: Issue, b: Issue) => a.start - b.start);
            setResult(merged);
          }
        }
      } catch { /* AI failed, rule-based results still shown */ }
      setAiLoading(false);
    } else {
      setResult(r);
    }
    setActiveIssue(null);
    setShowCorrected(false);
    setActiveSentence(null);
  }, [inputText, aiEnabled, checker]);

  const handlePaste = useCallback(async () => {
    try { setInputText(await navigator.clipboard.readText()); } catch { /* denied */ }
  }, []);

  const handleClear = useCallback(() => {
    setInputText(''); setResult(null); setActiveIssue(null); setActiveSentence(null);
  }, []);

  const handleCopy = useCallback(() => {
    if (!result) return;
    navigator.clipboard.writeText(showCorrected ? result.output : result.input);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }, [result, showCorrected]);

  const handleApplyFix = useCallback((idx: number, rep: string) => {
    if (!result) return;
    const issue = result.issues[idx];
    if (!issue) return;
    const newText = inputText.slice(0, issue.start) + rep + inputText.slice(issue.end);
    setInputText(newText);
    const r = new GrammarChecker().check(newText);
    setResult(r); setActiveIssue(null);
  }, [result, inputText]);

  const filteredIssues = useMemo(() => {
    if (!result) return [];
    let issues = result.issues;
    if (activeSentence !== null) {
      issues = issues.filter(i => i.sentenceIndex === activeSentence);
    }
    if (filterSev !== 'all') issues = issues.filter(i => i.severity === filterSev);
    return issues;
  }, [result, filterSev, activeSentence]);

  const wordCount = useMemo(() => inputText.trim().split(/\s+/).filter(Boolean).length, [inputText]);

  useEffect(() => {
    if (activeIssue !== null && issueListRef.current) {
      const card = issueListRef.current.children[activeIssue] as HTMLElement | undefined;
      card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeIssue]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#07070D]">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <Link href="/app" className="text-slate-400 dark:text-zinc-600 hover:text-purple-500 transition-colors">
                <ArrowRight className="w-4 h-4 rotate-180" />
              </Link>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
                  <BookOpen className="w-4 h-4 text-white" />
                </div>
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">Grammar Checker</h1>
              </div>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40">
                Rule-Based Engine
              </span>
              {aiEnabled && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/40">
                  <Brain className="w-3 h-3" /> + AI Highlights
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {result && (
                <div className="hidden sm:flex items-center gap-1.5 mr-2">
                  <StatBadge count={result.stats.errors} severity="error" />
                  <StatBadge count={result.stats.warnings} severity="warning" />
                  <StatBadge count={result.stats.style} severity="style" />
                </div>
              )}
              <button onClick={() => setShowSettings(!showSettings)} title="Advanced settings"
                className={`p-2 rounded-xl transition-all ${showSettings ? 'bg-purple-100 dark:bg-purple-950/40 text-purple-600' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800'}`}>
                <Settings2 className="w-4 h-4" />
              </button>
              <button onClick={handleCheck} disabled={!inputText.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                  bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25
                  hover:shadow-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:-translate-y-0.5">
                <Zap className="w-4 h-4" />
                {aiLoading ? 'Analyzing…' : 'Check Grammar'}
              </button>
            </div>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="pb-3 pt-1 border-t border-slate-100 dark:border-zinc-800/60">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <div className={`relative w-10 h-5 rounded-full transition-colors ${aiEnabled ? 'bg-purple-500' : 'bg-slate-200 dark:bg-zinc-700'}`}
                    onClick={() => setAiEnabled(!aiEnabled)}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${aiEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <Brain className="w-3.5 h-3.5 text-purple-500" /> AI Grammar Highlights
                    </span>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-500">AI detects additional errors • Corrections remain rule-based (no rewriting)</p>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <div className="max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <div className="flex flex-col lg:flex-row gap-5 min-h-[calc(100vh-140px)]">

          {/* ── Left: Editor ───────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm overflow-hidden flex flex-col">
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/30">
                <div className="flex items-center gap-1.5">
                  <button onClick={handlePaste} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                    <ClipboardPaste className="w-3.5 h-3.5" /> Paste
                  </button>
                  <button onClick={handleClear} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                    <Eraser className="w-3.5 h-3.5" /> Clear
                  </button>
                  <button onClick={() => { setInputText(EXAMPLE); setResult(null); }}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-colors">
                    <Sparkles className="w-3.5 h-3.5" /> Example
                  </button>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-zinc-600">
                  <span>{wordCount} words</span>
                  <span>{inputText.length} chars</span>
                  {result && <span>{result.sentences.length} sentences</span>}
                </div>
              </div>

              {/* Editor / highlighted display */}
              {!result ? (
                <textarea value={inputText} onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCheck(); }}
                  placeholder="Paste or type your text here to check grammar, spelling, punctuation, sentence structure, and style…"
                  className="flex-1 w-full p-6 text-[15px] leading-[1.9] resize-none outline-none bg-transparent text-slate-800 dark:text-zinc-200 placeholder:text-slate-400 dark:placeholder:text-zinc-600 font-[inherit]" />
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div className="sticky top-0 z-10 px-4 py-2 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-slate-100 dark:border-zinc-800/50">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setShowCorrected(false)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${!showCorrected ? 'bg-slate-900 dark:bg-white text-white dark:text-zinc-900 shadow-md' : 'text-slate-500 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800'}`}>
                        Original + Issues
                      </button>
                      <button onClick={() => setShowCorrected(true)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${showCorrected ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20' : 'text-slate-500 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800'}`}>
                        <CheckCircle2 className="w-3 h-3" /> Corrected
                      </button>
                      <div className="flex-1" />
                      <button onClick={handleCopy}
                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                      <button onClick={() => setResult(null)}
                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                        <RefreshCw className="w-3.5 h-3.5" /> Edit
                      </button>
                    </div>
                  </div>
                  <div className="p-6">
                    {showCorrected ? (
                      <div className="text-[15px] leading-[1.9] text-slate-800 dark:text-zinc-200 whitespace-pre-wrap font-[inherit]">{result.output}</div>
                    ) : (
                      <HighlightedText text={result.input} issues={result.issues} activeIdx={activeIssue} onClick={setActiveIssue} />
                    )}
                  </div>
                </div>
              )}
            </div>
            {!result && inputText.trim() && (
              <p className="mt-2 text-center text-[11px] text-slate-400 dark:text-zinc-600">
                Press <kbd className="px-1 py-0.5 rounded border border-slate-200 dark:border-zinc-700 text-[10px] font-mono bg-slate-100 dark:bg-zinc-800">Ctrl</kbd>+<kbd className="px-1 py-0.5 rounded border border-slate-200 dark:border-zinc-700 text-[10px] font-mono bg-slate-100 dark:bg-zinc-800">Enter</kbd> to check
              </p>
            )}
          </div>

          {/* ── Right: Scores + Issues/Sentences ───────────────────────── */}
          <div className="w-full lg:w-[400px] xl:w-[440px] flex-shrink-0 flex flex-col gap-4">

            {/* Score dashboard */}
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm p-5">
              {result ? (
                <div>
                  <div className="flex items-center justify-center gap-4 mb-4">
                    <ScoreRing score={result.scores.overall} label="Overall" size="lg" />
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <ScoreRing score={result.scores.grammar} label="Grammar" size="sm" color="#ef4444" />
                    <ScoreRing score={result.scores.naturalness} label="Natural" size="sm" color="#8b5cf6" />
                    <ScoreRing score={result.scores.clarity} label="Clarity" size="sm" color="#3b82f6" />
                    <ScoreRing score={result.scores.flow} label="Flow" size="sm" color="#06b6d4" />
                  </div>
                  <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                    <StatBadge count={result.stats.errors} severity="error" />
                    <StatBadge count={result.stats.warnings} severity="warning" />
                    <StatBadge count={result.stats.style} severity="style" />
                  </div>
                  {aiLoading && (
                    <div className="mt-2 text-center text-[11px] text-purple-500 animate-pulse flex items-center justify-center gap-1.5">
                      <Brain className="w-3.5 h-3.5" /> AI analyzing…
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-950/40 dark:to-teal-950/40 mb-3">
                    <Shield className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Grammar Analysis</h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-500 max-w-[260px]">
                    Paste text and click &quot;Check Grammar&quot; to analyze grammar, naturalness, clarity, and flow.
                  </p>
                </div>
              )}
            </div>

            {/* Tab selector: Issues / Sentences */}
            {result && (
              <>
                <div className="flex items-center gap-1 bg-white dark:bg-zinc-900/50 rounded-xl border border-slate-200 dark:border-zinc-800 p-1">
                  <button onClick={() => { setRightTab('issues'); setActiveSentence(null); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all
                      ${rightTab === 'issues' ? 'bg-slate-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm' : 'text-slate-500 dark:text-zinc-500 hover:bg-slate-50 dark:hover:bg-zinc-800'}`}>
                    <FileText className="w-3.5 h-3.5" /> Issues ({result.issues.length})
                  </button>
                  <button onClick={() => setRightTab('sentences')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all
                      ${rightTab === 'sentences' ? 'bg-slate-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm' : 'text-slate-500 dark:text-zinc-500 hover:bg-slate-50 dark:hover:bg-zinc-800'}`}>
                    <AlignLeft className="w-3.5 h-3.5" /> Sentences ({result.sentences.length})
                  </button>
                </div>

                {/* Issues panel */}
                {rightTab === 'issues' && result.issues.length > 0 && (
                  <div className="flex-1 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm overflow-hidden flex flex-col">
                    {/* Filters */}
                    <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/30">
                      {(['all', 'error', 'warning', 'style'] as const).map(sev => {
                        const cnt = sev === 'all'
                          ? (activeSentence !== null ? result.issues.filter(i => i.sentenceIndex === activeSentence).length : result.issues.length)
                          : (activeSentence !== null ? result.issues.filter(i => i.sentenceIndex === activeSentence && i.severity === sev).length : result.issues.filter(i => i.severity === sev).length);
                        return (
                          <button key={sev} onClick={() => setFilterSev(sev)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all
                              ${filterSev === sev ? 'bg-slate-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm' : 'text-slate-500 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800'}`}>
                            {sev === 'all' ? 'All' : SEV[sev].label} ({cnt})
                          </button>
                        );
                      })}
                      {activeSentence !== null && (
                        <button onClick={() => setActiveSentence(null)}
                          className="ml-auto text-[10px] text-purple-500 hover:text-purple-600 font-medium">
                          Clear filter
                        </button>
                      )}
                    </div>
                    <div ref={issueListRef} className="flex-1 overflow-y-auto p-2.5 space-y-1.5 max-h-[calc(100vh-480px)]">
                      {filteredIssues.map((issue, i) => {
                        const realIdx = result.issues.indexOf(issue);
                        return (
                          <IssueCard key={`${issue.ruleId}-${issue.start}-${i}`} issue={issue}
                            isActive={activeIssue === realIdx}
                            onSelect={() => setActiveIssue(activeIssue === realIdx ? null : realIdx)}
                            onApplyFix={(rep) => handleApplyFix(realIdx, rep)} />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Sentences panel */}
                {rightTab === 'sentences' && (
                  <div className="flex-1 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/30">
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">Sentence-by-Sentence Analysis</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2.5 max-h-[calc(100vh-480px)]">
                      <SentenceView sentences={result.sentences}
                        activeSentence={activeSentence}
                        onSentenceClick={(i) => {
                          setActiveSentence(activeSentence === i ? null : i);
                          setRightTab('issues');
                        }} />
                    </div>
                  </div>
                )}

                {/* No issues state */}
                {rightTab === 'issues' && filteredIssues.length === 0 && (
                  <div className="flex-1 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm flex flex-col items-center justify-center p-8 text-center">
                    <div className="p-3 rounded-2xl bg-green-50 dark:bg-green-950/30 mb-3">
                      <CheckCircle2 className="w-10 h-10 text-green-500" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                      {activeSentence !== null ? 'No issues in this sentence' : 'No issues found'}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-500">
                      {activeSentence !== null ? 'This sentence looks correct!' : 'Your text looks grammatically correct!'}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* How it works panel (no result) */}
            {!result && (
              <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm p-5">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">What we analyze</h3>
                <div className="space-y-2">
                  {[
                    { icon: '🔤', label: 'Spelling & Abbreviations', desc: 'Dr., U.S., confusion pairs, 50+ misspellings' },
                    { icon: '📐', label: 'Deep Grammar', desc: 'Subject-verb agreement through prepositional phrases' },
                    { icon: '✏️', label: 'Punctuation', desc: 'Spacing, commas, abbreviation-aware sentence splitting' },
                    { icon: '🧱', label: 'Sentence Structure', desc: 'Fragments, run-ons, comma splices, passive voice' },
                    { icon: '🔄', label: 'Consistency', desc: 'Tense consistency, pronoun case, word order' },
                    { icon: '🌊', label: 'Naturalness & Flow', desc: 'Vocabulary diversity, sentence variety, transitions' },
                    { icon: '🧠', label: 'AI Highlights', desc: 'Optional AI detection (no rewriting, errors only)' },
                  ].map(({ icon, label, desc }) => (
                    <div key={label} className="flex items-start gap-2.5">
                      <span className="text-sm mt-0.5">{icon}</span>
                      <div>
                        <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">{label}</p>
                        <p className="text-[10px] text-slate-500 dark:text-zinc-500">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  CheckCircle2, AlertTriangle, Info, Sparkles, Copy, Check,
  FileText, ArrowRight, ChevronDown, ChevronUp, Eraser, ClipboardPaste,
  RefreshCw, Lightbulb, Zap, Shield, BookOpen,
} from 'lucide-react';
import Link from 'next/link';
import { GrammarChecker, type Issue, type Severity, type CorrectionResult } from '@/lib/engine/grammar-corrector';

/* ── Severity config ──────────────────────────────────────────────────────── */

const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; bg: string; border: string; icon: typeof AlertTriangle; dot: string }> = {
  error:   { label: 'Error',   color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-950/30',    border: 'border-red-200 dark:border-red-800/40',    icon: AlertTriangle, dot: 'bg-red-500' },
  warning: { label: 'Warning', color: 'text-amber-500',  bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800/40', icon: Info,          dot: 'bg-amber-500' },
  style:   { label: 'Style',   color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950/30',   border: 'border-blue-200 dark:border-blue-800/40',   icon: Lightbulb,    dot: 'bg-blue-500' },
};

/* ── Score ring ───────────────────────────────────────────────────────────── */

function ScoreRing({ score }: { score: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative w-28 h-28 flex-shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="6"
          className="stroke-slate-200 dark:stroke-zinc-800" />
        <circle cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-700 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-slate-900 dark:text-white">{score}</span>
        <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">Score</span>
      </div>
    </div>
  );
}

/* ── Issue card ───────────────────────────────────────────────────────────── */

function IssueCard({
  issue,
  index,
  isActive,
  onSelect,
  onApplyFix,
}: {
  issue: Issue;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  onApplyFix: (replacement: string) => void;
}) {
  const cfg = SEVERITY_CONFIG[issue.severity];
  const Icon = cfg.icon;

  return (
    <button
      onClick={onSelect}
      className={`
        w-full text-left rounded-xl border p-3.5 transition-all duration-200 group
        ${isActive
          ? `${cfg.bg} ${cfg.border} ring-2 ring-offset-1 ring-purple-400/50 dark:ring-offset-zinc-900`
          : 'bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 hover:border-purple-300 dark:hover:border-purple-700/50 hover:shadow-md'
        }
      `}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 p-1.5 rounded-lg ${cfg.bg}`}>
          <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
            <span className="text-[10px] text-slate-400 dark:text-zinc-600">•</span>
            <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-medium">{issue.category}</span>
          </div>
          <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">{issue.message}</p>
          {issue.replacements.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {issue.replacements.slice(0, 3).map((rep, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); onApplyFix(rep); }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold
                    bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400
                    border border-green-200 dark:border-green-800/40
                    hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                >
                  <ArrowRight className="w-3 h-3" />
                  {rep || '(remove)'}
                </button>
              ))}
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  issue.confidence >= 0.9 ? 'bg-green-500' : issue.confidence >= 0.7 ? 'bg-amber-400' : 'bg-red-400'
                }`}
                style={{ width: `${issue.confidence * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 dark:text-zinc-600 font-mono">
              {Math.round(issue.confidence * 100)}%
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ── Highlighted text display ─────────────────────────────────────────────── */

function HighlightedText({
  text,
  issues,
  activeIssueIndex,
  onIssueClick,
}: {
  text: string;
  issues: Issue[];
  activeIssueIndex: number | null;
  onIssueClick: (index: number) => void;
}) {
  const segments = useMemo(() => {
    if (!issues.length) return [{ text, isIssue: false, issueIndex: -1, severity: 'error' as Severity }];

    const sorted = [...issues].sort((a, b) => a.start - b.start);
    const parts: { text: string; isIssue: boolean; issueIndex: number; severity: Severity }[] = [];
    let cursor = 0;

    for (let i = 0; i < sorted.length; i++) {
      const issue = sorted[i];
      const issueIndex = issues.indexOf(issue);
      if (issue.start > cursor) {
        parts.push({ text: text.slice(cursor, issue.start), isIssue: false, issueIndex: -1, severity: 'error' });
      }
      if (issue.end > cursor) {
        parts.push({
          text: text.slice(Math.max(cursor, issue.start), issue.end),
          isIssue: true,
          issueIndex,
          severity: issue.severity,
        });
        cursor = issue.end;
      }
    }
    if (cursor < text.length) {
      parts.push({ text: text.slice(cursor), isIssue: false, issueIndex: -1, severity: 'error' });
    }
    return parts;
  }, [text, issues]);

  const underlineColor: Record<Severity, string> = {
    error:   'decoration-red-500/80 bg-red-50/60 dark:bg-red-950/20',
    warning: 'decoration-amber-500/80 bg-amber-50/60 dark:bg-amber-950/20',
    style:   'decoration-blue-500/60 bg-blue-50/60 dark:bg-blue-950/20',
  };

  return (
    <div className="text-[15px] leading-[1.85] text-slate-800 dark:text-zinc-200 whitespace-pre-wrap font-[inherit]">
      {segments.map((seg, i) =>
        seg.isIssue ? (
          <span
            key={i}
            onClick={() => onIssueClick(seg.issueIndex)}
            className={`
              underline decoration-wavy decoration-2 underline-offset-4
              rounded-sm px-0.5 -mx-0.5 cursor-pointer transition-all duration-200
              ${underlineColor[seg.severity]}
              ${activeIssueIndex === seg.issueIndex ? 'ring-2 ring-purple-400/60 ring-offset-1 dark:ring-offset-zinc-900' : ''}
              hover:opacity-80
            `}
          >
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </div>
  );
}

/* ── Stat badge ───────────────────────────────────────────────────────────── */

function StatBadge({ count, severity }: { count: number; severity: Severity }) {
  const cfg = SEVERITY_CONFIG[severity];
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {count} {cfg.label}{count !== 1 ? 's' : ''}
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────────── */

const EXAMPLE_TEXT = `She don't like apples. I have went to the store yesterday. Their going to a university soon. The the cat sat on a mat. He have many informations about the enviromment. Me and him went to the store , and buyed a apple. The results of the study is clear. I seen him at the park and he dont care about they're feelings. She recieve the package and then she go home.`;

export default function GrammarPage() {
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState<CorrectionResult | null>(null);
  const [activeIssue, setActiveIssue] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [showCorrected, setShowCorrected] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<Severity | 'all'>('all');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const issueListRef = useRef<HTMLDivElement>(null);

  const checker = useMemo(() => new GrammarChecker(), []);

  const handleCheck = useCallback(() => {
    if (!inputText.trim()) return;
    const r = checker.check(inputText);
    setResult(r);
    setActiveIssue(null);
    setShowCorrected(false);
  }, [inputText, checker]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputText(text);
    } catch { /* clipboard permission denied */ }
  }, []);

  const handleClear = useCallback(() => {
    setInputText('');
    setResult(null);
    setActiveIssue(null);
  }, []);

  const handleCopy = useCallback(() => {
    if (!result) return;
    const text = showCorrected ? result.output : result.input;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result, showCorrected]);

  const handleApplyFix = useCallback((issueIndex: number, replacement: string) => {
    if (!result) return;
    const issue = result.issues[issueIndex];
    if (!issue) return;
    const newText = inputText.slice(0, issue.start) + replacement + inputText.slice(issue.end);
    setInputText(newText);
    // Re-check with updated text
    const newResult = checker.check(newText);
    setResult(newResult);
    setActiveIssue(null);
  }, [result, inputText, checker]);

  const handleLoadExample = useCallback(() => {
    setInputText(EXAMPLE_TEXT);
    setResult(null);
    setActiveIssue(null);
  }, []);

  const filteredIssues = useMemo(() => {
    if (!result) return [];
    if (filterSeverity === 'all') return result.issues;
    return result.issues.filter(i => i.severity === filterSeverity);
  }, [result, filterSeverity]);

  const wordCount = useMemo(() => inputText.trim().split(/\s+/).filter(Boolean).length, [inputText]);
  const charCount = inputText.length;

  // Auto-scroll to active issue in panel
  useEffect(() => {
    if (activeIssue !== null && issueListRef.current) {
      const card = issueListRef.current.children[activeIssue] as HTMLElement | undefined;
      card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeIssue]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#07070D]">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <Link href="/app" className="text-slate-400 dark:text-zinc-600 hover:text-purple-500 transition-colors">
                <ArrowRight className="w-4 h-4 rotate-180" />
              </Link>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
                  <BookOpen className="w-4 h-4 text-white" />
                </div>
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">Grammar Checker</h1>
              </div>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40">
                No AI — Pure Rules
              </span>
            </div>

            <div className="flex items-center gap-2">
              {result && (
                <div className="hidden sm:flex items-center gap-2 mr-2">
                  <StatBadge count={result.stats.errors} severity="error" />
                  <StatBadge count={result.stats.warnings} severity="warning" />
                  <StatBadge count={result.stats.style} severity="style" />
                </div>
              )}
              <button
                onClick={handleCheck}
                disabled={!inputText.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                  bg-gradient-to-r from-emerald-500 to-teal-600 text-white
                  shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30
                  disabled:opacity-40 disabled:cursor-not-allowed
                  transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
              >
                <Zap className="w-4 h-4" />
                Check Grammar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-140px)]">

          {/* ── Left: Editor pane ─────────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm overflow-hidden flex flex-col">
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/30">
                <div className="flex items-center gap-2">
                  <button onClick={handlePaste} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                    <ClipboardPaste className="w-3.5 h-3.5" /> Paste
                  </button>
                  <button onClick={handleClear} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                    <Eraser className="w-3.5 h-3.5" /> Clear
                  </button>
                  <button onClick={handleLoadExample} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-colors">
                    <Sparkles className="w-3.5 h-3.5" /> Load Example
                  </button>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-zinc-600">
                  <span>{wordCount} words</span>
                  <span>•</span>
                  <span>{charCount} chars</span>
                </div>
              </div>

              {/* Editor area */}
              {!result ? (
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCheck();
                  }}
                  placeholder="Paste or type your text here to check grammar, spelling, and style…"
                  className="flex-1 w-full p-6 text-[15px] leading-[1.85] resize-none outline-none
                    bg-transparent text-slate-800 dark:text-zinc-200
                    placeholder:text-slate-400 dark:placeholder:text-zinc-600
                    font-[inherit]"
                />
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {/* Toggle: original vs corrected */}
                  <div className="sticky top-0 z-10 px-4 py-2 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-slate-100 dark:border-zinc-800/50">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowCorrected(false)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          !showCorrected
                            ? 'bg-slate-900 dark:bg-white text-white dark:text-zinc-900 shadow-md'
                            : 'text-slate-500 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        Original + Issues
                      </button>
                      <button
                        onClick={() => setShowCorrected(true)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          showCorrected
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                            : 'text-slate-500 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" /> Corrected
                      </button>
                      <div className="flex-1" />
                      <button
                        onClick={handleCopy}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        onClick={() => { setResult(null); }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Edit
                      </button>
                    </div>
                  </div>

                  <div className="p-6">
                    {showCorrected ? (
                      <div className="text-[15px] leading-[1.85] text-slate-800 dark:text-zinc-200 whitespace-pre-wrap font-[inherit]">
                        {result.output}
                      </div>
                    ) : (
                      <HighlightedText
                        text={result.input}
                        issues={result.issues}
                        activeIssueIndex={activeIssue}
                        onIssueClick={setActiveIssue}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Keyboard shortcut hint */}
            {!result && inputText.trim() && (
              <p className="mt-2 text-center text-xs text-slate-400 dark:text-zinc-600">
                Press <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-zinc-700 text-[10px] font-mono bg-slate-100 dark:bg-zinc-800">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-zinc-700 text-[10px] font-mono bg-slate-100 dark:bg-zinc-800">Enter</kbd> to check
              </p>
            )}
          </div>

          {/* ── Right: Results panel ───────────────────────────────────── */}
          <div className="w-full lg:w-[380px] xl:w-[420px] flex-shrink-0 flex flex-col gap-4">

            {/* Score card */}
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm p-5">
              {result ? (
                <div className="flex items-center gap-5">
                  <ScoreRing score={result.stats.score} />
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                      {result.stats.score >= 90 ? 'Excellent!' :
                       result.stats.score >= 70 ? 'Pretty Good' :
                       result.stats.score >= 50 ? 'Needs Work' : 'Many Issues'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-500 leading-relaxed mb-3">
                      {result.issues.length === 0
                        ? 'No issues found. Your text looks great!'
                        : `Found ${result.issues.length} issue${result.issues.length !== 1 ? 's' : ''} in your text.`
                      }
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <StatBadge count={result.stats.errors} severity="error" />
                      <StatBadge count={result.stats.warnings} severity="warning" />
                      <StatBadge count={result.stats.style} severity="style" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-950/40 dark:to-teal-950/40 mb-3">
                    <Shield className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Grammar Analysis</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-500 max-w-[240px]">
                    Paste text and click &quot;Check Grammar&quot; to analyze spelling, grammar, and style.
                  </p>
                </div>
              )}
            </div>

            {/* Issue list / filters */}
            {result && result.issues.length > 0 && (
              <div className="flex-1 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm overflow-hidden flex flex-col">
                {/* Filter tabs */}
                <div className="flex items-center gap-1 px-3 py-2.5 border-b border-slate-100 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/30">
                  {(['all', 'error', 'warning', 'style'] as const).map(sev => {
                    const count = sev === 'all' ? result.issues.length : result.issues.filter(i => i.severity === sev).length;
                    const isActive = filterSeverity === sev;
                    return (
                      <button
                        key={sev}
                        onClick={() => setFilterSeverity(sev)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          isActive
                            ? 'bg-slate-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm'
                            : 'text-slate-500 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {sev === 'all' ? 'All' : SEVERITY_CONFIG[sev].label} ({count})
                      </button>
                    );
                  })}
                </div>

                {/* Issue cards */}
                <div ref={issueListRef} className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[calc(100vh-380px)]">
                  {filteredIssues.map((issue, i) => {
                    const realIndex = result.issues.indexOf(issue);
                    return (
                      <IssueCard
                        key={`${issue.ruleId}-${issue.start}-${i}`}
                        issue={issue}
                        index={realIndex}
                        isActive={activeIssue === realIndex}
                        onSelect={() => setActiveIssue(activeIssue === realIndex ? null : realIndex)}
                        onApplyFix={(rep) => handleApplyFix(realIndex, rep)}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty state for no issues */}
            {result && result.issues.length === 0 && (
              <div className="flex-1 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm flex flex-col items-center justify-center p-8 text-center">
                <div className="p-3 rounded-2xl bg-green-50 dark:bg-green-950/30 mb-3">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">No issues found</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-500">Your text looks grammatically correct!</p>
              </div>
            )}

            {/* How it works */}
            {!result && (
              <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm p-5">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">What we check</h3>
                <div className="space-y-2.5">
                  {[
                    { icon: '🔤', label: 'Spelling & Typos', desc: 'Common misspellings and confusion pairs' },
                    { icon: '📐', label: 'Grammar Rules', desc: 'Subject-verb agreement, verb forms, articles' },
                    { icon: '✏️', label: 'Punctuation', desc: 'Spacing, duplicates, sentence endings' },
                    { icon: '🎯', label: 'Sentence Structure', desc: 'Comma splices, repeated words' },
                    { icon: '💡', label: 'Style', desc: 'Clarity improvements and formatting' },
                  ].map(({ icon, label, desc }) => (
                    <div key={label} className="flex items-start gap-3">
                      <span className="text-base mt-0.5">{icon}</span>
                      <div>
                        <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">{label}</p>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-500">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
