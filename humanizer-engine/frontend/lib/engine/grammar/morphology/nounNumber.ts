import { UNCOUNTABLE_NOUNS } from '../lexicon/dictionary';

/**
 * Detect if a word is a plural noun.
 */
export function isPluralNoun(word: string): boolean {
  const w = word.toLowerCase();
  if (UNCOUNTABLE_NOUNS.has(w)) return false;
  // Words ending in 's' but not 'ss' (like "mass", "stress")
  return w.endsWith('s') && !w.endsWith('ss') && w.length > 3;
}

/**
 * Get the singular form of a plural noun (heuristic).
 */
export function singularize(word: string): string {
  const w = word.toLowerCase();
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('ves') && w.length > 4) return w.slice(0, -3) + 'f';
  if (w.endsWith('ses') || w.endsWith('xes') || w.endsWith('zes') ||
      w.endsWith('ches') || w.endsWith('shes')) {
    return w.slice(0, -2);
  }
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/**
 * Get the plural form of a singular noun (heuristic).
 */
export function pluralize(word: string): string {
  const w = word.toLowerCase();
  if (UNCOUNTABLE_NOUNS.has(w)) return w;
  if (w.endsWith('y') && !/[aeiou]y$/i.test(w)) return w.slice(0, -1) + 'ies';
  if (w.endsWith('f')) return w.slice(0, -1) + 'ves';
  if (w.endsWith('fe')) return w.slice(0, -2) + 'ves';
  if (/(s|sh|ch|x|z)$/.test(w)) return w + 'es';
  return w + 's';
}
