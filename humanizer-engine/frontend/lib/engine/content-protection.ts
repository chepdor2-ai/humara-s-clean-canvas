/**
 * Content Protection — Bracket, Figure, and Percentage Preservation
 * ==================================================================
 * Protects special content (brackets, figures, percentages, dates,
 * measurements, currency) from being mangled during humanization.
 * Applies across all three engines: ghost_mini, ghost_pro, ninja.
 */

export type ProtectionMap = Map<string, string>;

const PROTECTION_PATTERNS: RegExp[] = [
  /\[[^\]]*\]/g,                                           // [bracketed content]
  /\([^)]*\d[^)]*\)/g,                                    // (content with numbers inside parentheses)
  /\d+(?:\.\d+)?%/g,                                      // percentages: 45%, 3.5%
  /\$\d+(?:,\d{3})*(?:\.\d+)?/g,                          // currency: $100, $1,234.56
  /£\d+(?:,\d{3})*(?:\.\d+)?/g,                           // GBP: £500
  /€\d+(?:,\d{3})*(?:\.\d+)?/g,                           // EUR: €200
  /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g,                   // dates: 12/25/2023, 25-12-2023
  /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g,                     // ISO dates: 2023-12-25
  /\b\d+(?:\.\d+)?\s*(?:kg|g|mg|lb|oz|km|m|cm|mm|mi|ft|in|°[CF]|K|Hz|kHz|MHz|GHz|THz|GB|MB|KB|TB|PB|ml|L|dB|MW|kW|GW|ppm|ppb)\b/gi, // measurements
  /\b(?:Figure|Fig\.|Table|Equation|Eq\.|Chart|Graph|Appendix|Section|Chapter)\s+\d+(?:\.\d+)*\b/gi, // references: Figure 1, Table 2.3
  /\bp\s*[<>=≤≥]\s*(?:0\.\d+|\.\d+)\b/g,                  // p-values: p < 0.05
  /\b[nN]\s*=\s*\d+/g,                                    // sample sizes: N = 100, n = 50
  /\b\d+(?:,\d{3})+\b/g,                                  // large numbers with commas: 1,234,567
];

/**
 * Replace special content with unique placeholders before processing.
 * Returns the sanitized text and a map to restore originals.
 */
export function protectSpecialContent(text: string): { text: string; map: ProtectionMap } {
  const map: ProtectionMap = new Map();
  let idx = 0;
  let result = text;

  for (const pattern of PROTECTION_PATTERNS) {
    result = result.replace(new RegExp(pattern.source, pattern.flags), (match) => {
      // Skip if already inside a placeholder
      const placeholder = `\u27E6PROT${idx}\u27E7`;
      map.set(placeholder, match);
      idx++;
      return placeholder;
    });
  }

  return { text: result, map };
}

/**
 * Restore all placeholders with their original content.
 */
export function restoreSpecialContent(text: string, map: ProtectionMap): string {
  let result = text;
  for (const [placeholder, original] of map) {
    // Use split+join for reliable replacement (no regex special char issues)
    while (result.includes(placeholder)) {
      result = result.replace(placeholder, original);
    }
  }
  return result;
}
