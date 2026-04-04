/**
 * V1.1 Humanization Engine — Entry Point
 * ========================================
 * 15-phase pipeline for AI text humanization.
 *
 * Golden Rule: Non-LLM for control, speed, and cost.
 *              LLM only for context, flow, and realism (Phase 4 only).
 *
 * Phases:
 *   1. Clean          — normalize whitespace, encoding, punctuation
 *   2. Detect         — segment + score sentences for AI likelihood
 *   3. SentRewrite    — per-sentence rule-based transforms (synonyms, kills, contractions)
 *   4. ChunkRewrite   — optional LLM rewrite for high-AI sentences
 *   5. SentPolish     — filler removal, grammar fix, boundary cleanup
 *   6. Perplexity     — inject rare vocabulary + parenthetical asides to spike perplexity
 *   7. Syntax         — restructure sentences (reorder, cleft, questions, fronting)
 *   8. Voice          — pre-2000 writing style, kill modern AI jargon, authorial voice
 *   9. AntiPattern    — break n-grams, registers, formulae, inject length variance
 *  10. DeepClean      — final kill of surviving AI words + tell patterns
 *  11. Rhythm         — burstiness via internal clause reorder (no sentence splits)
 *  12. Format         — reassemble, restore protected content, validate
 *  13. AggressivePost — deep synonym swap, sentence restructuring, AI kill (≥75% change)
 *  14. Humanize       — pre-1990 voice, phrasal verbs, explanatory padding
 *  15. FinalAIKill    — scorched-earth AI term removal, contraction/first-person guard
 */

import { HumanizationPipeline } from './pipeline';
import { protectContent } from './services/protectionService';
import type { DocumentState, V11Options } from './types';

// Import all 15 phases
import { cleanPhase } from './phases/cleanPhase';
import { detectPhase } from './phases/detectPhase';
import { sentenceRewritePhase } from './phases/sentenceRewritePhase';
import { chunkRewritePhase } from './phases/chunkRewritePhase';
import { sentencePolishPhase } from './phases/sentencePolishPhase';
import { perplexityPhase } from './phases/perplexityPhase';
import { syntaxPhase } from './phases/syntaxPhase';
import { voicePhase } from './phases/voicePhase';
import { antiPatternPhase } from './phases/antiPatternPhase';
import { deepCleanPhase } from './phases/deepCleanPhase';
import { rhythmPhase } from './phases/rhythmPhase';
import { formatPhase } from './phases/formatPhase';
import { aggressivePostProcessPhase } from './phases/aggressivePostProcessPhase';
import { humanizePhase } from './phases/humanizePhase';
import { finalAIKillPhase } from './phases/finalAIKillPhase';

/**
 * Main entry point for V1.1 humanization.
 */
export async function humanizeV11(
  text: string,
  options: V11Options = {}
): Promise<{ humanized: string; logs: string[]; metadata: Record<string, unknown> }> {
  const startTime = Date.now();

  // Protect special content before processing
  const { text: protectedText, spans } = protectContent(text);

  // Build initial document state
  const initialState: DocumentState = {
    originalText: text,
    currentText: protectedText,
    paragraphs: [],
    protectedSpans: spans,
    logs: [`[v1.1] Starting humanization (${text.length} chars, ${Object.keys(spans).length} protected spans)`],
    metadata: { options },
  };

  // Create pipeline with all 15 phases (order matters!)
  const pipeline = new HumanizationPipeline([
    cleanPhase,           // 1. Normalize input
    detectPhase,          // 2. Score sentences for AI likelihood
    sentenceRewritePhase, // 3. Rule-based word/phrase transforms
    chunkRewritePhase,    // 4. Optional LLM sentence rewrite
    sentencePolishPhase,  // 5. Filler removal + grammar fix
    perplexityPhase,      // 6. Rare vocabulary + asides to spike perplexity
    syntaxPhase,          // 7. Restructure sentences (cleft, questions, reorder)
    voicePhase,           // 8. Pre-2000 voice, kill modern AI jargon
    antiPatternPhase,     // 9. Break n-grams, registers, formulae
    deepCleanPhase,       // 10. Final kill of surviving AI fingerprints
    rhythmPhase,          // 11. Burstiness via internal restructuring
    formatPhase,          // 12. Reassemble + restore + validate
    aggressivePostProcessPhase, // 13. Deep aggressive post-processing (≥75% change)
    humanizePhase,        // 14. Pre-1990 voice + phrasal verbs + explanatory padding
    finalAIKillPhase,     // 15. Scorched-earth AI term kill + contraction/first-person guard
  ]);

  // Run the pipeline
  const finalState = await pipeline.run(initialState);

  const elapsed = Date.now() - startTime;
  finalState.logs.push(`[v1.1] Complete in ${elapsed}ms`);

  return {
    humanized: finalState.currentText,
    logs: finalState.logs,
    metadata: {
      ...finalState.metadata,
      elapsed_ms: elapsed,
      protected_spans: Object.keys(spans).length,
    },
  };
}

export type { V11Options, DocumentState };
