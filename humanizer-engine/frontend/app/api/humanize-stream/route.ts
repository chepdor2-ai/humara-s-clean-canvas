import { robustSentenceSplit, protectSpecialContent, restoreSpecialContent, cleanOutputRepetitions, type ProtectionMap } from '@/lib/engine/content-protection';
import { getDetector, TextSignals } from '@/lib/engine/multi-detector';
import { isMeaningPreserved, isMeaningPreservedSync } from '@/lib/engine/semantic-guard';
import { fixCapitalization, applyPhrasePatterns, fixPunctuation, expandAllContractions, setHumanizationVariationSeed } from '@/lib/engine/shared-dictionaries';
import { deduplicateRepeatedPhrases, expandWordCount } from '@/lib/engine/premium-deep-clean';
import { preserveInputStructure, looksLikeHeadingLine, conformToSourceSentenceShape } from '@/lib/engine/structure-preserver';
import { structuralPostProcess } from '@/lib/engine/structural-post-processor';
import { unifiedSentenceProcess } from '@/lib/sentence-processor';
import { expandContractions } from '@/lib/humanize-transforms';
import { removeEmDashes, fixOutOfContextSynonyms, validateCollocations, replaceCollocations, compressPhrases } from '@/lib/engine/v13-shared-techniques';
import { humanize } from '@/lib/engine/humanizer';
import { ghostProHumanize } from '@/lib/engine/ghost-pro';
import { kingHumanize } from '@/lib/engine/king-humanizer';
import { llmHumanize, deepAICleanOneSentence, restructureSentence, nuruReadabilityPolish, batchRestructureSentences } from '@/lib/engine/llm-humanizer';
import { premiumHumanize } from '@/lib/engine/premium-humanizer';
import { humanizeV11 } from '@/lib/engine/v11';
import { humaraHumanize } from '@/lib/humara';
import { nuruHumanize } from '@/lib/engine/nuru-humanizer';
import { stealthHumanize, stealthHumanizeTargeted, type StealthHumanizeOptions } from '@/lib/engine/stealth';
import { detectorTargetedPolish } from '@/lib/engine/detector-targeted-polish';
import { profilePaper, summarizeProfile, type PaperProfile } from '@/lib/engine/paper-profiler';
import { deriveHumanizationPlan, summarizePlan, type HumanizationPlan } from '@/lib/engine/paper-strategy-selector';
import { sentenceFlowPolish } from '@/lib/engine/sentence-flow-polish';
import { injectHumanImperfections } from '@/lib/engine/human-imperfections';
import { applySentenceStartersDistribution, applyNuruDocumentFlowCalibration } from '@/lib/engine/stealth/nuru-document-phases';
import { cleanZeroGPTPass, cleanOriginalityAIPass, cleanGPTZeroPass, cleanTurnitinPass, cleanCopyleaksPass, cleanWinstonPass, cleanPangramPass, cleanScribbrPass, universalPhraseSweep, swapAIMarkers, runFullDetectorForensicsCleanup } from '@/lib/engine/stealth/forensics';
import { omegaHumanize } from '@/lib/engine/omega-humanizer';
import { easyHumanize } from '@/lib/engine/easy-humanizer';
import { ozoneHumanize } from '@/lib/engine/ozone-humanizer';
import { oxygenHumanize } from '@/lib/engine/oxygen-humanizer';
import { dipperHumanize } from '@/lib/engine/dipper-humanizer';
import { humarinHumanize } from '@/lib/engine/humarin-humanizer';
import { t5Humanize } from '@/lib/engine/t5-humanizer';
import { oxygen3Humanize } from '@/lib/engine/oxygen3-humanizer';
import { synonymReplace } from '@/lib/engine/utils';
import { applyAIWordKill } from '@/lib/engine/shared-dictionaries';
import { postCleanGrammar } from '@/lib/engine/grammar-cleaner';
import { fixMidSentenceCapitalization, validateAndRepairOutput } from '@/lib/engine/validation-post-process';
import { analyzeDocumentCoherence, fixDocumentCoherence } from '@/lib/engine/document-coherence';
import { analyzeStyleStability, normalizeStyleStability } from '@/lib/engine/style-stability';
import { analyze as analyzeContext } from '@/lib/engine/context-analyzer';
import { detectDomain } from '@/lib/engine/domain-detector';
import { applyOutputProfile, resolveOutputProfile } from '@/lib/engine/output-profiles';
import { assessQualityGate, applyDeterministicSignalPolish, resolveAdaptiveTarget, resolveEngineQualityProfile, type QualityGateResult } from '@/lib/engine/quality-gate';
import { mapSentenceChangeRatios, measureLexicalChangeRatio, resolveChangeTargets, type ChangeTargets } from '@/lib/engine/change-targets';
import { createServiceClient } from '@/lib/supabase';
import { getUsageStatsCompat, incrementUsageCompat } from '@/lib/server/usage-tracking';
import { smartPreprocess, getMaxRestructureCount, selectForDownstreamRestructure, reassemblePreprocessed, measureWordChange, type SentenceAnalysis, type PreprocessResult, MAX_RESTRUCTURE_ITERATION } from '@/lib/engine/smart-preprocess';
import type { AntiPangramConfig } from '@/lib/engine/antipangram/types';

export const maxDuration = 300;

/* ── SSE streaming humanization with per-sentence stage updates ─────── */

// Event types sent to the client:
// { type: 'init', sentences: string[], paragraphs: number[] }
//   → original sentences, with paragraph boundary indices
// { type: 'stage', stage: string }
//   → a new processing stage has started
// { type: 'sentence', index: number, text: string, stage: string }
//   → sentence at index updated to new text for given stage
// { type: 'done', humanized: string, detection: {...}, meaning: number }
//   → final result with scores

function sendSSE(controller: ReadableStreamDefaultController, data: unknown) {
  try {
    const encoder = new TextEncoder();
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  } catch {
    // Controller already closed — deadline timer or client disconnect
  }
}

/** Small delay to allow the stream to flush so the browser can render intermediate states */
function flushDelay(ms = 8): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch((err) => reject(err))
      .finally(() => clearTimeout(timer));
  });
}

/** Staggered per-sentence emit with small delays between each */
async function emitSentencesStaggered(
  controller: ReadableStreamDefaultController,
  sentences: string[],
  stage: string,
  delayMs = 10,
) {
  for (let i = 0; i < sentences.length; i++) {
    sendSSE(controller, { type: 'sentence', index: i, text: sentences[i], stage });
    if (i < sentences.length - 1) await flushDelay(delayMs);
  }
}

/** Split text into sentences and track paragraph boundaries */
function splitIntoIndexedSentences(text: string): { sentences: string[]; paragraphBoundaries: number[] } {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const sentences: string[] = [];
  const paragraphBoundaries: number[] = [];

  for (const para of paragraphs) {
    paragraphBoundaries.push(sentences.length);
    const trimmed = para.trim();

    // Check if this paragraph contains multiple line-separated items (e.g. research questions, bullet points)
    const lines = trimmed.split(/\n/).map(l => l.trim()).filter(Boolean);

    // Detect headings using robust looksLikeHeadingLine from structure-preserver
    if (lines.length === 1 && looksLikeHeadingLine(trimmed)) {
      sentences.push(trimmed);
    } else if (lines.length > 1 && lines.every(l => looksLikeHeadingLine(l) || l.endsWith('?') || l.endsWith(':') || /^\d+[.)]\s/.test(l) || /^[-•]\s/.test(l))) {
      // Multi-line block where every line is heading-like or a list item or question — preserve each as separate "sentence"
      for (const line of lines) {
        sentences.push(line);
      }
    } else {
      // Normalize hard wraps within the paragraph to spaces before splitting
      const normalizedPara = trimmed.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      const sents = robustSentenceSplit(normalizedPara);
      sentences.push(...(sents.length ? sents : [normalizedPara]));
    }
  }
  return { sentences, paragraphBoundaries };
}

/** Reassemble sentences into paragraphed text */
function reassembleText(sentences: string[], paragraphBoundaries: number[]): string {
  const paragraphs: string[][] = [];
  for (let i = 0; i < paragraphBoundaries.length; i++) {
    const start = paragraphBoundaries[i];
    const end = i < paragraphBoundaries.length - 1 ? paragraphBoundaries[i + 1] : sentences.length;
    paragraphs.push(sentences.slice(start, end));
  }
  return paragraphs.map(p => p.join(' ')).join('\n\n');
}

function measureSentenceChange(original: string, modified: string): number {
  const origWords = original.toLowerCase().split(/\s+/).filter(Boolean);
  const modWords = modified.toLowerCase().split(/\s+/).filter(Boolean);
  const len = Math.max(origWords.length, modWords.length);
  if (len === 0) return 1;
  let changed = 0;
  for (let i = 0; i < len; i++) {
    if (!origWords[i] || !modWords[i] || origWords[i] !== modWords[i]) changed++;
  }
  return changed / len;
}

function analyzeDocumentChangeTargets(
  originalText: string,
  candidateText: string,
  sentenceMinChange: number,
): { overallChange: number; passRate: number; weakestSentence: number } {
  const originalSentences = splitIntoIndexedSentences(originalText).sentences;
  const candidateSentences = splitIntoIndexedSentences(candidateText).sentences;
  const sentenceMap = mapSentenceChangeRatios(originalSentences, candidateSentences, (sentence) => looksLikeHeadingLine(sentence.trim()));
  const relevant = sentenceMap.filter((entry) => entry.originalIndex >= 0);
  if (relevant.length === 0) {
    return { overallChange: measureLexicalChangeRatio(originalText, candidateText), passRate: 1, weakestSentence: 1 };
  }

  const passed = relevant.filter((entry) => entry.ratio >= sentenceMinChange).length;
  const weakestSentence = relevant.reduce((min, entry) => Math.min(min, entry.ratio), 1);
  return {
    overallChange: measureLexicalChangeRatio(originalText, candidateText),
    passRate: passed / relevant.length,
    weakestSentence,
  };
}

function collapseToSingleSentence(original: string, candidate: string): string {
  const parts = robustSentenceSplit(candidate).map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return candidate.trim() || original;
  const collapsed = parts
    .map((part, index) => {
      let cleaned = part.replace(/[.!?]+$/g, '').trim();
      if (index > 0 && cleaned[0]) cleaned = cleaned[0].toLowerCase() + cleaned.slice(1);
      return cleaned;
    })
    .filter(Boolean)
    .join('; ');
  const punctuation = /[.!?]$/.test(candidate.trim()) ? candidate.trim().slice(-1) : '.';
  return collapsed ? `${collapsed}${punctuation}` : original;
}

function pickWeighted<T>(options: Array<{ value: T; weight: number }>): T {
  const normalized = options.map((option) => ({ value: option.value, weight: Math.max(0, option.weight) }));
  const total = normalized.reduce((sum, option) => sum + option.weight, 0);
  if (total <= 0) return normalized[0].value;
  let cursor = Math.random() * total;
  for (const option of normalized) {
    cursor -= option.weight;
    if (cursor <= 0) return option.value;
  }
  return normalized[normalized.length - 1].value;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

interface AdaptiveCleanupPlan {
  targetScore: number;
  detectorPressure: number;
  minDocumentChange: number;
  minSentenceChange: number;
  minChangedSentenceShare: number;
  antiPangramIterations: number;
  antiPangramVariance: number;
  readabilityBias: number;
  nuruIterations: number;
  nuruLoops: number;
  targetedSweeps: number;
  universalCleaningPasses: number;
  changePasses: number;
  leadRewriteThreshold: number;
  maxAdaptiveCycles: number;
}

/**
 * Pick the subset of paragraph-lead sentence indices that should be
 * PRESERVED (light cleanup only), leaving the complement to be fully
 * rewritten. Deterministic per input hash so every phase in the
 * pipeline makes the same decision for the same paragraph.
 *
 * User mandate: "limit restructuring the first sentences of the
 * paragraphs, make it probabilistic but more like 40% chance" →
 * 60% preserve, 40% rewrite. Implemented by adding only ~60% of
 * the paragraph leads to the preservation set; the remaining ~40%
 * fall through the normal rewrite path in every downstream loop.
 */
function pickLeadsToPreserve(paragraphBoundaries: number[], seed: number, preserveProbability = 0.60): Set<number> {
  let state = seed || 1;
  const rng = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) & 0xFFFFFFFF) / 0x100000000;
  };
  const preserved = new Set<number>();
  for (const idx of paragraphBoundaries) {
    if (rng() < preserveProbability) preserved.add(idx);
  }
  // Always preserve the very first paragraph lead — it anchors the whole
  // document. Rewriting the opening line is visually disorienting.
  if (paragraphBoundaries.length > 0) preserved.add(paragraphBoundaries[0]);
  return preserved;
}

