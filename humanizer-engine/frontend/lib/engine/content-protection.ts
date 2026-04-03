/**
 * Content Protection — Bracket, Figure, and Percentage Preservation
 * ==================================================================
 * Protects special content (brackets, figures, percentages, dates,
 * measurements, currency) from being mangled during humanization.
 * Applies across all three engines: ghost_mini, ghost_pro, ninja.
 */

export type ProtectionMap = Map<string, string>;

const PROTECTION_PATTERNS: RegExp[] = [
  // ── Phase 1: Containers (brackets, parentheses) ──
  /\[[^\]]*\]/g,                                           // [bracketed content]
  /\([^)]*\)/g,                                            // (all parenthetical content)

  // ── Phase 2: Currency (must come before standalone decimals) ──
  /\$\d+(?:,\d{3})*(?:\.\d+)?/g,                          // currency: $100, $1, $2.50, $1,234.56
  /£\d+(?:,\d{3})*(?:\.\d+)?/g,                           // GBP: £500
  /€\d+(?:,\d{3})*(?:\.\d+)?/g,                           // EUR: €200

  // ── Phase 3: Measurements with units (must come before standalone decimals) ──
  /\b\d+(?:\.\d+)?\s*(?:kg|g|mg|lb|oz|km|m|cm|mm|mi|ft|in|°[CF]|K|Hz|kHz|MHz|GHz|THz|GB|MB|KB|TB|PB|ml|L|dB|MW|kW|GW|ppm|ppb)\b/gi,

  // ── Phase 4: Percentages ──
  /\b\d+\.\d+%/g,                                         // decimal percentages: 3.5%, 45.7%
  /\b\d+%/g,                                               // integer percentages: 45%, 5%

  // ── Phase 5: References and academic content ──
  /\b(?:Figure|Fig\.|Table|Equation|Eq\.|Chart|Graph|Appendix|Section|Chapter)\s+\d+(?:\.\d+)*\b/gi,
  /\bp\s*[<>=≤≥]\s*(?:0\.\d+|\.\d+)\b/g,                  // p-values: p < 0.05
  /\b[nN]\s*=\s*\d+/g,                                    // sample sizes: N = 100, n = 50
  /\b(?:et\s+al\.|ibid\.|op\.\s*cit\.|loc\.\s*cit\.)/gi,  // academic references: et al., ibid.
  /\(\d{4}\)/g,                                            // year citations: (2023), (1999)

  // ── Phase 6: Dates ──
  /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g,                   // dates: 12/25/2023
  /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g,                     // ISO dates: 2023-12-25

  // ── Phase 7: Numbers ──
  /\b\d+(?:,\d{3})+\b/g,                                  // large numbers with commas: 1,234,567
  /\b\d+-[a-zA-Z]+(?:-[a-zA-Z]+)*\b/g,                    // number-word compounds: 360-degree, 24-hour

  // ── Phase 8: Standalone decimals (LAST — catches any remaining X.Y not already protected) ──
  /\b\d+\.\d+\b/g,                                        // standalone decimals: 0.53, 2.5, 3.14
];

/**
 * Replace special content with unique placeholders before processing.
 * Returns the sanitized text and a map to restore originals.
 */
