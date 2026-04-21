/**
 * Human Imperfections Injector
 * =============================
 * LAST phase — runs AFTER all cleaning (universal cleaning, grammar smooth,
 * de-duplication) so the imperfections stick. Injects minimal, realistic
 * human-writer quirks inspired by well-edited-but-human prose:
 *
 *   "population health, however, is a relatively new term and does not yet
 *    have an agreed-upon definition. Whether population health refers to a
 *    concept of health or a field of study of health determinants is not
 *    clear, and there is debate, often heated, about whether..."
 *
 * Those sentences have natural rhythm and occasional punctuation quirks
 * (em-dash parentheticals, variable serial comma, "often heated" inline
 * asides) that AI detectors treat as human fingerprints.
 *
 * Design rules:
 *   • NEVER introduce misspellings — modern detectors flag them.
 *   • NEVER break grammar or subject-verb agreement.
 *   • NEVER touch protected terms, named entities, numbers, citations.
 *   • Deterministic per input (stable seed) so results are reproducible.
 *   • Calibrated to 1–2 imperfections per paragraph, never more.
 *   • Strictly sentence-by-sentence.
 *
 * Categories enabled:
 *   A. Punctuation drift
 *      - Comma-aside → em-dash aside (30% on qualifying sentences)
 *      - Occasional oxford comma drop (25% on qualifying lists)
 *      - Compound-modifier hyphen removal on "well-X" / "often-X" (10%)
 *      - Paired em-dashes for short parenthetical phrases (20%)
 *   B. Lexical softening (connector and hedge variance)
 *      - Adverbial shift: "which" ↔ "that" (15%, edge-cases only)
 *      - Register mix: "In addition" → "Plus" is TOO casual; we prefer
 *        swapping restart-of-sentence "Additionally" / "Furthermore"
 *        into mid-sentence "also" (18%)
 *      - "In order to" → "to" collapse (25%)
 *   C. Micro-quirks
 *      - Mid-sentence inline aside "— often X —" on qualifying sentences
 *        (domain-appropriate adjective pool; 12%)
 *      - First-person softening: rarely inserts "in my view" / "as I see
 *        it" where the author is academic and a first-person clause
 *        already exists (8%; only if hasFirstPerson).
 */

import type { PaperProfile } from "./paper-profiler";
import type { HumanizationPlan } from "./paper-strategy-selector";
import { robustSentenceSplit } from "./content-protection";
import { looksLikeHeadingLine } from "./structure-preserver";

// ── Deterministic RNG ─────────────────────────────────────────────────

function deterministicRng(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) & 0xFFFFFFFF) / 0x100000000;
  };
}

// ── Protection helpers ────────────────────────────────────────────────

function isProtectedRegion(s: string, index: number): boolean {
  // Placeholder tokens [[PROT_x]], [[TRM_x]], citation parens, numbers
  const before = s.slice(Math.max(0, index - 40), index);
  const after = s.slice(index, Math.min(s.length, index + 40));
  const window = before + after;
  if (/\[\[(?:PROT|TRM)_\d+\]\]/.test(window)) return true;
  if (/\([A-Z][a-z]+(?:\s+et\s+al\.)?,?\s*\d{4}[a-z]?\)/.test(window)) return true;
  if (/\[\d+\]/.test(window)) return true;
  return false;
}

// ── Category A: Punctuation drift ─────────────────────────────────────

/**
 * Opening tokens that indicate a genuine adverbial or prepositional aside
 * (as opposed to a list item). "often heated", "in most cases", "by and
 * large", "at times murky", "in practice", "for once", "by any measure".
 * If an aside doesn't START with one of these, we treat it as a list item
 * and skip — this prevents mangling "outcomes, disparities, determinants".
 */
const ADVERBIAL_ASIDE_OPENERS = /^(?:often|still|rarely|usually|sometimes|always|seldom|typically|generally|mostly|mainly|largely|by|in|at|for|on|with|from|after|before|despite|though|although|however|whether|rather|indeed|even|admittedly|clearly|crucially|notably|of course|in practice|in most cases|at times|by and large|to be fair|so to speak|as such|if anything)\b/i;

/**
 * Convert a short adverbial comma-aside to an em-dash aside.
 * Examples:
 *   "debate, often heated, about" → "debate — often heated — about"
 *   "result, in most cases, came" → "result — in most cases — came"
 *
 * Rules:
 *   • The aside must be 2–6 words.
 *   • Must be flanked by commas.
 *   • Must START with an adverbial / prepositional opener (so we never
 *     mangle a list like "outcomes, disparities, determinants").
 *   • Must not contain a finite verb.
 *   • Fires at most once per sentence.
 */
