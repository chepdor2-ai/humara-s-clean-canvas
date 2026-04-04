/**
 * Humara Tokenizer — Lightweight text tokenization utilities
 */

/** Split text into word tokens preserving punctuation boundaries */
export function tokenize(text: string): string[] {
  return text.match(/\S+/g) || [];
}

/** Rejoin tokens into text */
export function detokenize(tokens: string[]): string {
  return tokens.join(' ');
}

/** Count words in text */
export function wordCount(text: string): number {
  return tokenize(text).length;
}

/** Check if a token is punctuation */
export function isPunctuation(token: string): boolean {
  return /^[.!?,;:—\-–"'()\[\]{}]$/.test(token);
}

/** Check if a token is a word (not pure punctuation/number) */
export function isWord(token: string): boolean {
  return /[a-zA-Z]/.test(token);
}

/** Extract trailing punctuation from a sentence */
export function extractTrailingPunctuation(sentence: string): { text: string; punctuation: string } {
  const match = sentence.match(/^([\s\S]*?)([.!?]+)$/);
  if (match) {
    return { text: match[1], punctuation: match[2] };
  }
  return { text: sentence, punctuation: '' };
}

/** Capitalize first letter of a string */
export function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Lowercase first letter */
export function lowercaseFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}
