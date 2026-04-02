/**
 * Semantic Guard — ported from semantic_guard.py
 * Content-aware meaning preservation layer.
 *
 * Uses OpenAI embeddings API (text-embedding-3-small) instead of local
 * sentence-transformers to ensure rewrites preserve meaning.
 * Falls back to word-overlap heuristics when no API key is available.
 */

// ── Types ──

export interface MeaningResult {
  isSafe: boolean;
  similarity: number;
}

export interface RewriteQuality {
  semantic_similarity: number;
  original_length: number;
  rewritten_length: number;
  length_change_percent: number;
  is_meaning_safe: boolean;
  drift_risk: "low" | "medium" | "high";
}

// ── Heuristic fallback (no API key) ──

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 1.0;
}

function ngramOverlap(a: string[], b: string[], n: number): number {
  if (a.length < n || b.length < n) return 1.0;
  const gramsA = new Set<string>();
  for (let i = 0; i <= a.length - n; i++) gramsA.add(a.slice(i, i + n).join(" "));
  const gramsB = new Set<string>();
  for (let i = 0; i <= b.length - n; i++) gramsB.add(b.slice(i, i + n).join(" "));
  const inter = new Set([...gramsA].filter((x) => gramsB.has(x)));
  const union = new Set([...gramsA, ...gramsB]);
  return union.size > 0 ? inter.size / union.size : 1.0;
}

/**
 * Fast heuristic similarity without embeddings:
 *  - 40% unigram Jaccard
 *  - 30% bigram overlap
 *  - 30% trigram overlap
 */
function heuristicSimilarity(original: string, rewritten: string): number {
  const tokA = tokenize(original);
  const tokB = tokenize(rewritten);
  if (tokA.length === 0 || tokB.length === 0) return 1.0;

  const j1 = jaccardSimilarity(tokA, tokB);
  const j2 = ngramOverlap(tokA, tokB, 2);
  const j3 = ngramOverlap(tokA, tokB, 3);
  return j1 * 0.4 + j2 * 0.3 + j3 * 0.3;
}

// ── OpenAI embeddings helper ──

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

async function getEmbeddings(texts: string[]): Promise<number[][] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: texts,
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      data: { embedding: number[]; index: number }[];
    };
    // Sort by index to ensure correct order
    const sorted = data.data.sort((a, b) => a.index - b.index);
    return sorted.map((d) => d.embedding);
  } catch {
    return null;
  }
}

// ── Core functions ──

/**
 * Measure semantic similarity between original and rewritten text.
 * Uses OpenAI embeddings when available, falls back to heuristic.
 * Returns 0.0–1.0 (1.0 = identical meaning).
 */
export async function semanticSimilarity(
  original: string,
  rewritten: string,
): Promise<number> {
  // Try embeddings first
  const embeddings = await getEmbeddings([original, rewritten]);
  if (embeddings && embeddings.length === 2) {
    return cosineSimilarity(embeddings[0], embeddings[1]);
  }
  // Fallback: heuristic
  return heuristicSimilarity(original, rewritten);
}

/**
 * Synchronous heuristic-only version (no API call).
 * Use this in hot loops where async isn't practical.
 */
export function semanticSimilaritySync(
  original: string,
  rewritten: string,
): number {
  return heuristicSimilarity(original, rewritten);
}

/**
 * Main guardrail — determines if a rewrite is safe.
 * threshold: 0.88 = good balance (catches drift, allows style changes)
 */
export async function isMeaningPreserved(
  original: string,
  rewritten: string,
  threshold: number = 0.88,
): Promise<MeaningResult> {
  const similarity = await semanticSimilarity(original, rewritten);
  return { isSafe: similarity >= threshold, similarity };
}

/**
 * Synchronous version using heuristics only.
 */
export function isMeaningPreservedSync(
  original: string,
  rewritten: string,
  threshold: number = 0.88,
): MeaningResult {
  const similarity = heuristicSimilarity(original, rewritten);
  return { isSafe: similarity >= threshold, similarity };
}

/**
 * Batch comparison — efficient for multiple text pairs.
 */
export async function semanticSimilarityBatch(
  originals: string[],
  rewrittenList: string[],
): Promise<number[]> {
  if (originals.length !== rewrittenList.length) {
    throw new Error("Arrays must have equal length");
  }

  // Try embeddings for all at once
  const allTexts = [...originals, ...rewrittenList];
  const embeddings = await getEmbeddings(allTexts);

  if (embeddings && embeddings.length === allTexts.length) {
    const n = originals.length;
    return originals.map((_, i) =>
      cosineSimilarity(embeddings[i], embeddings[n + i]),
    );
  }

  // Fallback: heuristic per pair
  return originals.map((orig, i) =>
    heuristicSimilarity(orig, rewrittenList[i]),
  );
}

/**
 * Find the best synonym for a word in context.
 * Uses embeddings to ensure the replacement keeps meaning intact.
 */
export async function findContextualSynonyms(
  sentence: string,
  targetWord: string,
  synonymCandidates: string[],
  topK: number = 1,
): Promise<string[]> {
  if (synonymCandidates.length === 0) return [];

  // Build candidate sentences
  const candidateSentences = synonymCandidates.map((c) =>
    sentence.replace(new RegExp(`\\b${targetWord}\\b`, "gi"), c),
  );

  const allTexts = [sentence, ...candidateSentences];
  const embeddings = await getEmbeddings(allTexts);

  if (embeddings && embeddings.length === allTexts.length) {
    const origEmb = embeddings[0];
    const scored = synonymCandidates.map((candidate, i) => ({
      candidate,
      similarity: cosineSimilarity(origEmb, embeddings[i + 1]),
    }));
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK).map((s) => s.candidate);
  }

  // Fallback: return first candidates
  return synonymCandidates.slice(0, topK);
}

/**
 * Detailed analysis of how a rewrite changed the text.
 */
export async function analyzeRewriteQuality(
  original: string,
  rewritten: string,
): Promise<RewriteQuality> {
  const similarity = await semanticSimilarity(original, rewritten);
  const originalLen = original.split(/\s+/).filter(Boolean).length;
  const rewrittenLen = rewritten.split(/\s+/).filter(Boolean).length;
  const lengthChange =
    ((rewrittenLen - originalLen) / Math.max(originalLen, 1)) * 100;

  return {
    semantic_similarity: similarity,
    original_length: originalLen,
    rewritten_length: rewrittenLen,
    length_change_percent: lengthChange,
    is_meaning_safe: similarity >= 0.88,
    drift_risk: similarity < 0.85 ? "high" : similarity < 0.9 ? "medium" : "low",
  };
}
