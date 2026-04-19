'use client';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';

import { Copy, Check, Zap, Eraser, RotateCcw, Type, AlignLeft, RefreshCw, AlertTriangle, Clock, ChevronDown, ChevronUp, Shield, Settings, ClipboardPaste, SpellCheck, GitCompare, ShieldCheck, Text, Download, Sparkles } from 'lucide-react';
import { GrammarChecker } from '@/lib/engine/grammar-corrector';
import UsageBar, { useUsage } from './UsageBar';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../AuthProvider';
import Link from 'next/link';
import { DiffView } from '@/components/humanizer/diff-view';
import { MetricsStrip } from '@/components/humanizer/metrics-strip';
import { SentenceMeter } from '@/components/humanizer/sentence-meter';
import { ExportMenu } from '@/components/humanizer/export-menu';
import { CosmicLoader } from '@/components/humanizer/cosmic-loader';

const ADMIN_EMAILS = ['maguna956@gmail.com', 'maxwellotieno11@gmail.com'];

/* ── Types ──────────────────────────────────────────────────────────────── */
interface DetectorScore { detector: string; ai_score: number; human_score: number; }
interface DetectionResult { overallAi: number; overallHuman: number; detectors: DetectorScore[]; }
interface HumanizeResponse {
  success: boolean; humanized: string; word_count: number; input_word_count: number;
  engine_used: string; meaning_preserved: boolean; meaning_similarity: number;
  input_detector_results: { overall: number; detectors: DetectorScore[] };
  output_detector_results: { overall: number; detectors: DetectorScore[] };
  sentence_alternatives?: Record<string, { text: string; score: number }[]>;
  usage_words_used?: number;
  usage_words_limit?: number;
  error?: string;
}
interface SynonymOption { word: string; isOriginal: boolean; }
interface SentenceAlternative { text: string; score: number; }
interface SelectionInfo { text: string; start: number; end: number; rect: { x: number; y: number }; type: 'word' | 'sentence'; }
interface ScoredSentence { text: string; start: number; end: number; score: number; }

/* ── Temporary History (auto-expires after 4 minutes) ──────────────────── */
interface HistoryEntry {
  id: string;
  inputSnippet: string;
  outputSnippet: string;
  fullInput: string;
  fullOutput: string;
  engine: string;
  aiScoreBefore: number;
  aiScoreAfter: number;
  wordCount: number;
  timestamp: number; // Date.now()
}

const HISTORY_TTL_MS = 5 * 60 * 1000; // 5 minutes — files auto-delete to save storage

/* ── Per-sentence AI scoring — same micro-signals as backend multi-detector ── */
const AI_MARKER_WORDS = new Set([
  'utilize','leverage','facilitate','comprehensive','multifaceted','paramount',
  'furthermore','moreover','additionally','consequently','subsequently','nevertheless',
  'notwithstanding','aforementioned','paradigm','trajectory','discourse','robust',
  'nuanced','pivotal','intricate','transformative','innovative','groundbreaking',
  'mitigate','streamline','optimize','bolster','catalyze','delve','embark','foster',
  'harness','spearhead','unravel','unveil','tapestry','cornerstone','nexus','myriad',
  'plethora','realm','landscape','methodology','framework','holistic','substantive',
  'salient','ubiquitous','meticulous','profound','enhance','crucial','vital','essential',
  'significant','implement','navigate','underscore','highlight','interplay','diverse',
  'dynamic','ensure','aspect','notion','endeavor','pertaining','integral',
]);
const AI_STARTERS_CLIENT = [
  'furthermore,','moreover,','additionally,','consequently,','subsequently,',
  'nevertheless,','notwithstanding,','accordingly,','thus,','hence,',
  'indeed,','notably,','specifically,','crucially,','importantly,',
  'essentially,','fundamentally,','arguably,','undeniably,','undoubtedly,',
  'interestingly,','remarkably,','evidently,','in conclusion,','to summarize,',
  'it is important','it is worth','it is essential','it is crucial',
  'it should be noted','in today\'s','in the realm','when it comes to',
];
const AI_PHRASE_PATTERNS_CLIENT = [
  /\b(plays? a (crucial|vital|important|significant|key|pivotal|critical|fundamental|instrumental|central|essential|major) role)\b/i,
  /\b(a (wide|broad|vast|diverse|rich|extensive) (range|array|spectrum|variety|selection) of)\b/i,
  /\b(it is (important|crucial|essential|vital|imperative|worth noting|notable|noteworthy) (to note |to mention |to emphasize |to stress |to recognize |to acknowledge |to highlight |to consider )?that)\b/i,
  /\b(in today's (world|society|landscape|era|age|environment|climate|context))\b/i,
  /\b(in (order to|the context of|terms of|light of))\b/i,
  /\b(has (significantly|substantially|dramatically|fundamentally) (changed|transformed|impacted|influenced))\b/i,
  /\b(it (should|must|can) be (noted|observed|mentioned|emphasized) that)\b/i,
  /\b(on the other hand|by the same token|in the same vein)\b/i,
  /\b(the (importance|significance|impact|role) of)\b/i,
  /\b(this (essay|paper|article|report|analysis) (will|aims to|seeks to|explores))\b/i,
  /\b(not only .{5,80}? but also)\b/i,
  /\b(serves? as a (testament|reminder|catalyst|cornerstone|foundation|beacon|symbol))\b/i,
  /\b(each and every)\b/i,
  /\b(there is no doubt that)\b/i,
  /\b(when it comes to)\b/i,
];
const FUNCTION_WORDS_CLIENT = new Set(['the','a','an','in','on','at','to','for','of','with','by','from','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','shall','should','may','might','can','could','must','that','this','these','those','it','its','and','but','or','nor','not','no','so','if','as','than','into','about','up','out','them','they','their','we','our','he','she','his','her']);

const scoreSentence = (sentence: string, overallAi: number): number => {
  if (overallAi <= 5) return 0;
  const trimmed = sentence.trim();
  if (!trimmed) return 0;
  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < 4) return 0;
  let miniScore = 0;
  const lower = trimmed.toLowerCase();
  // Signal 1: AI sentence starters (+0.20)
  if (AI_STARTERS_CLIENT.some(s => lower.startsWith(s))) miniScore += 0.20;
  // Signal 2: AI marker word density (+0.00-0.20)
  const markerD = words.filter(w => AI_MARKER_WORDS.has(w)).length / words.length;
  miniScore += Math.min(markerD * 5.0, 0.20);
  // Signal 3: Word length CV < 0.35 (+0.12)
  const wLens = words.map(w => w.length);
  const mean = wLens.reduce((a,b)=>a+b,0)/wLens.length;
  const std = Math.sqrt(wLens.reduce((a,l)=>a+(l-mean)**2,0)/wLens.length);
  if (mean > 0 && std/mean < 0.35) miniScore += 0.12;
  // Signal 4: AI sweet spot length 13-30 words (+0.10)
  if (words.length >= 13 && words.length <= 30) miniScore += 0.10;
  // Signal 5: Function word ratio in AI range (+0.10)
  const fwR = words.filter(w => FUNCTION_WORDS_CLIENT.has(w)).length / words.length;
  if (fwR >= 0.35 && fwR <= 0.55) miniScore += 0.10;
  // Signal 6: AI phrase patterns (+0.12)
  if (AI_PHRASE_PATTERNS_CLIENT.some(p => p.test(lower))) miniScore += 0.12;
  // Signal 7: No contractions (+0.03)
  if (!words.some(w => w.includes("'"))) miniScore += 0.03;
  // Signal 8: Formal link words (+0.10)
  const formalLinks = new Set(['however','therefore','furthermore','moreover','consequently','additionally','conversely','similarly','specifically','particularly','notably','indeed','essentially','fundamentally','accordingly','thus']);
  if (words.some(w => formalLinks.has(w))) miniScore += 0.10;
  // Signal 9: No personal pronouns (+0.02)
  const personal = new Set(['i','we','you','my','me','your','our','us']);
  if (!words.some(w => personal.has(w))) miniScore += 0.02;
  // Signal 10: Passive voice (+0.06)
  if (/\b(is|are|was|were|been|being)\s+(being\s+)?\w+ed\b/i.test(trimmed)) miniScore += 0.06;
  // Combine: if sentence scores above threshold, blend with overall
  const sentenceAi = miniScore >= 0.28 ? Math.min(100, overallAi * 0.5 + miniScore * 120) : Math.max(0, overallAi * 0.3 + miniScore * 60);
  return Math.min(100, Math.max(0, sentenceAi));
};

const splitSentences = (text: string): { text: string; start: number; end: number }[] => {
  if (!text) return [];
  const result: { text: string; start: number; end: number }[] = [];
  const regex = /[^.!?\n]*[.!?][\s]*/g;
  let match;
  let lastEnd = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastEnd) result.push({ text: text.slice(lastEnd, match.index), start: lastEnd, end: match.index });
    result.push({ text: match[0], start: match.index, end: match.index + match[0].length });
    lastEnd = match.index + match[0].length;
  }
  if (lastEnd < text.length) result.push({ text: text.slice(lastEnd), start: lastEnd, end: text.length });
  return result;
};

/* ── Constants ──────────────────────────────────────────────────────────── */
// Full engine registry — admin controls which are visible/premium via Supabase engine_config
const ALL_ENGINES: EngineConfig[] = [
  // 🟢 Core Engines
  { id: 'easy', label: 'Swift' },
  { id: 'ninja_1', label: 'Ninja' },
  { id: 'antipangram', label: 'Pangram' },
  // 🟡 Detection Control
  { id: 'humara_v3_3', label: 'Humarin' },
  { id: 'oxygen', label: 'Oxygen' },
  { id: 'king', label: 'King' },
  { id: 'nuru_v2', label: 'Nuru' },
  { id: 'ghost_pro_wiki', label: 'Ghost' },
  // 🔴 Advanced Engines
  { id: 'ninja_3', label: 'Ninja 3' },
  { id: 'ninja_2', label: 'Beta' },
  { id: 'ninja_5', label: 'Omega' },
  { id: 'ghost_trial_2', label: 'Specter' },
  { id: 'phantom', label: 'Phantom' },
  { id: 'ai_analysis', label: 'AI Analysis' },
];

type ModeId = 'core_engines' | 'detection_control' | 'advanced_engines';
const MODE_ENGINES: Record<ModeId, Set<string>> = {
  core_engines: new Set(['easy', 'ninja_1', 'antipangram']),
  detection_control: new Set(['humara_v3_3', 'oxygen', 'king', 'nuru_v2', 'ghost_pro_wiki']),
  advanced_engines: new Set([
    'ninja_3',
    'ninja_2',
    'ninja_5',
    'ghost_trial_2',
    'phantom',
    'ai_analysis',
  ]),
};
const MODE_LABELS: Record<ModeId, string> = {
  core_engines: 'Core Engines',
  detection_control: 'Detection Control',
  advanced_engines: 'Advanced Engines',
};

