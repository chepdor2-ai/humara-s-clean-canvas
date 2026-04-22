/**
 * Strict No-Split / No-Merge Guard
 * ──────────────────────────────────────────────────────────────────
 * Invariant enforced at every phase boundary after the first LLM
 * rewrite: the output must contain exactly the same number of
 * content sentences as the input. If a transform splits a sentence
 * we collapse it back; if it merges two we reject and keep the
 * pre-transform version.
 *
 * This is the "strictly no splitting or merging after the first LLM
 * rewrite" rule. Headings/titles that come through as single units
 * are preserved as-is.
 * ──────────────────────────────────────────────────────────────────
 */

import { robustSentenceSplit } from "../content-protection";

export interface GuardedResult {
  /** Final text with 1:1 sentence correspondence to input. */
  text: string;
  /** Did we have to fall back because split/merge was detected? */
  rejected: boolean;
  /** Number of input sentences (for downstream logging). */
  inputSentenceCount: number;
  /** Number of sentences the transform produced (pre-collapse). */
  rawOutputSentenceCount: number;
}

/**
 * Collapse a multi-sentence string into a single-sentence string
 * without losing semantic content. We join with semicolons for
 * a natural human-readable compression.
 */
export function collapseToSingleSentence(
  original: string,
  candidate: string,
): string {
  const parts = robustSentenceSplit(candidate).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return candidate.trim() || original;
  }
  const collapsed = parts
    .map((part, index) => {
      let cleaned = part.replace(/[.!?]+$/g, "").trim();
      if (index > 0 && cleaned[0]) {
        cleaned = cleaned[0].toLowerCase() + cleaned.slice(1);
      }
      return cleaned;
    })
    .filter(Boolean)
    .join("; ");
  const punctuation = /[.!?]$/.test(candidate.trim()) ? candidate.trim().slice(-1) : ".";
  return collapsed ? `${collapsed}${punctuation}` : original;
}

/**
 * Guard a single-sentence transform: if the output is not exactly
 * one sentence, collapse it back to one. If the output is empty,
 * fall back to the input.
 */
export function guardSingleSentence(
  original: string,
  candidate: string,
): string {
  const trimmed = candidate?.trim();
  if (!trimmed) return original;
  const parts = robustSentenceSplit(trimmed);
  if (parts.length === 0) return original;
  if (parts.length === 1) return trimmed;
  return collapseToSingleSentence(original, trimmed);
}

/**
 * Guard a whole-text transform: the output must contain the same
 * number of content sentences as the input (within the caller's
 * tolerance). If it doesn't, we fall back to the pre-transform text.
 *
 * `isHeading(s)` tells us which sentences are headings/titles that
 * don't count toward the content-sentence total.
 */
export function guardSentenceCount(
  before: string,
  after: string,
  isHeading: (sentence: string) => boolean,
  tolerance = 0,
): GuardedResult {
  const beforeSents = robustSentenceSplit(before).filter((s) => s.trim().length > 0);
  const afterSents = robustSentenceSplit(after).filter((s) => s.trim().length > 0);

  const beforeContent = beforeSents.filter((s) => !isHeading(s)).length;
  const afterContent = afterSents.filter((s) => !isHeading(s)).length;

  const diff = Math.abs(afterContent - beforeContent);
  if (diff <= tolerance) {
    return {
      text: after,
      rejected: false,
      inputSentenceCount: beforeContent,
      rawOutputSentenceCount: afterContent,
    };
  }

  return {
    text: before,
    rejected: true,
    inputSentenceCount: beforeContent,
    rawOutputSentenceCount: afterContent,
  };
}

/**
 * Run a per-sentence transform across an array, enforcing strict
 * 1:1 output shape. Each transform output that splits is collapsed
 * back. Transform failures (thrown errors) fall back to original.
 *
 * Works sequentially (not parallel) — callers that want parallelism
 * should use `mapSentencesParallelGuarded`.
 */
export async function mapSentencesGuarded(
  sentences: string[],
  transform: (sentence: string, index: number) => Promise<string> | string,
): Promise<string[]> {
  const out: string[] = new Array(sentences.length);
  for (let i = 0; i < sentences.length; i++) {
    const original = sentences[i];
    try {
      const next = await transform(original, i);
      out[i] = guardSingleSentence(original, typeof next === "string" ? next : original);
    } catch {
      out[i] = original;
    }
  }
  return out;
}

/**
 * Parallel variant — preserves order, enforces 1:1 guard per sentence.
 * `concurrency` limits how many transforms run simultaneously.
 */
export async function mapSentencesParallelGuarded(
  sentences: string[],
  transform: (sentence: string, index: number) => Promise<string> | string,
  concurrency = 8,
): Promise<string[]> {
  const out: string[] = new Array(sentences.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= sentences.length) return;
      const original = sentences[i];
      try {
        const next = await transform(original, i);
        out[i] = guardSingleSentence(original, typeof next === "string" ? next : original);
      } catch {
        out[i] = original;
      }
    }
  }
  const workerCount = Math.max(1, Math.min(concurrency, sentences.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return out;
}
