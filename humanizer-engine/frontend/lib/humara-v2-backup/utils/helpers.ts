/**
 * Humara Helpers — General utility functions
 */

/** Seeded pseudo-random for deterministic variation (optional) */
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Pick a random element from an array */
export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Pick a random element, avoiding the original if possible */
export function pickRandomExcluding<T>(arr: T[], exclude: T): T {
  const filtered = arr.filter(item => item !== exclude);
  if (filtered.length === 0) return arr[0];
  return filtered[Math.floor(Math.random() * filtered.length)];
}

/** Shuffle an array (Fisher-Yates) */
export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Case-insensitive string includes */
export function includesCI(text: string, search: string): boolean {
  return text.toLowerCase().includes(search.toLowerCase());
}

/** Replace all case-insensitive occurrences, preserving case of first char of replacement */
export function replaceAllCI(text: string, search: string, replacement: string): string {
  const regex = new RegExp(escapeRegex(search), 'gi');
  return text.replace(regex, (match) => {
    // Preserve the case pattern of the original match on the first character
    if (match.charAt(0) === match.charAt(0).toUpperCase() && replacement.charAt(0) === replacement.charAt(0).toLowerCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
  });
}

/** Escape string for use in regex */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Split text into paragraphs */
export function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
}

/** Join paragraphs back */
export function joinParagraphs(paragraphs: string[]): string {
  return paragraphs.join('\n\n');
}

/** Check if the first letter of the string is uppercase */
export function startsWithUpper(s: string): boolean {
  return s.length > 0 && s.charAt(0) === s.charAt(0).toUpperCase() && s.charAt(0) !== s.charAt(0).toLowerCase();
}

/** Simple hash of string for deterministic behavior */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
