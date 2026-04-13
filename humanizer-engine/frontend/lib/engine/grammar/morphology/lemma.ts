import { FORM_TO_BASE } from '../lexicon/irregularVerbs';

/**
 * Get the lemma (base form) of a word.
 */
export function lemma(word: string): string {
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
