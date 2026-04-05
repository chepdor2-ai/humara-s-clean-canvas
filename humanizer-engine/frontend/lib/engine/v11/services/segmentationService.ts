/**
 * V1.1 Segmentation Service
 * ==========================
 * Paragraph splitting, sentence tokenization, and chunk creation.
 */

import nlp from 'compromise';

/**
 * Split text into paragraphs (by double newlines).
 */
export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Split a paragraph into sentences using compromise.js with regex fallback.
 */
export function splitIntoSentences(paragraph: string): string[] {
  // Preserve heading lines — if a paragraph starts with a short title-like line
  // (no period, under 80 chars) followed by body text, split them apart
  const lines = paragraph.split(/\n/);
  if (lines.length > 1) {
    const firstLine = lines[0].trim();
    // Detect title/heading lines: short, no period at end, not a full sentence
    if (firstLine.length > 0 && firstLine.length < 80 && !/[.!?]$/.test(firstLine) && firstLine.split(/\s+/).length <= 12) {
      // Keep heading separate, process rest as normal
      const rest = lines.slice(1).join(' ').replace(/\s+/g, ' ').trim();
      if (rest.length > 0) {
        const restSentences = splitIntoSentences(rest);
        return [firstLine, ...restSentences];
      }
      return [firstLine];
    }
  }

  // Normalize single linebreaks to spaces within a paragraph
  const normalized = paragraph
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const doc = nlp(normalized);
  const sentences: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc.sentences().forEach((s: any) => {
    const t = s.text().trim();
    if (t) sentences.push(t);
  });

  if (sentences.length === 0 && normalized) {
    // Regex fallback
    return normalized
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  return sentences;
}

/**
 * Group sentences into chunks of 2–3 for chunk rewrite.
 * Respects paragraph boundaries (never cross paragraphs).
 */
export function createChunks(sentenceIds: number[], chunkSize = 3): number[][] {
  const chunks: number[][] = [];
  for (let i = 0; i < sentenceIds.length; i += chunkSize) {
    chunks.push(sentenceIds.slice(i, i + chunkSize));
  }
  // If the last chunk is a single sentence and there's a previous chunk, merge it
  if (chunks.length >= 2 && chunks[chunks.length - 1].length === 1) {
    const last = chunks.pop()!;
    chunks[chunks.length - 1].push(...last);
  }
  return chunks;
}