const ENGINE_GUIDES: Record<string, string> = {
  // Core Engines
  easy: 'Swift — Quick balanced rewrites with natural-sounding output and 10× Nuru polish.',
  ninja_1: 'Ninja — LLM-powered stealth rewrite → Humara 2.0 → 10× Nuru for maximum evasion.',
  antipangram: 'Pangram — Forensic AI-signal destroyer. Pure TypeScript. No LLM, no API. Surgical precision.',
  // Detection Control
  humara_v3_3: 'Humarin — High-power engine for stubborn GPTZero flags via Humara 2.4 + Nuru.',
  oxygen: 'Oxygen — Tuned for GPTZero signal suppression with adaptive iteration.',
  king: 'King — Pure LLM humanizer (Groq). 3-phase: deep rewrite → self-audit → targeted revision + Nuru.',
  nuru_v2: 'Nuru — Purely non-LLM stealth engine. 10 iterative passes — no AI calls, no external APIs.',
  ghost_pro_wiki: 'Ghost — Academic-style rewrite that sounds like encyclopedic human writing.',
  // Advanced Engines
  ninja_3: 'Ninja 3 — Humara 2.0 (instant) → full 10× Nuru. Fast aggressive AI signal suppression under 20 seconds.',
  ninja_2: 'Beta — Easy → Humara 2.0 → full 10× Nuru. Multi-pass chain for deep cleaning.',
  ninja_5: 'Omega — Easy → Humara 2.4 → full 10× Nuru. Maximum transformation depth.',
  ghost_trial_2: 'Specter — Humara 2.4 → Humara 2.0 → full 10× Nuru. Ghost-grade signal removal.',
  phantom: 'Phantom — Humara 2.4 → 10× Nuru → deep clean → AntiPangram forensic cleanup.',
  ai_analysis: 'AI Analysis — Smart auto-selector. Uses API-free offline passes (Oxygen + AntiPangram + Nuru), then loops until under 20% AI across all detectors.',
};

const DEFAULT_PROCESSING_MESSAGES = [
  'Breaking repetitive cadence while keeping the argument intact.',
  'Streaming each completed operation into the live progress meter.',
  'Letting the current stage finish cleanly instead of faking instant output.',
];

const PROCESSING_STAGE_COPY: Array<{ test: RegExp; messages: string[] }> = [
  {
    test: /initial|engine processing/i,
    messages: [
      'Queueing the selected engine and splitting the document into stable sentence blocks.',
      'Preparing the stream so progress updates land faster and feel less sticky.',
      'Locking in the active profile before the heavy lifting starts.',
    ],
  },
  {
    test: /restructur|rewrit|wikipedia|humara|ninja|oxygen|ghost|king/i,
    messages: [
      'Reshaping sentence rhythm so the draft stops sounding templated.',
      'Pushing the active engine through its rewrite phase without stalling the UI.',
      'Refreshing structure first, then handing the result to the clean-up stack.',
    ],
  },
  {
    test: /nuru|deep clean|cleanup|recheck/i,
    messages: [
      'Sweeping for leftover detector signals and flattening repeated phrasing.',
      'Running targeted clean-up passes on the lines that still look synthetic.',
      'Polishing the noisy edges before the final quality pass closes out.',
    ],
  },
  {
    test: /sentence processing|smooth|grammar|polish/i,
    messages: [
      'Smoothing awkward joins so the output reads like one continuous draft.',
      'Tidying punctuation, grammar, and local flow before delivery.',
      'Applying the final polish layer while keeping the rewritten meaning stable.',
    ],
  },
  {
    test: /analyzing|complete/i,
    messages: [
      'Wrapping up the stream and preparing the final text for editing.',
      'Final checks are running now; the output panel will unlock immediately after.',
      'The pipeline is closing out and handing the full draft back to the editor.',
    ],
  },
];

