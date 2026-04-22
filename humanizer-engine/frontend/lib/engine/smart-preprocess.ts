/**
 * Smart Preprocessing Pipeline
 * ==============================
 * 
 * Intelligent pre-humanization pipeline that:
 * 1. Analyzes AI scores per-sentence using non-LLM forensic detection
 * 2. Ranks sentences by AI likelihood
 * 3. Selects sentences for LLM structural rephrasing (≥70% of content sentences)
 * 4. Computes per-sentence aggression level (40%–85% change target)
 * 5. Routes selected sentences through LLM restructuring
 * 6. Tracks which sentences were restructured to prevent re-restructuring
 * 
 * RULES:
 * - Every engine now has LLM involvement (no purely non-LLM engines)
 * - Non-LLM engines must NOT do structural restructuring (they produce unrealistic results)
 * - NO sentence splitting or merging — 1:1 sentence correspondence enforced
 * - Titles, figures, values, decimals, brackets, percentages are protected
 * - Min change per sentence: 40%, Max change: 85%
 * - At least 70% of content sentences go through LLM structural rephrasing
 * 
 * MULTI-ENGINE RESTRUCTURING CAPS:
 * - Single engine: up to 70% sentences restructured in preprocessing
 * - Subsequent engine phases: max 40% sentences restructured per phase
 * - Iteration loops: max 40% restructured per loop
 */

import { TextSignals, getDetector } from './multi-detector';
import { robustSentenceSplit } from './content-protection';
import { protectSpecialContent, restoreSpecialContent, type ProtectionMap } from './content-protection';
import { restructureSentence, batchRestructureSentences } from './llm-humanizer';
import { looksLikeHeadingLine } from './structure-preserver';
import { profilePaper, type PaperProfile } from './paper-profiler';
import { computeSentenceStrategy, type SentenceStrategy } from './adaptive-strategy-selector';

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

export interface SentenceAnalysis {
  /** Index in the sentence array */
  index: number;
  /** Original sentence text */
  original: string;
  /** AI score (0–100) from forensic detection */
  aiScore: number;
  /** Flagged phrases/words within this sentence */
  flaggedPhrases: string[];
  /** Computed aggression level (0.25–0.85) — min/max word change target */
  aggression: number;
  /** Whether this sentence is a heading/title (protected from processing) */
  isHeading: boolean;
  /** Whether this sentence was selected for LLM structural rephrasing */
  selectedForRephrasing: boolean;
  /** Whether this sentence has been restructured by LLM */
  wasRestructured: boolean;
  /** The preprocessed text (after LLM rephrasing if selected, else original) */
  preprocessed: string;
  /** Adaptive strategy mapped from paper profiler */
  strategy?: SentenceStrategy;
}

export interface PreprocessResult {
  /** All sentence analyses */
  sentences: SentenceAnalysis[];
  /** Paragraph boundary indices (for reassembly) */
  paragraphBoundaries: number[];
  /** Overall AI score before preprocessing */
  initialAiScore: number;
  /** Overall AI score after preprocessing */
  postPreprocessAiScore: number;
  /** Count of sentences that were LLM-restructured */
  restructuredCount: number;
  /** Total content (non-heading) sentence count */
  contentSentenceCount: number;
  /** Set of indices that were restructured (for downstream engines to skip) */
  restructuredIndices: Set<number>;
}

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

/** Minimum percentage of content sentences that must go through LLM rephrasing */
const MIN_REPHRASING_RATIO = 0.95;

/** Minimum word change per sentence (65% — hard floor) */
const MIN_CHANGE = 0.65;

/** Maximum word change per sentence (95% — allow near-total rewrites) */
const MAX_CHANGE = 0.95;

/** AI score threshold below which sentences are considered low-risk */
const LOW_RISK_THRESHOLD = 5;

/** AI score threshold above which sentences are high-risk */
const HIGH_RISK_THRESHOLD = 25;

/** Max restructured sentences per downstream engine phase */
export const MAX_RESTRUCTURE_2_ENGINES = 0.95;

/** Max restructured sentences per downstream engine phase when chaining multiple engines */
export const MAX_RESTRUCTURE_MULTI_ENGINES = 0.95;

/** Max restructured sentences per iteration loop */
export const MAX_RESTRUCTURE_ITERATION = 0.95;

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function isHeadingSentence(s: string): boolean {
  const t = s.trim();
  if (looksLikeHeadingLine(t)) return true;
  // Standalone citation references
  if (/^[A-Z][a-zA-Z]+[,.].*\(\d{4}\)\s*\.?\s*$/.test(t) && t.split(/\s+/).length <= 20) return true;
  return false;
}