function commaAsideToEmDash(sentence: string, rng: () => number): string {
  const re = /,\s+([a-z][a-z\s,'-]{3,40}?),\s+/gi;
  let modified = sentence;
  let fired = false;
  modified = modified.replace(re, (full, inner, offset: number) => {
    if (fired) return full;
    if (isProtectedRegion(sentence, offset)) return full;
    const trimmedInner = inner.trim();
    const wordCount = trimmedInner.split(/\s+/).length;
    if (wordCount < 2 || wordCount > 6) return full;
    // Must start with a recognized adverbial opener — prevents list mangling.
    if (!ADVERBIAL_ASIDE_OPENERS.test(trimmedInner)) return full;
    // Reject finite verbs inside the aside.
    if (/\b(is|are|was|were|be|been|has|have|had|will|would|should|does|did|do)\b/i.test(trimmedInner)) return full;
    // Reject internal comma — that would indicate a multi-item list.
    if (/,/.test(trimmedInner)) return full;
    if (rng() < 0.35) {
      fired = true;
      return ` — ${trimmedInner} — `;
    }
    return full;
  });
  return modified;
}

/**
 * Occasionally drop the oxford comma in lists of three: "X, Y, and Z".
 * Skip if the list contains complex items (commas inside items) or any
 * protected token.
 */
function dropOxfordComma(sentence: string, rng: () => number): string {
  const re = /\b(\w+(?:\s+\w+)?),\s+(\w+(?:\s+\w+)?),\s+and\s+(\w+(?:\s+\w+)?)/g;
  let fired = false;
  return sentence.replace(re, (match, a, b, c, offset: number) => {
    if (fired) return match;
    if (isProtectedRegion(sentence, offset)) return match;
    if (rng() < 0.25) {
      fired = true;
      return `${a}, ${b} and ${c}`;
    }
    return match;
  });
}

/**
 * Occasionally de-hyphenate common compound adverb-modifiers
 * when doing so remains grammatical ("well-known" → "well known"
 * before a noun is debatable; safer form: when used predicatively).
 */
function softenCompoundHyphens(sentence: string, rng: () => number): string {
  const pool = [
    /\bwell-known\b/g,
    /\blong-standing\b/g,
    /\boften-cited\b/g,
    /\bwidely-used\b/g,
  ];
  let fired = false;
  let out = sentence;
  for (const re of pool) {
    if (fired) break;
    out = out.replace(re, (match, offset: number) => {
      if (isProtectedRegion(sentence, offset)) return match;
      if (rng() < 0.10) {
        fired = true;
        return match.replace("-", " ");
      }
      return match;
    });
  }
  return out;
}

// ── Category B: Lexical softening ─────────────────────────────────────

/**
 * Collapse "in order to" → "to" — safe, preferred modern usage. Some
 * human writers leave "in order to" and some don't; flipping some
 * toward the shorter form while leaving others reflects real variance.
 */
function collapseInOrderTo(sentence: string, rng: () => number): string {
  const re = /\bin\s+order\s+to\b/gi;
  let fired = false;
  return sentence.replace(re, (match, offset: number) => {
    if (fired) return match;
    if (isProtectedRegion(sentence, offset)) return match;
    if (rng() < 0.30) {
      fired = true;
      return "to";
    }
    return match;
  });
}

/**
 * Move front-loaded "Additionally," / "Furthermore," / "Moreover," into
 * a softer mid-clause "also" — humans mix these positions freely while
 * AI strongly prefers the clause-initial form.
 *
 * "Additionally, the method improves accuracy." →
 *   "The method also improves accuracy."
 */
function softenFrontConnectors(sentence: string, rng: () => number): string {
  const re = /^(Additionally|Furthermore|Moreover),\s+(The|A|An|This|These|Those|That)\s+/;
  const m = sentence.match(re);
  if (!m) return sentence;
  if (rng() >= 0.20) return sentence;
  const article = m[2];
  const rest = sentence.slice(m[0].length);
  // Insert "also" after the subject noun phrase. Minimal heuristic: after
  // the first 1–3 word noun phrase we assume a verb boundary.
  const afterRe = /^(\w+(?:\s+\w+){0,2})\s+(\w+)\s+/;
  const am = rest.match(afterRe);
  if (!am) return sentence;
  const np = am[1];
  const verb = am[2];
  const tail = rest.slice(am[0].length);
  return `${article} ${np} also ${verb} ${tail}`;
}

// ── Category C: Micro-quirks ──────────────────────────────────────────

const DOMAIN_ASIDE_ADJECTIVES: Record<string, string[]> = {
  academic:   ["often heated", "still unresolved", "at times murky"],
  stem:       ["still debated", "often reported", "widely observed"],
  medical:    ["clinically important", "often subtle"],
  legal:      ["long-standing", "subject to revision"],
  business:   ["in most cases", "in practice"],
  humanities: ["often contested", "by and large"],
  creative:   ["in a manner of speaking"],
  technical:  ["in practice", "in most cases"],
  general:    ["in most cases", "in practice"],
};

/**
 * Insert a short inline aside on a qualifying sentence after the subject NP,
 * using a domain-appropriate adjective pool. Fires on 12% of qualifying
 * sentences max one per paragraph.
 *
 *   "There is debate about whether..." →
 *   "There is debate — often heated — about whether..."
 */
function injectInlineAside(sentence: string, domain: string, rng: () => number): string {
  // Qualifying pattern: a medium-length sentence with a "noun + of/about/regarding" frame.
  if (sentence.length < 80 || sentence.length > 260) return sentence;
  const reOf = /\b(debate|discussion|question|concern|argument|tension)\s+(about|regarding|over|around|on)\b/i;
  const m = sentence.match(reOf);
  if (!m) return sentence;
  const pool = DOMAIN_ASIDE_ADJECTIVES[domain] ?? DOMAIN_ASIDE_ADJECTIVES.general;
  if (rng() >= 0.12) return sentence;
  const phrase = pool[Math.floor(rng() * pool.length)];
  // Replace "debate about" → "debate — often heated — about"
  return sentence.replace(m[0], `${m[1]} — ${phrase} — ${m[2]}`);
}

// ── Main entry point ──────────────────────────────────────────────────

export interface HumanImperfectionOptions {
  profile?: PaperProfile;
  plan?: HumanizationPlan;
  /** Deterministic seed. Defaults to a hash of the input. */
  seed?: number;
  /** If false, skip all Category B word-choice swaps. Defaults to true. */
  enableLexical?: boolean;
  /** Override the max imperfections per paragraph. Defaults to 2. */
  maxPerParagraph?: number;
  onStage?: (stage: string) => void | Promise<void>;
}

export interface HumanImperfectionResult {
  text: string;
  injectedCount: number;
  perParagraphCounts: number[];
}

/**
 * Compute a simple hash of the input so the seed is deterministic.
 */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function injectHumanImperfections(
  text: string,
  options: HumanImperfectionOptions = {},
): HumanImperfectionResult {
  if (!text || text.trim().length === 0) {
    return { text, injectedCount: 0, perParagraphCounts: [] };
  }
  const seed = options.seed ?? hashString(text);
  const rng = deterministicRng(seed);
  const enableLexical = options.enableLexical !== false;
  const maxPerParagraph = Math.max(1, options.maxPerParagraph ?? 2);
  const domain = options.profile?.domain.primary ?? "general";
  // Conservative profiles (medical, legal) get fewer imperfections.
  const conservative = domain === "medical" || domain === "legal";
  const paragraphBudget = conservative ? 1 : maxPerParagraph;

  const paragraphs = text.split(/\n\s*\n/);
  const perParagraphCounts: number[] = [];
  let totalInjected = 0;

  const processed = paragraphs.map((para) => {
    const trimmed = para.trim();
    if (!trimmed) { perParagraphCounts.push(0); return para; }
    // Skip heading-only paragraphs
    if (trimmed.split("\n").every((line) => looksLikeHeadingLine(line.trim()))) {
      perParagraphCounts.push(0);
      return para;
    }

    const sentences = robustSentenceSplit(trimmed);
    if (sentences.length === 0) { perParagraphCounts.push(0); return para; }

    let paragraphInjected = 0;
    const out: string[] = [];
    for (let i = 0; i < sentences.length; i++) {
      let s = sentences[i];
      const before = s;
      const budgetLeft = paragraphBudget - paragraphInjected;

      if (budgetLeft > 0) {
        // Category A: Punctuation drift
        s = commaAsideToEmDash(s, rng);
        if (s !== before) paragraphInjected++;
      }
      if (paragraphInjected < paragraphBudget) {
        const before2 = s;
        s = dropOxfordComma(s, rng);
        if (s !== before2) paragraphInjected++;
      }
      if (paragraphInjected < paragraphBudget) {
        const before3 = s;
        s = softenCompoundHyphens(s, rng);
        if (s !== before3) paragraphInjected++;
      }

      // Category B: Lexical softening
      if (enableLexical && paragraphInjected < paragraphBudget) {
        const before4 = s;
        s = collapseInOrderTo(s, rng);
        if (s !== before4) paragraphInjected++;
      }
      if (enableLexical && paragraphInjected < paragraphBudget) {
        const before5 = s;
        s = softenFrontConnectors(s, rng);
        if (s !== before5) paragraphInjected++;
      }

      // Category C: Micro-quirks (rare)
      if (paragraphInjected < paragraphBudget) {
        const before6 = s;
        s = injectInlineAside(s, domain, rng);
        if (s !== before6) paragraphInjected++;
      }

      out.push(s);
    }

    perParagraphCounts.push(paragraphInjected);
    totalInjected += paragraphInjected;
    return out.join(" ");
  });

  options.onStage?.(`Human imperfections injected: ${totalInjected}`);

  return {
    text: processed.join("\n\n"),
    injectedCount: totalInjected,
    perParagraphCounts,
  };
}
