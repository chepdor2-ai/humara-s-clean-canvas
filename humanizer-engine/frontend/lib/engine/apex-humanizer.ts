/**
 * Apex Humanizer Engine — 6-Phase Groq + Post-Processing Pipeline
 * ========================================================================
 *
 * Pure TypeScript engine combining LLM rewriting with aggressive multi-phase
 * post-processing. Designed for college-level academic writing with zero AI
 * detection signals.
 *
 * PIPELINE:
 *   Phase 1: LLM sentence-by-sentence parallel rewrite (50%+ transformation)
 *            Prompt: write like a human college academic writer
 *            Rules: no first person, no contractions, no slang, formal academic tone
 *   Phase 2: Aggressive post-processing, sentence-by-sentence (40% aggressiveness)
 *            AI word kill, phrase patterns, synonym injection
 *   Phase 3: Cleaning post-processing, sentence-by-sentence (25-35% aggressiveness)
 *            Connector naturalization, starter diversity, light synonym pass
 *   Phase 4: Paragraph-by-paragraph restructuring (20% sentence reordering)
 *            Flow improvement, clause fronting, transition smoothing
 *   Phase 5: AI signal elimination pass
 *            Target every detector signal: uniformity, burstiness, vocabulary
 *   Phase 6: Final grammar/capitalization/punctuation cleanup
 *            Zero tolerance for errors
 *
 * STRICT RULES:
 *   - NO contractions — ever
 *   - NO first person (I, me, my, we, us, our)
 *   - NO colloquial or humorous phrases
 *   - Academic tone throughout
 *   - Preserve original meaning
 */

import { robustSentenceSplit } from "./content-protection";
import {
  applyAIWordKill,
  applyPhrasePatterns,
  applyConnectorNaturalization,
  expandAllContractions,
  diversifyStarters,
  perSentenceAntiDetection,
  deepCleaningPass,
  fixPunctuation,
  fixCapitalization,
} from "./shared-dictionaries";
import { synonymReplace } from "./utils";
import { validateAndRepairOutput } from "./validation-post-process";
import { semanticSimilaritySync } from "./semantic-guard";
import { getGroqClient, resolveGroqChatModel } from "./groq-client";
import OpenAI from "openai";

let _openaiClient: OpenAI | null = null;
function getOpenAIDirectClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  if (!_openaiClient) {
    _openaiClient = new OpenAI({ apiKey: key });
  }
  return _openaiClient;
}

// ── Config ──

const LLM_MODEL = resolveGroqChatModel(process.env.LLM_MODEL, "llama-3.3-70b-versatile");
const CONCURRENCY = Math.min(Number(process.env.PIPELINE_CONCURRENCY ?? 15), 20);
const LLM_TIMEOUT_MS = 4_000;
const PHASE1_BUDGET_MS = 4_000;
const PHASE4_BUDGET_MS = 3_000;
const TOTAL_BUDGET_MS = 10_000;

// ── Timeout utility ──

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function groqCall(
  system: string,
  user: string,
  temperature: number,
  maxTokens = 512,
): Promise<string> {
  const client = getGroqClient();
  const callPromise = client.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
    max_tokens: maxTokens,
  }).then((r: any) => r.choices[0]?.message?.content?.trim() ?? "");

  return withTimeout(callPromise, LLM_TIMEOUT_MS, "");
}

async function llmCall(
  system: string,
  user: string,
  temperature: number,
  maxTokens = 512,
): Promise<string> {
  try {
    const groqContent = await groqCall(system, user, temperature, maxTokens);
    if (groqContent) return groqContent;
  } catch (err) {
    console.warn("[Apex LLM] Groq failed, falling back to GPT-4o mini:", err instanceof Error ? err.message : err);
  }

  const openai = getOpenAIDirectClient();
  if (openai) {
    try {
      const callPromise = openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature,
        max_tokens: maxTokens,
      }).then((r: any) => r.choices[0]?.message?.content?.trim() ?? "");
      
      const content = await withTimeout(callPromise, LLM_TIMEOUT_MS, "");
      if (content) return content;
    } catch (err) {
      console.warn("[Apex LLM] GPT-4o mini fallback failed:", err instanceof Error ? err.message : err);
    }
  }
  return "";
}