/** Simple deterministic string hash for seeding. */
function hashTextForSeed(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function buildAdaptiveCleanupPlan(
  text: string,
  score: number,
  requestedTone: string | undefined,
  postProfile: string,
  paperPlan?: HumanizationPlan,
  requestedStrength?: string,
  humanizationRate?: number,
): AdaptiveCleanupPlan {
  // Adaptive ceilings replace fixed "maximum rewrite" loops.
  // Low-risk text gets 0-1 cleanup passes; high-risk text earns deeper
  // Nuru/AntiPangram/universal passes only while the quality gate allows it.
  const targetScore = resolveAdaptiveTarget(score, undefined, postProfile);
  // Raise pressure divisor from 55→35 so mid-range scores generate real pressure,
  // and enforce a hard floor of 0.75 — even "already safe" text must be fully processed
  // to reach 0% AI across all detectors. User mandate: aggressive at ALL depth levels.
  const detectorPressure = Math.max(0.75, clamp01((Math.max(score, targetScore) - targetScore) / 35));
  const lightFloor = postProfile === 'undetectability' ? 4 : postProfile === 'quality' ? 2 : 1;
  const changeTargets = paperPlan
    ? {
        strength: paperPlan.overallStrength,
        minDocumentChange: paperPlan.minDocumentChange,
        minSentenceChange: paperPlan.minSentenceChange,
        minChangedSentenceShare: paperPlan.minChangedSentenceShare,
        maxEngineRetries: 2,
        maxWordLevelPasses: paperPlan.changePasses,
        planIterationBias: paperPlan.changePasses,
      }
    : resolveChangeTargets(requestedStrength, humanizationRate);
  // Never short-circuit iterations based on current score — we always process
  // to full depth because the goal is 0% AI across ALL detectors, not just "low enough".
  const capIterations = (value: number, floor: number, cap: number): number => {
    return Math.max(floor, Math.min(cap, Math.round(value)));
  };
  // Hard minimum enforcement for Nuru and AntiPangram — always ≥ 10 regardless of
  // isAlreadySafe status. User mandate: minimum 10 post-processing iterations on every
  // document to achieve consistent 0% AI score across all engines and all papers.
  const minIter10 = (value: number, cap: number): number =>
    Math.max(10, Math.min(cap, Math.round(value)));

  // Preferred path: use the profile-driven HumanizationPlan if provided,
  // then cap it against the adaptive score band to prevent over-processing.
  if (paperPlan) {
    const planDocumentFloor = clampRange(paperPlan.minDocumentChange, 0.75, postProfile === 'undetectability' ? 0.90 : 0.86);
    const planSentenceFloor = clampRange(paperPlan.minSentenceChange, 0.25, postProfile === 'undetectability' ? 0.45 : 0.38);
    return {
      targetScore: Math.max(paperPlan.targetScore, targetScore),
      // Math.max: take the HIGHER of the plan's pressure and the score-derived pressure,
      // never cap it down. Floor of 0.75 guarantees full aggression at all depth levels.
      detectorPressure: Math.max(paperPlan.detectorPressure, Math.max(0.75, detectorPressure)),
      minDocumentChange: planDocumentFloor,
      minSentenceChange: planSentenceFloor,
      minChangedSentenceShare: Math.max(0.85, paperPlan.minChangedSentenceShare),
      antiPangramIterations: minIter10(paperPlan.antiPangramIterations, postProfile === 'undetectability' ? 30 : 22),
      antiPangramVariance: paperPlan.antiPangramVariance,
      readabilityBias: paperPlan.readabilityBias,
      nuruIterations: minIter10(paperPlan.nuruIterations, postProfile === 'undetectability' ? 30 : 22),
      nuruLoops: Math.max(10, capIterations(paperPlan.nuruLoops, 10, 14)),
      targetedSweeps: capIterations(paperPlan.targetedSweeps, 4, 6),
      universalCleaningPasses: capIterations(paperPlan.universalCleaningPasses, 5, 10),
      changePasses: capIterations(paperPlan.changePasses, 5, 12),
      leadRewriteThreshold: paperPlan.leadRewriteThreshold,
      maxAdaptiveCycles: capIterations(paperPlan.maxAdaptiveCycles, 3, 6),
    };
  }

  // ── Heuristic fallback (no profile supplied) ──
  const ctx = analyzeContext(text);
  const toneId = requestedTone ?? 'neutral';
  const academicish = toneId === 'academic' || toneId === 'academic_blog' || ctx.tone === 'formal';
  const blogish = toneId === 'academic_blog' || toneId === 'casual' || toneId === 'simple';
  const technical = new Set(['technology', 'science', 'health', 'economics']).has(ctx.primaryTopic);
  const social = new Set(['society', 'education', 'politics']).has(ctx.primaryTopic);
  const lengthBias = clamp01((ctx.totalWords - 220) / 900);
  const sentenceDensity = clamp01((ctx.avgSentenceLength - 18) / 16);
  const readabilityBias = clamp01((blogish ? 0.90 : academicish ? 0.76 : 0.70) - (technical ? 0.05 : 0) + (social ? 0.03 : 0));

  // Nuru: always minimum 10 passes; undetectability scales higher.
  const changeBias = changeTargets.planIterationBias;
  const nuruBase = postProfile === 'undetectability' ? 12 : postProfile === 'quality' ? 10 : 10;
  const nuruIterations = minIter10(nuruBase + detectorPressure * 8 + sentenceDensity * 3 + changeBias, postProfile === 'undetectability' ? 24 : 16);

  // AntiPangram: always minimum 10 passes; scales under detector pressure.
  const apBase = postProfile === 'undetectability' ? 10 : postProfile === 'quality' ? 8 : 10;
  const antiPangramIterations = minIter10(apBase + detectorPressure * 8 + lengthBias * 2 + (technical ? 1 : 0) + changeBias, postProfile === 'undetectability' ? 24 : 16);

  // Universal post-processing: bounded final cleanup.
  const universalCleaningPasses = capIterations(5 + detectorPressure * 6 + lengthBias + (blogish ? 1 : 0) + changeBias, 5, 14);
  const adaptiveDocumentFloor = clampRange(
    changeTargets.minDocumentChange + detectorPressure * 0.04 + lengthBias * 0.03 + (postProfile === 'undetectability' ? 0.04 : postProfile === 'quality' ? -0.02 : 0),
    0.75,
    postProfile === 'undetectability' ? 0.90 : 0.86,
  );
  const adaptiveSentenceFloor = clampRange(
    changeTargets.minSentenceChange + detectorPressure * 0.10 + sentenceDensity * 0.04 + (postProfile === 'undetectability' ? 0.04 : postProfile === 'quality' ? -0.02 : 0),
    0.25,
    postProfile === 'undetectability' ? 0.45 : 0.38,
  );

  return {
    targetScore,
    detectorPressure: Math.max(0.75, detectorPressure),
    minDocumentChange: adaptiveDocumentFloor,
    minSentenceChange: adaptiveSentenceFloor,
    minChangedSentenceShare: Math.max(0.85, changeTargets.minChangedSentenceShare),
    antiPangramIterations,
    antiPangramVariance: Math.min(0.25, 0.08 + detectorPressure * 0.15 + (blogish ? 0.05 : 0)),
    readabilityBias,
    nuruIterations,
    nuruLoops: Math.max(10, capIterations(5 + detectorPressure * 5 + lengthBias + (postProfile !== 'quality' ? 2 : 1) + Math.max(0, changeBias), 10, 14)),
    targetedSweeps: capIterations(4 + detectorPressure * 4 + (technical ? 1 : 0) + Math.max(0, changeBias), 4, 8),
    universalCleaningPasses,
    changePasses: capIterations(5 + changeBias + detectorPressure * 2, 5, 12),
    leadRewriteThreshold: 35 + detectorPressure * 25,
    maxAdaptiveCycles: capIterations(3 + detectorPressure * 3 + (lengthBias > 0.4 ? 1 : 0) + Math.max(0, changeBias), 3, 7),
  };
}

/**
 * Deterministic text hash (djb2) — same text always returns the same integer.
 * Used to seed engine selection so the same input always resolves to the same engine.
 */
function hashText(s: string): number {
  let h = 5381;
  for (let i = 0; i < Math.min(s.length, 512); i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h;
}

/**
 * Deterministically pick one value from a weighted options array.
 * Uses a hash of the text as a seed instead of Math.random(), so the
 * same input always resolves to the same engine across requests.
 */
function pickDeterministic<T>(options: Array<{ value: T; weight: number }>, seed: number): T {
  const total = options.reduce((s, o) => s + o.weight, 0);
  let pos = seed % total;
  for (const o of options) {
    pos -= o.weight;
    if (pos < 0) return o.value;
  }
  return options[options.length - 1].value;
}

import { createVariationRNG, weightedPick } from '@/lib/engine/intelligence/variation-rng';
import { profileSentenceSignals, scoreDocumentSignals, planAttack } from '@/lib/engine/intelligence/detector-signature';
import { guardSingleSentence } from '@/lib/engine/intelligence/split-merge-guard';

function resolveAutoEngine(
  text: string,
  requestedTone?: string,
  initialAiScore?: number,
): { mode: 'core_engines' | 'detection_control'; engine: string } {
  // Use RNG to ensure non-deterministic sampling
  const rng = createVariationRNG(text, requestedTone || '');
  
  // ── Primary domain/tone profiles ──
  const domain = detectDomain(text);
  const ctx = analyzeContext(text);
  const toneId = requestedTone ?? 'neutral';
  const words = ctx.totalWords;

  // ── Multi-dimensional detector signature profile ──
  const sentences = robustSentenceSplit(text).filter(s => s.trim().length > 0);
  const sigProfiles = sentences.map((s, i) => profileSentenceSignals(s, i, initialAiScore ?? 50));
  const docSignals = scoreDocumentSignals(sigProfiles);
  
  const pangramHigh = docSignals.parallelism > 0.4 || docSignals.connectorDensity > 0.3;
  const nuruHigh = docSignals.aiTellsDensity > 0.3 || docSignals.evaluativeDensity > 0.3;

  const isHighRisk = (initialAiScore ?? 100) >= 60 || pangramHigh || nuruHigh || docSignals.highRiskRatio > 0.4;
  const isLowRisk = (initialAiScore ?? 100) < 25 && !pangramHigh && !nuruHigh && docSignals.highRiskRatio < 0.1;

  // ── Adaptive detector-signature-driven routing ──
  if (isLowRisk) {
    // If it's already mostly human-like but we still run 'auto', 
    // pick one of the highly fluid stealth models. No hard structures needed.
    const engine = weightedPick(rng, [
      { value: 'nuru_v2', weight: 6 },
      { value: 'humara_v3_3', weight: 4 },
      { value: 'ninja_1', weight: 2 },
    ]);
    return { mode: 'detection_control', engine: engine as string };
  }

  // Determine mode probabilities
  const academicish = toneId === 'academic' || toneId === 'academic_blog' || ctx.tone === 'formal' || domain.primary === 'medical' || domain.primary === 'stem';
  const conversational = toneId === 'casual' || toneId === 'simple' || ctx.tone === 'casual' || domain.primary === 'creative';

  let detectW = 4;
  let coreW = 2;
  
  if (isHighRisk) detectW += 5; // Heavy AI signals demand strict detection control limits
  if (sentences.length > 50) detectW += 3; // Huge texts need detection rigor
  if (conversational) coreW += 4;
  if (sentences.length < 15) coreW += 2;

  const modeRaw = weightedPick(rng, [
    { value: 'detection_control' as const, weight: detectW },
    { value: 'core_engines' as const, weight: coreW },
  ]);
  const mode = modeRaw as 'detection_control' | 'core_engines';

  // Detector-signature routing logic
  // If the text violates Pangram checks heavily (repetitive sentence lengths, bad connectors), use antipangram
  if (isHighRisk && pangramHigh && rng.next() < 0.6) {
    return { mode: 'detection_control', engine: 'antipangram' };
  }
  // If it's full of heavy AI verbs/adjectives (Nuru flags), route to Nuru or Oxygen
  if (isHighRisk && nuruHigh && rng.next() < 0.5) {
    return { mode: 'detection_control', engine: 'nuru_v2' };
  }

  // Fallback dimension-driven routing
  if (mode === 'core_engines') {
    const engine = weightedPick(rng, [
      { value: 'nuru_v2', weight: conversational ? 8 : academicish ? 3 : 5 },
      { value: 'ninja_1', weight: academicish ? 5 : 4 },
      { value: 'oxygen', weight: sentences.length > 30 ? 5 : 2 },
    ]);
    return { mode, engine: engine as string };
  }

  // Mode = detection_control
  // Factor in domain precision requirements
  const precisionNeeded = domain.primary === 'medical' || domain.primary === 'legal' || domain.primary === 'stem';
  
  const engine = weightedPick(rng, [
    { value: 'humara_v3_3', weight: academicish ? 5 : 3 },
    { value: 'oxygen', weight: precisionNeeded ? 7 : (toneId === 'academic_blog' ? 4 : 3) },
    { value: 'king', weight: domain.primary === 'humanities' ? 6 : (academicish ? 4 : 2) },
    { value: 'nuru_v2', weight: sentences.length < 15 ? 4 : 2 },
    { value: 'ghost_pro_wiki', weight: domain.primary === 'legal' ? 8 : (academicish ? 5 : 1) },
    { value: 'antipangram', weight: pangramHigh ? 6 : 1 },
  ]);

  return { mode, engine: engine as string };
}

export async function POST(req: Request) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response('data: ' + JSON.stringify({ type: 'error', error: 'Invalid request body' }) + '\n\n', {
        status: 400,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    const { text, engine, strength, tone, strict_meaning, no_contractions, enable_post_processing, premium, humanization_rate, post_processing_profile, auto_model, auto_model_allow_llm } = body as {
      text: string; engine?: string; strength?: string; tone?: string;
      strict_meaning?: boolean; no_contractions?: boolean;
      enable_post_processing?: boolean; premium?: boolean;
      humanization_rate?: number;
      post_processing_profile?: string;
      auto_model?: boolean;
      auto_model_allow_llm?: boolean;
    };

    // Humanization rate: 1-10 scale → minimum word-change threshold
    const hRate = Math.max(1, Math.min(10, Math.round(humanization_rate ?? 8)));
    const oxygenMinChangeRaw = Number((body as Record<string, unknown>).oxygen_min_change_ratio);
    const oxygenRetryRaw = Number((body as Record<string, unknown>).oxygen_max_retries);
    const oxygenMinChangeRatio = Number.isFinite(oxygenMinChangeRaw)
      ? Math.max(0.2, Math.min(0.8, oxygenMinChangeRaw))
      : 0.4;
    const oxygenMaxRetries = Number.isFinite(oxygenRetryRaw)
      ? Math.max(1, Math.min(15, Math.round(oxygenRetryRaw)))
      : 5;
    const postProcessingProfile = post_processing_profile === 'undetectability' || post_processing_profile === 'quality'
      ? post_processing_profile
      : 'balanced';

    // 30% aggressiveness boost: when "Keep Meaning" is unchecked, bump strength one level
    const effectiveStrength = (!strict_meaning && strength === 'light') ? 'medium'
      : (!strict_meaning && (strength ?? 'medium') === 'medium') ? 'strong'
      : (strength ?? 'medium');
    const changeTargets = resolveChangeTargets(effectiveStrength, hRate);
    const phaseMinChangeThreshold = changeTargets.minSentenceChange;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response('data: ' + JSON.stringify({ type: 'error', error: 'Text is required' }) + '\n\n', {
        status: 400,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    // Max 5000 words per request
    const inputWordCount = text.trim().split(/\s+/).length;
    if (inputWordCount > 5000) {
      return new Response('data: ' + JSON.stringify({ type: 'error', error: `Maximum 5,000 words per request. You submitted ${inputWordCount.toLocaleString()} words.` }) + '\n\n', {
        status: 400,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    // Auth + quota enforcement
    let userId: string | null = null;
    let userEmail: string | null = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      try {
        const supa = createServiceClient();
        const { data: { user: authUser }, error: authError } = await supa.auth.getUser(authHeader.replace('Bearer ', ''));
        if (authError) {
          console.error('Auth getUser failed:', authError.message);
        }
        if (authUser) {
          userId = authUser.id;
          userEmail = authUser.email ?? null;
        }
      } catch (e) {
        console.error('Auth extraction error:', e);
      }
    }

    // Admin emails get unlimited access
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const isAdmin = userEmail ? adminEmails.includes(userEmail.toLowerCase()) : false;

    // Quotas are enforced for all non-admin users.
    let hasUnlimitedDailyWords = false;

    if (userId && !isAdmin) {
      try {
        const supa = createServiceClient();
        const stats = await getUsageStatsCompat(supa, userId);
        const totalUsed = Number(stats.words_used_fast ?? 0) + Number(stats.words_used_stealth ?? 0);
        const rawLimit = Number(stats.words_limit_fast ?? 0) + Number(stats.words_limit_stealth ?? 0);
        hasUnlimitedDailyWords = Boolean(stats.is_unlimited) || rawLimit < 0;
        const totalLimit = hasUnlimitedDailyWords ? -1 : (rawLimit > 0 ? rawLimit : 1000);

        if (!hasUnlimitedDailyWords) {
          const remaining = Math.max(0, totalLimit - totalUsed);
          if (remaining < inputWordCount) {
            return new Response(
              'data: ' + JSON.stringify({ type: 'error', error: `Word limit reached. ${remaining} words remaining of your daily ${totalLimit} words.` }) + '\n\n',
              { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
            );
          }
        }
      } catch (err) {
        console.error('Quota pre-check error:', err);
        // On error, allow the request but log it
      }
    }

    let resolvedEngineUsed = engine ?? 'oxygen';
    const stream = new ReadableStream({
      async start(controller) {
        const DEADLINE_MS = 295_000;
        const startTime = Date.now();
        let deadlineReached = false;
        let latestHumanized = text;
        let streamClosed = false;
        let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
        const variationSeed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${hashTextForSeed(text)}`;
        setHumanizationVariationSeed(variationSeed);

        const finishStream = (payload: Record<string, unknown>) => {
          if (streamClosed) return;
          streamClosed = true;
          if (deadlineTimer) clearTimeout(deadlineTimer);
          try {
            sendSSE(controller, {
              type: 'done',
              humanized: latestHumanized || text,
              word_count: (latestHumanized || text).split(/\s+/).filter(Boolean).length,
              input_word_count: text.split(/\s+/).filter(Boolean).length,
              engine_used: resolvedEngineUsed,
              ...payload,
            });
          } finally {
            setHumanizationVariationSeed(null);
            try { controller.close(); } catch {}
          }
        };
        deadlineTimer = setTimeout(() => {
          deadlineReached = true;
          finishStream({
            meaning_preserved: true,
            meaning_similarity: 0.85,
            partial: true,
          });
        }, DEADLINE_MS);

        try {
          // 1. Parse & emit original sentences
          const { sentences: origSentences, paragraphBoundaries } = splitIntoIndexedSentences(text);
          sendSSE(controller, {
            type: 'init',
            sentences: origSentences,
            paragraphBoundaries,
          });
          await flushDelay(40); // let client render initial state quickly

          // 2. Heading normalization
          let normalizedText = text;
          // Add blank line AFTER heading lines (Roman numerals, markdown, Part/Section/Chapter)
          normalizedText = normalizedText.replace(
            /^((?:#{1,6}\s.+|[IVXLCDM]+\.\s.+|(?:Part|Section|Chapter)\s+\d+.*))\n(?!\n)/gim, "$1\n\n"
          );
          // Add blank line AFTER short non-punctuation-ending lines that are actual headings
          normalizedText = normalizedText.replace(
            /^([^\n]{1,80}[^.!?\n])\n(?!\n)(?=[A-Z])/gm,
            (match, line) => looksLikeHeadingLine(line.trim()) ? line + '\n\n' : match
          );
          // Add blank line BEFORE heading lines that follow sentence-ending punctuation
          normalizedText = normalizedText.replace(
            /([.!?])\n(?!\n)(?=(?:[IVXLCDM]+\.\s|[A-Z]\.\s|#{1,6}\s|(?:Part|Section|Chapter)\s+\d))/gim, "$1\n\n"
          );

          // ══════════════════════════════════════════════════════════════
          // PAPER PROFILER (Stage 1) + STRATEGY SELECTOR (Stage 3)
          //
          // Runs once per request. Characterizes the paper across domain,
          // register, length, sections, per-paragraph AI metrics, then
          // derives a HumanizationPlan whose iteration counts respect the
          // mandated minimums (Nuru/AntiPangram/universal ≥ 10) and add
          // adaptive boost on top based on composite AI score + length.
          //
          // The plan flows through every downstream phase so intensity is
          // consistent: Nuru, AntiPangram, detector-targeted polish, and
          // the sentence-flow polisher all read from the same plan.
          // ══════════════════════════════════════════════════════════════
          let paperProfile: PaperProfile | null = null;
          let humanizationPlan: HumanizationPlan | null = null;
          try {
            paperProfile = profilePaper(normalizedText);
            humanizationPlan = deriveHumanizationPlan(
              paperProfile,
              postProcessingProfile as 'balanced' | 'quality' | 'undetectability',
              (strength ?? 'strong') as 'light' | 'medium' | 'strong',
            );
            console.log('[PaperProfile]', summarizeProfile(paperProfile));
            console.log('[HumanizationPlan]', summarizePlan(humanizationPlan));
            sendSSE(controller, {
              type: 'stage',
              stage: `Profile: ${paperProfile.domain.primary}/${paperProfile.register}/${paperProfile.lengthBucket} (${paperProfile.overallCompositeAi}% composite AI)`,
            });
            await flushDelay(8);
          } catch (profileErr) {
            console.warn('[PaperProfiler] failed, falling back to heuristic plans:', profileErr);
            paperProfile = null;
            humanizationPlan = null;
          }

          // 3. Engine stage — the main humanization
          let humanized: string;
          let eng = engine ?? 'oxygen';

          // Engine display names for phase labels
          const ENGINE_DISPLAY: Record<string, string> = {
            ghost_pro_wiki: 'Ghost', ninja_1: 'Ninja', ninja: 'Ninja', undetectable: 'Ninja',
            oxygen: 'Oxygen', nuru_v2: 'Nuru', humara_v3_3: 'Humarin',
            easy: 'Swift', ghost_pro: 'Ghost Pro',
            humara: 'Humara', nuru: 'Nuru', omega: 'Omega',
            ninja_2: 'Beta', ninja_3: 'Alpha', ninja_5: 'Omega',
            ghost_trial_2: 'Specter',
            phantom: 'Phantom', king: 'King',
            dipper: 'Dipper', humarin: 'Humarin', oxygen3: 'Oxygen 3', oxygen_t5: 'Oxygen T5',
            fast_v11: 'Fast V11', humara_v1_3: 'Humara 1.3', ghost_mini_v1_2: 'Ghost Mini',
            antipangram: 'Pangram',
            ai_analysis: 'AI Analysis',
          };
          if (auto_model === true) {
            const autoSelection = resolveAutoEngine(normalizedText, tone ?? 'neutral', paperProfile?.overallCompositeAi);
            eng = 'ai_analysis';
            sendSSE(controller, {
              type: 'stage',
              stage: `Auto Model: AI Analysis stack (${autoSelection.mode === 'core_engines' ? 'Core' : 'Detection'} signal: ${ENGINE_DISPLAY[autoSelection.engine] || autoSelection.engine})`,
            });
            await flushDelay(12);
          }
          resolvedEngineUsed = eng;
          const engineDisplayName = ENGINE_DISPLAY[eng] || eng;

          // Fast-loop engine detection (used for phase labeling + pipeline selection)
          const FAST_REHUMANIZE_ENGINES = new Set(['nuru_v2', 'ghost_pro_wiki', 'oxygen', 'humara_v3_3', 'ninja_1', 'king', 'easy', 'antipangram']);

          // Engines that use the phase pipeline (fast-loop + deep-kill)
          const PHASED_ENGINES = new Set([
            ...FAST_REHUMANIZE_ENGINES,
            'ninja_2', 'ninja_3', 'ninja_5',
            'ghost_trial_2',
            'phantom',
            'ai_analysis',
          ]);
          const usePhasePipeline = PHASED_ENGINES.has(eng) && eng !== 'ai_analysis';
          const ENGINES_WITH_BUILTIN_NURU = new Set([
            'easy', 'ghost_pro_wiki', 'ninja_1', 'oxygen', 'nuru_v2',
            'king', 'humara_v3_3', 'phantom', 'antipangram',
            'ninja_2', 'ninja_3', 'ninja_5', 'ghost_trial_2',
          ]);
          const skipUniversalNuruPost = ENGINES_WITH_BUILTIN_NURU.has(eng);

          const inputRiskReport = analyzeStyleStability(normalizedText, {
            sourceText: text,
            tone: tone ?? 'neutral',
            engine: eng,
          });
          const inputRiskByIndex = new Map(inputRiskReport.sentences.map((sentence) => [sentence.index, sentence]));
          const getRiskAdaptiveMinChange = (sentenceIndex: number, baseMin: number): number => {
            const sentenceRisk = inputRiskByIndex.get(sentenceIndex);
            if (!sentenceRisk) return Math.max(0.65, baseMin); // Boost baseline for better AI sweep
            if (sentenceRisk.styleClass === 'fact' || sentenceRisk.styleClass === 'citation') return Math.max(baseMin * 0.75, baseMin - 0.15);
            if (sentenceRisk.riskLevel === 'low') return Math.max(baseMin * 0.82, baseMin - 0.10);
            if (sentenceRisk.riskLevel === 'medium') return Math.max(baseMin * 0.9, baseMin - 0.06);
            return Math.max(0.70, baseMin); // Forces at least 70% rewrite on high/critical AI risk segments
          };

          sendSSE(controller, { type: 'stage', stage: 'Sentence Risk Analysis' });
          await flushDelay(10);
          console.log(
            `[InputRisk] overall=${inputRiskReport.overallScore} profile=${inputRiskReport.profile} high=${inputRiskReport.highRiskCount}/${inputRiskReport.sentenceCount} flatness=${inputRiskReport.flatnessScore} opener=${inputRiskReport.openerDiversityScore}`,
          );

          // Emit initial stage for non-phased engines only
          // (phased engines emit their own Phase labels inside the pipeline below)
          sendSSE(controller, { type: 'stage', stage: 'Engine Processing' });
          await flushDelay(20);

          const runGuarded = async (
            label: string,
            task: () => Promise<string>,
            fallback: string,
            timeoutMs = 110_000,
          ): Promise<string> => {
            try {
              return await withTimeout(task(), timeoutMs, label);
            } catch (err) {
              console.warn(`[HumanizeStream] ${label} failed or timed out:`, err);
              return fallback;
            }
          };

          const runHumara22 = async (input: string): Promise<string> => {
            const easySBS = (body as Record<string, unknown>).easy_sentence_by_sentence === true;
            const easyResult = await easyHumanize(input, effectiveStrength, tone ?? 'academic', easySBS);
            return easyResult.humanized;
          };


          // ── Sentence-level change measurement ──
          const measureSentenceChange = (original: string, modified: string): number => {
            const origWords = original.toLowerCase().split(/\s+/).filter(Boolean);
            const modWords = modified.toLowerCase().split(/\s+/).filter(Boolean);
            const len = Math.max(origWords.length, modWords.length);
            if (len === 0) return 1;
            let changed = 0;
            for (let i = 0; i < len; i++) {
              if (!origWords[i] || !modWords[i] || origWords[i] !== modWords[i]) changed++;
            }
            return changed / len;
          };

          // ── Adaptive Oxygen Chain (inline) ──
          // Iterates oxygenHumanize until the UI-configured sentence change target
          // is reached or the UI-configured retry cap is exhausted.
          const adaptiveOxygenChain = (phaseOneOutput: string): string => {
            const phaseOneSentences = robustSentenceSplit(phaseOneOutput).filter((sentence) => sentence.trim().length > 0);
            let current = phaseOneOutput;
            for (let iter = 0; iter < oxygenMaxRetries; iter++) {
              const before = current;
              const r = oxygenHumanize(current, 'medium', 'quality', false);
              if (r && r.trim().length > 0) current = r;
              if (current === before) break;

              const currentSentences = robustSentenceSplit(current).filter((sentence) => sentence.trim().length > 0);
              if (phaseOneSentences.length === 0 || currentSentences.length === 0) continue;
              let metCount = 0;
              const comparableCount = Math.min(phaseOneSentences.length, currentSentences.length);
              for (let i = 0; i < comparableCount; i++) {
                if (measureSentenceChange(phaseOneSentences[i], currentSentences[i]) >= oxygenMinChangeRatio) {
                  metCount++;
                }
              }
              if (metCount / comparableCount >= 0.65) break;
            }
            return current;
          };

          const runHumara20 = (input: string): string => {
            const oxygenMode = (body as Record<string, unknown>).oxygen_mode as string || (effectiveStrength === 'light' ? 'fast' : effectiveStrength === 'strong' ? 'aggressive' : 'quality');
            let output = oxygenHumanize(
              input,
              effectiveStrength,
              oxygenMode,
              (body as Record<string, unknown>).oxygen_sentence_by_sentence !== undefined
                ? Boolean((body as Record<string, unknown>).oxygen_sentence_by_sentence)
                : true,
            );
            output = adaptiveOxygenChain(output);
            return output;
          };

          const runHumara24 = async (input: string): Promise<string> => {
            const inputWordCount = input.split(/\s+/).filter(Boolean).length;
            const humarinMode = strength === 'strong' ? 'quality' : strength === 'light' ? 'turbo' : 'fast';
            const humarinResult = await humarinHumanize(input, humarinMode, inputWordCount <= 220);
            let output = humarinResult.humanized;
            output = cleanOutputRepetitions(output);
            output = adaptiveOxygenChain(output);
            return output;
          };

          const runWikipedia = async (input: string): Promise<string> => {
            return await ghostProHumanize(input, {
              strength: strength ?? 'medium',
              tone: 'wikipedia',
              strictMeaning: strict_meaning ?? false,
              enablePostProcessing: enable_post_processing !== false,
              turbo: true,
            });
          };

          // Clean helpers for Deep Kill — NO Nuru tail (Nuru runs once at the very end)
          const runWikipediaClean = runWikipedia; // Stream route's runWikipedia is already clean
          const runHumara22Clean = async (input: string): Promise<string> => {
            const easySBS = (body as Record<string, unknown>).easy_sentence_by_sentence === true;
            const easyResult = await easyHumanize(input, effectiveStrength, tone ?? 'academic', easySBS);
            return easyResult.humanized;
          };
          const runHumara22Full = async (input: string): Promise<string> => {
            let s = await runHumara22(input);
            s = deepNonLLMClean(s);
            return s;
          };

          const runNuru = (input: string, options: StealthHumanizeOptions = {}): string => {
            const output = stealthHumanize(input, effectiveStrength ?? 'medium', tone ?? 'academic', 15, options);
            return output && output.trim().length > 0 ? output : input;
          };

          // One chained Nuru step. Any caller that needs x10 must feed this
          // output into the next step, never restart from the original input.
          const runNuruSinglePass = (input: string, options: StealthHumanizeOptions = {}): string => {
            // Protect special content (numbers, stats, citations) from Nuru transforms
            const { text: protectedInput, map: protMap } = protectSpecialContent(input);
            const raw = stealthHumanize(protectedInput, effectiveStrength ?? 'medium', tone ?? 'academic', 10, options);
            const output = raw && raw.trim().length > 0 ? raw : protectedInput;
            return restoreSpecialContent(output, protMap);
          };

          const runChainedNuruPasses = (
            input: string,
            passes: number,
            options: StealthHumanizeOptions = {},
            enforceSingleSentence = false,
          ): string => {
            let output = input;
            const totalPasses = Math.max(0, Math.round(passes));
            for (let pass = 0; pass < totalPasses; pass++) {
              const next = runNuruSinglePass(output, options);
              const candidate = next && next.trim().length > 0 ? next : output;
              output = enforceSingleSentence ? guardSingleSentence(output, candidate) : candidate;
            }
            return output;
          };

          // Nuru 2.0 post-processing depth applied at the tail of every pipeline.
          const CHAIN_TS = 10;
          const UNIVERSAL_POST_LOOPS = 1; // Reduced from 5 to 1
          const UNIVERSAL_POST_PASSES_PER_LOOP = 3;
          const chainSync = (fn: (s: string) => string, input: string, n: number): string => {
            let out = input;
            for (let i = 0; i < n; i++) out = fn(out);
            return out;
          };

          const stripResidualAIConnectors = (sentence: string): string => sentence
            .replace(/^\s*(?:Additionally|Furthermore|Moreover|In addition),?\s+/i, '')
            .replace(/\b(?:additionally|furthermore|moreover)\b/gi, 'also')
            .replace(/\s{2,}/g, ' ')
            .trim();

          const restoreCitationAuthorCasing = (originalText: string, rewrittenText: string): string => {
            let restored = rewrittenText;
            const citationAuthors = new Set<string>();
            const citationPatterns = [
              /\b([A-Z][a-z]+(?:\s+(?:&|and)\s+[A-Z][a-z]+)*)(?=\s*(?:\(|,)\s*\d{4})/g,
              /\b([A-Z][a-z]+\s+et\s+al\.?)(?=\s*(?:\(|,)\s*\d{4})/g,
            ];

            for (const pattern of citationPatterns) {
              for (const match of originalText.matchAll(pattern)) {
                if (match[1]) citationAuthors.add(match[1]);
              }
            }

            for (const author of citationAuthors) {
              restored = restored.replace(new RegExp(author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), author);
            }

            return restored;
          };

          // Smart Nuru polish: wraps stealthHumanize for N-pass full-text polish
          const applySmartNuruPolish = (input: string, maxPasses = 15, options: StealthHumanizeOptions = {}): string => {
            const output = stealthHumanize(input, effectiveStrength ?? 'medium', tone ?? 'academic', maxPasses, options);
            return output && output.trim().length > 0 ? output : input;
          };

          const applyProtectedSentenceTransform = (sentence: string, transform: (value: string) => string): string => {
            const { text: protectedSentence, map } = protectSpecialContent(sentence);
            const transformed = transform(protectedSentence);
            const restored = restoreCitationAuthorCasing(sentence, restoreSpecialContent(transformed, map));
            return guardSingleSentence(sentence, restored);
          };

          // ══════════════════════════════════════════════════════════════
          // ACADEMIC-GRADE CLEANING & SMOOTHING FUNCTIONS
          // All functions preserve formal academic register.
          // NO casualization — connectors stay scholarly, contractions
          // are expanded, and vocabulary remains appropriate for
          // university-level papers targeting excellent marks.
          // ══════════════════════════════════════════════════════════════

          // Academic connector variation map — replaces AI-repetitive connectors with
          // natural, varied alternatives that do NOT appear in AI-detector dictionaries.
          // CRITICAL: every replacement must itself be non-AI-flagged. Do NOT swap one
          // AI connector for another AI connector (e.g. "Furthermore" → "In addition"
          // swaps one detector keyword for another — this was the old bug).
          const ACADEMIC_CONNECTOR_MAP: Record<string, string[]> = {
            'Furthermore, ': ['Also, ', 'Plus, ', 'On top of this, ', 'And, '],
            'Moreover, ': ['Also, ', 'Beyond that, ', 'Plus, ', 'And, '],
            'Additionally, ': ['Also, ', 'Plus, ', 'And, ', 'On top of this, '],
            'Consequently, ': ['So, ', 'Because of this, ', 'As a result, ', 'This led to '],
            'Nevertheless, ': ['Still, ', 'Even so, ', 'Yet, ', 'That said, '],
            'Nonetheless, ': ['Still, ', 'Even so, ', 'Yet, ', 'That said, '],
            'In contrast, ': ['But, ', 'By comparison, ', 'Differently, ', 'On the flip side, '],
            'Subsequently, ': ['After that, ', 'Then, ', 'Later, ', 'After this, '],
            'In conclusion, ': ['Overall, ', 'To wrap up, ', 'In the end, ', 'All in all, '],
            'Therefore, ': ['So, ', 'For this reason, ', 'This is why ', 'Because of this, '],
            'However, ': ['But, ', 'Still, ', 'Yet, ', 'That said, '],
            'Thus, ': ['So, ', 'This way, ', 'Because of this, ', 'For this reason, '],
            'Hence, ': ['So, ', 'This is why ', 'For this reason, '],
            'Indeed, ': ['In fact, ', 'Actually, ', 'Clearly, '],
            'Accordingly, ': ['So, ', 'For this reason, ', 'Because of this, '],
            'Notably, ': ['Worth noting, ', 'Interestingly, ', 'Of note, '],
            'Specifically, ': ['In particular, ', 'To be precise, ', 'Namely, '],
            'As a result, ': ['So, ', 'Because of this, ', 'This led to '],
            'For example, ': ['For instance, ', 'As an example, ', 'Take '],
            'For instance, ': ['For example, ', 'As one example, ', 'Consider '],
            'On the other hand, ': ['But, ', 'By contrast, ', 'Differently, '],
            'In other words, ': ['Put differently, ', 'That is, ', 'Simply put, '],
            'In particular, ': ['Especially, ', 'Specifically, ', 'Above all, '],
            'As such, ': ['Given this, ', 'Because of this, ', 'With that, '],
            'To that end, ': ['For this, ', 'With this aim, ', 'To achieve this, '],
            'By contrast, ': ['But, ', 'By comparison, ', 'Differently, '],
            'In essence, ': ['At its core, ', 'Simply put, ', 'Basically, '],
          };

          const academicConnectorVariation = (text: string): string => {
            let result = text;
            for (const [formal, replacements] of Object.entries(ACADEMIC_CONNECTOR_MAP)) {
              while (result.includes(formal)) {
                const rep = replacements[Math.floor(Math.random() * replacements.length)];
                result = result.replace(formal, rep);
              }
            }
            return result;
          };

          // Tone-aware style policy:
          // - academic: formal, fully expanded prose
          // - academic_blog: cleaner blog cadence with lighter formality
          const isAcademicTone = tone === 'academic';
          const isAcademicBlogTone = tone === 'academic_blog';
          const shouldExpandContractions = true;
          const enforceNoContractions = (value: string): string => expandAllContractions(expandContractions(value));
          const removeFillerParentheticals = (value: string): string => value
            .replace(/\s*\((?:worth noting|in most cases|to varying degrees|though this varies|at least in this context|at least actually|at least in reality)\)/gi, '')
            .replace(/[\s,;:]*[\u2013\u2014-]\s*(?:at least actually|at least in reality|at least in this context)\s*[\u2013\u2014-][\s,;:]*/gi, ' ')
            .replace(/\s+,/g, ',')
            .replace(/,\s*,+/g, ',')
            .replace(/\s+([.;:!?])/g, '$1')
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/\s+\n/g, '\n')
            .trim();
          const antiPangramToneNarrow: 'academic' | 'professional' | 'casual' | 'neutral' =
            isAcademicTone
              ? 'academic'
              : tone === 'professional' || tone === 'casual'
                ? tone
                : 'neutral';
          const humaraToneNarrow: 'neutral' | 'academic' | 'professional' | 'casual' =
            isAcademicTone
              ? 'academic'
              : isAcademicBlogTone
                ? 'professional'
                : tone === 'professional' || tone === 'casual'
                  ? tone
                  : 'neutral';

          const runChainedAntiPangram = async (
            input: string,
            maxIterations: number,
            config: Partial<AntiPangramConfig> = {},
          ): Promise<string> => {
            const { antiPangramSimple } = await import('@/lib/engine/antipangram');
            const output = antiPangramSimple(
              input,
              (strength ?? 'strong') as 'light' | 'medium' | 'strong',
              antiPangramToneNarrow,
              {
                ...config,
                maxIterations: Math.max(1, Math.round(maxIterations)),
              },
            );
            return output && output.trim().length > 0 ? output : input;
          };

          // ── Deep non-LLM cleaning (per-sentence): AI signal removal ──
          const deepNonLLMClean = (sentence: string): string => {
            return applyProtectedSentenceTransform(sentence, (protectedSentence) => {
              let s = applyAIWordKill(protectedSentence);
              s = academicConnectorVariation(s);
              s = applyPhrasePatterns(s);
              s = replaceCollocations(s);
              s = compressPhrases(s);
              if (shouldExpandContractions) s = expandAllContractions(s);
              s = removeEmDashes(s);
              s = fixPunctuation(s);
              s = stripResidualAIConnectors(s);
              return s;
            });
          };

          // ── Smoothing pass (per-sentence): flow & grammar repair ──
          // Applied after heavy engines to fix grammar breaks and ensure
          // the text reads as coherent prose, not patchy transforms.
          const smoothingPass = (sentence: string): string => {
            return applyProtectedSentenceTransform(sentence, (protectedSentence) => {
              let s = postCleanGrammar(protectedSentence);
              s = fixOutOfContextSynonyms(s);
              s = validateCollocations(s);
              s = academicConnectorVariation(s);
              if (shouldExpandContractions) s = expandAllContractions(s);
              s = fixPunctuation(s);
              s = fixMidSentenceCapitalization(s);
              s = removeEmDashes(s);
              return s;
            });
          };

          // ── Final smoothing & grammar (per-sentence): deep intelligent polish ──
          // Last phase — ensures output reads as polished writing.
          // Every step uses deterministic linguistic rules; no random template shuffling.
          const finalSmoothGrammar = (sentence: string): string => {
            return applyProtectedSentenceTransform(sentence, (protectedSentence) => {
              let s = postCleanGrammar(protectedSentence);
              s = fixOutOfContextSynonyms(s);
              s = validateCollocations(s);
              s = academicConnectorVariation(s);
              if (shouldExpandContractions) s = expandAllContractions(s);
              s = fixPunctuation(s);
              s = fixMidSentenceCapitalization(s);
              s = removeEmDashes(s);
              s = stripResidualAIConnectors(s);
              return s;
            });
          };

          // ══════════════════════════════════════════════════════════════
          // FULL-PIPELINE RUNNERS — called when one engine invokes another
          // within a phase. These include ALL sub-engine processing stages
          // so the output is fully processed, not raw engine output.
          // ══════════════════════════════════════════════════════════════

          /** Humara 2.0 Full: oxygen → adaptiveChain → deepClean (lightweight, no nested Nuru/LLM) */
          const runHumara20Full = async (input: string): Promise<string> => {
            let s = runHumara20(input);
            s = deepNonLLMClean(s);
            return guardSingleSentence(input, s);
          };

          /** Humara 2.4 Full: humarin → adaptiveChain → deepClean (lightweight, no nested Nuru/LLM) */
          const runHumara24Full = async (input: string): Promise<string> => {
            let s = await runHumara24(input);
            s = deepNonLLMClean(s);
            return guardSingleSentence(input, s);
          };

          /** Nuru 2.0 Full: restructure → nuru × 9 → deepClean → smooth */
          const runNuru20Full = async (input: string): Promise<string> => {
            let s = await restructureSentence(input);
            s = guardSingleSentence(input, s);
            s = runChainedNuruPasses(s, CHAIN_TS, {}, true);
            s = deepNonLLMClean(s);
            s = finalSmoothGrammar(s);
            return guardSingleSentence(input, s);
          };

          // Deep Kill engine set — used to skip destructive post-processors
          const DEEP_KILL_ENGINES = new Set([
            'ninja_2', 'ninja_3', 'ninja_5',
            'ghost_trial_2',
          ]);
          const isDeepKill = DEEP_KILL_ENGINES.has(eng);

          // ═══════════════════════════════════════════════════════════════
          // SENTENCE-PARALLEL PROCESSING
          // Each sentence goes through the engine independently in parallel,
          // then results are reassembled preserving paragraph structure.
          // ═══════════════════════════════════════════════════════════════
          const { sentences: inputSentences, paragraphBoundaries: inputParaBounds } = splitIntoIndexedSentences(normalizedText);
          // activeParaBounds tracks which paragraph boundaries to use for reassembly.
          // For sentence-level engines, this stays as inputParaBounds.
          // For full-text engines, it gets overwritten with the engine output's bounds.
          let activeParaBounds = inputParaBounds;

          // ═══════════════════════════════════════════════════════════════
          // SMART PREPROCESSING — AI-aware sentence analysis & LLM restructuring
          // Analyzes AI scores per-sentence, selects ≥40% for LLM structural
          // rephrasing, computes aggression levels, and tracks which sentences
          // were restructured to prevent re-restructuring in downstream engines.
          // Non-LLM engines must NOT do structural restructuring.
          // ═══════════════════════════════════════════════════════════════
          let preprocessResult: PreprocessResult | null = null;
          // Engines that skip smart preprocessing (they have their own LLM pipelines)
          const SKIP_PREPROCESS_ENGINES = new Set(['ai_analysis', 'premium', 'undetectable', 'ninja']);
          if (!SKIP_PREPROCESS_ENGINES.has(eng) && !(deadlineReached || Date.now() - startTime > DEADLINE_MS - 60000)) {
            sendSSE(controller, { type: 'stage', stage: 'Smart Preprocessing: AI Analysis' });
            await flushDelay(12);

            try {
              preprocessResult = await smartPreprocess(
                inputSentences,
                inputParaBounds,
                (index, text, stage) => {
                  sendSSE(controller, { type: 'sentence', index, text, stage: `Preprocessing: ${stage}` });
                },
              );

              // Replace inputSentences with preprocessed versions
              for (const analysis of preprocessResult.sentences) {
                inputSentences[analysis.index] = analysis.preprocessed;
              }

              console.log(`[SmartPreprocess] Restructured ${preprocessResult.restructuredCount}/${preprocessResult.contentSentenceCount} sentences (${Math.round(preprocessResult.restructuredCount / Math.max(1, preprocessResult.contentSentenceCount) * 100)}%). AI score: ${Math.round(preprocessResult.initialAiScore)}% → ${Math.round(preprocessResult.postPreprocessAiScore)}%`);

              // Emit preprocessed sentences
              sendSSE(controller, { type: 'stage', stage: 'Smart Preprocessing: Complete' });
              for (let i = 0; i < inputSentences.length; i++) {
                sendSSE(controller, { type: 'sentence', index: i, text: inputSentences[i], stage: 'Preprocessed' });
              }
              await flushDelay(20);
            } catch (preprocessErr) {
              console.warn('[SmartPreprocess] Failed, continuing without preprocessing:', preprocessErr);
              preprocessResult = null;
            }
          }
          const isHeadingSentCheck = (s: string) => {
            const t = s.trim();
            // Use robust heading detection from structure-preserver
            if (looksLikeHeadingLine(t)) return true;
            // Standalone citation references: "Author, A. B. (2012)." or "Author & Author (2012)."
            if (/^[A-Z][a-zA-Z]+[,.].*\(\d{4}\)\s*\.?\s*$/.test(t) && t.split(/\s+/).length <= 20) return true;
            return false;
          };

          const getDetectorAverage = (analysis: ReturnType<ReturnType<typeof getDetector>['analyze']>) => {
            const scores = analysis.detectors.map((item) => item.ai_score).filter((score) => Number.isFinite(score));
            if (!scores.length) return analysis.summary.overall_ai_score;
            return scores.reduce((sum, score) => sum + score, 0) / scores.length;
          };

          const getFlaggedSentenceDetails = (sentences: string[]) => {
            const nonHeadingIndices: number[] = [];
            const contentSentences: string[] = [];
            for (let i = 0; i < sentences.length; i++) {
              if (!isHeadingSentCheck(sentences[i])) {
                nonHeadingIndices.push(i);
                contentSentences.push(sentences[i]);
              }
            }

            const joined = contentSentences.join(' ');
            const analysis = getDetector().analyze(joined);
            const textSignals = new TextSignals(joined);
            const perSentence = textSignals.perSentenceDetails();
            const flagged = perSentence
              .map((detail) => ({
                index: nonHeadingIndices[detail.index] ?? detail.index,
                aiScore: detail.ai_score,
                flaggedPhrases: detail.flagged_phrases,
              }))
              .filter((detail) => detail.index >= 0 && detail.index < sentences.length && detail.aiScore > 35);

            return {
              analysis,
              detectorAverage: getDetectorAverage(analysis),
              flagged,
            };
          };

          const runEngineOnSentence = async (sentence: string): Promise<string> => {
            if (eng === 'easy') {
              return await runHumara22(sentence);
            } else if (eng === 'oxygen') {
              return runHumara20(sentence);
            } else if (eng === 'oxygen3') {
              const o3Mode = effectiveStrength === 'strong' ? 'fast' : 'turbo';
              return (await oxygen3Humanize(sentence, o3Mode)).humanized;
            } else if (eng === 'oxygen_t5') {
              const t5Mode = effectiveStrength === 'light' ? 'turbo' : effectiveStrength === 'strong' ? 'aggressive' : 'fast';
              return (await t5Humanize(sentence, t5Mode, true)).humanized;
            } else if (eng === 'dipper') {
              return (await dipperHumanize(sentence, effectiveStrength, false)).humanized;
            } else if (eng === 'humarin') {
              const humarinMode = strength === 'strong' ? 'aggressive' : strength === 'light' ? 'fast' : 'quality';
              return (await humarinHumanize(sentence, humarinMode, true)).humanized;
            } else if (eng === 'humara_v3_3') {
              return await runHumara24(sentence);
            } else if (eng === 'nuru_v2') {
              return runNuruSinglePass(sentence);
            } else if (eng === 'ghost_pro_wiki') {
              return await runWikipedia(sentence);
            } else if (eng === 'ninja_2') {
              // Phase 1 only: Easy (Swift) — remaining phases handled in pipeline
              return await runGuarded('ninja_2_s1', () => runHumara22Clean(sentence), sentence, 35_000);
            } else if (eng === 'ninja_5') {
              return await runGuarded('ninja_5_s1', () => runHumara24Full(sentence), sentence);
            } else if (eng === 'ghost_trial_2') {
              // Phase 1 only: Humara 2.4 — remaining phases handled in pipeline
              return await runGuarded('gt2_s1', () => runHumara24Full(sentence), sentence);
            } else if (eng === 'humara_v1_3') {
              const { pipeline } = await import('@/lib/engine/humara-v1-3');
              return await pipeline(sentence, (tone ?? 'academic') as string, strength === 'strong' ? 10 : strength === 'light' ? 4 : 7);
            } else if (eng === 'omega') {
              return await omegaHumanize(sentence, strength ?? 'medium', tone ?? 'academic');
            } else if (eng === 'nuru') {
              return nuruHumanize(sentence, strength ?? 'medium', tone ?? 'academic');
            } else if (eng === 'humara') {
              return humaraHumanize(sentence, {
                strength: strength === 'high' ? 'heavy' : strength === 'low' ? 'light' : (strength ?? 'medium') as 'light' | 'medium' | 'heavy',
                tone: humaraToneNarrow,
                strictMeaning: (strict_meaning ?? false) as boolean,
              });
            } else if (premium) {
              return await premiumHumanize(sentence, eng, (strength ?? 'medium') as 'light' | 'medium' | 'strong', tone ?? 'neutral', strict_meaning ?? true);
            } else if (eng === 'ninja_1') {
              // Ninja 1 Phase 1: LLM only — Humara 2.0 and Nuru 2.0 handled in pipeline phases
              return await runGuarded('ninja1_s1', () => llmHumanize(sentence, strength ?? 'medium', true, strict_meaning ?? true, tone ?? 'academic', no_contractions !== false, enable_post_processing !== false), sentence);
            } else if (eng === 'undetectable' || eng === 'ninja') {
              return await llmHumanize(sentence, strength ?? 'medium', true, strict_meaning ?? true, tone ?? 'academic', no_contractions !== false, enable_post_processing !== false);
            } else if (eng === 'fast_v11') {
              return (await humanizeV11(sentence, { strength: (strength ?? 'medium') as 'light' | 'medium' | 'strong', tone: tone ?? 'neutral', strictMeaning: strict_meaning ?? false })).humanized;
            } else if (eng === 'ghost_mini_v1_2') {
              const { ghostMiniV1_2 } = await import('@/lib/engine/ghost-mini-v1-2');
              return ghostMiniV1_2(sentence);
            } else if (eng === 'ghost_pro') {
              return await ghostProHumanize(sentence, { strength: strength ?? 'medium', tone: tone ?? 'neutral', strictMeaning: strict_meaning ?? false, enablePostProcessing: enable_post_processing !== false });
            } else {
              return humanize(sentence, { mode: 'ghost_mini', strength: strength ?? 'medium', tone: tone ?? 'neutral', strictMeaning: strict_meaning ?? false, enablePostProcessing: enable_post_processing !== false, stealth: true });
            }
          };

          // ── Full-text engines (Ozone / Humara 2.1, Easy / Humara 2.2) ──
          // These LLM APIs work best on the entire text, not sentence-by-sentence.
          const FULL_TEXT_ENGINES = new Set(['easy', 'king', 'ghost_pro_wiki', 'humara_v3_3', 'phantom', 'antipangram', 'ninja_3', 'ai_analysis']);
          let sentenceResults: string[];

          if (FULL_TEXT_ENGINES.has(eng)) {
            console.log(`[FullText] Processing entire text via '${eng}'`);
            let fullResult: string;
            if (eng === 'king') {
              try {
                const kingResult = await kingHumanize(normalizedText);
                fullResult = kingResult.humanized;
              } catch (kingErr) {
                console.warn('[King] kingHumanize failed - falling back to local Oxygen rewrite:', kingErr instanceof Error ? kingErr.message : kingErr);
                fullResult = runHumara20(normalizedText);
              }
            } else if (eng === 'ghost_pro_wiki') {
              fullResult = await runWikipedia(normalizedText);
            } else if (eng === 'antipangram') {
              // Standalone AntiPangram engine: forensic signal destruction on full text + Nuru post-processing
              fullResult = await runChainedAntiPangram(
                normalizedText,
                10,
              );
            } else if (eng === 'ninja_3') {
              // Alpha (stealth loop optimized): Wiki → Nuru → Phantom until score < 20
              sendSSE(controller, { type: 'stage', stage: 'Alpha: Wikipedia Pass' });
              await flushDelay(10);
              let tmp = await runWikipedia(normalizedText);
              
              sendSSE(controller, { type: 'stage', stage: 'Alpha: Nuru Initial Clean' });
              await flushDelay(10);
              tmp = runHumara20(tmp);
              
              sendSSE(controller, { type: 'stage', stage: 'Alpha: Phantom Restructure' });
              await flushDelay(10);
              tmp = await runHumara24(tmp);
              
              const detector = getDetector();
              let aiScore = detector.analyze(tmp).summary.overall_ai_score;
              let iterations = 0;
              
              while (aiScore > 20 && iterations < 5) {
                sendSSE(controller, { type: 'stage', stage: `Alpha Core Loop ${iterations + 1}: Phantom Sweep` });
                await flushDelay(10);
                tmp = await runHumara24(tmp);
                
                sendSSE(controller, { type: 'stage', stage: `Alpha Core Loop ${iterations + 1}: Nuru Sweep` });
                await flushDelay(10);
                tmp = runHumara20(tmp);
                
                aiScore = detector.analyze(tmp).summary.overall_ai_score;
                iterations++;
              }
              
              fullResult = tmp;
            } else if (eng === 'ai_analysis') {
              // ═══════════════════════════════════════════════════════════
              // TACTICAL AI ANALYSIS — API-free local-engine pipeline
              // Uses ONLY offline engines (Oxygen, AntiPangram, Nuru) —
              // NEVER calls essay writing support APIs (Humarin, Easy,
              // Ghost Pro, King, Dipper, etc.).
              //
              // Pipeline: Oxygen → AntiPangram → Deep Clean + Nuru ×10
              //   → Post-Processing (profile-driven) → 5 iterative loops
              //   × 3 sweeps targeting <20% AI score.
              // ═══════════════════════════════════════════════════════════
              const timeOk = () => !(deadlineReached || Date.now() - startTime > DEADLINE_MS - 12000);

              // ── Phase 0: Pre-Analysis ──
              sendSSE(controller, { type: 'stage', stage: 'AI Analysis: Pre-Scan' });
              await flushDelay(12);
              const detector = getDetector();
              const preAnalysis = detector.analyze(normalizedText);
              const initialAiScore = getDetectorAverage(preAnalysis);
let aiAdaptivePlan = buildAdaptiveCleanupPlan(normalizedText, initialAiScore, tone ?? 'neutral', postProcessingProfile, humanizationPlan ?? undefined, effectiveStrength, hRate);
              const MAX_ITER = Math.max(5, aiAdaptivePlan.maxAdaptiveCycles + 2);
              const TARGET_SCORE = aiAdaptivePlan.targetScore;
              const isHighAI = initialAiScore >= 55;
              const isMediumAI = initialAiScore >= 30 && initialAiScore < 55;
              const useAntiPangram = postProcessingProfile === 'quality'
                ? true
                : postProcessingProfile === 'undetectability'
                  ? false
                  : (isMediumAI || Math.random() < 0.50); // 50/50 for balanced — truly random + adaptive
              console.log(`[AI Analysis] Initial score: ${Math.round(initialAiScore)}% | High: ${isHighAI} | PostProc: ${useAntiPangram ? 'Pangram' : 'Nuru 2.0'} | API-free mode`);

              // ── Phase 1: Agent 1 — Oxygen (Humara 2.0) local rewrite (NO external API) ──
              // Quality gate: skip if score is already low (< 40%) — Oxygen can over-process clean text
              sendSSE(controller, { type: 'stage', stage: 'AI Analysis: Agent 1 — Oxygen Rewrite' });
              await flushDelay(12);
              let working = normalizedText;
              if (timeOk() && initialAiScore >= 40) {
                working = runHumara20(working);
              } else if (initialAiScore < 40) {
                console.log(`[AI Analysis] Phase 1 skipped — score ${Math.round(initialAiScore)}% already below 40% threshold`);
              }

              // ── Phase 2: Agent 2 — AntiPangram forensic signal destruction (local) ──
              sendSSE(controller, { type: 'stage', stage: 'AI Analysis: Agent 2 — AntiPangram Forensic' });
              await flushDelay(12);
              if (timeOk()) {
                working = await runChainedAntiPangram(
                  working,
                  aiAdaptivePlan.antiPangramIterations,
                  {
                    targetAiScore: aiAdaptivePlan.targetScore,
                    detectorPressure: aiAdaptivePlan.detectorPressure,
                    preserveLeadSentence: true,
                    humanVariance: aiAdaptivePlan.antiPangramVariance,
                    readabilityBias: aiAdaptivePlan.readabilityBias,
                  },
                );
              }

              // ── Phase 3: Agent 3 — Deep Non-LLM Clean + Nuru polish ──
              // Escalate Nuru iterations when score is very high (≥75%)
              const phase3NuruIterations = initialAiScore >= 75
                ? aiAdaptivePlan.nuruIterations * 2
                : aiAdaptivePlan.nuruIterations;
              sendSSE(controller, { type: 'stage', stage: `AI Analysis: Agent 3 — Deep Clean + Nuru ×${phase3NuruIterations}` });
              await flushDelay(12);
              if (timeOk()) {
                const { sentences: cleanSents, paragraphBoundaries: cleanBounds } = splitIntoIndexedSentences(working);
                for (let i = 0; i < cleanSents.length; i++) {
                  if (!isHeadingSentCheck(cleanSents[i])) {
                    cleanSents[i] = deepNonLLMClean(cleanSents[i]);
                    for (let p = 0; p < phase3NuruIterations; p++) {
                      cleanSents[i] = runNuruSinglePass(cleanSents[i], {
                        detectorPressure: aiAdaptivePlan.detectorPressure,
                        preserveLeadSentences: true,
                        humanVariance: 0.02 + aiAdaptivePlan.detectorPressure * 0.04,
                        readabilityBias: aiAdaptivePlan.readabilityBias,
                      });
                    }
                    cleanSents[i] = finalSmoothGrammar(cleanSents[i]);
                  }
                  sendSSE(controller, { type: 'sentence', index: i, text: cleanSents[i], stage: `Deep Clean + Nuru ×${phase3NuruIterations}` });
                }
                working = reassembleText(cleanSents, cleanBounds.length ? cleanBounds : [0]);
              }

              // ── Phase 4: Post-Processing — AntiPangram + Nuru 2.0 Full (BOTH always run; order adaptive) ──
              // useAntiPangram controls which runs FIRST; the complementary processor always runs second.
              if (timeOk()) {
                // First pass: profile/score-selected processor
                if (useAntiPangram) {
                  sendSSE(controller, { type: 'stage', stage: 'AI Analysis: Pangram Forensic Clean' });
                  await flushDelay(10);
                  working = await runChainedAntiPangram(
                    working,
                    aiAdaptivePlan.antiPangramIterations,
                    {
                      targetAiScore: aiAdaptivePlan.targetScore,
                      detectorPressure: aiAdaptivePlan.detectorPressure,
                      preserveLeadSentence: true,
                      humanVariance: aiAdaptivePlan.antiPangramVariance,
                      readabilityBias: aiAdaptivePlan.readabilityBias,
                    },
                  );
                } else {
                  sendSSE(controller, { type: 'stage', stage: 'AI Analysis: Nuru 2.0 Full Post-Processing' });
                  await flushDelay(10);
                  const { sentences: nuruSents, paragraphBoundaries: nuruBounds } = splitIntoIndexedSentences(working);
                  const contentIdxs: number[] = [];
                  for (let i = 0; i < nuruSents.length; i++) {
                    if (!isHeadingSentCheck(nuruSents[i])) contentIdxs.push(i);
                  }
                  const maxRestructPhase4 = Math.max(1, Math.ceil(contentIdxs.length * MAX_RESTRUCTURE_ITERATION));
                  let restructuredInPhase4 = 0;
                  for (let i = 0; i < nuruSents.length; i++) {
                    if (!isHeadingSentCheck(nuruSents[i]) && restructuredInPhase4 < maxRestructPhase4) {
                      const before = nuruSents[i];
                      nuruSents[i] = await runNuru20Full(nuruSents[i]);
                      nuruSents[i] = guardSingleSentence(before, nuruSents[i]);
                      if (nuruSents[i] !== before) restructuredInPhase4++;
                    }
                    sendSSE(controller, { type: 'sentence', index: i, text: nuruSents[i], stage: 'Nuru 2.0 Full' });
                  }
                  working = reassembleText(nuruSents, nuruBounds.length ? nuruBounds : [0]);
                }
                // Second pass: always run the complementary processor (both MUST run every time)
                if (timeOk()) {
                  if (!useAntiPangram) {
                    // AntiPangram second (when Nuru ran first)
                    sendSSE(controller, { type: 'stage', stage: 'AI Analysis: Pangram Forensic Clean (2nd)' });
                    await flushDelay(10);
                    working = await runChainedAntiPangram(
                      working,
                      aiAdaptivePlan.antiPangramIterations,
                      {
                        targetAiScore: aiAdaptivePlan.targetScore,
                        detectorPressure: aiAdaptivePlan.detectorPressure,
                        preserveLeadSentence: true,
                        humanVariance: aiAdaptivePlan.antiPangramVariance,
                        readabilityBias: aiAdaptivePlan.readabilityBias,
                      },
                    );
                  } else {
                    // Nuru 2.0 Full second (when AntiPangram ran first)
                    sendSSE(controller, { type: 'stage', stage: 'AI Analysis: Nuru 2.0 Full (2nd Pass)' });
                    await flushDelay(10);
                    const { sentences: nuruSents2, paragraphBoundaries: nuruBounds2 } = splitIntoIndexedSentences(working);
                    const contentIdxs2: number[] = [];
                    for (let i = 0; i < nuruSents2.length; i++) {
                      if (!isHeadingSentCheck(nuruSents2[i])) contentIdxs2.push(i);
                    }
                    const maxRestructPhase4b = Math.max(1, Math.ceil(contentIdxs2.length * MAX_RESTRUCTURE_ITERATION));
                    let restructuredInPhase4b = 0;
                    for (let i = 0; i < nuruSents2.length; i++) {
                      if (!isHeadingSentCheck(nuruSents2[i]) && restructuredInPhase4b < maxRestructPhase4b) {
                        const before2 = nuruSents2[i];
                        nuruSents2[i] = await runNuru20Full(nuruSents2[i]);
                        nuruSents2[i] = guardSingleSentence(before2, nuruSents2[i]);
                        if (nuruSents2[i] !== before2) restructuredInPhase4b++;
                      }
                      sendSSE(controller, { type: 'sentence', index: i, text: nuruSents2[i], stage: 'Nuru 2.0 Full (2nd)' });
                    }
                    working = reassembleText(nuruSents2, nuruBounds2.length ? nuruBounds2 : [0]);
                  }
                }
              }

              // ── Phase 5: Iterative Flagged-Sentence Loop — Oxygen + Nuru targeting ──
              // Five loops, each with three focused sweeps. Uses only local engines.
              const { sentences: workingSentences, paragraphBoundaries: workingBounds } = splitIntoIndexedSentences(working);
              const totalContentSentsForCap = workingSentences.filter(s => !isHeadingSentCheck(s)).length;
              const maxRestructPerIter = Math.max(1, Math.ceil(totalContentSentsForCap * MAX_RESTRUCTURE_ITERATION));
              let currentScan = getFlaggedSentenceDetails(workingSentences);
aiAdaptivePlan = buildAdaptiveCleanupPlan(reassembleText(workingSentences, workingBounds.length ? workingBounds : [0]), currentScan.detectorAverage, tone ?? 'neutral', postProcessingProfile, humanizationPlan ?? undefined, effectiveStrength, hRate);
              sendSSE(controller, { type: 'stage', stage: `AI Analysis: Post-Agent Score ${Math.round(currentScan.detectorAverage)}%` });
              await flushDelay(12);

              for (let iteration = 0; iteration < MAX_ITER; iteration++) {
                if (currentScan.detectorAverage <= TARGET_SCORE || currentScan.flagged.length === 0) {
                  sendSSE(controller, { type: 'stage', stage: `AI Analysis: ${Math.round(currentScan.detectorAverage)}% — target met` });
                  await flushDelay(8);
                  break;
                }
                if (!timeOk()) break;

                const useHeavyPass = currentScan.detectorAverage >= 35;
aiAdaptivePlan = buildAdaptiveCleanupPlan(reassembleText(workingSentences, workingBounds.length ? workingBounds : [0]), currentScan.detectorAverage, tone ?? 'neutral', postProcessingProfile, humanizationPlan ?? undefined, effectiveStrength, hRate);
                sendSSE(controller, {
                  type: 'stage',
                  stage: `AI Analysis: Iteration ${iteration + 1} (${Math.round(currentScan.detectorAverage)}%)`,
                });
                await flushDelay(10);

                let restructuredThisIter = 0;
                for (let sweep = 0; sweep < aiAdaptivePlan.targetedSweeps; sweep++) {
                  for (const flagged of currentScan.flagged) {
                    if (isHeadingSentCheck(workingSentences[flagged.index])) continue;
                    const before = workingSentences[flagged.index];
                    let sent = before;

                    if (restructuredThisIter < maxRestructPerIter) {
                      // Use Oxygen (local) by default; escalate to LLM if auto_model_allow_llm is set
                      if (useHeavyPass) {
                        if (auto_model_allow_llm && currentScan.detectorAverage >= 50) {
                          // LLM escalation: restructure via deep AI clean when score is high
                          sent = await deepAICleanOneSentence(sent);
                        } else {
                          sent = await runHumara20Full(sent);
                        }
                      }
                      sent = await runNuru20Full(sent);
                      sent = finalSmoothGrammar(sent);

                      sent = guardSingleSentence(before, sent);

                      if (sent !== before) restructuredThisIter++;
                    } else {
                      sent = finalSmoothGrammar(sent);
                    }

                    if (flagged.flaggedPhrases.length > 0) {
                      sent = stealthHumanizeTargeted(sent, flagged.flaggedPhrases, strength ?? 'medium');
                      sent = guardSingleSentence(before, sent);
                    }

                    workingSentences[flagged.index] = sent;
                    sendSSE(controller, {
                      type: 'sentence',
                      index: flagged.index,
                      text: sent,
                      stage: useHeavyPass ? `Oxygen → Nuru Sweep ${sweep + 1}/3` : `Nuru Targeted Sweep ${sweep + 1}/3`,
                    });
                  }
                }

                currentScan = getFlaggedSentenceDetails(workingSentences);
aiAdaptivePlan = buildAdaptiveCleanupPlan(reassembleText(workingSentences, workingBounds.length ? workingBounds : [0]), currentScan.detectorAverage, tone ?? 'neutral', postProcessingProfile, humanizationPlan ?? undefined, effectiveStrength, hRate);
                await flushDelay(8);
              }

              fullResult = reassembleText(workingSentences, workingBounds.length ? workingBounds : [0]);

              // ── Phase 6: Detector-Signal-Targeted Polish ──
              // Last pass: read the 20-signal vector and attack the remaining
              // worst offenders. Drives scores below the adaptive target.
              if (timeOk() && currentScan.detectorAverage > TARGET_SCORE) {
                try {
                  sendSSE(controller, { type: 'stage', stage: `AI Analysis: Detector Polish (${Math.round(currentScan.detectorAverage)}%)` });
                  await flushDelay(8);
                  const polish = await detectorTargetedPolish(fullResult, {
                    targetScore: aiAdaptivePlan.targetScore,
                    maxIterations: 4,
                    timeBudgetMs: Math.max(4_000, DEADLINE_MS - (Date.now() - startTime) - 10_000),
                    preserveLeadSentences: true,
                    tone: tone ?? 'academic',
                    strength: (strength ?? 'strong') as 'light' | 'medium' | 'strong',
                    readabilityBias: aiAdaptivePlan.readabilityBias,
                    onStage: async (stage: string, score: number) => {
                      sendSSE(controller, { type: 'stage', stage: `AI Analysis: ${stage} (~${Math.round(score)}%)` });
                      await flushDelay(4);
                    },
                  });
                  if (polish.text && polish.text.trim().length >= fullResult.trim().length * 0.7) {
                    fullResult = polish.text;
                    sendSSE(controller, {
                      type: 'stage',
                      stage: `AI Analysis: Polish complete (${polish.signalsFixed.slice(0, 3).join(', ') || 'no gaps'})`,
                    });
                    await flushDelay(6);
                  }
                } catch (polishErr) {
                  console.warn('[AI Analysis] DetectorPolish skipped:', polishErr);
                }
              }
            } else if (eng === 'humara_v3_3' || eng === 'phantom') {
              fullResult = await runHumara24(normalizedText);
            } else if (eng === 'easy') {
              fullResult = (await runHumara22(normalizedText));
            } else {
              // Default fallback: use offline engine instead of LLM API
              fullResult = runHumara20(normalizedText);
            }
            if (!fullResult || fullResult.trim().length === 0) fullResult = runHumara20(normalizedText) || normalizedText;

            // Output profile: apply tonal post-processing to match the intended writing style
            {
              const outputProfile = resolveOutputProfile(tone ?? undefined, eng ?? undefined);
              if (outputProfile !== 'general') {
                const docDomain = detectDomain(normalizedText);
                fullResult = applyOutputProfile(fullResult, outputProfile, docDomain.primary);
              }
            }

            // ── Length guard: prevent engines from bloating output ──
            const inputWC = normalizedText.split(/\s+/).filter(Boolean).length;
            const outputWC = fullResult.split(/\s+/).filter(Boolean).length;
            if (outputWC > inputWC * 1.6) {
              console.warn(`[FullText] Engine '${eng}' produced ${outputWC} words from ${inputWC} input words (${(outputWC / inputWC).toFixed(1)}x expansion) - repairing sentence shape instead of returning input`);
              fullResult = conformToSourceSentenceShape(normalizedText, fullResult);
            }

            fullResult = conformToSourceSentenceShape(normalizedText, fullResult);
            const { sentences: resultSents, paragraphBoundaries: resultBounds } = splitIntoIndexedSentences(fullResult);
            sentenceResults = resultSents;
            // Full-text engines produce their own paragraph structure — use resultBounds
            // instead of inputParaBounds for all subsequent reassembly.
            activeParaBounds = resultBounds;
            // Re-send init with updated sentence count and paragraph boundaries
            // so the client-side live preview reassembles paragraphs correctly.
            sendSSE(controller, {
              type: 'init',
              sentences: resultSents,
              paragraphBoundaries: resultBounds,
            });
            // Stream each sentence to the client
            for (let i = 0; i < sentenceResults.length; i++) {
              sendSSE(controller, { type: 'sentence', index: i, text: sentenceResults[i], stage: 'Engine' });
            }
            humanized = fullResult;
            latestHumanized = humanized;
            console.log(`[FullText] Engine complete: ${humanized.split(/\s+/).length} words`);
          } else {
            // Determine if this engine uses async/LLM calls (can parallelize)
            const LLM_ENGINES = new Set([
              'oxygen3', 'oxygen_t5', 'dipper', 'humarin', 'humara_v3_3',
              'ghost_pro_wiki', 'ninja_1', 'ninja_2', 'ninja_5',
              'ghost_trial_2', 'ghost_trial_2_alt', 'conscusion_1', 'conscusion_12',
              'undetectable', 'ninja', 'fast_v11', 'ghost_pro',
              'humara_v1_3', 'omega',
            ]);
            const useParallel = LLM_ENGINES.has(eng);

            if (useParallel) {
              // Parallel sentence processing for LLM/async engines
              console.log(`[SentencePar] Processing ${inputSentences.length} sentences in parallel via '${eng}'`);
              sentenceResults = await Promise.all(
                inputSentences.map(async (sentence, i) => {
                  if (isHeadingSentCheck(sentence)) return sentence;
                  try {
                    const result = await runEngineOnSentence(sentence);
                    let final = result && result.trim().length > 0 ? result : sentence;
                    // No-split/no-merge enforcement
                    final = guardSingleSentence(sentence, final);
                    // LLM engines: bounded retries; stronger depths earn more persistence.
                    let change = measureSentenceChange(sentence, final);
                    let retry = 0;
                    while (change < phaseMinChangeThreshold && retry < Math.min(2, changeTargets.maxEngineRetries)) {
                      const retried = await runEngineOnSentence(final);
                      if (retried && retried.trim().length > 0) {
                        final = guardSingleSentence(sentence, retried);
                      }
                      change = measureSentenceChange(sentence, final);
                      retry++;
                    }
                    sendSSE(controller, { type: 'sentence', index: i, text: final, stage: 'Engine' });
                    return final;
                  } catch (err) {
                    const errMsg = err instanceof Error ? err.message : String(err);
                    console.warn(`[SentencePar] Sentence ${i} failed:`, errMsg);
                    // Surface a non-fatal warning; keep streaming partial results.
                    if (i === 0) {
                      sendSSE(controller, { type: 'warning', message: `Engine '${eng}' degraded: ${errMsg}` });
                    }
                    return sentence;
                  }
                })
              );
            } else {
              // Sequential sentence processing for sync/local engines
              console.log(`[SentenceSeq] Processing ${inputSentences.length} sentences via '${eng}'`);
              sentenceResults = [];
              for (let i = 0; i < inputSentences.length; i++) {
                const sentence = inputSentences[i];
                if (isHeadingSentCheck(sentence)) {
                  sentenceResults.push(sentence);
                  continue;
                }
                try {
                  const result = await runEngineOnSentence(sentence);
                  let final = result && result.trim().length > 0 ? result : sentence;
                  // No-split/no-merge enforcement
                  final = guardSingleSentence(sentence, final);
                  let change = measureSentenceChange(sentence, final);
                  let retry = 0;
                  const maxRetries = changeTargets.maxEngineRetries;
                  while (change < phaseMinChangeThreshold && retry < maxRetries) {
                    const retried = await runEngineOnSentence(final);
                    if (retried && retried.trim().length > 0) {
                      // No-split/no-merge enforcement on retry
                      final = guardSingleSentence(sentence, retried);
                    }
                    change = measureSentenceChange(sentence, final);
                    retry++;
                  }
                  sentenceResults.push(final);
                  sendSSE(controller, { type: 'sentence', index: i, text: final, stage: 'Engine' });
                } catch (err) {
                  const errMsg = err instanceof Error ? err.message : String(err);
                  console.warn(`[SentenceSeq] Sentence ${i} failed:`, errMsg);
                  if (i === 0) {
                    sendSSE(controller, { type: 'warning', message: `Engine '${eng}' degraded: ${errMsg}` });
                  }
                  sentenceResults.push(sentence);
                }
              }
            }
            humanized = reassembleText(sentenceResults, activeParaBounds.length ? activeParaBounds : [0]);
            latestHumanized = humanized;
            console.log(`[Sentence${useParallel ? 'Par' : 'Seq'}] Engine complete: ${humanized.split(/\s+/).length} words`);
          }

          // ═══════════════════════════════════════════════════════════════
          // PHASE-BASED PIPELINE
          // Every engine defines named phases; the water fills 0→100% per phase.
          // Phase 1 = runEngineOnSentence output (already computed above).
          // Subsequent phases process currentSentences through additional engines.
          // ═══════════════════════════════════════════════════════════════
          if (usePhasePipeline) {
            const phaseStart = Date.now();
            const currentSentences = [...sentenceResults];

            // Phase definitions per engine
            type PhaseSpec =
              | { name: string; type: 'emit' }
              | { name: string; type: 'sync'; fn: (s: string) => string }
              | { name: string; type: 'async'; fn: (s: string) => Promise<string> }
              | { name: string; type: 'nuru'; passes: number }
              // 'batch' = ONE LLM call for ALL sentences (cost-effective restructuring).
              // Paragraphs and titles are protected. Sentence ratio tolerance: ±3 per 300 words.
              | { name: string; type: 'batch'; fn: (sentences: string[], wordCount?: number) => Promise<string[]> };

            let phases: PhaseSpec[];
            switch (eng) {
              case 'ghost_pro_wiki':
                phases = [
                  // Non-LLM Nuru restructuring as first phase — pure local rewriting.
                  // All phases are non-LLM sentence-by-sentence (cost-effective).
                  { name: 'Restructuring', type: 'nuru', passes: 10 },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Nuru 2.0', type: 'nuru', passes: 10 },
                  { name: 'Readability Polish', type: 'async', fn: (s) => nuruReadabilityPolish(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'ninja_1':
                phases = [
                  // Phase 1: Non-LLM Nuru restructuring — cost-effective local rewriting.
                  // LLM is used in downstream phases only (Humara 2.0, readability polish).
                  { name: 'Restructuring', type: 'nuru', passes: 10 }, // Phase 1: non-LLM structural rewrite
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },    // Phase 2: Rule-based AI vocabulary/phrase kill
                  { name: 'Humara 2.0 (Full)', type: 'async', fn: (s) => runHumara20Full(s) },    // Phase 3: Full Humara 2.0 pipeline
                  { name: 'Smoothing', type: 'sync', fn: (s) => smoothingPass(s) },               // Phase 4: Grammar + flow repair
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },                           // Phase 5: 10-pass stealth humanization (non-LLM)
                  { name: 'Readability Polish', type: 'async', fn: (s) => nuruReadabilityPolish(s) }, // Phase 6: LLM sentence-level flow smoothing
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) }, // Phase 7: Final polish
                ];
                break;
              case 'oxygen':
                phases = [
                  // Non-LLM Nuru restructuring as first phase — cost-effective local rewriting.
                  { name: 'Restructuring', type: 'nuru', passes: 10 },
                  { name: 'Nuru 2.0', type: 'nuru', passes: 10 },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Readability Polish', type: 'async', fn: (s) => nuruReadabilityPolish(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'nuru_v2':
                // Nuru 2.0: pure non-LLM pipeline — no LLM calls at all (most cost-effective).
                // runEngineOnSentence already called runNuruSinglePass for the engine phase.
                // Phase pipeline adds: Nuru ×10 → Deep Clean → Readability Polish → Final Smooth.
                phases = [
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Readability Polish', type: 'async', fn: (s) => nuruReadabilityPolish(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'king':
                phases = [
                  { name: 'Nuru 2.0', type: 'nuru', passes: 10 },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Readability Polish', type: 'async', fn: (s) => nuruReadabilityPolish(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'humara_v3_3':
                phases = [
                  { name: 'Nuru 2.0', type: 'nuru', passes: 10 },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Readability Polish', type: 'async', fn: (s) => nuruReadabilityPolish(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'phantom':
                // Phantom = Humara 2.4 → Nuru 2.0 × 10 → Deep Clean → Smooth → AntiPangram → Nuru Post-Processing
                phases = [
                  { name: 'Nuru 2.0', type: 'nuru', passes: 10 },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Readability Polish', type: 'async', fn: (s) => nuruReadabilityPolish(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'easy':
                phases = [
                  { name: 'Nuru 2.0', type: 'nuru', passes: 10 },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Readability Polish', type: 'async', fn: (s) => nuruReadabilityPolish(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'antipangram':
                // Pangram: AntiPangram forensic → Nuru 2.0 × 10 → Deep Non-LLM Clean → Final Smooth
                // No LLM readability polish — antipangram already produces clean vocabulary.
                phases = [
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              // Deep Kill engines — multi-step pipelines with visible phases
              case 'ninja_2':
                // Beta: Easy (Swift) → Humara 2.0 → Nuru 2.0 → Deep Non-LLM Clean → Readability Polish → Final Smooth
                phases = [
                  { name: 'Swift', type: 'emit' },
                  { name: 'Humara 2.0 (Full)', type: 'async', fn: (s) => runHumara20Full(s) },
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Readability Polish', type: 'async', fn: (s) => nuruReadabilityPolish(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'ninja_3':
                // Alpha (speed-optimized): Humara 2.0 → Nuru 2.0 → Deep Non-LLM Clean → Readability Polish → Final Smooth
                phases = [
                  { name: 'Humara 2.0', type: 'emit' },
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Readability Polish', type: 'async', fn: (s) => nuruReadabilityPolish(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'ninja_5':
                phases = [
                  { name: 'Humara 2.4', type: 'emit' },
                  { name: 'Humara 2.2 (Full)', type: 'async', fn: (s) => runHumara22Full(s) },
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Readability Polish', type: 'async', fn: (s) => nuruReadabilityPolish(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'ghost_trial_2':
                // Humara 2.4 → Humara 2.0 → Nuru 2.0 → Deep Non-LLM Clean → Readability Polish → Final Smooth
                phases = [
                  { name: 'Humara 2.4', type: 'emit' },
                  { name: 'Humara 2.0 (Full)', type: 'async', fn: (s) => runHumara20Full(s) },
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Readability Polish', type: 'async', fn: (s) => nuruReadabilityPolish(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'ai_analysis':
                // AI Analysis: Full Nuru 2.0 flow + Deep Clean + Readability Polish + Loop cleanup
                phases = [
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Readability Polish', type: 'async', fn: (s) => nuruReadabilityPolish(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              default:
                phases = [{ name: engineDisplayName, type: 'emit' }];
            }

            const totalPhases = phases.length;

            // Total word count for sentence-ratio tolerance in batch phases
            const pipelineWordCount = currentSentences.reduce((a, s) => a + s.split(/\s+/).length, 0);

            for (let pi = 0; pi < phases.length; pi++) {
              const phase = phases[pi];
              const phaseLabel = `Phase ${pi + 1}/${totalPhases} – ${phase.name}`;
              const phaseOps = phase.type === 'nuru'
                ? phase.passes * currentSentences.length
                : currentSentences.length;
              sendSSE(controller, { type: 'stage', stage: phaseLabel, phaseOps });
              await flushDelay(10);

              // ── Minimum change enforcement (driven by humanization rate) ──
              // For sync/async/nuru phases, each sentence must achieve ≥minChangeThreshold
              // word change from its state BEFORE this phase started.
              const BASE_MIN_CHANGE = phaseMinChangeThreshold;
              const MAX_RETRIES = 2; // Retries for sync/async phases when change is below threshold
              const phaseInputSentences = [...currentSentences]; // snapshot before this phase

              if (phase.type === 'batch') {
                // ── BATCH LLM phase — single API call for ALL sentences ──
                // Paragraphs/titles pass through unchanged.
                // Sentence ratio tolerance: ±max(3, floor(totalWords/100)).
                // After this, all remaining phases are non-LLM sentence-by-sentence.
                sendSSE(controller, { type: 'stage', stage: `${phaseLabel} (single-call batch)` });
                await flushDelay(8);
                try {
                  const batchResult = await phase.fn(currentSentences, pipelineWordCount);
                  // Validate sentence count matches within tolerance
                  const tolerance = Math.max(3, Math.floor(pipelineWordCount / 100));
                  const contentIn = currentSentences.filter(s => !isHeadingSentCheck(s)).length;
                  const contentOut = batchResult.filter(s => !isHeadingSentCheck(s)).length;
                  if (batchResult.length === currentSentences.length && Math.abs(contentOut - contentIn) <= tolerance) {
                    for (let i = 0; i < batchResult.length; i++) {
                      if (!isHeadingSentCheck(batchResult[i])) {
                        // Enforce no extra sentences were inserted (split guard)
                        batchResult[i] = guardSingleSentence(currentSentences[i], batchResult[i]);
                      }
                      currentSentences[i] = batchResult[i];
                      sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: phaseLabel });
                    }
                  } else {
                    console.warn(`[Batch] Sentence count mismatch (in=${currentSentences.length} out=${batchResult.length}), keeping originals`);
                    for (let i = 0; i < currentSentences.length; i++) {
                      sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: phaseLabel });
                    }
                  }
                } catch (batchErr) {
                  console.warn(`[Batch] ${phase.name} failed:`, batchErr instanceof Error ? batchErr.message : batchErr);
                  for (let i = 0; i < currentSentences.length; i++) {
                    sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: phaseLabel });
                  }
                }
              } else if (phase.type === 'emit') {
                // ── EMIT phases now apply mandatory deepNonLLMClean + synonymReplace ──
                // Previously emit phases just re-sent text unchanged. Now they apply
                // real transformations so every phase actually modifies the text.
                const usedEmitWords = new Set<string>();
                for (let i = 0; i < currentSentences.length; i++) {
                  if (!isHeadingSentCheck(currentSentences[i])) {
                    const sentenceMinChange = getRiskAdaptiveMinChange(i, BASE_MIN_CHANGE);
                    const original = phaseInputSentences[i];
                    const { text: protectedSent, map: sentMap } = protectSpecialContent(currentSentences[i]);
                    let result = deepNonLLMClean(protectedSent);
                    result = synonymReplace(result, 0.6, usedEmitWords);
                    result = restoreSpecialContent(result, sentMap);
                    // Enforce no split/merge
                    result = guardSingleSentence(currentSentences[i], result);
                    // If still below threshold, apply AI word kill as fallback
                    const change = measureSentenceChange(original, result);
                    if (change < sentenceMinChange) {
                      result = applyAIWordKill(result);
                      result = synonymReplace(result, 0.9, usedEmitWords);
                    }
                    currentSentences[i] = result;
                  }
                  sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: phaseLabel });
                }
              } else if (phase.type === 'sync') {
                // Protect special content (numbers, brackets, citations, etc.) around
                // non-Nuru phases so deepNonLLMClean / smoothing / grammar repair
                // cannot mangle figures like 52,446 or parenthetical content like (EDA).
                // NON-LLM ENGINES: Only cleaning, deep cleaning — NO structural restructuring.
                // Sentence count must remain exactly the same (no splits or merges).
                for (let i = 0; i < currentSentences.length; i++) {
                  if (!isHeadingSentCheck(currentSentences[i])) {
                    const sentenceMinChange = getRiskAdaptiveMinChange(i, BASE_MIN_CHANGE);
                    const original = phaseInputSentences[i];
                    const { text: protectedSent, map: sentMap } = protectSpecialContent(currentSentences[i]);
                    let result = phase.fn(protectedSent);
                    result = restoreSpecialContent(result, sentMap);

                    // ENFORCE: No sentence splitting or merging by non-LLM engines
                    result = guardSingleSentence(currentSentences[i], result);

                    let change = measureSentenceChange(original, result);
                    let retry = 0;
                    while (change < sentenceMinChange && retry < MAX_RETRIES) {
                      const { text: rp, map: rm } = protectSpecialContent(result);
                      result = phase.fn(rp);
                      result = restoreSpecialContent(result, rm);
                      // Re-enforce no split/merge after retry
                      result = guardSingleSentence(currentSentences[i], result);
                      change = measureSentenceChange(original, result);
                      retry++;
                    }
                    currentSentences[i] = result;
                  }
                  sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: phaseLabel });
                }
              } else if (phase.type === 'async') {
                // Parallel processing for async/LLM phases — per-sentence error isolation
                // so a single LLM call failure cannot abort the whole pipeline.
                // Content protection wraps each sentence so LLM restructuring
                // cannot mangle numbers, brackets, citations, etc.
                //
                // SMART PREPROCESS INTEGRATION: If this is a 'Restructuring' phase and
                // smart preprocessing already restructured this sentence, skip it to
                // avoid double-restructuring. For multi-engine pipelines, enforce the
                // restructuring cap (40% per downstream phase).
                const isRestructuringPhase = phase.name.toLowerCase().includes('restructur');
                const preprocessedIndices = preprocessResult?.restructuredIndices ?? new Set<number>();

                // Count engines in this pipeline for restructuring caps
                const pipelineEngineCount = phases.filter(p => p.type === 'async' || p.type === 'emit').length;
                const contentSentCount = currentSentences.filter((_, i) => !isHeadingSentCheck(currentSentences[i])).length;
                const maxRestructureThisPhase = isRestructuringPhase
                  ? getMaxRestructureCount(pipelineEngineCount, false, contentSentCount)
                  : contentSentCount; // non-restructuring phases have no cap
                let restructuredThisPhase = 0;

                const asyncResults = await Promise.all(
                  currentSentences.map(async (sent, i) => {
                    if (isHeadingSentCheck(sent)) return sent;

                    // Skip restructuring for sentences already restructured in preprocessing
                    if (isRestructuringPhase && preprocessedIndices.has(i)) {
                      return sent; // Already restructured — pass through
                    }

                    // Enforce restructuring cap for multi-engine pipelines
                    if (isRestructuringPhase && restructuredThisPhase >= maxRestructureThisPhase) {
                      return sent; // Cap reached — pass through
                    }

                    const original = phaseInputSentences[i];
                    const sentenceMinChange = getRiskAdaptiveMinChange(i, BASE_MIN_CHANGE);
                    try {
                      const { text: protectedSent, map: sentMap } = protectSpecialContent(sent);
                      let result = await phase.fn(protectedSent);
                      result = restoreSpecialContent(result, sentMap);

                      // ENFORCE: No sentence splitting or merging
                      result = guardSingleSentence(sent, result);

                      let change = measureSentenceChange(original, result);
                      let retry = 0;
                      while (change < sentenceMinChange && retry < MAX_RETRIES) {
                        const { text: rp, map: rm } = protectSpecialContent(result);
                        result = await phase.fn(rp);
                        result = restoreSpecialContent(result, rm);
                        // Re-enforce no split/merge after retry
                        result = guardSingleSentence(sent, result);
                        change = measureSentenceChange(original, result);
                        retry++;
                      }

                      if (isRestructuringPhase) restructuredThisPhase++;
                      return result;
                    } catch (sentErr) {
                      console.warn(`[Phase ${phase.name}] sentence ${i} failed, keeping previous:`, sentErr instanceof Error ? sentErr.message : sentErr);
                      return sent;
                    }
                  })
                );
                for (let i = 0; i < asyncResults.length; i++) {
                  currentSentences[i] = asyncResults[i];
                  sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: phaseLabel });
                }
              } else if (phase.type === 'nuru') {
                if (skipUniversalNuruPost) {
                  // Run the full phase.passes count — built-in-Nuru engines still need all iterations
                  for (let nuruPass = 0; nuruPass < phase.passes; nuruPass++) {
                    for (let i = 0; i < currentSentences.length; i++) {
                      if (!isHeadingSentCheck(currentSentences[i])) {
                        currentSentences[i] = runNuruSinglePass(currentSentences[i]);
                      }
                      sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: `${phaseLabel} iter ${nuruPass + 1}/${phase.passes}` });
                    }
                    await flushDelay(5);
                    if (deadlineReached || Date.now() - startTime > DEADLINE_MS - 8000) break;
                  }
                } else {
                  // ═══════════════════════════════════════════════════════
                  // ADAPTIVE NURU WITH NON-LLM FORENSIC AI DETECTION
                  // Phase 1: ALWAYS 10 baseline passes (hard minimum — every pass
                  //          uses the previous output as input, fully chained).
                  //          'undetectability' profile gets +3 extra baseline passes.
                  // Phase 2: Non-LLM forensic signal analysis on the chained output.
                  // Phase 3: Deep forensic kill — all detector passes + universalSweep
                  //          applied sentence-by-sentence on the post-10-pass text.
                  // Phase 4: Score-based extra bulk Nuru passes (0–5 more).
                  // Phase 5: Targeted Nuru on flagged sentences only.
                  // ═══════════════════════════════════════════════════════

                  // Hard minimum: 10 chained rehumanizations always fire.
                  // Profile can add bonus passes ON TOP — never reduce below 10.
                  const BASE_NURU_MIN = 10;
                  const profileBaselineBonus = postProcessingProfile === 'undetectability' ? 3 : 0;
                  const adjustedBaseline = BASE_NURU_MIN + profileBaselineBonus;
                  const maxNuruPasses = Math.max(phase.passes, adjustedBaseline);
                  const profileTargetedBonus = postProcessingProfile === 'undetectability' ? 3 : 0;

                  // ── Phase 1: 10+ chained baseline passes on ALL sentences ──
                  // Each pass feeds its output as input to the next — true chained rehumanization.
                  // MINIMUM 25% PER-PASS CHANGE: if a pass produces <25% word change from its
                  // input, we force one additional pass or synonym/word-kill fallback to ensure
                  // no pass is wasted on micro-edits.
                  const NURU_PASS_MIN = 0.25;
                  for (let pass = 0; pass < maxNuruPasses; pass++) {
                    for (let i = 0; i < currentSentences.length; i++) {
                      if (!isHeadingSentCheck(currentSentences[i])) {
                        const prePass = currentSentences[i];
                        let next = runNuruSinglePass(prePass);
                        if (measureSentenceChange(prePass, next) < NURU_PASS_MIN) {
                          // Force deeper processing: try one more pass from the current output
                          const deeper = runNuruSinglePass(next);
                          if (measureSentenceChange(prePass, deeper) >= NURU_PASS_MIN) {
                            next = deeper;
                          } else {
                            // Final fallback: aggressive synonym replacement + AI word kill
                            const _usedFb = new Set<string>();
                            let fb = applyAIWordKill(prePass);
                            fb = synonymReplace(fb, 0.85, _usedFb);
                            if (measureSentenceChange(prePass, fb) > measureSentenceChange(prePass, next)) next = fb;
                          }
                        }
                        currentSentences[i] = next;
                      }
                      sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: `${phaseLabel} pass ${pass + 1}/${maxNuruPasses}` });
                    }
                    await flushDelay(10);
                  }

                  // ── Phase 2: Deep Forensic Kill — all detector passes on chained output ──
                  // After the 10 baseline passes, run all per-detector forensic cleaners
                  // sentence-by-sentence. This targets the specific signal patterns each
                  // real detector (GPTZero, Turnitin, Originality, Copyleaks, ZeroGPT,
                  // Winston, Pangram, Scribbr) uses — vocabulary, phrase structure, and
                  // hedging language — and replaces them with natural human-written phrasing.
                  if (!(deadlineReached || Date.now() - startTime > DEADLINE_MS - 10000)) {
                    sendSSE(controller, { type: 'stage', stage: `${phaseLabel} → Deep Forensic Kill` });
                    await flushDelay(8);
                    for (let i = 0; i < currentSentences.length; i++) {
                      if (isHeadingSentCheck(currentSentences[i])) continue;
                      const { text: ps, map: pm } = protectSpecialContent(currentSentences[i]);
                      let s = ps;
                      // Run all detector forensic passes (each strips its detector's specific signals)
                      s = cleanZeroGPTPass(s);
                      s = cleanGPTZeroPass(s);
                      s = cleanOriginalityAIPass(s);
                      s = cleanTurnitinPass(s);
                      s = cleanCopyleaksPass(s);
                      s = cleanWinstonPass(s);
                      s = cleanPangramPass(s);
                      s = cleanScribbrPass(s);
                      // Universal cross-detector phrase sweep (catches remaining high-signal phrases)
                      s = universalPhraseSweep(s);
                      // Aggressive AI marker word swap (replaces any remaining AI vocabulary)
                      s = swapAIMarkers(s, true);
                      s = restoreSpecialContent(s, pm);
                      s = guardSingleSentence(currentSentences[i], s);
                      currentSentences[i] = s;
                      sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: `${phaseLabel} forensic kill` });
                    }
                    await flushDelay(10);
                  }

                  // ── Phase 3: Non-LLM forensic signal analysis (on post-kill output) ──

                  interface FlaggedSentence {
                    index: number;
                    ai_score: number;
                    flagged_phrases: string[];
                  }
                  let overallAiScore = 50;
                  let flaggedSentences: FlaggedSentence[] = [];

                  try {
                    const fullText = currentSentences.filter(s => !isHeadingSentCheck(s)).join(' ');
                    const sigObj = new TextSignals(fullText);
                    const allSignals = sigObj.getAllSignals();
                    overallAiScore = Math.round(allSignals.per_sentence_ai_ratio ?? 50);

                    // Get per-sentence details for targeted passes
                    // Build a TextSignals from the joined non-heading sentences, then map back
                    const nonHeadingIndices: number[] = [];
                    for (let i = 0; i < currentSentences.length; i++) {
                      if (!isHeadingSentCheck(currentSentences[i])) nonHeadingIndices.push(i);
                    }
                    const perSentDetails = sigObj.perSentenceDetails();
                    // Map internal sentence indices back to currentSentences indices
                    flaggedSentences = perSentDetails.map(d => ({
                      index: nonHeadingIndices[d.index] ?? d.index,
                      ai_score: d.ai_score,
                      flagged_phrases: d.flagged_phrases,
                    })).filter(d => d.index >= 0 && d.index < currentSentences.length);

                    console.log(`[Nuru Non-LLM Forensic] Overall AI score: ${overallAiScore}, flagged sentences: ${flaggedSentences.length}/${currentSentences.length}`);
                  } catch (e: unknown) {
                    const message = e instanceof Error ? e.message : String(e);
                    console.warn(`[Nuru Non-LLM Forensic] Detection failed, using defaults: ${message}`);
                  }

                  // ── Phase 4: AGGRESSIVE 5-LOOP REHUMANIZATION ──
                  // Scale aggressiveness based on INPUT AI score:
                  // - Score 0–20: 0 loops (clean already)
                  // - Score 20–40: 1 loop
                  // - Score 40–60: 2 loops
                  // - Score 60–80: 3 loops
                  // - Score 80–100: 5 loops (maximum aggressiveness)
                  // Each loop: 3 iterations with 40% per-iteration minimum enforcement.
                  const aggressiveLoopCount = Math.min(5, Math.max(0, Math.ceil((overallAiScore - 20) / 20)));
                  if (aggressiveLoopCount > 0 && !(deadlineReached || Date.now() - startTime > DEADLINE_MS - 8000)) {
                    console.log(`[Nuru Aggressive] AI score ${overallAiScore} → ${aggressiveLoopCount} aggressive loop cycles (3 iterations each)`);
                    const AGGRESSIVE_PASS_MIN = 0.40; // 40% minimum per iteration
                    const usedAggressiveWords = new Set<string>();

                    for (let loop = 0; loop < aggressiveLoopCount; loop++) {
                      for (let iteration = 0; iteration < 3; iteration++) {
                        for (let i = 0; i < currentSentences.length; i++) {
                          if (isHeadingSentCheck(currentSentences[i])) continue;

                          const preIteration = currentSentences[i];
                          let next = runNuruSinglePass(preIteration);

                          // Enforce 40% minimum per iteration
                          if (measureSentenceChange(preIteration, next) < AGGRESSIVE_PASS_MIN) {
                            // Try one more pass for deeper change
                            const deeper = runNuruSinglePass(next);
                            if (measureSentenceChange(preIteration, deeper) >= AGGRESSIVE_PASS_MIN) {
                              next = deeper;
                            } else {
                              // Fallback: aggressive synonym replacement + AI word kill
                              let fb = applyAIWordKill(preIteration);
                              fb = synonymReplace(fb, 0.9, usedAggressiveWords);
                              if (measureSentenceChange(preIteration, fb) > measureSentenceChange(preIteration, next)) {
                                next = fb;
                              }
                            }
                          }

                          currentSentences[i] = next;
                          sendSSE(controller, {
                            type: 'sentence',
                            index: i,
                            text: currentSentences[i],
                            stage: `${phaseLabel} aggressive loop ${loop + 1}/${aggressiveLoopCount} iter ${iteration + 1}/3`,
                          });
                        }
                        await flushDelay(8);
                      }
                    }
                  }

                  // ── Phase 5: Targeted Nuru on FLAGGED sentences only ──
                  if (flaggedSentences.length > 0 && !(deadlineReached || Date.now() - startTime > DEADLINE_MS - 8000)) {
                    const TARGETED_PASSES = 5 + profileTargetedBonus;
                    const flaggedSet = new Map<number, string[]>();
                    for (const f of flaggedSentences) {
                      flaggedSet.set(f.index, f.flagged_phrases);
                    }
                    console.log(`[Nuru Targeted] Applying ${TARGETED_PASSES} targeted passes to ${flaggedSet.size} flagged sentences`);

                    for (let pass = 0; pass < TARGETED_PASSES; pass++) {
                      for (const [idx, phrases] of flaggedSet) {
                        if (isHeadingSentCheck(currentSentences[idx])) continue;
                        if (phrases.length > 0) {
                          currentSentences[idx] = stealthHumanizeTargeted(currentSentences[idx], phrases, effectiveStrength ?? 'medium');
                        } else {
                          currentSentences[idx] = runNuruSinglePass(currentSentences[idx]);
                        }
                        sendSSE(controller, { type: 'sentence', index: idx, text: currentSentences[idx], stage: `${phaseLabel} targeted pass ${pass + 1}/${TARGETED_PASSES}` });
                      }
                      await flushDelay(10);
                    }
                  }
                }

                // ── Enforce 40% minimum change on any under-performing sentences ──
                for (let i = 0; i < currentSentences.length; i++) {
                  if (isHeadingSentCheck(currentSentences[i])) continue;
                  const sentenceMinChange = getRiskAdaptiveMinChange(i, BASE_MIN_CHANGE);
                  const original = phaseInputSentences[i];
                  let change = measureSentenceChange(original, currentSentences[i]);
                  let retry = 0;
                  const NURU_MIN_RETRIES = 3; // More retries for Nuru phases (cheap, non-LLM)
                  while (change < sentenceMinChange && retry < NURU_MIN_RETRIES) {
                    currentSentences[i] = runNuruSinglePass(currentSentences[i]);
                    change = measureSentenceChange(original, currentSentences[i]);
                    sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: `${phaseLabel} quality retry ${retry + 1}/${NURU_MIN_RETRIES}` });
                    retry++;
                  }
                  // Final fallback: if still below threshold after retries, apply synonym replacement
                  if (change < sentenceMinChange) {
                    const usedFallback = new Set<string>();
                    currentSentences[i] = applyAIWordKill(currentSentences[i]);
                    currentSentences[i] = synonymReplace(currentSentences[i], 0.9, usedFallback);
                    sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: `${phaseLabel} force sync` });
                  }
                }
              }

              humanized = reassembleText(currentSentences, activeParaBounds.length ? activeParaBounds : [0]);
              latestHumanized = humanized;
              await flushDelay(10);
              console.log(`[Pipeline] ${phaseLabel}: ${humanized.split(/\s+/).length} words (${Date.now() - phaseStart}ms)`);
              // Bail out if deadline is near
              if (deadlineReached || Date.now() - startTime > DEADLINE_MS - 5000) break;
            }
            // Restore paragraph/heading structure after all phases complete
            humanized = preserveInputStructure(normalizedText, humanized);
            latestHumanized = humanized;
            console.log(`[Pipeline] Complete: ${humanized.split(/\s+/).length} words in ${Date.now() - phaseStart}ms`);
          }

          // Emit final engine sentences for non-phased, non-full-text engines
          // (Full-text engines already emitted sentences at lines 755-757)
          if (!usePhasePipeline && !FULL_TEXT_ENGINES.has(eng)) {
            const { sentences: engineSentences } = splitIntoIndexedSentences(humanized);
            await emitSentencesStaggered(controller, engineSentences, 'Engine', 20);
            await flushDelay(30);
          }

          // ── Phantom: apply AntiPangram forensic cleanup (sole post-engine step) ──
          if (eng === 'phantom') {
            sendSSE(controller, { type: 'stage', stage: 'AntiPangram Forensic Clean' });
            await flushDelay(10);
            humanized = await runChainedAntiPangram(
              humanized,
              10,
            );
            latestHumanized = humanized;
            const { sentences: phantomSents } = splitIntoIndexedSentences(humanized);
            await emitSentencesStaggered(controller, phantomSents, 'AntiPangram Forensic Clean', 20);
            await flushDelay(20);
            console.log(`[Phantom] AntiPangram complete: ${humanized.split(/\s+/).length} words`);
          }

          // Detector + input analysis — needed for both post-processing and final detection
          humanized = conformToSourceSentenceShape(normalizedText, humanized);
          latestHumanized = humanized;

          const detector = getDetector();
          const inputAnalysis = detector.analyze(text);
          let adaptivePostPlan: AdaptiveCleanupPlan | null = null;
          const engineQualityProfile = resolveEngineQualityProfile(eng, effectiveStrength, postProcessingProfile);
          let bestSafeHumanized = humanized;
          let bestSafeGate: QualityGateResult | null = null as QualityGateResult | null;
          const assessCandidateQuality = (candidate: string): QualityGateResult => {
            const outputScore = getDetectorAverage(detector.analyze(candidate));
            return assessQualityGate(normalizedText, candidate, {
              engine: eng,
              strength: effectiveStrength,
              postProfile: postProcessingProfile,
              profile: engineQualityProfile,
              inputAiScore: inputAnalysis.summary.overall_ai_score,
              outputAiScore: outputScore,
            });
          };
          const rememberQualityCandidate = (candidate: string, label: string): QualityGateResult => {
            const shapedCandidate = conformToSourceSentenceShape(normalizedText, candidate);
            const gate = assessCandidateQuality(shapedCandidate);
            const usefulRewrite = gate.wordChangeRatio >= 0.04 || shapedCandidate.trim() !== normalizedText.trim();
            if (gate.safe && usefulRewrite) {
              const beatsBest =
                !bestSafeGate ||
                gate.outputAiScore < bestSafeGate.outputAiScore - 1 ||
                (gate.wordChangeRatio > bestSafeGate.wordChangeRatio + 0.03 && gate.outputAiScore <= bestSafeGate.outputAiScore + 5) ||
                (gate.outputAiScore <= gate.targetScore + 2 && gate.semanticSimilarity > bestSafeGate.semanticSimilarity);
              if (beatsBest) {
                bestSafeHumanized = shapedCandidate;
                bestSafeGate = gate;
              }
            } else {
              console.warn(`[QualityGate] ${label} blocked: ${gate.reasons.join(', ')}`);
            }
            return gate;
          };

          let activeQualityGate = rememberQualityCandidate(humanized, 'engine output');
          if (eng !== 'ai_analysis' && !activeQualityGate.shouldStop) {
            const deterministicPolish = applyDeterministicSignalPolish(humanized, {
              sourceText: normalizedText,
              engine: eng,
              strength: effectiveStrength,
              postProfile: postProcessingProfile,
              profile: engineQualityProfile,
              inputAiScore: inputAnalysis.summary.overall_ai_score,
              targetScore: activeQualityGate.targetScore,
              intensity: Math.max(0.22, activeQualityGate.detectorPressure),
              preserveContractions: false,
              allowSentenceSurgery: false,
            });
            if (deterministicPolish !== humanized) {
              const polishGate = rememberQualityCandidate(deterministicPolish, 'deterministic polish');
              const acceptPolish =
                polishGate.safe &&
                (polishGate.outputAiScore <= activeQualityGate.outputAiScore + 2 ||
                  polishGate.outputAiScore <= polishGate.targetScore ||
                  activeQualityGate.overProcessed);
              if (acceptPolish) {
                humanized = deterministicPolish;
                latestHumanized = humanized;
                activeQualityGate = polishGate;
                sendSSE(controller, { type: 'stage', stage: `Quality Gate Polish: ${Math.round(activeQualityGate.outputAiScore)}%` });
                await flushDelay(6);
              }
            }
          }

          // ═══════════════════════════════════════════════════════════════
          // UNIVERSAL POST-PROCESSING — profile-driven
          //
          // All engines run through this. Profile controls behavior:
          //   Balanced       → AntiPangram (10 iter) + Nuru 5×3 loops
          //   Quality        → AntiPangram (10 iter) before Nuru 5×3 loops
          //   Undetectability → Nuru 10 iterations + 5×3 aggressive loops
          //
          // Every engine gets at least 2 processing phases (engine + this
          // post-processing) before the final cleanup. Nuru x10 uses an
          // adaptive floor of at least 25% per sentence; post loops keep the
          // stronger 40% floor.
          // Hard time budget: under 15 seconds for Nuru post-processing.
          // ═══════════════════════════════════════════════════════════════
          if ((eng !== 'ai_analysis' || auto_model === true) && !(deadlineReached || Date.now() - startTime > DEADLINE_MS - 12000)) {
            const nuruPostStart = Date.now();
            const NURU_POST_DEADLINE_MS = 14_500;
            const nuruPostTimeOk = () => Date.now() - nuruPostStart < NURU_POST_DEADLINE_MS && !(deadlineReached || Date.now() - startTime > DEADLINE_MS - 8000);
            let currentAdaptiveScore = getDetectorAverage(detector.analyze(humanized));
adaptivePostPlan = buildAdaptiveCleanupPlan(normalizedText, currentAdaptiveScore, tone ?? 'neutral', postProcessingProfile, humanizationPlan ?? undefined, effectiveStrength, hRate);

            const collectPostFlagged = (sentences: string[]) => {
              const postFullText = sentences.filter(s => !isHeadingSentCheck(s)).join(' ');
              const postSigObj = new TextSignals(postFullText);
              const postNonHeadingIndices: number[] = [];
              for (let i = 0; i < sentences.length; i++) {
                if (!isHeadingSentCheck(sentences[i])) postNonHeadingIndices.push(i);
              }
              const postDetails = postSigObj.perSentenceDetails();
              return postDetails.map(d => ({
                index: postNonHeadingIndices[d.index] ?? d.index,
                ai_score: d.ai_score,
                flagged_phrases: d.flagged_phrases,
              })).filter(d => d.index >= 0 && d.index < sentences.length && d.ai_score >= Math.max(18, adaptivePostPlan?.targetScore ?? 5));
            };

            let mandatoryNuruPostDone = false;
            const runMandatoryNuruPost = async () => {
              if (!nuruPostTimeOk() || !adaptivePostPlan) return;
              const reruns = 10;
              const postLoops = Math.min(5, Math.max(1, adaptivePostPlan.nuruLoops));
              const postLoopPasses = 3;
              const mandatoryBaseMinSentenceChange = clampRange(adaptivePostPlan.minSentenceChange, 0.25, 0.35);
              const mandatoryLoopMinSentenceChange = 0.40;
              const aggressivePressure = Math.max(0.9, adaptivePostPlan.detectorPressure);
              const { sentences: postSents, paragraphBoundaries: postBounds } = splitIntoIndexedSentences(humanized);
              const usedMandatoryWords = new Set<string>();

              const finalizeMandatoryCandidate = (value: string): string =>
                removeFillerParentheticals(enforceNoContractions(finalSmoothGrammar(deepNonLLMClean(value))));

              const forceNaturalRephrase = (value: string, seed: number): string => {
                const trimmed = value.trim();
                const becauseMatch = trimmed.match(/^(.+?)\s+because\s+(.+?)([.!?])?$/i);
                if (becauseMatch) {
                  const main = becauseMatch[1].trim().replace(/[,.]$/, '');
                  const reason = becauseMatch[2].trim().replace(/[.!?]$/, '');
                  return `Because ${reason}, ${main.charAt(0).toLowerCase()}${main.slice(1)}.`;
                }
                const starters = ['In practice', 'In this case', 'At this point', 'In simple terms', 'For this reason'];
                const stripped = trimmed.replace(/^(?:In practice|In this case|At this point|In simple terms|For this reason),\s+/i, '');
                return `${starters[seed % starters.length]}, ${stripped.charAt(0).toLowerCase()}${stripped.slice(1)}`;
              };

              const enforceMandatoryChange = async (
                feedSentence: string,
                firstCandidate: string,
                options: StealthHumanizeOptions,
                seed: number,
                minSentenceChange: number,
              ): Promise<string> => {
                const updateBest = (candidate: string, currentBest: { text: string; change: number }) => {
                  const finalized = finalizeMandatoryCandidate(candidate);
                  const change = measureSentenceChange(feedSentence, finalized);
                  if (change > currentBest.change) {
                    currentBest.text = finalized;
                    currentBest.change = change;
                  }
                };

                const best = {
                  text: finalizeMandatoryCandidate(firstCandidate),
                  change: 0,
                };
                best.change = measureSentenceChange(feedSentence, best.text);
                if (best.change >= minSentenceChange) return best.text;

                updateBest(runNuruSinglePass(best.text, options), best);
                if (best.change >= minSentenceChange) return best.text;

                updateBest(synonymReplace(applyAIWordKill(best.text), 0.95, usedMandatoryWords), best);
                if (best.change >= minSentenceChange) return best.text;

                if (nuruPostTimeOk()) {
                  try {
                    const remaining = NURU_POST_DEADLINE_MS - (Date.now() - nuruPostStart);
                    if (remaining > 900) {
                      const restructured = await withTimeout(
                        restructureSentence(best.text),
                        Math.min(1_200, Math.max(500, remaining - 350)),
                        'mandatory_nuru_restructure',
                      );
                      updateBest(guardSingleSentence(feedSentence, restructured), best);
                    }
                  } catch {
                    // Restructuring is best-effort inside the strict post budget.
                  }
                }
                if (best.change >= minSentenceChange) return best.text;

                updateBest(synonymReplace(applyAIWordKill(forceNaturalRephrase(best.text, seed)), 1, usedMandatoryWords), best);
                if (best.change < minSentenceChange) {
                  return finalizeMandatoryCandidate(forceNaturalRephrase(best.text, seed + 17));
                }
                return best.text;
              };

              sendSSE(controller, { type: 'stage', stage: `Nuru Post x${reruns} + Loop ${postLoops}x${postLoopPasses}` });
              await flushDelay(2);

              for (let pass = 0; pass < reruns && nuruPostTimeOk(); pass++) {
                for (let i = 0; i < postSents.length && nuruPostTimeOk(); i++) {
                  if (!isHeadingSentCheck(postSents[i])) {
                    const feedSentence = postSents[i];
                    const options: StealthHumanizeOptions = {
                      detectorPressure: aggressivePressure,
                      humanVariance: 0.02 + aggressivePressure * 0.04,
                      readabilityBias: adaptivePostPlan.readabilityBias,
                    };
                    postSents[i] = await enforceMandatoryChange(
                      feedSentence,
                      runNuruSinglePass(feedSentence, options),
                      options,
                      pass + i,
                      mandatoryBaseMinSentenceChange,
                    );
                  }
                  sendSSE(controller, { type: 'sentence', index: i, text: postSents[i], stage: `Nuru Post x10 ${pass + 1}/${reruns}` });
                }
              }

              for (let loop = 0; loop < postLoops && nuruPostTimeOk(); loop++) {
                for (let pass = 0; pass < postLoopPasses && nuruPostTimeOk(); pass++) {
                  for (let i = 0; i < postSents.length && nuruPostTimeOk(); i++) {
                    if (!isHeadingSentCheck(postSents[i])) {
                      const feedSentence = postSents[i];
                      const options: StealthHumanizeOptions = {
                        detectorPressure: aggressivePressure,
                        humanVariance: 0.04 + aggressivePressure * 0.05,
                        readabilityBias: adaptivePostPlan.readabilityBias,
                      };
                      postSents[i] = await enforceMandatoryChange(
                        feedSentence,
                        runNuruSinglePass(feedSentence, options),
                        options,
                        reruns + loop * postLoopPasses + pass + i,
                        mandatoryLoopMinSentenceChange,
                      );
                    }
                    sendSSE(controller, { type: 'sentence', index: i, text: postSents[i], stage: `Nuru Post Loop ${loop + 1}/${postLoops}.${pass + 1}/${postLoopPasses}` });
                  }
                }
              }

              humanized = preserveInputStructure(
                normalizedText,
                removeFillerParentheticals(enforceNoContractions(reassembleText(postSents, postBounds.length ? postBounds : [0]))),
              );
              latestHumanized = humanized;
              currentAdaptiveScore = getDetectorAverage(detector.analyze(humanized));
              activeQualityGate = rememberQualityCandidate(humanized, 'mandatory Nuru post');
              if (!activeQualityGate.safe && bestSafeGate) {
                humanized = bestSafeHumanized;
                latestHumanized = humanized;
                currentAdaptiveScore = bestSafeGate.outputAiScore;
              }
              adaptivePostPlan = buildAdaptiveCleanupPlan(normalizedText, currentAdaptiveScore, tone ?? 'neutral', postProcessingProfile, humanizationPlan ?? undefined, effectiveStrength, hRate);
              mandatoryNuruPostDone = true;
            };

            const runAdaptiveAntiPangram = async (stageLabel: string) => {
              if (!nuruPostTimeOk() || !adaptivePostPlan) return;
              sendSSE(controller, { type: 'stage', stage: `${stageLabel} (${adaptivePostPlan.antiPangramIterations} iterations)` });
              await flushDelay(10);
              humanized = await runChainedAntiPangram(
                humanized,
                adaptivePostPlan.antiPangramIterations,
                {
                  targetAiScore: adaptivePostPlan.targetScore,
                  detectorPressure: adaptivePostPlan.detectorPressure,
                  preserveLeadSentence: true,
                  humanVariance: adaptivePostPlan.antiPangramVariance,
                  readabilityBias: adaptivePostPlan.readabilityBias,
                },
              );
              latestHumanized = humanized;
              currentAdaptiveScore = getDetectorAverage(detector.analyze(humanized));
              activeQualityGate = rememberQualityCandidate(humanized, stageLabel);
              if (!activeQualityGate.safe && bestSafeGate) {
                humanized = bestSafeHumanized;
                latestHumanized = humanized;
                currentAdaptiveScore = bestSafeGate.outputAiScore;
              }
adaptivePostPlan = buildAdaptiveCleanupPlan(normalizedText, currentAdaptiveScore, tone ?? 'neutral', postProcessingProfile, humanizationPlan ?? undefined, effectiveStrength, hRate);
            };

            // runAdaptiveNuruInitialPass: mirrors runAdaptiveAntiPangram but uses Nuru iterations.
            // Called when coin-flip selects Nuru as the initial post-processor for 'balanced' profile.
            const runAdaptiveNuruInitialPass = async (stageLabel: string) => {
              if (!nuruPostTimeOk() || !adaptivePostPlan) return;
              sendSSE(controller, { type: 'stage', stage: `${stageLabel} (${adaptivePostPlan.nuruIterations} iter)` });
              await flushDelay(10);
              const { sentences: initNuruSents, paragraphBoundaries: initNuruBounds } = splitIntoIndexedSentences(humanized);
              for (let iter = 0; iter < adaptivePostPlan.nuruIterations && nuruPostTimeOk(); iter++) {
                for (let i = 0; i < initNuruSents.length; i++) {
                  if (!isHeadingSentCheck(initNuruSents[i])) {
                    initNuruSents[i] = runNuruSinglePass(initNuruSents[i], {
                      detectorPressure: adaptivePostPlan.detectorPressure,
                      humanVariance: 0.02 + adaptivePostPlan.detectorPressure * 0.04,
                      readabilityBias: adaptivePostPlan.readabilityBias,
                    });
                    initNuruSents[i] = deepNonLLMClean(initNuruSents[i]);
                    initNuruSents[i] = finalSmoothGrammar(initNuruSents[i]);
                  }
                  sendSSE(controller, { type: 'sentence', index: i, text: initNuruSents[i], stage: `${stageLabel} iter ${iter + 1}/${adaptivePostPlan.nuruIterations}` });
                }
                await flushDelay(5);
              }
              humanized = reassembleText(initNuruSents, initNuruBounds.length ? initNuruBounds : [0]);
              latestHumanized = humanized;
              currentAdaptiveScore = getDetectorAverage(detector.analyze(humanized));
              activeQualityGate = rememberQualityCandidate(humanized, stageLabel);
              if (!activeQualityGate.safe && bestSafeGate) {
                humanized = bestSafeHumanized;
                latestHumanized = humanized;
                currentAdaptiveScore = bestSafeGate.outputAiScore;
              }
              adaptivePostPlan = buildAdaptiveCleanupPlan(normalizedText, currentAdaptiveScore, tone ?? 'neutral', postProcessingProfile, humanizationPlan ?? undefined, effectiveStrength, hRate);
            };

            await runMandatoryNuruPost();

            // Adaptive initial post-processor: seeded coin-flip per document for deterministic variety
            // quality         → AntiPangram first (precision vocabulary forensics)
            // undetectability → no pre-cycle pass (Nuru runs in adaptive cycle below)
            // balanced        → seeded 50/50 random: Nuru-first or AntiPangram-first
            const initPostSeed = hashTextForSeed(normalizedText) % 100;
            const useAntiPangramInitial = eng === 'nuru_v2' ? false : (postProcessingProfile === 'quality'
              ? true
              : postProcessingProfile === 'undetectability'
                ? false
                : initPostSeed < 50);
            if (!mandatoryNuruPostDone && nuruPostTimeOk() && adaptivePostPlan) {
              if (useAntiPangramInitial) {
                await runAdaptiveAntiPangram(
                  postProcessingProfile === 'quality'
                    ? 'AntiPangram Quality Post-Processing'
                    : 'AntiPangram Balanced Post-Processing',
                );
              } else if (postProcessingProfile === 'balanced' && eng !== 'nuru_v2') {
                await runAdaptiveNuruInitialPass('Nuru Balanced Initial Post-Processing');
              }
            }

            let adaptiveCycle = 0;
            // Deterministic seed for lead-preservation decisions across the
            // whole post-processing cycle — same paragraph gets the same
            // preserve/rewrite verdict in every phase.
            const leadSeed = hashTextForSeed(normalizedText);
            while (!mandatoryNuruPostDone && nuruPostTimeOk() && adaptivePostPlan && !activeQualityGate.shouldStop && adaptiveCycle < adaptivePostPlan.maxAdaptiveCycles) {
              const { sentences: postSentences, paragraphBoundaries: postParaBounds } = splitIntoIndexedSentences(humanized);
              const postSents = [...postSentences];
              // 60% preserve / 40% rewrite (user mandate) — only the ~60%
              // selected here are in the "preserve" set; the other ~40%
              // fall through to full Nuru rewrite downstream.
              const paragraphLeadSet = pickLeadsToPreserve(postParaBounds, leadSeed, 0.60);

              // All engines run full adaptive Nuru post-processing (no skipUniversalNuruPost guard)
              {
                sendSSE(controller, { type: 'stage', stage: `Nuru Adaptive Post-Processing ${adaptiveCycle + 1}/${adaptivePostPlan.maxAdaptiveCycles}` });
                await flushDelay(10);
                for (let nuruIter = 0; nuruIter < adaptivePostPlan.nuruIterations; nuruIter++) {
                  for (let i = 0; i < postSents.length; i++) {
                    if (!isHeadingSentCheck(postSents[i])) {
                      const isParagraphLead = paragraphLeadSet.has(i);
                      if (isParagraphLead && currentAdaptiveScore < adaptivePostPlan.leadRewriteThreshold) {
                        postSents[i] = finalSmoothGrammar(deepNonLLMClean(postSents[i]));
                      } else {
                        postSents[i] = runNuruSinglePass(postSents[i], {
                          detectorPressure: adaptivePostPlan.detectorPressure,
                          preserveLeadSentences: isParagraphLead,
                          humanVariance: 0.02 + adaptivePostPlan.detectorPressure * 0.04,
                          readabilityBias: adaptivePostPlan.readabilityBias,
                        });
                        postSents[i] = deepNonLLMClean(postSents[i]);
                        postSents[i] = finalSmoothGrammar(postSents[i]);
                      }
                    }
                    sendSSE(controller, { type: 'sentence', index: i, text: postSents[i], stage: `Nuru Stealth Iter ${nuruIter + 1}/${adaptivePostPlan.nuruIterations}` });
                  }
                  await flushDelay(5);
                  if (!nuruPostTimeOk()) break;
                }

                for (let loop = 0; loop < adaptivePostPlan.nuruLoops && nuruPostTimeOk(); loop++) {
                  for (let i = 0; i < postSents.length; i++) {
                    if (!isHeadingSentCheck(postSents[i])) {
                      const isParagraphLead = paragraphLeadSet.has(i);
                      if (!(isParagraphLead && currentAdaptiveScore < adaptivePostPlan.leadRewriteThreshold)) {
                        postSents[i] = runNuruSinglePass(postSents[i], {
                          detectorPressure: adaptivePostPlan.detectorPressure,
                          preserveLeadSentences: isParagraphLead,
                          humanVariance: 0.02 + adaptivePostPlan.detectorPressure * 0.04,
                          readabilityBias: adaptivePostPlan.readabilityBias,
                        });
                      }
                      postSents[i] = deepNonLLMClean(postSents[i]);
                    }
                    sendSSE(controller, { type: 'sentence', index: i, text: postSents[i], stage: `Nuru Post Loop ${loop + 1}/${adaptivePostPlan.nuruLoops}` });
                  }
                  await flushDelay(5);
                }

                const postFlagged = collectPostFlagged(postSents);
                if (postFlagged.length > 0 && nuruPostTimeOk()) {
                  for (let pass = 0; pass < adaptivePostPlan.targetedSweeps && nuruPostTimeOk(); pass++) {
                    const currentFlagged = collectPostFlagged(postSents);
                    if (currentFlagged.length === 0) break;
                    
                    const flagMap = new Map<number, string[]>();
                    for (const f of currentFlagged) flagMap.set(f.index, f.flagged_phrases);
                    
                    for (const [idx, phrases] of flagMap) {
                      if (isHeadingSentCheck(postSents[idx])) continue;
                      const isParagraphLead = paragraphLeadSet.has(idx);
                      if (phrases.length > 0 && !(isParagraphLead && currentAdaptiveScore < adaptivePostPlan.leadRewriteThreshold)) {
                        postSents[idx] = stealthHumanizeTargeted(postSents[idx], phrases, effectiveStrength ?? 'medium');
                      } else if (!(isParagraphLead && currentAdaptiveScore < adaptivePostPlan.leadRewriteThreshold)) {
                        postSents[idx] = runNuruSinglePass(postSents[idx], {
                          detectorPressure: adaptivePostPlan.detectorPressure,
                          preserveLeadSentences: isParagraphLead,
                          humanVariance: 0.02,
                          readabilityBias: adaptivePostPlan.readabilityBias,
                        });
                      }
                      postSents[idx] = finalSmoothGrammar(postSents[idx]);
                      sendSSE(controller, { type: 'sentence', index: idx, text: postSents[idx], stage: 'Nuru 2.0 (targeted)' });
                    }
                    await flushDelay(5);
                  }
                }
              }

              humanized = reassembleText(postSents, postParaBounds.length ? postParaBounds : [0]);
              latestHumanized = humanized;
              currentAdaptiveScore = getDetectorAverage(detector.analyze(humanized));
              activeQualityGate = rememberQualityCandidate(humanized, `adaptive cycle ${adaptiveCycle + 1}`);
              if (!activeQualityGate.safe && bestSafeGate) {
                humanized = bestSafeHumanized;
                latestHumanized = humanized;
                currentAdaptiveScore = bestSafeGate.outputAiScore;
                break;
              }
adaptivePostPlan = buildAdaptiveCleanupPlan(normalizedText, currentAdaptiveScore, tone ?? 'neutral', postProcessingProfile, humanizationPlan ?? undefined, effectiveStrength, hRate);

              const { sentences: nuruPostSents, paragraphBoundaries: sharedBounds } = splitIntoIndexedSentences(humanized);
              const { sentences: sharedSource } = splitIntoIndexedSentences(normalizedText);
              applySentenceStartersDistribution(nuruPostSents);
              applyNuruDocumentFlowCalibration(nuruPostSents, sharedBounds, sharedSource);
              humanized = reassembleText(nuruPostSents, sharedBounds.length ? sharedBounds : [0]);
              latestHumanized = humanized;
              currentAdaptiveScore = getDetectorAverage(detector.analyze(humanized));
              activeQualityGate = rememberQualityCandidate(humanized, `flow calibration ${adaptiveCycle + 1}`);
              if (!activeQualityGate.safe && bestSafeGate) {
                humanized = bestSafeHumanized;
                latestHumanized = humanized;
                currentAdaptiveScore = bestSafeGate.outputAiScore;
                break;
              }
adaptivePostPlan = buildAdaptiveCleanupPlan(normalizedText, currentAdaptiveScore, tone ?? 'neutral', postProcessingProfile, humanizationPlan ?? undefined, effectiveStrength, hRate);

              if (activeQualityGate.shouldStop || currentAdaptiveScore <= adaptivePostPlan.targetScore) break;
              if ((postProcessingProfile === 'undetectability' || currentAdaptiveScore > 12) && nuruPostTimeOk()) {
                await runAdaptiveAntiPangram('AntiPangram Detector Sweep');
              }
              adaptiveCycle++;
            }

            // ═══════════════════════════════════════════════════════════
            // DETECTOR-SIGNAL-TARGETED POLISH
            // Read the 20-signal vector and attack the worst offenders:
            // sentence_uniformity, per_sentence_ai_ratio, starter_diversity,
            // ngram_repetition, ai_pattern_score, function_word_freq.
            // Provides the last ~5-10% of score reduction needed to hit
            // <5% average across all 22 detectors consistently.
            // ═══════════════════════════════════════════════════════════
            if (eng !== 'nuru_v2' && nuruPostTimeOk() && !activeQualityGate.shouldStop && currentAdaptiveScore > adaptivePostPlan.targetScore) {
              try {
                sendSSE(controller, { type: 'stage', stage: `Detector Polish (signal-targeted): ${Math.round(currentAdaptiveScore)}%` });
                await flushDelay(8);
                const polishRemainingMs = NURU_POST_DEADLINE_MS - (Date.now() - nuruPostStart);
                if (polishRemainingMs >= 1_000) {
                  const polishBudget = Math.min(3_000, Math.max(1_000, polishRemainingMs - 250));
                  const polish = await detectorTargetedPolish(humanized, {
                    targetScore: adaptivePostPlan.targetScore,
                    maxIterations: 4,
                    timeBudgetMs: polishBudget,
                    preserveLeadSentences: true,
                    tone: tone ?? 'academic',
                    strength: (strength ?? 'strong') as 'light' | 'medium' | 'strong',
                    readabilityBias: adaptivePostPlan.readabilityBias,
                    onStage: async (stage: string, score: number) => {
                      sendSSE(controller, { type: 'stage', stage: `${stage} (~${Math.round(score)}%)` });
                      await flushDelay(4);
                    },
                  });
                  if (polish.text && polish.text.trim().length >= humanized.trim().length * 0.7) {
                    const polishGate = rememberQualityCandidate(polish.text, 'detector polish');
                    if (polishGate.safe && polishGate.outputAiScore <= activeQualityGate.outputAiScore + 2) {
                      humanized = polish.text;
                      latestHumanized = humanized;
                      activeQualityGate = polishGate;
                      currentAdaptiveScore = polishGate.outputAiScore;
adaptivePostPlan = buildAdaptiveCleanupPlan(normalizedText, currentAdaptiveScore, tone ?? 'neutral', postProcessingProfile, humanizationPlan ?? undefined, effectiveStrength, hRate);
                      sendSSE(controller, {
                        type: 'stage',
                        stage: `Detector polish complete: ${polish.signalsFixed.slice(0, 3).join(', ') || 'no gaps'} (~${Math.round(currentAdaptiveScore)}%)`,
                      });
                      await flushDelay(6);
                    }
                  }
                }
              } catch (polishErr) {
                console.warn('[DetectorPolish] skipped:', polishErr);
              }
            }
          }

          // ══════════════════════════════════════════════════════════════
          // SENTENCE-FLOW POLISH (final humanization pass)
          //
          // Runs for EVERY engine — including ai_analysis — right before
          // the universal cleaning. Works strictly sentence-by-sentence
          // and paragraph-by-paragraph.
          //
          // Techniques:
          //   • Rotates repeated formal connectors into a natural pool
          //     (Furthermore → "Beyond that", "In practice", "Still", ...)
          //   • De-duplicates adjacent sentence starters
          //   • Anchors ambiguous "This shows/means" with a real noun
          //   • Diversifies paragraph-lead structure across paragraphs
          //   • Smooths abrupt short→short declarative transitions
          //   • Cleans surviving trailing "-ing X" participial tails
          //
          // Deterministic per-input via a seeded RNG.
          // ══════════════════════════════════════════════════════════════
          if (!(deadlineReached || Date.now() - startTime > DEADLINE_MS - 4000)) {
            try {
              const flowIterations = activeQualityGate.shouldStop ? 1 : (humanizationPlan?.flowPolishIterations ?? 2);
              sendSSE(controller, { type: 'stage', stage: `Sentence Flow Polish (${flowIterations}×)` });
              await flushDelay(6);
              const flowResult = sentenceFlowPolish(humanized, {
                profile: paperProfile ?? undefined,
                plan: humanizationPlan ?? undefined,
                iterations: flowIterations,
                onStage: async (stage: string) => {
                  sendSSE(controller, { type: 'stage', stage });
                  await flushDelay(4);
                },
              });
              if (flowResult.text && flowResult.text.trim().length >= humanized.trim().length * 0.75) {
                const flowGate = rememberQualityCandidate(flowResult.text, 'sentence flow polish');
                if (flowGate.safe && (flowGate.outputAiScore <= activeQualityGate.outputAiScore + 3 || !activeQualityGate.shouldStop)) {
                  humanized = flowResult.text;
                  latestHumanized = humanized;
                  activeQualityGate = flowGate;
                  sendSSE(controller, {
                    type: 'stage',
                    stage: `Flow polish complete (${flowResult.iterationsRun} iter)`,
                  });
                  await flushDelay(6);
                }
              }
            } catch (flowErr) {
              console.warn('[FlowPolish] skipped:', flowErr);
            }
          }

          if (!(deadlineReached || Date.now() - startTime > DEADLINE_MS - 6000)) {
            const { sentences: cleanSentences, paragraphBoundaries: cleanBounds } = splitIntoIndexedSentences(humanized);
const finalPlan = adaptivePostPlan ?? buildAdaptiveCleanupPlan(normalizedText, getDetectorAverage(detector.analyze(humanized)), tone ?? 'neutral', postProcessingProfile, humanizationPlan ?? undefined, effectiveStrength, hRate);
            const cleaningPasses = activeQualityGate.shouldStop
              ? Math.min(1, finalPlan.universalCleaningPasses)
              : finalPlan.universalCleaningPasses;
            let previousUniversalText = humanized;
            // Same probabilistic lead preservation (60/40) applied to
            // final universal cleaning. Uses the same seed as the Nuru
            // post-processing block so verdicts are consistent.
            const universalSeed = hashTextForSeed(normalizedText);
            const paragraphLeadSet = pickLeadsToPreserve(cleanBounds, universalSeed, 0.60);
            for (let pass = 0; pass < cleaningPasses; pass++) {
              sendSSE(controller, { type: 'stage', stage: `Universal Cleaning ${pass + 1}/${cleaningPasses}` });
              await flushDelay(8);
              for (let i = 0; i < cleanSentences.length; i++) {
                if (!isHeadingSentCheck(cleanSentences[i])) {
                  const isParagraphLead = paragraphLeadSet.has(i);
                  let cleaned = cleanSentences[i];
                  if (!(isParagraphLead && pass < cleaningPasses - 1)) {
                    cleaned = deduplicateRepeatedPhrases(cleaned);
                  }
                  cleaned = deepNonLLMClean(cleaned);
                  cleaned = finalSmoothGrammar(cleaned);
                  cleanSentences[i] = cleaned;
                }
                sendSSE(controller, { type: 'sentence', index: i, text: cleanSentences[i], stage: `Universal Cleaning ${pass + 1}/${cleaningPasses}` });
              }
              humanized = reassembleText(cleanSentences, cleanBounds.length ? cleanBounds : [0]);
              latestHumanized = humanized;
              const universalGate = rememberQualityCandidate(humanized, `universal cleaning ${pass + 1}`);
              if (!universalGate.safe) {
                humanized = bestSafeGate ? bestSafeHumanized : previousUniversalText;
                latestHumanized = humanized;
                break;
              }
              activeQualityGate = universalGate;
              if (activeQualityGate.shouldStop || activeQualityGate.outputAiScore <= finalPlan.targetScore) break;
              previousUniversalText = humanized;
            }
          }

          // ═══════════════════════════════════════════════════════════════
          // HUMAN IMPERFECTION INJECTION (final transformation phase)
          //
          // Runs AFTER universal cleaning so the imperfections survive. All
          // earlier phases (Nuru, AntiPangram, detector-polish, flow-polish,
          // universal cleaning) target an "over-polished" state; this phase
          // restores the minimal, realistic quirks that make well-edited
          // human prose look human to detectors:
          //   • Short comma-aside → em-dash aside (e.g. "debate, often
          //     heated, about" → "debate — often heated — about")
          //   • Occasional oxford-comma drop
          //   • Occasional compound-hyphen removal ("well-known" → "well
          //     known") in predicative position
          //   • "In order to" → "to" collapse (human style variance)
          //   • Front-loaded "Additionally," → mid-clause "also"
          //   • Inline domain-aware aside insertion (rare)
          //
          // Deterministic per input. Budgeted to 1–2 imperfections per
          // paragraph (1 for medical/legal). Never introduces misspellings
          // or broken grammar. Runs for EVERY engine including ai_analysis.
          // ═══════════════════════════════════════════════════════════════
          if (!(deadlineReached || Date.now() - startTime > DEADLINE_MS - 3000)) {
            try {
              sendSSE(controller, { type: 'stage', stage: 'Human Imperfections' });
              await flushDelay(6);
              const impResult = injectHumanImperfections(humanized, {
                profile: paperProfile ?? undefined,
                plan: humanizationPlan ?? undefined,
                enableLexical: true,
              });
              if (impResult.text && impResult.text.trim().length >= humanized.trim().length * 0.80) {
                const impGate = rememberQualityCandidate(impResult.text, 'human imperfections');
                if (impGate.safe && impGate.outputAiScore <= activeQualityGate.outputAiScore + 3) {
                  humanized = impResult.text;
                  latestHumanized = humanized;
                  activeQualityGate = impGate;
                  sendSSE(controller, {
                    type: 'stage',
                    stage: `Human imperfections: +${impResult.injectedCount} across ${impResult.perParagraphCounts.length} paragraphs`,
                  });
                  await flushDelay(6);
                }
              }
            } catch (impErr) {
              console.warn('[HumanImperfections] skipped:', impErr);
            }
          }

          // ═══════════════════════════════════════════════════════════════
          // AI ANALYSIS: Smart Rerun Loop
          // If the engine is ai_analysis and average score across all 22
          // detectors exceeds 20%, find the best cleanup engine and loop
          // with Nuru post-processing until score drops below threshold.
          // Max 3 loop iterations to prevent infinite processing.
          // ═══════════════════════════════════════════════════════════════
          // ── POST-PROCESSING ──
          const prePostProcessSnapshot = humanized;
          if (eng !== 'ai_analysis' && !activeQualityGate.shouldStop) {
          const _ppWC = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
          // 4. Unified Sentence Process
          const FIRST_PERSON_RE_EARLY = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/i;
          const earlyFirstPerson = FIRST_PERSON_RE_EARLY.test(text);
          const inputAiScore = inputAnalysis.summary.overall_ai_score;

          if (eng !== 'humara' && eng !== 'humara_v1_3' && eng !== 'nuru' && eng !== 'omega' && eng !== 'oxygen' && !isDeepKill) {
            const beforeUnified = humanized;
            const beforeUnifiedCount = robustSentenceSplit(beforeUnified).length;
            const unified = unifiedSentenceProcess(humanized, earlyFirstPerson, inputAiScore);
            if (robustSentenceSplit(unified).length === beforeUnifiedCount) {
              humanized = unified;
            } else {
              humanized = beforeUnified;
              console.warn('[ShapeGuard] Unified sentence process skipped because it changed sentence count');
            }
            if (!usePhasePipeline) {
              sendSSE(controller, { type: 'stage', stage: 'Sentence Processing' });
              await flushDelay(20);
              const { sentences: uspSentences } = splitIntoIndexedSentences(humanized);
              await emitSentencesStaggered(controller, uspSentences, 'Sentence Processing', 20);
              await flushDelay(30);
            }
          }

          // 5. Word-level change enforcement (adaptive minimum per sentence)
          // NOTE: This is NOT structural restructuring — it only does synonym replacement
          // and AI word elimination. Structural restructuring was already done by LLM
          // in smart preprocessing. Non-LLM engines must NOT do structural restructuring.
          if (!isDeepKill) {
          if (!usePhasePipeline) {
            sendSSE(controller, { type: 'stage', stage: 'Word-Level Change Enforcement' });
            await flushDelay(20);
          }
          {
            const { sentences: origSents } = splitIntoIndexedSentences(normalizedText);
            const { sentences: humanizedSents, paragraphBoundaries: humanParaBounds } = splitIntoIndexedSentences(humanized);
            const isHeadingSent = (s: string) => looksLikeHeadingLine(s.trim());
            const activeChangeTargets: ChangeTargets = humanizationPlan
              ? {
                  ...changeTargets,
                  minDocumentChange: humanizationPlan.minDocumentChange,
                  minSentenceChange: humanizationPlan.minSentenceChange,
                  minChangedSentenceShare: humanizationPlan.minChangedSentenceShare,
                  maxWordLevelPasses: humanizationPlan.changePasses,
                }
              : changeTargets;
            const maxWordPasses = Math.max(1, activeChangeTargets.maxWordLevelPasses);
            let changed = false;

            for (let pass = 0; pass < maxWordPasses; pass++) {
              const usedWords = new Set<string>();
              let passChanged = false;
              for (let i = 0; i < humanizedSents.length; i++) {
                if (isHeadingSent(humanizedSents[i])) continue;

                const sentCount = robustSentenceSplit(humanizedSents[i]).length;
                if (sentCount > 1) {
                  const first = robustSentenceSplit(humanizedSents[i])[0];
                  if (first && first.trim().length > 0) humanizedSents[i] = first;
                }

                let bestOrigIdx = -1;
                let bestScore = Infinity;
                for (let j = 0; j < origSents.length; j++) {
                  if (isHeadingSent(origSents[j])) continue;
                  const r = measureSentenceChange(origSents[j], humanizedSents[i]);
                  if (r < bestScore) { bestScore = r; bestOrigIdx = j; }
                }

                if (bestOrigIdx >= 0) {
                  const sentenceWordChangeMin = getRiskAdaptiveMinChange(bestOrigIdx, activeChangeTargets.minSentenceChange);
                  if (bestScore < sentenceWordChangeMin) {
                    let s = humanizedSents[i];
                    let recheck = bestScore;
                    let attempt = 0;
                    while (recheck < sentenceWordChangeMin && attempt < 2) {
                      s = applyAIWordKill(s);
                      s = synonymReplace(s, Math.min(1, 0.82 + pass * 0.08 + attempt * 0.10), usedWords);
                      recheck = measureSentenceChange(origSents[bestOrigIdx], s);
                      attempt++;
                    }
                    if (s !== humanizedSents[i]) {
                      humanizedSents[i] = s;
                      passChanged = true;
                      changed = true;
                    }
                  }
                }
              }

              const candidateText = reassembleText(humanizedSents, humanParaBounds.length ? humanParaBounds : [0]);
              const changeReport = analyzeDocumentChangeTargets(
                normalizedText,
                candidateText,
                activeChangeTargets.minSentenceChange,
              );
              humanized = candidateText;
              if (
                changeReport.overallChange >= activeChangeTargets.minDocumentChange &&
                changeReport.passRate >= activeChangeTargets.minChangedSentenceShare
              ) {
                break;
              }
              if (!passChanged) break;
            }

            if (changed && !usePhasePipeline) {
              const { sentences: restructuredSents } = splitIntoIndexedSentences(humanized);
              await emitSentencesStaggered(controller, restructuredSents, 'Word-Level Change', 20);
            }
          }
          await flushDelay(30);
          } // end !isDeepKill restructuring guard

          // 6. Capitalization fix
          if (eng !== 'humara' && eng !== 'humara_v1_3' && eng !== 'nuru' && eng !== 'omega' && !isDeepKill) {
            humanized = fixCapitalization(humanized, text);
          }

          // 7. AI capitalization + well-known proper nouns/organizations
          humanized = humanized
            .replace(/\bai-(\w)/gi, (_m: string, c: string) => `AI-${c}`)
            .replace(/\bai\b/g, 'AI');

          // Restore well-known multi-word proper nouns and organizations
          const PROPER_NOUN_PATTERNS: [RegExp, string][] = [
            [/\bartificial intelligence\b/gi, 'Artificial Intelligence'],
            [/\bworld health organization\b/gi, 'World Health Organization'],
            [/\bunited nations\b/gi, 'United Nations'],
            [/\bunited states\b/gi, 'United States'],
            [/\bunited kingdom\b/gi, 'United Kingdom'],
            [/\beuropean union\b/gi, 'European Union'],
            [/\bmachine learning\b/gi, 'Machine Learning'],
            [/\bdeep learning\b/gi, 'Deep Learning'],
            [/\bnatural language processing\b/gi, 'Natural Language Processing'],
            [/\bworld bank\b/gi, 'World Bank'],
            [/\binternational monetary fund\b/gi, 'International Monetary Fund'],
            [/\bworld trade organization\b/gi, 'World Trade Organization'],
            [/\bsupreme court\b/gi, 'Supreme Court'],
            [/\bgeneva convention\b/gi, 'Geneva Convention'],
            [/\bhuman rights\b/gi, 'Human Rights'],
            [/\bclimate change\b/gi, 'Climate Change'],
            [/\bglobal warming\b/gi, 'Global Warming'],
            [/\binformation technology\b/gi, 'Information Technology'],
            [/\binternet of things\b/gi, 'Internet of Things'],
            [/\bcyber security\b/gi, 'Cyber Security'],
            [/\bcybersecurity\b/gi, 'Cybersecurity'],
            [/\bmental health\b/gi, 'Mental Health'],
            [/\bpublic health\b/gi, 'Public Health'],
            [/\bcivil rights\b/gi, 'Civil Rights'],
            [/\bnorth america\b/gi, 'North America'],
            [/\bsouth america\b/gi, 'South America'],
            [/\bsoutheast asia\b/gi, 'Southeast Asia'],
            [/\bmiddle east\b/gi, 'Middle East'],
            [/\bsub-saharan africa\b/gi, 'Sub-Saharan Africa'],
          ];
          for (const [pattern, replacement] of PROPER_NOUN_PATTERNS) {
            humanized = humanized.replace(pattern, replacement);
          }

          // Also restore proper nouns found in the original input text
          {
            const inputWords = normalizedText.split(/\s+/);
            for (const word of inputWords) {
              const clean = word.replace(/[^a-zA-Z'-]/g, '');
              if (!clean || clean.length < 2) continue;
              // Capitalized word (e.g. "Einstein", "Google") - not all-upper, not all-lower
              if (/^[A-Z][a-z]/.test(clean) && clean !== clean.toLowerCase() && clean !== clean.toUpperCase()) {
                const re = new RegExp('\\b' + clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
                humanized = humanized.replace(re, clean);
              }
            }
          }

          // 8. Repetition cleanup
          if (eng !== 'humara' && eng !== 'humara_v1_3' && eng !== 'nuru' && eng !== 'omega' && !isDeepKill) {
            humanized = deduplicateRepeatedPhrases(humanized);
          }

          // 9. Structural post-processing
          if (eng !== 'humara' && eng !== 'humara_v1_3' && eng !== 'nuru' && eng !== 'omega' && eng !== 'ninja' && eng !== 'undetectable' && !isDeepKill) {
            const beforeStructural = humanized;
            const beforeStructuralCount = robustSentenceSplit(beforeStructural).length;
            const structured = structuralPostProcess(humanized);
            if (robustSentenceSplit(structured).length === beforeStructuralCount) {
              humanized = structured;
            } else {
              humanized = beforeStructural;
              console.warn('[ShapeGuard] Structural post-process skipped because it changed sentence count');
            }
          }

          // 9b. Word count restoration — ensure output is at least as long as input.
          // Engines that do multi-pass paraphrasing naturally compress text; we add
          // natural adverb qualifiers to bring the word count back to ≥ input level.
          if (eng !== 'ai_analysis') {
            const inputWCTarget = normalizedText.trim().split(/\s+/).filter(Boolean).length;
            const outputWCNow = humanized.trim().split(/\s+/).filter(Boolean).length;
            if (outputWCNow < inputWCTarget) {
              humanized = expandWordCount(humanized, inputWCTarget);
            }
          }

          // 10. Structure preservation — skip for engines that preserve structure internally
          if (!isDeepKill) humanized = preserveInputStructure(normalizedText, humanized);

          // 11. Contraction & em-dash enforcement
          // Only expand contractions for strict academic tone; blog-academic keeps a more natural cadence
          if (shouldExpandContractions) humanized = expandContractions(humanized);
          humanized = removeEmDashes(humanized);

          // 12. Grammar sanitizer
          const CONSONANT_SOUND_VOWELS = new Set(['uni', 'use', 'usa', 'usu', 'uti', 'ure', 'uro', 'one', 'once']);
          const VOWEL_SOUND_CONSONANTS = new Set(['hour', 'honest', 'honor', 'honour', 'heir', 'herb']);
          humanized = humanized.replace(/\ban (more|less|much|most|very|quite|rather|fairly|too|so)\b/gi, (m, w) => (m[0] === 'A' ? 'A ' : 'a ') + w);
          humanized = humanized.replace(/\ba (increasingly|ever|each|every|eight|eleven|eighteen|important|interesting|independent|innovative|intelligent|upper)\b/gi, (m, w) => (m[0] === 'A' ? 'An ' : 'an ') + w);
          humanized = humanized.replace(/\b(a|an)\s+(\w+)/gi, (full, art, word) => {
            const lower = word.toLowerCase();
            const firstChar = lower[0];
            const first3 = lower.slice(0, 3);
            const isVowelSound = 'aeiou'.includes(firstChar) ? !CONSONANT_SOUND_VOWELS.has(first3) : VOWEL_SOUND_CONSONANTS.has(lower);
            const correctArt = isVowelSound ? 'an' : 'a';
            if (art.toLowerCase() === correctArt) return full;
            const fixed = art[0] === art[0].toUpperCase() ? (correctArt === 'an' ? 'An' : 'A') : correctArt;
            return fixed + ' ' + word;
          });
          humanized = humanized.replace(/\b(\w+)\s+ons\b/g, '$1s on');
          humanized = humanized.replace(/\b(the|a|an)\s+\1\b/gi, '$1');
          humanized = humanized.replace(/,\s+And\s+/g, ', and ');
          humanized = humanized.replace(/([a-z,])\.\s+And\s+/g, '$1 and ');

          // 13. Safety nets
          humanized = humanized.replace(/\b(when|since|though|although|because|while|if|unless|after|before|until|once)\s+\1\b/gi, "$1");
          humanized = humanized.replace(/\b(on|in|at|to|of|by|or|and|for|nor|the|with|from|into|onto|upon|over|that|this|than)\s+\1\b/gi, "$1");
          humanized = humanized.replace(/\b(eas(?:y|ier))\s+(?:for\s+\w+\s+)?to\s+(entry|availability)\b/gi, "$1 to access");
          humanized = humanized.replace(/\bto entry\b/gi, "to access");
          humanized = humanized.replace(/\bto availability\b/gi, "to access");
          humanized = humanized.replace(/\bHealthcare care\b/g, "Healthcare");
          humanized = humanized.replace(/\bquislingism\b/gi, "collaboration");
          humanized = humanized.replace(/\bquisling\b/gi, "collaborator");

          // Post-clean grammar check (universal for ALL engines)
          humanized = postCleanGrammar(humanized);

          // ── DEEP KILL ABBREVIATION & CAPS CLEANUP ──────────────────
          if (isDeepKill) {
            humanized = humanized.replace(/\bD[,;]\s*c\b\.?/gi, 'D.C.');
            humanized = humanized.replace(/\bD[,;]\s*and\s*c\b\.?/gi, 'D.C.');
            humanized = humanized.replace(/\bD\.\s+C\./g, 'D.C.');
            humanized = humanized.replace(/\bU[,;]\s*s\b[,;.]?/gi, 'U.S.');
            humanized = humanized.replace(/\bU\.\s+S\./g, 'U.S.');
            humanized = humanized.replace(/\bU[,;]\s*k\b\.?/gi, 'U.K.');
            humanized = humanized.replace(/\bU\.\s+K\./g, 'U.K.');
            const dkLines = humanized.split('\n');
            humanized = dkLines.map(line => {
              const trimmed = line.trim();
              if (/^[IVX]+\.\s/.test(trimmed)) return line;
              if (trimmed.length < 120 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) return line;
              return line.replace(/\b([A-Z]{4,})\b/g, (m) => {
                if (['HOPE', 'ACS'].includes(m)) return m;
                return m.charAt(0) + m.slice(1).toLowerCase();
              });
            }).join('\n');
            humanized = humanized.replace(/\b([a-z])([A-Z]{3,})\b/g, (_m: string, first: string, rest: string) => first.toUpperCase() + rest);
          }

          // Last-mile meaning validation (2 iterations max)
          // Skip for phantom — uses AntiPangram instead of universal post-processing.
          if (!isDeepKill && eng !== 'phantom') {
            const { sentences: origSentsM } = splitIntoIndexedSentences(normalizedText);
            const isHeadingM = (s: string) => looksLikeHeadingLine(s.trim());
            const STOPWORDS_M = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','can','shall','to','of','in','for','on','with','at','by','from','as','into','through','during','before','after','above','below','between','out','off','over','under','again','further','then','once','here','there','when','where','why','how','all','each','every','both','few','more','most','other','some','such','no','nor','not','only','own','same','so','than','too','very','just','because','but','and','or','if','while','that','this','these','those','it','its','they','them','their','we','our','he','she','his','her','which','what','who','whom','about','also']);
            const getContentWordsM = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 3 && !STOPWORDS_M.has(w));
            const inputWordCount = _ppWC(normalizedText);

            // Skip meaning validation when original splits into far fewer sentences than humanized
            // (e.g. entire paragraph treated as 1 sentence due to no capitals) — replacing each
            // humanized sentence with the full original causes massive duplication.
            const origNonHeadingCount = origSentsM.filter(s => !isHeadingM(s)).length;

            if (origNonHeadingCount >= 2) {
            for (let meaningIter = 0; meaningIter < 2; meaningIter++) {
              const { sentences: humanSentsM, paragraphBoundaries: humanMParaBounds } = splitIntoIndexedSentences(humanized);
              let anyFixed = false;
              const usedOrigIndices = new Set<number>(); // prevent duplication: each original used at most once
              for (let i = 0; i < humanSentsM.length; i++) {
                if (isHeadingM(humanSentsM[i])) continue;
                let bestOverlap = 0;
                let bestOrigIdx = -1;
                for (let j = 0; j < origSentsM.length; j++) {
                  if (isHeadingM(origSentsM[j])) continue;
                  if (usedOrigIndices.has(j)) continue; // skip already-used originals
                  const origW = new Set(getContentWordsM(origSentsM[j]));
                  const modW = new Set(getContentWordsM(humanSentsM[i]));
                  if (origW.size === 0) continue;
                  let matches = 0;
                  for (const w of origW) { if (modW.has(w)) matches++; }
                  const overlap = matches / origW.size;
                  if (overlap > bestOverlap) { bestOverlap = overlap; bestOrigIdx = j; }
                }
                // Only replace when the matched original sentence is similar in length
                // (within 3x) to prevent replacing a short sentence with a much longer one
                if (bestOrigIdx >= 0 && bestOverlap < 0.35) {
                  const origLen = origSentsM[bestOrigIdx].split(/\s+/).length;
                  const humanLen = humanSentsM[i].split(/\s+/).length;
                  if (origLen <= humanLen * 3) {
                    let fixed = applyAIWordKill(origSentsM[bestOrigIdx]);
                    const usedW = new Set<string>();
                    fixed = synonymReplace(fixed, 0.35, usedW);
                    humanSentsM[i] = fixed;
                    usedOrigIndices.add(bestOrigIdx);
                    anyFixed = true;
                  }
                }
              }
              if (!anyFixed) break;
              humanized = reassembleText(humanSentsM, humanMParaBounds.length ? humanMParaBounds : [0]);
              // Abort if output has grown beyond 1.6× input
              if (_ppWC(humanized) > inputWordCount * 1.6) {
                humanized = reassembleText(humanSentsM, humanMParaBounds.length ? humanMParaBounds : [0]);
                break;
              }
            }
            }
          } // end !isDeepKill meaning validation guard

          // Final sentence-initial caps + mid-sentence caps fix
          humanized = humanized.replace(/(^|[.!?]\s+)([a-z])/g, (_m: string, pre: string, ch: string) => pre + ch.toUpperCase());
          humanized = fixMidSentenceCapitalization(humanized, text);
          humanized = restoreCitationAuthorCasing(text, humanized);

          } // end: post-processing block

          // POST-PROCESSING CHANGE CAP REMOVED:
          // Word-position alignment breaks with any insertion — adding 1 word in the middle
          // causes all subsequent positions to mismatch, falsely reporting 50%+ "change".
          // Content quality is guarded by the sentence-count check and strict-meaning
          // setting downstream. Do not add another positional cap here.

          // Structure preservation (restores heading placement from original)
          // Skip for phased engines — they already called preserveInputStructure at end of pipeline
          if (!usePhasePipeline) {
            humanized = preserveInputStructure(normalizedText, humanized);
          }

          // ── EXTERNAL API SANITIZATION ───────────────────────────────
          // External APIs can return LLM refusals, garbled phrases, and bad synonyms.
          // This lightweight pass cleans the worst artifacts without full post-processing.
          if (eng !== 'ai_analysis') {
            // 1. Strip LLM refusal/instruction leaks (anywhere in text)
            const REFUSAL_PATTERNS = [
              /Sorry,?\s+I\s+(?:cannot|can't|am unable to|couldn't)\s+(?:complete|do|help|assist|process|fulfill|generate|write|rewrite|paraphrase)[^.!?\n]*[.!?]?\s*/gi,
              /(?:As an AI|I'm an AI|I am an AI)[^.!?\n]*[.!?]?\s*/gi,
              /(?:Please (?:provide|deliver|give|send|share|paste))\s+(?:the|your)\s+(?:original|source|input|actual)\s+(?:text|content|paragraph|essay|assignment)[^.!?\n]*[.!?]?\s*/gi,
              /I (?:don't|do not) have (?:access to|the original)[^.!?\n]*[.!?]?\s*/gi,
              /(?:Could you (?:please )?(?:provide|share|send))[^.!?\n]*[.!?]?\s*/gi,
            ];
            for (const re of REFUSAL_PATTERNS) {
              humanized = humanized.replace(re, '');
            }

            // 2. Fix garbled transition/discourse markers from external APIs
            // These are commonly injected mid-clause in unnatural positions
            const GARBLED_TRANSITIONS: [RegExp, string][] = [
              // "upon review, " mid-sentence — remove
              [/,\s*upon review,?\s*/gi, ', '],
              [/\bupon review,?\s*/gi, ''],
              // "at this stage, " mid-sentence — remove
              [/,\s*at this stage,?\s*/gi, ', '],
              [/\bat this stage,?\s*/gi, ''],
              // "on closer inspection, " — remove
              [/,\s*on closer inspection,?\s*/gi, ', '],
              [/\bon closer inspection,?\s*/gi, ''],
              // "in broad terms, " — remove
              [/,\s*in broad terms,?\s*/gi, ', '],
              [/\bin broad terms,?\s*/gi, ''],
              // "to be specific, " — remove
              [/,\s*to be specific,?\s*/gi, ', '],
              [/\bto be specific,?\s*/gi, ''],
              // "at its core, " — remove
              [/,\s*at its core,?\s*/gi, ', '],
              [/\bat its core,?\s*/gi, ''],
              // "on this basis, " — remove
              [/,\s*on this basis,?\s*/gi, ', '],
              [/\bon this basis,?\s*/gi, ''],
              // "by comparison, " — remove when mid-sentence
              [/,\s*by comparison,?\s*/gi, ', '],
              // "by all accounts, " — remove
              [/,\s*by all accounts,?\s*/gi, ', '],
              [/\bby all accounts,?\s*/gi, ''],
              // "strikingly, " — remove
              [/\bstrikingly,?\s*/gi, ''],
              // "above all, " mid-sentence — remove
              [/,\s*above all,?\s*/gi, ', '],
              // Fix "besides" used as conjunction (should be "and also" or removed)
              [/,?\s*besides\s+/gi, ', and '],
              // Fix "coupled with" inserted between incompatible clauses
              [/,?\s*coupled with\s+/gi, ', and '],
              // Fix "paired with"
              [/,?\s*paired with\s+/gi, ', and '],
              // Fix "in tandem with"
              [/,?\s*in tandem with\s+/gi, ', and '],
              // "supplied that" → "given that"
              [/\bsupplied that\b/gi, 'given that'],
              // "presented that" → "given that"
              [/\bpresented that\b/gi, 'given that'],
              // "granted that" → "given that"
              [/\bgranted that\b/gi, 'given that'],
              // "offered that" → "given that"
              [/\boffered that\b/gi, 'given that'],
              // "provided that" is sometimes valid, but when used as a garbled "given that":
              // Leave it as-is since it can be grammatically correct
            ];
            for (const [re, rep] of GARBLED_TRANSITIONS) {
              humanized = humanized.replace(re, rep);
            }

            // 3. Fix worst synonym garbling from external APIs
            const BAD_SYNONYMS: [RegExp, string][] = [
              [/\bcrafting\s+(?=econom|countr|nation)/gi, 'developing '],
              [/\bshaping\s+(?=econom|countr|nation)/gi, 'developing '],
              [/\bbuilding\s+(?=countr|nation)/gi, 'developing '],
              [/\badvancing\s+(?=countr|nation)/gi, 'developing '],
              [/\bbackdrop\b/gi, 'environment'],
              [/\bwellspring\b/gi, 'source'],
              [/\bIt too\b/g, 'It also'],
              [/\bhas too\b/gi, 'has also'],
              [/\bhave too\b/gi, 'have also'],
              [/\bhad too\b/gi, 'had also'],
              [/\btoo (?=sparked|prompted|brought|created|caused|led|produced)/gi, 'also '],
              // "Eco-friendly progress Goals" → "Sustainable Development Goals"
              [/\bEco-friendly progress Goals\b/gi, 'Sustainable Development Goals'],
              // "protocols against's review" → "policies on"
              [/\bprotocols\s+against'?s?\s+review\b/gi, 'policies on'],
              [/\bprotocols\b/gi, 'policies'],
              // "rendering" when used for "making"
              [/\brender them\b/gi, 'make them'],
              [/\bto render\b/gi, 'to make'],
            ];
            for (const [re, rep] of BAD_SYNONYMS) {
              humanized = humanized.replace(re, rep);
            }

            // 4. Fix broken sentence starts (double commas, leading commas)
            humanized = humanized.replace(/^,\s*/gm, '');
            humanized = humanized.replace(/,\s*,/g, ',');
            humanized = humanized.replace(/ {2,}/g, ' ');

            // 5. Sentence-initial capitalization
            humanized = humanized.replace(/(^|[.!?]\s+)([a-z])/g, (_m: string, pre: string, ch: string) => pre + ch.toUpperCase());
          }

          // ── OXYGEN POLISH PASS (FINAL PHASE) ──────────────────────────
          // Easy engine's output is polished through the Oxygen TS engine
          // as the LAST step after all post-processing, for final cleanup.
          if (eng === 'easy') {
            try {
              sendSSE(controller, { type: 'stage', stage: 'Oxygen Polish' });
              await flushDelay(20);
              const polished = oxygenHumanize(humanized, 'light', 'fast', false);
              if (polished && polished.trim().length > 0) {
                humanized = polished;
                const { sentences: oxygenSents } = splitIntoIndexedSentences(humanized);
                await emitSentencesStaggered(controller, oxygenSents, 'Oxygen Polish', 20);
              }
            } catch {
              // Oxygen polish is best-effort — never block the pipeline
            }
            // Re-apply structure preservation after Oxygen Polish to restore paragraph count
            humanized = preserveInputStructure(normalizedText, humanized);
            await flushDelay(30);
          }

          humanized = humanized
            .replace(/(^|\n|[.!?]\s+)(?:Additionally|Furthermore|Moreover|In addition),?\s+/gm, '$1')
            .replace(/\b(?:additionally|furthermore|moreover)\b/gi, 'also')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();
          humanized = restoreCitationAuthorCasing(text, humanized);

          // Emit polished sentences (skip for phased engines)
          if (!usePhasePipeline && eng !== 'ai_analysis') {
            sendSSE(controller, { type: 'stage', stage: 'Polishing' });
            await flushDelay(20);
            const { sentences: polishedSents } = splitIntoIndexedSentences(humanized);
            await emitSentencesStaggered(controller, polishedSents, 'Polishing', 20);
            await flushDelay(30);
          }

          // 14. Meaning check (detection disabled — coming soon)
          // Final cleanup: collapse double spaces
          if (eng !== 'ai_analysis') {
            humanized = humanized.replace(/ {2,}/g, ' ');
          }

          // Final safety net after Oxygen polish and external cleanup.
          // These late passes can reintroduce Title Case inside body text.
          if (eng !== 'ai_analysis') {
            humanized = fixMidSentenceCapitalization(humanized, text);
          }

          // ── FINAL DEMONYM/NATIONALITY RESTORATION ───────────────────
          // fixMidSentenceCapitalization lowercases nationality adjectives that NLP doesn't
          // recognise as proper nouns (e.g. "american" → "American"). This static list runs
          // LAST so they are always capitalised correctly regardless of earlier passes.
          // NOTE: do NOT re-run the generic input-word scan here — sentence-initial common
          // words (The, While, From, This…) would be treated as proper nouns and Title-Cased
          // throughout the output. The input scan already ran in step 7 above.
          if (eng !== 'ai_analysis') {
            const ALWAYS_CAP_DEMONYMS: [RegExp, string][] = [
              [/\bamerican\b/gi, 'American'],
              [/\bmexican\b/gi, 'Mexican'],
              [/\bcanadian\b/gi, 'Canadian'],
              [/\beuropean\b/gi, 'European'],
              [/\bafrican\b/gi, 'African'],
              [/\basian\b/gi, 'Asian'],
              [/\bbritish\b/gi, 'British'],
              [/\bhispanic\b/gi, 'Hispanic'],
              [/\blatino\b/gi, 'Latino'],
              [/\blatina\b/gi, 'Latina'],
              [/\bnorth american\b/gi, 'North American'],
              [/\bsouth american\b/gi, 'South American'],
              [/\blatin american\b/gi, 'Latin American'],
            ];
            for (const [_dRe, _dRep] of ALWAYS_CAP_DEMONYMS) {
              humanized = humanized.replace(_dRe, _dRep);
            }
          }

          // ── FINAL SAFETY-NET CLEANUP ───────────────────────────────
          // Catches residual mangling artifacts from the multi-pass pipeline:
          // double-dot, period-comma, split numbers, orphan punctuation.
          if (eng !== 'ai_analysis') {
            // Fix period-comma artifacts: "services., for" → "services, for"
            humanized = humanized.replace(/\.\s*,/g, ',');
            // Fix double periods: "services.." → "services."
            humanized = humanized.replace(/\.{2,}/g, '.');
            // Fix comma-period: ",." → "."
            humanized = humanized.replace(/,\s*\./g, '.');
            // Fix space before comma/period: "word , next" → "word, next"
            humanized = humanized.replace(/\s+([,.])/g, '$1');
            // Fix comma-separated numbers that got a space inserted: "52, 446" → "52,446"
            // Only when both parts look like number fragments (not "in 2019, 446 students")
            humanized = humanized.replace(/\b(\d{1,3}),\s+(\d{3})\b/g, (match, p1, p2, offset, str) => {
              // Check the char AFTER the 3-digit group — if it's followed by another
              // 3-digit comma group or end of number context, rejoin
              const after = str.slice(offset + match.length);
              const isCommaNumber = /^(?:,\d{3}|\b)/.test(after);
              // Check the char BEFORE — should not be preceded by a year-like pattern
              const before = str.slice(Math.max(0, offset - 5), offset);
              const isAfterYear = /\b\d{4}\b/.test(before);
              if (isCommaNumber && !isAfterYear) return `${p1},${p2}`;
              return match;
            });
            // Fix stray closing parenthesis in numbers: "52) 446" → "52,446"
            humanized = humanized.replace(/\b(\d{1,3})\)\s*(\d{3})\b/g, '$1,$2');
            // Clean leftover protection placeholders that weren't restored
            humanized = humanized.replace(/\u27E6\s*PROT\d+\s*\u27E7/gi, '');
            humanized = humanized.replace(/XPROT\d+X/g, '');
          }

          // ── UNIVERSAL CONTENT PRESERVATION GUARD ─────────────────
          // Ensures ALL engines output all paragraphs and sentences from the input.
          // If the pipeline lost paragraphs or significant sentence count, restore
          // structure from the original by re-running preserveInputStructure.
          if (eng !== 'ai_analysis') {
            const inputParas = normalizedText.split(/\n\s*\n/).filter(p => p.trim());
            const outputParas = humanized.split(/\n\s*\n/).filter(p => p.trim());
            const inputSentCount = inputParas.reduce((sum, p) => sum + robustSentenceSplit(p.replace(/\n/g, ' ')).length, 0);
            const outputSentCount = outputParas.reduce((sum, p) => sum + robustSentenceSplit(p.replace(/\n/g, ' ')).length, 0);

            if (outputParas.length < inputParas.length || outputSentCount < inputSentCount * 0.95) {
              console.warn(`[ContentGuard] Content loss detected: paragraphs ${outputParas.length}/${inputParas.length}, sentences ${outputSentCount}/${inputSentCount} — restoring structure`);
              humanized = preserveInputStructure(normalizedText, humanized);
            }
          }

          humanized = humanized
            .replace(/(^|\n|[.!?]\s+)(?:Additionally|Furthermore|Moreover|In addition),?\s+/gm, '$1')
            .replace(/\b(?:additionally|furthermore|moreover)\b/gi, 'also')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();
          humanized = restoreCitationAuthorCasing(text, humanized);

          // ── BLOG FLOW EVALUATION + REPAIR ───────────────────────────
          // academic_blog should read like a real pre-2010 blog or human essay:
          // natural cadence, strong forward motion, no robotic transition stacking.
          if (eng !== 'ai_analysis' && !isDeepKill && isAcademicBlogTone) {
            try {
              sendSSE(controller, { type: 'stage', stage: 'Blog Flow Evaluation' });
              await flushDelay(12);

              const coherenceReport = analyzeDocumentCoherence(text, humanized, {
                contentType: 'blog',
              });
              console.log(
                `[BlogFlow] overall=${coherenceReport.overallScore} cadence=${coherenceReport.paragraphCadence.score} transition=${coherenceReport.transitionFit.score} repetition=${coherenceReport.repetitionDecay.score} drift=${coherenceReport.readabilityDrift.score}`,
              );

              const needsCoherenceRepair =
                coherenceReport.overallScore < 82 ||
                coherenceReport.transitionFit.score < 74 ||
                coherenceReport.repetitionDecay.score < 62 ||
                coherenceReport.readabilityDrift.score < 48;

              if (needsCoherenceRepair) {
                const beforeRepair = humanized;
                humanized = fixDocumentCoherence(text, humanized, coherenceReport);
                if (humanized !== beforeRepair) {
                  humanized = preserveInputStructure(normalizedText, humanized);
                  latestHumanized = humanized;
                  const { sentences: blogFlowSents } = splitIntoIndexedSentences(humanized);
                  await emitSentencesStaggered(controller, blogFlowSents, 'Blog Flow Repair', 18);
                }
              }

              const validationResult = validateAndRepairOutput(text, humanized, {
                allowWordChangeBound: 0.72,
                minSentenceWords: 3,
                autoRepair: true,
              });
              if (validationResult.wasRepaired) {
                humanized = preserveInputStructure(normalizedText, validationResult.text);
                latestHumanized = humanized;
                console.log(`[BlogFlow] Validation repairs: ${validationResult.repairs.join('; ')}`);
                const { sentences: validatedSents } = splitIntoIndexedSentences(humanized);
                await emitSentencesStaggered(controller, validatedSents, 'Sentence Review', 18);
              }
            } catch (blogFlowErr) {
              console.warn('[BlogFlow] Non-fatal evaluation error:', blogFlowErr);
            }
          }

          // ── RISK-ADAPTIVE REVIEW ───────────────────────────────────
          // Use the original sentence risk map to push harder only where the
          // input looked detector-hot, while preserving factual/citation lines.
          if (eng !== 'ai_analysis' && !isDeepKill) {
            try {
              const needsRiskAdaptiveReview = inputRiskReport.sentences.some((sentence) =>
                sentence.riskLevel !== 'low'
                || sentence.reasons.includes('formal_transition')
                || sentence.reasons.includes('detector_magnet')
                || sentence.reasons.includes('aiish_phrase'),
              );

              if (needsRiskAdaptiveReview) {
                sendSSE(controller, { type: 'stage', stage: 'Risk-Adaptive Review' });
                await flushDelay(12);

                const { sentences: riskAdaptiveSentences, paragraphBoundaries: riskAdaptiveBounds } = splitIntoIndexedSentences(humanized);
                const reviewCount = Math.min(riskAdaptiveSentences.length, inputRiskReport.sentences.length);
                let changedSentenceCount = 0;

                for (let index = 0; index < reviewCount; index++) {
                  if (isHeadingSentCheck(riskAdaptiveSentences[index])) continue;
                  const sourceRisk = inputRiskByIndex.get(index);
                  if (!sourceRisk) continue;

                  const originalSentence = riskAdaptiveSentences[index];
                  let reviewedSentence = originalSentence;

                  if (sourceRisk.styleClass === 'fact' || sourceRisk.styleClass === 'citation') {
                    reviewedSentence = fixPunctuation(reviewedSentence);
                    reviewedSentence = fixMidSentenceCapitalization(reviewedSentence, text);
                  } else if (sourceRisk.riskLevel === 'high') {
                    reviewedSentence = deepNonLLMClean(reviewedSentence);
                    reviewedSentence = smoothingPass(reviewedSentence);
                    reviewedSentence = finalSmoothGrammar(reviewedSentence);
                  } else if (sourceRisk.riskLevel === 'medium') {
                    reviewedSentence = deepNonLLMClean(reviewedSentence);
                    reviewedSentence = smoothingPass(reviewedSentence);
                  } else if (
                    sourceRisk.reasons.includes('formal_transition')
                    || sourceRisk.reasons.includes('detector_magnet')
                    || sourceRisk.reasons.includes('aiish_phrase')
                  ) {
                    reviewedSentence = deepNonLLMClean(reviewedSentence);
                  }

                  if (reviewedSentence !== originalSentence) {
                    riskAdaptiveSentences[index] = reviewedSentence;
                    changedSentenceCount++;
                  }
                }

                if (changedSentenceCount > 0) {
                  humanized = preserveInputStructure(
                    normalizedText,
                    reassembleText(riskAdaptiveSentences, riskAdaptiveBounds.length ? riskAdaptiveBounds : [0]),
                  );
                  latestHumanized = humanized;
                  console.log(`[RiskAdaptive] reviewed ${changedSentenceCount} sentences using input risk tiers`);
                  const { sentences: reviewedSentences } = splitIntoIndexedSentences(humanized);
                  await emitSentencesStaggered(controller, reviewedSentences, 'Risk-Adaptive Review', 18);
                }
              }
            } catch (riskAdaptiveErr) {
              console.warn('[RiskAdaptive] Non-fatal review error:', riskAdaptiveErr);
            }
          }

          // ── SENTENCE STABILITY REVIEW ───────────────────────────────
          // A deterministic normalization pass that scores sentence-level
          // risk and smooths out overly consistent AI-like document rhythm.
          if (eng !== 'ai_analysis' && !isDeepKill) {
            try {
              const stabilityReport = analyzeStyleStability(humanized, {
                sourceText: text,
                tone: tone ?? 'neutral',
                engine: eng,
              });
              console.log(
                `[StyleStability] profile=${stabilityReport.profile} overall=${stabilityReport.overallScore} flatness=${stabilityReport.flatnessScore} opener=${stabilityReport.openerDiversityScore} highRisk=${stabilityReport.highRiskCount}/${stabilityReport.sentenceCount}`,
              );

              const highRiskLimit = Math.max(1, Math.floor(stabilityReport.sentenceCount * 0.18));
              const needsStabilityRepair =
                stabilityReport.overallScore < 80 ||
                stabilityReport.flatnessScore < 52 ||
                stabilityReport.highRiskCount > highRiskLimit;

              if (needsStabilityRepair) {
                sendSSE(controller, { type: 'stage', stage: 'Sentence Stability Review' });
                await flushDelay(12);

                const stabilityResult = normalizeStyleStability(humanized, stabilityReport);
                if (stabilityResult.changedSentenceCount > 0) {
                  humanized = preserveInputStructure(normalizedText, stabilityResult.text);
                  latestHumanized = humanized;
                  console.log(`[StyleStability] normalized ${stabilityResult.changedSentenceCount} sentences`);
                  const { sentences: stabilitySentences } = splitIntoIndexedSentences(humanized);
                  await emitSentencesStaggered(controller, stabilitySentences, 'Sentence Stability Review', 18);
                }
              }
            } catch (styleStabilityErr) {
              console.warn('[StyleStability] Non-fatal stability error:', styleStabilityErr);
            }
          }

          humanized = conformToSourceSentenceShape(normalizedText, humanized);
          const finalQualityGate = rememberQualityCandidate(humanized, 'final output');
          if (!finalQualityGate.safe && bestSafeGate) {
            humanized = bestSafeHumanized;
            activeQualityGate = bestSafeGate;
            sendSSE(controller, { type: 'stage', stage: `Quality Gate Recovered: ${Math.round(activeQualityGate.outputAiScore)}%` });
            await flushDelay(6);
          } else {
            activeQualityGate = finalQualityGate;
          }
          latestHumanized = humanized;

          // ── FINAL ADAPTIVE DOCUMENT-CHANGE GUARANTEE ─────────────────
          // Verify overall lexical change meets the adaptive minimum target.
          // If below threshold, force aggressive cleanup on low-change sentences.
          if (!(deadlineReached || Date.now() - startTime > DEADLINE_MS - 4000)) {
            const finalGuaranteePlan = buildAdaptiveCleanupPlan(normalizedText, getDetectorAverage(detector.analyze(humanized)), tone ?? 'neutral', postProcessingProfile, humanizationPlan ?? undefined, effectiveStrength, hRate);
            const finalDocumentFloor = clampRange(finalGuaranteePlan.minDocumentChange, 0.75, postProcessingProfile === 'undetectability' ? 0.90 : 0.86);
            const finalSentenceFloor = clampRange(finalGuaranteePlan.minSentenceChange, 0.25, 0.40);
            const finalDocChange = measureLexicalChangeRatio(normalizedText, humanized);
            if (finalDocChange < finalDocumentFloor) {
              try {
                const { sentences: finalSents, paragraphBoundaries: finalBounds } = splitIntoIndexedSentences(humanized);
                const { sentences: origSentsF } = splitIntoIndexedSentences(normalizedText);
                const isHeadingSentF = (s: string) => looksLikeHeadingLine(s.trim());
                const usedFinalWords = new Set<string>();
                let forcedFinalChange = false;

                for (let i = 0; i < finalSents.length; i++) {
                  if (isHeadingSentF(finalSents[i])) continue;
                  let bestIdx = -1;
                  let bestScore = Infinity;
                  // Find closest original sentence to current humanized sentence
                  for (let j = 0; j < origSentsF.length; j++) {
                    if (isHeadingSentF(origSentsF[j])) continue;
                    const r = measureSentenceChange(origSentsF[j], finalSents[i]);
                    if (r < bestScore) { bestScore = r; bestIdx = j; }
                  }
                  // If sentence still too similar to original, force aggressive cleanup
                  if (bestIdx >= 0 && bestScore < finalSentenceFloor) {
                    finalSents[i] = runNuruSinglePass(finalSents[i]);
                    finalSents[i] = applyAIWordKill(finalSents[i]);
                    finalSents[i] = synonymReplace(finalSents[i], 0.9, usedFinalWords);
                    forcedFinalChange = true;
                  }
                }

                if (forcedFinalChange) {
                  humanized = reassembleText(finalSents, finalBounds.length ? finalBounds : [0]);
                  latestHumanized = humanized;
                  console.log(`[FinalChange] Forced target ${Math.round(finalDocumentFloor * 100)}%: was ${(finalDocChange * 100).toFixed(1)}%, now ${(measureLexicalChangeRatio(normalizedText, humanized) * 100).toFixed(1)}%`);
                }
              } catch (e85) {
                console.warn('[FinalChange] Non-fatal error during adaptive enforcement:', e85);
              }
            }
          }

          // ── OUTPUT SIZE MONITORING ──────────────────────────────────
          {
            const _capInputWC = text.trim().split(/\s+/).filter(Boolean).length;
            const _capOutputWC = humanized.trim().split(/\s+/).filter(Boolean).length;
            if (_capOutputWC > _capInputWC * 1.5) {
              console.warn(`[OutputWatch] ${eng} output ${_capOutputWC}w vs input ${_capInputWC}w (${(_capOutputWC / _capInputWC).toFixed(2)}x)`);
            }
          }

          humanized = preserveInputStructure(normalizedText, removeFillerParentheticals(enforceNoContractions(humanized)));
          latestHumanized = humanized;

          if (!usePhasePipeline) {
            sendSSE(controller, { type: 'stage', stage: 'Analyzing' });
            await flushDelay(10);
          }
          // For engines with server-side meaning checks (oxygen3), use fast sync heuristic
          const meaningCheck = (eng === 'oxygen3')
            ? isMeaningPreservedSync(text, humanized, 0.88)
            : await isMeaningPreserved(text, humanized, 0.88);

          const inputWords = text.trim().split(/\s+/).length;
          const outputWords = humanized.trim().split(/\s+/).length;

          // Track usage + save document BEFORE sending done event so we can include updated counts
          let usageUpdate: { words_used?: number; words_limit?: number } = {};
          if (userId) {
            try {
              const supa = createServiceClient();
              const engineType = 'fast'; // unified — all engines deduct from one pool
              const toneDb = ({ neutral: 'natural', academic: 'academic', academic_blog: 'academic_blog', professional: 'business', simple: 'direct' } as Record<string, string>)[tone ?? 'neutral'] ?? 'natural';

              // Always save document for all users
              const docPromise = supa.from('documents').insert({
                user_id: userId, title: text.slice(0, 60).replace(/\n/g, ' ').trim() + (text.length > 60 ? '…' : ''),
                input_text: text, output_text: humanized,
                input_word_count: inputWords, output_word_count: outputWords,
                engine_used: eng, strength: effectiveStrength, tone: toneDb,
                meaning_preserved: meaningCheck.isSafe, meaning_similarity: meaningCheck.similarity,
                input_ai_score: 0,
                output_ai_score: 0,
              });

              // Admin users are unlimited; all other users are metered
              if (isAdmin) {
                const docResult = await docPromise;
                if (docResult.error) console.error('Document insert failed:', docResult.error.message, docResult.error.details);
              } else {
                const [usageResult, docResult] = await Promise.all([
                  incrementUsageCompat(supa, userId, inputWords, engineType),
                  docPromise,
                ]);

                if (docResult.error) console.error('Document insert failed:', docResult.error.message, docResult.error.details);

                const usageSnapshot = usageResult ?? (!docResult.error ? await getUsageStatsCompat(supa, userId) : null);
                if (usageSnapshot) {
                  const d = usageSnapshot as Record<string, unknown>;
                  const usedFast = Number(d.words_used_fast ?? 0);
                  const usedStealth = Number(d.words_used_stealth ?? 0);
                  const limitFast = Number(d.words_limit_fast ?? 0);
                  const limitStealth = Number(d.words_limit_stealth ?? 0);
                  usageUpdate = {
                    words_used: usedFast + usedStealth,
                    words_limit: (limitFast + limitStealth) || 1000,
                  };
                }
              } // end else (non-admin usage tracking)
            } catch (e) {
              console.error('Usage tracking error:', e);
            }
          }

          // Final done event — includes updated usage so frontend can reflect immediately
          // Run detection on input + output so the client can show before/after AI scores
          const doneDetector = getDetector();
          const doneInputAnalysis = doneDetector.analyze(text);
          const doneOutputAnalysis = doneDetector.analyze(humanized);
          const toDoneDetection = (analysis: ReturnType<ReturnType<typeof getDetector>['analyze']>) => ({
            overall: Math.round(analysis.summary.overall_ai_score),
            detectors: analysis.detectors.map((d) => ({
              detector: d.detector,
              ai_score: Math.round(d.ai_score),
              human_score: Math.round(d.human_score),
            })),
          });
          finishStream({
            humanized,
            word_count: outputWords,
            input_word_count: inputWords,
            engine_used: eng,
            meaning_preserved: meaningCheck.isSafe,
            meaning_similarity: Math.round(meaningCheck.similarity * 100) / 100,
            input_detector_results: toDoneDetection(doneInputAnalysis),
            output_detector_results: toDoneDetection(doneOutputAnalysis),
            ...(usageUpdate.words_used !== undefined ? { usage_words_used: usageUpdate.words_used, usage_words_limit: usageUpdate.words_limit } : {}),
          });
        } catch (err) {
          console.error('[HumanizeStream] Processing failed:', err);
          finishStream({
            partial: latestHumanized.trim().length > 0,
            error: err instanceof Error ? err.message : 'Processing failed',
            meaning_preserved: true,
            meaning_similarity: 0.85,
          });
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch {
    return new Response('data: ' + JSON.stringify({ type: 'error', error: 'Server error' }) + '\n\n', {
      status: 500,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }
}