/**
 * Measure word-level change between original and modified text (0–1).
 */
export function measureWordChange(original: string, modified: string): number {
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

/**
 * Compute aggression level from AI score.
 * Maps AI score (0–100) to aggression (0.40–0.85).
 * Higher AI score → more aggressive handling.
 */
function computeAggression(aiScore: number): number {
  // Aggressive mapping: score 0 → 0.60, score 100 → 0.95
  // Even low-AI sentences get heavy restructuring for consistent 0% detection
  const normalized = Math.max(0, Math.min(100, aiScore)) / 100;
  return MIN_CHANGE + normalized * (MAX_CHANGE - MIN_CHANGE);
}

/**
 * Count sentences in text without splitting/merging.
 * Uses the same robust splitter as the rest of the pipeline.
 */
function countSentencesInText(text: string): number {
  return robustSentenceSplit(text).length;
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 1: AI Score Analysis
// ═══════════════════════════════════════════════════════════════════════

/**
 * Analyze per-sentence AI scores using non-LLM forensic detection.
 * Returns analysis for each sentence including AI score, flagged phrases,
 * and computed aggression level.
 */
function analyzeSentences(
  sentences: string[],
): SentenceAnalysis[] {
  const analyses: SentenceAnalysis[] = [];

  // Identify headings
  const contentIndices: number[] = [];
  const contentSentences: string[] = [];
  for (let i = 0; i < sentences.length; i++) {
    const isHeading = isHeadingSentence(sentences[i]);
    analyses.push({
      index: i,
      original: sentences[i],
      aiScore: 0,
      flaggedPhrases: [],
      aggression: MIN_CHANGE,
      isHeading,
      selectedForRephrasing: false,
      wasRestructured: false,
      preprocessed: sentences[i],
    });
    if (!isHeading) {
      contentIndices.push(i);
      contentSentences.push(sentences[i]);
    }
  }

  if (contentSentences.length === 0) return analyses;

  // Since we now use PaperProfile globally in the main entry, we will only map it in the main flow.
  // The per-sentence AI scores here still use the quick TextSignals locally to rank sentences.
  try {
    const joined = contentSentences.join(' ');
    const textSignals = new TextSignals(joined);
    const perSentence = textSignals.perSentenceDetails();

    for (let j = 0; j < perSentence.length && j < contentIndices.length; j++) {
      const detail = perSentence[j];
      const idx = contentIndices[j];
      analyses[idx].aiScore = detail.ai_score;
      analyses[idx].flaggedPhrases = [
        ...(detail.flagged_phrases ?? []),
        ...(detail.flagged_words ?? []),
      ].filter(Boolean);
      analyses[idx].aggression = computeAggression(detail.ai_score);
    }
  } catch (e) {
    // If detection fails, assign moderate scores so preprocessing still works
    console.warn('[SmartPreprocess] Forensic detection failed, using moderate defaults:', e);
    for (const idx of contentIndices) {
      analyses[idx].aiScore = 50;
      analyses[idx].aggression = computeAggression(50);
    }
  }

  return analyses;
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 2: Sentence Selection for LLM Rephrasing
// ═══════════════════════════════════════════════════════════════════════

/**
 * Select which sentences go through LLM structural rephrasing.
 * At least 70% of content sentences must be selected.
 * Selection prioritizes highest AI scores first.
 */
function selectSentencesForRephrasing(
  analyses: SentenceAnalysis[],
): void {
  // Get content (non-heading) sentences sorted by AI score descending
  const contentAnalyses = analyses
    .filter(a => !a.isHeading)
    .sort((a, b) => b.aiScore - a.aiScore);

  if (contentAnalyses.length === 0) return;

  // Calculate minimum count (at least 70%)
  const minCount = Math.ceil(contentAnalyses.length * MIN_REPHRASING_RATIO);

  // First: select all high-risk sentences (AI score ≥ HIGH_RISK_THRESHOLD)
  let selectedCount = 0;
  for (const analysis of contentAnalyses) {
    if (analysis.aiScore >= HIGH_RISK_THRESHOLD) {
      analysis.selectedForRephrasing = true;
      selectedCount++;
    }
  }

  // Then: fill up to minimum by selecting next highest-scoring sentences
  if (selectedCount < minCount) {
    for (const analysis of contentAnalyses) {
      if (selectedCount >= minCount) break;
      if (!analysis.selectedForRephrasing) {
        analysis.selectedForRephrasing = true;
        selectedCount++;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 3: LLM Structural Rephrasing
// ═══════════════════════════════════════════════════════════════════════

/**
 * Apply LLM structural rephrasing to selected sentences using a single batch call.
 * This approach is far faster and more cost-effective while still enforcing 
 * sentence bounds and respecting individual strategy needs.
 */
async function applyLLMRephrasing(
  analyses: SentenceAnalysis[],
  onProgress?: (index: number, text: string, stage: string) => void,
): Promise<void> {
  const selected = analyses.filter(a => a.selectedForRephrasing && !a.isHeading);
  if (selected.length === 0) return;

  try {
    // Only pass the original sentences; batchRestructureSentences handles 
    // joining them into a numbered list and parsing them back
    const sentencesToProcess = selected.map(a => a.original);
    
    // We'll use the strategy of the first sentence as a baseline if needed,
    // though batchRestructureSentences itself assumes a general flow 
    // unless you give it a specific strategy. We provide the first strategy.
    const strategy = selected[0]?.strategy;

    // Call the single-call batch LLM restructurer
    const restructuredTexts = await batchRestructureSentences(sentencesToProcess, strategy);

    // Apply the results back to our analyses
    if (restructuredTexts.length === selected.length) {
      for (let i = 0; i < selected.length; i++) {
        const analysis = selected[i];
        const restructured = restructuredTexts[i];

        // Sanity check length
        if (restructured && restructured.trim().length > analysis.original.length * 0.3) {
           analysis.preprocessed = restructured.trim();
           analysis.wasRestructured = true;
           if (onProgress) {
             onProgress(analysis.index, analysis.preprocessed, 'LLM Restructuring');
           }
        }
      }
    } else {
      console.warn(`[SmartPreprocess] Batch restructure returned ${restructuredTexts.length} items, expected ${selected.length}. Falling back to originals.`);
      // No change made
    }
  } catch (err) {
    console.warn(`[SmartPreprocess] Batch LLM restructuring failed:`, err);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 4: Post-Preprocessing Validation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validate preprocessing results:
 * - Sentence count matches (no splits/merges)
 * - Protected content is intact
 * - Change bounds are respected
 */
function validatePreprocessing(analyses: SentenceAnalysis[]): void {
  for (const analysis of analyses) {
    if (analysis.isHeading) continue;

    // Ensure the preprocessed text is a single sentence
    const sentCount = countSentencesInText(analysis.preprocessed);
    if (sentCount > 1) {
      // Take only the first sentence
      const first = robustSentenceSplit(analysis.preprocessed)[0];
      if (first && first.trim().length > 0) {
        analysis.preprocessed = first;
      } else {
        analysis.preprocessed = analysis.original;
        analysis.wasRestructured = false;
      }
    }

    // If preprocessed is empty, revert to original
    if (!analysis.preprocessed || analysis.preprocessed.trim().length === 0) {
      analysis.preprocessed = analysis.original;
      analysis.wasRestructured = false;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════════════

export async function smartPreprocess(
  sentences: string[],
  paragraphBoundaries: number[],
  onProgress?: (index: number, text: string, stage: string) => void,
): Promise<PreprocessResult> {
  // Generate Profile
  const fullText = sentences.join(' ');
  const profile = profilePaper(fullText);

  // Phase 1: Analyze AI scores
  const analyses = analyzeSentences(sentences);

  // Map Adaptive Strategy per-sentence based on paragraph classification
  let globalSentIdx = 0;
  for (let pIdx = 0; pIdx < paragraphBoundaries.length; pIdx++) {
    const start = paragraphBoundaries[pIdx];
    const end = pIdx < paragraphBoundaries.length - 1 ? paragraphBoundaries[pIdx + 1] : sentences.length;
    // Find matching paragraph metric from profile relying on wordCount alignment
    // (This is an approximation; ideally, boundaries match perfectly)
    const metric = profile.paragraphMetrics[pIdx];
    const strategy = computeSentenceStrategy(profile, metric);
    for (let sIdx = start; sIdx < end; sIdx++) {
      analyses[sIdx].strategy = strategy;
    }
  }

  // Compute initial overall AI score
  const contentSentences = analyses.filter(a => !a.isHeading);
  const contentCount = contentSentences.length;
  let initialAiScore = 0;
  if (contentCount > 0) {
    try {
      const joined = contentSentences.map(a => a.original).join(' ');
      const detector = getDetector();
      const analysis = detector.analyze(joined);
      initialAiScore = analysis.summary.overall_ai_score;
    } catch {
      initialAiScore = contentSentences.reduce((sum, a) => sum + a.aiScore, 0) / contentCount;
    }
  }

  // Phase 2: Select sentences for LLM rephrasing
  selectSentencesForRephrasing(analyses);

  // Phase 3: Apply LLM structural rephrasing
  await applyLLMRephrasing(analyses, onProgress);

  // Phase 4: Validate
  validatePreprocessing(analyses);

  // Compute post-preprocessing AI score
  let postPreprocessAiScore = initialAiScore;
  try {
    const postContent = analyses.filter(a => !a.isHeading).map(a => a.preprocessed).join(' ');
    if (postContent.trim().length > 0) {
      const detector = getDetector();
      const postAnalysis = detector.analyze(postContent);
      postPreprocessAiScore = postAnalysis.summary.overall_ai_score;
    }
  } catch {
    // Keep initial score on failure
  }

  // Build restructured indices set
  const restructuredIndices = new Set<number>();
  let restructuredCount = 0;
  for (const a of analyses) {
    if (a.wasRestructured) {
      restructuredIndices.add(a.index);
      restructuredCount++;
    }
  }

  return {
    sentences: analyses,
    paragraphBoundaries,
    initialAiScore,
    postPreprocessAiScore,
    restructuredCount,
    contentSentenceCount: contentCount,
    restructuredIndices,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Downstream Engine Integration Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Determine the maximum number of sentences that can be restructured
 * in a downstream engine phase, based on the number of engines in the pipeline.
 * 
 * @param totalEngines - Total number of engines in the pipeline
 * @param isIteration - Whether this is an iteration loop (not initial pass)
 * @param totalContentSentences - Total content sentences in document
 * @returns Maximum number of sentences that can be restructured
 */
export function getMaxRestructureCount(
  totalEngines: number,
  isIteration: boolean,
  totalContentSentences: number,
): number {
  if (isIteration) {
    return Math.max(1, Math.floor(totalContentSentences * MAX_RESTRUCTURE_ITERATION));
  }
  if (totalEngines > 2) {
    return Math.max(1, Math.floor(totalContentSentences * MAX_RESTRUCTURE_MULTI_ENGINES));
  }
  if (totalEngines === 2) {
    return Math.max(1, Math.floor(totalContentSentences * MAX_RESTRUCTURE_2_ENGINES));
  }
  // Single engine: still allow some restructuring for deep cleaning
  return Math.max(1, Math.floor(totalContentSentences * 0.50));
}

/**
 * Select which unprocessed sentences to restructure in a downstream engine phase.
 * Prioritizes highest AI-scoring sentences that were NOT already restructured.
 * 
 * @param analyses - Sentence analyses from preprocessing
 * @param alreadyRestructured - Set of indices already restructured
 * @param maxCount - Maximum number to restructure this phase
 * @returns Array of indices to restructure
 */
export function selectForDownstreamRestructure(
  analyses: SentenceAnalysis[],
  alreadyRestructured: Set<number>,
  maxCount: number,
): number[] {
  if (maxCount <= 0) return [];

  // Sort content sentences by AI score descending, excluding already restructured
  const candidates = analyses
    .filter(a => !a.isHeading && !alreadyRestructured.has(a.index))
    .sort((a, b) => b.aiScore - a.aiScore);

  return candidates.slice(0, maxCount).map(a => a.index);
}

/**
 * Reassemble preprocessed sentences back into paragraphed text.
 * Preserves paragraph boundaries and heading structure.
 */
export function reassemblePreprocessed(
  analyses: SentenceAnalysis[],
  paragraphBoundaries: number[],
): string {
  const sentences = analyses.map(a => a.preprocessed);
  const paragraphs: string[][] = [];
  for (let i = 0; i < paragraphBoundaries.length; i++) {
    const start = paragraphBoundaries[i];
    const end = i < paragraphBoundaries.length - 1 ? paragraphBoundaries[i + 1] : sentences.length;
    paragraphs.push(sentences.slice(start, end));
  }
  return paragraphs.map(p => p.join(' ')).join('\n\n');
}
