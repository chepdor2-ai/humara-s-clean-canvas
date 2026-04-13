/**
 * Inflect a word for various grammatical features.
 */
export function inflect(word: string, feature: 'gerund' | 'participle'): string {
  const w = word.toLowerCase();
  if (feature === 'gerund' || feature === 'participle') {
    // Double final consonant: run → running, stop → stopping
    if (/^[a-z]*[aeiou][bcdfghjklmnpqrstvwxyz]$/i.test(w) && w.length <= 4) {
      return w + w[w.length - 1] + 'ing';
    }
    if (w.endsWith('ie')) return w.slice(0, -2) + 'ying';
    if (w.endsWith('e') && !w.endsWith('ee')) return w.slice(0, -1) + 'ing';
    return w + 'ing';
  }
  return w;
}