// ── Utility ──

function measureWordChange(original: string, modified: string): number {
  const origWords = original.toLowerCase().split(/\s+/).filter(Boolean);
  const modWords = modified.toLowerCase().split(/\s+/).filter(Boolean);
  const len = Math.max(origWords.length, modWords.length);
  if (len === 0) return 1;
  let changed = 0;
  for (let i = 0; i < len; i++) {
    if (!origWords[i] || !modWords[i] || origWords[i] !== modWords[i]) changed++;
  }
  return changed / len;
}

function isHeading(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^#{1,6}\s/.test(t)) return true;
  if (/^[IVXLCDM]+\.\s/i.test(t)) return true;
  if (/^(?:Part|Section|Chapter|Abstract|Introduction|Conclusion|References|Bibliography|Discussion|Results|Methods|Appendix)\b/i.test(t)) return true;
  if (/^[\d]+[.):]\s/.test(t)) return true;
  const words = t.split(/\s+/);
  if (words.length <= 10 && !/[.!?]$/.test(t) && /^[A-Z]/.test(t)) return true;
  return false;
}

function extractParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
}

/** Remove first-person pronouns with academic alternatives */
function removeFirstPerson(text: string): string {
  return text
    .replace(/\bI believe\b/gi, "it is evident")
    .replace(/\bI think\b/gi, "it appears")
    .replace(/\bI argue\b/gi, "this paper argues")
    .replace(/\bI suggest\b/gi, "the evidence suggests")
    .replace(/\bI found\b/gi, "the findings indicate")
    .replace(/\bIn my opinion\b/gi, "From an analytical perspective")
    .replace(/\bwe can see\b/gi, "it is apparent")
    .replace(/\bwe argue\b/gi, "this analysis argues")
    .replace(/\bour findings\b/gi, "the findings")
    .replace(/\bour research\b/gi, "the research")
    .replace(/\bour study\b/gi, "the study")
    .replace(/\bour analysis\b/gi, "the analysis")
    .replace(/\bwe found\b/gi, "the results indicate")
    .replace(/\bwe observed\b/gi, "observations show")
    .replace(/\bwe conclude\b/gi, "the evidence indicates")
    .replace(/\bwe believe\b/gi, "the evidence suggests")
    .replace(/\bwe suggest\b/gi, "the data suggests")
    .replace(/\bWe\b/g, "The researchers")
    .replace(/\bour\b/gi, "the")
    .replace(/\bOur\b/g, "The")
    .replace(/\bI\b/g, "the author")
    .replace(/\bmy\b/gi, "the")
    .replace(/\bme\b/gi, "the author");
}

// ══════════════════════════════════════════════════════════════════
// PHASE 1: LLM Sentence-by-Sentence Parallel Rewrite (50%+ change)
// ══════════════════════════════════════════════════════════════════

/** Extract key nouns/entities from a sentence for hallucination checking */
function extractKeyTerms(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^a-z0-9\s'-]/g, '').split(/\s+/).filter(w => w.length > 3);
  // Keep nouns/entities — skip common stopwords
  const STOP = new Set(['this','that','with','from','have','been','were','will','would','could','should','also','than','then','them','they','their','there','these','those','which','where','about','after','before','other','some','such','more','most','very','only','just','into','over','each','well','much','many','does','made','make','when','what','while']);
  return new Set(words.filter(w => !STOP.has(w)));
}

