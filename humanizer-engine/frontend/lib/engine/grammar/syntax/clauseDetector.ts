import type { Token } from '../core/types';
import { IRREGULAR_VERBS, FORM_TO_BASE } from '../lexicon/irregularVerbs';

/**
 * Find the main verb of a sentence (first verb/aux after the subject).
 */
export function findMainVerb(tokens: Token[]): Token | null {
  const words = tokens.filter(t => t.kind === 'word');
  let pastSubject = false;
  for (const t of words) {
    if (!pastSubject && (t.pos === 'PRON' || t.pos === 'NOUN')) {
      pastSubject = true;
      continue;
    }
    if (pastSubject && t.pos === 'PREP') continue;
    if (pastSubject && (t.pos === 'DET' || t.pos === 'ADJ' || t.pos === 'NOUN')) continue;
    if (pastSubject && (t.pos === 'VERB' || t.pos === 'AUX')) return t;
  }
  return null;
}

/**
 * Detect the tense of a sentence from its verb tokens.
 */
export function detectTense(tokens: Token[]): 'past' | 'present' | 'future' | 'unknown' {
  const verbs = tokens.filter(t => t.pos === 'VERB' || t.pos === 'AUX');
  for (const v of verbs) {
    const w = v.norm;
    if (w === 'will' || w === 'shall' || w === "won't" || w === "shan't") return 'future';
    if (w === 'was' || w === 'were' || w === 'had' || w === 'did') return 'past';
    for (const forms of Object.values(IRREGULAR_VERBS)) {
      if (forms.past === w) return 'past';
    }
    if (w.endsWith('ed')) return 'past';
    if (w === 'is' || w === 'are' || w === 'am' || w === 'has' || w === 'have' || w === 'does' || w === 'do') return 'present';
  }
  return 'unknown';
}

/**
 * Detect passive voice construction: be-form + past participle.
 */
export function isPassiveVoice(tokens: Token[]): boolean {
  const words = tokens.filter(t => t.kind === 'word');
  for (let i = 0; i < words.length - 1; i++) {
    const w = words[i].norm;
    if ((w === 'is' || w === 'are' || w === 'was' || w === 'were' || w === 'been' || w === 'be' || w === 'being') &&
        (words[i + 1].norm.endsWith('ed') || FORM_TO_BASE.has(words[i + 1].norm))) {
      const base = FORM_TO_BASE.get(words[i + 1].norm);
      if (base) {
        const entry = IRREGULAR_VERBS[base];
        if (entry && words[i + 1].norm === entry.pp) return true;
      }
      if (words[i + 1].norm.endsWith('ed')) return true;
    }
  }
  return false;
}
