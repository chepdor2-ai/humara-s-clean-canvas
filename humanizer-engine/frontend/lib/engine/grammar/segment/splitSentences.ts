import { ABBREVIATIONS } from '../lexicon/dictionary';
import { protectSpans, isProtected } from '../normalize/protectSpans';

const UPPERCASE_ABBREVIATIONS = /^[A-Z]{2,}\.?$/;
const ABBREVIATION_WITH_PERIODS = /^([A-Za-z]\.){2,}$/;

/**
 * Check whether a dot at `dotIndex` is part of an abbreviation.
 */
function isAbbreviation(text: string, dotIndex: number): boolean {
  let wordStart = dotIndex - 1;
  while (wordStart >= 0 && /[A-Za-z.]/.test(text[wordStart])) wordStart--;
  wordStart++;
  const word = text.slice(wordStart, dotIndex).toLowerCase().replace(/\./g, '');
  if (ABBREVIATIONS.has(word)) return true;
  const withDot = text.slice(wordStart, dotIndex + 1);
  if (ABBREVIATION_WITH_PERIODS.test(withDot)) return true;
  if (UPPERCASE_ABBREVIATIONS.test(text.slice(wordStart, dotIndex + 1))) return true;
  // Single capital letter dot: initials like "J."
  if (dotIndex - wordStart === 1 && /[A-Z]/.test(text[wordStart])) return true;
  return false;
}

/**
 * Abbreviation-aware sentence segmentation.
 * Handles abbreviations, URLs, emails, and initials without false splits.
 */
export function splitSentences(text: string): string[] {
  const protectedRanges = protectSpans(text);

  const sentences: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    current += text[i];
    if ((text[i] === '.' || text[i] === '!' || text[i] === '?') && !isProtected(i, protectedRanges)) {
      if (text[i] === '.' && isAbbreviation(text, i)) continue;
      const next = text[i + 1];
      const nextNext = text[i + 2];
      if (!next || next === '\n' || (next === ' ' && (!nextNext || /[A-Z"\u201C(]/.test(nextNext)))) {
        sentences.push(current.trim());
        current = '';
      }
    }
  }
  if (current.trim()) sentences.push(current.trim());
  return sentences;
}