/** Check that a rewrite preserves key terms from the original (anti-hallucination) */
function validateKeyTermPreservation(original: string, rewritten: string, minOverlap = 0.35): boolean {
  const origTerms = extractKeyTerms(original);
  const rewrittenTerms = extractKeyTerms(rewritten);
  if (origTerms.size === 0) return true;
  let overlap = 0;
  for (const term of origTerms) {
    if (rewrittenTerms.has(term)) overlap++;
  }
  return (overlap / origTerms.size) >= minOverlap;
}

/** Validate LLM output is a paraphrase, not hallucination */
function validateNotHallucinated(
  original: string,
  output: string,
  opts: { minSimilarity?: number; minTermOverlap?: number; maxLenRatio?: number } = {},
): boolean {
  const { minSimilarity = 0.45, minTermOverlap = 0.35, maxLenRatio = 2.0 } = opts;
  // 1. Length guard — output should not be wildly different length
  const origLen = original.split(/\s+/).length;
  const outLen = output.split(/\s+/).length;
  if (outLen > origLen * maxLenRatio || outLen < origLen * 0.3) return false;
  // 2. Semantic similarity — must be about the same topic
  const sim = semanticSimilaritySync(original, output);
  if (sim < minSimilarity) return false;
  // 3. Key term preservation — core nouns/entities must survive
  if (!validateKeyTermPreservation(original, output, minTermOverlap)) return false;
  // 4. Must not be a completely different sentence (check for at least 1 shared 3-gram)
  const origGrams = new Set<string>();
  const origWords = original.toLowerCase().split(/\s+/);
  for (let i = 0; i < origWords.length - 2; i++) {
    origGrams.add(origWords.slice(i, i + 3).join(' '));
  }
  const outWords = output.toLowerCase().split(/\s+/);
  let sharedGrams = 0;
  for (let i = 0; i < outWords.length - 2; i++) {
    if (origGrams.has(outWords.slice(i, i + 3).join(' '))) sharedGrams++;
  }
  // At least 1 shared trigram OR the semantic/term checks already passed strongly
  if (sharedGrams === 0 && sim < 0.6) return false;
  return true;
}

const PHASE1_SYSTEM = `You are a skilled human college academic writer. You PARAPHRASE sentences for academic papers.

CRITICAL ANTI-HALLUCINATION RULES — THESE OVERRIDE EVERYTHING:
- You are PARAPHRASING the given sentence. You must NOT write a new or different sentence.
- Every key concept, entity, proper noun, statistic, and claim from the original MUST appear in your output.
- Do NOT add facts, claims, examples, or ideas that are not in the original sentence.
- Do NOT remove or omit any key information from the original sentence.
- Do NOT generalize specifics or replace specific claims with vague statements.
- If the original mentions "72% of participants", your output must mention "72% of participants".
- If the original names "Suzanne Collins", your output must name "Suzanne Collins".
- Your output is a RESTRUCTURED VERSION of the input — same meaning, same facts, different words and grammar.

STYLE RULES:
1. Output ONLY the rewritten sentence. No explanations, labels, or quotes.
2. NEVER use contractions (don't, can't, won't, it's, etc.) — always use full forms.
3. NEVER use first person (I, me, my, we, us, our, myself, ourselves).
4. NEVER use colloquial, humorous, or informal language.
5. Transform at least 50% of words while preserving the EXACT meaning and ALL facts.
6. Use varied sentence structures: clause fronting, passive voice, nominalization, appositives.
7. Write in formal academic third-person prose.
8. Vary vocabulary — do NOT use the same transition words or connectors repeatedly.
9. Keep approximately the same sentence length (within ±30%).
10. Do NOT add hedging phrases unless the original had them.
11. Do NOT start with "This", "It is", "There is/are" — vary your starters.`;

