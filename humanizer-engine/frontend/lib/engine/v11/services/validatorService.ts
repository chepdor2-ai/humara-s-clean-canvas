/**
 * V1.1 Validator Service
 * =======================
 * Meaning preservation checking + protected token integrity.
 */

// ── Tokenization ──

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

// ── Similarity helpers ──

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const inter = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? inter.size / union.size : 1.0;
}

function ngramOverlap(a: string[], b: string[], n: number): number {
  if (a.length < n || b.length < n) return 1.0;
  const gramsA = new Set<string>();
  for (let i = 0; i <= a.length - n; i++) gramsA.add(a.slice(i, i + n).join(' '));
  const gramsB = new Set<string>();
  for (let i = 0; i <= b.length - n; i++) gramsB.add(b.slice(i, i + n).join(' '));
  const inter = new Set([...gramsA].filter(x => gramsB.has(x)));
  const union = new Set([...gramsA, ...gramsB]);
  return union.size > 0 ? inter.size / union.size : 1.0;
}

/**
 * Fast heuristic similarity (no embeddings needed):
 *   40% unigram Jaccard + 30% bigram overlap + 30% trigram overlap
 */
export function heuristicSimilarity(original: string, rewritten: string): number {
  const tokA = tokenize(original);
  const tokB = tokenize(rewritten);
  if (tokA.length === 0 && tokB.length === 0) return 1.0;
  if (tokA.length === 0 || tokB.length === 0) return 0;

  const jaccard = jaccardSimilarity(tokA, tokB);
  const bigram = ngramOverlap(tokA, tokB, 2);
  const trigram = ngramOverlap(tokA, tokB, 3);

  return jaccard * 0.4 + bigram * 0.3 + trigram * 0.3;
}

export interface MeaningResult {
  isSafe: boolean;
  similarity: number;
}

/**
 * Check whether the rewrite preserves meaning (threshold ≥ 0.30).
 */
export function checkMeaning(original: string, rewritten: string, threshold = 0.30): MeaningResult {
  const similarity = heuristicSimilarity(original, rewritten);
  return {
    isSafe: similarity >= threshold,
    similarity,
  };
}

/**
 * Verify all protected placeholders are still present.
 */
export function checkProtectedTokens(
  text: string,
  spans: Record<string, string>
): { allPresent: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const placeholder of Object.keys(spans)) {
    if (!text.includes(placeholder)) {
      // Also check LLM format variant
      const idx = placeholder.match(/VPROT(\d+)/)?.[1];
      if (idx && !text.includes(`[[VPROT_${idx}]]`)) {
        missing.push(placeholder);
      }
    }
  }
  return { allPresent: missing.length === 0, missing };
}

/**
 * Validate length change is within acceptable bounds.
 * Rewrite should not shrink below 40% or grow beyond 200% of original.
 */
export function checkLengthBounds(original: string, rewritten: string): boolean {
  const origLen = original.trim().length;
  const newLen = rewritten.trim().length;
  if (origLen === 0) return true;
  const ratio = newLen / origLen;
  return ratio >= 0.4 && ratio <= 2.0;
}
