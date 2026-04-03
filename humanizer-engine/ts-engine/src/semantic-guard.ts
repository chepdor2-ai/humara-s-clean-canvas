/**
 * Semantic Guard — Content-aware meaning preservation layer.
 *
 * Uses OpenAI embeddings API (text-embedding-3-small) or falls back
 * to word-overlap heuristics when no API key is available.
 */

// ── Types ──

export interface MeaningResult {
  isSafe: boolean;
  similarity: number;
}

// ── Heuristic fallback ──

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
      body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      data: { embedding: number[]; index: number }[];
    };
    return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  } catch {
    return null;
  }
}

// ── Core exports ──

export async function semanticSimilarity(
  original: string,
  rewritten: string,
): Promise<number> {
  const embeddings = await getEmbeddings([original, rewritten]);
  if (embeddings && embeddings.length === 2) {
    return cosineSimilarity(embeddings[0], embeddings[1]);
  }
  return heuristicSimilarity(original, rewritten);
}

export function semanticSimilaritySync(
  original: string,
  rewritten: string,
): number {
  return heuristicSimilarity(original, rewritten);
}

export async function isMeaningPreserved(
  original: string,
  rewritten: string,
  threshold: number = 0.88,
): Promise<MeaningResult> {
  const similarity = await semanticSimilarity(original, rewritten);
  return { isSafe: similarity >= threshold, similarity };
}

export function isMeaningPreservedSync(
  original: string,
  rewritten: string,
  threshold: number = 0.88,
): MeaningResult {
  const similarity = heuristicSimilarity(original, rewritten);
  return { isSafe: similarity >= threshold, similarity };
}
