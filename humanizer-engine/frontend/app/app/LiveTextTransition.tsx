'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { RotateCcw, Check, Sparkles } from 'lucide-react';

/* ── Types ─────────────────────────────────────────────────────────────── */
export interface StreamSentence {
  text: string;
  stage: string;        // current stage: 'original' | 'Engine' | 'Sentence Processing' | 'Restructuring' | 'Polishing' | 'done'
}

export interface Props {
  /** Array of sentences, updated in real-time from SSE stream */
  sentences: StreamSentence[];
  /** Indices where new paragraphs start */
  paragraphBoundaries: number[];
  /** Current global processing stage label */
  globalStage: string;
  /** Whether the entire processing is complete */
  isDone: boolean;
  /** Called after the 'done' animation finishes */
  onComplete: () => void;
}

/* ── Stage progress mapping ────────────────────────────────────────────── */
const STAGE_ORDER = ['original', 'Engine', 'Sentence Processing', 'Restructuring', 'Polishing', 'done'];
const CYCLE_STAGE_RE = /^Cycle\s+(\d+)\/(\d+)$/i;
const CYCLE_TEXT_COLORS = [
  'text-rose-400',
  'text-orange-400',
  'text-amber-400',
  'text-yellow-300',
  'text-lime-300',
  'text-green-300',
  'text-emerald-300',
  'text-teal-300',
  'text-cyan-300',
  'text-emerald-400',
];

function stageProgress(stage: string): number {
  const cycleMatch = stage.match(CYCLE_STAGE_RE);
  if (cycleMatch) {
    const current = Number(cycleMatch[1]);
    const total = Number(cycleMatch[2]) || 10;
    if (total > 0) return Math.min(1, Math.max(0, current / total));
  }
  const idx = STAGE_ORDER.indexOf(stage);
  return idx >= 0 ? idx / (STAGE_ORDER.length - 1) : 0;
}

function stageColorClass(stage: string, isDone: boolean): string {
  if (isDone || stage === 'done') return 'text-emerald-400';
  if (stage === 'original') return 'text-red-500/60';

  const cycleMatch = stage.match(CYCLE_STAGE_RE);
  if (cycleMatch) {
    const idx = Math.max(1, Number(cycleMatch[1])) - 1;
    return CYCLE_TEXT_COLORS[Math.min(idx, CYCLE_TEXT_COLORS.length - 1)] ?? 'text-amber-400';
  }

  const progress = stageProgress(stage);
  if (progress < 0.5) return 'text-red-400';
  if (progress < 0.8) return 'text-amber-400';
  return 'text-emerald-400/70';
}