export function protectSpecialContent(text: string): { text: string; map: ProtectionMap } {
  const map: ProtectionMap = new Map();
  let idx = 0;
  let result = text;

  for (let pi = 0; pi < PROTECTION_PATTERNS.length; pi++) {
    const pattern = PROTECTION_PATTERNS[pi];
    result = result.replace(new RegExp(pattern.source, pattern.flags), (match) => {
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
 * Also handles spaced variants (e.g., "⟦ PROT6 ⟧") that result from
 * tokenizers splitting Unicode brackets into separate tokens.
 */
export function restoreSpecialContent(text: string, map: ProtectionMap): string {
  let result = text;

  // Build case-insensitive lookup: normalized placeholder → original value
  const ciMap = new Map<string, string>();
  for (const [placeholder, original] of map) {
    // Normalize: strip spaces, lowercase
    const key = placeholder.replace(/\s+/g, '').toLowerCase();
    ciMap.set(key, original);
  }

  // Single regex pass: match all ⟦PROTn⟧ variants (case-insensitive, optional spaces)
  result = result.replace(/\u27E6\s*prot(\d+)\s*\u27E7/gi, (match, idx) => {
    const key = `\u27E6prot${idx}\u27E7`;
    return ciMap.get(key) ?? match;
  });

  return result;
}

/**
 * Convert ⟦PROTn⟧ and ⟦TRMn⟧ placeholders to LLM-friendly [[PROT_n]] format.
 * LLMs strip Unicode brackets but generally preserve [[...]] tokens.
 */
export function placeholdersToLLMFormat(text: string): string {
  return text
    .replace(/\u27E6PROT(\d+)\u27E7/g, '[[PROT_$1]]')
    .replace(/\u27E6TRM(\d+)\u27E7/g, '[[TRM_$1]]');
}

/**
 * Convert [[PROT_n]] and [[TRM_n]] back to ⟦PROTn⟧ / ⟦TRMn⟧ format.
 * Also handles common LLM garbling: extra spaces, lowercasing, missing brackets.
 */
export function llmFormatToPlaceholders(text: string): string {
  return text
    .replace(/\[\[\s*PROT[_\s]*(\d+)\s*\]\]/gi, (_m, n) => `\u27E6PROT${n}\u27E7`)
    .replace(/\[\[\s*TRM[_\s]*(\d+)\s*\]\]/gi, (_m, n) => `\u27E6TRM${n}\u27E7`);
}

// ══════════════════════════════════════════════════════════════════════════
// CONTENT TERM PROTECTION
// Shields proper nouns, domain terms, and multi-word content phrases
// from synonym replacement. Uses ⟦TRMn⟧ placeholders.
// ══════════════════════════════════════════════════════════════════════════

export type TermProtectionMap = Map<string, string>;

/**
 * Well-known domain compound terms that must never be broken by synonym swaps.
 * Each entry is lowercase — matching is case-insensitive.
 */
const PROTECTED_DOMAIN_TERMS: string[] = [
  // Science & Tech
  "artificial intelligence", "machine learning", "deep learning", "neural network",
  "natural language processing", "computer science", "data science", "data analysis",
  "climate change", "global warming", "greenhouse gas", "carbon dioxide", "carbon footprint",
  "renewable energy", "fossil fuel", "solar energy", "wind energy", "nuclear energy",
  "supply chain", "block chain", "blockchain", "cyber security", "cybersecurity",
  "quantum computing", "internet of things", "virtual reality", "augmented reality",
  "genetic engineering", "gene therapy", "stem cell", "clinical trial",
  // Social / Political
  "human rights", "civil rights", "social media", "public health", "mental health",
  "health care", "healthcare", "higher education", "public policy", "foreign policy",
  "united nations", "european union", "world health organization", "supreme court",
  "economic growth", "gross domestic product", "free trade", "minimum wage",
  "real estate", "stock market", "interest rate", "inflation rate",
  // Academic
  "case study", "literature review", "peer review", "evidence based", "evidence-based",
  "critical thinking", "problem solving", "decision making", "best practice",
  "standard deviation", "confidence interval", "statistical significance",
  "qualitative research", "quantitative research", "mixed methods",
  "independent variable", "dependent variable", "control group",
  "informed consent", "institutional review board",
  // Business
  "project management", "risk management", "quality assurance", "customer service",
  "intellectual property", "due diligence", "return on investment",
  "competitive advantage", "market share", "brand awareness",
  // Misc
  "developing country", "developing countries", "developed country", "developed countries",
  "third world", "middle class", "working class", "cost effective", "cost-effective",
  "long term", "long-term", "short term", "short-term", "well being", "well-being",
  "trade off", "trade-off", "side effect", "side effects",
];

/**
 * Detect and protect content terms from synonym swaps.
 *
 * Protects:
 * 1. Known domain compound terms (e.g., "climate change", "machine learning")
 * 2. Multi-word proper nouns detected from capitalization (e.g., "United States", "John Smith")
 * 3. Single proper nouns that appear capitalized mid-sentence
 *
 * Returns text with ⟦TRMn⟧ placeholders and a map to restore them.
 */
export function protectContentTerms(text: string): { text: string; map: TermProtectionMap } {
  const map: TermProtectionMap = new Map();
  let idx = 0;
  let result = text;

  // --- Phase 1: Protect known domain compound terms (case-insensitive) ---
  // Sort by length descending so longer phrases match first
  const sortedTerms = [...PROTECTED_DOMAIN_TERMS].sort((a, b) => b.length - a.length);
  for (const term of sortedTerms) {
    const escaped = term.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    result = result.replace(regex, (match) => {
      const placeholder = `\u27E6TRM${idx}\u27E7`;
      map.set(placeholder, match);
      idx++;
      return placeholder;
    });
  }

  // --- Phase 2: Protect multi-word proper noun sequences ---
  // Matches 2+ consecutive capitalized words NOT at sentence start
  // e.g., "the United States has" → protects "United States"
  result = result.replace(
    /(?<=[a-z,;:]\s)((?:[A-Z][a-zA-Z'-]+\s+){1,5}[A-Z][a-zA-Z'-]+)/g,
    (match) => {
      // Skip if it's just common words or already protected
      const words = match.trim().split(/\s+/);
      const SKIP = new Set([
        "the", "and", "for", "with", "from", "this", "that", "also", "but",
        "not", "are", "was", "were", "has", "have", "had", "been", "its",
        "can", "may", "will", "shall", "should", "would", "could",
      ]);
      // If ALL words are skip-words, don't protect
      if (words.every(w => SKIP.has(w.toLowerCase()))) return match;
      // Must have at least one word with 3+ chars that is capitalized
      if (!words.some(w => w.length >= 3 && /^[A-Z]/.test(w))) return match;

      const placeholder = `\u27E6TRM${idx}\u27E7`;
      map.set(placeholder, match);
      idx++;
      return placeholder;
    }
  );

  // --- Phase 3: Protect single proper nouns (capitalized mid-sentence) ---
  // Only protect words that appear capitalized mid-sentence (not after period)
  // and are NOT common English words
  const COMMON_WORDS = new Set([
    "the", "and", "for", "with", "from", "into", "that", "this", "these", "those",
    "also", "both", "each", "most", "some", "such", "very", "just", "more",
    "about", "after", "before", "between", "through", "during", "within",
    "which", "where", "while", "when", "what", "how", "why", "who",
    "however", "therefore", "furthermore", "moreover", "consequently",
    "although", "because", "since", "until", "unless", "whether",
    "introduction", "conclusion", "summary", "abstract", "discussion", "results",
    "methods", "background", "analysis", "overview", "review",
    "important", "significant", "critical", "effective", "fundamental",
    "research", "theory", "practice", "policy", "process", "system",
    "but", "not", "are", "was", "were", "has", "have", "had", "been",
    "can", "may", "will", "shall", "should", "would", "could", "did",
    "its", "his", "her", "our", "their", "your", "she", "they", "one",
  ]);

  // Collect words that appear capitalized mid-sentence
  const midSentenceProper = new Set<string>();
  const midMatches = result.matchAll(/(?<=[a-z,;:]\s)([A-Z][a-z]{2,})/g);
  for (const m of midMatches) {
    const w = m[1];
    if (!COMMON_WORDS.has(w.toLowerCase()) && !w.includes("\u27E6")) {
      midSentenceProper.add(w);
    }
  }

  // Protect each identified proper noun everywhere in the text
  for (const proper of midSentenceProper) {
    const regex = new RegExp(`\\b${proper}\\b`, "g");
    result = result.replace(regex, (match) => {
      // Skip if already inside a placeholder
      if (result.charAt(result.indexOf(match) - 1) === "\u27E6") return match;
      const placeholder = `\u27E6TRM${idx}\u27E7`;
      map.set(placeholder, match);
      idx++;
      return placeholder;
    });
  }

  return { text: result, map };
}

/**
 * Restore all ⟦TRMn⟧ placeholders with their original content terms.
 */
export function restoreContentTerms(text: string, map: TermProtectionMap): string {
  let result = text;

  // Build case-insensitive lookup
  const ciMap = new Map<string, string>();
  for (const [placeholder, original] of map) {
    const key = placeholder.replace(/\s+/g, '').toLowerCase();
    ciMap.set(key, original);
  }

  // Single regex pass: match all ⟦TRMn⟧ variants (case-insensitive, optional spaces)
  result = result.replace(/\u27E6\s*trm(\d+)\s*\u27E7/gi, (match, idx) => {
    const key = `\u27E6trm${idx}\u27E7`;
    return ciMap.get(key) ?? match;
  });

  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// OUTPUT REPETITION CLEANUP
// Final-stage dedup that catches consecutive duplicate clauses,
// near-duplicate sentences, and repeated phrase patterns — then
// introduces phrasal verb alternatives for over-used expressions.
// ══════════════════════════════════════════════════════════════════════════

/**
 * Phrasal verb alternatives for common repeated verbs/phrases.
 * When a verb or phrase appears 3+ times in the text, one occurrence
 * is swapped with a phrasal verb variant to break the pattern.
 */
const PHRASAL_VERB_SWAPS: Record<string, string[]> = {
  "handle": ["deal with", "take care of", "look after"],
  "handles": ["deals with", "takes care of", "looks after"],
  "address": ["go over", "look into", "take on"],
  "addresses": ["goes over", "looks into", "takes on"],
  "establish": ["set up", "put together", "lay down"],
  "establishes": ["sets up", "puts together", "lays down"],
  "maintain": ["keep up", "hold on to", "stick with"],
  "maintains": ["keeps up", "holds on to", "sticks with"],
  "implement": ["carry out", "put into practice", "roll out"],
  "implements": ["carries out", "puts into practice", "rolls out"],
  "investigate": ["look into", "dig into", "check out"],
  "investigates": ["looks into", "digs into", "checks out"],
  "require": ["call for", "ask for", "count on"],
  "requires": ["calls for", "asks for", "counts on"],
  "provide": ["come up with", "bring about", "hand over"],
  "provides": ["comes up with", "brings about", "hands over"],
  "demonstrate": ["show off", "point out", "bring out"],
  "demonstrates": ["shows off", "points out", "brings out"],
  "indicate": ["point to", "hint at", "speak to"],
  "indicates": ["points to", "hints at", "speaks to"],
  "contribute": ["add to", "chip in", "pitch in"],
  "contributes": ["adds to", "chips in", "pitches in"],
  "facilitate": ["help with", "smooth out", "open up"],
  "facilitates": ["helps with", "smooths out", "opens up"],
  "eliminate": ["get rid of", "do away with", "cut out"],
  "eliminates": ["gets rid of", "does away with", "cuts out"],
  "determine": ["figure out", "find out", "work out"],
  "determines": ["figures out", "finds out", "works out"],
  "encounter": ["run into", "come across", "bump into"],
  "encounters": ["runs into", "comes across", "bumps into"],
  "develop": ["build up", "come up with", "put together"],
  "develops": ["builds up", "comes up with", "puts together"],
  "examine": ["go through", "look over", "check into"],
  "examines": ["goes through", "looks over", "checks into"],
  "discover": ["find out", "stumble on", "come across"],
  "discovers": ["finds out", "stumbles on", "comes across"],
  "support": ["back up", "stand behind", "hold up"],
  "supports": ["backs up", "stands behind", "holds up"],
  "increase": ["go up", "ramp up", "build up"],
  "increases": ["goes up", "ramps up", "builds up"],
  "decrease": ["go down", "cut back", "drop off"],
  "decreases": ["goes down", "cuts back", "drops off"],
  "continue": ["keep on", "carry on", "go on"],
  "continues": ["keeps on", "carries on", "goes on"],
  "consider": ["think about", "look at", "weigh up"],
  "considers": ["thinks about", "looks at", "weighs up"],
  "produce": ["turn out", "put out", "bring about"],
  "produces": ["turns out", "puts out", "brings about"],
  "improve": ["build on", "step up", "beef up"],
  "improves": ["builds on", "steps up", "beefs up"],
  "create": ["put together", "set up", "come up with"],
  "creates": ["puts together", "sets up", "comes up with"],
  "ensure": ["make sure", "see to it", "look out for"],
  "ensures": ["makes sure", "sees to it", "looks out for"],
  "affect": ["bear on", "play into", "weigh on"],
  "affects": ["bears on", "plays into", "weighs on"],
  "resolve": ["sort out", "clear up", "work through"],
  "resolves": ["sorts out", "clears up", "works through"],
  "analyze": ["break down", "go through", "look into"],
  "analyzes": ["breaks down", "goes through", "looks into"],
  "utilize": ["make use of", "draw on", "put to work"],
  "utilizes": ["makes use of", "draws on", "puts to work"],
  "transform": ["turn around", "shake up", "make over"],
  "transforms": ["turns around", "shakes up", "makes over"],
};

/**
 * Sentence-tokenize for the cleanup module.
 * Splits on .!? followed by space + uppercase, respecting abbreviations.
 */
function splitSentences(text: string): string[] {
  return robustSentenceSplit(text);
}

/**
 * Simple Jaccard word-overlap similarity (0–1).
 */
function jaccardSim(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(w => w.length > 2));
  const setB = new Set(b.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(w => w.length > 2));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

/**
 * Final output repetition cleanup. Runs after all transforms, before return.
 *
 * Steps:
 * 1. Remove consecutive duplicate clauses ("or so it seemed, or so it seemed")
 * 2. Remove near-duplicate sentences (Jaccard ≥ 0.80) — keep first occurrence
 * 3. Inject phrasal verbs for words that appear 3+ times across the text
 */
export function cleanOutputRepetitions(text: string): string {
  if (!text?.trim()) return text;

  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

  const cleanedParagraphs = paragraphs.map(para => {
    const trimmed = para.trim();
    if (!trimmed) return "";

    // Skip headings
    if (/^#{1,6}\s/.test(trimmed) || (trimmed.split(/\s+/).length <= 10 && !/[.!?]$/.test(trimmed))) {
      return trimmed;
    }

    let result = trimmed;

    // ── Step 1: Remove consecutive duplicate clauses ──
    // Catches: "Or so it seemed, or so it seemed" / "Because of this, because of this"
    // Match a clause (3+ words ending with comma or period) immediately followed by the same text
    result = result.replace(
      /(\b[A-Za-z][a-z]+(?:\s+[a-z]+){2,}[,.])\s*\1/gi,
      "$1"
    );

    // Also catch exact sentence duplicates within same paragraph
    // "This is a test. This is a test." → "This is a test."
    result = result.replace(
      /(\b[A-Z][^.!?]{8,}[.!?])\s*\1/g,
      "$1"
    );

    // ── Step 2: Remove near-duplicate sentences within paragraph ──
    const sentences = splitSentences(result);
    if (sentences.length > 1) {
      const kept: string[] = [sentences[0]];
      for (let i = 1; i < sentences.length; i++) {
        const s = sentences[i];
        let isDupe = false;
        for (const k of kept) {
          if (jaccardSim(s, k) >= 0.80) {
            isDupe = true;
            break;
          }
        }
        if (!isDupe) kept.push(s);
      }
      // Only remove if we're not killing the whole paragraph
      if (kept.length >= 1) {
        result = kept.join(" ");
      }
    }

    return result;
  });

  let output = cleanedParagraphs.filter(Boolean).join("\n\n");

  // ── Step 3: Cross-paragraph near-duplicate sentence removal ──
  // Collect ALL sentences, remove later duplicates globally
  const allSentences = splitSentences(output);
  if (allSentences.length > 2) {
    const seen: string[] = [];
    const dupes = new Set<string>();
    for (const s of allSentences) {
      for (const prev of seen) {
        if (jaccardSim(s, prev) >= 0.82) {
          dupes.add(s);
          break;
        }
      }
      seen.push(s);
    }
    if (dupes.size > 0) {
      // Remove duplicate sentences from the text but preserve paragraph structure
      const paras = output.split(/\n\s*\n/).filter(p => p.trim());
      output = paras.map(para => {
        const pSents = splitSentences(para);
        const filtered = pSents.filter(s => !dupes.has(s));
        return filtered.length > 0 ? filtered.join(" ") : pSents[0]; // keep at least first sentence
      }).filter(Boolean).join("\n\n");
    }
  }

  // ── Step 4: Phrasal verb injection for over-repeated words ──
  // Count verb occurrences across entire text
  const wordCounts = new Map<string, number>();
  const lowerText = output.toLowerCase();
  const textWords = lowerText.match(/\b[a-z]+\b/g) ?? [];
  for (const w of textWords) wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);

  // For words appearing 3+ times that have phrasal verb alternatives, swap one occurrence
  for (const [verb, alternatives] of Object.entries(PHRASAL_VERB_SWAPS)) {
    const count = wordCounts.get(verb) ?? 0;
    if (count < 3) continue;

    // Replace the SECOND occurrence (keep first, swap second, leave rest)
    let occurrenceIdx = 0;
    const regex = new RegExp(`\\b${verb}\\b`, "gi");
    output = output.replace(regex, (match) => {
      occurrenceIdx++;
      if (occurrenceIdx === 2) {
        const alt = alternatives[Math.floor(Math.random() * alternatives.length)];
        // Preserve capitalization
        if (match[0] === match[0].toUpperCase()) {
          return alt[0].toUpperCase() + alt.slice(1);
        }
        return alt;
      }
      return match;
    });
  }

  // ── Step 5: Clean up artifacts ──
  output = output.replace(/ {2,}/g, " ");
  output = output.replace(/,\s*,/g, ",");
  output = output.replace(/\.\s*\./g, ".");

  return output;
}

// ══════════════════════════════════════════════════════════════════════════
// ROBUST SENTENCE SPLITTING
// Correctly handles decimals, percentages, abbreviations, and references.
// Never breaks on decimal points (0.53), abbreviations (e.g., Dr., etc.),
// or mid-sentence periods in references (Fig. 1, Eq. 3.2).
// ══════════════════════════════════════════════════════════════════════════

/** Abbreviations whose trailing dot is NOT a sentence boundary */
const ABBREVIATION_RE = /(?:Dr|Mr|Mrs|Ms|Prof|Jr|Sr|vs|etc|e\.g|i\.e|al|St|Mt|Sgt|Lt|Gen|Gov|Inc|Corp|Ltd|Co|Ave|Blvd|Dept|Est|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fig|Eq|Vol|Ed|Rev|No|approx|est|min|max|avg)\./gi;

/**
 * Split text into sentences without breaking on decimals, percentages,
 * abbreviations, or reference numbers.
 *
 * Algorithm:
 * 1. Shield decimals/floats (3.14), percentages (45.7%), abbreviations (e.g.),
 *    ellipses (...), references (Fig. 2), initials (J. K.) with placeholders.
 * 2. Split on sentence-ending punctuation followed by whitespace + capital letter
 *    or end-of-string.
 * 3. Restore all placeholders.
 */
export function robustSentenceSplit(text: string): string[] {
  if (!text || !text.trim()) return [];

  const shields: Map<string, string> = new Map();
  let shieldIdx = 0;
  const shield = (match: string): string => {
    const key = `\x00SH${shieldIdx++}\x00`;
    shields.set(key, match);
    return key;
  };

  let t = text;

  // Shield existing ⟦PROTn⟧ / ⟦TRMn⟧ placeholders
  t = t.replace(/\u27E6[^\u27E7]*\u27E7/g, m => shield(m));

  // Shield ellipses
  t = t.replace(/\.{3}/g, m => shield(m));

  // Shield decimal numbers: 0.53, 3.14159, -2.7, +1.0
  t = t.replace(/[+-]?\d+\.\d+/g, m => shield(m));

  // Shield ordinal-style section references: 2.3.1, 10.2
  t = t.replace(/\b\d+(?:\.\d+)+\b/g, m => shield(m));

  // Shield known abbreviations (e.g., Dr., Fig., etc.)
  t = t.replace(ABBREVIATION_RE, m => shield(m));

  // Shield single-letter initials: A. B. C.
  t = t.replace(/\b[A-Z]\./g, m => shield(m));

  // Shield URLs (http://... or www....)
  t = t.replace(/https?:\/\/[^\s]+/gi, m => shield(m));
  t = t.replace(/www\.[^\s]+/gi, m => shield(m));

  // Now split: a sentence ends with . ! or ? followed by space and uppercase,
  // or followed by end-of-string (with optional trailing whitespace).
  // Also handle quotes: ." or ?"
  const sentenceRe = /([.!?]["'\u201D\u2019]?)\s+(?=[A-Z\u27E6])/g;
  const parts: string[] = [];
  let lastIdx = 0;

  let match: RegExpExecArray | null;
  while ((match = sentenceRe.exec(t)) !== null) {
    const end = match.index + match[1].length;
    parts.push(t.slice(lastIdx, end));
    lastIdx = end;
    // Skip the whitespace
    while (lastIdx < t.length && /\s/.test(t[lastIdx])) lastIdx++;
  }
  if (lastIdx < t.length) parts.push(t.slice(lastIdx));

  // Restore all shields
  const unshield = (s: string): string => {
    let result = s;
    for (const [key, val] of shields) {
      while (result.includes(key)) result = result.replace(key, val);
    }
    return result;
  };

  return parts
    .map(s => unshield(s).trim())
    .filter(s => s.length > 0);
}

// ══════════════════════════════════════════════════════════════════════════
// STRUCTURED TEXT PRE-PROCESSING
// Master pre-processor that:
//   1. Identifies and preserves titles/headings
//   2. Splits paragraphs correctly
//   3. Splits sentences using robustSentenceSplit (decimal-safe)
//   4. Returns a structured representation for the engine to process
// ══════════════════════════════════════════════════════════════════════════

export interface StructuredParagraph {
  /** True if this paragraph is a title/heading — should not be heavily transformed */
  isTitle: boolean;
  /** The original text of the paragraph (or title) */
  original: string;
  /** Sentences extracted from this paragraph (empty array for titles) */
  sentences: string[];
}

export interface PreprocessedText {
  paragraphs: StructuredParagraph[];
  /** Total count of content (non-title) paragraphs */
  contentParagraphCount: number;
}

/** Detect whether a paragraph is a title or heading */
function isHeading(para: string): boolean {
  const trimmed = para.trim();
  if (!trimmed) return false;
  // Markdown headings
  if (/^#{1,6}\s/.test(trimmed)) return true;
  // Roman numerals: IV. Something
  if (/^[IVXLCDM]+\.\s/i.test(trimmed)) return true;
  // Numbered: 1. Something, 2) Something
  if (/^\d+[.)]\s/.test(trimmed)) return true;
  // Standard headings
  if (/^(Introduction|Conclusion|Summary|Abstract|Background|Discussion|Results|Methods|References|Bibliography|Acknowledgments|Appendix)\s*:?\s*$/i.test(trimmed)) return true;
  // Part/Section/Chapter headings
  if (/^(Part|Section|Chapter)\s+\d/i.test(trimmed)) return true;
  // Short non-punctuated lines (≤10 words, no sentence-ending punctuation)
  const words = trimmed.split(/\s+/);
  if (words.length <= 10 && !/[.!?]$/.test(trimmed)) return true;
  // ALL CAPS lines under 12 words
  if (words.length <= 12 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) return true;
  return false;
}

/**
 * Pre-process text into a structured representation.
 * Correctly identifies titles, paragraph boundaries, and splits sentences
 * using the decimal-safe robustSentenceSplit.
 */
export function preprocessText(text: string): PreprocessedText {
  if (!text || !text.trim()) return { paragraphs: [], contentParagraphCount: 0 };

  // Split on double newlines (paragraph boundaries)
  const rawParagraphs = text.split(/\n\s*\n/).filter(p => p.trim());

  const paragraphs: StructuredParagraph[] = [];
  let contentCount = 0;

  for (const rawPara of rawParagraphs) {
    const trimmed = rawPara.trim();
    if (!trimmed) continue;

    if (isHeading(trimmed)) {
      paragraphs.push({ isTitle: true, original: trimmed, sentences: [] });
    } else {
      // Normalize single newlines within a paragraph to spaces
      const normalized = trimmed.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
      const sentences = robustSentenceSplit(normalized);
      paragraphs.push({ isTitle: false, original: trimmed, sentences });
      contentCount++;
    }
  }

  return { paragraphs, contentParagraphCount: contentCount };
}

/**
 * Reassemble structured paragraphs back into a single text string.
 * Preserves paragraph breaks (double newlines) and title formatting.
 */
export function reassembleText(paragraphs: StructuredParagraph[]): string {
  return paragraphs
    .map(p => {
      if (p.isTitle) return p.original;
      if (p.sentences.length === 0) return p.original;
      return p.sentences.join(" ");
    })
    .join("\n\n");
}

// ══════════════════════════════════════════════════════════════════════════
// GLOBAL STATISTICAL MERGE/SPLIT
// Post-process step applied AFTER all humanization is complete.
// For every 20 sentences globally: merge 1-2 short adjacent pairs,
// split 1-2 long sentences at clause boundaries.
// Operates within paragraph boundaries (never merges across paragraphs).
// ══════════════════════════════════════════════════════════════════════════

const GLOBAL_MERGE_CONNECTORS = [
  ", and ", ", but ", ", so ", ", yet ",
  ", which ", ", since ", ", while ", ", as ",
  ", although ", ", particularly ", ", especially ",
];

function globalMergeSentences(s1: string, s2: string): string {
  const clean1 = s1.replace(/\.\s*$/, "");
  const lower2 = s2[0]?.toLowerCase() + s2.slice(1);
  const conn = GLOBAL_MERGE_CONNECTORS[Math.floor(Math.random() * GLOBAL_MERGE_CONNECTORS.length)];
  return clean1 + conn + lower2;
}

function globalSplitSentence(sent: string): string[] {
  const words = sent.split(/\s+/);
  if (words.length < 14) return [sent];

  const clausePatterns = [
    /,\s+and\s+/i, /,\s+but\s+/i, /;\s+/,
    /,\s+which\s+/i, /,\s+while\s+/i, /,\s+although\s+/i,
    /,\s+however\s+/i, /,\s+yet\s+/i,
  ];
  for (const pattern of clausePatterns) {
    const match = sent.match(pattern);
    if (match && match.index !== undefined) {
      const part1 = sent.slice(0, match.index).trim();
      const part2 = sent.slice(match.index + match[0].length).trim();
      if (part1.split(/\s+/).length >= 5 && part2.split(/\s+/).length >= 5) {
        const p1 = part1.endsWith(".") ? part1 : part1 + ".";
        const p2 = part2[0]?.toUpperCase() + part2.slice(1);
        return [p1, p2];
      }
    }
  }

  // Fallback: split at a middle comma
  const midStart = Math.floor(words.length * 0.35);
  const midEnd = Math.floor(words.length * 0.65);
  for (let i = midStart; i <= midEnd; i++) {
    if (words[i]?.endsWith(",")) {
      const part1 = words.slice(0, i + 1).join(" ").replace(/,\s*$/, ".");
      const rest = words.slice(i + 1).join(" ").trim();
      if (rest.length > 0 && rest.split(/\s+/).length >= 5) {
        const part2 = rest[0]?.toUpperCase() + rest.slice(1);
        return [part1, part2];
      }
    }
  }

  return [sent];
}

/**
 * Global statistical merge/split — applied AFTER all humanization.
 * For every ~20 sentences: merge 1-2 short adjacent pairs and split 1-2 long sentences.
 * Operates within paragraph boundaries only.
 */
export function applyGlobalMergeSplit(text: string): string {
  if (!text?.trim()) return text;

  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

  // Collect all sentences with their paragraph index
  const allItems: { text: string; paraIdx: number }[] = [];
  const paraInfo: { isHeading: boolean }[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    const heading = isHeading(p);
    paraInfo.push({ isHeading: heading });
    if (heading) continue;
    const sents = robustSentenceSplit(p);
    for (const s of sents) {
      allItems.push({ text: s, paraIdx: i });
    }
  }

  const totalSentences = allItems.length;
  if (totalSentences < 5) return text;

  // For every 20 sentences: merge 1-2, split 1-2
  const ratio = Math.max(1, Math.floor(totalSentences / 20));
  const mergeTarget = Math.max(1, Math.min(2, ratio + (Math.random() < 0.5 ? 1 : 0)));
  const splitTarget = Math.max(1, Math.min(2, ratio + (Math.random() < 0.5 ? 1 : 0)));

  // Phase 1: Split long sentences (>20 words) at clause boundaries
  let splitsDone = 0;
  const afterSplit: typeof allItems = [];
  for (const item of allItems) {
    const wc = item.text.split(/\s+/).length;
    if (splitsDone < splitTarget && wc > 20 && Math.random() < 0.7) {
      const parts = globalSplitSentence(item.text);
      if (parts.length > 1) {
        for (const part of parts) {
          afterSplit.push({ text: part, paraIdx: item.paraIdx });
        }
        splitsDone++;
        continue;
      }
    }
    afterSplit.push(item);
  }

  // Phase 2: Merge short adjacent sentences (both <15 words, same paragraph)
  let mergesDone = 0;
  const afterMerge: typeof allItems = [];
  let skip = false;
  for (let i = 0; i < afterSplit.length; i++) {
    if (skip) { skip = false; continue; }
    const wc1 = afterSplit[i].text.split(/\s+/).length;
    const next = afterSplit[i + 1];
    if (next && next.paraIdx === afterSplit[i].paraIdx &&
        mergesDone < mergeTarget && wc1 < 15 && wc1 >= 3) {
      const wc2 = next.text.split(/\s+/).length;
      if (wc2 < 15 && wc2 >= 3 && Math.random() < 0.65) {
        afterMerge.push({
          text: globalMergeSentences(afterSplit[i].text, next.text),
          paraIdx: afterSplit[i].paraIdx,
        });
        mergesDone++;
        skip = true;
        continue;
      }
    }
    afterMerge.push(afterSplit[i]);
  }

  // Reassemble paragraphs
  const rebuilt: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    if (paraInfo[i].isHeading) {
      rebuilt.push(paragraphs[i].trim());
      continue;
    }
    const paraSents = afterMerge.filter(item => item.paraIdx === i).map(item => item.text);
    rebuilt.push(paraSents.length > 0 ? paraSents.join(" ") : paragraphs[i].trim());
  }

  return rebuilt.join("\n\n");
}

// ══════════════════════════════════════════════════════════════════════════
// STRICT SENTENCE COUNT ENFORCEMENT
// Ensures output sentence count exactly matches input sentence count.
// No splitting, no merging — just 1:1 mapping guaranteed.
// ══════════════════════════════════════════════════════════════════════════

/**
 * Count non-heading sentences in text (paragraph-aware).
 */
export function countSentences(text: string): number {
  if (!text?.trim()) return 0;
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  let count = 0;
  for (const para of paragraphs) {
    const p = para.trim();
    if (isHeading(p)) continue;
    count += robustSentenceSplit(p).filter(s => s.trim()).length;
  }
  return count;
}

/**
 * Strictly enforce that output has the same sentence count as input.
 * If output has MORE sentences: merge the shortest surplus sentences with their neighbors.
 * If output has FEWER sentences: split the longest sentences at clause boundaries.
 * This is a LAST RESORT safety net — the pipeline should already produce 1:1 mapping.
 */
export function enforceSentenceCountStrict(output: string, inputSentenceCount: number): string {
  if (!output?.trim() || inputSentenceCount <= 0) return output;

  const paragraphs = output.split(/\n\s*\n/).filter(p => p.trim());

  // Build flat list of all sentences with paragraph tracking
  const items: { text: string; paraIdx: number; isHeading: boolean }[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    if (isHeading(p)) {
      items.push({ text: p, paraIdx: i, isHeading: true });
      continue;
    }
    const sents = robustSentenceSplit(p);
    for (const s of sents) {
      if (s.trim()) items.push({ text: s, paraIdx: i, isHeading: false });
    }
  }

  const contentItems = items.filter(it => !it.isHeading);
  const currentCount = contentItems.length;

  if (currentCount === inputSentenceCount) return output; // Already exact

  console.log(`  [SentenceEnforce] Count mismatch: have ${currentCount}, need ${inputSentenceCount}`);

  if (currentCount > inputSentenceCount) {
    // Too many sentences: merge shortest adjacent pairs (same paragraph)
    let excess = currentCount - inputSentenceCount;
    while (excess > 0) {
      // Find shortest content sentence
      let shortestIdx = -1;
      let shortestLen = Infinity;
      for (let i = 0; i < items.length; i++) {
        if (items[i].isHeading) continue;
        const wc = items[i].text.split(/\s+/).length;
        if (wc < shortestLen) {
          shortestLen = wc;
          shortestIdx = i;
        }
      }
      if (shortestIdx === -1) break;

      // Find an adjacent non-heading sentence in the same paragraph to merge with
      let mergeWith = -1;
      // Prefer merging with previous
      if (shortestIdx > 0 && !items[shortestIdx - 1].isHeading &&
          items[shortestIdx - 1].paraIdx === items[shortestIdx].paraIdx) {
        mergeWith = shortestIdx - 1;
      } else if (shortestIdx < items.length - 1 && !items[shortestIdx + 1].isHeading &&
          items[shortestIdx + 1].paraIdx === items[shortestIdx].paraIdx) {
        mergeWith = shortestIdx + 1;
      }

      if (mergeWith === -1) break; // Can't merge anymore

      const first = Math.min(shortestIdx, mergeWith);
      const second = Math.max(shortestIdx, mergeWith);
      const merged = items[first].text.replace(/\.\s*$/, "") + "; " +
        items[second].text[0]?.toLowerCase() + items[second].text.slice(1);
      items[first].text = merged;
      items.splice(second, 1);
      excess--;
    }
  } else {
    // Too few sentences: split longest sentences at clause boundaries
    let deficit = inputSentenceCount - currentCount;
    while (deficit > 0) {
      // Find longest content sentence
      let longestIdx = -1;
      let longestLen = 0;
      for (let i = 0; i < items.length; i++) {
        if (items[i].isHeading) continue;
        const wc = items[i].text.split(/\s+/).length;
        if (wc > longestLen && wc >= 10) { // Only split if 10+ words
          longestLen = wc;
          longestIdx = i;
        }
      }
      if (longestIdx === -1) break;

      // Try to split at clause boundary
      const sent = items[longestIdx].text;
      const clausePatterns = [
        /,\s+and\s+/i, /,\s+but\s+/i, /;\s+/,
        /,\s+which\s+/i, /,\s+while\s+/i, /,\s+although\s+/i,
      ];
      let didSplit = false;
      for (const pat of clausePatterns) {
        const m = sent.match(pat);
        if (m && m.index !== undefined) {
          const p1 = sent.slice(0, m.index).trim();
          const p2 = sent.slice(m.index + m[0].length).trim();
          if (p1.split(/\s+/).length >= 4 && p2.split(/\s+/).length >= 4) {
            items[longestIdx].text = p1.endsWith(".") ? p1 : p1 + ".";
            items.splice(longestIdx + 1, 0, {
              text: p2[0]?.toUpperCase() + p2.slice(1),
              paraIdx: items[longestIdx].paraIdx,
              isHeading: false,
            });
            deficit--;
            didSplit = true;
            break;
          }
        }
      }
      if (!didSplit) break; // Can't split anymore
    }
  }

  // Reassemble
  const rebuilt: string[] = [];
  let curPara = -1;
  let curSents: string[] = [];
  for (const item of items) {
    if (item.paraIdx !== curPara) {
      if (curSents.length > 0) rebuilt.push(curSents.join(" "));
      curPara = item.paraIdx;
      curSents = [item.text];
    } else {
      curSents.push(item.text);
    }
  }
  if (curSents.length > 0) rebuilt.push(curSents.join(" "));

  return rebuilt.join("\n\n");
}
