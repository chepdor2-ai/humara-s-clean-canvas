import type { Token } from '../core/types';

/**
 * Find the subject of a sentence from its tokens.
 * Skips leading adverbs/conjunctions, then finds the first PRON or head NOUN
 * (before any prepositional phrase).
 */
export function findSubject(tokens: Token[]): Token | null {
  const words = tokens.filter(t => t.kind === 'word' || t.kind === 'abbr');
  let i = 0;
  // Skip leading adverbs and conjunctions
  while (i < words.length && (words[i].pos === 'ADV' || words[i].pos === 'CONJ')) i++;

  let subject: Token | null = null;
  while (i < words.length) {
    const t = words[i];
    if (t.pos === 'PRON') return t;
    if (t.pos === 'DET' || t.pos === 'ADJ') { i++; continue; }
    if (t.pos === 'NOUN' || t.pos === 'VERB') {
      subject = t;
      // Return noun before preposition as the head: "The results of the study" → results
      if (i + 1 < words.length && words[i + 1].pos === 'PREP') {
        return t;
      }
      return t;
    }
    break;
  }
  return subject;
}
