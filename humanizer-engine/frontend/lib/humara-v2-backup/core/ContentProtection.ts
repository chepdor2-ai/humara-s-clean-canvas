/**
 * Humara ContentProtection — Protect sensitive content from transformation
 * 
 * Protects:
 * - Dollar amounts: $500,000, $3,500, $917
 * - Percentages: 20%, 6.5%, 0.5%
 * - Decimal numbers: 5.56, 3.14159, 2.718
 * - Large figures: 100,000, 1,000,000
 * - Dates: 2024, January 2025, Q3 2024
 * - Citations: (Antonius et al., 2024), (Smith, 2023)
 * - Bracketed content: [Client Name], [Appendix A]
 * - Formulas/equations: E=mc², a² + b² = c²
 * - Email addresses, URLs
 * - Proper nouns / topic keywords
 * - Quoted strings
 * - Abbreviations: GDP, WHO, AI, USA
 */

export interface ProtectionMap {
  placeholder: string;
  original: string;
}

const PLACEHOLDER_PREFIX = '⟦PROT_';
const PLACEHOLDER_SUFFIX = '⟧';

/**
 * Build a unique placeholder for protected content
 */
function makePlaceholder(index: number): string {
  return `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`;
}

/**
 * Protect all sensitive content in text.
 * Returns the sanitized text and a restoration map.
 */
export function protectContent(text: string): { sanitized: string; map: ProtectionMap[] } {
  const map: ProtectionMap[] = [];
  let sanitized = text;
  let idx = 0;

  function protect(pattern: RegExp): void {
    sanitized = sanitized.replace(pattern, (match) => {
      const placeholder = makePlaceholder(idx);
      map.push({ placeholder, original: match });
      idx++;
      return placeholder;
    });
  }

  // ── Order matters: protect larger/more specific patterns first ──

  // 1. Citations: (Author et al., YYYY), (Author, YYYY), (Author & Author, YYYY)
  protect(/\([A-Z][a-zA-Z]*(?:\s+(?:et\s+al\.|&\s+[A-Z][a-zA-Z]*))*,\s*\d{4}[a-z]?\)/g);

  // 2. Bracketed content: [Client Name], [Appendix A], [Figure 1]
  protect(/\[[^\]]+\]/g);

  // 3. Quoted strings: "exact phrase", 'exact phrase'
  protect(/"[^"]{2,}"/g);

  // 4. Mathematical formulas/equations: E=mc², a²+b²=c², H₂O, CO₂
  protect(/[A-Za-z0-9]+[²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]+(?:\s*[+\-×÷=]\s*[A-Za-z0-9²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]+)*/g);

  // 5. Inline code / math notation with special chars
  protect(/\b\w+\s*[=<>≤≥≠±∓∞∑∏∫√]+\s*\w+/g);

  // 6. Email addresses
  protect(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);

  // 7. URLs
  protect(/https?:\/\/[^\s,)]+/g);

  // 8. Dollar amounts with commas: $500,000, $3,500.00, $917
  protect(/\$[\d,]+(?:\.\d+)?/g);

  // 9. Percentages: 20%, 6.5%, 0.5%
  protect(/\d+(?:\.\d+)?%/g);

  // 10. Decimal numbers with significance: 3.14, 5.56, 2.718
  protect(/\b\d+\.\d+\b/g);

  // 11. Large numbers with commas: 100,000, 1,000,000
  protect(/\b\d{1,3}(?:,\d{3})+\b/g);

  // 12. Ordinals: 1st, 2nd, 3rd, 4th, 21st
  protect(/\b\d+(?:st|nd|rd|th)\b/gi);

  // 13. Dates: year-only when contextual, month-year, Q1 2024
  protect(/\b(?:Q[1-4]\s+)?\d{4}\b(?=\s*\)|,|\s|\.)/g);

  // 14. Abbreviations (2+ uppercase letters): GDP, WHO, AI, USA, etc.
  protect(/\b[A-Z]{2,}\b/g);

  // 15. Standalone numbers that remain (plain integers in context)
  // Only protect numbers that appear significant (>= 2 digits or with context)
  protect(/\b\d{2,}\b/g);

  return { sanitized, map };
}

/**
 * Restore all protected content from placeholders.
 */
export function restoreContent(text: string, map: ProtectionMap[]): string {
  let restored = text;

  // Restore in reverse order to handle nested protections correctly
  for (let i = map.length - 1; i >= 0; i--) {
    const { placeholder, original } = map[i];
    // Use string replacement (not regex) to avoid special char issues
    const idx = restored.indexOf(placeholder);
    if (idx !== -1) {
      restored = restored.substring(0, idx) + original + restored.substring(idx + placeholder.length);
    }
  }

  return restored;
}

/**
 * Extract topic keywords from text that should be preserved exactly.
 * These are noun phrases that appear multiple times or are capitalized.
 */
export function extractTopicKeywords(text: string): string[] {
  const keywords: Set<string> = new Set();

  // Multi-word capitalized phrases (topic keywords like "Climate Change", "Artificial Intelligence")
  const capPhrases = text.match(/\b(?:[A-Z][a-z]+(?:\s+(?:of|and|the|in|for|to|on|with|by)\s+)?)+[A-Z][a-z]+\b/g);
  if (capPhrases) {
    for (const phrase of capPhrases) {
      if (phrase.length > 5) keywords.add(phrase);
    }
  }

  // Domain-specific terms (frequently appearing noun phrases)
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  // Words that appear 3+ times might be topic keywords
  for (const [word, count] of freq) {
    if (count >= 3 && word.length >= 5) {
      keywords.add(word);
    }
  }

  return Array.from(keywords);
}

/**
 * Protect topic keywords in text (prevent them from being swapped).
 */
export function protectTopicKeywords(
  text: string,
  keywords: string[]
): { sanitized: string; map: ProtectionMap[] } {
  const map: ProtectionMap[] = [];
  let sanitized = text;
  let idx = 1000; // Start at high index to avoid collision with content protection

  for (const keyword of keywords) {
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    sanitized = sanitized.replace(regex, (match) => {
      const placeholder = makePlaceholder(idx);
      map.push({ placeholder, original: match });
      idx++;
      return placeholder;
    });
  }

  return { sanitized, map };
}
