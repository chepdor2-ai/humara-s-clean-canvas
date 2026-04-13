import { damerauLevenshtein } from './editDistance';

/**
 * Suggest spelling corrections for a word using edit distance.
 * Returns up to `maxResults` candidates sorted by distance.
 */
export function suggestSpelling(
  word: string,
  dictionary: Set<string> | string[],
  maxResults = 3,
  maxDistance = 2,
): string[] {
  const w = word.toLowerCase();
  const candidates: { word: string; dist: number }[] = [];
  const dict = dictionary instanceof Set ? dictionary : new Set(dictionary);

  for (const entry of dict) {
    // Quick length filter to avoid unnecessary distance calculations
    if (Math.abs(entry.length - w.length) > maxDistance) continue;
    const dist = damerauLevenshtein(w, entry);
    if (dist <= maxDistance && dist > 0) {
      candidates.push({ word: entry, dist });
    }
  }

  return candidates
    .sort((a, b) => a.dist - b.dist)
    .slice(0, maxResults)
    .map(c => c.word);
}
