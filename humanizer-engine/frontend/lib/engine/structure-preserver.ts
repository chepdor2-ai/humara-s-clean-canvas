import { robustSentenceSplit, humanizeTitle } from './content-protection';

export type StructureBlockType = 'blank' | 'heading' | 'paragraph';

export interface StructureBlock {
  type: StructureBlockType;
  rawLines: string[];
}

interface ParagraphStructureBlock extends StructureBlock {
  type: 'paragraph';
}

function isParagraphBlock(block: StructureBlock): block is ParagraphStructureBlock {
  return block.type === 'paragraph';
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function normalizeParagraphText(text: string): string {
  return normalizeNewlines(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeHeadingKey(text: string): string {
  return normalizeParagraphText(text)
    .replace(/[.!?:;]+$/g, '')
    .toLowerCase();
}

function collapseInlineHeadingRepetitions(text: string): string {
  // Collapse duplicated section headings embedded in paragraph text.
  // Example: "3.3 Model Specification. 3.3 Model Specification."
  return text.replace(
    /\b((?:\d+(?:\.\d+)+)\s+[A-Za-z][^.!?\n]{1,120})(?:\s*[.!?]\s*\1\b){1,}/g,
    '$1',
  );
}

function stripHeadingEchoSentences(rewritten: string, headingKeys: Set<string>): string {
  if (!rewritten.trim() || headingKeys.size === 0) return rewritten;

  const paragraphs = normalizeNewlines(rewritten).split(/\n\s*\n/);
  const cleanedParagraphs = paragraphs
    .map((paragraph) => {
      const flattened = paragraph.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (!flattened) return '';

      const sentences = robustSentenceSplit(flattened);
      if (sentences.length === 0) return flattened;

      const kept = sentences.filter((sentence) => !headingKeys.has(normalizeHeadingKey(sentence)));
      return kept.join(' ').trim();
    })
    .filter(Boolean);

  return cleanedParagraphs.join('\n\n');
}

export function looksLikeHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Markdown headings
  if (/^#{1,6}\s/.test(trimmed)) return true;
  // Numbered headings: "1." "2.3" "10.2.1" followed by capitalized text
  if (/^\d+(?:[.)]|(?:\.\d+)+)\s+[A-Z]/.test(trimmed)) {
    const words = trimmed.split(/\s+/);
    if (words.length <= 12 && !/[.!?]$/.test(trimmed)) return true;
  }
  // ALL-CAPS lines (4+ chars in uppercase)
  if (/^[A-Z][A-Z\s0-9:&()\-–—\/,'".]{4,}$/.test(trimmed)) {
    const words = trimmed.split(/\s+/);
    if (words.length <= 12) return true;
  }

  const words = trimmed.split(/\s+/);
  const capitalizedWords = words.filter(w => /^[A-Z]/.test(w)).length;
  const isMajorityCapitalized = capitalizedWords / Math.max(1, words.length) >= 0.5;

  // Only classify as heading if very short (<=5 words), no ending punctuation,
  // starts with uppercase, and most words capitalized
  return (
    words.length <= 5 &&
    !/[.!?]$/.test(trimmed) &&
    /^[A-Z0-9]/.test(trimmed) &&
    isMajorityCapitalized
  );
}

export function parseStructuredBlocks(text: string): StructureBlock[] {
  const normalized = normalizeNewlines(text);
  const lines = normalized.split('\n');
  const blocks: StructureBlock[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push({ type: 'paragraph', rawLines: [...paragraphLines] });
    paragraphLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      blocks.push({ type: 'blank', rawLines: [line] });
      continue;
    }

    if (looksLikeHeadingLine(trimmed)) {
      flushParagraph();
      blocks.push({ type: 'heading', rawLines: [line] });
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  return blocks;
}

function splitIntoSentences(text: string): string[] {
  const normalized = normalizeParagraphText(text);
  if (!normalized) return [];

  return robustSentenceSplit(normalized);
}

function shouldPreserveOriginalLineBreaks(originalLines: string[]): boolean {
  const lines = originalLines.map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return false;

  const listLineCount = lines.filter((line) => /^(?:[-*•]\s+|\d+[.)]\s+|[A-Za-z][.)]\s+)/.test(line)).length;
  if (listLineCount === lines.length) return true;

  const structuredLineCount = lines.filter((line) => looksLikeHeadingLine(line) || /[:?]$/.test(line)).length;
  if (structuredLineCount === lines.length) return true;

  return false;
}

export function reflowParagraphToOriginalLines(originalLines: string[], rewritten: string): string {
  const cleaned = normalizeParagraphText(rewritten);
  if (!cleaned) return cleaned;
  if (!shouldPreserveOriginalLineBreaks(originalLines)) return cleaned;

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length <= originalLines.length) return cleaned;

  const weights = originalLines.map((line) => Math.max(1, countWords(line) || 1));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;

  const lines = weights.map((weight, index) => {
    const remainingLines = weights.length - index;
    const remainingTokens = tokens.length - cursor;

    if (remainingTokens <= 0) return '';

    const suggested = Math.round((tokens.length * weight) / Math.max(totalWeight, 1));
    const takeCount = index === weights.length - 1
      ? remainingTokens
      : Math.max(1, Math.min(suggested || weight, remainingTokens - (remainingLines - 1)));

    const chunk = tokens.slice(cursor, cursor + takeCount).join(' ');
    cursor += takeCount;
    return chunk;
  });

  return lines.filter((line) => line.trim().length > 0).join('\n');
}

/**
 * Extract paragraphs by splitting on blank lines only — no heuristic heading
 * detection on the rewritten text.  We then exclude any chunk whose normalised
 * key exactly matches one of the original heading keys.
 *
 * This avoids two problems:
 *   1. Engine-capitalised short lines ("Variable descriptions") being falsely
 *      detected as headings and dropped from the paragraph list.
 *   2. Real headings preserved verbatim by the engine ("Applications of
 *      Artificial Intelligence in Nursing") inflating the paragraph count.
 */
function extractFlatParagraphs(text: string, headingKeys?: Set<string>): string[] {
  const paragraphs = normalizeNewlines(text)
    .split(/\n\s*\n/)
    .map((p) => normalizeParagraphText(p))
    .filter(Boolean);

  if (!headingKeys || headingKeys.size === 0) return paragraphs;

  return paragraphs.filter((p) => !headingKeys.has(normalizeHeadingKey(p)));
}

function redistributeParagraphsBySentenceCount(
  rewritten: string,
  originalParagraphs: ParagraphStructureBlock[],
  headingKeys?: Set<string>,
): string[] {
  const flattened = extractFlatParagraphs(rewritten, headingKeys).join(' ');
  const rewrittenSentences = splitIntoSentences(flattened);

  if (rewrittenSentences.length === 0) {
    return originalParagraphs.map((block) => normalizeParagraphText(block.rawLines.join('\n')));
  }

  let cursor = 0;

  return originalParagraphs.map((block, index) => {
    const targetSentenceCount = Math.max(1, splitIntoSentences(block.rawLines.join('\n')).length || 1);
    const remainingParagraphs = originalParagraphs.length - index;
    const remainingSentences = rewrittenSentences.length - cursor;

    const takeCount = index === originalParagraphs.length - 1
      ? remainingSentences
      : Math.max(1, Math.min(targetSentenceCount, remainingSentences - (remainingParagraphs - 1)));

    const chunk = rewrittenSentences.slice(cursor, cursor + takeCount).join(' ').trim();
    cursor += takeCount;

    return chunk || normalizeParagraphText(block.rawLines.join('\n'));
  });
}

export function preserveInputStructure(original: string, rewritten: string): string {
  if (!original) return rewritten;
  if (!rewritten?.trim()) return rewritten;

  const blocks = parseStructuredBlocks(original);
  const originalParagraphs = blocks.filter(isParagraphBlock);
  const headingKeys = new Set(
    blocks
      .filter((block) => block.type === 'heading')
      .map((block) => normalizeHeadingKey(block.rawLines.join(' ')))
      .filter(Boolean),
  );

  if (originalParagraphs.length === 0) {
    return normalizeNewlines(original);
  }

  const rewrittenForAlignment = headingKeys.size > 0
    ? stripHeadingEchoSentences(
      collapseInlineHeadingRepetitions(normalizeNewlines(rewritten)),
      headingKeys,
    )
    : normalizeNewlines(rewritten);

  let rewrittenParagraphs = extractFlatParagraphs(rewrittenForAlignment, headingKeys);
  if (rewrittenParagraphs.length !== originalParagraphs.length) {
    rewrittenParagraphs = redistributeParagraphsBySentenceCount(rewrittenForAlignment, originalParagraphs, headingKeys);
  }

  let paragraphIndex = 0;
  const rebuilt = blocks.map((block) => {
    if (block.type === 'blank') {
      return block.rawLines.join('\n');
    }
    if (block.type === 'heading') {
      // Humanize titles >6 words; pass short titles through unchanged
      return humanizeTitle(block.rawLines.join('\n'));
    }

    const alignedParagraph = rewrittenParagraphs[paragraphIndex] ?? normalizeParagraphText(block.rawLines.join('\n'));
    paragraphIndex += 1;
    return reflowParagraphToOriginalLines(block.rawLines, alignedParagraph);
  }).join('\n');

  return rebuilt
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ');
}
