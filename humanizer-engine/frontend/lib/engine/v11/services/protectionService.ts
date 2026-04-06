/**
 * V1.1 Protection Service
 * ========================
 * Protects and restores special content (URLs, citations, code, math,
 * brackets, figures, percentages, dates, measurements, currency).
 */

const PROTECTION_PATTERNS: RegExp[] = [
  // Containers
  /\[[^\]]*\]/g,
  /\([^)]*\)/g,
  // Currency
  /\$\d+(?:,\d{3})*(?:\.\d+)?/g,
  /£\d+(?:,\d{3})*(?:\.\d+)?/g,
  /€\d+(?:,\d{3})*(?:\.\d+)?/g,
  // Measurements with units
  /\b\d+(?:\.\d+)?\s*(?:kg|g|mg|lb|oz|km|m|cm|mm|mi|ft|in|°[CF]|K|Hz|kHz|MHz|GHz|THz|GB|MB|KB|TB|PB|ml|L|dB|MW|kW|GW|ppm|ppb)\b/gi,
  // Percentages
  /\b\d+\.\d+%/g,
  /\b\d+%/g,
  // Academic references
  /\b(?:Figure|Fig\.|Table|Equation|Eq\.|Chart|Graph|Appendix|Section|Chapter)\s+\d+(?:\.\d+)*\b/gi,
  /\bp\s*[<>=≤≥]\s*(?:0\.\d+|\.\d+)\b/g,
  /\b[nN]\s*=\s*\d+/g,
  /\b(?:et\s+al\.|ibid\.|op\.\s*cit\.|loc\.\s*cit\.)/gi,
  /\(\d{4}\)/g,
  // Dates
  /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g,
  /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g,
  // URLs and emails
  /https?:\/\/[^\s)]+/gi,
  /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
  // Large numbers with commas
  /\b\d+(?:,\d{3})+\b/g,
  // Number-word compounds
  /\b\d+-[a-zA-Z]+(?:-[a-zA-Z]+)*\b/g,
  // Math expressions (LaTeX-style)
  /\$[^$]+\$/g,
  /\\\([^)]+\\\)/g,
  // Code blocks
  /`[^`]+`/g,
  // Standalone decimals
  /\b\d+\.\d+\b/g,
];

/**
 * Replace special content with unique placeholders before processing.
 */
export function protectContent(text: string): { text: string; spans: Record<string, string> } {
  const spans: Record<string, string> = {};
  let idx = 0;
  let result = text;

  for (const pattern of PROTECTION_PATTERNS) {
    result = result.replace(new RegExp(pattern.source, pattern.flags), (match) => {
      const placeholder = `\u27E6VPROT${idx}\u27E7`;
      spans[placeholder] = match;
      idx++;
      return placeholder;
    });
  }

  return { text: result, spans };
}

/**
 * Restore all placeholders with their original content.
 */
export function restoreContent(text: string, spans: Record<string, string>): string {
  let result = text;

  // Build case-insensitive lookup
  const ciMap = new Map<string, string>();
  for (const [placeholder, original] of Object.entries(spans)) {
    const key = placeholder.replace(/\s+/g, '').toLowerCase();
    ciMap.set(key, original);
  }

  // Match all ⟦VPROTn⟧ variants (normal Unicode)
  result = result.replace(/\u27E6\s*vprot(\d+)\s*\u27E7/gi, (_match, idx) => {
    const key = `\u27E6vprot${idx}\u27E7`;
    return ciMap.get(key) ?? _match;
  });

  // Fallback: match corrupted Unicode encoding variants (e.g., ΓƒªVPROT0Γƒº)
  // U+27E6/U+27E7 get double-encoded as U+0393 U+0192 U+00AA / U+0393 U+0192 U+00BA
  result = result.replace(/\u0393\u0192\u00AA\s*VPROT\s*(\d+)\s*\u0393\u0192\u00BA/gi, (_match, idx) => {
    const key = `\u27E6vprot${idx}\u27E7`;
    return ciMap.get(key) ?? _match;
  });

  // Fallback: match any non-ASCII characters surrounding VPROT patterns
  result = result.replace(/[^\x00-\x7F]+\s*VPROT\s*(\d+)\s*[^\x00-\x7F]+/gi, (_match, idx) => {
    const key = `\u27E6vprot${idx}\u27E7`;
    return ciMap.get(key) ?? _match;
  });

  // Fallback: match any remaining garbled VPROT patterns
  result = result.replace(/[^\w\s]{1,6}VPROT(\d+)[^\w\s]{1,6}/gi, (_match, idx) => {
    const key = `\u27E6vprot${idx}\u27E7`;
    if (ciMap.has(key)) return ciMap.get(key)!;
    return _match;
  });

  return result;
}

/**
 * Convert placeholders to LLM-friendly format [[VPROT_n]].
 */
export function placeholdersToLLMFormat(text: string): string {
  return text.replace(/\u27E6VPROT(\d+)\u27E7/g, '[[VPROT_$1]]');
}

/**
 * Convert [[VPROT_n]] back to ⟦VPROTn⟧.
 */
export function llmFormatToPlaceholders(text: string): string {
  return text.replace(/\[\[\s*VPROT[_\s]*(\d+)\s*\]\]/gi, (_m, n) => `\u27E6VPROT${n}\u27E7`);
}
