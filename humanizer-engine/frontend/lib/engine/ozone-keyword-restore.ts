import OpenAI from 'openai';

const KEYWORD_RESTORE_MODEL = process.env.OZONE_KEYWORD_RESTORE_MODEL?.trim() || 'gpt-4o-mini';
const MAX_CANDIDATES = 24;
const CHUNK_SIZE = 1;

type CandidateSentence = {
  index: number;
  original: string;
  output: string;
  missingKeywords: string[];
};

type RestoreDecision = {
  index: number;
  action: 'keep' | 'replace' | 'reject';
  fixed_sentence?: string;
};

type RestorePlan = {
  decisions?: RestoreDecision[];
};

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  client = new OpenAI({ apiKey });
  return client;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function isHeadingLike(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (!trimmed) return true;
  if (/^[A-Z][a-zA-Z]+[,.].*\(\d{4}\)\s*\.?\s*$/.test(trimmed) && countWords(trimmed) <= 20) return true;
  return trimmed.length < 120 && !/[.!?]$/.test(trimmed) && countWords(trimmed) <= 15;
}

function splitForRestoreReview(text: string): string[] {
  const paragraphs = text
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter(Boolean);

  const sentences: string[] = [];

  for (const paragraph of paragraphs) {
    if (isHeadingLike(paragraph)) {
      sentences.push(paragraph);
      continue;
    }

    const parts = paragraph
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .map((part) => normalizeWhitespace(part))
      .filter(Boolean);

    if (parts.length === 0) {
      sentences.push(paragraph);
    } else {
      sentences.push(...parts);
    }
  }

  return sentences;
}

function countSharedWords(a: string, b: string): number {
  const aWords = normalizeWhitespace(a).toLowerCase().split(/\s+/).filter(Boolean);
  const bWords = normalizeWhitespace(b).toLowerCase().split(/\s+/).filter(Boolean);
  const bCounts = new Map<string, number>();

  for (const word of bWords) {
    bCounts.set(word, (bCounts.get(word) ?? 0) + 1);
  }

  let shared = 0;
  for (const word of aWords) {
    const remaining = bCounts.get(word) ?? 0;
    if (remaining > 0) {
      shared += 1;
      bCounts.set(word, remaining - 1);
    }
  }

  return shared;
}

function extractKeywordTokens(text: string): string[] {
  const stopwords = new Set([
    'about', 'after', 'again', 'against', 'among', 'because', 'being', 'between', 'could', 'during',
    'every', 'first', 'found', 'from', 'further', 'have', 'having', 'however', 'into', 'itself',
    'least', 'might', 'other', 'ought', 'over', 'rather', 'should', 'since', 'still', 'such',
    'than', 'that', 'their', 'theirs', 'them', 'there', 'these', 'this', 'those', 'through',
    'under', 'until', 'using', 'very', 'were', 'what', 'when', 'where', 'which', 'while', 'with',
    'within', 'would', 'your', 'yours', 'also', 'much', 'many', 'some', 'most', 'more', 'well',
    'been', 'does', 'done', 'across', 'around', 'toward', 'towards', 'whose', 'themselves',
  ]);

  const tokens = text
    .replace(/\u27E6[^\u27E7]*\u27E7/g, ' ')
    .replace(/[^A-Za-z0-9\-\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 5)
    .filter((token) => /[a-z]/.test(token))
    .filter((token) => !stopwords.has(token));

  return [...new Set(tokens)];
}

function buildCandidates(originalText: string, outputText: string): CandidateSentence[] {
  const originalSentences = splitForRestoreReview(originalText);
  const outputSentences = splitForRestoreReview(outputText);
  const countGap = Math.abs(originalSentences.length - outputSentences.length);

  if (!originalSentences.length || !outputSentences.length) return [];
  if (countGap > Math.ceil(originalSentences.length * 0.2)) {
    console.log(`[Ozone Keyword Restore] Skipping review due to sentence mismatch ${originalSentences.length} -> ${outputSentences.length}`);
    return [];
  }

  const pairCount = Math.min(originalSentences.length, outputSentences.length);
  const candidates: CandidateSentence[] = [];

  for (let index = 0; index < pairCount; index += 1) {
    const original = normalizeWhitespace(originalSentences[index]);
    const output = normalizeWhitespace(outputSentences[index]);

    if (!original || !output || isHeadingLike(original) || isHeadingLike(output)) continue;
    if (original.toLowerCase() === output.toLowerCase()) continue;

    const keywordTokens = extractKeywordTokens(original);
    if (keywordTokens.length < 2) continue;

    const missingKeywords = keywordTokens.filter((keyword) => !new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(output));
    if (missingKeywords.length === 0) continue;

    candidates.push({
      index,
      original,
      output,
      missingKeywords: missingKeywords.slice(0, 8),
    });
  }

  return candidates.slice(0, MAX_CANDIDATES);
}

function parsePlan(raw: string): RestorePlan | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned) as RestorePlan;
  } catch {
    return null;
  }
}

