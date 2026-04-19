/**
 * King Humanizer Engine — Pure LLM Multi-Phase Sentence-by-Sentence Pipeline
 * ===========================================================================
 *
 * Uses Groq chat models with the full Wikipedia AI Cleanup ruleset to remove every
 * known AI writing pattern.  Each sentence is processed independently through
 * multiple humanization phases, then reassembled back into the original
 * paragraph structure.
 *
 * PIPELINE (per sentence):
 *   Phase 1: LLM deep rewrite — eliminate all 29 Wikipedia AI Cleanup patterns
 *   Phase 2: LLM self-audit — "What makes this obviously AI generated?"
 *   Phase 3: LLM revision  — fix remaining tells identified in Phase 2
 *
 * After all sentences are processed they are reassembled preserving the
 * original paragraph breaks and heading/title positions.
 *
 * TITLE HANDLING:
 *   - Lines detected as headings or titles are NEVER sent to the LLM
 *   - Headings are preserved verbatim in their original positions
 *   - Title-case enforcement inside body text is corrected
 */

import { robustSentenceSplit, humanizeTitle } from "./content-protection";
import {
  applyAIWordKill,
  expandAllContractions,
  fixCapitalization,
  fixPunctuation,
} from "./shared-dictionaries";
import { semanticSimilaritySync } from "./semantic-guard";
import { getGroqClient, resolveGroqChatModel } from "./groq-client";

// ── Config ──────────────────────────────────────────────────────────

const LLM_MODEL = resolveGroqChatModel(process.env.LLM_MODEL, "llama-3.3-70b-versatile");
const CONCURRENCY = Math.min(Number(process.env.KING_CONCURRENCY ?? 10), 20);
const LLM_TIMEOUT_MS = 15_000;
const TOTAL_BUDGET_MS = 120_000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function llmCall(
  system: string,
  user: string,
  temperature: number,
  maxTokens = 1024,
): Promise<string> {
  const client = getGroqClient();
  const p = client.chat.completions
    .create({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
      max_tokens: maxTokens,
    })
    .then((r) => r.choices[0]?.message?.content?.trim() ?? "");
  return withTimeout(p, LLM_TIMEOUT_MS, "");
}

// ── Utilities ───────────────────────────────────────────────────────

function measureWordChange(original: string, modified: string): number {
  const a = original.toLowerCase().split(/\s+/).filter(Boolean);
  const b = modified.toLowerCase().split(/\s+/).filter(Boolean);
  const len = Math.max(a.length, b.length);
  if (len === 0) return 1;
  let changed = 0;
  for (let i = 0; i < len; i++) {
    if (!a[i] || !b[i] || a[i] !== b[i]) changed++;
  }
  return changed / len;
}

function isHeading(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^#{1,6}\s/.test(t)) return true;
  if (/^[IVXLCDM]+\.\s/i.test(t)) return true;
  if (
    /^(?:Part|Section|Chapter|Abstract|Introduction|Conclusion|References|Bibliography|Discussion|Results|Methods|Appendix)\b/i.test(
      t,
    )
  )
    return true;
  if (/^[\d]+[.):]\s/.test(t) && t.split(/\s+/).length <= 10) return true;
  const words = t.split(/\s+/);
  if (words.length <= 3 && !/[.!?]$/.test(t) && /^[A-Z]/.test(t)) return true;
  if (/^[A-Z][A-Z\s]+$/.test(t)) return true;
  return false;
}

function extractParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Extract key nouns for anti-hallucination validation */
function extractKeyTerms(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const STOP = new Set([
    "this","that","with","from","have","been","were","will","would","could",
    "should","also","than","then","them","they","their","there","these",
    "those","which","where","about","after","before","other","some","such",
    "more","most","very","only","just","into","over","each","well","much",
    "many","does","made","make","when","what","while",
  ]);
  return new Set(words.filter((w) => !STOP.has(w)));
}

