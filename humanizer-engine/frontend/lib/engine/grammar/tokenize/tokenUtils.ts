import type { Token } from '../core/types';

/**
 * Filter tokens to only word tokens (excluding punctuation, numbers, spaces).
 */
export function wordTokens(tokens: Token[]): Token[] {
  return tokens.filter(t => t.kind === 'word' || t.kind === 'abbr');
}

/**
 * Get token text joined by spaces.
 */
export function tokensToText(tokens: Token[]): string {
  return tokens.map(t => t.text).join(' ');
}
