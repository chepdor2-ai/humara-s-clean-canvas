'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  CheckCircle2, AlertTriangle, Info, Sparkles, Copy, Check,
  ArrowRight, Eraser, ClipboardPaste, RefreshCw, Lightbulb, Zap,
  Shield, BookOpen, Brain, ChevronDown,
  Eye, PenTool, X, Type, WandSparkles,
} from 'lucide-react';
import Link from 'next/link';
import {
  type Issue,
  type Severity,
  type CorrectionResult,
} from '@/lib/engine/grammar-corrector';
import { RichTextEditor } from '../../../components/grammar/RichTextEditor';

/* ── Severity config ──────────────────────────────────────────────────────── */

const SEV: Record<Severity, { label: string; dot: string; underline: string; category: string; strip: string }> = {
  error:   { label: 'Error',   dot: 'bg-red-500',   underline: 'decoration-red-500/80',   category: 'Correctness', strip: 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400' },
  warning: { label: 'Warning', dot: 'bg-amber-500', underline: 'decoration-amber-500/70', category: 'Clarity',     strip: 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400' },
  style:   { label: 'Style',   dot: 'bg-blue-500',  underline: 'decoration-blue-500/60',  category: 'Engagement',  strip: 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400' },
};

type EngineMode = 'rules' | 'ai' | 'both';
type GrammarDomain = 'general' | 'academic' | 'legal' | 'medical' | 'technical';
type CategoryFilter = 'all' | 'correctness' | 'clarity' | 'engagement' | 'ai';

type GrammarApiMeta = {
  request_id: string;
  engine_version: string;
  backend: string;
  backend_label: string;
  deployment: string;
  mode: EngineMode | 'full';
  domain: GrammarDomain;
  ai_provider: string | null;
  ai_used: boolean;
  ai_available: boolean;
  processing_time_ms: number;
  rules_version: string;
  strict_minimal_edits: boolean;
  max_sentence_change_ratio: number;
  preserve_quotes: boolean;
  preserve_citations: boolean;
  warnings: string[];
};

type GrammarApiResponse = {
  editor_result: CorrectionResult;
  corrected_text: string;
  meta: GrammarApiMeta;
};

type GrammarHealth = {
  status: string;
  backend: {
    engine: string;
    deployment: string;
    version: string;
    rules_count: number;
    ai_available: boolean;
    domains: GrammarDomain[];
    features: string[];
    limits: {
      max_text_length: number;
      ai_text_length: number;
    };
    preferred_mode: string;
  };
};

const DOMAINS: Array<{ value: GrammarDomain; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'academic', label: 'Academic' },
  { value: 'legal', label: 'Legal' },
  { value: 'medical', label: 'Medical' },
  { value: 'technical', label: 'Technical' },
];

const CATEGORY_ICONS: Record<CategoryFilter, React.ReactNode> = {
  all:          <CheckCircle2 className="w-4 h-4" />,
  correctness:  <Type className="w-4 h-4" />,
  clarity:      <Lightbulb className="w-4 h-4" />,
  engagement:   <Sparkles className="w-4 h-4" />,
  ai:           <Brain className="w-4 h-4" />,
};

const CATEGORIES: { key: CategoryFilter; label: string; desc: string; match: (i: Issue) => boolean }[] = [
  { key: 'correctness', label: 'Correctness', desc: 'Spelling, grammar, agreement', match: i => i.severity === 'error' && !i.aiDetected },
  { key: 'clarity',     label: 'Clarity',     desc: 'Fragments, run-ons, commas', match: i => i.severity === 'warning' && !i.aiDetected },
  { key: 'engagement',  label: 'Engagement',  desc: 'Passive voice, word choice',  match: i => i.severity === 'style' && !i.aiDetected },
  { key: 'ai',          label: 'AI Detection', desc: 'LLM-powered detection',       match: i => !!i.aiDetected },
];

/* ── Score circle (Grammarly-style single ring) ───────────────────────────── */

function ScoreCircle({ score, size = 100 }: { score: number; size?: number }) {
  const normalizedSize = 100;
  const sizeClass = size <= 90 ? 'h-[90px] w-[90px]' : 'h-[100px] w-[100px]';
  const r = (normalizedSize - 12) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ - (score / 100) * circ;
  const c = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className={`relative ${sizeClass}`}>
      <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${normalizedSize} ${normalizedSize}`}>
        <circle cx={normalizedSize / 2} cy={normalizedSize / 2} r={r} fill="none" strokeWidth={6}
          className="stroke-slate-100 dark:stroke-zinc-800" />
        <circle cx={normalizedSize / 2} cy={normalizedSize / 2} r={r} fill="none" stroke={c} strokeWidth={6}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off}
          className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-slate-900 dark:text-white">{score}</span>
        <span className="text-[9px] font-medium text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Overall</span>
      </div>
    </div>
  );
}

/* ── Mini score bar ───────────────────────────────────────────────────────── */

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-slate-500 dark:text-zinc-500 w-16 text-right">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
        <svg className="h-full w-full" viewBox="0 0 100 6" preserveAspectRatio="none">
          <rect x="0" y="0" width={score} height="6" rx="3" fill={color} className="transition-all duration-700" />
        </svg>
      </div>
      <span className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400 w-7">{score}</span>
    </div>
  );
}

/* ── Suggestion card (Grammarly-style) ────────────────────────────────────── */

function SuggestionCard({ issue, inputText, isActive, onHover, onAccept, onDismiss }: {
  issue: Issue; inputText: string; isActive: boolean;
  onHover: () => void; onAccept: (rep: string) => void; onDismiss: () => void;
}) {
  const cfg = SEV[issue.severity];
  const originalText = inputText.slice(issue.start, issue.end);
  const hasFix = issue.replacements.length > 0;

  return (
    <div onMouseEnter={onHover}
      className={`rounded-lg border transition-all duration-200 overflow-hidden
        ${isActive
          ? 'border-emerald-300 dark:border-emerald-700 ring-2 ring-emerald-400/30 dark:ring-emerald-500/20 shadow-md'
          : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 hover:shadow-sm'
        } bg-white dark:bg-zinc-900/60`}>

      {/* Category header */}
      <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${cfg.strip}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.category}
        {issue.aiDetected && (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 font-bold normal-case">AI</span>
        )}
      </div>

      <div className="p-3">
        {/* Original → Corrected diff */}
        {hasFix && (
          <div className="mb-2 text-sm leading-relaxed">
            <span className="bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 line-through decoration-2 rounded-sm px-0.5">{originalText}</span>
            <ArrowRight className="w-3.5 h-3.5 inline mx-1.5 text-slate-300 dark:text-zinc-600" />
            <span className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold rounded-sm px-0.5">{issue.replacements[0]}</span>
          </div>
        )}

        {/* No fix — show original text only */}
        {!hasFix && (
          <div className="mb-2 text-sm leading-relaxed">
            <span className="bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 rounded-sm px-0.5 underline decoration-wavy decoration-1">{originalText}</span>
          </div>
        )}

        {/* Message */}
        <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed mb-3">{issue.message}</p>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          {hasFix && (
            <button onClick={() => onAccept(issue.replacements[0])}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                bg-emerald-500 hover:bg-emerald-600 text-white transition-all">
              <CheckCircle2 className="w-3.5 h-3.5" /> Accept
            </button>
          )}
          <button onClick={onDismiss}
            className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-medium
              text-slate-400 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-700 transition-colors">
            Dismiss
          </button>
          {issue.replacements.length > 1 && (
            <div className="relative group">
              <button className="inline-flex items-center gap-0.5 px-2 py-1.5 rounded-lg text-[11px] text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                <ChevronDown className="w-3 h-3" /> +{issue.replacements.length - 1}
              </button>
              <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-20
                bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-xl p-1 min-w-[140px]">
                {issue.replacements.slice(1, 5).map((rep, i) => (
                  <button key={i} onClick={() => onAccept(rep)}
                    className="w-full text-left px-2.5 py-1.5 rounded text-xs text-slate-700 dark:text-zinc-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors">
                    {rep || '(remove)'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Editor text with underlines ──────────────────────────────────────────── */

function EditorHighlight({ text, issues, activeIdx, onClickIssue }: {
  text: string; issues: Issue[]; activeIdx: number | null; onClickIssue: (i: number) => void;
}) {
  const segments = useMemo(() => {
    if (!issues.length) return [{ text, isIssue: false, idx: -1, sev: 'error' as Severity, ai: false }];
    const sorted = [...issues].map((iss, idx) => ({ ...iss, _idx: idx })).sort((a, b) => a.start - b.start);
    const parts: { text: string; isIssue: boolean; idx: number; sev: Severity; ai: boolean }[] = [];
    let cursor = 0;
    for (const issue of sorted) {
      if (issue.start > cursor) parts.push({ text: text.slice(cursor, issue.start), isIssue: false, idx: -1, sev: 'error', ai: false });
      if (issue.end > cursor) {
        parts.push({ text: text.slice(Math.max(cursor, issue.start), issue.end), isIssue: true, idx: issue._idx, sev: issue.severity, ai: !!issue.aiDetected });
        cursor = issue.end;
      }
    }
    if (cursor < text.length) parts.push({ text: text.slice(cursor), isIssue: false, idx: -1, sev: 'error', ai: false });
    return parts;
  }, [text, issues]);

  return (
    <div className="word-editor-text whitespace-pre-wrap min-h-[420px]">
      {segments.map((s, i) =>
        s.isIssue ? (
          <span key={i} onClick={() => onClickIssue(s.idx)}
            className={`underline decoration-wavy decoration-2 underline-offset-4 cursor-pointer transition-all duration-150
              ${s.ai ? 'decoration-cyan-500/80' : SEV[s.sev].underline}
              ${activeIdx === s.idx ? 'bg-emerald-100/70 dark:bg-emerald-950/30 rounded-sm' : 'hover:bg-slate-50 dark:hover:bg-zinc-800/30 rounded-sm'}`}>
            {s.text}
          </span>
        ) : <span key={i}>{s.text}</span>
      )}
    </div>
  );
}

/* ── Correction diff view ─────────────────────────────────────────────────── */

function CorrectionDiff({ input, issues }: { input: string; issues: Issue[] }) {
  const fixable = issues.filter(i => i.replacements.length > 0).sort((a, b) => a.start - b.start);

  if (fixable.length === 0) {
    return <div className="word-editor-text whitespace-pre-wrap">{input}</div>;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const issue of fixable) {
    if (issue.start > cursor) parts.push(<span key={`t-${cursor}`}>{input.slice(cursor, issue.start)}</span>);
    const original = input.slice(Math.max(cursor, issue.start), issue.end);
    parts.push(
      <span key={`d-${issue.start}`}>
        <span className="bg-red-100 dark:bg-red-950/40 text-red-500 line-through decoration-2 px-0.5 rounded-sm text-[14px]">{original}</span>
        {issue.replacements[0] && (
          <span className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold px-0.5 rounded-sm ml-0.5">{issue.replacements[0]}</span>
        )}
      </span>
    );
    cursor = issue.end;
  }
  if (cursor < input.length) parts.push(<span key={`t-${cursor}`}>{input.slice(cursor)}</span>);

  return (
    <div>
      <div className="word-editor-text whitespace-pre-wrap">{parts}</div>
      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-zinc-800/50 flex items-center gap-5 text-[11px] text-slate-400 dark:text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm bg-red-100 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 inline-block" /> Removed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 inline-block" /> Corrected
        </span>
      </div>
    </div>
  );
}

/* ── Engine selector ──────────────────────────────────────────────────────── */

function EngineSelector({ mode, onChange }: { mode: EngineMode; onChange: (m: EngineMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const items: Record<EngineMode, { label: string; icon: React.ReactNode; desc: string }> = {
    rules:  { label: 'Rules Engine', icon: <PenTool className="w-3.5 h-3.5" />, desc: 'Deterministic Vercel grammar engine' },
    ai:     { label: 'AI Assist',    icon: <Brain className="w-3.5 h-3.5" />,   desc: 'AI suggestions with safe rules fallback' },
    both:   { label: 'Full Coverage', icon: <Zap className="w-3.5 h-3.5" />,    desc: 'Rules plus AI for the strongest coverage' },
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold
          bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700
          text-slate-700 dark:text-zinc-300 hover:border-slate-300 dark:hover:border-zinc-600 transition-all shadow-sm">
        {items[mode].icon} {items[mode].label}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-30 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-xl p-1 min-w-[230px]">
          {(Object.keys(items) as EngineMode[]).map(m => (
            <button key={m} onClick={() => { onChange(m); setOpen(false); }}
              className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors
                ${mode === m ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'hover:bg-slate-50 dark:hover:bg-zinc-800'}`}>
              <div className={`mt-0.5 ${mode === m ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-zinc-500'}`}>
                {items[m].icon}
              </div>
              <div className="flex-1">
                <div className={`text-xs font-semibold ${mode === m ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-zinc-300'}`}>
                  {items[m].label}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-500">{items[m].desc}</div>
              </div>
              {mode === m && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════════════════════ */

const EXAMPLE = `She don't like apples. I have went to the store yesterday. Their going to a university soon. The the cat sat on a mat. He have many informations about the enviromment. Me and him went to the store , and buyed a apple. The results of the study is clear. I seen him at the park and he dont care about they're feelings. She recieve the package and then she go home. However the weather was nice outside. Dr. smith told me to come back tommorow but i cant make it. Between you and I the test was definately harder then expected.`;

export default function GrammarPage() {
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState<CorrectionResult | null>(null);
  const [activeIssue, setActiveIssue] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [showCorrected, setShowCorrected] = useState(false);
  const [engineMode, setEngineMode] = useState<EngineMode>('both');
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [backendMeta, setBackendMeta] = useState<GrammarApiMeta | null>(null);
  const [backendHealth, setBackendHealth] = useState<GrammarHealth['backend'] | null>(null);
  const [domain, setDomain] = useState<GrammarDomain>('general');
  const [strictMinimalEdits, setStrictMinimalEdits] = useState(false);
  const [preserveQuotes, setPreserveQuotes] = useState(true);
  const [preserveCitations, setPreserveCitations] = useState(true);
  const [maxSentenceChangeRatio, setMaxSentenceChangeRatio] = useState(0.28);
  const issueListRef = useRef<HTMLDivElement>(null);
  const requestSequenceRef = useRef(0);

  useEffect(() => {
    let ignore = false;

    void fetch('/api/grammar-check', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as GrammarHealth;
      })
      .then((data) => {
        if (!ignore && data?.backend) {
          setBackendHealth(data.backend);
        }
      })
      .catch(() => {
        // Ignore passive health-check failures in the UI.
      });

    return () => {
      ignore = true;
    };
  }, []);

  const runCheck = useCallback(async (textToCheck: string) => {
    const requestId = ++requestSequenceRef.current;
    setChecking(true);
    setAnalysisError(null);

    try {
      const response = await fetch('/api/grammar-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToCheck,
          mode: engineMode,
          domain,
          preserveQuotes,
          preserveCitations,
          strictMinimalEdits,
          maxSentenceChangeRatio,
        }),
      });

      const data = (await response.json()) as Partial<GrammarApiResponse> & { error?: string; detail?: string };
      if (!response.ok || !data.editor_result || !data.meta) {
        throw new Error(data.detail || data.error || 'Grammar analysis failed.');
      }

      if (requestId !== requestSequenceRef.current) return;

      setResult(data.editor_result);
      setBackendMeta(data.meta);
      setDismissed(new Set());
      setCategoryFilter('all');
      setActiveIssue(null);
      setShowCorrected(false);
    } catch (error: unknown) {
      if (requestId !== requestSequenceRef.current) return;
      setAnalysisError(error instanceof Error ? error.message : 'Grammar analysis failed.');
    } finally {
      if (requestId === requestSequenceRef.current) {
        setChecking(false);
      }
    }
  }, [domain, engineMode, maxSentenceChangeRatio, preserveCitations, preserveQuotes, strictMinimalEdits]);

  const handleCheck = useCallback(async () => {
    if (!inputText.trim()) return;
    await runCheck(inputText);
  }, [inputText, runCheck]);

  /* ── Actions ─────────────────────────────────────────────────────────── */

  const handlePaste = useCallback(async () => {
    try {
      setInputText(await navigator.clipboard.readText());
      setResult(null);
      setActiveIssue(null);
      setDismissed(new Set());
      setCategoryFilter('all');
      setShowCorrected(false);
      setAnalysisError(null);
    } catch {
      /* denied */
    }
  }, []);

  const handleClear = useCallback(() => {
    setInputText('');
    setResult(null);
    setActiveIssue(null);
    setDismissed(new Set());
    setCategoryFilter('all');
    setShowCorrected(false);
    setAnalysisError(null);
    setBackendMeta(null);
  }, []);

  const handleCopy = useCallback(() => {
    if (!result) return;
    const textToCopy = showCorrected ? result.output : result.input;
    const escaped = textToCopy
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const htmlParagraphs = escaped
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.replace(/\n/g, '<br />'))
      .map((paragraph) => `<p style=\"margin:0 0 12pt 0;\">${paragraph || '&nbsp;'}</p>`)
      .join('');
    const html = `<!doctype html><html><body><div style=\"font-family:Cambria,'Times New Roman',serif;font-size:12pt;line-height:1.6;color:#1f2328;\">${htmlParagraphs}</div></body></html>`;

    const copyWithRichText = async () => {
      if (navigator.clipboard && 'write' in navigator && typeof ClipboardItem !== 'undefined') {
        const item = new ClipboardItem({
          'text/plain': new Blob([textToCopy], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(textToCopy);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    void copyWithRichText();
  }, [result, showCorrected]);

  const handleAccept = useCallback(async (idx: number, rep: string) => {
    if (!result) return;
    const issue = result.issues[idx];
    if (!issue) return;
    const newText = inputText.slice(0, issue.start) + rep + inputText.slice(issue.end);
    setInputText(newText);
    await runCheck(newText);
  }, [inputText, result, runCheck]);

  const handleDismiss = useCallback((idx: number) => {
    setDismissed(prev => new Set(prev).add(idx));
    if (activeIssue === idx) setActiveIssue(null);
  }, [activeIssue]);

  const handleAcceptAll = useCallback(async () => {
    if (!result) return;
    const matcher = categoryFilter === 'all' ? null : CATEGORIES.find((category) => category.key === categoryFilter)?.match;
    const fixable = result.issues
      .filter((issue, index) => {
        if (dismissed.has(index) || issue.replacements.length === 0) return false;
        return matcher ? matcher(issue) : true;
      })
      .sort((a, b) => b.start - a.start);
    if (fixable.length === 0) return;
    let text = inputText;
    for (const issue of fixable) {
      text = text.slice(0, issue.start) + issue.replacements[0] + text.slice(issue.end);
    }
    setInputText(text);
    await runCheck(text);
  }, [categoryFilter, dismissed, inputText, result, runCheck]);

  const handleCorrectAll = useCallback(async () => {
    if (!result) return;
    if (result.output === inputText) return;
    setInputText(result.output);
    await runCheck(result.output);
  }, [inputText, result, runCheck]);

  /* ── Derived data ────────────────────────────────────────────────────── */

  const visibleIssues = useMemo(() => {
    if (!result) return [];
    return result.issues.filter((_, i) => !dismissed.has(i));
  }, [result, dismissed]);

  const filteredIssues = useMemo(() => {
    if (categoryFilter === 'all') return visibleIssues;
    const cat = CATEGORIES.find(c => c.key === categoryFilter);
    return cat ? visibleIssues.filter(cat.match) : visibleIssues;
  }, [visibleIssues, categoryFilter]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of CATEGORIES) {
      counts[cat.key] = visibleIssues.filter(cat.match).length;
    }
    return counts;
  }, [visibleIssues]);

  const fixableCount = useMemo(() => visibleIssues.filter(i => i.replacements.length > 0).length, [visibleIssues]);

  const wordCount = useMemo(() => inputText.trim().split(/\s+/).filter(Boolean).length, [inputText]);
  const backendWarnings = backendMeta?.warnings ?? [];
  const canCorrectAll = Boolean(result && result.output !== inputText);

  /* ── Scroll sidebar to active card ───────────────────────────────────── */

  useEffect(() => {
    if (activeIssue === null || !issueListRef.current || !result) return;
    // Find the visible index of the active issue
    let visIdx = -1;
    let count = 0;
    for (let j = 0; j < result.issues.length; j++) {
      if (!dismissed.has(j)) {
        if (j === activeIssue) { visIdx = count; break; }
        count++;
      }
    }
    if (visIdx >= 0) {
      const card = issueListRef.current.children[visIdx] as HTMLElement | undefined;
      card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeIssue, result, dismissed]);

  /* ════════════════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════════════════ */

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden overscroll-none bg-[#f8f9fa] dark:bg-[#0a0a0f]">

      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="max-w-[1800px] mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              <Link href="/app" className="text-slate-400 dark:text-zinc-600 hover:text-emerald-500 transition-colors">
                <ArrowRight className="w-4 h-4 rotate-180" />
              </Link>
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 dark:text-white">Grammar Editor</h1>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500">Vercel-native corrections with protected-span controls</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <EngineSelector mode={engineMode} onChange={setEngineMode} />
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                <span className="text-slate-400 dark:text-zinc-500">Domain</span>
                <select
                  value={domain}
                  onChange={(event) => setDomain(event.target.value as GrammarDomain)}
                  className="bg-transparent font-semibold text-slate-700 outline-none dark:text-zinc-200"
                >
                  {DOMAINS.map((option) => (
                    <option key={option.value} value={option.value} className="text-slate-900 dark:text-zinc-100">
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {backendHealth && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {backendHealth.deployment} {backendHealth.engine}
                </span>
              )}
              {checking && (
                <span className="text-[11px] text-cyan-500 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Analyzing…
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {result && !checking && (
                <div className="hidden sm:flex items-center gap-3 mr-3 text-[11px]">
                  <span className="flex items-center gap-1 text-red-500 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{result.stats.errors}</span>
                  <span className="flex items-center gap-1 text-amber-500 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{result.stats.warnings}</span>
                  <span className="flex items-center gap-1 text-blue-500 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{result.stats.style}</span>
                </div>
              )}
              <button onClick={handleCheck} disabled={!inputText.trim() || checking}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
                  bg-emerald-500 hover:bg-emerald-600 text-white
                  disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                {checking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} {checking ? 'Checking' : 'Check'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Two-column layout ──────────────────────────────────────────── */}
      <div className="mx-auto grid min-h-[calc(100vh-140px)] flex-1 w-full max-w-[1800px] grid-cols-1 grid-rows-[minmax(0,1.2fr)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1 xl:grid-cols-[minmax(0,1fr)_400px]">

        {/* ═══ LEFT: Editor ════════════════════════════════════════════════ */}
        <div className="flex flex-col border-b border-slate-200 dark:border-zinc-800 lg:border-b-0 lg:border-r h-[calc(100vh-72px)]">

          {/* Toolbar */}
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white/50 px-4 py-2 dark:border-zinc-800/60 dark:bg-zinc-900/30 sm:px-6">
            <div className="flex items-center gap-1">
              <button onClick={handlePaste} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                <ClipboardPaste className="w-3.5 h-3.5" /> Paste
              </button>
              <button onClick={handleClear} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                <Eraser className="w-3.5 h-3.5" /> Clear
              </button>
              <button onClick={() => { setInputText(EXAMPLE); setResult(null); }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors">
                <Sparkles className="w-3.5 h-3.5" /> Try example
              </button>
              {result && (
                <>
                  <div className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1" />
                  <button onClick={() => setShowCorrected(false)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors
                      ${!showCorrected ? 'bg-slate-900 dark:bg-white text-white dark:text-zinc-900' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800'}`}>
                    <Eye className="w-3.5 h-3.5" /> Original
                  </button>
                  <button onClick={() => setShowCorrected(true)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors
                      ${showCorrected ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800'}`}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Corrected
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-zinc-600">
              <span>{wordCount} words</span>
              <span>{inputText.length} chars</span>
              {result && (
                <>
                  <button onClick={handleCopy}
                    className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors">
                    {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button onClick={() => { setResult(null); setDismissed(new Set()); }}
                    className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors">
                    <RefreshCw className="w-3 h-3" /> Edit
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="shrink-0 border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-zinc-800/60 dark:bg-zinc-950/30 sm:px-6">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <button
                onClick={() => setStrictMinimalEdits((value) => !value)}
                className={`rounded-full border px-3 py-1.5 font-semibold transition-colors ${
                  strictMinimalEdits
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'border-slate-200 bg-white text-slate-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400'
                }`}
              >
                {strictMinimalEdits ? 'Strict edits on' : 'Strict edits off'}
              </button>
              <button
                onClick={() => setPreserveQuotes((value) => !value)}
                className={`rounded-full border px-3 py-1.5 font-semibold transition-colors ${
                  preserveQuotes
                    ? 'border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300'
                    : 'border-slate-200 bg-white text-slate-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400'
                }`}
              >
                {preserveQuotes ? 'Protect quotes' : 'Quotes editable'}
              </button>
              <button
                onClick={() => setPreserveCitations((value) => !value)}
                className={`rounded-full border px-3 py-1.5 font-semibold transition-colors ${
                  preserveCitations
                    ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-300'
                    : 'border-slate-200 bg-white text-slate-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400'
                }`}
              >
                {preserveCitations ? 'Protect citations' : 'Citations editable'}
              </button>
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                <span className="font-semibold">Sentence edit budget</span>
                <input
                  type="range"
                  min={12}
                  max={50}
                  step={2}
                  value={Math.round(maxSentenceChangeRatio * 100)}
                  onChange={(event) => setMaxSentenceChangeRatio(Number(event.target.value) / 100)}
                  className="accent-emerald-500"
                />
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{Math.round(maxSentenceChangeRatio * 100)}%</span>
              </label>
            </div>
            {(analysisError || backendWarnings.length > 0) && (
              <div className="mt-2 space-y-1">
                {analysisError && (
                  <p className="text-[11px] font-medium text-red-500">{analysisError}</p>
                )}
                {!analysisError && backendWarnings.slice(0, 2).map((warning) => (
                  <p key={warning} className="text-[11px] font-medium text-amber-600 dark:text-amber-400">{warning}</p>
                ))}
              </div>
            )}
          </div>

          {/* Editor area */}
          <div className="min-h-0 flex-1 relative bg-[#eef2f7] dark:bg-[#0e1118]">
            <div className="word-editor-page flex flex-col h-full bg-white dark:bg-zinc-950">
              {showCorrected && result ? (
                <div className="p-6 sm:p-10 overflow-y-auto w-full h-full">
                  <CorrectionDiff input={result.input} issues={visibleIssues} />
                </div>
              ) : (
                <RichTextEditor
                  value={inputText}
                  onChange={setInputText}
                  onCheck={handleCheck}
                  isChecking={checking}
                  issues={result ? result.issues : null}
                  activeIssueIdx={activeIssue}
                  onIssueClick={(i) => setActiveIssue(activeIssue === i ? null : i)}
                  onAcceptIssue={handleAccept}
                  onExportTarget={async (type) => {
                    const content = showCorrected && result ? result.output : inputText;
                    if (type === 'txt') {
                      const blob = new Blob([content], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'Grammar_Export.txt';
                      a.click();
                      URL.revokeObjectURL(url);
                    } else if (type === 'docx') {
                      const { Document, Packer, Paragraph, TextRun } = await import('docx');
                      const doc = new Document({
                        sections: [{
                          properties: {},
                          children: content.split('\n').map(p => new Paragraph({ children: [new TextRun(p)] }))
                        }]
                      });
                      Packer.toBlob(doc).then(blob => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'Grammar_Export.docx';
                        a.click();
                      });
                    } else if (type === 'pdf') {
                      const { jsPDF } = await import('jspdf');
                      const doc = new jsPDF();
                      const splitText = doc.splitTextToSize(content, 180);
                      doc.text(splitText, 15, 15);
                      doc.save('Grammar_Export.pdf');
                    }
                  }}
                  onRewriteSelection={async (text, mode) => {
                    // Hook into actual routing if desired
                    return new Promise((resolve) => {
                      setTimeout(() => resolve(text + ' (Rewritten)'), 1000);
                    });
                  }}
                />
              )}
            </div>
          </div>

          {!result && inputText.trim() && (
            <div className="shrink-0 border-t border-slate-100 px-6 py-2 text-center text-[11px] text-slate-400 dark:border-zinc-800/60 dark:text-zinc-600">
              <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-[10px] font-mono">Ctrl+Enter</kbd> to check
            </div>
          )}
        </div>

        {/* ═══ RIGHT: Sidebar ══════════════════════════════════════════════ */}
        <div className="flex min-h-0 flex-col overflow-hidden border-t border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40 lg:border-t-0 h-[calc(100vh-72px)]">

          {result ? (
            <>
              {/* Score */}
              <div className="shrink-0 border-b border-slate-100 px-5 py-4 dark:border-zinc-800/60">
                <div className="flex items-center gap-5">
                  <ScoreCircle score={result.scores.overall} size={90} />
                  <div className="flex-1 space-y-1.5">
                    <ScoreBar label="Grammar" score={result.scores.grammar} color="#ef4444" />
                    <ScoreBar label="Natural" score={result.scores.naturalness} color="#8b5cf6" />
                    <ScoreBar label="Clarity" score={result.scores.clarity} color="#3b82f6" />
                    <ScoreBar label="Flow" score={result.scores.flow} color="#06b6d4" />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-zinc-800/50">
                    <div className="text-slate-400 dark:text-zinc-500">Backend</div>
                    <div className="font-semibold text-slate-700 dark:text-zinc-200">{backendMeta?.backend_label ?? 'Vercel TypeScript'}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-zinc-800/50">
                    <div className="text-slate-400 dark:text-zinc-500">Domain</div>
                    <div className="font-semibold text-slate-700 dark:text-zinc-200">{DOMAINS.find((item) => item.value === domain)?.label ?? 'General'}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-zinc-800/50">
                    <div className="text-slate-400 dark:text-zinc-500">Latency</div>
                    <div className="font-semibold text-slate-700 dark:text-zinc-200">{backendMeta ? `${Math.round(backendMeta.processing_time_ms)} ms` : '—'}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-zinc-800/50">
                    <div className="text-slate-400 dark:text-zinc-500">Mode</div>
                    <div className="font-semibold text-slate-700 dark:text-zinc-200">{engineMode === 'both' ? 'Full coverage' : engineMode === 'ai' ? 'AI assist' : 'Rules only'}</div>
                  </div>
                </div>
              </div>

              {/* Category filter bar */}
              <div className="shrink-0 border-b border-slate-100 px-4 py-3 dark:border-zinc-800/60">
                <div className="grid grid-cols-4 gap-1.5">
                  {CATEGORIES.map(cat => {
                    const count = categoryCounts[cat.key] || 0;
                    const active = categoryFilter === cat.key;
                    return (
                      <button key={cat.key}
                        onClick={() => setCategoryFilter(active ? 'all' : cat.key)}
                        className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg text-center transition-all
                          ${active
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-300 dark:ring-emerald-700'
                            : count > 0
                              ? 'hover:bg-slate-50 dark:hover:bg-zinc-800/50'
                              : 'opacity-40 cursor-default'
                          }`}
                        disabled={count === 0 && !active}>
                        <span className={`leading-none ${active ? 'text-emerald-600 dark:text-emerald-400' : count > 0 ? 'text-slate-500 dark:text-zinc-400' : 'text-slate-300 dark:text-zinc-600'}`}>{CATEGORY_ICONS[cat.key]}</span>
                        <span className={`text-[10px] font-bold leading-tight ${
                          active ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-zinc-400'
                        }`}>{count}</span>
                        <span className="text-[9px] text-slate-400 dark:text-zinc-500 leading-tight">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Suggestions header */}
              <div className="shrink-0 border-b border-slate-100 px-5 py-3 dark:border-zinc-800/60 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {categoryFilter === 'all' ? 'All Suggestions' : CATEGORIES.find(c => c.key === categoryFilter)?.label}
                  {' '}<span className="text-xs font-normal text-slate-400">({filteredIssues.length})</span>
                </h3>
                <div className="flex items-center gap-2">
                  {categoryFilter !== 'all' && (
                    <button onClick={() => setCategoryFilter('all')}
                      className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors">
                      Show all
                    </button>
                  )}
                  {fixableCount > 0 && (
                    <>
                      {canCorrectAll && (
                        <button onClick={handleCorrectAll} disabled={checking}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold
                            bg-slate-800 hover:bg-slate-900 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                          <WandSparkles className="w-3.5 h-3.5" /> Correct All
                        </button>
                      )}
                      <button onClick={handleAcceptAll} disabled={checking}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold
                          bg-emerald-500 hover:bg-emerald-600 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Accept All ({fixableCount})
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Cards */}
              <div ref={issueListRef} className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
                {filteredIssues.length > 0 ? (
                  filteredIssues.map((issue) => {
                    const realIdx = result.issues.indexOf(issue);
                    return (
                      <SuggestionCard key={`${issue.ruleId}-${issue.start}-${realIdx}`}
                        issue={issue} inputText={result.input} isActive={activeIssue === realIdx}
                        onHover={() => setActiveIssue(realIdx)}
                        onAccept={(rep) => handleAccept(realIdx, rep)}
                        onDismiss={() => handleDismiss(realIdx)} />
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="p-3 rounded-2xl bg-green-50 dark:bg-green-950/30 mb-3">
                      <CheckCircle2 className="w-10 h-10 text-green-500" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                      {categoryFilter !== 'all' ? `No ${CATEGORIES.find(c => c.key === categoryFilter)?.label.toLowerCase()} issues` : 'Looking good!'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-500">
                      {categoryFilter !== 'all' ? 'Try checking another category.' : 'No more suggestions.'}
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── Empty state ──────────────────────────────────────────── */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 mb-4">
                <Shield className="w-10 h-10 text-emerald-500" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Grammar Checker</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-500 max-w-[280px] leading-relaxed mb-4">
                Paste your text and click &ldquo;Check&rdquo; to get grammar, spelling, and style suggestions.
              </p>

              {/* Engine status */}
              <div className="w-full mb-5 p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-100 dark:border-zinc-800">
                <div className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Engines</div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-400"><PenTool className="w-3 h-3" /> Vercel grammar backend</span>
                    <span className="text-emerald-500 text-[10px] font-bold">Ready</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-400"><Brain className="w-3 h-3" /> AI assist</span>
                    <span className="text-slate-400 dark:text-zinc-500 text-[10px] font-bold">{backendHealth?.ai_available ? 'Configured' : 'Optional'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-400"><Shield className="w-3 h-3" /> Protected spans</span>
                    <span className="text-slate-400 dark:text-zinc-500 text-[10px] font-bold">Quotes + citations</span>
                  </div>
                </div>
              </div>

              <div className="w-full space-y-1.5 text-left">
{CATEGORIES.map(cat => (
                  <div key={cat.key} className="flex items-start gap-2.5 p-2.5 rounded-lg">
                    <span className="text-emerald-500 mt-0.5">{CATEGORY_ICONS[cat.key]}</span>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">{cat.label}</p>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-500">{cat.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
