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

function headingTokens(text: string): Set<string> {
  return new Set(
    normalizeHeadingKey(text)
      .replace(/^\d+(?:[.)]|(?:\.\d+)+)\s+/, '')
      .split(/\s+/)
      .filter((word) => word.length > 2),
  );
}

function isHeadingEcho(candidate: string, headingKeys: Set<string>): boolean {
  const key = normalizeHeadingKey(candidate);
  if (!key || headingKeys.size === 0) return false;
  if (headingKeys.has(key)) return true;

  const words = key.split(/\s+/).filter(Boolean);
  for (const heading of headingKeys) {
    if (!heading) continue;
    const headingWords = heading.split(/\s+/).filter(Boolean);
    if (words.length > Math.max(headingWords.length + 3, 14)) continue;

    const headingSet = headingTokens(heading);
    const candidateSet = headingTokens(key);
    if (headingSet.size === 0 || candidateSet.size === 0) continue;
    let overlap = 0;
    for (const token of headingSet) {
      if (candidateSet.has(token)) overlap++;
    }
    if (overlap / Math.max(headingSet.size, candidateSet.size) >= 0.86) return true;
  }

  return false;
}

function stripLeadingHeadingEcho(text: string, headingKeys: Set<string>): string {
  let result = text.trim();
  if (!result || headingKeys.size === 0) return result;

  for (const heading of [...headingKeys].sort((a, b) => b.length - a.length)) {
    const headingWordCount = heading.split(/\s+/).filter(Boolean).length;
    if (headingWordCount === 0) continue;

    const words = result.split(/\s+/);
    const possibleHeading = words.slice(0, headingWordCount).join(' ');
    if (normalizeHeadingKey(possibleHeading) !== heading) continue;
    const delimitedHeading =
      /[.!?:;]$/.test(possibleHeading) ||
      /^\d+(?:[.)]|(?:\.\d+)+)\s+/.test(possibleHeading) ||
      /^#{1,6}\s+/.test(possibleHeading);
    if (!delimitedHeading) continue;

    result = words
      .slice(headingWordCount)
      .join(' ')
      .replace(/^[.!?:;]+\s*/, '')
      .trim();
    break;
  }

  return result;
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
      const flattened = paragraph
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !isHeadingEcho(line, headingKeys))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      const withoutLeadingHeading = stripLeadingHeadingEcho(flattened, headingKeys);
      const textForSentences = withoutLeadingHeading || flattened;
      if (!textForSentences) return '';

      const sentences = robustSentenceSplit(textForSentences);
      if (sentences.length === 0) return textForSentences;

      // Only strip sentences that are short (≤12 words) AND exactly match a heading key.
      // This prevents stripping legitimate body sentences that merely share vocabulary
      // with a heading.
      const kept = sentences.filter((sentence) => {
        const words = sentence.trim().split(/\s+/);
        if (words.length > 16) return true; // Never strip long sentences
        return !isHeadingEcho(sentence, headingKeys);
      });
      // If ALL sentences would be removed, preserve the paragraph as-is
      if (kept.length === 0) return textForSentences;
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
    if (words.length <= 12 && !/[!?]$/.test(trimmed)) return true;
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

  return paragraphs.filter((p) => !isHeadingEcho(p, headingKeys));
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