const normalizeProcessingStageLabel = (label: string) =>
  label
    .replace(/^Phase\s+\d+\/\d+\s*[–-]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const getProcessingMessages = (label: string) => {
  const normalized = normalizeProcessingStageLabel(label);
  const matched = PROCESSING_STAGE_COPY.find(entry => entry.test.test(normalized));
  return matched?.messages ?? DEFAULT_PROCESSING_MESSAGES;
};

const MAX_WORDS_PER_REQUEST = 2000;
const RECOMMENDED_MIN_WORDS = 500;
const RECOMMENDED_MAX_WORDS = 1500;
const EDITOR_HEIGHT_CLASS = 'min-h-[240px] sm:min-h-[320px] md:min-h-[380px] lg:min-h-[420px] max-h-[320px] sm:max-h-[420px] md:max-h-[500px] lg:max-h-[560px]';

interface EngineConfig {
  id: string;
  label: string;
}
const STRENGTHS = [
  { id: 'light', label: 'Light' },
  { id: 'medium', label: 'Medium' },
  { id: 'strong', label: 'Strong' },
];
const TONES = [
  { id: 'neutral', label: 'Natural' },
  { id: 'academic', label: 'Academic' },
  { id: 'professional', label: 'Business' },
  { id: 'simple', label: 'Direct' },
];

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function EditorPage() {
  return <EditorPageInner />;
}

function EditorPageInner() {
  const { user, session } = useAuth();
  const isAdmin = user?.email ? ADMIN_EMAILS.includes(user.email) : false;
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [rephrasing, setRephrasing] = useState(false);

  const [engine, setEngine] = useState('humara_v3_3');
  const [engineDropdownOpen, setEngineDropdownOpen] = useState(false);
  const [strength, setStrength] = useState('medium');
  const [tone, setTone] = useState('academic');
  const [strictMeaning, setStrictMeaning] = useState(true);
  const [humanizationRate, setHumanizationRate] = useState(8);
  const [grammarCorrection, setGrammarCorrection] = useState(false);
  const [mode, setMode] = useState<ModeId>('detection_control');

  // Admin-controlled engine visibility
  const [engineConfig, setEngineConfig] = useState<Record<string, { enabled: boolean; premium: boolean; sort_order: number }>>({});
  const [engineConfigLoaded, setEngineConfigLoaded] = useState(false);

  // Fetch engine config from Supabase on mount
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from('engine_config').select('engine_id, enabled, premium, sort_order');
        if (error) {
          console.log('[Engine Config] Table does not exist or query failed, using defaults');
        } else if (data && data.length > 0) {
          const config: Record<string, { enabled: boolean; premium: boolean; sort_order: number }> = {};
          for (const row of data) {
            config[row.engine_id] = { enabled: row.enabled, premium: row.premium, sort_order: row.sort_order ?? 0 };
          }
          setEngineConfig(config);
          console.log('[Engine Config] Loaded from Supabase:', config);
        } else {
          console.log('[Engine Config] No data in table, using defaults');
        }
      } catch (e) {
        console.log('[Engine Config] Error loading config:', e);
      }
      setEngineConfigLoaded(true);
    })();
  }, []);

  // Compute visible engines: filter by admin config and active mode
  const ENGINES: EngineConfig[] = useMemo(() => {
    // Start with all engines
    let base = ALL_ENGINES;
    // Apply admin config if available
    if (engineConfigLoaded) {
      const hasConfig = Object.keys(engineConfig).length > 0;
      if (hasConfig) {
        base = base
          .filter(e => engineConfig[e.id]?.enabled !== false)
          .sort((a, b) => (engineConfig[a.id]?.sort_order ?? 99) - (engineConfig[b.id]?.sort_order ?? 99));
      }
    }
    // Apply mode-specific filter
    return base.filter(e => MODE_ENGINES[mode].has(e.id));
  }, [engineConfig, engineConfigLoaded, mode]);

  // Auto-switch engine when mode changes
  useEffect(() => {
    const fallbackByMode: Record<ModeId, string> = {
      core_engines: 'easy',
      detection_control: 'humara_v3_3',
      advanced_engines: 'ninja_5',
    };
    if (!MODE_ENGINES[mode].has(engine)) setEngine(fallbackByMode[mode]);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ensure engine stays valid after admin config filtering
  useEffect(() => {
    if (ENGINES.length === 0) return;
    if (!ENGINES.some(e => e.id === engine)) setEngine(ENGINES[0].id);
  }, [ENGINES, engine]);

  const [inputDetection, setInputDetection] = useState<DetectionResult | null>(null);
  const [outputDetection, setOutputDetection] = useState<DetectionResult | null>(null);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [_sentenceScores, setSentenceScores] = useState<ScoredSentence[]>([]);
  const [_meaningScore, setMeaningScore] = useState<number | null>(null);

  const { usage, refresh: refreshUsage, addWords, setUsageTotals } = useUsage();
  const PLAN_COLORS: Record<string, string> = { Starter: '#64748b', Creator: '#a855f7', Professional: '#10b981', Business: '#f59e0b' };
  const planColor = usage ? PLAN_COLORS[usage.planName] || '' : '';

  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const [synonyms, setSynonyms] = useState<SynonymOption[]>([]);
  const [sentenceAlternatives, setSentenceAlternatives] = useState<SentenceAlternative[]>([]);
  const [popupType, setPopupType] = useState<'synonym' | 'sentence' | null>(null);
  const [loadingPopup, setLoadingPopup] = useState(false);
  const [rehumanizing, setRehumanizing] = useState(false);
  const [iterationCount, setIterationCount] = useState(0);
  const [preGeneratedAlts, setPreGeneratedAlts] = useState<Record<string, SentenceAlternative[]>>({});

  // Live streaming progress state
  const [isAnimating, setIsAnimating] = useState(false);
  const [streamGlobalStage, setStreamGlobalStage] = useState('Initializing…');
  const [streamProgress, setStreamProgress] = useState(0); // 0-100 within current phase
  const [streamProgressTarget, setStreamProgressTarget] = useState(0); // 0-100
  const [streamPhaseName, setStreamPhaseName] = useState('');
  const [streamPhaseIndex, setStreamPhaseIndex] = useState(0);
  const [streamTotalPhases, setStreamTotalPhases] = useState(1);
  const [streamCycleCurrent, setStreamCycleCurrent] = useState(0);
  const [streamCycleTotal, setStreamCycleTotal] = useState(0);
  const [streamCycleLabel, setStreamCycleLabel] = useState('');
  const [processingMessageIndex, setProcessingMessageIndex] = useState(0);
  const streamSentenceTotalRef = useRef(1);
  const streamPhaseSentenceRef = useRef(0);
  const streamPhaseOpsRef = useRef(1);
  const streamStageStartedAtRef = useRef(0);
  const streamLastActivityAtRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Output view switcher: result | diff | confidence
  type OutputView = 'result' | 'diff' | 'confidence';
  const [outputView, setOutputView] = useState<OutputView>('result');
  const [runSalt, setRunSalt] = useState(0);

  // Temporary history (auto-expires)
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Easy engine controls
  const [easySentenceBySentence, setEasySentenceBySentence] = useState(false);

  // Auto Model controls
  const [autoModelEnabled, setAutoModelEnabled] = useState(false);
  const [autoModelConfirmOpen, setAutoModelConfirmOpen] = useState(false);
  const [autoModelRedPhase, setAutoModelRedPhase] = useState(false); // true = red blink (first 10s)
  const autoModelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ozone engine controls — sentence-by-sentence ON by default to protect titles
  const [ozoneSentenceBySentence, setOzoneSentenceBySentence] = useState(true);
  const [ozoneUndetectWarning, setOzoneUndetectWarning] = useState(false);

  // Oxygen model v2 controls
  const [oxygenMode, setOxygenMode] = useState<'quality' | 'fast' | 'aggressive'>('quality');
  const [oxygenSentenceBySentence, setOxygenSentenceBySentence] = useState(false);
  const [oxygenMinChangeRatio, setOxygenMinChangeRatio] = useState(0.40);
  const [oxygenMaxRetries, setOxygenMaxRetries] = useState(5);
  const [oxygenAdvancedOpen, setOxygenAdvancedOpen] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const detectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engineBtnRef = useRef<HTMLButtonElement>(null);

  const inputWords = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);
  const outputWords = useMemo(() => (result.trim() ? result.trim().split(/\s+/).length : 0), [result]);
  const hasUnlimitedDailyWords = !!usage && (usage.isUnlimited || usage.wordsLimit < 0);
  const remainingDailyWords = hasUnlimitedDailyWords
    ? Number.POSITIVE_INFINITY
    : (usage ? Math.max(0, usage.wordsLimit - usage.wordsUsed) : 0);
  const isDailyLimitReached = !isAdmin && !!usage && !hasUnlimitedDailyWords && remainingDailyWords <= 0;
  const isRephraseLimitReached = !isAdmin && !!usage && !hasUnlimitedDailyWords && remainingDailyWords < outputWords;

  const stripLeadingPanelLabel = useCallback((value: string): string => {
    const normalized = value.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const firstContentLineIndex = lines.findIndex((line) => line.trim().length > 0);

    if (firstContentLineIndex === -1) return normalized;

    const firstContentLine = lines[firstContentLineIndex].trim();
    if (!/^(?:input|output)\s*[:\-]?$/i.test(firstContentLine)) {
      return normalized;
    }

    lines.splice(firstContentLineIndex, 1);
    if (firstContentLineIndex < lines.length && lines[firstContentLineIndex].trim() === '') {
      lines.splice(firstContentLineIndex, 1);
    }

    return lines.join('\n').replace(/^\n+/, '');
  }, []);

  // Preserve original casing while stripping accidental panel label wrappers.
  const normalizeTypedInput = useCallback(
    (value: string) => stripLeadingPanelLabel(value),
    [stripLeadingPanelLabel],
  );

  /** Capitalise first letter of text and after sentence-ending punctuation. */
  const capitalizeSentenceStarts = useCallback((value: string): string => {
    return value.replace(/(^|[.!?]\s+)([a-z])/gm, (_m, pre, ch) => pre + ch.toUpperCase());
  }, []);

  const normalizeOutputText = useCallback(
    (value: string) => stripLeadingPanelLabel(value),
    [stripLeadingPanelLabel],
  );

  const inputAvgAi = useMemo(() => {
    if (!inputDetection) return 0;
    // Use same formula as AI Detection page: overall score from all detectors (weighted by backend)
    return inputDetection.overallAi;
  }, [inputDetection]);

  const outputAvgAi = useMemo(() => {
    if (!outputDetection) return 0;
    // Use same formula as AI Detection page: overall score from all detectors (weighted by backend)
    return outputDetection.overallAi;
  }, [outputDetection]);

  const activeEngineLabel = useMemo(
    () => ENGINES.find(entry => entry.id === engine)?.label ?? engine,
    [ENGINES, engine],
  );

  const visibleProcessingStage = useMemo(() => {
    const raw = streamPhaseName || streamGlobalStage || 'Initializing…';
    return normalizeProcessingStageLabel(raw) || 'Initializing';
  }, [streamGlobalStage, streamPhaseName]);

  const processingMessages = useMemo(
    () => getProcessingMessages(visibleProcessingStage),
    [visibleProcessingStage],
  );

  const processingMessage = processingMessages[processingMessageIndex % processingMessages.length];

  const processingStatusItems = useMemo(
    () => [
      { label: 'Engine', value: activeEngineLabel },
      streamCycleTotal > 0
        ? { label: streamCycleLabel || 'Cycle', value: `${streamCycleCurrent}/${streamCycleTotal}` }
        : { label: 'Mode', value: MODE_LABELS[mode] },
      { label: 'Live Fill', value: `${Math.round(streamProgress)}%` },
    ],
    [activeEngineLabel, mode, streamCycleCurrent, streamCycleLabel, streamCycleTotal, streamProgress],
  );

  const resetStreamActivityClock = useCallback(() => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    streamStageStartedAtRef.current = now;
    streamLastActivityAtRef.current = now;
  }, []);

  const markStreamActivity = useCallback((kind: 'stage' | 'activity' = 'activity') => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    streamLastActivityAtRef.current = now;
    if (kind === 'stage') {
      streamStageStartedAtRef.current = now;
    }
  }, []);

  // Auto-expire history entries after TTL
  useEffect(() => {
    if (history.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setHistory(prev => prev.filter(h => now - h.timestamp < HISTORY_TTL_MS));
    }, 15000); // check every 15s
    return () => clearInterval(interval);
  }, [history.length]);

  // Auto Model: 10s red blink → smooth color cycle
  useEffect(() => {
    if (!autoModelEnabled) {
      setAutoModelRedPhase(false);
      if (autoModelTimerRef.current) { clearTimeout(autoModelTimerRef.current); autoModelTimerRef.current = null; }
      return;
    }
    setAutoModelRedPhase(true);
    autoModelTimerRef.current = setTimeout(() => { setAutoModelRedPhase(false); }, 10000);
    return () => { if (autoModelTimerRef.current) clearTimeout(autoModelTimerRef.current); };
  }, [autoModelEnabled]);

  // Auto Model: when enabled, force engine to ai_analysis + advanced mode
  useEffect(() => {
    if (autoModelEnabled) {
      setMode('advanced_engines');
      setEngine('ai_analysis');
    }
  }, [autoModelEnabled]);

  // Auto Model: publish global state to <html> so all UI color targets stay synchronized
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    if (!autoModelEnabled) {
      root.removeAttribute('data-auto-mode');
      root.removeAttribute('data-auto-glow-phase');
      return;
    }

    root.setAttribute('data-auto-mode', 'on');
    root.setAttribute('data-auto-glow-phase', autoModelRedPhase ? 'blink' : 'cycle');

    return () => {
      root.removeAttribute('data-auto-mode');
      root.removeAttribute('data-auto-glow-phase');
    };
  }, [autoModelEnabled, autoModelRedPhase]);

  const handleAutoModelToggle = useCallback(() => {
    if (autoModelEnabled) {
      // Turning off — no confirmation needed
      setAutoModelEnabled(false);
    } else {
      // Turning on — show confirmation popup
      setAutoModelConfirmOpen(true);
    }
  }, [autoModelEnabled]);

  const confirmAutoModel = useCallback(() => {
    setAutoModelConfirmOpen(false);
    setAutoModelEnabled(true);
  }, []);

  const cancelAutoModel = useCallback(() => {
    setAutoModelConfirmOpen(false);
  }, []);

  // CSS class for the auto model glow phase
  const autoGlowClass = autoModelEnabled
    ? (autoModelRedPhase ? 'auto-model-red-blink' : 'auto-model-color-cycle')
    : '';

  // Smooth simulated progress animation that rises gradually
  useEffect(() => {
    if (!isAnimating) return;
    // When done event received (target=100), snap to 100
    if (streamProgressTarget >= 100) {
      setStreamProgress(100);
      return;
    }
    // Smooth rise toward 92% — fast early, slowing as it approaches cap
    const timer = setInterval(() => {
      setStreamProgress(prev => {
        if (prev >= 92) return prev;
        const increment = Math.max(0.3, (92 - prev) * 0.035);
        return Math.min(92, prev + increment);
      });
    }, 150);
    return () => clearInterval(timer);
  }, [isAnimating, streamProgressTarget]);

  useEffect(() => {
    setProcessingMessageIndex(0);
  }, [visibleProcessingStage]);

  useEffect(() => {
    if (!isAnimating) setProcessingMessageIndex(0);
  }, [isAnimating]);

  const addToHistory = useCallback((input: string, output: string, eng: string, aiBefore: number, aiAfter: number, wc: number) => {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      inputSnippet: input.slice(0, 80) + (input.length > 80 ? '…' : ''),
      outputSnippet: output.slice(0, 80) + (output.length > 80 ? '…' : ''),
      fullInput: input,
      fullOutput: output,
      engine: eng,
      aiScoreBefore: aiBefore,
      aiScoreAfter: aiAfter,
      wordCount: wc,
      timestamp: Date.now(),
    };
    setHistory(prev => [entry, ...prev].slice(0, 20)); // keep max 20
  }, []);

  /* ── Auto-detect input — DISABLED (coming soon) ─────────────────────── */
  // Detection deactivated — will be re-enabled with improved accuracy
  useEffect(() => {
    setInputDetection(null);
    setSentenceScores([]);
    setAutoDetecting(false);
  }, [text]);

  /* ── Handlers ───────────────────────────────────────────────────────── */
  /** Clean input text — strip emoji, bullets, line artifacts, numbering */
  const cleanInputText = (raw: string): string => {
    let cleaned = stripLeadingPanelLabel(raw);
    // Remove emoji (Unicode emoji ranges)
    cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '');
    // Remove bullet points and list markers
    cleaned = cleaned.replace(/^[\s]*[•●○◉◆◇▪▫►▸▹▻★☆✦✧✩✪✫✬✭✮✯✰⭐⭑⚫⚪➤➣➢➡→⮕↗↘⇒⇨»«‣⁃∙⬤⬥⬦]\s*/gm, '');
    // Remove numbered list markers: "1." "1)" "1-" "(1)" etc.
    cleaned = cleaned.replace(/^[\s]*(?:\(?\d{1,3}[.):\-]\)?|\(?[a-zA-Z][.):\-]\)?)\s+/gm, '');
    // Remove decorative horizontal lines and separators
    cleaned = cleaned.replace(/^[\s]*[─━═—\-_~]{3,}[\s]*$/gm, '');
    // Remove decorative bracket/pipe patterns: "| text |", "[ text ]"
    cleaned = cleaned.replace(/^\s*[|│┃]\s*/gm, '');
    // Remove leading/trailing asterisks used for markdown bold (but keep the text)
    cleaned = cleaned.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');
    // Collapse multiple blank lines to one
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    // Trim each line
    cleaned = cleaned.split('\n').map(l => l.trim()).join('\n');
    // Remove completely empty lines at start/end
    cleaned = cleaned.trim();
    return cleaned;
  };

  const splitSentenceStrings = (value: string): string[] => {
    const matches = value.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g);
    return (matches ?? [value]).map(part => part.trim()).filter(Boolean);
  };

  const sentenceFingerprint = (sentence: string): string => (
    sentence
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 10)
      .join(' ')
  );

  // Guard against rare stream regressions where near-duplicate draft snapshots get concatenated.
  const collapseRunawayOutput = (sourceText: string, candidateText: string): string => {
    const cleaned = candidateText.trim();
    if (!cleaned) return cleaned;

    const sourceWordCount = sourceText.trim().split(/\s+/).filter(Boolean).length;
    const outputWordCount = cleaned.split(/\s+/).filter(Boolean).length;
    const hardWordLimit = Math.max(300, Math.floor(sourceWordCount * 2.4));

    if (sourceWordCount < 8 || outputWordCount <= hardWordLimit) {
      return cleaned;
    }

    const sourceSentenceCount = Math.max(1, splitSentenceStrings(sourceText).length);
    const outputSentences = splitSentenceStrings(cleaned);
    if (!outputSentences.length) {
      return cleaned;
    }

    const seenFingerprints = new Map<string, number>();
    let repeatHits = 0;
    let cutAt = outputSentences.length;

    for (let i = 0; i < outputSentences.length; i += 1) {
      const fingerprint = sentenceFingerprint(outputSentences[i]);
      if (!fingerprint) continue;

      const previousIndex = seenFingerprints.get(fingerprint);
      if (typeof previousIndex === 'number' && i - previousIndex >= Math.max(2, Math.floor(sourceSentenceCount * 0.6))) {
        repeatHits += 1;
        if (i >= sourceSentenceCount && repeatHits >= Math.max(2, Math.floor(sourceSentenceCount * 0.4))) {
          cutAt = i;
          break;
        }
      } else {
        seenFingerprints.set(fingerprint, i);
      }
    }

    const collapsed = outputSentences.slice(0, cutAt).join(' ').trim();
    const collapsedWords = collapsed.split(/\s+/).filter(Boolean);
    if (collapsedWords.length > hardWordLimit) {
      return collapsedWords.slice(0, hardWordLimit).join(' ').trim();
    }

    return collapsed || cleaned;
  };

  /** Shared SSE streaming handler used by humanize & rephrase */
  const runStreamingHumanize = async (inputText: string, signal: AbortSignal) => {
    const requestBody: Record<string, unknown> = {
      text: cleanInputText(inputText),
      engine,
      strength,
      tone,
      strict_meaning: strictMeaning,
      enable_post_processing: true,
      humanization_rate: humanizationRate,
    };

    // Add Easy controls if Easy engine is selected
    if (engine === 'easy') {
      requestBody.easy_sentence_by_sentence = easySentenceBySentence;
    }


    // Add Oxygen v2 controls if Oxygen engine is selected
    if (engine === 'oxygen') {
      requestBody.oxygen_mode = oxygenMode;
      requestBody.oxygen_sentence_by_sentence = oxygenSentenceBySentence;
      requestBody.oxygen_min_change_ratio = oxygenMinChangeRatio;
      requestBody.oxygen_max_retries = oxygenMaxRetries;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

    const res = await fetch('/api/humanize-stream', {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!res.ok || !res.body) throw new Error('Streaming request failed');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalData: Record<string, unknown> | null = null;
    let doneEventReceived = false;
    let streamedSentences: string[] = [];
    let streamedParagraphBoundaries: number[] = [];
    let lastProgressUiCommit = 0;
    let lastProgressUiValue = 0;

    const reassemblePartialText = (sentences: string[], paragraphBoundaries: number[]) => {
      if (!sentences.length) return '';
      if (!paragraphBoundaries.length) return sentences.join(' ');
      const paragraphs: string[] = [];
      for (let i = 0; i < paragraphBoundaries.length; i++) {
        const start = paragraphBoundaries[i];
        const end = i < paragraphBoundaries.length - 1 ? paragraphBoundaries[i + 1] : sentences.length;
        paragraphs.push(sentences.slice(start, end).filter(Boolean).join(' '));
      }
      return paragraphs.filter(Boolean).join('\n\n');
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let event: Record<string, unknown>;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }

        if (event.type === 'error') {
          markStreamActivity();
          const errorMessage = typeof event.error === 'string' ? event.error : 'Processing failed';
          const partialText = reassemblePartialText(streamedSentences, streamedParagraphBoundaries);
          if (partialText.trim()) {
            finalData = { type: 'done', humanized: partialText, partial: true, error: errorMessage };
            setStreamGlobalStage('Complete');
            setStreamProgressTarget(100);
            setStreamPhaseName('Complete');
            doneEventReceived = true;
            break;
          }
          throw new Error(errorMessage);
        }

        if (event.type === 'init') {
          markStreamActivity('stage');
          const rawSents = Array.isArray(event.sentences)
            ? (event.sentences as string[])
            : [];
          streamedSentences = [...rawSents];
          streamedParagraphBoundaries = (event.paragraphBoundaries as number[]) ?? [];
          streamSentenceTotalRef.current = Math.max(1, rawSents.length);
          streamPhaseSentenceRef.current = 0;
          streamPhaseOpsRef.current = rawSents.length;
          setStreamProgress(0);
          setStreamProgressTarget(0);
          setStreamPhaseName('');
          setStreamPhaseIndex(0);
          setStreamTotalPhases(1);
          setStreamCycleCurrent(0);
          setStreamCycleTotal(0);
          setStreamCycleLabel('');
        } else if (event.type === 'stage') {
          markStreamActivity('stage');
          const stageLabel = event.stage as string;
          setStreamGlobalStage(stageLabel);
          const cycleCurrent = typeof event.cycleCurrent === 'number' ? event.cycleCurrent : 0;
          const cycleTotal = typeof event.cycleTotal === 'number' ? event.cycleTotal : 0;
          setStreamCycleCurrent(cycleCurrent > 0 ? cycleCurrent : 0);
          setStreamCycleTotal(cycleTotal > 0 ? cycleTotal : 0);
          setStreamCycleLabel(
            typeof event.cycleLabel === 'string' && event.cycleLabel.trim().length > 0
              ? event.cycleLabel
              : '',
          );
          // Parse "Phase N/M – Name" format
          const phaseMatch = stageLabel.match(/^Phase\s+(\d+)\/(\d+)\s*[–-]\s*(.+)/i);
          if (phaseMatch) {
            const pi = Number(phaseMatch[1]) || 1;
            const total = Number(phaseMatch[2]) || 1;
            const name = phaseMatch[3].trim();
            setStreamPhaseIndex(pi);
            setStreamTotalPhases(total);
            setStreamPhaseName(name);
            streamPhaseSentenceRef.current = 0;
            // Use phaseOps from backend if provided, otherwise fall back to totalSentences
            streamPhaseOpsRef.current = (typeof event.phaseOps === 'number' && event.phaseOps > 0)
              ? event.phaseOps
              : streamSentenceTotalRef.current;
            // Drain water to 0 for the new phase (except the first)
            if (pi > 1) {
              setStreamProgressTarget(0);
            } else {
              setStreamProgressTarget(2);
            }
            lastProgressUiCommit = performance.now();
            lastProgressUiValue = pi > 1 ? 0 : 2;
          } else {
            const normalizedStage = normalizeProcessingStageLabel(stageLabel);
            setStreamPhaseName(normalizedStage);
            setStreamPhaseIndex(0);
            setStreamTotalPhases(1);
            streamPhaseSentenceRef.current = 0;
            streamPhaseOpsRef.current = (typeof event.phaseOps === 'number' && event.phaseOps > 0)
              ? event.phaseOps
              : streamSentenceTotalRef.current;
            lastProgressUiValue = /analyzing/i.test(stageLabel) ? 96 : 2;
            lastProgressUiCommit = performance.now();
            setStreamProgressTarget(lastProgressUiValue);
          }
        } else if (event.type === 'sentence') {
          markStreamActivity();
          const idx = typeof event.index === 'number' ? event.index : -1;
          const txt = typeof event.text === 'string' ? event.text : '';
          if (idx < 0 || !txt.trim()) continue;
          if (idx >= streamedSentences.length) {
            streamedSentences.length = idx + 1;
          }
          streamedSentences[idx] = txt;
          streamPhaseSentenceRef.current += 1;
          const opsTotal = Math.max(1, streamPhaseOpsRef.current);
          // Progress within current phase: 0→99% based on ops count
          const phaseProgress = Math.max(2, Math.min(99, (Math.min(streamPhaseSentenceRef.current, opsTotal) / opsTotal) * 99));
          const now = performance.now();
          if (
            phaseProgress >= 99 ||
            phaseProgress < lastProgressUiValue ||
            phaseProgress - lastProgressUiValue >= 1.2 ||
            now - lastProgressUiCommit >= 48
          ) {
            lastProgressUiCommit = now;
            lastProgressUiValue = phaseProgress;
            setStreamProgressTarget(phaseProgress);
          }
        } else if (event.type === 'done') {
          markStreamActivity();
          finalData = event as Record<string, unknown>;
          setStreamGlobalStage('Complete');
          setStreamProgressTarget(100);
          setStreamPhaseName('Complete');
          setStreamCycleCurrent(0);
          setStreamCycleTotal(0);
          setStreamCycleLabel('');
          doneEventReceived = true;
        }
      }

      if (doneEventReceived) {
        try { await reader.cancel(); } catch {}
        break;
      }
    }

    // If the stream closed abruptly, do not leave the UI in a perpetual loading state.
    if (!finalData && buffer.trim().startsWith('data: ')) {
      try {
        const trailingEvent = JSON.parse(buffer.trim().slice(6)) as Record<string, unknown>;
        if (trailingEvent.type === 'done') {
          finalData = trailingEvent;
          setStreamGlobalStage('Complete');
          setStreamProgressTarget(100);
        }
      } catch {}
    }

    if (!finalData) {
      const partialText = reassemblePartialText(streamedSentences, streamedParagraphBoundaries);
      if (partialText.trim()) {
        finalData = {
          type: 'done',
          humanized: collapseRunawayOutput(inputText, partialText),
          partial: true,
        };
        setStreamGlobalStage('Complete');
        setStreamProgressTarget(100);
      } else {
        throw new Error('Stream ended before completion');
      }
    }

    if (typeof finalData.humanized === 'string') {
      finalData.humanized = collapseRunawayOutput(inputText, finalData.humanized as string);
    }

    return finalData;
  };

  const handleHumanize = async () => {
    if (!text.trim()) return;
    if (inputWords < 10) { setError('Please enter at least 10 words.'); return; }
    if (inputWords > MAX_WORDS_PER_REQUEST) {
      setError(`Maximum ${MAX_WORDS_PER_REQUEST.toLocaleString()} words per request. You have ${inputWords.toLocaleString()} words. Split your text into smaller sections.`);
      return;
    }
    if (!isAdmin && usage) {
      const remaining = usage.wordsLimit - usage.wordsUsed;
      if (remaining < inputWords) {
        setError(`Word limit reached. ${Math.max(0, remaining).toLocaleString()} words remaining of your daily ${usage.wordsLimit.toLocaleString()} words.`);
        return;
      }
    }
    setLoading(true); setError(''); setResult(''); setOutputDetection(null); setMeaningScore(null); setIterationCount(0); setPreGeneratedAlts({});
    // Reset streaming state and start processing state.
    setStreamGlobalStage('Initializing…');
    setStreamProgress(0);
    setStreamProgressTarget(0);
    setStreamPhaseName('');
    setStreamPhaseIndex(0);
    setStreamTotalPhases(1);
    setStreamCycleCurrent(0);
    setStreamCycleTotal(0);
    setStreamCycleLabel('');
    setProcessingMessageIndex(0);
    resetStreamActivityClock();
    setIsAnimating(true);

    // Abort any previous stream
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const finalData = await runStreamingHumanize(text, controller.signal);

      if (finalData) {
        let currentResult = normalizeOutputText(finalData.humanized as string);

        // Grammar correction pass — fix capitalization, punctuation, agreement etc.
        if (grammarCorrection) {
          const checker = new GrammarChecker();
          currentResult = checker.correctAll(currentResult);
        }

        setResult(currentResult);
        setRunSalt(prev => prev + 1);
        setMeaningScore(finalData.meaning_similarity as number);

        // Detection disabled — coming soon
        // Detection results from API are ignored

        // Add to temporary history
        // Detection disabled — scores set to 0
        addToHistory(text, currentResult, (finalData.engine_used as string) || engine, 0, 0, (finalData.word_count as number) || outputWords);

        // Update usage: if backend returned updated counts, use them; otherwise optimistic + refresh
        if (!isAdmin) {
          if (typeof finalData.usage_words_used === 'number') {
            const exactLimit = typeof finalData.usage_words_limit === 'number'
              ? finalData.usage_words_limit
              : undefined;
            setUsageTotals(finalData.usage_words_used, exactLimit);
          } else {
            // Optimistic: add input word count immediately
            addWords((finalData.input_word_count as number) || inputWords);
          }
          void refreshUsage();
        }

        setStreamProgressTarget(100);
        setStreamProgress(100);
        setIsAnimating(false);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Processing failed');
        setIsAnimating(false);
      }
    }
    finally { setLoading(false); setIterationCount(0); }
  };

  const handleRephrase = async () => {
    if (!result.trim()) return;
    if (outputWords < 10) { setError('Output too short to rephrase.'); return; }
    if (!isAdmin && usage) {
      const remaining = usage.wordsLimit - usage.wordsUsed;
      if (remaining < outputWords) {
        setError(`Word limit reached. ${Math.max(0, remaining).toLocaleString()} words remaining of your daily ${usage.wordsLimit.toLocaleString()} words.`);
        return;
      }
    }
    setRephrasing(true); setError('');
    // Reset streaming state and start processing state.
    setStreamGlobalStage('Initializing…');
    setStreamProgress(0);
    setStreamProgressTarget(0);
    setStreamPhaseName('');
    setStreamPhaseIndex(0);
    setStreamTotalPhases(1);
    setStreamCycleCurrent(0);
    setStreamCycleTotal(0);
    setStreamCycleLabel('');
    setProcessingMessageIndex(0);
    resetStreamActivityClock();
    setIsAnimating(true);

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const finalData = await runStreamingHumanize(result, controller.signal);

      if (finalData) {
        let rephrased = normalizeOutputText(finalData.humanized as string);
        if (grammarCorrection) {
          const checker = new GrammarChecker();
          rephrased = checker.correctAll(rephrased);
        }
        setResult(rephrased);
        setRunSalt(prev => prev + 1);
        setMeaningScore(finalData.meaning_similarity as number);
        // Detection disabled — coming soon

        // Update usage: optimistic + server refresh (all non-admin users are metered)
        if (!isAdmin) {
          if (typeof finalData.usage_words_used === 'number') {
            const exactLimit = typeof finalData.usage_words_limit === 'number'
              ? finalData.usage_words_limit
              : undefined;
            setUsageTotals(finalData.usage_words_used, exactLimit);
          } else {
            addWords((finalData.input_word_count as number) || outputWords);
          }
          void refreshUsage();
        }

        setStreamProgressTarget(100);
        setStreamProgress(100);
        setIsAnimating(false);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Rephrase failed');
        setIsAnimating(false);
      }
    }
    finally { setRephrasing(false); }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePasteFromClipboard = useCallback(async () => {
    const applyPastedText = (candidate: string) => {
      const normalized = capitalizeSentenceStarts(normalizeTypedInput(candidate));
      if (!normalized.trim()) {
        setError('Clipboard is empty.');
        return false;
      }
      setText(normalized);
      setError('');
      return true;
    };

    try {
      if (navigator.clipboard?.readText) {
        const clipboardText = await navigator.clipboard.readText();
        if (applyPastedText(clipboardText)) return;
      }
    } catch {
      // Fall through to manual paste fallback.
    }

    const manualText = window.prompt('Clipboard read is blocked. Paste your text (Ctrl+V) and press OK:', '');
    if (manualText !== null && applyPastedText(manualText)) return;

    setError('Could not read clipboard automatically. Use Ctrl+V in the input box.');
  }, [normalizeTypedInput, capitalizeSentenceStarts]);

  const handleClear = () => {
    setText(''); setResult('');
    setInputDetection(null); setOutputDetection(null);
    setSentenceScores([]); setMeaningScore(null);
    setPreGeneratedAlts({});
    setIsAnimating(false);
    streamStageStartedAtRef.current = 0;
    streamLastActivityAtRef.current = 0;
    setStreamGlobalStage('Initializing…'); setStreamProgress(0); setStreamProgressTarget(0); setStreamPhaseName(''); setStreamPhaseIndex(0); setStreamTotalPhases(1); setStreamCycleCurrent(0); setStreamCycleTotal(0); setStreamCycleLabel(''); setProcessingMessageIndex(0);
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setError(''); closePopup();
  };

  const handleRehumanizeFlagged = async () => {
    if (!result) return;
    if (!isAdmin && usage) {
      const remaining = usage.wordsLimit - usage.wordsUsed;
      if (remaining <= 0) {
        setError(`Word limit reached. ${Math.max(0, remaining).toLocaleString()} words remaining of your daily ${usage.wordsLimit.toLocaleString()} words.`);
        return;
      }
    }
    setRehumanizing(true); setError('');
    const MAX_ITERATIONS = 5;
    let currentText = result;

    try {
      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        // Re-score sentences against current text
        const detectRes = await fetch('/api/detect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: currentText }) });
        const detectData = await detectRes.json();
        if (!detectRes.ok || detectData.error) break;

        const currentOverallAi = detectData.summary.overall_ai_score;
        setOutputDetection({ overallAi: currentOverallAi, overallHuman: detectData.summary.overall_human_score, detectors: detectData.detectors });

        // Score each sentence
        const currentSentences = splitSentences(currentText);
        const scored = currentSentences.map(s => ({ ...s, score: scoreSentence(s.text, currentOverallAi) }));

        // Find flagged sentences (score > 35)
        const flagged = scored.filter(s => s.score > 35);
        if (flagged.length === 0) {
          // All green — done
          setResult(currentText);
          break;
        }

        console.log(`[FixFlagged] Iteration ${iteration + 1}: ${flagged.length} flagged sentences, re-humanizing...`);

        // Aggressively re-humanize each flagged sentence with strong strength
        const fixes = await Promise.all(
          flagged.map(s =>
            fetch('/api/humanize', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: s.text.trim(),
                engine: engine === 'ghost_mini' ? 'ghost_pro' : engine,
                strength: 'strong',
                tone,
                strict_meaning: strictMeaning,
                enable_post_processing: true,
              }),
            }).then(r => r.json()).then((d: HumanizeResponse) => ({
              original: s.text,
              humanized: d.success && d.humanized ? d.humanized.trim() : s.text,
            })).catch(() => ({ original: s.text, humanized: s.text }))
          )
        );

        // Apply fixes to the text
        let updated = currentText;
        let anyChanged = false;
        for (const f of fixes) {
          if (f.humanized !== f.original && updated.includes(f.original)) {
            updated = updated.replace(f.original, f.humanized);
            anyChanged = true;
          }
        }

        if (!anyChanged) break; // Nothing changed, stop iterating
        currentText = updated;
        setResult(currentText);
      }

      // Final detection pass
      const finalRes = await fetch('/api/detect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: currentText }) });
      const finalData = await finalRes.json();
      if (finalRes.ok && !finalData.error) {
        setOutputDetection({ overallAi: finalData.summary.overall_ai_score, overallHuman: finalData.summary.overall_human_score, detectors: finalData.detectors });
      }

      // Apply grammar correction to final output
      if (grammarCorrection) {
        const checker = new GrammarChecker();
        currentText = checker.correctAll(currentText);
        setResult(currentText);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Rehumanize failed'); }
    finally { setRehumanizing(false); }
  };

  /* ── Popup helpers ──────────────────────────────────────────────────── */
  const closePopup = useCallback(() => {
    setPopupType(null); setSelectionInfo(null); setSynonyms([]); setSentenceAlternatives([]); setPendingAlternatives(false);
  }, []);

  const getContainingSentence = (t: string, cursor: number) => {
    const enders = /[.!?]/;
    let start = cursor;
    while (start > 0 && !enders.test(t[start - 1])) start--;
    while (start < cursor && /\s/.test(t[start])) start++;
    let end = cursor;
    while (end < t.length && !enders.test(t[end])) end++;
    if (end < t.length) end++;
    if (end <= start || (end - start) < 10) return null;
    return { start, end };
  };

  const selectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingAlternatives, setPendingAlternatives] = useState(false);

  const handleOutputSelect = useCallback(() => {
    if (selectionTimer.current) clearTimeout(selectionTimer.current);
    selectionTimer.current = setTimeout(() => {
      const el = outputRef.current;
      if (!el || !result) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      // Cursor placement only (no selection) → allow direct editing, close any popup
      if (start === end) {
        closePopup();
        setPendingAlternatives(false);
        return;
      }
      const sel = result.slice(start, end).trim();
      if (!sel || sel.length < 2) return;
      const rect = el.getBoundingClientRect();
      const la = result.slice(0, start).split('\n').length - 1;
      const isWord = !/\s/.test(sel) && !/[.!?]/.test(sel);
      setSelectionInfo({ text: sel, start, end, rect: { x: rect.left + rect.width / 2, y: rect.top + window.scrollY + Math.min(la * 22 + 40, rect.height - 40) }, type: isWord ? 'word' : 'sentence' });
      if (isWord) {
        // Single word → auto-fetch synonyms (fast, expected behavior)
        fetchSynonyms(sel);
      } else {
        // Sentence/paragraph selection → show "Get Alternatives" button, don't auto-fetch
        setPopupType('sentence');
        setSentenceAlternatives([]);
        setLoadingPopup(false);
        setPendingAlternatives(true);
      }
    }, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const handleRequestAlternatives = useCallback(() => {
    if (!selectionInfo) return;
    setPendingAlternatives(false);
    fetchSentenceAlternatives(selectionInfo.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionInfo]);

  const fetchSynonyms = async (word: string) => {
    setPopupType('synonym'); setLoadingPopup(true); setSynonyms([]);
    try {
      const r = await fetch('/api/synonyms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ word }) });
      if (r.ok) { const d = await r.json(); setSynonyms(d.synonyms || [{ word, isOriginal: true }]); }
      else setSynonyms([{ word, isOriginal: true }]);
    } catch { setSynonyms([{ word, isOriginal: true }]); }
    finally { setLoadingPopup(false); }
  };

  const fetchSentenceAlternatives = async (sentence: string, count = 8) => {
    setPopupType('sentence'); setLoadingPopup(true); setSentenceAlternatives([]);

    // Check pre-generated alternatives first (instant, no API call)
    const preGenKey = Object.keys(preGeneratedAlts).find(
      key => key.trim().toLowerCase() === sentence.trim().toLowerCase()
    );
    if (preGenKey && preGeneratedAlts[preGenKey]?.length > 0) {
      setSentenceAlternatives(preGeneratedAlts[preGenKey]);
      setLoadingPopup(false);
      return;
    }

    // Fallback to API call if no pre-generated alternatives
    try {
      const r = await fetch('/api/alternatives', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sentence, engine, count }) });
      if (r.ok) { const d = await r.json(); setSentenceAlternatives(d.alternatives || []); }
      else setSentenceAlternatives([{ text: sentence, score: 1.0 }]);
    } catch { setSentenceAlternatives([{ text: sentence, score: 1.0 }]); }
    finally { setLoadingPopup(false); }
  };

  const applyReplacement = useCallback((newText: string) => {
    if (!selectionInfo) return;
    setResult(result.slice(0, selectionInfo.start) + newText + result.slice(selectionInfo.end));
    closePopup();
    setTimeout(() => outputRef.current?.focus(), 50);
  }, [selectionInfo, result, closePopup]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (popupRef.current && !popupRef.current.contains(e.target as Node)) closePopup(); };
    if (popupType) { document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }
  }, [popupType, closePopup]);

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div className="stealth-shell relative flex flex-col gap-4 animate-in fade-in duration-500 w-full p-1 sm:p-2">

      {/* Auto Model Confirmation Popup */}
      {autoModelConfirmOpen && (
        <>
          <div className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm" onClick={cancelAutoModel} />
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#0c0c14] border border-slate-200 dark:border-red-900/50 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 fade-in duration-200">
              <div className="px-6 py-5 border-b border-slate-100 dark:border-red-900/30 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">Enable Auto Model?</h3>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">AI Analysis will auto-select the best offline engines for your text</p>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 space-y-3">
                <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                  Auto Model uses intelligent topic analysis to select API-free offline passes, runs Oxygen + AntiPangram + full Nuru 2.0, and loops until AI detection drops below 20%.
                </p>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Potential side effects</p>
                  <ul className="space-y-1">
                    <li className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-zinc-400">
                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                      <span><span className="font-semibold text-slate-700 dark:text-zinc-300">Over-processing risk:</span> Heavy multi-pass rewriting may alter meaning or tone beyond intent, especially on short texts (&lt;200 words).</span>
                    </li>
                    <li className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-zinc-400">
                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                      <span><span className="font-semibold text-slate-700 dark:text-zinc-300">Vocabulary shift:</span> Multiple engine passes can replace domain-specific terms with simpler synonyms.</span>
                    </li>
                    <li className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-zinc-400">
                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                      <span><span className="font-semibold text-slate-700 dark:text-zinc-300">Longer processing:</span> The rerun loop (up to 3 iterations) takes more time than single-engine runs.</span>
                    </li>
                    <li className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-zinc-400">
                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                      <span><span className="font-semibold text-slate-700 dark:text-zinc-300">Sentence uniformity:</span> Aggressive looping may produce text with unnaturally consistent sentence structures.</span>
                    </li>
                    <li className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-zinc-400">
                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                      <span><span className="font-semibold text-slate-700 dark:text-zinc-300">Word count fluctuation:</span> Output may be 10–25% shorter or longer than input due to multi-engine rewriting.</span>
                    </li>
                  </ul>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-zinc-500 italic">
                  The system is designed to avoid over-processing — it selects the minimum engines needed and stops the loop once the target score is reached.
                </p>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 dark:border-zinc-800/60 flex items-center justify-end gap-3">
                <button onClick={cancelAutoModel}
                  className="px-4 py-2 text-[11px] font-semibold text-slate-600 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/50 rounded-lg transition-colors">
                  Cancel
                </button>
                <button onClick={confirmAutoModel}
                  className="px-4 py-2 text-[11px] font-bold text-white bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 rounded-lg shadow-md hover:shadow-lg transition-all">
                  Enable Auto Model
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ Combined Control Card ═══ */}
      <div
        className={`stealth-control-card relative overflow-hidden bg-white dark:bg-[linear-gradient(145deg,rgba(8,11,16,.95),rgba(10,13,19,.92))] border rounded-2xl shadow-sm dark:shadow-[0_16px_40px_-22px_rgba(6,182,212,.45)] ${autoModelEnabled ? autoGlowClass + ' auto-glow-btn border-transparent' : 'border-slate-200 dark:border-cyan-900/40'} ${planColor && !autoModelEnabled ? 'plan-glow' : ''}`}
      >
        <div className="stealth-top-glow pointer-events-none absolute inset-0 opacity-0 dark:opacity-70" />
        {/* Row 1: Brand + Usage + Nav */}
        <div className="relative flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-cyan-900/30">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 min-w-0">
            <h1 className={`text-base sm:text-lg font-black tracking-tight whitespace-nowrap ${autoModelEnabled ? autoGlowClass + ' auto-glow-text' : 'text-cyan-600 dark:text-cyan-100'}`}>Humara Stealth</h1>
            <div className="w-px h-4 bg-slate-300 dark:bg-cyan-900/50 hidden sm:block" />
            <UsageBar />
            {isDailyLimitReached && (
              <span className="inline-flex items-center rounded-full border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300">
                Limit reached
              </span>
            )}
            {!isDailyLimitReached && hasUnlimitedDailyWords && (
              <span className="inline-flex items-center rounded-full border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Unlimited
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isAdmin && (
              <Link href="/app/admin"
                className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/60 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/30 transition-colors">
                <Shield className="w-3 h-3" /> Admin
              </Link>
            )}
            <Link href="/app/settings" className="p-1.5 text-slate-400 dark:text-zinc-500 hover:text-cyan-600 dark:hover:text-cyan-100 rounded-lg hover:bg-slate-100 dark:hover:bg-cyan-950/30 transition-colors">
              <Settings className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Row 2: Mode + Engine + Depth + Tone + Meaning + Humanize */}
        <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-5 py-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase text-slate-500 dark:text-zinc-500">Mode</span>
            <div className="flex bg-slate-100 dark:bg-zinc-950/60 rounded-md p-0.5 border border-slate-200 dark:border-cyan-900/40">
              {([
                { id: 'core_engines', label: 'Core' },
                { id: 'detection_control', label: 'Detection' },
                { id: 'advanced_engines', label: 'Advanced' },
              ] as { id: ModeId; label: string }[]).map((m) => (
                <button
                  key={m.id}
                  onClick={() => { if (!autoModelEnabled) setMode(m.id); }}
                  disabled={autoModelEnabled}
                  className={`px-2 py-1 text-[10px] font-semibold rounded transition-all ${
                    mode === m.id
                      ? (autoModelEnabled ? 'auto-glow-active-pill text-white' : 'bg-cyan-500 dark:bg-cyan-700/70 text-white')
                      : 'text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300'
                  } ${autoModelEnabled ? 'opacity-50 cursor-not-allowed' : ''} ${autoModelEnabled && mode === m.id ? autoGlowClass + ' auto-glow-btn' : ''}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="w-px h-4 bg-slate-200 dark:bg-cyan-950/70 hidden sm:block" />
          {/* Auto Model Toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <span className={`text-[10px] font-semibold uppercase ${autoModelEnabled ? autoGlowClass + ' auto-glow-text' : 'text-slate-500 dark:text-zinc-500'}`}>Auto</span>
            <button onClick={handleAutoModelToggle}
              className={`w-7 h-[16px] rounded-full transition-all relative ${autoModelEnabled ? autoGlowClass + ' auto-glow-btn' : 'bg-slate-300 dark:bg-zinc-700'}`}
              style={autoModelEnabled ? { backgroundColor: 'var(--auto-glow, #ef4444)' } : undefined}>
              <div className={`w-2.5 h-2.5 bg-white rounded-full absolute top-[3px] transition-all shadow-sm ${autoModelEnabled ? 'left-[13px]' : 'left-[3px]'}`} />
            </button>
          </label>
          <div className="w-px h-4 bg-slate-200 dark:bg-cyan-950/70 hidden sm:block" />
          <div className="flex items-center gap-1.5 relative">
            <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-500 uppercase">Engine</span>
            <div className="relative group">
              <button ref={engineBtnRef} type="button" onClick={() => { if (!autoModelEnabled) setEngineDropdownOpen(!engineDropdownOpen); }}
                disabled={autoModelEnabled}
                className={`flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-950/60 border border-slate-200 dark:border-cyan-900/40 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-zinc-300 outline-none hover:border-slate-300 dark:hover:border-cyan-700/60 transition-colors min-w-[118px] ${autoModelEnabled ? autoGlowClass + ' auto-glow-btn' : ''} ${autoModelEnabled ? 'cursor-not-allowed' : ''}`}>
                <span className={autoModelEnabled ? autoGlowClass + ' auto-glow-text' : ''}>{ENGINES.find(e => e.id === engine)?.label}</span>
                <svg className={`ml-auto w-3 h-3 text-slate-400 dark:text-zinc-500 transition-transform ${engineDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {ENGINE_GUIDES[engine] && !engineDropdownOpen && (
                <div className="absolute left-0 top-full mt-2 z-30 w-[260px] bg-white dark:bg-[#0c0c14] border border-slate-200 dark:border-cyan-800/60 rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
                  <p className="text-[10px] text-slate-600 dark:text-zinc-400 leading-relaxed"><span className="font-bold text-cyan-600 dark:text-cyan-400">{ENGINES.find(e => e.id === engine)?.label}:</span> {ENGINE_GUIDES[engine]}</p>
                </div>
              )}
              {engineDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-[9998]" onClick={() => setEngineDropdownOpen(false)} />
                  <div
                    className="fixed z-[9999] w-[200px] bg-white dark:bg-[#090d14] border border-slate-200 dark:border-cyan-900/50 rounded-xl shadow-2xl shadow-slate-200/50 dark:shadow-black/60 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
                    style={{
                      top: engineBtnRef.current ? engineBtnRef.current.getBoundingClientRect().bottom + 6 : 0,
                      left: engineBtnRef.current ? engineBtnRef.current.getBoundingClientRect().left : 0,
                    }}
                  >
                    {ENGINES.map(e => (
                      <button key={e.id} type="button" onClick={() => { setEngine(e.id); setEngineDropdownOpen(false); }}
                        className={`w-full text-left px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-cyan-950/30 transition-colors border-b border-slate-100 dark:border-zinc-800/40 last:border-b-0 flex items-center gap-2 ${engine === e.id ? 'bg-slate-50 dark:bg-cyan-950/40' : ''}`}>
                        <span className="text-sm font-medium text-slate-700 dark:text-zinc-200">{e.label}</span>
                        {engine === e.id && <svg className="ml-auto w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="w-px h-4 bg-slate-200 dark:bg-cyan-950/70 hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-semibold uppercase ${autoModelEnabled ? autoGlowClass + ' auto-glow-text' : 'text-slate-500 dark:text-zinc-500'}`}>Depth</span>
            <div className={`flex rounded-md p-0.5 border ${autoModelEnabled ? autoGlowClass + ' auto-glow-btn border-transparent' : 'bg-slate-100 dark:bg-zinc-950/60 border-slate-200 dark:border-cyan-900/40'}`}>
              {STRENGTHS.map(s => (
                <button key={s.id} onClick={() => setStrength(s.id)}
                  className={`px-2 py-1 text-[10px] font-semibold rounded transition-all ${
                    strength === s.id
                      ? (autoModelEnabled ? 'auto-glow-active-pill text-white' : 'bg-cyan-500 dark:bg-cyan-700/70 text-white')
                      : 'text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="w-px h-4 bg-slate-200 dark:bg-cyan-950/70 hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-semibold uppercase ${autoModelEnabled ? autoGlowClass + ' auto-glow-text' : 'text-slate-500 dark:text-zinc-500'}`}>Tone</span>
            <select value={tone} onChange={(e) => setTone(e.target.value)} title="Tone"
              className="bg-slate-100 dark:bg-zinc-950/60 border border-slate-200 dark:border-cyan-900/40 rounded-md px-2 py-1 text-[10px] font-semibold text-slate-700 dark:text-zinc-300 outline-none focus:border-cyan-500">
              {TONES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="w-px h-4 bg-slate-200 dark:bg-cyan-950/70 hidden sm:block" />
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <span className={`text-[10px] font-semibold uppercase ${autoModelEnabled ? autoGlowClass + ' auto-glow-text' : 'text-slate-500 dark:text-zinc-500'}`}>Meaning</span>
            <button onClick={() => setStrictMeaning(!strictMeaning)} title={strictMeaning ? 'On' : 'Off'}
              className={`w-7 h-[16px] rounded-full transition-all relative ${
                strictMeaning
                  ? (autoModelEnabled ? 'auto-glow-toggle' : 'bg-cyan-500 dark:bg-cyan-600')
                  : 'bg-slate-300 dark:bg-zinc-700'
              }`}>
              <div className={`w-2.5 h-2.5 bg-white rounded-full absolute top-[3px] transition-all shadow-sm ${strictMeaning ? 'left-[13px]' : 'left-[3px]'}`} />
            </button>
          </label>
          <div className="w-px h-4 bg-slate-200 dark:bg-cyan-950/70 hidden sm:block" />
          <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Auto-correct grammar, punctuation & capitalization in the output">
            <SpellCheck className={`w-3 h-3 ${grammarCorrection ? 'text-emerald-500' : autoModelEnabled ? '' : 'text-slate-400 dark:text-zinc-500'}`} />
            <span className={`text-[10px] font-semibold uppercase ${autoModelEnabled ? autoGlowClass + ' auto-glow-text' : 'text-slate-500 dark:text-zinc-500'}`}>Grammar</span>
            <button onClick={() => setGrammarCorrection(!grammarCorrection)}
              className={`w-7 h-[16px] rounded-full transition-all relative ${grammarCorrection ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-slate-300 dark:bg-zinc-700'}`}>
              <div className={`w-2.5 h-2.5 bg-white rounded-full absolute top-[3px] transition-all shadow-sm ${grammarCorrection ? 'left-[13px]' : 'left-[3px]'}`} />
            </button>
          </label>
          <div className="w-px h-4 bg-slate-200 dark:bg-cyan-950/70 hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-semibold uppercase ${autoModelEnabled ? autoGlowClass + ' auto-glow-text' : 'text-slate-500 dark:text-zinc-500'}`}>Rate</span>
            <input type="range" min={1} max={10} value={humanizationRate} onChange={(e) => setHumanizationRate(Number(e.target.value))}
              className={`w-16 h-1.5 cursor-pointer ${autoModelEnabled ? 'auto-glow-accent' : 'accent-cyan-500'}`} title={`Humanization rate: ${humanizationRate} (${humanizationRate * 10}% min change)`} />
            <span className={`text-[10px] font-bold min-w-[14px] text-center ${autoModelEnabled ? autoGlowClass + ' auto-glow-text' : 'text-cyan-600 dark:text-cyan-400'}`}>{humanizationRate}</span>
          </div>
          <button onClick={handleHumanize} disabled={!text.trim() || loading || rephrasing || isDailyLimitReached}
            className={`w-full sm:w-auto sm:ml-auto text-white text-[11px] font-bold rounded-lg px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5 shadow-md ${
              autoModelEnabled ? autoGlowClass + ' auto-glow-btn auto-glow-bg' :
              isDailyLimitReached
                ? 'bg-gradient-to-r from-red-600 to-red-500 dark:from-red-700 dark:to-red-600'
                : 'bg-gradient-to-r from-cyan-600 to-teal-500 dark:from-cyan-700 dark:to-teal-600 hover:from-cyan-500 hover:to-teal-400 dark:hover:from-cyan-600 dark:hover:to-teal-500 hover:shadow-lg'
            }`}
            style={autoModelEnabled ? { backgroundColor: 'var(--auto-glow, #06b6d4)' } : undefined}>
            {loading ? <RotateCcw className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
            {loading ? 'Humanizing…' : isDailyLimitReached ? 'Limit Reached' : 'Humanize'}
          </button>
        </div>

        {/* Row 3: Engine-specific settings + active config badges */}
        <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 sm:px-5 py-2 border-t border-slate-100 dark:border-cyan-900/20">
          {/* Active config badges (left side) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[9px] px-2 py-0.5 rounded-full border ${autoModelEnabled ? autoGlowClass + ' auto-glow-text auto-glow-btn border-transparent' : 'bg-cyan-50 dark:bg-cyan-950/50 border-cyan-200 dark:border-cyan-900/60 text-cyan-700 dark:text-cyan-200'}`}>{autoModelEnabled ? 'Auto Model' : MODE_LABELS[mode]}</span>
            <span className={`text-[9px] px-2 py-0.5 rounded-full border ${autoModelEnabled ? autoGlowClass + ' auto-glow-text auto-glow-btn border-transparent' : 'bg-slate-100 dark:bg-zinc-900/70 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'}`}>{ENGINES.find(e => e.id === engine)?.label}</span>
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300">{TONES.find(t => t.id === tone)?.label}</span>
            {grammarCorrection && (
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-200">Grammar ✓</span>
            )}
            {strength === 'strong' && (
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-200 flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5" /> Strong
              </span>
            )}
          </div>

          {/* Engine-specific controls (right side) */}
          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {engine === 'easy' && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <span className="text-[9px] font-semibold text-slate-500 dark:text-zinc-500">SBS</span>
                <button onClick={() => setEasySentenceBySentence(!easySentenceBySentence)}
                  className={`relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors ${
                    easySentenceBySentence
                      ? (autoModelEnabled ? 'auto-glow-toggle' : 'bg-cyan-500 dark:bg-cyan-600')
                      : 'bg-slate-300 dark:bg-zinc-700'
                  }`}>
                  <span className={`inline-block h-2 w-2 transform rounded-full bg-white transition-transform ${easySentenceBySentence ? 'translate-x-3' : 'translate-x-0.5'}`} />
                </button>
              </label>
            )}
            {engine === 'oxygen' && (
              <>
                <div className="flex items-center gap-1">
                  <span className={`text-[9px] font-bold uppercase ${autoModelEnabled ? autoGlowClass + ' auto-glow-text' : 'text-cyan-600 dark:text-cyan-400'}`}>Pipe</span>
                  <div className="flex gap-0.5">
                    {(['quality', 'fast', 'aggressive'] as const).map(m => (
                      <button key={m} onClick={() => setOxygenMode(m)}
                        className={`px-1.5 py-0.5 rounded text-[8px] font-semibold transition-all ${
                          oxygenMode === m
                            ? (autoModelEnabled ? 'auto-glow-active-pill text-white' : 'bg-cyan-600 text-white')
                            : 'bg-slate-100 dark:bg-zinc-800/60 text-slate-500 dark:text-zinc-500'
                        }`}>{m[0].toUpperCase() + m.slice(1)}</button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-1 cursor-pointer">
                  <span className="text-[9px] text-slate-500 dark:text-zinc-500">Sent</span>
                  <button onClick={() => setOxygenSentenceBySentence(!oxygenSentenceBySentence)}
                    className={`relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors ${oxygenSentenceBySentence ? 'bg-cyan-600' : 'bg-slate-300 dark:bg-zinc-700'}`}>
                    <span className={`inline-block h-2 w-2 transform rounded-full bg-white transition-transform ${oxygenSentenceBySentence ? 'translate-x-3' : 'translate-x-0.5'}`} />
                  </button>
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-[8px] text-cyan-600 dark:text-cyan-400">{(oxygenMinChangeRatio * 100).toFixed(0)}%</span>
                  <input type="range" min="0.2" max="0.8" step="0.05" value={oxygenMinChangeRatio}
                    onChange={(e) => setOxygenMinChangeRatio(parseFloat(e.target.value))}
                    title="Threshold" aria-label="Oxygen threshold"
                    className="w-12 h-1 bg-cyan-200 dark:bg-cyan-900/50 rounded appearance-none cursor-pointer accent-cyan-600" />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[8px] text-cyan-600 dark:text-cyan-400">×{oxygenMaxRetries}</span>
                  <input type="range" min="1" max="15" step="1" value={oxygenMaxRetries}
                    onChange={(e) => setOxygenMaxRetries(parseInt(e.target.value))}
                    title="Retries" aria-label="Oxygen retries"
                    className="w-12 h-1 bg-cyan-200 dark:bg-cyan-900/50 rounded appearance-none cursor-pointer accent-cyan-600" />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Word Count Warnings */}
      {inputWords > MAX_WORDS_PER_REQUEST && (
        <div className="flex items-center gap-1.5 px-1">
          <AlertTriangle className="w-2.5 h-2.5 text-red-500 shrink-0" />
          <p className="text-[9px] text-red-400"><span className="font-bold">Too many words:</span> Maximum {MAX_WORDS_PER_REQUEST.toLocaleString()} words per request. You have {inputWords.toLocaleString()}.</p>
        </div>
      )}
      {inputWords > 0 && inputWords <= MAX_WORDS_PER_REQUEST && (inputWords < RECOMMENDED_MIN_WORDS || inputWords > RECOMMENDED_MAX_WORDS) && (
        <div className="flex items-center gap-1.5 px-1">
          <span className="text-blue-400 text-[9px]">💡</span>
          <p className="text-[9px] text-blue-400">Best results with {RECOMMENDED_MIN_WORDS}–{RECOMMENDED_MAX_WORDS.toLocaleString()} words. You have {inputWords.toLocaleString()}.</p>
        </div>
      )}

      {/* Editor Stack */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* Input Panel */}
        <div className="stealth-editor-panel bg-[linear-gradient(145deg,rgba(255,255,255,.95),rgba(255,255,255,.94))] dark:bg-[linear-gradient(145deg,rgba(9,14,22,.95),rgba(9,12,19,.94))] border border-slate-200 dark:border-cyan-900/30 rounded-2xl overflow-hidden flex flex-col hover:border-slate-300 dark:hover:border-cyan-800/40 transition-all shadow-sm dark:shadow-[0_20px_40px_-28px_rgba(8,145,178,.5)]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-cyan-900/25 gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-cyan-500 dark:bg-cyan-400" />
              <span className="text-sm font-semibold text-slate-800 dark:text-zinc-100 tracking-tight">Input</span>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-[11px] text-slate-500 dark:text-zinc-500 tabular-nums font-medium">{inputWords} words</span>
              <button onClick={handleClear} className="text-xs font-medium text-slate-500 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-red-950/30 transition-all flex items-center gap-1">
                <Eraser className="w-3 h-3" /> Clear
              </button>
            </div>
          </div>

          {/* Input MetricsStrip */}
          {text.trim() && (
            <div className="border-b border-slate-100 dark:border-cyan-900/25">
              <MetricsStrip text={text} label="Input" />
            </div>
          )}

          {/* Input textarea */}
          <div className="flex-1 relative">
            <textarea ref={inputRef} value={text}
              onChange={(e) => setText(normalizeTypedInput(e.target.value))}
              onPaste={(e) => {
                e.preventDefault();
                const pasted = e.clipboardData.getData('text/plain');
                const ta = e.currentTarget;
                const before = text.slice(0, ta.selectionStart);
                const after = text.slice(ta.selectionEnd);
                const full = before + pasted + after;
                setText(capitalizeSentenceStarts(normalizeTypedInput(full)));
              }}
              className={`editor-highlight-input relative z-10 w-full ${EDITOR_HEIGHT_CLASS} outline-none resize-y overflow-y-auto text-[14px] leading-[1.8] text-slate-800 dark:text-zinc-200 p-5 placeholder:text-slate-400 dark:placeholder:text-zinc-500`}
              placeholder="Paste text you want to humanize..." />
            {!text && (
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="pointer-events-auto flex items-center gap-2 px-5 py-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/35 border border-cyan-200 dark:border-cyan-900/50 text-cyan-700 dark:text-cyan-200 hover:bg-cyan-100 dark:hover:bg-cyan-900/35 hover:border-cyan-300 dark:hover:border-cyan-700/60 transition-all text-sm font-medium cursor-pointer"
                >
                  <ClipboardPaste className="w-4 h-4" />
                  Paste from clipboard
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Output Panel */}
        <div className={`stealth-editor-panel bg-[linear-gradient(145deg,rgba(255,255,255,.95),rgba(255,255,255,.94))] dark:bg-[linear-gradient(145deg,rgba(9,14,22,.95),rgba(9,12,19,.94))] border rounded-2xl overflow-hidden flex flex-col relative transition-all shadow-sm dark:shadow-[0_20px_40px_-28px_rgba(8,145,178,.5)] ${result && !loading && !rephrasing ? 'border-emerald-200 dark:border-emerald-500/25 hover:border-emerald-300 dark:hover:border-emerald-500/40' : 'border-slate-200 dark:border-cyan-900/30 hover:border-slate-300 dark:hover:border-cyan-800/40'}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b gap-3 ${result && !loading && !rephrasing ? 'border-emerald-100 dark:border-emerald-900/30' : 'border-slate-100 dark:border-cyan-900/25'}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-2 h-2 rounded-full ${result && !loading ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-slate-300 dark:bg-zinc-600'}`} />
              <span className="text-sm font-semibold text-slate-800 dark:text-zinc-100 tracking-tight">Output</span>
              {result && !loading && !rephrasing && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300/80 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full whitespace-nowrap overflow-hidden text-ellipsis max-w-[230px] hidden sm:inline-block">
                    Editable: click to edit, select text for alternatives
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap shrink-0 whitespace-nowrap">
              <span className="text-[11px] text-slate-500 dark:text-zinc-500 tabular-nums font-medium hidden sm:inline">{outputWords} words</span>
              {result && !isAnimating && (
                <>
                  {/* View Switcher */}
                  <div className="flex items-center rounded-lg bg-slate-100 dark:bg-zinc-800/60 p-0.5 gap-0.5">
                    {(['result', 'diff', 'confidence'] as const).map(v => (
                      <button key={v} onClick={() => setOutputView(v)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold capitalize transition-all ${outputView === v
                          ? 'bg-white dark:bg-zinc-700 text-slate-800 dark:text-zinc-100 shadow-sm'
                          : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300'}`}>
                        {v === 'result' ? <><Text className="w-3 h-3 inline mr-0.5" />Result</> : v === 'diff' ? <><GitCompare className="w-3 h-3 inline mr-0.5" />Diff</> : <><ShieldCheck className="w-3 h-3 inline mr-0.5" />Risk</>}
                      </button>
                    ))}
                  </div>
                  <button onClick={handleRehumanizeFlagged} disabled={rehumanizing || loading || isDailyLimitReached}
                    className="text-[11px] font-semibold text-amber-600 dark:text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 px-1.5 sm:px-2 py-1 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-all flex items-center gap-1 disabled:opacity-50"
                    title={isDailyLimitReached ? 'Daily limit reached' : 'Fix flagged AI sentences'}>
                    <AlertTriangle className="w-3 h-3" />
                    {rehumanizing ? 'Fixing…' : 'Fix AI'}
                  </button>
                  <button onClick={handleRephrase} disabled={rephrasing || loading || isRephraseLimitReached}
                    className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 px-1.5 sm:px-2 py-1 rounded-lg hover:bg-cyan-50 dark:hover:bg-cyan-950/30 transition-all flex items-center gap-1 disabled:opacity-50"
                    title={isRephraseLimitReached ? 'Not enough remaining daily words' : 'Rehumanize output'}>
                    <RotateCcw className="w-3 h-3" />
                    {rephrasing ? 'Rehumanizing…' : 'Rehumanize'}
                  </button>
                  <button onClick={handleCopy} className="p-1.5 text-slate-500 dark:text-brand-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-brand-950 rounded-md transition-colors" title="Copy">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <ExportMenu text={result} />
                </>
              )}
            </div>
          </div>

          {isAnimating ? (
            <div className={`relative ${EDITOR_HEIGHT_CLASS} overflow-hidden`}>
              <CosmicLoader
                stage={visibleProcessingStage}
                message={processingMessage}
                progress={streamProgress}
                engineLabel={activeEngineLabel}
                statusItems={processingStatusItems}
                engineId={engine}
                phaseIndex={streamPhaseIndex}
                totalPhases={streamTotalPhases}
              />
            </div>
          ) : result ? (
            <div className={`relative flex-1 ${EDITOR_HEIGHT_CLASS} overflow-hidden`}>
              {/* MetricsStrip for output */}
              <div className="relative z-10 border-b border-emerald-100 dark:border-emerald-900/30">
                <MetricsStrip text={result} label="Output" />
              </div>
              {outputView === 'result' && (
                <textarea ref={outputRef} value={result}
                  onChange={(e) => { setResult(e.target.value); }} onSelect={handleOutputSelect}
                  className="editor-highlight-output relative z-10 flex-1 w-full h-[calc(100%-2.5rem)] outline-none resize-y overflow-y-auto text-[14px] leading-[1.8] text-slate-800 dark:text-zinc-200 p-5 cursor-text"
                  style={{ fontFamily: 'inherit' }}
                  placeholder="Output appears here…" />
              )}
              {outputView === 'diff' && (
                <div className="relative z-10 h-[calc(100%-2.5rem)] overflow-y-auto p-5">
                  <DiffView original={text} humanized={result} />
                </div>
              )}
              {outputView === 'confidence' && (
                <div className="relative z-10 h-[calc(100%-2.5rem)] overflow-y-auto p-5">
                  <SentenceMeter text={result} salt={runSalt} key={`sm-${runSalt}`} />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[260px] text-slate-400 dark:text-zinc-700 gap-4 px-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-cyan-100 dark:bg-cyan-950/35 flex items-center justify-center border border-cyan-200 dark:border-cyan-900/40">
                <Zap className="w-5 h-5 text-cyan-500 dark:text-cyan-400" />
              </div>
              <div className="space-y-1">
                <span className="text-sm font-medium text-slate-700 dark:text-zinc-300 block">Stealth humanized text appears here</span>
                <span className="text-[11px] text-slate-500 dark:text-zinc-500 max-w-xs leading-relaxed block">Paste text, pick style, then click Humanize</span>
              </div>
            </div>
          )}

          {/* Synonym Popup */}
          {popupType === 'synonym' && selectionInfo && (
            <div ref={popupRef} className="stealth-popup fixed z-50 bg-white dark:bg-[#0c0c14] border border-slate-200 dark:border-zinc-800/60 rounded-xl shadow-xl py-1.5 w-[200px]"
              style={{ left: `${Math.min(selectionInfo.rect.x, window.innerWidth - 220)}px`, top: `${selectionInfo.rect.y}px`, transform: 'translateX(-50%)' }}>
              <div className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-zinc-400 border-b border-slate-100 dark:border-zinc-800/60 flex items-center gap-1.5">
                <Type className="w-3 h-3" /> Synonyms for &ldquo;{selectionInfo.text}&rdquo;
              </div>
              <div className="max-h-56 overflow-y-auto">
                {loadingPopup ? (
                  <div className="px-3 py-4 text-xs text-slate-400 dark:text-zinc-500 text-center flex items-center justify-center gap-1.5">
                    <RotateCcw className="w-3 h-3" /> Finding…
                  </div>
                ) : synonyms.length > 0 ? (
                  synonyms.map((syn, idx) => (
                    <button key={idx} onClick={() => applyReplacement(syn.word)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between ${
                        syn.isOriginal ? 'text-red-600 dark:text-red-400 font-medium bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50' : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/50'
                      }`}>
                      <span>{syn.word}</span>
                      {syn.isOriginal && <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full font-medium">original</span>}
                    </button>
                  ))
                ) : <div className="px-3 py-3 text-xs text-slate-500 dark:text-zinc-500 text-center">No synonyms found</div>}
              </div>
            </div>
          )}

          {/* Sentence Alternatives Popup */}
          {popupType === 'sentence' && selectionInfo && (
            <div ref={popupRef} className="stealth-popup fixed z-50 bg-white dark:bg-[#0c0c14] border border-slate-200 dark:border-zinc-800/60 rounded-xl shadow-xl py-1.5 w-[480px] max-w-[90vw]"
              style={{ left: `${Math.min(selectionInfo.rect.x, window.innerWidth - 500)}px`, top: `${selectionInfo.rect.y}px`, transform: 'translateX(-50%)' }}>
              <div className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-zinc-400 border-b border-slate-100 dark:border-zinc-800/60 flex items-center gap-1.5">
                <AlignLeft className="w-3 h-3" /> Selected text
              </div>
              {pendingAlternatives ? (
                <div className="px-3 py-3 flex flex-col items-center gap-2">
                  <p className="text-xs text-slate-500 dark:text-zinc-400 text-center leading-relaxed max-w-xs">
                    Select text and click below to generate alternative phrasings
                  </p>
                  <button
                    onClick={handleRequestAlternatives}
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm hover:shadow-md active:scale-[0.98] flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3" /> Get Alternatives
                  </button>
                </div>
              ) : (
              <div className="max-h-[350px] overflow-y-auto">
                {loadingPopup ? (
                  <div className="px-3 py-5 text-xs text-slate-500 dark:text-zinc-500 text-center flex flex-col items-center gap-2">
                    <RotateCcw className="w-4 h-4" /> Generating…
                  </div>
                ) : sentenceAlternatives.length > 0 ? (
                  sentenceAlternatives.map((alt, idx) => (
                    <button key={idx} onClick={() => applyReplacement(alt.text)}
                      className="w-full text-left px-3 py-2.5 text-sm border-b border-slate-100 dark:border-zinc-800/40 last:border-0 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-colors">
                      <div className="flex items-start gap-2.5">
                        <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/30 px-1.5 py-0.5 rounded mt-0.5 shrink-0">{idx + 1}</span>
                        <span className="flex-1 text-slate-800 dark:text-zinc-200 leading-relaxed">{alt.text}</span>
                        <span className="text-xs text-slate-500 dark:text-zinc-500 font-medium whitespace-nowrap mt-0.5">{Math.round(alt.score * 100)}%</span>
                      </div>
                    </button>
                  ))
                ) : <div className="px-3 py-4 text-xs text-slate-500 dark:text-zinc-500 text-center">No alternatives available</div>}
              </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-lg text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-red-500 rounded-full" /> {error}
        </div>
      )}

      {/* Temporary History (auto-expires after 4 min) */}
      {history.length > 0 && (
        <div className="stealth-history bg-white dark:bg-[#0c0c14] border border-slate-200 dark:border-zinc-800/60 rounded-xl overflow-hidden">
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-500" />
              <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">Recent ({history.length})</span>
              <span className="text-[10px] text-slate-500 dark:text-zinc-500">auto-clears in a few minutes</span>
            </div>
            {historyOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />}
          </button>
          {historyOpen && (
            <div className="border-t border-slate-100 dark:border-zinc-800/60 divide-y divide-slate-100 dark:divide-zinc-800/40 max-h-[300px] overflow-y-auto">
              {history.map(h => {
                const ago = Math.round((Date.now() - h.timestamp) / 1000);
                const agoStr = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
                const remaining = Math.max(0, Math.round((HISTORY_TTL_MS - (Date.now() - h.timestamp)) / 1000));
                const remainStr = remaining < 60 ? `${remaining}s left` : `${Math.round(remaining / 60)}m left`;
                return (
                  <button
                    key={h.id}
                    onClick={() => { setText(normalizeTypedInput(h.fullInput)); setResult(normalizeOutputText(h.fullOutput)); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800/30 transition-colors group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">{h.engine}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 dark:text-zinc-500">{agoStr}</span>
                        <span className="text-[10px] text-amber-600 dark:text-amber-500 font-medium">{remainStr}</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-zinc-400 truncate">{h.inputSnippet}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-slate-500 dark:text-zinc-500">{h.wordCount} words</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
