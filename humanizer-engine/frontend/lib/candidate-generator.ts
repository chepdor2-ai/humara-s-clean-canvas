/**
 * Candidate Generator — Multi-candidate sentence humanization
 * =============================================================
 * Generates N candidate rewrites for each sentence, scores them,
 * picks the best, and returns the rest as pre-generated alternatives.
 *
 * Used by ALL engines (premium + free) so sentence alternatives
 * are ready instantly when the user clicks a sentence — no extra
 * API call needed.
 */

import { humanizeSentence } from './humanize-transforms';

const FIRST_PERSON_RE = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/i;

export interface ScoredCandidate {
  text: string;
  score: number;
}

export interface SentenceWithAlternatives {
  /** The picked best sentence */
  text: string;
  /** Remaining candidates sorted by score (best first), excluding the picked one */
  alternatives: ScoredCandidate[];
}

/**
 * Score a candidate sentence for quality.
 * Higher = better. Considers:
 *   - Length similarity to original
 *   - Ends with proper punctuation
 *   - Not identical to original (some change happened)
 *   - No broken patterns (double prepositions, garbled text)
 */
function scoreCandidate(original: string, candidate: string): number {
  const trimmed = candidate.trim();
  if (!trimmed) return -100;

  let score = 50;

  // Different from original = good
  if (trimmed.toLowerCase() !== original.trim().toLowerCase()) score += 10;

  // Ends with punctuation
  if (/[.!?]$/.test(trimmed)) score += 5;

  // Length ratio penalty
  const origWords = original.trim().split(/\s+/).length;
  const candWords = trimmed.split(/\s+/).length;
  const ratio = candWords / Math.max(origWords, 1);
  if (ratio < 0.5 || ratio > 2.0) score -= 30;
  else if (ratio < 0.7 || ratio > 1.5) score -= 10;

  // Broken patterns penalty
  if (/\b(\w+)\s+\1\b/i.test(trimmed)) score -= 20; // repeated word
  if (/\b(of|to|in|for|on|at|by|with|from) \1\b/gi.test(trimmed)) score -= 25; // double preposition
  if (/,,|;;|\.\./g.test(trimmed)) score -= 15; // double punctuation

  // Uniqueness bonus — longer candidates that have structural changes
  const origStart = original.trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase();
  const candStart = trimmed.split(/\s+/).slice(0, 3).join(' ').toLowerCase();
  if (candStart !== origStart) score += 5; // different opening

  return score;
}

/**
 * Deduplicate candidates — keep only unique text, merge scores.
 */
function deduplicateCandidates(candidates: ScoredCandidate[]): ScoredCandidate[] {
  const seen = new Map<string, ScoredCandidate>();
  for (const c of candidates) {
    const key = c.text.trim().toLowerCase();
    const existing = seen.get(key);
    if (!existing || c.score > existing.score) {
      seen.set(key, c);
    }
  }
  return Array.from(seen.values());
}

/**
 * Generate N candidate rewrites for a single sentence.
 * Returns the best pick + remaining alternatives.
 *
 * @param originalSentence - The sentence to humanize
 * @param inputHadFirstPerson - Whether the full input text had first-person
 * @param count - Total candidates to generate (default 5)
 */
export function generateCandidates(
  originalSentence: string,
  inputHadFirstPerson: boolean,
  count = 3,
): SentenceWithAlternatives {
  const trimmed = originalSentence.trim();
  // Skip very short sentences — just return as-is
  if (!trimmed || trimmed.length < 15) {
    return { text: trimmed, alternatives: [] };
  }

  // Generate N candidates using the randomized humanization pipeline
  const raw: ScoredCandidate[] = [];
  for (let i = 0; i < count; i++) {
    const candidate = humanizeSentence(trimmed, inputHadFirstPerson);
    raw.push({
      text: candidate,
      score: scoreCandidate(trimmed, candidate),
    });
  }

  // Deduplicate
  let candidates = deduplicateCandidates(raw);

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // If we lost all to dedup, generate ONE more (no loop)
  if (candidates.length < 2) {
    const extra = humanizeSentence(trimmed, inputHadFirstPerson);
    const scored = { text: extra, score: scoreCandidate(trimmed, extra) };
    candidates.push(scored);
    candidates = deduplicateCandidates(candidates);
    candidates.sort((a, b) => b.score - a.score);
  }

  // Pick the best
  const best = candidates[0];
  const alternatives = candidates.slice(1);

  return {
    text: best.text,
    alternatives,
  };
}

/**
 * Process a full text by splitting into sentences, generating candidates
 * for each, and returning the assembled best output + per-sentence alternatives.
 *
 * This is the main export used by engines that don't have their own
 * sentence-level processing.
 */
export function generateCandidatesForText(
  text: string,
  count = 5,
): { humanized: string; sentenceAlternatives: Record<number, ScoredCandidate[]> } {
  const inputHadFirstPerson = FIRST_PERSON_RE.test(text);

  // Split into sentences
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const results: string[] = [];
  const sentenceAlternatives: Record<number, ScoredCandidate[]> = {};

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    if (!sentence) continue;

    const { text: best, alternatives } = generateCandidates(sentence, inputHadFirstPerson, Math.min(count, 3));
    results.push(best);
    if (alternatives.length > 0) {
      sentenceAlternatives[i] = alternatives;
    }
  }

  return {
    humanized: results.join(' '),
    sentenceAlternatives,
  };
}
