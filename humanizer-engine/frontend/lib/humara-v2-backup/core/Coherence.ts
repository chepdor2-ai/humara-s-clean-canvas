/**
 * Humara Coherence — Post-transform coherence and quality checks
 * 
 * Ensures the humanized output:
 * 1. Reads naturally as a whole
 * 2. Does not have repetitive patterns across sentences
 * 3. Has natural sentence-length variation (burstiness)
 * 4. Maintains logical flow between sentences
 */

import { wordCount } from '../utils/tokenizer';

// ─── REPETITION DETECTION ───────────────────────────────────────────────

/**
 * Detect cross-sentence repetition of opening words/phrases.
 * AI text tends to start many sentences the same way.
 */
export function detectRepetitiveStarters(sentences: string[]): number[] {
  const starters = sentences.map(s => {
    const words = s.trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase();
    return words;
  });

  const duplicateIndices: number[] = [];
  const seen = new Map<string, number>();

  for (let i = 0; i < starters.length; i++) {
    const first2 = starters[i].split(' ').slice(0, 2).join(' ');
    if (seen.has(first2)) {
      duplicateIndices.push(i);
    }
    seen.set(first2, i);
  }

  return duplicateIndices;
}

/**
 * Remove word/phrase repetitions within the same sentence.
 */
export function deduplicateWithinSentence(sentence: string): string {
  // Detect patterns like "X. X." or "X, X"
  const words = sentence.split(/\s+/);
  if (words.length < 4) return sentence;

  // Check for bigram repetitions
  const result: string[] = [words[0]];
  for (let i = 1; i < words.length; i++) {
    // Skip if this word + next match previous two words (repeated bigram)
    if (i >= 2 && i < words.length - 1) {
      const prevBigram = (words[i - 2] + ' ' + words[i - 1]).toLowerCase();
      const currBigram = (words[i] + ' ' + (words[i + 1] || '')).toLowerCase();
      if (prevBigram === currBigram) {
        i++; // Skip the repeated bigram
        continue;
      }
    }
    result.push(words[i]);
  }

  return result.join(' ');
}

// ─── BURSTINESS CHECK ───────────────────────────────────────────────────

/**
 * Measure burstiness — the variation in sentence length.
 * Human text has high burstiness; AI text has low burstiness.
 * Returns a score 0-1 where 1 = very bursty (human-like).
 */
export function measureBurstiness(sentences: string[]): number {
  if (sentences.length < 2) return 1;

  const lengths = sentences.map(s => wordCount(s));
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / lengths.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 0; // Coefficient of variation

  // CV of 0.3+ is human-like, < 0.15 is AI-like
  return Math.min(cv / 0.35, 1);
}

// ─── TRANSITION VARIATION ───────────────────────────────────────────────

/**
 * Check that transitions between sentences are varied.
 * Returns indices of sentences that should have their starters changed.
 */
export function findMonotonousTransitions(sentences: string[]): number[] {
  const monotonous: number[] = [];
  const connectors = ['however', 'moreover', 'furthermore', 'additionally', 'consequently', 'therefore'];

  let consecutiveConnectorCount = 0;
  for (let i = 0; i < sentences.length; i++) {
    const lower = sentences[i].toLowerCase().trim();
    const startsWithConnector = connectors.some(c => lower.startsWith(c));

    if (startsWithConnector) {
      consecutiveConnectorCount++;
      if (consecutiveConnectorCount >= 2) {
        monotonous.push(i);
      }
    } else {
      consecutiveConnectorCount = 0;
    }
  }

  return monotonous;
}

// ─── COHERENCE FIXES ────────────────────────────────────────────────────

/**
 * Apply coherence fixes to the array of transformed sentences.
 * This is the final quality pass before joining.
 */
export function applyCoherenceFixes(sentences: string[]): string[] {
  let result = [...sentences];

  // 1. Deduplicate within each sentence
  result = result.map(s => deduplicateWithinSentence(s));

  // 2. Fix repetitive starters — remove transition words from duplicates
  const repIndices = detectRepetitiveStarters(result);
  for (const idx of repIndices) {
    // Strip the leading transition/connector word
    const sentence = result[idx];
    const match = sentence.match(/^(\w+,?\s+)/);
    if (match && match[1].length < 15) {
      result[idx] = sentence.substring(match[1].length);
      // Re-capitalize
      result[idx] = result[idx].charAt(0).toUpperCase() + result[idx].slice(1);
    }
  }

  // 3. Fix monotonous transitions
  const monotonous = findMonotonousTransitions(result);
  for (const idx of monotonous) {
    // Strip the transition word
    const sentence = result[idx];
    const commaIdx = sentence.indexOf(', ');
    if (commaIdx > 0 && commaIdx < 20) {
      result[idx] = sentence.substring(commaIdx + 2);
      result[idx] = result[idx].charAt(0).toUpperCase() + result[idx].slice(1);
    }
  }

  return result;
}

// ─── PERPLEXITY ESTIMATION ──────────────────────────────────────────────

/**
 * Simple perplexity proxy — checks for unusual word patterns that
 * might indicate an awkward transformation.
 * Returns problematic sentence indices.
 */
export function findAwkwardSentences(sentences: string[]): number[] {
  const awkward: number[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    // Check for double punctuation
    if (/[.!?]{3,}/.test(s) || /,,/.test(s) || / {3,}/.test(s)) {
      awkward.push(i);
    }
    // Check for nonsensical short sentences (< 3 words with no punctuation content)
    const wc = s.split(/\s+/).filter(w => /\w/.test(w)).length;
    if (wc < 2 && s.length > 0) {
      awkward.push(i);
    }
  }

  return awkward;
}
