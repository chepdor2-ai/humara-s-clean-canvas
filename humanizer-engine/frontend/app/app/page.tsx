'use client';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Copy, Check, Zap, Eraser, RotateCcw, Type, AlignLeft, RefreshCw, AlertTriangle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import UsageBar, { useUsage } from './UsageBar';
import { supabase } from '../../lib/supabase';

const ProcessingAnimation = dynamic(() => import('../ProcessingAnimation'), { ssr: false });
const LiveTextTransition = dynamic(() => import('./LiveTextTransition'), { ssr: false });

/* ── Types ──────────────────────────────────────────────────────────────── */
interface DetectorScore { detector: string; ai_score: number; human_score: number; }
interface DetectionResult { overallAi: number; overallHuman: number; detectors: DetectorScore[]; }
interface HumanizeResponse {
  success: boolean; humanized: string; word_count: number; input_word_count: number;
  engine_used: string; meaning_preserved: boolean; meaning_similarity: number;
  input_detector_results: { overall: number; detectors: DetectorScore[] };
  output_detector_results: { overall: number; detectors: DetectorScore[] };
  sentence_alternatives?: Record<string, { text: string; score: number }[]>;
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

const HISTORY_TTL_MS = 4 * 60 * 1000; // 4 minutes

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
  { id: 'easy', label: 'Easy', premium: false },
  { id: 'oxygen', label: 'Oxygen', premium: false },
  { id: 'omega', label: 'Omega', premium: false },
  { id: 'nuru', label: 'Nuru', premium: false },
  { id: 'humara_v1_3', label: 'Humara v1.3', premium: false },
  { id: 'ghost_mini', label: 'Ghost Mini', premium: false },
  { id: 'ghost_mini_v1_2', label: 'Ghost Mini v1.2', premium: false },
  { id: 'ghost_pro', label: 'Ghost Pro', premium: false },
  { id: 'ninja', label: 'Ninja', premium: false },
  { id: 'undetectable', label: 'Undetectable', premium: false },
  { id: 'fast_v11', label: 'V1.1', premium: true },
  { id: 'humara', label: 'Humara', premium: true },
];

interface EngineConfig {
  id: string;
  label: string;
  premium: boolean;
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
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [rephrasing, setRephrasing] = useState(false);

  const [engine, setEngine] = useState('humara_v1_3');
  const [engineDropdownOpen, setEngineDropdownOpen] = useState(false);
  const [strength, setStrength] = useState('medium');
  const [tone, setTone] = useState('academic');
  const [strictMeaning, setStrictMeaning] = useState(true);
  const [premium, setPremium] = useState(false);

  // Admin-controlled engine visibility
  const [engineConfig, setEngineConfig] = useState<Record<string, { enabled: boolean; premium: boolean; sort_order: number }>>({});
  const [engineConfigLoaded, setEngineConfigLoaded] = useState(false);

