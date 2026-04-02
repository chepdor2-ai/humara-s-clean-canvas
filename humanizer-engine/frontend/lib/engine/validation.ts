/**
 * Validation Layer
 * ================
 * Checks that rewritten text satisfies hard constraints:
 *   - Structure preservation (≤5% sentence boundary changes)
 *   - No contractions
 *   - No list formatting introduced
 *   - Length within ±10% of original
 *   - Paragraph count preserved
 *   - Meaning integrity (keyword overlap check)
 */

// ── Helpers ──

function splitSentences(text: string): string[] {
  const raw = text.trim().split(/(?<=[.!?])\s+/);
  return raw.map((s) => s.trim()).filter(Boolean);
}

function wordCount(text: string): number {
  return (text.match(/[a-zA-Z']+/g) ?? []).length;
}

function extractKeywords(text: string, topN = 50): Set<string> {
  const stops = new Set([
    "the","a","an","is","are","was","were","be","been","being",
    "have","has","had","do","does","did","will","would","could",
    "should","may","might","shall","can","this","that","these",
    "those","it","its","they","them","their","we","our","you",
    "your","he","she","his","her","and","or","but","if","in",
    "on","at","to","for","of","with","by","from","as","into",
    "not","no","so","than","too","very","just","also","more",
    "most","some","any","all","each","every","both","few",
    "many","much","own","same","other","such","only","about",
  ]);
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const content = words.filter((w) => w.length > 3 && !stops.has(w));
  const freq: Record<string, number> = {};
  for (const w of content) freq[w] = (freq[w] ?? 0) + 1;
  const sorted = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
  return new Set(sorted.slice(0, topN));
}

// ── Contraction check ──

const CONTRACTION_RE = /\b(can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|wouldn't|shouldn't|couldn't|mustn't|it's|that's|there's|here's|he's|she's|they're|we're|you're|I'm|they've|we've|you've|I've|they'll|we'll|you'll|I'll|he'll|she'll|it'll|let's|who's|what's)\b/gi;

// ── List detection ──

const LIST_RE = /(?:^|\n)\s*(?:\d+[.)]\s|[-*•]\s|[a-z]\)\s)/gm;

// ── Validation functions ──

export interface CheckResult {
  passed: boolean;
  [key: string]: unknown;
}

export function validateStructure(original: string, result: string): CheckResult {
  const origSents = splitSentences(original);
  const resultSents = splitSentences(result);
  const origCount = Math.max(origSents.length, 1);
  const resultCount = resultSents.length;
  const diff = Math.abs(resultCount - origCount);
  const pctChange = diff / origCount;
  return {
    passed: pctChange <= 0.05,
    original_sentences: origCount,
    result_sentences: resultCount,
    diff,
    pct_change: Math.round(pctChange * 1000) / 1000,
  };
}

export function validateLength(original: string, result: string): CheckResult {
  const origWc = wordCount(original);
  const resultWc = wordCount(result);
  const pctChange = Math.abs(resultWc - origWc) / Math.max(origWc, 1);
  return {
    passed: pctChange <= 0.10,
    original_words: origWc,
    result_words: resultWc,
    pct_change: Math.round(pctChange * 1000) / 1000,
  };
}

export function validateNoContractions(text: string): CheckResult {
  const matches = text.match(CONTRACTION_RE) ?? [];
  return {
    passed: matches.length === 0,
    contractions_found: matches.slice(0, 10),
  };
}

export function validateNoLists(original: string, result: string): CheckResult {
  const origLists = (original.match(LIST_RE) ?? []).length;
  const resultLists = (result.match(LIST_RE) ?? []).length;
  const newLists = Math.max(0, resultLists - origLists);
  return { passed: newLists === 0, new_list_items: newLists };
}

export function validateParagraphs(original: string, result: string): CheckResult {
  const origParas = original.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const resultParas = result.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return {
    passed: resultParas.length === origParas.length,
    original_paragraphs: origParas.length,
    result_paragraphs: resultParas.length,
  };
}

export function validateMeaning(original: string, result: string): CheckResult {
  const origKw = extractKeywords(original);
  const resultKw = extractKeywords(result);
  if (origKw.size === 0) return { passed: true, overlap: 1.0, missing_keywords: [] };
  let intersect = 0;
  for (const w of origKw) if (resultKw.has(w)) intersect++;
  const overlap = intersect / origKw.size;
  const missing: string[] = [];
  for (const w of origKw) if (!resultKw.has(w)) { missing.push(w); if (missing.length >= 10) break; }
  return {
    passed: overlap >= 0.75,
    overlap: Math.round(overlap * 1000) / 1000,
    missing_keywords: missing,
  };
}

// ── Full validation ──

export interface ValidationResult {
  all_passed: boolean;
  checks: Record<string, CheckResult>;
  issues: string[];
}

export function validateAll(original: string, result: string): ValidationResult {
  const checks: Record<string, CheckResult> = {
    structure: validateStructure(original, result),
    length: validateLength(original, result),
    contractions: validateNoContractions(result),
    lists: validateNoLists(original, result),
    paragraphs: validateParagraphs(original, result),
    meaning: validateMeaning(original, result),
  };

  const issues: string[] = [];
  for (const [name, chk] of Object.entries(checks)) {
    if (!chk.passed) issues.push(`${name}: ${JSON.stringify(chk)}`);
  }

  return {
    all_passed: Object.values(checks).every((c) => c.passed),
    checks,
    issues,
  };
}
