import OpenAI from 'openai';
import { robustSentenceSplit } from './content-protection';

const KEYWORD_RESTORE_MODEL = process.env.OZONE_KEYWORD_RESTORE_MODEL?.trim() || 'gpt-4o-mini';
const MAX_CANDIDATES = 24;
const CHUNK_SIZE = 8;

type CandidateSentence = {
  index: number;
  original: string;
  output: string;
  missingKeywords: string[];
};

type RestoreDecision = {
  index: number;
  action: 'keep' | 'replace' | 'reject';
  replacements?: Array<{
    from: string;
    to: string;
  }>;
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
  const originalSentences = robustSentenceSplit(originalText);
  const outputSentences = robustSentenceSplit(outputText);
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

Allowed output format only:
{
  "decisions": [
    {
      "index": 0,
      "action": "keep" | "replace" | "reject",
      "replacements": [
        { "from": "phrase as it appears in output", "to": "phrase as it appears in original" }
      ]
    }
  ]
}

Rules for replacements:
- "from" must be an exact phrase copied from the output sentence.
- "to" must be an exact phrase copied from the original sentence.
- Use replacements only for wrongly replaced keywords/topic terms.
- Do not propose replacements for style.
- Do not return any rewritten full sentence.
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

function includesPhrase(text: string, phrase: string): boolean {
  return normalizeWhitespace(text).toLowerCase().includes(normalizeWhitespace(phrase).toLowerCase());
}

function replaceOnceCaseInsensitive(text: string, from: string, to: string): string | null {
  const normalizedFrom = normalizeWhitespace(from);
  if (!normalizedFrom) return null;

  const regex = new RegExp(escapeRegex(normalizedFrom).replace(/\s+/g, '\\s+'), 'i');
  if (!regex.test(text)) return null;
  return text.replace(regex, to);
}

function applyValidatedReplacements(outputSentence: string, originalSentence: string, replacements: Array<{ from: string; to: string }>): string {
  let nextSentence = outputSentence;
  const ordered = replacements
    .map((replacement) => ({
      from: normalizeWhitespace(replacement.from),
      to: normalizeWhitespace(replacement.to),
    }))
    .filter((replacement) => replacement.from && replacement.to)
    .sort((a, b) => b.from.length - a.from.length);

  for (const replacement of ordered) {
    if (replacement.from.toLowerCase() === replacement.to.toLowerCase()) return outputSentence;
    if (countWords(replacement.from) > 8 || countWords(replacement.to) > 8) return outputSentence;
    if (!includesPhrase(outputSentence, replacement.from)) return outputSentence;
    if (!includesPhrase(originalSentence, replacement.to)) return outputSentence;

    const updated = replaceOnceCaseInsensitive(nextSentence, replacement.from, replacement.to);
    if (!updated) return outputSentence;
    nextSentence = updated;
  }

  const changedWords = Math.max(countWords(nextSentence), countWords(outputSentence)) - countSharedWords(nextSentence, outputSentence);
  const budget = ordered.reduce((sum, replacement) => sum + Math.max(countWords(replacement.from), countWords(replacement.to)), 0);
  if (changedWords > budget + 1) return outputSentence;

  return nextSentence;
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

  const outputSentences = robustSentenceSplit(outputText);
  const updatedSentences = [...outputSentences];

  for (let start = 0; start < candidates.length; start += CHUNK_SIZE) {
    const chunk = candidates.slice(start, start + CHUNK_SIZE);
    try {
      const decisions = await requestRestorePlan(chunk);
      for (const decision of decisions) {
        if (decision.action !== 'replace' || !Array.isArray(decision.replacements) || decision.replacements.length === 0) continue;
        if (decision.index < 0 || decision.index >= updatedSentences.length) continue;

        const currentSentence = updatedSentences[decision.index];
        const originalSentence = chunk.find((candidate) => candidate.index === decision.index)?.original;
        if (!originalSentence) continue;

        const restored = applyValidatedReplacements(currentSentence, originalSentence, decision.replacements);
        updatedSentences[decision.index] = restored;
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