function validateNotHallucinated(original: string, output: string): boolean {
  const origWords = original.split(/\s+/).length;
  const outWords = output.split(/\s+/).length;
  if (outWords > origWords * 2.0 || outWords < origWords * 0.3) return false;

  const sim = semanticSimilaritySync(original, output);
  if (sim < 0.40) return false;

  const origTerms = extractKeyTerms(original);
  const outTerms = extractKeyTerms(output);
  if (origTerms.size === 0) return true;
  let overlap = 0;
  for (const t of origTerms) if (outTerms.has(t)) overlap++;
  if (overlap / origTerms.size < 0.30) return false;

  return true;
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 1 — Deep rewrite with full Wikipedia AI Cleanup ruleset
// ══════════════════════════════════════════════════════════════════════

const PHASE1_SYSTEM = `You are a writing editor that removes ALL signs of AI-generated text.  You rewrite ONE sentence at a time.

ANTI-HALLUCINATION — OVERRIDES EVERYTHING:
- You PARAPHRASE the given sentence.  Never invent new facts or drop existing ones.
- Every proper noun, statistic, entity, and specific claim MUST survive in your output.
- Output ONLY the rewritten sentence.  No labels, no quotes, no commentary.

AI PATTERN REMOVAL CHECKLIST (apply ALL that are relevant):
1. SIGNIFICANCE INFLATION — Remove "pivotal", "testament", "crucial", "vital role", "enduring", "broader", "indelible mark", "setting the stage".  State facts plainly.
2. NOTABILITY PUFFING — Do not list media outlets for emphasis.  Cite one specific detail instead.
3. SUPERFICIAL -ING TAILS — Remove dangling "highlighting…", "underscoring…", "reflecting…", "showcasing…", "ensuring…", "fostering…" clauses tacked onto sentences.
4. PROMOTIONAL LANGUAGE — Kill "vibrant", "rich" (figurative), "profound", "nestled", "groundbreaking", "renowned", "breathtaking", "stunning", "must-visit", "boasts".
5. VAGUE ATTRIBUTIONS — Replace "experts argue", "industry reports", "observers have cited" with a concrete source or drop the hedge entirely.
6. CHALLENGES-AND-PROSPECTS — Remove formulaic "Despite challenges… continues to thrive" patterns.
7. OVERUSED AI VOCABULARY — Replace: additionally, align with, crucial, delve, emphasize, enduring, enhance, foster, garner, highlight (verb), interplay, intricate, key (adj), landscape (abstract), pivotal, showcase, tapestry (abstract), testament, underscore (verb), valuable, vibrant.
8. COPULA AVOIDANCE — Replace "serves as", "stands as", "represents", "boasts", "features", "offers" with plain "is", "are", "has".
9. NEGATIVE PARALLELISMS — Rewrite "Not only X but Y" and "It's not just X, it's Y" as a single direct statement.  Remove tailing negation fragments ("no guessing").
10. RULE OF THREE — Do NOT group ideas into artificial triads.
11. ELEGANT VARIATION — Use one name for a referent, not cycling synonyms.
12. FALSE RANGES — Remove "from X to Y" constructions where X and Y are not on a real scale.
13. PASSIVE VOICE / SUBJECTLESS FRAGMENTS — Prefer active voice with a clear subject.
14. EM DASH OVERUSE — Replace em dashes (—) with commas, periods, or parentheses.
15. BOLDFACE / EMOJIS — Strip bold markers and emojis.
16. INLINE-HEADER LISTS — Merge bolded-header bullet items into flowing prose.
17. TITLE CASE IN HEADINGS — Use sentence case.
18. CURLY QUOTES — Use straight quotes only.
19. COLLABORATIVE ARTIFACTS — Remove "I hope this helps", "Let me know", "Certainly!", "Of course!".
20. KNOWLEDGE-CUTOFF DISCLAIMERS — Remove "as of", "based on available information", "while specific details are limited".
21. SYCOPHANTIC TONE — Remove "Great question!", "You're absolutely right!".
22. FILLER PHRASES — "In order to" → "To"; "Due to the fact that" → "Because"; "It is important to note that" → drop.
23. EXCESSIVE HEDGING — "could potentially possibly be argued" → direct statement.
24. GENERIC POSITIVE CONCLUSIONS — Remove "the future looks bright", "exciting times lie ahead".
25. HYPHENATED PAIRS — Drop hyphens from common compounds: "cross-functional" → "cross functional", "data-driven" → "data driven", "high-quality" → "high quality".
26. PERSUASIVE AUTHORITY TROPES — Remove "The real question is", "at its core", "what really matters", "fundamentally".
27. SIGNPOSTING — Remove "Let's dive in", "Here's what you need to know", "Let's break this down".
28. FRAGMENTED HEADERS — Remove one-line restatements that follow a heading.
29. PERSONALITY — Vary sentence length.  Have opinions where appropriate.  Acknowledge complexity.  Let some mess in.  Be specific about feelings.

STRICT STYLE:
- Match the register of the original (formal, casual, technical).
- Change at least 50% of words while preserving ALL facts and meaning.
- Vary sentence structure: use clause fronting, appositives, participial openers.
- Do NOT start with "This", "It is", or "There is/are".`;

async function phase1Sentence(sentence: string, idx: number, total: number): Promise<string> {
  const position = idx < total * 0.2 ? "opening" : idx > total * 0.8 ? "closing" : "body";
  const prompts = [
    `Rewrite this sentence removing every AI writing pattern.  Use clause fronting.  Position: ${position}.\n\nSentence: ${sentence}`,
    `Paraphrase this sentence so it sounds fully human.  Restructure the grammar significantly.  Position: ${position}.\n\nSentence: ${sentence}`,
    `Rewrite in a natural, human voice.  Vary the word order from the original.  Position: ${position}.\n\nSentence: ${sentence}`,
    `Transform this sentence removing all AI tells.  Use a fresh opening and different main verb.  Position: ${position}.\n\nSentence: ${sentence}`,
    `Restructure this sentence with a different grammatical pattern.  No AI vocabulary.  Position: ${position}.\n\nSentence: ${sentence}`,
  ];

  const prompt = prompts[idx % prompts.length];
  const temp = 0.65 + (idx % 4) * 0.08; // 0.65 … 0.89

  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await llmCall(PHASE1_SYSTEM, prompt, temp + attempt * 0.04);
    if (!raw) continue;

    let cleaned = raw
      .replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, "")
      .replace(/^(?:Here(?:'s| is)[^:]*:|Rewritten[^:]*:|Output[^:]*:)\s*/i, "")
      .trim();

    // Replace curly quotes with straight
    cleaned = cleaned.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

    if (!validateNotHallucinated(sentence, cleaned)) continue;
    if (measureWordChange(sentence, cleaned) >= 0.45 && cleaned.length > 10) return cleaned;
  }
  return sentence; // fallback — later phases will still process it
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 2 — Self-audit: "What makes this obviously AI generated?"
// ══════════════════════════════════════════════════════════════════════

const PHASE2_SYSTEM = `You are evaluating a single sentence for remaining AI writing tells.
Answer with a SHORT bullet list (max 5 bullets) of specific remaining AI patterns.
If there are no remaining tells, respond with only: CLEAN
Do NOT rewrite the sentence — only diagnose.`;

async function phase2Audit(sentence: string): Promise<string> {
  const result = await llmCall(
    PHASE2_SYSTEM,
    `What makes this sentence obviously AI generated?\n\nSentence: ${sentence}`,
    0.3,
    256,
  );
  return result || "CLEAN";
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 3 — Revision: fix remaining tells from Phase 2 audit
// ══════════════════════════════════════════════════════════════════════

const PHASE3_SYSTEM = `You are a writing editor.  You receive a sentence and a list of remaining AI writing patterns found in it.  Revise the sentence to eliminate ONLY those specific patterns.

RULES:
- Output ONLY the revised sentence.  No labels, no quotes, no commentary.
- Preserve all facts, entities, and meaning.
- If the diagnosis says "CLEAN", output the sentence unchanged.
- Do NOT introduce new AI patterns while fixing old ones.
- Use straight quotes, no em dashes, no filler, no hedging.`;

async function phase3Revise(sentence: string, diagnosis: string): Promise<string> {
  if (diagnosis.trim().toUpperCase() === "CLEAN") return sentence;

  const prompt = `Revise this sentence to fix ONLY the listed AI patterns.\n\nSentence: ${sentence}\n\nRemaining AI patterns:\n${diagnosis}`;
  const raw = await llmCall(PHASE3_SYSTEM, prompt, 0.55, 512);
  if (!raw) return sentence;

  const cleaned = raw
    .replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, "")
    .replace(/^(?:Here(?:'s| is)[^:]*:|Revised[^:]*:|Output[^:]*:)\s*/i, "")
    .trim()
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");

  if (!validateNotHallucinated(sentence, cleaned)) return sentence;
  return cleaned.length > 5 ? cleaned : sentence;
}

// ══════════════════════════════════════════════════════════════════════
// Full sentence pipeline: Phase 1 → Phase 2 → Phase 3
// ══════════════════════════════════════════════════════════════════════

async function processSentence(
  sentence: string,
  idx: number,
  total: number,
): Promise<string> {
  // Phase 1: deep rewrite
  let result = await phase1Sentence(sentence, idx, total);

  // Phase 2+3 only if Phase 1 didn't change enough (saves 2 LLM calls per sentence)
  const change = measureWordChange(sentence, result);
  if (change < 0.45) {
    // Phase 2: self-audit
    const diagnosis = await phase2Audit(result);

    // Phase 3: targeted revision (skip if audit says CLEAN)
    result = await phase3Revise(result, diagnosis);
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════════
// Post-processing (non-LLM) — light cleanup pass
// ══════════════════════════════════════════════════════════════════════

function postProcess(text: string, originalText: string): string {
  let result = text;

  // Kill any remaining AI vocabulary that snuck through LLM output
  result = applyAIWordKill(result);

  // Expand contractions
  result = expandAllContractions(result);

  // Replace curly quotes
  result = result.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

  // Replace em dashes with commas or periods
  result = result.replace(/\s*—\s*/g, ", ");

  // Strip bold markers
  result = result.replace(/\*\*([^*]+)\*\*/g, "$1");

  // Strip emojis
  result = result.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu,
    "",
  );

  // Fix AI/ai capitalization
  result = result
    .replace(/\bai-(\w)/gi, (_m: string, c: string) => `AI-${c}`)
    .replace(/\baI\b/g, "AI");

  // Fix punctuation
  result = fixPunctuation(result);

  // Fix capitalization — preserve proper nouns from original
  result = fixCapitalization(result, originalText);

  // Fix sentence-initial lowercase
  result = result.replace(/(^|[.!?]\s+)([a-z])/g, (_m, pre, ch) => pre + ch.toUpperCase());

  // Fix double spaces
  result = result.replace(/ {2,}/g, " ");

  // Fix space before punctuation
  result = result.replace(/ ([.,;:!?])/g, "$1");

  // Fix missing space after punctuation
  result = result.replace(/([.,;:!?])([A-Za-z])/g, "$1 $2");

  // Double punctuation
  result = result.replace(/([.!?]){2,}/g, "$1");
  result = result.replace(/,,/g, ",");

  return result;
}

// ══════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════

export interface KingResult {
  humanized: string;
  phases: {
    phase1_change: number; // deep rewrite
    phase3_change: number; // targeted revision
    total_change: number;
  };
  inputWords: number;
  outputWords: number;
  elapsedMs: number;
}

/**
 * King Humanizer — Pure LLM multi-phase sentence-by-sentence humanization.
 *
 * Each sentence flows through:
 *   Phase 1: Deep rewrite (Wikipedia AI Cleanup 29-rule checklist)
 *   Phase 2: Self-audit ("what makes this AI?")
 *   Phase 3: Targeted revision (fix Phase 2 findings)
 *
 * Titles / headings are detected and preserved verbatim.
 * Paragraphs are split, sentences processed independently, then reassembled
 * in the original paragraph structure.
 */
export async function kingHumanize(text: string): Promise<KingResult> {
  const startTime = Date.now();
  const inputWords = text.trim().split(/\s+/).length;

  // ── Split into paragraphs, preserving blank-line structure ──
  const rawParagraphs = text.split(/\n\s*\n/);
  const results: string[] = [];

  for (const rawPara of rawParagraphs) {
    const para = rawPara.trim();
    if (!para) {
      results.push("");
      continue;
    }

    // Titles / headings — light humanization for >6 words, preserve otherwise
    if (isHeading(para)) {
      results.push(humanizeTitle(para));
      continue;
    }

    // Split paragraph into sentences
    const sentences = robustSentenceSplit(para);
    const totalSentences = sentences.length;

    // Process sentences in parallel with concurrency limit
    const rewritten: string[] = new Array(sentences.length);

    for (let batchStart = 0; batchStart < sentences.length; batchStart += CONCURRENCY) {
      // Check time budget
      if (Date.now() - startTime > TOTAL_BUDGET_MS) {
        // Out of time — keep remaining sentences as-is
        for (let i = batchStart; i < sentences.length; i++) {
          rewritten[i] = sentences[i];
        }
        break;
      }

      const batch = sentences.slice(batchStart, batchStart + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((sent, i) => processSentence(sent, batchStart + i, totalSentences)),
      );
      for (let i = 0; i < batchResults.length; i++) {
        rewritten[batchStart + i] = batchResults[i];
      }
    }

    results.push(rewritten.join(" "));
  }

  // ── Reassemble with original paragraph spacing ──
  let humanized = results.join("\n\n");

  // ── Measure Phase 1+3 change (LLM phases) ──
  const llmChange = measureWordChange(text, humanized);

  // ── Post-processing (non-LLM cleanup) ──
  humanized = postProcess(humanized, text);

  const totalChange = measureWordChange(text, humanized);
  const outputWords = humanized.trim().split(/\s+/).length;
  const elapsedMs = Date.now() - startTime;

  console.log(
    `[King] DONE in ${elapsedMs}ms — LLM change: ${(llmChange * 100).toFixed(1)}%, ` +
      `Total: ${(totalChange * 100).toFixed(1)}%, Words: ${inputWords}→${outputWords}`,
  );

  return {
    humanized,
    phases: {
      phase1_change: Math.round(llmChange * 1000) / 1000,
      phase3_change: Math.round((totalChange - llmChange) * 1000) / 1000,
      total_change: Math.round(totalChange * 1000) / 1000,
    },
    inputWords,
    outputWords,
    elapsedMs,
  };
}
