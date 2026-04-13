import type { Token, TokenKind, POS } from '../core/types';
import { ABBREVIATIONS, PRONOUNS, MODALS, AUXILIARIES, DETERMINERS,
  PREPOSITIONS, CONJUNCTIONS } from '../lexicon';
import { FORM_TO_BASE } from '../lexicon/irregularVerbs';

const ABBREVIATION_WITH_PERIODS = /^([A-Za-z]\.){2,}$/;

/**
 * Heuristic POS tagger based on known word sets and suffixes.
 */
export function tagPOS(word: string): POS {
  const w = word.toLowerCase();
  if (PRONOUNS.has(w)) return 'PRON';
  if (MODALS.has(w)) return 'AUX';
  if (AUXILIARIES.has(w)) return 'AUX';
  if (DETERMINERS.has(w)) return 'DET';
  if (PREPOSITIONS.has(w)) return 'PREP';
  if (CONJUNCTIONS.has(w)) return 'CONJ';
  if (FORM_TO_BASE.has(w)) return 'VERB';
  if (w.endsWith('ly') && w.length > 4) return 'ADV';
  if (/(?:ness|ment|tion|sion|ity|ance|ence|ism|ist|ology|ship|dom)$/.test(w)) return 'NOUN';
  if (/(?:ful|ous|ive|ible|able|ical|less|ish)$/.test(w)) return 'ADJ';
  if (w.endsWith('ing')) return 'VERB';
  if (w.endsWith('ed') && w.length > 3) return 'VERB';
  return 'NOUN';
}

/**
 * Tokenize a sentence string into tokens with accurate character offsets.
 */
export function tokenizeSentence(text: string, offset = 0): Token[] {
  const tokens: Token[] = [];
  const regex = /([A-Za-z'\u2019]+(?:\.[A-Za-z])*\.?|\d+(?:[.,]\d+)*%?|[.,;:!?\u2014\u2013\-"'()[\]{}])/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[1];
    const start = offset + match.index;
    const end = start + raw.length;
    const norm = raw.toLowerCase().replace(/[\u2019]/g, "'");

    let kind: TokenKind = 'word';
    if (/^[.,;:!?\u2014\u2013\-"'()[\]{}]+$/.test(raw)) kind = 'punct';
    else if (/^\d/.test(raw)) kind = 'number';
    else if (ABBREVIATION_WITH_PERIODS.test(raw) || (raw.endsWith('.') && ABBREVIATIONS.has(norm.replace(/\./g, '')))) kind = 'abbr';

    const pos: POS = kind === 'punct' ? 'PUNCT' : kind === 'number' ? 'NUM' : kind === 'abbr' ? 'ABBR' : tagPOS(norm);
    const lemma = kind === 'word' ? getLemma(norm) : norm;

    tokens.push({ text: raw, norm, start, end, kind, pos, lemma });
  }

  return tokens;
}

/**
 * Get the base form (lemma) of a word using irregular verb lookup and suffix stripping.
 */
function getLemma(word: string): string {
  const w = word.toLowerCase();
  if (FORM_TO_BASE.has(w)) return FORM_TO_BASE.get(w)!;
  if (w.endsWith('ied') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('ed') && w.length > 4) {
    const stem = w.slice(0, -2);
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) return stem.slice(0, -1);
    return stem.endsWith('e') ? stem : stem + 'e';
  }
  if (w.endsWith('ing') && w.length > 5) {
    const stem = w.slice(0, -3);
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) return stem.slice(0, -1);
    return stem + 'e';
  }
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('es') && w.length > 3) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  return w;
}
