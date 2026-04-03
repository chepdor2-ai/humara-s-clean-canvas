/**
 * Premium Humanizer Engine — Purely AI-Driven Per-Sentence Pipeline
 * ==================================================================
 *
 * When Premium mode is active, ALL stages of humanization are handled
 * exclusively through GPT-4o-mini with extremely strict prompt rules.
 * No rule-based/non-LLM transforms are called at any point.
 *
 * The pipeline processes EACH sentence independently through multiple
 * LLM phases with strict control instructions, then VERIFIES the output
 * programmatically to ensure the LLM followed instructions exactly.
 *
 * Flow per sentence:
 *   Phase A: Deep Structural Rewrite + Humanization (combined, strict rules)
 *   Phase B: AI Vocabulary Purge (LLM given explicit kill list, strict 1-in-1-out)
 *   Phase C: Final Stealth Polish (connector naturalization, starter fix, rhythm)
 *   Verification: Programmatic check — if banned words remain, retry Phase B (max 2)
 *
 * The selected mode (fast/standard/stealth) controls:
 *   - Temperature / creativity level
 *   - Number of verification retries
 *   - Aggressiveness of restructuring
 */

import OpenAI from "openai";
import {
  protectSpecialContent,
  restoreSpecialContent,
  protectContentTerms,
  restoreContentTerms,
  robustSentenceSplit,
  placeholdersToLLMFormat,
  llmFormatToPlaceholders,
  countSentences,
  enforcePerParagraphSentenceCounts,
  rephraseCitations,
} from "./content-protection";
import { semanticSimilaritySync } from "./semantic-guard";
import { TextSignals, getDetector } from "./multi-detector";
import { expandContractions } from "./advanced-transforms";

// ── Config ──

const LLM_MODEL = process.env.LLM_MODEL ?? "gpt-4o-mini";

// ── OpenAI client singleton ──

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY not set.");
  _client = new OpenAI({ apiKey });
  return _client;
}

async function llmCall(
  system: string,
  user: string,
  temperature: number,
  maxTokens = 4096,
): Promise<string> {
  const client = getClient();
  const r = await client.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
    max_tokens: maxTokens,
  });
  return r.choices[0]?.message?.content?.trim() ?? "";
}

// ── Input Feature Detection ──

interface InputFeatures {
  hasContractions: boolean;
  hasFirstPerson: boolean;
  hasRhetoricalQuestions: boolean;
  avgSentenceLength: number;
  paragraphCount: number;
  wordCount: number;
  sentenceCount: number;
}

function detectInputFeatures(text: string): InputFeatures {
  const contractionRe =
    /\b(can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|wouldn't|shouldn't|couldn't|mustn't|it's|that's|there's|here's|he's|she's|they're|we're|you're|I'm|they've|we've|you've|I've|they'll|we'll|you'll|I'll|he'll|she'll|it'll|let's|who's|what's)\b/gi;
  const firstPersonRe = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/;
  const sentences = robustSentenceSplit(text);
  const totalWords = text.trim().split(/\s+/).length;

  return {
    hasContractions: contractionRe.test(text),
    hasFirstPerson: firstPersonRe.test(text),
    hasRhetoricalQuestions: /[A-Za-z][^.!?]*\?/.test(text),
    avgSentenceLength:
      sentences.length > 0 ? totalWords / sentences.length : 15,
    paragraphCount: text
      .split(/\n\s*\n/)
      .filter((p) => p.trim()).length,
    wordCount: totalWords,
    sentenceCount: sentences.length,
  };
}

// ── Title/Heading Detection ──

function isTitleOrHeading(para: string): boolean {
  const trimmed = para.trim();
  if (!trimmed) return false;
  // Markdown headings
  if (/^#{1,6}\s/.test(trimmed)) return true;
  // Roman numeral headings
  if (/^[IVXLCDM]+\.\s/i.test(trimmed)) return true;
  // Part/Section/Chapter headings
  if (/^(?:Part|Section|Chapter)\s+\d+/i.test(trimmed)) return true;
  // Numbered or lettered list items (e.g., "1. Title" or "A. Title")
  if (/^[\d]+[.):]\s/.test(trimmed) || /^[A-Za-z][.):]\s/.test(trimmed))
    return true;
  // Known single-word headings
  if (
    /^(?:Introduction|Conclusion|Summary|Abstract|Background|Discussion|Results|Methods|References|Acknowledgments|Appendix)\s*$/i.test(
      trimmed,
    )
  )
    return true;
  // ALL CAPS lines with ≤12 words (e.g., "CHAPTER 1 OVERVIEW")
  const words = trimmed.split(/\s+/);
  if (
    words.length <= 12 &&
    trimmed === trimmed.toUpperCase() &&
    /[A-Z]/.test(trimmed)
  )
    return true;
  // Short lines (≤6 words) that don't end in sentence punctuation AND
  // contain a colon or are title-cased — these are likely headings
  if (words.length <= 6 && !/[.!?]$/.test(trimmed)) {
    if (/:/.test(trimmed)) return true;
    // Title-cased: most words start with uppercase
    const capitalizedWords = words.filter(w => /^[A-Z]/.test(w)).length;
    if (capitalizedWords >= Math.ceil(words.length * 0.6)) return true;
  }
  return false;
}

// ══════════════════════════════════════════════════════════════════════════
// BANNED VOCABULARY — used for both prompting and verification
// ══════════════════════════════════════════════════════════════════════════