async function requestRestorePlan(chunk: CandidateSentence[]): Promise<RestoreDecision[]> {
  const openai = getClient();
  if (!openai || chunk.length === 0) return [];

  const response = await Promise.race([
    openai.chat.completions.create({
      model: KEYWORD_RESTORE_MODEL,
      messages: [
        {
          role: 'system',
          content: `You compare an original sentence with an already-humanized sentence.

Your job is extremely narrow:
- Restore only key words, topic words, named entities, and domain phrases that were wrongly replaced.
- Never rewrite a sentence.
- Never change grammar, punctuation, ordering, cadence, clause structure, or sentence framing.
- If anything beyond exact keyword restoration would be needed, return action="reject".
- If the output sentence is already acceptable, return action="keep".
- If a clinical, technical, domain, or topic term from the original was generalized or paraphrased in the output, restore the exact original term.
- NEVER return the original sentence. The fixed_sentence must be the OUTPUT sentence with only specific terms swapped.

Examples:
- original: "...effective form of psychotherapy that focuses on the connection..."
- output:   "...successful type of talk therapy that looks at how ..."
- correct action: replace
- fixed_sentence: "...successful type of psychotherapy that looks at the connection..."
  (kept "successful" and "looks at" from output, restored "psychotherapy" and "connection" from original)

- original: "...lead to emotional distress and unhealthy behaviors."
- output:   "...cause emotional problems and bad habits."
- correct action: replace
- fixed_sentence: "...cause emotional distress and unhealthy behaviors."
  (kept "cause" from output, restored "emotional distress" and "unhealthy behaviors" from original)

Allowed output format only:
{
  "decisions": [
    {
      "index": 0,
      "action": "keep" | "replace" | "reject",
      "fixed_sentence": "the OUTPUT sentence with only domain/topic terms swapped back from the original"
    }
  ]
}

Rules for fixed_sentence:
- Start from the output sentence. Keep its grammar, clause order, and style words.
- Only swap back domain terms, topic terms, named entities, and technical vocabulary from the original.
- Do NOT copy the original sentence wholesale.
- Every inserted term must come from the original sentence.
- Do not propose style improvements.
- Do not reorder clauses.
- Do not shorten or expand the sentence beyond keyword restoration.
- If you are unsure, use action="reject".
- Respond with valid JSON only.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            sentences: chunk.map((candidate) => ({
              index: candidate.index,
              original: candidate.original,
              output: candidate.output,
              suspected_missing_keywords: candidate.missingKeywords,
            })),
          }),
        },
      ],
      temperature: 0,
      max_tokens: 1800,
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Keyword restore timed out')), 5000);
    }),
  ]);

  const raw = response.choices[0]?.message?.content?.trim() ?? '';
  const parsed = parsePlan(raw);
  return Array.isArray(parsed?.decisions) ? parsed.decisions : [];
}

function tokenizeWords(text: string): string[] {
  return normalizeWhitespace(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function longestCommonSubsequenceLength(a: string[], b: string[]): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp[a.length][b.length];
}

function validateFixedSentence(outputSentence: string, originalSentence: string, fixedSentence: string, missingKeywords: string[]): string {
  const normalizedFixed = normalizeWhitespace(fixedSentence);
  if (!normalizedFixed || normalizedFixed.toLowerCase() === normalizeWhitespace(outputSentence).toLowerCase()) {
    return outputSentence;
  }

  const outputWords = tokenizeWords(outputSentence);
  const originalWords = tokenizeWords(originalSentence);
  const fixedWords = tokenizeWords(normalizedFixed);
  const originalWordSet = new Set(originalWords);
  const outputWordSet = new Set(outputWords);

  const fixedSharedWithOutput = countSharedWords(normalizedFixed, outputSentence);
  const changedWords = Math.max(fixedWords.length, outputWords.length) - fixedSharedWithOutput;
  const lcsLength = longestCommonSubsequenceLength(outputWords, fixedWords);
  const lcsRatio = outputWords.length === 0 ? 1 : lcsLength / outputWords.length;
  const insertedWords = fixedWords.filter((word) => !outputWordSet.has(word));
  const invalidInsertedWord = insertedWords.some((word) => !originalWordSet.has(word));
  const restoredKeywordCount = missingKeywords.filter((keyword) => new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(normalizedFixed)).length;

  if (invalidInsertedWord) return outputSentence;
  if (restoredKeywordCount === 0) return outputSentence;
  if (Math.abs(fixedWords.length - outputWords.length) > Math.max(6, missingKeywords.length * 3)) return outputSentence;
  if (changedWords > Math.max(10, missingKeywords.length * 4)) return outputSentence;

  // Scale the LCS threshold down when many keywords must be restored
  const lcsThreshold = Math.max(0.50, 0.72 - missingKeywords.length * 0.03);
  if (lcsRatio < lcsThreshold) return outputSentence;

  // Reject if GPT just returned the original sentence verbatim
  const fixedVsOriginalLcs = longestCommonSubsequenceLength(originalWords, fixedWords);
  const fixedVsOriginalRatio = originalWords.length === 0 ? 0 : fixedVsOriginalLcs / Math.max(originalWords.length, fixedWords.length);
  if (fixedVsOriginalRatio > 0.95) return outputSentence;

  const originalEnding = originalSentence.trim().slice(-1);
  const fixedEnding = normalizedFixed.trim().slice(-1);
  if (/[.!?]/.test(originalEnding) && fixedEnding !== originalEnding) {
    return outputSentence;
  }

  return normalizedFixed;
}

function rebuildTextWithSentenceUpdates(text: string, originalSentences: string[], updatedSentences: string[]): string {
  let cursor = 0;
  let rebuilt = '';

  for (let index = 0; index < originalSentences.length; index += 1) {
    const originalSentence = originalSentences[index];
    const updatedSentence = updatedSentences[index];
    const sentenceIndex = text.indexOf(originalSentence, cursor);

    if (sentenceIndex === -1) continue;

    rebuilt += text.slice(cursor, sentenceIndex);
    rebuilt += updatedSentence;
    cursor = sentenceIndex + originalSentence.length;
  }

  rebuilt += text.slice(cursor);
  return rebuilt || text;
}

export async function restoreOzoneKeywords(originalText: string, outputText: string): Promise<string> {
  const openai = getClient();
  if (!openai) return outputText;
  if (!originalText.trim() || !outputText.trim()) return outputText;

  const candidates = buildCandidates(originalText, outputText);
  if (candidates.length === 0) return outputText;

  const outputSentences = splitForRestoreReview(outputText);
  const updatedSentences = [...outputSentences];

  for (let start = 0; start < candidates.length; start += CHUNK_SIZE) {
    const chunk = candidates.slice(start, start + CHUNK_SIZE);
    try {
      const decisions = await requestRestorePlan(chunk);
      for (const decision of decisions) {
        if (decision.action !== 'replace' || typeof decision.fixed_sentence !== 'string') continue;

        // GPT returns chunk-relative indices (0..chunk.length-1).
        // Map back to the absolute sentence index.
        // Fall back to the first chunk candidate if GPT returns an invalid index.
        const chunkCandidate = chunk[decision.index] ?? (chunk.length === 1 ? chunk[0] : undefined);
        if (!chunkCandidate) continue;
        const absoluteIndex = chunkCandidate.index;

        if (absoluteIndex < 0 || absoluteIndex >= updatedSentences.length) continue;

        const currentSentence = updatedSentences[absoluteIndex];

        const restored = validateFixedSentence(currentSentence, chunkCandidate.original, decision.fixed_sentence, chunkCandidate.missingKeywords);
        updatedSentences[absoluteIndex] = restored;
      }
    } catch (error) {
      console.warn(`[Ozone Keyword Restore] Chunk failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  const restoredText = rebuildTextWithSentenceUpdates(outputText, outputSentences, updatedSentences);
  if (restoredText !== outputText) {
    console.log('[Ozone Keyword Restore] Applied keyword restoration pass');
  }
  return restoredText;
}