/* ── Component ─────────────────────────────────────────────────────────── */
export default function LiveTextTransition({
  sentences,
  paragraphBoundaries,
  globalStage,
  isDone,
  onComplete,
}: Props) {
  const completeCalledRef = useRef(false);
  const mountedRef = useRef(true);
  // Track which sentences recently had their TEXT changed (for flash effect)
  const prevTextsRef = useRef<string[]>([]);
  const [flashSet, setFlashSet] = useState<Set<number>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Detect text changes per sentence and trigger flash
  useEffect(() => {
    const prev = prevTextsRef.current;
    const changed = new Set<number>();
    for (let i = 0; i < sentences.length; i++) {
      if (prev[i] !== undefined && prev[i] !== sentences[i].text) {
        changed.add(i);
      }
    }
    prevTextsRef.current = sentences.map(s => s.text);
    if (changed.size > 0) {
      setFlashSet(changed);
      // Clear flash after animation duration
      const timer = setTimeout(() => {
        if (mountedRef.current) setFlashSet(new Set());
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [sentences]);

  /* Fire onComplete after done animation */
  useEffect(() => {
    if (!isDone || completeCalledRef.current) return;
    completeCalledRef.current = true;
    // Brief pause at green before transitioning to editable textarea
    const timer = setTimeout(() => {
      if (mountedRef.current) {
        setTimeout(() => {
          if (mountedRef.current) onComplete();
        }, 800);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [isDone, onComplete]);

  /* ── Build paragraphs from flat sentence array ─────────────────── */
  const renderContent = useCallback(() => {
    if (sentences.length === 0) return null;

    const elements: React.ReactNode[] = [];
    const boundaries = paragraphBoundaries.length > 0 ? paragraphBoundaries : [0];

    for (let pi = 0; pi < boundaries.length; pi++) {
      const start = boundaries[pi];
      const end = pi < boundaries.length - 1 ? boundaries[pi + 1] : sentences.length;
      const paraSentences = sentences.slice(start, end);

      if (paraSentences.length === 0) continue;

      // Gap between paragraphs
      if (pi > 0) elements.push(<div key={`gap-${pi}`} className="h-4" />);

      // Detect heading: single short sentence without terminal punctuation
      const isHeading =
        paraSentences.length === 1 &&
        paraSentences[0].text.length < 120 &&
        !/[.!?]$/.test(paraSentences[0].text) &&
        paraSentences[0].text.split(/\s+/).length <= 15;

      if (isHeading) {
        const s = paraSentences[0];
        const done = s.stage === 'done' || isDone;
        elements.push(
          <div
            key={`h-${pi}`}
            className={`font-semibold transition-all duration-500 block ${stageColorClass(s.stage, done)}`}
          >
            {s.text}
          </div>,
        );
        continue;
      }

      // Regular paragraph — each sentence colored by its own stage
      const sentenceEls = paraSentences.map((s, si) => {
        const globalIdx = start + si;
        const done = s.stage === 'done' || isDone;
        const isFlashing = flashSet.has(globalIdx);

        const colorCls = stageColorClass(s.stage, done);

        // Flash highlight when text changes
        const flashCls = isFlashing
          ? 'bg-amber-900/30 rounded px-0.5 -mx-0.5'
          : 'bg-transparent';

        return (
          <span
            key={`s-${globalIdx}`}
            className={`transition-all duration-500 ease-out inline ${colorCls} ${flashCls}`}
          >
            {s.text}{' '}
          </span>
        );
      });

      elements.push(
        <p key={`p-${pi}`} className="leading-relaxed">
          {sentenceEls}
        </p>,
      );
    }

    return elements;
  }, [sentences, paragraphBoundaries, isDone, flashSet]);

  /* ── Progress calculation ────────────────────────────────────────── */
  const totalProgress = isDone
    ? 100
    : sentences.length === 0
      ? 2
      : Math.round(
          (sentences.reduce((sum, s) => sum + stageProgress(s.stage), 0) /
            Math.max(sentences.length, 1)) *
            100,
        );

  // Count how many sentences have changed from original
  const changedCount = sentences.filter(s => s.stage !== 'original').length;

  /* ── JSX ──────────────────────────────────────────────────────────── */
  return (
    <div className="flex h-full min-h-0 flex-col relative">
      {/* Background overlay */}
      <div
        className={`absolute inset-0 transition-colors duration-1000 rounded-b-xl pointer-events-none ${
          isDone
            ? 'bg-emerald-950/20'
            : 'bg-red-950/10'
        }`}
      />

      {/* Text content — all sentences visible concurrently */}
      <div className="relative z-10 flex-1 p-4 text-[14px] leading-relaxed overflow-y-auto select-none">
        {sentences.length > 0 ? (
          renderContent()
        ) : (
          <div className="flex items-center gap-2 text-red-400 animate-pulse">
            <RotateCcw className="w-3.5 h-3.5 animate-spin" />
            <span className="text-sm">Preparing sentences…</span>
          </div>
        )}
      </div>

      {/* Bottom status bar */}
      <div className="relative z-10 border-t border-slate-200 dark:border-zinc-800 px-4 py-2.5 flex items-center gap-3">
        {isDone ? (
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-400">
              Humanization complete
            </span>
          </div>
        ) : sentences.length > 0 ? (
          <div className="flex items-center gap-2">
            <Sparkles className={`w-3 h-3 animate-pulse ${stageColorClass(globalStage, false)}`} />
            <span className={`text-xs font-medium ${stageColorClass(globalStage, false)}`}>
              {globalStage} ({changedCount}/{sentences.length})
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <RotateCcw className="w-3 h-3 text-red-400 animate-spin" />
            <span className="text-xs font-medium text-red-400">
              Initializing…
            </span>
          </div>
        )}

        {/* Progress bar */}
        <div className="flex-1 max-w-[200px] ml-auto h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              isDone
                ? 'bg-emerald-500'
                : totalProgress > 60
                  ? 'bg-gradient-to-r from-amber-400 to-emerald-500'
                  : totalProgress > 20
                    ? 'bg-gradient-to-r from-red-400 to-amber-500'
                    : 'bg-red-400'
            }`}
            style={{ width: `${totalProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
