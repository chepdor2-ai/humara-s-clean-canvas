/**
 * Normalizes input text before analysis.
 * - Smart quotes → straight quotes
 * - Collapse multiple spaces
 * - Fix punctuation spacing
 * - Standardize dashes
 */
export function normalizeText(input: string): string {
  let t = input;
  // Smart quotes → straight
  t = t.replace(/[\u2018\u2019\u0060\u00B4]/g, "'");
  t = t.replace(/[\u201C\u201D]/g, '"');
  // Unicode dashes
  t = t.replace(/\u2013/g, '–');
  t = t.replace(/\u2014/g, '—');
  // Non-breaking space → normal space
  t = t.replace(/\u00A0/g, ' ');
  // Collapse multiple spaces (not newlines)
  t = t.replace(/ {2,}/g, ' ');
  // Remove space before punctuation
  t = t.replace(/ +([,;:!?.])/g, '$1');
  // Add space after punctuation if missing
  t = t.replace(/([,;:!?])([A-Za-z])/g, '$1 $2');
  // Add space after period before uppercase (sentence boundary)
  t = t.replace(/\.([A-Z][a-z]{2,})/g, '. $1');
  return t.trim();
}
