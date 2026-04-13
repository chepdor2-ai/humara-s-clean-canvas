/**
 * Conjugate a verb lemma to a specific person/number in present tense.
 */
export function conjugatePresent(
  lemma: string,
  person: '1s' | '2s' | '3s' | '1p' | '2p' | '3p'
): string {
  if (lemma === 'be') {
    if (person === '1s') return 'am';
    if (person === '3s') return 'is';
    return 'are';
  }
  if (lemma === 'have') {
    if (person === '3s') return 'has';
    return 'have';
  }
  if (lemma === 'do') {
    if (person === '3s') return 'does';
    return 'do';
  }

  if (person === '3s') {
    if (lemma.endsWith('y') && !/[aeiou]y$/i.test(lemma)) {
      return lemma.slice(0, -1) + 'ies';
    }
    if (/(s|sh|ch|x|z)$/.test(lemma)) return lemma + 'es';
    return lemma + 's';
  }

  return lemma;
}

/**
 * Get the past tense form of a regular verb.
 */
export function conjugatePast(lemma: string): string {
  if (lemma.endsWith('e')) return lemma + 'd';
  if (lemma.endsWith('y') && !/[aeiou]y$/i.test(lemma)) {
    return lemma.slice(0, -1) + 'ied';
  }
  // Double final consonant for short verbs: stop → stopped
  if (/^[a-z]*[aeiou][bcdfghjklmnpqrstvwxyz]$/i.test(lemma) && lemma.length <= 4) {
    return lemma + lemma[lemma.length - 1] + 'ed';
  }
  return lemma + 'ed';
}