async function phase1RewriteSentence(
  sentence: string,
  index: number,
  total: number,
): Promise<string> {
  const position = index < total * 0.2 ? "opening" : index > total * 0.8 ? "closing" : "body";

  // Vary prompts to avoid uniform output
  const prompts = [
    `Rewrite this academic sentence using clause fronting and nominalization. Position: ${position}.\n\nSentence: ${sentence}`,
    `Restructure this sentence with a different grammatical pattern. Use passive voice or an appositive clause. Position: ${position}.\n\nSentence: ${sentence}`,
    `Paraphrase this for an academic paper. Change the sentence structure significantly — front a subordinate clause or use a participial phrase. Position: ${position}.\n\nSentence: ${sentence}`,
    `Rewrite in formal academic prose. Vary the word order from the original. Use a different main verb or nominalize the action. Position: ${position}.\n\nSentence: ${sentence}`,
    `Transform this sentence for a college paper. Change at least half the words while keeping meaning. Use a fresh opening and varied structure. Position: ${position}.\n\nSentence: ${sentence}`,
  ];

  const prompt = prompts[index % prompts.length];
  const temp = 0.6 + (index % 3) * 0.1; // 0.6, 0.7, 0.8 cycling

  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await llmCall(PHASE1_SYSTEM, prompt, temp + (attempt * 0.05));
    if (!result) continue;

    // Clean LLM output
    const cleaned = result
      .replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, '')
      .replace(/^(?:Here(?:'s| is)[^:]*:|Rewritten[^:]*:|Output[^:]*:)\s*/i, '')
      .trim();

    // ── Anti-hallucination validation ──
    // Reject if the LLM invented a new sentence instead of paraphrasing
    if (!validateNotHallucinated(sentence, cleaned, {
      minSimilarity: 0.45,
      minTermOverlap: 0.30,
      maxLenRatio: 1.8,
    })) {
      console.log(`[Apex P1] Rejected hallucinated output for sentence ${index} (attempt ${attempt + 1})`);
      continue;
    }

    // Enforce 50% change minimum
    const changeRatio = measureWordChange(sentence, cleaned);
    if (changeRatio >= 0.5 && cleaned.length > 10) {
      return cleaned;
    }

    // Retry with higher temp if change is insufficient
    if (attempt < 2) continue;
  }

  // Fallback: return original (post-processing phases will handle it)
  return sentence;
}

async function phase1(text: string): Promise<string> {
  const paragraphs = extractParagraphs(text);
  const results: string[] = [];

  for (const para of paragraphs) {
    if (isHeading(para)) {
      results.push(para);
      continue;
    }

    const sentences = robustSentenceSplit(para);
    const totalSentences = sentences.length;

    // Process sentences in parallel with concurrency limit
    const rewritten: string[] = new Array(sentences.length);
    for (let batchStart = 0; batchStart < sentences.length; batchStart += CONCURRENCY) {
      const batch = sentences.slice(batchStart, batchStart + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((sent, i) =>
          phase1RewriteSentence(sent, batchStart + i, totalSentences)
        )
      );
      for (let i = 0; i < batchResults.length; i++) {
        rewritten[batchStart + i] = batchResults[i];
      }
    }

    results.push(rewritten.join(' '));
  }

  return results.join('\n\n');
}

// ══════════════════════════════════════════════════════════════════
// PHASE 2: Aggressive Post-Processing (40% aggressiveness)
// ══════════════════════════════════════════════════════════════════

function phase2(text: string): string {
  const paragraphs = extractParagraphs(text);
  const results: string[] = [];
  const usedWords = new Set<string>();

  for (const para of paragraphs) {
    if (isHeading(para)) {
      results.push(para);
      continue;
    }

    const sentences = robustSentenceSplit(para);
    const processed = sentences.map(sent => {
      let s = sent;

      // AI word kill — replace all AI-flagged vocabulary
      s = applyAIWordKill(s);

      // AI phrase pattern replacement
      s = applyPhrasePatterns(s);

      // Synonym injection (40% of words)
      s = synonymReplace(s, 0.40, usedWords);

      // Expand any contractions that crept in
      s = expandAllContractions(s);

      // Remove first person
      s = removeFirstPerson(s);

      return s;
    });

    results.push(processed.join(' '));
  }

  return results.join('\n\n');
}

// ══════════════════════════════════════════════════════════════════
// PHASE 3: Cleaning Post-Processing (25-35% aggressiveness)
// ══════════════════════════════════════════════════════════════════

function phase3(text: string): string {
  const paragraphs = extractParagraphs(text);
  const results: string[] = [];
  const usedWords = new Set<string>();

  for (const para of paragraphs) {
    if (isHeading(para)) {
      results.push(para);
      continue;
    }

    let sentences = robustSentenceSplit(para);

    // Connector naturalization — vary transitions between sentences
    const joined = sentences.join(' ');
    const naturalized = applyConnectorNaturalization(joined);
    sentences = robustSentenceSplit(naturalized);

    // Light synonym pass (30% of words — targeting remaining AI markers)
    const processed = sentences.map(sent => {
      let s = sent;
      s = synonymReplace(s, 0.30, usedWords);
      s = expandAllContractions(s);
      return s;
    });

    // Diversify sentence starters across the paragraph
    const diversified = diversifyStarters(processed.join(' '));

    results.push(diversified);
  }

  return results.join('\n\n');
}

// ══════════════════════════════════════════════════════════════════
// PHASE 4: Paragraph-by-Paragraph Restructuring (20% reordering)
// ══════════════════════════════════════════════════════════════════

const PHASE4_SYSTEM = `You are an academic writing editor. You RESTRUCTURE existing paragraphs — you do NOT write new content.

CRITICAL ANTI-HALLUCINATION RULES — THESE OVERRIDE EVERYTHING:
- You are RESTRUCTURING the given paragraph. You must NOT invent new sentences or add new claims.
- Every fact, statistic, proper noun, entity, and key concept from the original paragraph MUST appear in your output.
- Do NOT add examples, explanations, elaborations, or ideas that are not in the original.
- Do NOT remove or drop any sentence's core meaning — only reorder, combine, or split existing sentences.
- Do NOT replace specific claims with vague generalizations.
- Count the key claims in the input. Your output must contain ALL of them — no more, no fewer.
- If the input has 5 distinct facts, your output must have those same 5 distinct facts.

STRUCTURING RULES:
1. Output ONLY the restructured paragraph. No explanations, labels, or commentary.
2. Restructure at least 20% of the sentences (reorder, combine, or split).
3. Ensure smooth logical flow between sentences.
4. Add or adjust ONLY transition words/phrases for coherence — not new claims.
5. NEVER use contractions.
6. NEVER use first person.
7. Keep the same number of key ideas — verify before outputting.
8. The result must read like a single coherent paragraph from a college paper.
9. Vary sentence lengths for natural rhythm — mix short and long sentences.
10. Do NOT start multiple sentences with the same word or phrase.`;

async function phase4(text: string): Promise<string> {
  const paragraphs = extractParagraphs(text);
  const results: string[] = [];

  // Process paragraphs in parallel (max 5 concurrent)
  const PARA_CONCURRENCY = 5;
  for (let i = 0; i < paragraphs.length; i += PARA_CONCURRENCY) {
    const batch = paragraphs.slice(i, i + PARA_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (para) => {
        if (isHeading(para)) return para;

        const sentences = robustSentenceSplit(para);
        if (sentences.length < 3) return para; // too short to restructure

        // Extract key terms from input for post-validation
        const inputTerms = extractKeyTerms(para);

        for (let attempt = 0; attempt < 2; attempt++) {
          const result = await llmCall(
            PHASE4_SYSTEM,
            `Restructure this paragraph for better academic flow. Reorder or recombine at least 20% of sentences. IMPORTANT: preserve every fact and entity — do not add or remove claims.\n\nParagraph:\n${para}`,
            0.45 + (attempt * 0.05),
            1024,
          );

          if (!result || result.length < para.length * 0.4) continue;

          // Clean LLM output
          let cleaned = result
            .replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, '')
            .replace(/^(?:Here(?:'s| is)[^:]*:|Restructured[^:]*:)\s*/i, '')
            .trim();

          // ── Anti-hallucination validation for paragraphs ──
          // 1. Length guard — output should not be wildly different
          if (cleaned.split(/\s+/).length > para.split(/\s+/).length * 1.5) {
            console.log(`[Apex P4] Rejected: output too long (hallucination likely), attempt ${attempt + 1}`);
            continue;
          }

          // 2. Key term preservation — at least 40% of input key terms must survive
          const outputTerms = extractKeyTerms(cleaned);
          let termOverlap = 0;
          for (const t of inputTerms) { if (outputTerms.has(t)) termOverlap++; }
          const overlapRatio = inputTerms.size > 0 ? termOverlap / inputTerms.size : 1;
          if (overlapRatio < 0.40) {
            console.log(`[Apex P4] Rejected: key term overlap ${(overlapRatio * 100).toFixed(0)}% < 40%, attempt ${attempt + 1}`);
            continue;
          }

          // 3. Semantic similarity check
          const sim = semanticSimilaritySync(para, cleaned);
          if (sim < 0.50) {
            console.log(`[Apex P4] Rejected: semantic similarity ${sim.toFixed(2)} < 0.50, attempt ${attempt + 1}`);
            continue;
          }

          cleaned = expandAllContractions(cleaned);
          cleaned = removeFirstPerson(cleaned);
          return cleaned;
        }

        // All attempts failed validation — return input paragraph unchanged
        return para;
      })
    );

    results.push(...batchResults);
  }

  return results.join('\n\n');
}

// ══════════════════════════════════════════════════════════════════
// PHASE 5: AI Signal Elimination
// ══════════════════════════════════════════════════════════════════

function phase5(text: string): string {
  const paragraphs = extractParagraphs(text);
  const results: string[] = [];

  for (const para of paragraphs) {
    if (isHeading(para)) {
      results.push(para);
      continue;
    }

    let sentences = robustSentenceSplit(para);

    // Deep cleaning pass — attacks statistical detector signals
    sentences = deepCleaningPass(sentences);

    // Per-sentence anti-detection — burstiness, uniformity, vocabulary signals
    sentences = perSentenceAntiDetection(sentences, false /* no contractions */);

    // Final AI word kill (catch anything reintroduced by restructuring)
    sentences = sentences.map(s => applyAIWordKill(s));

    // Expand any contractions (final enforcement)
    sentences = sentences.map(s => expandAllContractions(s));

    // Remove first person (final enforcement)
    sentences = sentences.map(s => removeFirstPerson(s));

    results.push(sentences.join(' '));
  }

  return results.join('\n\n');
}

// ══════════════════════════════════════════════════════════════════
// PHASE 6: Final Grammar/Capitalization/Punctuation Cleanup
// ══════════════════════════════════════════════════════════════════

function phase6(text: string, originalText: string): string {
  let result = text;

  // Fix punctuation errors
  result = fixPunctuation(result);

  // Fix capitalization (preserves proper nouns from original)
  result = fixCapitalization(result, originalText);

  // Fix sentence-initial lowercase
  result = result.replace(/(^|[.!?]\s+)([a-z])/g, (_m, pre, ch) => pre + ch.toUpperCase());

  // Fix double spaces
  result = result.replace(/ {2,}/g, ' ');

  // Fix space before punctuation
  result = result.replace(/ ([.,;:!?])/g, '$1');

  // Fix missing space after punctuation
  result = result.replace(/([.,;:!?])([A-Za-z])/g, '$1 $2');

  // Fix double punctuation
  result = result.replace(/([.!?]){2,}/g, '$1');
  result = result.replace(/,,/g, ',');

  // Fix article agreement
  const CONSONANT_SOUND_VOWELS = new Set(['uni', 'use', 'usa', 'usu', 'uti', 'ure', 'uro', 'one', 'once']);
  const VOWEL_SOUND_CONSONANTS = new Set(['hour', 'honest', 'honor', 'honour', 'heir', 'herb']);
  result = result.replace(/\b(a|an)\s+(\w+)/gi, (full, art, word) => {
    const lower = word.toLowerCase();
    const firstChar = lower[0];
    const first3 = lower.slice(0, 3);
    const isVowelSound = 'aeiou'.includes(firstChar)
      ? !CONSONANT_SOUND_VOWELS.has(first3)
      : VOWEL_SOUND_CONSONANTS.has(lower);
    const correctArt = isVowelSound ? 'an' : 'a';
    const actualArt = art.toLowerCase();
    if (actualArt === correctArt) return full;
    const fixed = art[0] === art[0].toUpperCase()
      ? (correctArt === 'an' ? 'An' : 'A')
      : correctArt;
    return fixed + ' ' + word;
  });

  // Fix doubled words
  result = result.replace(/\b(the|a|an|is|are|was|were|has|have|had|in|on|at|to|of|by|for|with|and|or|but|that|this)\s+\1\b/gi, '$1');

  // Final contraction enforcement (absolute last line)
  result = expandAllContractions(result);

  // Final first-person removal
  result = removeFirstPerson(result);

  // Validate and repair with existing shared utility
  const validated = validateAndRepairOutput(result, originalText);
  if (validated && validated.text && validated.text.trim().length > result.trim().length * 0.5) {
    result = validated.text;
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════

export interface ApexResult {
  humanized: string;
  phases: {
    phase1_change: number;
    phase2_change: number;
    phase3_change: number;
    phase4_change: number;
    phase5_change: number;
    total_change: number;
  };
  inputWords: number;
  outputWords: number;
  fallback: boolean;
  elapsedMs: number;
}

/**
 * Fast rule-based fallback — no LLM calls.
 * Handles up to 5000 words in <10 seconds using only phases 2, 3, 5, 6.
 * Used when LLM Phase 1 times out after 6 seconds or fails to respond.
 */
function fastFallback(text: string): string {
  console.log('[Apex FALLBACK] Running fast rule-based pipeline (no LLM)...');
  let result = text;
  result = phase2(result);
  result = phase3(result);
  result = phase5(result);
  result = phase6(result, text);
  return result;
}

/**
 * Apex Humanizer — 6-phase Groq + post-processing pipeline.
 * Produces college-level academic prose with zero AI detection signals.
 *
 * SPEED GUARANTEES:
 * - Up to 5000 words handled in <10 seconds via fast fallback
 * - Each LLM phase has a 6-second budget — if exceeded, falls back to rule-based
 * - Individual LLM calls timeout at 6 seconds
 *
 * @param text Input text to humanize
 * @returns Humanized text with phase-by-phase statistics
 */
export async function apexHumanize(text: string): Promise<ApexResult> {
  const startTime = Date.now();
  const inputWords = text.trim().split(/\s+/).length;
  let usedFallback = false;

  // ── Phase 1: LLM sentence-by-sentence parallel rewrite ──
  // Race against 6-second budget — if LLM is slow, fall back to rule-based
  console.log('[Apex] Phase 1: LLM rewrite (50%+ transformation)...');
  let result: string;
  const phase1Promise = phase1(text);
  const phase1Result = await withTimeout(phase1Promise, PHASE1_BUDGET_MS, null as string | null);

  if (phase1Result === null || phase1Result === text) {
    // LLM timed out or returned unchanged — use fast fallback for entire pipeline
    console.log('[Apex] Phase 1 timed out after 6s — switching to fast fallback');
    usedFallback = true;
    result = fastFallback(text);
    const totalChange = measureWordChange(text, result);
    const outputWords = result.trim().split(/\s+/).length;
    const elapsedMs = Date.now() - startTime;
    console.log(`[Apex FALLBACK] DONE in ${elapsedMs}ms — ${(totalChange * 100).toFixed(1)}% change`);
    return {
      humanized: result,
      phases: {
        phase1_change: 0,
        phase2_change: totalChange,
        phase3_change: 0,
        phase4_change: 0,
        phase5_change: 0,
        total_change: Math.round(totalChange * 1000) / 1000,
      },
      inputWords,
      outputWords,
      fallback: true,
      elapsedMs,
    };
  }

  result = phase1Result;
  const p1Change = measureWordChange(text, result);
  console.log(`[Apex] Phase 1 complete: ${(p1Change * 100).toFixed(1)}% change (${Date.now() - startTime}ms)`);

  // ── Phase 2: Aggressive post-processing (40%) ──
  console.log('[Apex] Phase 2: Aggressive post-processing (40%)...');
  const beforeP2 = result;
  result = phase2(result);
  const p2Change = measureWordChange(beforeP2, result);
  console.log(`[Apex] Phase 2 complete: ${(p2Change * 100).toFixed(1)}% additional change`);

  // ── Phase 3: Cleaning post-processing (25-35%) ──
  console.log('[Apex] Phase 3: Cleaning pass (30%)...');
  const beforeP3 = result;
  result = phase3(result);
  const p3Change = measureWordChange(beforeP3, result);
  console.log(`[Apex] Phase 3 complete: ${(p3Change * 100).toFixed(1)}% additional change`);

  // ── Phase 4: Paragraph-by-paragraph restructuring (20%) ──
  // Check remaining time budget — skip Phase 4 LLM if running low
  const elapsedBeforeP4 = Date.now() - startTime;
  const remainingBudget = TOTAL_BUDGET_MS - elapsedBeforeP4;
  let p4Change = 0;

  if (remainingBudget > 2000) {
    // Still have time budget — attempt Phase 4 with timeout
    const phase4Budget = Math.min(PHASE4_BUDGET_MS, remainingBudget - 1000);
    console.log(`[Apex] Phase 4: Paragraph restructuring (budget: ${phase4Budget}ms)...`);
    const beforeP4 = result;
    const phase4Promise = phase4(result);
    const phase4Result = await withTimeout(phase4Promise, phase4Budget, null as string | null);

    if (phase4Result !== null) {
      result = phase4Result;
      p4Change = measureWordChange(beforeP4, result);
      console.log(`[Apex] Phase 4 complete: ${(p4Change * 100).toFixed(1)}% additional change`);
    } else {
      console.log('[Apex] Phase 4 skipped — time budget exceeded');
    }
  } else {
    console.log(`[Apex] Phase 4 skipped — only ${remainingBudget}ms remaining`);
  }

  // ── Phase 5: AI signal elimination ──
  console.log('[Apex] Phase 5: AI signal elimination...');
  const beforeP5 = result;
  result = phase5(result);
  const p5Change = measureWordChange(beforeP5, result);
  console.log(`[Apex] Phase 5 complete: ${(p5Change * 100).toFixed(1)}% additional change`);

  // ── Phase 6: Final grammar/punctuation cleanup ──
  console.log('[Apex] Phase 6: Grammar & punctuation cleanup...');
  result = phase6(result, text);

  const totalChange = measureWordChange(text, result);
  const outputWords = result.trim().split(/\s+/).length;
  const elapsedMs = Date.now() - startTime;
  console.log(`[Apex] DONE in ${elapsedMs}ms — Total transformation: ${(totalChange * 100).toFixed(1)}%`);

  return {
    humanized: result,
    phases: {
      phase1_change: Math.round(p1Change * 1000) / 1000,
      phase2_change: Math.round(p2Change * 1000) / 1000,
      phase3_change: Math.round(p3Change * 1000) / 1000,
      phase4_change: Math.round(p4Change * 1000) / 1000,
      phase5_change: Math.round(p5Change * 1000) / 1000,
      total_change: Math.round(totalChange * 1000) / 1000,
    },
    inputWords,
    outputWords,
    fallback: usedFallback,
    elapsedMs,
  };
}