const BANNED_WORDS = new Set([
  "utilize", "utilise", "facilitate", "leverage", "comprehensive",
  "multifaceted", "paramount", "furthermore", "moreover", "additionally",
  "consequently", "subsequently", "nevertheless", "notwithstanding",
  "aforementioned", "paradigm", "trajectory", "discourse", "dichotomy",
  "conundrum", "ramification", "underpinning", "synergy", "robust",
  "nuanced", "salient", "ubiquitous", "pivotal", "intricate",
  "meticulous", "profound", "inherent", "overarching", "substantive",
  "efficacious", "holistic", "transformative", "innovative",
  "groundbreaking", "noteworthy", "proliferate", "exacerbate",
  "ameliorate", "engender", "delineate", "elucidate", "illuminate",
  "necessitate", "perpetuate", "underscore", "exemplify", "encompass",
  "bolster", "catalyze", "streamline", "optimize", "mitigate",
  "navigate", "prioritize", "articulate", "substantiate", "corroborate",
  "disseminate", "cultivate", "ascertain", "endeavor", "delve",
  "embark", "foster", "harness", "spearhead", "unravel", "unveil",
  "tapestry", "cornerstone", "bedrock", "linchpin", "nexus", "spectrum",
  "myriad", "plethora", "multitude", "landscape", "realm", "culminate",
  "enhance", "crucial", "vital", "imperative", "notable", "significant",
  "substantial", "remarkable", "considerable", "unprecedented",
  "methodology", "framework", "implication", "implications",
  "impactful", "actionable", "scalable", "stakeholders", "stakeholder",
  "ecosystem", "proactive", "seamless", "optimal", "empower",
  "narrative", "disruptive", "benchmark", "interplay", "diverse",
  "dynamic", "implement", "pertaining", "integral", "demonstrate",
  "ensure", "aspect", "notion",
]);

const BANNED_STARTERS = new Set([
  "furthermore", "moreover", "additionally", "however", "nevertheless",
  "consequently", "subsequently", "notwithstanding", "accordingly",
  "thus", "hence", "indeed", "notably", "specifically", "crucially",
  "importantly", "essentially", "fundamentally", "arguably",
  "undeniably", "undoubtedly", "interestingly", "remarkably",
  "evidently",
]);

const BANNED_PHRASES_RE = [
  /it is (?:important|crucial|essential|vital|imperative|worth noting) (?:to note |to mention )?that/gi,
  /plays? a (?:crucial|vital|key|significant|important|pivotal|critical) role/gi,
  /in today'?s (?:world|society|landscape|era)/gi,
  /a (?:wide|broad|vast) (?:range|array|spectrum) of/gi,
  /(?:due to|owing to) the fact that/gi,
  /serves? as a (?:testament|reminder|catalyst|cornerstone)/gi,
  /not only .{5,40} but also/gi,
  /in (?:order )?to\b/gi,
  /there is no doubt that/gi,
  /needless to say/gi,
  /first and foremost/gi,
  /each and every/gi,
  /when it comes to/gi,
  /in the context of/gi,
  /at the end of the day/gi,
  /cannot be overstated/gi,
];

// ── Banned word list as a comma-separated string for prompts ──

const BANNED_WORDS_LIST = Array.from(BANNED_WORDS).join(", ");

// ══════════════════════════════════════════════════════════════════════════
// VERIFICATION FUNCTIONS — programmatic checks on LLM output
// ══════════════════════════════════════════════════════════════════════════

function containsBannedWords(text: string): string[] {
  const found: string[] = [];
  const words = text.toLowerCase().split(/\s+/);
  for (const w of words) {
    const clean = w.replace(/[^a-z]/g, "");
    if (BANNED_WORDS.has(clean)) found.push(clean);
  }
  return [...new Set(found)];
}