  // Fetch engine config from Supabase on mount
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('engine_config').select('engine_id, enabled, premium, sort_order');
        if (data && data.length > 0) {
          const config: Record<string, { enabled: boolean; premium: boolean; sort_order: number }> = {};
          for (const row of data) {
            config[row.engine_id] = { enabled: row.enabled, premium: row.premium, sort_order: row.sort_order ?? 0 };
          }
          setEngineConfig(config);
        }
      } catch {
        // Fallback to defaults if table doesn't exist yet
      }
      setEngineConfigLoaded(true);
    })();
  }, []);

  // Compute visible engines: if admin config exists, use it; otherwise fall back to ALL_ENGINES defaults
  const ENGINES: EngineConfig[] = useMemo(() => {
    if (!engineConfigLoaded) return ALL_ENGINES;
    const hasConfig = Object.keys(engineConfig).length > 0;
    if (!hasConfig) return ALL_ENGINES;
    return ALL_ENGINES
      .filter(e => engineConfig[e.id]?.enabled !== false)
      .map(e => ({
        ...e,
        premium: engineConfig[e.id]?.premium ?? e.premium,
      }))
      .sort((a, b) => (engineConfig[a.id]?.sort_order ?? 99) - (engineConfig[b.id]?.sort_order ?? 99));
  }, [engineConfig, engineConfigLoaded]);

  const [inputDetection, setInputDetection] = useState<DetectionResult | null>(null);
  const [outputDetection, setOutputDetection] = useState<DetectionResult | null>(null);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [_sentenceScores, setSentenceScores] = useState<ScoredSentence[]>([]);
  const [_meaningScore, setMeaningScore] = useState<number | null>(null);

  const { usage } = useUsage();
  const PLAN_COLORS: Record<string, string> = { Starter: '#64748b', Creator: '#6366f1', Professional: '#10b981', Business: '#f59e0b' };
  const planColor = usage ? PLAN_COLORS[usage.planName] || '' : '';

  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const [synonyms, setSynonyms] = useState<SynonymOption[]>([]);
  const [sentenceAlternatives, setSentenceAlternatives] = useState<SentenceAlternative[]>([]);
  const [popupType, setPopupType] = useState<'synonym' | 'sentence' | null>(null);
  const [loadingPopup, setLoadingPopup] = useState(false);
  const [rehumanizing, setRehumanizing] = useState(false);
  const [iterationCount, setIterationCount] = useState(0);
  const [preGeneratedAlts, setPreGeneratedAlts] = useState<Record<string, SentenceAlternative[]>>({});

  // Live streaming text transition animation
  const [isAnimating, setIsAnimating] = useState(false);
  const [streamSentences, setStreamSentences] = useState<{ text: string; stage: string }[]>([]);
  const [streamParagraphBoundaries, setStreamParagraphBoundaries] = useState<number[]>([]);
  const [streamGlobalStage, setStreamGlobalStage] = useState('Initializing…');
  const [streamDone, setStreamDone] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Temporary history (auto-expires)
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

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

  const inputWords = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);
  const outputWords = useMemo(() => (result.trim() ? result.trim().split(/\s+/).length : 0), [result]);

  // Handle premium toggle - switch to non-premium engine if current is premium
  useEffect(() => {
    const currentEngine = ENGINES.find(e => e.id === engine);
    if (!premium && currentEngine?.premium) {
      // Switch to first non-premium engine
      const fallbackEngine = ENGINES.find(e => !e.premium);
      if (fallbackEngine) setEngine(fallbackEngine.id);
    }
  }, [premium, engine]);

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

  // Auto-expire history entries after TTL
  useEffect(() => {
    if (history.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setHistory(prev => prev.filter(h => now - h.timestamp < HISTORY_TTL_MS));
    }, 15000); // check every 15s
    return () => clearInterval(interval);
  }, [history.length]);

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

  /* ── Auto-detect input (debounced 1.5s) ─────────────────────────────── */
  useEffect(() => {
    if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
    if (!text.trim() || inputWords < 10) {
      setInputDetection(null);
      setSentenceScores([]);
      return;
    }
    const controller = new AbortController();
    detectTimerRef.current = setTimeout(async () => {
      setAutoDetecting(true);
      try {
        const res = await fetch('/api/detect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (res.ok && !data.error) {
          const det: DetectionResult = {
            overallAi: data.summary.overall_ai_score,
            overallHuman: data.summary.overall_human_score,
            detectors: data.detectors,
          };
          setInputDetection(det);
          const sentences = splitSentences(text);
          setSentenceScores(sentences.map(s => ({ ...s, score: scoreSentence(s.text, det.overallAi) })));
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      } finally {
        setAutoDetecting(false);
      }
    }, 1500);
    return () => { if (detectTimerRef.current) clearTimeout(detectTimerRef.current); controller.abort(); };
  }, [text, inputWords]);

  /* ── Handlers ───────────────────────────────────────────────────────── */
  const handleTransitionComplete = useCallback(() => {
    setIsAnimating(false);
    setStreamSentences([]);
    setStreamParagraphBoundaries([]);
    setStreamDone(false);
    setStreamGlobalStage('Initializing…');
  }, []);

  /** Shared SSE streaming handler used by humanize & rephrase */
  const runStreamingHumanize = async (inputText: string, signal: AbortSignal) => {
    const requestBody: Record<string, unknown> = {
      text: inputText,
      engine,
      strength,
      tone,
      strict_meaning: strictMeaning,
      enable_post_processing: true,
      premium,
    };

    // Add Oxygen v2 controls if Oxygen engine is selected
    if (engine === 'oxygen') {
      requestBody.oxygen_mode = oxygenMode;
      requestBody.oxygen_sentence_by_sentence = oxygenSentenceBySentence;
      requestBody.oxygen_min_change_ratio = oxygenMinChangeRatio;
      requestBody.oxygen_max_retries = oxygenMaxRetries;
    }

    const res = await fetch('/api/humanize-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!res.ok || !res.body) throw new Error('Streaming request failed');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalData: Record<string, unknown> | null = null;

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

        if (event.type === 'error') throw new Error(event.error as string);

        if (event.type === 'init') {
          const sents = (event.sentences as string[]).map(t => ({ text: t, stage: 'original' }));
          setStreamSentences(sents);
          setStreamParagraphBoundaries(event.paragraphBoundaries as number[]);
        } else if (event.type === 'stage') {
          setStreamGlobalStage(event.stage as string);
        } else if (event.type === 'sentence') {
          const idx = event.index as number;
          const txt = event.text as string;
          const stg = event.stage as string;
          setStreamSentences(prev => {
            const next = [...prev];
            if (idx < next.length) {
              next[idx] = { text: txt, stage: stg };
            }
            return next;
          });
        } else if (event.type === 'done') {
          finalData = event as Record<string, unknown>;
          // Mark all sentences as done
          setStreamSentences(prev => prev.map(s => ({ ...s, stage: 'done' })));
          setStreamGlobalStage('Complete');
          setStreamDone(true);
        }
      }
    }

    return finalData;
  };

  const handleHumanize = async () => {
    if (!text.trim()) return;
    if (inputWords < 10) { setError('Please enter at least 10 words.'); return; }
    setLoading(true); setError(''); setResult(''); setOutputDetection(null); setMeaningScore(null); setIterationCount(0); setPreGeneratedAlts({});
    // Reset streaming state and start animation
    setStreamSentences([]);
    setStreamParagraphBoundaries([]);
    setStreamGlobalStage('Initializing…');
    setStreamDone(false);
    setIsAnimating(true);

    // Abort any previous stream
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const finalData = await runStreamingHumanize(text, controller.signal);

      if (finalData) {
        const currentResult = finalData.humanized as string;
        setResult(currentResult);
        setMeaningScore(finalData.meaning_similarity as number);

        if (finalData.input_detector_results) {
          const d = finalData.input_detector_results as { overall: number; detectors: DetectorScore[] };
          setInputDetection({ overallAi: d.overall, overallHuman: 100 - d.overall, detectors: d.detectors });
          const sentences = splitSentences(text);
          setSentenceScores(sentences.map(s => ({ ...s, score: scoreSentence(s.text, d.overall) })));
        }
        if (finalData.output_detector_results) {
          const d = finalData.output_detector_results as { overall: number; detectors: DetectorScore[] };
          setOutputDetection({ overallAi: d.overall, overallHuman: 100 - d.overall, detectors: d.detectors });
        }

        // Add to temporary history
        const finalAi = finalData.output_detector_results ? (finalData.output_detector_results as { overall: number }).overall : 0;
        const inputAi = finalData.input_detector_results ? (finalData.input_detector_results as { overall: number }).overall : 0;
        addToHistory(text, currentResult, (finalData.engine_used as string) || engine, inputAi, finalAi, (finalData.word_count as number) || outputWords);
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
    setRephrasing(true); setError('');
    // Reset streaming state and start animation
    setStreamSentences([]);
    setStreamParagraphBoundaries([]);
    setStreamGlobalStage('Initializing…');
    setStreamDone(false);
    setIsAnimating(true);

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const finalData = await runStreamingHumanize(result, controller.signal);

      if (finalData) {
        setResult(finalData.humanized as string);
        setMeaningScore(finalData.meaning_similarity as number);
        if (finalData.output_detector_results) {
          const d = finalData.output_detector_results as { overall: number; detectors: DetectorScore[] };
          setOutputDetection({ overallAi: d.overall, overallHuman: 100 - d.overall, detectors: d.detectors });
        }
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

  const handleClear = () => {
    setText(''); setResult('');
    setInputDetection(null); setOutputDetection(null);
    setSentenceScores([]); setMeaningScore(null);
    setPreGeneratedAlts({});
    setIsAnimating(false);
    setStreamSentences([]); setStreamParagraphBoundaries([]); setStreamDone(false); setStreamGlobalStage('Initializing…');
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setError(''); closePopup();
  };

  const handleRehumanizeFlagged = async () => {
    if (!result) return;
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
                premium,
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
    <div className="flex flex-col gap-5 animate-in fade-in duration-500 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">AI Humanizer</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">Transform AI text into undetectable human writing</p>
        </div>

      </header>

      {/* Daily Usage */}
      <UsageBar />

      {/* Settings Bar */}
      <div
        className={`flex flex-wrap items-center gap-x-5 gap-y-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl px-5 py-3 shadow-sm ${planColor ? 'plan-glow' : ''}`}
        style={planColor ? { '--plan-color': planColor } as React.CSSProperties : undefined}
      >
        <div className="flex items-center gap-2 relative">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Engine</span>
          <div className="relative group">
            <button
              type="button"
              onClick={() => setEngineDropdownOpen(!engineDropdownOpen)}
              className="flex items-center gap-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300 outline-none focus:border-brand-400 hover:border-brand-300 transition-colors min-w-[140px]"
            >
              <span>{ENGINES.find(e => e.id === engine)?.label}</span>
              {ENGINES.find(e => e.id === engine)?.premium && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">PRO</span>}
              <svg className={`ml-auto w-3.5 h-3.5 text-slate-400 transition-transform ${engineDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {engineDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setEngineDropdownOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 w-[200px] bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150 max-h-[320px] overflow-y-auto">
                  {ENGINES.filter(e => premium || !e.premium).map(e => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => { setEngine(e.id); setEngineDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-zinc-700/50 transition-colors border-b border-slate-100 dark:border-zinc-700/50 last:border-b-0 flex items-center gap-2 ${engine === e.id ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}
                    >
                      <span className="text-sm font-medium text-slate-800 dark:text-zinc-200">{e.label}</span>
                      {e.premium && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">PRO</span>}
                      {engine === e.id && <svg className="ml-auto w-4 h-4 text-brand-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 hidden sm:block" />
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Depth</span>
          <div className="flex bg-slate-100 dark:bg-zinc-800 rounded-lg p-0.5">
            {STRENGTHS.map(s => (
              <button key={s.id} onClick={() => setStrength(s.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${strength === s.id ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="w-px h-5 bg-slate-200 dark:bg-zinc-700 hidden sm:block" />
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Tone</span>
          <select value={tone} onChange={(e) => setTone(e.target.value)} title="Tone"
            className="bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300 outline-none focus:border-brand-400">
            {TONES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="w-px h-5 bg-slate-200 dark:bg-zinc-700 hidden sm:block" />
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Keep Meaning</span>
          <button onClick={() => setStrictMeaning(!strictMeaning)} title={strictMeaning ? 'On' : 'Off'}
            className={`w-8 h-[18px] rounded-full transition-all relative ${strictMeaning ? 'bg-brand-600' : 'bg-slate-200 dark:bg-zinc-600'}`}>
            <div className={`w-3 h-3 bg-white rounded-full absolute top-[3px] transition-all shadow-sm ${strictMeaning ? 'left-[15px]' : 'left-[3px]'}`} />
          </button>
        </label>
        <div className="w-px h-5 bg-slate-200 dark:bg-zinc-700 hidden sm:block" />
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-[11px] font-semibold text-amber-500 dark:text-amber-400 uppercase tracking-wider">Premium</span>
          <button onClick={() => setPremium(!premium)} title={premium ? 'Premium Engines Enabled' : 'Standard Engines Only'}
            className={`w-8 h-[18px] rounded-full transition-all relative ${premium ? 'bg-amber-500' : 'bg-slate-200 dark:bg-zinc-600'}`}>
            <div className={`w-3 h-3 bg-white rounded-full absolute top-[3px] transition-all shadow-sm ${premium ? 'left-[15px]' : 'left-[3px]'}`} />
          </button>
        </label>
        <div className="w-px h-5 bg-slate-200 dark:bg-zinc-700 hidden sm:block" />
        <button onClick={handleHumanize} disabled={!text.trim() || loading || rephrasing}
          className="ml-auto bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white text-xs font-bold rounded-xl px-6 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-md hover:shadow-lg active:scale-[0.97]">
          {loading ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          {loading ? 'Humanizing…' : 'Humanize'}
        </button>
      </div>

      {/* Depth Note */}
      {strength === 'strong' && (
        <div className="flex items-start gap-1.5 px-3 py-2 bg-amber-50/60 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900 rounded-lg max-w-md">
          <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
            <span className="font-bold">Strong depth</span> focuses on beating AI detectors rather than preserving meaning. For best meaning retention, use Light or Medium.
          </p>
        </div>
      )}

      {/* Oxygen Advanced Controls */}
      {engine === 'oxygen' && (
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border border-purple-200 dark:border-purple-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setOxygenAdvancedOpen(!oxygenAdvancedOpen)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/50 dark:hover:bg-black/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-purple-700 dark:text-purple-300">⚙️ Oxygen Pipeline Controls</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-200 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">Multi-phase AI kill</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-purple-500 transition-transform ${oxygenAdvancedOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {oxygenAdvancedOpen && (
            <div className="px-4 pb-4 space-y-4 border-t border-purple-200 dark:border-purple-800 pt-4">
              {/* Pipeline Mode */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-purple-900 dark:text-purple-200">
                  Pipeline Mode
                </label>
                <div className="flex gap-2">
                  {[
                    { id: 'quality', label: 'Quality', desc: 'Beam=4, 5 retries' },
                    { id: 'fast', label: 'Fast', desc: 'Greedy, 2 retries' },
                    { id: 'aggressive', label: 'Aggressive', desc: 'Beam=6, 8 retries' },
                  ].map(mode => (
                    <button
                      key={mode.id}
                      onClick={() => setOxygenMode(mode.id as typeof oxygenMode)}
                      className={`flex-1 px-3 py-2 rounded-lg border transition-all text-xs ${
                        oxygenMode === mode.id
                          ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                          : 'bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:border-purple-300'
                      }`}
                    >
                      <div className="font-bold">{mode.label}</div>
                      <div className="text-[10px] opacity-80">{mode.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sentence-by-Sentence Toggle */}
              <div className="space-y-1">
                <label className="flex items-center justify-between text-xs font-semibold text-purple-900 dark:text-purple-200">
                  <span>Sentence-by-Sentence Processing</span>
                  <button
                    onClick={() => setOxygenSentenceBySentence(!oxygenSentenceBySentence)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      oxygenSentenceBySentence 
                        ? 'bg-purple-600 dark:bg-purple-500' 
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        oxygenSentenceBySentence ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>
                <p className="text-[10px] text-purple-600 dark:text-purple-400">
                  Each sentence processed independently with retry loop until change threshold met
                </p>
              </div>

              {/* Min Change Ratio */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-purple-900 dark:text-purple-200">
                  Minimum Change Threshold: {(oxygenMinChangeRatio * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min="0.2"
                  max="0.8"
                  step="0.05"
                  value={oxygenMinChangeRatio}
                  onChange={(e) => setOxygenMinChangeRatio(parseFloat(e.target.value))}
                  className="w-full h-2 bg-purple-200 dark:bg-purple-900/50 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <p className="text-[10px] text-purple-600 dark:text-purple-400">
                  At least {(oxygenMinChangeRatio * 100).toFixed(0)}% of words must change per sentence
                </p>
              </div>

              {/* Max Retries */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-purple-900 dark:text-purple-200">
                  Max Retries per Sentence: {oxygenMaxRetries}
                </label>
                <input
                  type="range"
                  min="1"
                  max="15"
                  step="1"
                  value={oxygenMaxRetries}
                  onChange={(e) => setOxygenMaxRetries(parseInt(e.target.value))}
                  className="w-full h-2 bg-purple-200 dark:bg-purple-900/50 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <p className="text-[10px] text-purple-600 dark:text-purple-400">
                  Retry T5 generation until {(oxygenMinChangeRatio * 100).toFixed(0)}% change is achieved (max {oxygenMaxRetries} attempts)
                </p>
              </div>

              {/* Pipeline Info */}
              <div className="bg-purple-100/50 dark:bg-purple-900/20 rounded-lg p-3 text-[10px] text-purple-700 dark:text-purple-300 space-y-1">
                <p className="font-bold">Pipeline Phases:</p>
                <p>1. T5 beam-search paraphrase (per sentence)</p>
                <p>2. AI word kill (60+ markers) + filler removal</p>
                <p>3. Structural variance (clause fronting, splitting)</p>
                <p>4. Quality gate (retry loop for min change)</p>
                <p>5. TypeScript post-processing (10-phase signal attack)</p>
                <p>6. Grammar sanitizer + contraction expansion</p>
              </div>

              {/* Reset Button */}
              <button
                onClick={() => {
                  setOxygenMode('quality');
                  setOxygenSentenceBySentence(false);
                  setOxygenMinChangeRatio(0.40);
                  setOxygenMaxRetries(5);
                }}
                className="w-full py-2 text-xs font-semibold text-purple-600 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
              >
                ↻ Reset to Defaults
              </button>
            </div>
          )}
        </div>
      )}

      {/* Editor Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Input Panel */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-zinc-800 bg-gradient-to-r from-slate-50 to-white dark:from-zinc-800/80 dark:to-zinc-900">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-blue-400 dark:bg-blue-500 animate-pulse" style={{ animationDuration: '3s' }} />
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Input</span>
              {inputDetection && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${inputAvgAi > 50 ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'}`}>
                  {Math.round(inputAvgAi)}% AI
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] text-slate-400 dark:text-zinc-500 tabular-nums font-medium">{inputWords} words</span>
              <button onClick={handleClear} className="text-xs font-medium text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-all flex items-center gap-1">
                <Eraser className="w-3 h-3" /> Clear
              </button>
            </div>
          </div>

          {/* Input textarea */}
          <div className="flex-1">
            <textarea ref={inputRef} value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full min-h-[420px] bg-transparent outline-none resize-none text-[14px] leading-[1.8] text-slate-800 dark:text-slate-200 p-5 placeholder:text-slate-300 dark:placeholder:text-zinc-600"
              placeholder="Paste your AI-generated text here…" />
          </div>

        </div>

        {/* Output Panel */}
        <div className={`bg-white dark:bg-zinc-900 border rounded-2xl overflow-hidden flex flex-col relative shadow-sm hover:shadow-md transition-shadow ${result && !loading && !rephrasing ? 'border-emerald-200 dark:border-emerald-800/50' : 'border-slate-200 dark:border-zinc-700'}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b ${result && !loading && !rephrasing ? 'border-emerald-100 dark:border-emerald-900/30 bg-gradient-to-r from-emerald-50/80 to-white dark:from-emerald-950/20 dark:to-zinc-900' : 'border-slate-100 dark:border-zinc-800 bg-gradient-to-r from-slate-50 to-white dark:from-zinc-800/80 dark:to-zinc-900'}`}>
            <div className="flex items-center gap-2.5">
              <div className={`w-2 h-2 rounded-full ${result && !loading ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-slate-300 dark:bg-zinc-600'}`} />
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Output</span>
              {result && !loading && !rephrasing && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium text-emerald-600/80 dark:text-emerald-400/70 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
                    Editable — click to edit, select text for alternatives
                  </span>
                </div>
              )}
              {outputDetection && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${outputAvgAi <= 20 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'}`}>
                  {Math.round(outputAvgAi)}% AI
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 dark:text-zinc-500 tabular-nums font-medium">{outputWords} words</span>
              {result && !isAnimating && (
                <>
                  <button onClick={handleRehumanizeFlagged} disabled={rehumanizing || loading}
                    className="text-[11px] font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400 px-2 py-1 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-all flex items-center gap-1 disabled:opacity-50"
                    title="Fix flagged AI sentences">
                    <AlertTriangle className={`w-3 h-3 ${rehumanizing ? 'animate-pulse' : ''}`} />
                    {rehumanizing ? 'Fixing…' : 'Fix AI'}
                  </button>
                  <button onClick={handleRephrase} disabled={rephrasing || loading}
                    className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 px-2 py-1 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-all flex items-center gap-1 disabled:opacity-50"
                    title="Rephrase output">
                    <RefreshCw className={`w-3 h-3 ${rephrasing ? 'animate-spin' : ''}`} />
                    {rephrasing ? 'Rephrasing…' : 'Rephrase'}
                  </button>
                  <button onClick={handleCopy} className="p-1.5 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950 rounded-md transition-colors" title="Copy">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </>
              )}
            </div>
          </div>

          {isAnimating ? (
            <LiveTextTransition
              sentences={streamSentences}
              paragraphBoundaries={streamParagraphBoundaries}
              globalStage={streamGlobalStage}
              isDone={streamDone}
              onComplete={handleTransitionComplete}
            />
          ) : result ? (
            <div className="relative flex-1">
              <div className="absolute inset-0 bg-emerald-50/30 dark:bg-emerald-950/10 pointer-events-none rounded-b-2xl" />
              <textarea ref={outputRef} value={result}
                onChange={(e) => setResult(e.target.value)} onSelect={handleOutputSelect}
                className="relative z-10 flex-1 w-full min-h-[420px] bg-transparent outline-none resize-none text-[14px] leading-[1.8] text-slate-800 dark:text-slate-200 p-5 cursor-text"
                style={{ fontFamily: 'inherit' }}
                placeholder="Output appears here…" />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[420px] text-slate-200 dark:text-slate-700 gap-4 px-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-100 to-brand-50 dark:from-brand-900/30 dark:to-brand-950/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-brand-400 dark:text-brand-500" />
              </div>
              <div className="space-y-1">
                <span className="text-sm font-medium text-slate-400 dark:text-slate-500 block">Humanized text will appear here</span>
                <span className="text-[11px] text-slate-300 dark:text-slate-600 max-w-xs leading-relaxed block">Paste text on the left and click Humanize to transform it</span>
              </div>
            </div>
          )}

          {/* Synonym Popup */}
          {popupType === 'synonym' && selectionInfo && (
            <div ref={popupRef} className="fixed z-50 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-xl py-1.5 w-[200px]"
              style={{ left: `${Math.min(selectionInfo.rect.x, window.innerWidth - 220)}px`, top: `${selectionInfo.rect.y}px`, transform: 'translateX(-50%)' }}>
              <div className="px-3 py-1.5 text-xs font-medium text-slate-400 dark:text-zinc-400 border-b border-slate-100 dark:border-zinc-700 flex items-center gap-1.5">
                <Type className="w-3 h-3" /> Synonyms for &ldquo;{selectionInfo.text}&rdquo;
              </div>
              <div className="max-h-56 overflow-y-auto">
                {loadingPopup ? (
                  <div className="px-3 py-4 text-xs text-slate-400 text-center flex items-center justify-center gap-1.5">
                    <RotateCcw className="w-3 h-3 animate-spin" /> Finding…
                  </div>
                ) : synonyms.length > 0 ? (
                  synonyms.map((syn, idx) => (
                    <button key={idx} onClick={() => applyReplacement(syn.word)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between ${
                        syn.isOriginal ? 'text-red-500 font-medium bg-red-50 hover:bg-red-100' : 'text-slate-700 hover:bg-brand-50'
                      }`}>
                      <span>{syn.word}</span>
                      {syn.isOriginal && <span className="text-[10px] bg-red-100 text-red-400 px-1.5 py-0.5 rounded-full font-medium">original</span>}
                    </button>
                  ))
                ) : <div className="px-3 py-3 text-xs text-slate-400 text-center">No synonyms found</div>}
              </div>
            </div>
          )}

          {/* Sentence Alternatives Popup */}
          {popupType === 'sentence' && selectionInfo && (
            <div ref={popupRef} className="fixed z-50 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-xl py-1.5 w-[480px] max-w-[90vw]"
              style={{ left: `${Math.min(selectionInfo.rect.x, window.innerWidth - 500)}px`, top: `${selectionInfo.rect.y}px`, transform: 'translateX(-50%)' }}>
              <div className="px-3 py-1.5 text-xs font-medium text-slate-400 dark:text-zinc-400 border-b border-slate-100 dark:border-zinc-700 flex items-center gap-1.5">
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
                  <div className="px-3 py-5 text-xs text-slate-400 dark:text-zinc-500 text-center flex flex-col items-center gap-2">
                    <RotateCcw className="w-4 h-4 animate-spin" /> Generating…
                  </div>
                ) : sentenceAlternatives.length > 0 ? (
                  sentenceAlternatives.map((alt, idx) => (
                    <button key={idx} onClick={() => applyReplacement(alt.text)}
                      className="w-full text-left px-3 py-2.5 text-sm border-b border-slate-50 dark:border-zinc-700/50 last:border-0 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors">
                      <div className="flex items-start gap-2.5">
                        <span className="text-xs font-semibold text-brand-600 bg-brand-50 dark:bg-brand-900/30 px-1.5 py-0.5 rounded mt-0.5 shrink-0">{idx + 1}</span>
                        <span className="flex-1 text-slate-700 dark:text-zinc-200 leading-relaxed">{alt.text}</span>
                        <span className="text-xs text-slate-400 dark:text-zinc-500 font-medium whitespace-nowrap mt-0.5">{Math.round(alt.score * 100)}%</span>
                      </div>
                    </button>
                  ))
                ) : <div className="px-3 py-4 text-xs text-slate-400 dark:text-zinc-500 text-center">No alternatives available</div>}
              </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-red-500 rounded-full" /> {error}
        </div>
      )}

      {/* Temporary History (auto-expires after 4 min) */}
      {history.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl overflow-hidden">
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">Recent ({history.length})</span>
              <span className="text-[10px] text-slate-400 dark:text-zinc-500">auto-clears in a few minutes</span>
            </div>
            {historyOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>
          {historyOpen && (
            <div className="border-t border-slate-100 dark:border-zinc-800 divide-y divide-slate-50 dark:divide-zinc-800 max-h-[300px] overflow-y-auto">
              {history.map(h => {
                const ago = Math.round((Date.now() - h.timestamp) / 1000);
                const agoStr = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
                const remaining = Math.max(0, Math.round((HISTORY_TTL_MS - (Date.now() - h.timestamp)) / 1000));
                const remainStr = remaining < 60 ? `${remaining}s left` : `${Math.round(remaining / 60)}m left`;
                return (
                  <button
                    key={h.id}
                    onClick={() => { setText(h.fullInput); setResult(h.fullOutput); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h.engine}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">{agoStr}</span>
                        <span className="text-[10px] text-amber-500 font-medium">{remainStr}</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-zinc-400 truncate">{h.inputSnippet}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`text-[10px] font-bold ${h.aiScoreBefore > 50 ? 'text-red-500' : 'text-amber-500'}`}>
                        {Math.round(h.aiScoreBefore)}% AI
                      </span>
                      <span className="text-[10px] text-slate-300 dark:text-zinc-600">→</span>
                      <span className={`text-[10px] font-bold ${h.aiScoreAfter <= 20 ? 'text-emerald-600' : 'text-amber-500'}`}>
                        {Math.round(h.aiScoreAfter)}% AI
                      </span>
                      <span className="text-[10px] text-slate-400">{h.wordCount} words</span>
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