function stripSentenceEnd(text: string): string {
  return text.trim().replace(/[.!?]+["')\]]*$/g, '').trim();
}

function sentenceEndFor(sourceSentence: string, fallbackSentence: string): string {
  const fallback = fallbackSentence.trim().match(/[.!?]["')\]]*$/)?.[0];
  const source = sourceSentence.trim().match(/[.!?]["')\]]*$/)?.[0];
  return fallback ?? source ?? '.';
}

function lowercaseContinuation(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed[0].toLowerCase() + trimmed.slice(1);
}

function joinCandidateGroup(group: string[], sourceSentence: string): string {
  if (group.length === 0) return sourceSentence.trim();
  if (group.length === 1) {
    const single = group[0].trim();
    return /[.!?]["')\]]*$/.test(single)
      ? single
      : `${single}${sentenceEndFor(sourceSentence, single)}`;
  }

  const body = group
    .map((sentence, index) => {
      const cleaned = stripSentenceEnd(sentence);
      return index === 0 ? cleaned : lowercaseContinuation(cleaned);
    })
    .filter(Boolean)
    .join('; ');

  return body ? `${body}${sentenceEndFor(sourceSentence, group[group.length - 1])}` : sourceSentence.trim();
}

function alignSentenceCount(sourceSentences: string[], candidateSentences: string[]): string[] {
  if (sourceSentences.length === 0) return candidateSentences;
  if (candidateSentences.length === 0) return sourceSentences;
  if (sourceSentences.length === candidateSentences.length) {
    return candidateSentences.map((sentence, index) => joinCandidateGroup([sentence], sourceSentences[index]));
  }

  if (candidateSentences.length < sourceSentences.length) {
    return sourceSentences.map((sourceSentence, index) =>
      candidateSentences[index]
        ? joinCandidateGroup([candidateSentences[index]], sourceSentence)
        : sourceSentence.trim(),
    );
  }

  const sourceWeights = sourceSentences.map((sentence) => Math.max(1, countWords(sentence)));
  const remainingSourceWeightFrom = (index: number) =>
    sourceWeights.slice(index).reduce((sum, weight) => sum + weight, 0);
  const aligned: string[] = [];
  let cursor = 0;

  for (let index = 0; index < sourceSentences.length; index++) {
    const remainingSlots = sourceSentences.length - index;
    const remainingCandidates = candidateSentences.length - cursor;
    if (remainingSlots <= 1) {
      aligned.push(joinCandidateGroup(candidateSentences.slice(cursor), sourceSentences[index]));
      break;
    }

    const weightShare = sourceWeights[index] / Math.max(1, remainingSourceWeightFrom(index));
    const suggested = Math.round(remainingCandidates * weightShare);
    const takeCount = Math.max(1, Math.min(suggested || 1, remainingCandidates - (remainingSlots - 1)));
    aligned.push(joinCandidateGroup(candidateSentences.slice(cursor, cursor + takeCount), sourceSentences[index]));
    cursor += takeCount;
  }

  return aligned;
}

/**
 * Keep the rewritten text on the same paragraph and sentence frame as the
 * source. This repairs engine outputs that split or merge sentences without
 * throwing away the rewritten wording.
 */
export function conformToSourceSentenceShape(original: string, rewritten: string): string {
  if (!original || !rewritten?.trim()) return rewritten;

  const structured = preserveInputStructure(original, rewritten);
  const blocks = parseStructuredBlocks(original);
  const originalParagraphs = blocks.filter(isParagraphBlock);
  if (originalParagraphs.length === 0) return structured;

  const headingKeys = new Set(
    blocks
      .filter((block) => block.type === 'heading')
      .map((block) => normalizeHeadingKey(block.rawLines.join(' ')))
      .filter(Boolean),
  );

  let rewrittenParagraphs = extractFlatParagraphs(structured, headingKeys);
  if (rewrittenParagraphs.length !== originalParagraphs.length) {
    rewrittenParagraphs = redistributeParagraphsBySentenceCount(structured, originalParagraphs, headingKeys);
  }

  let paragraphIndex = 0;
  const rebuilt = blocks.map((block) => {
    if (block.type === 'blank') return block.rawLines.join('\n');
    if (block.type === 'heading') return humanizeTitle(block.rawLines.join('\n'));

    const sourceParagraph = normalizeParagraphText(block.rawLines.join('\n'));
    const candidateParagraph = rewrittenParagraphs[paragraphIndex] ?? sourceParagraph;
    paragraphIndex += 1;

    const sourceSentences = splitIntoSentences(sourceParagraph);
    const candidateSentences = splitIntoSentences(candidateParagraph);
    const aligned = alignSentenceCount(sourceSentences, candidateSentences).join(' ');
    return reflowParagraphToOriginalLines(block.rawLines, aligned);
  }).join('\n');

  return rebuilt
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ');
}
