import { robustSentenceSplit } from './content-protection';

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

export function looksLikeHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  if (/^#{1,6}\s/.test(trimmed)) return true;
  if (/^\d+(?:[.)]|(?:\.\d+)+)\s+[A-Z]/.test(trimmed)) return true;
  if (/^[A-Z][A-Z\s0-9:&()\-–—/,'".]{4,}$/.test(trimmed)) return true;

  return (
    countWords(trimmed) <= 12 &&
    !/[.!?]$/.test(trimmed) &&
    /^[A-Z0-9][A-Za-z0-9\s:()\-–—/&,'".]+$/.test(trimmed)
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

export function reflowParagraphToOriginalLines(originalLines: string[], rewritten: string): string {
  const cleaned = normalizeParagraphText(rewritten);
  if (!cleaned) return cleaned;
  if (originalLines.length <= 1) return cleaned;

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

function extractStructuredParagraphs(text: string): string[] {
  return parseStructuredBlocks(text)
    .filter(isParagraphBlock)
    .map((block) => normalizeParagraphText(block.rawLines.join('\n')))
    .filter(Boolean);
}

function redistributeParagraphsBySentenceCount(
  rewritten: string,
  originalParagraphs: ParagraphStructureBlock[],
): string[] {
  const flattened = extractStructuredParagraphs(rewritten).join(' ');
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

  if (originalParagraphs.length === 0) {
    return normalizeNewlines(original);
  }

  let rewrittenParagraphs = extractStructuredParagraphs(rewritten);
  if (rewrittenParagraphs.length !== originalParagraphs.length) {
    rewrittenParagraphs = redistributeParagraphsBySentenceCount(rewritten, originalParagraphs);
  }

  let paragraphIndex = 0;
  const rebuilt = blocks.map((block) => {
    if (block.type === 'blank' || block.type === 'heading') {
      return block.rawLines.join('\n');
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
