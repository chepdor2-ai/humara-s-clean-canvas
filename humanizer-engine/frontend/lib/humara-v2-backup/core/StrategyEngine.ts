/**
 * Humara StrategyEngine — Intelligent per-sentence strategy selection
 * 
 * KEY DIFFERENTIATOR: NOT every sentence is transformed heavily.
 * Mix of strategies creates natural variation (burstiness).
 */

import type { ParsedSentence } from './Parser';
import { hashString } from '../utils/helpers';

export type Strategy =
  | 'unchanged'     // Leave sentence as-is (critical for human feel)
  | 'minimal'       // Only phrase-level replacements
  | 'lexical'       // Word + phrase replacements
  | 'restructure'   // Clause reordering / fronting
  | 'emphasis'      // Add hedging, emphasis shifts
  | 'ai_scrub';     // Remove AI-signature words specifically

export interface StrategyDecision {
  strategy: Strategy;
  confidence: number; // 0-1 how aggressive the transform should be
}

/**
 * Pick the best strategy for a given sentence based on its position,
 * content analysis, and the overall text properties.
 */
export function pickStrategy(
  sentence: ParsedSentence,
  index: number,
  total: number,
  inputHasFirstPerson: boolean
): StrategyDecision {
  // Use a hash-based approach so same input always gets same strategy
  const hash = hashString(sentence.text + index + total + (inputHasFirstPerson ? 1 : 0));

  // First: if sentence starts with AI transition word, always scrub it
  if (sentence.startsWithTransition) {
    return { strategy: 'ai_scrub', confidence: 0.8 };
  }

  // Very short sentences (< 8 words): leave unchanged more often
  if (sentence.wordCount < 8) {
    if (hash % 3 === 0) return { strategy: 'unchanged', confidence: 0.1 };
    return { strategy: 'minimal', confidence: 0.3 };
  }

  // Complex sentences: restructure or emphasis  
  if (sentence.complexity === 'complex') {
    if (hash % 4 === 0) return { strategy: 'restructure', confidence: 0.7 };
    if (hash % 4 === 1) return { strategy: 'emphasis', confidence: 0.6 };
    if (hash % 4 === 2) return { strategy: 'lexical', confidence: 0.6 };
    return { strategy: 'ai_scrub', confidence: 0.7 };
  }

  // Distribution strategy for medium sentences:
  // ~15% unchanged, ~25% minimal, ~25% lexical, ~15% restructure, ~10% emphasis, ~10% ai_scrub
  const bucket = hash % 20;
  if (bucket < 3) return { strategy: 'unchanged', confidence: 0.1 };
  if (bucket < 8) return { strategy: 'minimal', confidence: 0.4 };
  if (bucket < 13) return { strategy: 'lexical', confidence: 0.5 };
  if (bucket < 16) return { strategy: 'restructure', confidence: 0.6 };
  if (bucket < 18) return { strategy: 'emphasis', confidence: 0.5 };
  return { strategy: 'ai_scrub', confidence: 0.7 };
}

/**
 * Generate the complete strategy plan for all sentences.
 * Ensures no two adjacent sentences share the same heavy strategy.
 */
export function planStrategies(
  sentences: ParsedSentence[],
  inputHasFirstPerson: boolean
): StrategyDecision[] {
  const total = sentences.length;
  const plan: StrategyDecision[] = [];

  for (let i = 0; i < total; i++) {
    let decision = pickStrategy(sentences[i], i, total, inputHasFirstPerson);

    // Avoid three consecutive heavy transforms — downgrade to minimal
    if (i >= 2) {
      const prev1 = plan[i - 1].strategy;
      const prev2 = plan[i - 2].strategy;
      const heavyStrats: Strategy[] = ['restructure', 'emphasis', 'ai_scrub'];
      if (
        heavyStrats.includes(prev1) &&
        heavyStrats.includes(prev2) &&
        heavyStrats.includes(decision.strategy)
      ) {
        decision = { strategy: 'minimal', confidence: 0.3 };
      }
    }

    plan.push(decision);
  }

  // Ensure at least some sentences are unchanged for natural feel
  const unchangedCount = plan.filter(p => p.strategy === 'unchanged').length;
  if (unchangedCount === 0 && total >= 4) {
    // Force one random sentence to be unchanged
    const idx = Math.floor(total / 3);
    plan[idx] = { strategy: 'unchanged', confidence: 0.0 };
  }

  return plan;
}
