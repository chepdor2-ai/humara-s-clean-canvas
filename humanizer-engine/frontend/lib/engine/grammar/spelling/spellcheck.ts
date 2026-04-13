import { CONFUSION_PAIRS } from '../lexicon/confusionSets';

/**
 * Check if a word is a known misspelling via the confusion pairs dictionary.
 * Returns the correct spelling or null.
 */
export function spellcheck(word: string): string | null {
  const entry = CONFUSION_PAIRS[word.toLowerCase()];
  if (entry && entry.context === 'always') return entry.correct;
  return null;
}