function hasBannedStarter(text: string): boolean {
  const first = text.trim().split(/[\s,]+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  return BANNED_STARTERS.has(first);
}

function hasBannedPhrases(text: string): boolean {
  for (const re of BANNED_PHRASES_RE) {
    re.lastIndex = 0;
    if (re.test(text)) return true;
  }
  return false;
}

function verifySentenceOutput(
  original: string,
  rewritten: string,
  features: InputFeatures,
): { passed: boolean; issues: string[] } {
  const issues: string[] = [];

  // 1. Check banned words
  const banned = containsBannedWords(rewritten);
  if (banned.length > 0) issues.push(`BANNED_WORDS: ${banned.join(", ")}`);

  // 2. Check banned starter
  if (hasBannedStarter(rewritten)) issues.push("BANNED_STARTER");

  // 3. Check banned phrases
  if (hasBannedPhrases(rewritten)) issues.push("BANNED_PHRASE");

  // 4. Check sentence count (must be exactly 1)
  const sentCount = robustSentenceSplit(rewritten).length;
  if (sentCount > 1) issues.push(`MULTI_SENTENCE: ${sentCount}`);

  // 5. Check word count within ±30% (generous for per-sentence)
  const origWords = original.trim().split(/\s+/).length;
  const newWords = rewritten.trim().split(/\s+/).length;
  if (newWords > origWords * 1.4 || newWords < origWords * 0.5) {
    issues.push(`WORD_COUNT: ${origWords} → ${newWords}`);
  }

  // 5b. HALLUCINATION CHECK: if output is >2x words of input, reject outright
  if (newWords > origWords * 2) {
    issues.push(`HALLUCINATION: input ${origWords} words → output ${newWords} words`);
  }

  // 6. Check contraction constraint
  if (!features.hasContractions) {
    const contractionRe =
      /\b(can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|wouldn't|shouldn't|couldn't|mustn't|it's|that's|there's|here's|he's|she's|they're|we're|you're|I'm|they've|we've|you've|I've|they'll|we'll|you'll|I'll|he'll|she'll|it'll|let's|who's|what's)\b/gi;
    if (contractionRe.test(rewritten)) issues.push("CONTRACTION_INJECTED");
  }

  // 7. Check first-person constraint
  if (!features.hasFirstPerson) {
    const fpRe = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/;
    if (fpRe.test(rewritten)) issues.push("FIRST_PERSON_INJECTED");
  }

  // 8. Check rhetorical question constraint
  if (!features.hasRhetoricalQuestions && rewritten.trim().endsWith("?")) {
    issues.push("RHETORICAL_QUESTION_ADDED");
  }

  return { passed: issues.length === 0, issues };
}

// ══════════════════════════════════════════════════════════════════════════
// MODE CONFIGURATIONS
// ══════════════════════════════════════════════════════════════════════════

interface ModeConfig {
  temperatureBase: number;
  maxRetries: number;
  aggressiveness: string;
  strengthInstruction: string;
}

function getModeConfig(engine: string, strength: string): ModeConfig {
  // Engine controls the pipeline style; strength controls intensity
  const configs: Record<string, ModeConfig> = {
    ghost_mini: {
      temperatureBase: 0.60,
      maxRetries: 1,
      aggressiveness: "light",
      strengthInstruction:
        "Make minimal but effective changes. Focus on key vocabulary swaps and light restructuring. Keep close to the original phrasing.",
    },
    ghost_pro: {
      temperatureBase: 0.75,
      maxRetries: 2,
      aggressiveness: "medium",
      strengthInstruction:
        "Moderately rephrase and restructure. Change vocabulary, clause ordering, and sentence openings actively. Create a clearly distinct version from the input.",
    },
    ninja: {
      temperatureBase: 0.85,
      maxRetries: 3,
      aggressiveness: "strong",
      strengthInstruction:
        "Aggressively restructure and rephrase. Substantially change sentence structure, vocabulary, and clause ordering. Push hard for maximum variation from the original while preserving meaning.",
    },
    undetectable: {
      temperatureBase: 0.90,
      maxRetries: 3,
      aggressiveness: "extreme",
      strengthInstruction:
        "Maximum restructuring. Completely rephrase every sentence with radically different structure, vocabulary, and flow. The output must read as if written by a completely different person. Preserve only the core meaning and facts.",
    },
  };

  const config = configs[engine] ?? configs.ghost_pro;

  // Strength further adjusts temperature
  const strengthTempBoost: Record<string, number> = {
    light: -0.05,
    medium: 0,
    strong: 0.08,
  };
  config.temperatureBase += strengthTempBoost[strength] ?? 0;
  config.temperatureBase = Math.max(0.3, Math.min(1.0, config.temperatureBase));

  return config;
}

// ══════════════════════════════════════════════════════════════════════════
// PHASE A: Deep Structural Rewrite + Humanization (per sentence)
// ══════════════════════════════════════════════════════════════════════════

function getPhaseASystemPrompt(features: InputFeatures, config: ModeConfig): string {
  const contractionRule = features.hasContractions
    ? "You MAY use contractions naturally."
    : "STRICT: Do NOT use ANY contractions. Write all words fully (do not, cannot, will not, it is, that is, etc.). This is non-negotiable.";

  const firstPersonRule = features.hasFirstPerson
    ? "First-person pronouns (I, we, me, us, my, our) are OK where appropriate."
    : "STRICT: Do NOT use ANY first-person pronouns (I, me, my, mine, myself, we, us, our, ours, ourselves). Use impersonal constructions. This is non-negotiable.";

  const rhetoricalRule = features.hasRhetoricalQuestions
    ? "Rhetorical questions OK sparingly."
    : "STRICT: Do NOT add ANY sentences ending with question marks. Use declarative statements ONLY. This is non-negotiable.";

  return `You are rewriting a SINGLE sentence to make it sound like a real human from the mid-1990s wrote it — before AI existed. You are performing a deep structural rewrite combined with humanization in one pass.

ABSOLUTE RULES (violation = failure):

1. OUTPUT EXACTLY ONE SENTENCE. Not two, not three — ONE sentence. One sentence in = one sentence out. Do NOT split into multiple sentences. Do NOT add periods that create additional sentences.

2. BANNED VOCABULARY — if you use ANY of these words, the output FAILS and must be redone:
   ${BANNED_WORDS_LIST}

3. BANNED SENTENCE STARTERS — NEVER start your sentence with any of these:
   Furthermore, Moreover, Additionally, However, Nevertheless, Consequently, Subsequently, It is, It's important, It should be noted, In today's, In the realm, When it comes to, In conclusion, Ultimately

4. BANNED PHRASES — NEVER use any of these:
   "it is important to note that", "plays a crucial role", "in today's world", "a wide range of", "due to the fact that", "serves as a testament", "not only...but also", "each and every", "first and foremost", "needless to say", "there is no doubt that", "at the end of the day", "when it comes to", "in the context of", "cannot be overstated"

5. ${contractionRule}

6. ${firstPersonRule}

7. ${rhetoricalRule}

8. REWRITE AGGRESSIVENESS: ${config.strengthInstruction}

9. WORD CHOICE — use everyday words ONLY:
   - "use" not "utilize", "help" not "facilitate", "big" not "significant"
   - "show" not "demonstrate", "part" not "aspect", "idea" not "notion"
   - Use phrasal verbs naturally: look into, carry out, bring about, figure out, deal with, end up, turn out, stand out
   - Write like a real person from the 1990s — no corporate speak, no tech buzzwords

10. STRUCTURAL VARIATION:
    - Do NOT always use Subject-Verb-Object order
    - Sometimes start with a prepositional phrase, time reference, dependent clause, or participial phrase
    - Write with unpredictable structure — like a real human, not a language model

11. PROTECT ALL placeholder tokens like [[PROT_0]], [[TRM_0]] — copy them EXACTLY as-is. Do not modify, explain, or remove them.

12. Keep ALL factual content, data, citations, technical terms, and proper nouns EXACTLY.

13. Stay within ±20% of the original sentence word count. NEVER pad with filler or unnecessary qualifiers. If the input sentence is 8 words, your output must be 6-10 words. If the input is 20 words, your output must be 16-24 words. NEVER expand a short sentence into a long paragraph.

14. Return ONLY the rewritten sentence — no labels, no commentary, no quotation marks around it. Do NOT output [TARGET]: or SENTENCE: prefixes.

15. The [BEFORE] and [AFTER] lines are READ-ONLY context. Do NOT borrow, merge, or incorporate ANY content from them. Your output must contain ONLY the meaning from [TARGET].

16. NEVER invent new facts, examples, or explanations that are not in the original sentence. NEVER add clarifications, elaborations, or definitions. The output must contain the SAME information as the input — nothing more, nothing less.`;
}

function buildPhaseAUserPrompt(
  sentence: string,
  prevSentence: string | null,
  nextSentence: string | null,
): string {
  const contextBefore = prevSentence ? `[BEFORE]: ${prevSentence}\n` : "";
  const contextAfter = nextSentence ? `\n[AFTER]: ${nextSentence}` : "";

  return `Rewrite ONLY the [TARGET] sentence. [BEFORE] and [AFTER] are read-only context for tone continuity only.

${contextBefore}[TARGET]: ${sentence}${contextAfter}`;
}

// ══════════════════════════════════════════════════════════════════════════
// PHASE B: AI Vocabulary Purge (per sentence, strict)
// ══════════════════════════════════════════════════════════════════════════

const PHASE_B_SYSTEM = `You are a vocabulary purger. Your ONLY job is to replace banned AI-associated words in the given sentence with simple, everyday alternatives.

ABSOLUTE RULES:

1. You receive ONE sentence. Return ONE sentence. Do NOT split or merge.

2. SCAN the sentence for ANY of these banned words and replace them with the suggested alternatives:
   utilize/utilise → use, facilitate → help, leverage → use/draw on, comprehensive → broad/full/thorough, multifaceted → complex, paramount → central/top, furthermore → also, moreover → also, additionally → also, consequently → so, subsequently → then, nevertheless → still/even so, notwithstanding → despite, aforementioned → earlier/previous, paradigm → model, trajectory → path, discourse → discussion, robust → strong/solid, nuanced → detailed, pivotal → key/central, intricate → complex, meticulous → careful, profound → deep, inherent → built-in/natural, overarching → main, holistic → whole/complete, transformative → major, innovative → new/fresh, groundbreaking → pioneering, mitigate → reduce/lessen, streamline → simplify, optimize → improve, bolster → support/strengthen, catalyze → trigger/spark, delve → dig into/look into, embark → start, foster → encourage, harness → use/tap into, spearhead → lead, unravel → figure out, unveil → reveal/show, tapestry → mix, cornerstone → foundation/base, nexus → connection/link, myriad → many, plethora → many/a lot of, realm → area/field, landscape → scene/field, culminate → end in/lead to, enhance → improve/boost, crucial → key/important, vital → key/essential, notable → worth noting, significant → important/big/major, substantial → large/real, methodology → method, framework → structure/system, implications → effects/results, ensure → make sure, aspect → part/side, notion → idea/thought, diverse → varied/mixed, dynamic → active/shifting, implement → put in place/carry out, underscore → highlight/bring out, demonstrate → show, navigate → handle/deal with, encompass → include/cover, exemplify → show, necessitate → require, perpetuate → keep going, articulate → express/state, cultivate → develop/grow, endeavor → try, ascertain → find out, disseminate → spread, corroborate → confirm, substantiate → back up, primarily → mainly, particularly → especially, accordingly → so, evidently → clearly, essentially → basically, fundamentally → at its core, arguably → probably, predominantly → mostly, interplay → give and take, integral → key/core, pertaining → about, empower → enable, narrative → account, proactive → active, seamless → smooth, optimal → best, actionable → practical, impactful → effective, scalable → expandable, stakeholder → party involved, ecosystem → setup, benchmark → measure, disruptive → radical

3. ALSO replace these banned phrases:
   "it is important to note that" → remove entirely, "plays a crucial role" → "matters", "in today's world" → "now/today", "a wide range of" → "many", "due to the fact that" → "because", "serves as a testament" → "shows", "needless to say" → "clearly", "there is no doubt that" → "clearly", "at the end of the day" → "in the end", "when it comes to" → "with/about", "in the context of" → "within", "cannot be overstated" → "is huge"

4. Do NOT change anything else. Keep the sentence structure, meaning, and all non-banned words exactly as they are.

5. Preserve ALL placeholder tokens like [[PROT_0]], [[TRM_0]] exactly.

6. Return ONLY the cleaned sentence — no commentary, no labels.`;

function buildPhaseBUserPrompt(sentence: string): string {
  return `Scan this sentence for banned AI vocabulary and replace ONLY those words. Keep everything else identical.

SENTENCE: ${sentence}`;
}

// ══════════════════════════════════════════════════════════════════════════
// PHASE C: Final Stealth Polish (per sentence)
// Connector naturalization, starter fix, rhythm adjustment
// ══════════════════════════════════════════════════════════════════════════

function getPhaseCSystemPrompt(features: InputFeatures): string {
  const contractionRule = features.hasContractions
    ? "Contractions are OK."
    : "STRICT: NO contractions allowed.";

  const firstPersonRule = features.hasFirstPerson
    ? "First-person OK."
    : "STRICT: NO first-person pronouns.";

  return `You are doing a FINAL stealth polish on a single sentence. Your job is ONLY to:

1. If the sentence starts with a formal connector (Furthermore, Moreover, Additionally, However, Nevertheless, Consequently, Subsequently, Thus, Hence, Indeed, Accordingly, Notably, Specifically, Therefore), replace it with a natural alternative:
   Furthermore/Moreover/Additionally → Also/On top of that/Beyond this
   Consequently/Therefore/Thus/Hence → So/Because of this/That meant
   However/Nevertheless → Still/Even so/Yet/All the same
   Indeed → In fact/Sure enough
   Subsequently → Then/After that/Later
   Accordingly → So/In response
   In conclusion → All in all/Overall

2. If the sentence sounds overly formal or stilted, make MINIMAL adjustments to sound like natural 1990s writing. Use everyday language.

3. ${contractionRule}

4. ${firstPersonRule}

5. Do NOT change meaning, do NOT add new information, do NOT remove facts.

6. OUTPUT EXACTLY ONE SENTENCE. Do NOT split or merge.

7. Preserve ALL placeholder tokens like [[PROT_0]], [[TRM_0]] exactly.

8. Return ONLY the polished sentence — no commentary, no labels, no quotes.

9. If the sentence already reads naturally, return it UNCHANGED. Do not change for the sake of changing.`;
}

function buildPhaseCUserPrompt(sentence: string): string {
  return `Polish this sentence for natural flow. Only fix formal/stilted phrasing. Keep meaning identical.

SENTENCE: ${sentence}`;
}

// ══════════════════════════════════════════════════════════════════════════
// RETRY PHASE: Targeted fix for remaining banned words
// ══════════════════════════════════════════════════════════════════════════

function buildRetryPrompt(sentence: string, bannedFound: string[]): string {
  return `This sentence STILL contains banned AI vocabulary that MUST be replaced. The following banned words were found: ${bannedFound.join(", ")}

Replace EACH of the banned words above with a simple everyday alternative. Do NOT change anything else. Output EXACTLY one sentence.

SENTENCE: ${sentence}`;
}

const RETRY_SYSTEM = `You are a strict vocabulary replacement engine. Your ONLY job is to replace specific banned words in the sentence with simple alternatives.

RULES:
1. Replace ONLY the banned words listed in the user message
2. Use simple everyday alternatives (e.g., "use" for "utilize", "help" for "facilitate", "key" for "crucial")
3. Do NOT change sentence structure or any other words
4. Output EXACTLY one sentence
5. Preserve ALL placeholder tokens like [[PROT_0]], [[TRM_0]]
6. Return ONLY the fixed sentence — no commentary`;

// ══════════════════════════════════════════════════════════════════════════
// CONTRACTION EXPANSION (pure LLM)
// ══════════════════════════════════════════════════════════════════════════

const CONTRACTION_EXPAND_SYSTEM = `You expand ALL contractions in the given text to their full forms. Nothing else changes.

Examples: don't → do not, can't → cannot, won't → will not, it's → it is, they're → they are, we've → we have, I'm → I am, that's → that is, there's → there is, he's → he is, she's → she is, you're → you are, I've → I have, I'll → I will, he'll → he will, she'll → she will, it'll → it will, let's → let us, who's → who is, what's → what is

Return ONLY the text with contractions expanded. Change NOTHING else.`;

// ══════════════════════════════════════════════════════════════════════════
// FIRST PERSON REMOVAL (pure LLM)
// ══════════════════════════════════════════════════════════════════════════

const FIRST_PERSON_REMOVE_SYSTEM = `You remove ALL first-person pronouns (I, me, my, mine, myself, we, us, our, ours, ourselves) from the given sentence and replace them with impersonal constructions.

Rules:
- "We need" → "There is a need" or "The need exists"
- "We must" / "We should" → "One must" / "One should"
- "I think" / "I believe" → "The view is" / "The sense is"
- "Our findings" → "The findings"
- "Our study" → "This study"
- "In our view" → "From this angle"
- Do NOT use "it is believed" or similar passive constructions — they trigger AI detectors
- Keep the same meaning and sentence structure
- Output EXACTLY one sentence
- Return ONLY the fixed sentence`;

// ══════════════════════════════════════════════════════════════════════════
// PARAGRAPH COUNT ENFORCEMENT (pure LLM)
// ══════════════════════════════════════════════════════════════════════════

async function llmEnforceParagraphCount(
  text: string,
  targetCount: number,
): Promise<string> {
  const currentParas = text
    .split(/\n\s*\n/)
    .filter((p) => p.trim()).length;
  if (currentParas === targetCount) return text;

  const system = `You adjust paragraph boundaries in a text to match a specific count. Your ONLY job is to merge or split paragraphs so the output has EXACTLY the requested number of paragraphs.

RULES:
1. Do NOT change ANY words, sentences, or content — ONLY adjust where paragraph breaks appear
2. Keep headings/titles on their own lines
3. Output the EXACT same text with adjusted paragraph breaks
4. Return ONLY the adjusted text`;

  const user = `This text currently has ${currentParas} paragraphs but must have EXACTLY ${targetCount} paragraphs. Adjust ONLY the paragraph breaks (blank lines). Do NOT change any words.

TEXT:
${text}`;

  try {
    const adjusted = await llmCall(system, user, 0.2, 8192);
    if (!adjusted || adjusted.trim().length < text.length * 0.5) return text;
    const newCount = adjusted
      .trim()
      .split(/\n\s*\n/)
      .filter((p) => p.trim()).length;
    if (Math.abs(newCount - targetCount) > Math.abs(currentParas - targetCount))
      return text;
    return adjusted.trim();
  } catch {
    return text;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN PIPELINE — premiumHumanize()
// ══════════════════════════════════════════════════════════════════════════

export async function premiumHumanize(
  text: string,
  engine = "ghost_pro",
  strength = "medium",
  tone = "neutral",
  strictMeaning = true,
): Promise<string> {
  if (!text?.trim()) return text;

  const start = Date.now();
  const original = text.trim();
  const features = detectInputFeatures(original);
  const config = getModeConfig(engine, strength);

  console.log(
    `  [Premium] Starting Premium pipeline (engine=${engine}, strength=${strength})...`,
  );
  console.log(
    `  [Premium] Input: ${features.wordCount} words, ${features.sentenceCount} sents, ${features.paragraphCount} paras`,
  );
  console.log(
    `  [Premium] Config: temp=${config.temperatureBase.toFixed(2)}, maxRetries=${config.maxRetries}, aggression=${config.aggressiveness}`,
  );

  // Rephrase citations for variation
  const citationText = rephraseCitations(original);

  // Protect special content (brackets, figures, citations)
  const { text: protectedText0, map: protectionMap } =
    protectSpecialContent(citationText);

  // Protect content terms (proper nouns, domain phrases)
  const { text: protectedText, map: termMap } =
    protectContentTerms(protectedText0);

  // Capture input counts for enforcement
  const inputParas = original
    .split(/\n\s*\n/)
    .filter((p) => p.trim());
  const inputParagraphCount = inputParas.length;
  const inputSentenceCountsPerPara = inputParas.map(
    (p) => robustSentenceSplit(p.trim()).length,
  );
  const inputSentenceCount = countSentences(protectedText);

  // ═══════════════════════════════════════════
  // PHASE A: Per-Sentence Deep Rewrite (LLM)
  // ═══════════════════════════════════════════
  console.log("  [Premium] Phase A: Per-sentence deep rewrite...");

  const phaseASystem = getPhaseASystemPrompt(features, config);
  const paragraphs = protectedText
    .split(/\n\s*\n/)
    .filter((p) => p.trim());
  let totalSentencesProcessed = 0;

  const rewrittenParagraphs = await Promise.all(
    paragraphs.map(async (para) => {
      const trimmedPara = para.trim();
      if (isTitleOrHeading(trimmedPara)) return trimmedPara;

      const sentences = robustSentenceSplit(trimmedPara);
      if (sentences.length === 0) return trimmedPara;

      // Process each sentence via LLM
      const results = await Promise.all(
        sentences.map(async (sent, idx) => {
          const trimmed = sent.trim();
          if (!trimmed || trimmed.split(/\s+/).length < 3) return trimmed;
          if (isTitleOrHeading(trimmed)) return trimmed;

          const prevSent = idx > 0 ? sentences[idx - 1] : null;
          const nextSent =
            idx < sentences.length - 1 ? sentences[idx + 1] : null;

          const userPrompt = buildPhaseAUserPrompt(
            placeholdersToLLMFormat(trimmed),
            prevSent ? placeholdersToLLMFormat(prevSent) : null,
            nextSent ? placeholdersToLLMFormat(nextSent) : null,
          );

          // Vary temperature per-sentence for unpredictability
          const sentTemp =
            config.temperatureBase + (Math.random() * 0.12 - 0.06);
          const clampedTemp = Math.max(0.3, Math.min(1.0, sentTemp));
          const sentMaxTokens = Math.max(
            256,
            Math.ceil(trimmed.split(/\s+/).length * 3),
          );

          try {
            let rewritten = llmFormatToPlaceholders(
              await llmCall(
                phaseASystem,
                userPrompt,
                clampedTemp,
                sentMaxTokens,
              ),
            );
            if (
              !rewritten ||
              rewritten.trim().length < trimmed.length * 0.2
            )
              return trimmed;

            rewritten = rewritten.replace(/^\[TARGET\]:\s*/i, "").trim();

            // STRICT: reject hallucinated expansions (output >2x input word count)
            const inW = trimmed.split(/\s+/).length;
            const outW = rewritten.split(/\s+/).length;
            if (outW > inW * 2) {
              console.warn(`  [Premium] Phase A REJECTED hallucination: ${inW} → ${outW} words`);
              return trimmed;
            }

            // Enforce single sentence
            const llmSents = robustSentenceSplit(rewritten);
            if (llmSents.length > 1) {
              rewritten =
                llmSents
                  .map((s, i) => {
                    if (i === 0) return s.replace(/\.\s*$/, "");
                    return s[0]?.toLowerCase() + s.slice(1);
                  })
                  .join(", ") +
                (llmSents[llmSents.length - 1].match(/[.!?]$/) ? "" : ".");
            }
            return rewritten;
          } catch {
            return trimmed;
          }
        }),
      );

      totalSentencesProcessed += results.length;
      return results.join(" ");
    }),
  );

  let result = rewrittenParagraphs.join("\n\n");
  console.log(
    `  [Premium] Phase A complete: ${totalSentencesProcessed} sentences processed`,
  );

  // ═══════════════════════════════════════════
  // PHASE B: Per-Sentence AI Vocabulary Purge (LLM)
  // ═══════════════════════════════════════════
  console.log("  [Premium] Phase B: Per-sentence AI vocabulary purge...");

  const phaseBParagraphs = result
    .split(/\n\s*\n/)
    .filter((p) => p.trim());
  let purgedCount = 0;

  const purgedParagraphs = await Promise.all(
    phaseBParagraphs.map(async (para) => {
      const trimmedPara = para.trim();
      if (isTitleOrHeading(trimmedPara)) return trimmedPara;

      const sentences = robustSentenceSplit(trimmedPara);
      if (sentences.length === 0) return trimmedPara;

      const results = await Promise.all(
        sentences.map(async (sent) => {
          const trimmed = sent.trim();
          if (!trimmed || trimmed.split(/\s+/).length < 3) return trimmed;

          // Check if sentence even has banned words
          const banned = containsBannedWords(trimmed);
          if (banned.length === 0 && !hasBannedPhrases(trimmed) && !hasBannedStarter(trimmed)) {
            return trimmed; // Already clean, skip LLM call
          }

          const userPrompt = buildPhaseBUserPrompt(
            placeholdersToLLMFormat(trimmed),
          );
          const sentMaxTokens = Math.max(
            256,
            Math.ceil(trimmed.split(/\s+/).length * 2.5),
          );

          try {
            let purged = llmFormatToPlaceholders(
              await llmCall(PHASE_B_SYSTEM, userPrompt, 0.3, sentMaxTokens),
            );
            if (!purged || purged.trim().length < trimmed.length * 0.3)
              return trimmed;

            // Enforce single sentence output
            const sents = robustSentenceSplit(purged.trim());
            if (sents.length > 1) {
              purged =
                sents
                  .map((s, i) =>
                    i === 0
                      ? s.replace(/\.\s*$/, "")
                      : s[0]?.toLowerCase() + s.slice(1),
                  )
                  .join(", ") +
                (sents[sents.length - 1].match(/[.!?]$/) ? "" : ".");
            }

            purgedCount++;
            return purged.trim();
          } catch {
            return trimmed;
          }
        }),
      );

      return results.join(" ");
    }),
  );

  result = purgedParagraphs.join("\n\n");
  console.log(`  [Premium] Phase B complete: ${purgedCount} sentences purged`);

  // ═══════════════════════════════════════════
  // PHASE C: Per-Sentence Final Stealth Polish (LLM)
  // ═══════════════════════════════════════════
  console.log("  [Premium] Phase C: Per-sentence stealth polish...");

  const phaseCSystem = getPhaseCSystemPrompt(features);
  const phaseCParagraphs = result
    .split(/\n\s*\n/)
    .filter((p) => p.trim());
  let polishedCount = 0;

  const polishedParagraphs = await Promise.all(
    phaseCParagraphs.map(async (para) => {
      const trimmedPara = para.trim();
      if (isTitleOrHeading(trimmedPara)) return trimmedPara;

      const sentences = robustSentenceSplit(trimmedPara);
      if (sentences.length === 0) return trimmedPara;

      const results = await Promise.all(
        sentences.map(async (sent) => {
          const trimmed = sent.trim();
          if (!trimmed || trimmed.split(/\s+/).length < 3) return trimmed;

          // Only polish sentences that have formal starters or sound stilted
          const needsPolish = hasBannedStarter(trimmed) ||
            /^(?:In\s+(?:the|this|a)\s+|The\s+(?:fact|notion|aspect)\s)/i.test(trimmed);

          if (!needsPolish) return trimmed;

          const userPrompt = buildPhaseCUserPrompt(
            placeholdersToLLMFormat(trimmed),
          );
          const sentMaxTokens = Math.max(
            256,
            Math.ceil(trimmed.split(/\s+/).length * 2.5),
          );

          try {
            let polished = llmFormatToPlaceholders(
              await llmCall(phaseCSystem, userPrompt, 0.35, sentMaxTokens),
            );
            if (!polished || polished.trim().length < trimmed.length * 0.3)
              return trimmed;

            const sents = robustSentenceSplit(polished.trim());
            if (sents.length > 1) {
              polished =
                sents
                  .map((s, i) =>
                    i === 0
                      ? s.replace(/\.\s*$/, "")
                      : s[0]?.toLowerCase() + s.slice(1),
                  )
                  .join(", ") +
                (sents[sents.length - 1].match(/[.!?]$/) ? "" : ".");
            }

            polishedCount++;
            return polished.trim();
          } catch {
            return trimmed;
          }
        }),
      );

      return results.join(" ");
    }),
  );

  result = polishedParagraphs.join("\n\n");
  console.log(
    `  [Premium] Phase C complete: ${polishedCount} sentences polished`,
  );

  // ═══════════════════════════════════════════
  // VERIFICATION + RETRY: Check all sentences for remaining banned words
  // ═══════════════════════════════════════════
  console.log("  [Premium] Verification: checking for remaining banned content...");

  let retryRound = 0;
  while (retryRound < config.maxRetries) {
    const verifyParas = result.split(/\n\s*\n/).filter((p) => p.trim());
    let totalBanned = 0;
    let fixedSentences = 0;

    const fixedParagraphs = await Promise.all(
      verifyParas.map(async (para) => {
        const trimmedPara = para.trim();
        if (isTitleOrHeading(trimmedPara)) return trimmedPara;

        const sentences = robustSentenceSplit(trimmedPara);
        if (sentences.length === 0) return trimmedPara;

        const results = await Promise.all(
          sentences.map(async (sent) => {
            const trimmed = sent.trim();
            if (!trimmed) return trimmed;

            const verification = verifySentenceOutput(
              trimmed,
              trimmed,
              features,
            );
            if (verification.passed) return trimmed;

            const banned = containsBannedWords(trimmed);
            totalBanned += banned.length;

            if (banned.length > 0) {
              // Retry with targeted fix
              const retryUser = buildRetryPrompt(
                placeholdersToLLMFormat(trimmed),
                banned,
              );
              const sentMaxTokens = Math.max(
                256,
                Math.ceil(trimmed.split(/\s+/).length * 2.5),
              );

              try {
                let fixed = llmFormatToPlaceholders(
                  await llmCall(RETRY_SYSTEM, retryUser, 0.2, sentMaxTokens),
                );
                if (fixed && fixed.trim().length >= trimmed.length * 0.3) {
                  const sents = robustSentenceSplit(fixed.trim());
                  if (sents.length > 1) {
                    fixed =
                      sents
                        .map((s, i) =>
                          i === 0
                            ? s.replace(/\.\s*$/, "")
                            : s[0]?.toLowerCase() + s.slice(1),
                        )
                        .join(", ") +
                      (sents[sents.length - 1].match(/[.!?]$/) ? "" : ".");
                  }
                  fixedSentences++;
                  return fixed.trim();
                }
              } catch {
                // Keep original if retry fails
              }
            }

            return trimmed;
          }),
        );

        return results.join(" ");
      }),
    );

    result = fixedParagraphs.join("\n\n");
    retryRound++;

    if (totalBanned === 0) {
      console.log(
        `  [Premium] Verification passed: no banned words found (round ${retryRound})`,
      );
      break;
    }

    console.log(
      `  [Premium] Verification round ${retryRound}: ${totalBanned} banned words found, ${fixedSentences} sentences fixed`,
    );
  }

  // ═══════════════════════════════════════════
  // CONSTRAINT ENFORCEMENT (via LLM where needed)
  // ═══════════════════════════════════════════
  console.log("  [Premium] Enforcing constraints...");

  // Contraction expansion (LLM-based)
  if (!features.hasContractions) {
    const contractionRe =
      /\b(can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|wouldn't|shouldn't|couldn't|mustn't|it's|that's|there's|here's|he's|she's|they're|we're|you're|I'm|they've|we've|you've|I've|they'll|we'll|you'll|I'll|he'll|she'll|it'll|let's|who's|what's)\b/gi;
    if (contractionRe.test(result)) {
      try {
        const expanded = await llmCall(
          CONTRACTION_EXPAND_SYSTEM,
          `Expand ALL contractions in this text:\n\n${result}`,
          0.1,
          Math.max(4096, Math.ceil(result.split(/\s+/).length * 2)),
        );
        if (expanded && expanded.trim().length >= result.length * 0.8) {
          result = expanded.trim();
        }
      } catch {
        // Fallback: programmatic expansion
        result = expandContractions(result);
      }
    }
  }

  // First-person removal (LLM-based, per-sentence)
  if (!features.hasFirstPerson) {
    const fpRe = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/;
    if (fpRe.test(result)) {
      const fpParas = result.split(/\n\s*\n/).filter((p) => p.trim());
      const fixedFpParas = await Promise.all(
        fpParas.map(async (para) => {
          const sents = robustSentenceSplit(para.trim());
          const fixed = await Promise.all(
            sents.map(async (sent) => {
              if (!fpRe.test(sent)) return sent;
              try {
                const cleaned = await llmCall(
                  FIRST_PERSON_REMOVE_SYSTEM,
                  `Remove all first-person pronouns from this sentence:\n\nSENTENCE: ${sent}`,
                  0.2,
                  Math.max(256, Math.ceil(sent.split(/\s+/).length * 3)),
                );
                if (
                  cleaned &&
                  cleaned.trim().length >= sent.length * 0.4 &&
                  !fpRe.test(cleaned)
                ) {
                  return cleaned.trim();
                }
              } catch {}
              return sent;
            }),
          );
          return fixed.join(" ");
        }),
      );
      result = fixedFpParas.join("\n\n");
    }
  }

  // Rhetorical question removal (sentences ending with ?)
  if (!features.hasRhetoricalQuestions) {
    const rqParas = result.split(/\n\s*\n/).filter((p) => p.trim());
    result = rqParas
      .map((para) => {
        const sents = robustSentenceSplit(para.trim());
        return sents.filter((s) => !s.trim().endsWith("?")).join(" ");
      })
      .filter((p) => p.trim())
      .join("\n\n");
  }

  // ═══════════════════════════════════════════
  // PARAGRAPH COUNT ENFORCEMENT (rule-based — no LLM to avoid hallucination)
  // ═══════════════════════════════════════════
  // The pipeline already processes paragraph-by-paragraph so counts should match.
  // Only use rule-based enforcement; skip llmEnforceParagraphCount to avoid LLM rewriting.

  // Per-paragraph sentence count enforcement (rule-based, simple enough)
  result = enforcePerParagraphSentenceCounts(
    result,
    inputSentenceCountsPerPara,
    "Premium",
  );

  // ═══════════════════════════════════════════
  // RESTORE PROTECTED CONTENT
  // ═══════════════════════════════════════════
  result = restoreContentTerms(result.trim(), termMap);
  result = restoreSpecialContent(result.trim(), protectionMap);

  // ═══════════════════════════════════════════
  // FINAL SURFACE CLEANUP (minimal, no dictionaries)
  // ═══════════════════════════════════════════
  result = result.replace(/ {2,}/g, " ");
  result = result.replace(/\s+([.,;:!?])/g, "$1");
  result = result.replace(/([.,;:!?])([A-Za-z])/g, "$1 $2");
  result = result.replace(/\.{2,}/g, ".");
  result = result.replace(/,{2,}/g, ",");
  result = result.replace(/;{2,}/g, ";");
  result = result.replace(/ — /g, ", ").replace(/—/g, ", ");
  result = result.replace(/ – /g, ", ").replace(/–/g, ", ");
  result = result.replace(/\.[ \t]+([a-z])/g, (_, ch) => ". " + ch.toUpperCase());
  result = result.replace(/^([a-z])/gm, (_, ch) => ch.toUpperCase());

  // ═══════════════════════════════════════════
  // FINAL DIAGNOSTICS
  // ═══════════════════════════════════════════
  const outputWords = result.split(/\s+/).length;
  const outputSentences = robustSentenceSplit(result);
  const meaningScore = semanticSimilaritySync(original, result);
  const elapsed = (Date.now() - start) / 1000;

  // Run detector for final stats
  let finalScores: Record<string, number> = {};
  try {
    const detector = getDetector();
    const detection = detector.analyze(result);
    for (const d of detection.detectors ?? []) {
      const name = (d.detector ?? "unknown")
        .toLowerCase()
        .replace(/ /g, "_");
      finalScores[name] = Math.round((100 - (d.human_score ?? 50)) * 10) / 10;
    }
    finalScores.overall =
      Math.round(
        (100 - (detection.summary?.overall_human_score ?? 50)) * 10,
      ) / 10;
  } catch {}

  const worstDetector = Object.entries(finalScores)
    .filter(([k]) => k !== "overall")
    .reduce((max, [, v]) => Math.max(max, v), 0);

  console.log(
    `  [Premium] Output: ${outputWords} words, ${outputSentences.length} sentences`,
  );
  console.log(
    `  [Premium] Sentence count: target=${inputSentenceCount}, actual=${countSentences(result)}`,
  );
  console.log(
    `  [Premium] Paragraph count: target=${inputParagraphCount}, actual=${result.split(/\n\s*\n/).filter((p) => p.trim()).length}`,
  );
  console.log(
    `  [Premium] Final worst detector: ${worstDetector.toFixed(1)}%, overall: ${finalScores.overall?.toFixed(1) ?? "?"}%`,
  );
  console.log(
    `  [Premium] Meaning similarity: ${meaningScore.toFixed(2)}`,
  );
  console.log(
    `  [Premium] Complete in ${elapsed.toFixed(1)}s (${totalSentencesProcessed} sentences, ${retryRound} verification rounds)`,
  );

  // Final banned word check — log any remaining
  const finalBanned = containsBannedWords(result);
  if (finalBanned.length > 0) {
    console.warn(
      `  [Premium] WARNING: ${finalBanned.length} banned words still present: ${finalBanned.join(", ")}`,
    );
  }

  return result;
}
