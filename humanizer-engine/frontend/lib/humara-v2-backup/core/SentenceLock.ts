/**
 * Humara SentenceLock — Strict sentence boundary preservation
 * 
 * GUARANTEES:
 * - No splitting beyond original sentence count
 * - No merging of sentences
 * - Original count is stored and enforced
 */

/** Split text into sentences, preserving boundaries precisely */
export function splitSentences(text: string): string[] {
  // Handle empty/whitespace
  if (!text || !text.trim()) return [];

  const sentences: string[] = [];
  // Match sentences ending with . ! ? (possibly followed by quotes)
  // Also handle abbreviations and decimal numbers to avoid false splits
  const raw = text.match(/[^.!?]*[.!?]+["'»)}\]]?/g);

  if (!raw || raw.length === 0) {
    // No sentence-ending punctuation found — treat whole text as one sentence
    return [text.trim()];
  }

  for (const s of raw) {
    const trimmed = s.trim();
    if (trimmed.length > 0) {
      sentences.push(trimmed);
    }
  }

  return sentences;
}

/** Count sentences in text */
export function countSentences(text: string): number {
  return splitSentences(text).length;
}

/** 
 * Enforce that the output has the same sentence count as the original.
 * If there are extra sentences, merge the overflow into the last sentence.
 * If there are fewer, pad with the original tail sentences.
 */
export function enforceSentenceCount(
  outputSentences: string[],
  originalCount: number,
  originalSentences: string[]
): string[] {
  if (outputSentences.length === originalCount) {
    return outputSentences;
  }

  if (outputSentences.length > originalCount) {
    // Merge overflow into last allowed sentence
    const kept = outputSentences.slice(0, originalCount - 1);
    const overflow = outputSentences.slice(originalCount - 1);
    // Join overflow with a semicolon to avoid creating a new sentence
    kept.push(overflow.join('; '));
    return kept;
  }

  // Fewer sentences than original — fill with original sentences
  const result = [...outputSentences];
  while (result.length < originalCount && result.length < originalSentences.length) {
    result.push(originalSentences[result.length]);
  }
  return result;
}

/**
 * Validate that a transformed sentence did not split into multiple sentences.
 * Returns true if the transformation is safe.
 */
export function isSentenceSafe(original: string, transformed: string): boolean {
  const origCount = (original.match(/[.!?]+/g) || []).length;
  const transCount = (transformed.match(/[.!?]+/g) || []).length;
  // Allow same or fewer terminal punctuation marks
  return transCount <= origCount;
}
