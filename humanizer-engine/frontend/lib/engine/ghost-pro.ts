/**
 * Ghost Pro Engine v3 — Detector-Beating Humanization Pipeline
 * =============================================================
 *
 * PHILOSOPHY: Beat ALL 22 AI detectors to near 0% AI score.
 *
 * The pipeline has two passes:
 *   PASS 1 (LLM): Deep rewrite with extreme human-writing characteristics
 *   PASS 2 (non-LLM): Aggressive statistical post-processing that targets
 *           each of the 20 detector signals individually
 *
 * The non-LLM pass analyzes the LLM output against our internal detector,
 * identifies which signals are still scoring as AI, and applies targeted
 * fixes to push each signal into the human range.
 */

import OpenAI from "openai";
import { sentTokenize } from "./utils";
import { expandContractions } from "./advanced-transforms";
import { validateAndRepairOutput } from "./validation-post-process";
import { protectSpecialContent, restoreSpecialContent, protectContentTerms, restoreContentTerms, cleanOutputRepetitions, robustSentenceSplit, placeholdersToLLMFormat, llmFormatToPlaceholders, countSentences, enforceSentenceCountStrict, enforcePerParagraphSentenceCounts, rephraseCitations } from "./content-protection";
import { semanticSimilaritySync } from "./semantic-guard";
import { TextSignals, getDetector } from "./multi-detector";
import {
  applyAIWordKill, applyConnectorNaturalization, applyPhrasePatterns,
  applySyntacticTemplate,
  DIVERSITY_SWAPS as SHARED_DIVERSITY_SWAPS,
  VERB_PHRASE_SWAPS,
  MODIFIER_SWAPS,
  CLAUSE_REPHRASINGS,
  HEDGING_PHRASES,
  TRANSITION_SWAPS,
  QUANTIFIER_SWAPS,
  TEMPORAL_SWAPS,
  CAUSAL_SWAPS,
  EMPHASIS_SWAPS,
  fixPunctuation,
  cleanSentenceStarters,
  verifySentencePresence,
  deepCleaningPass,
  perSentenceAntiDetection,
} from "./shared-dictionaries";
import { getDictionary } from "./dictionary";
import {
  buildSentenceItems,
  applySentenceSurgery,
  reassembleFromItems,
  enforceCapitalization,
  enforceStrictRules,
  enforceSingleSentence,
  getWordChangePercent,
  type SurgeryItem,
  type InputFeatures as SurgeryInputFeatures,
} from "./sentence-surgery";

// ── Config ──

const LLM_MODEL = process.env.LLM_MODEL ?? "gpt-4o-mini";

// ── Groq config (OpenAI-compatible, Llama models) ──
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",                        // Primary: best quality
  "meta-llama/llama-4-scout-17b-16e-instruct",      // Fallback 1: good quality, 5x token limit
  "llama-3.1-8b-instant",                            // Fallback 2: fast, highest request limits
] as const;

// ── OpenAI client singleton ──

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY not set.");
  _client = new OpenAI({ apiKey });
  return _client;
}

// ── Groq client singleton (OpenAI-compatible) ──

let _groqClient: OpenAI | null = null;

function getGroqClient(): OpenAI {
  if (_groqClient) return _groqClient;
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY not set.");
  _groqClient = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });
  return _groqClient;
}

async function groqCall(system: string, user: string, temperature: number, maxTokens?: number): Promise<string> {
  const client = getGroqClient();

  for (let i = 0; i < GROQ_MODELS.length; i++) {
    const model = GROQ_MODELS[i];
    try {
      const r = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature,
        max_tokens: maxTokens ?? 4096,
      });
      const content = r.choices[0]?.message?.content?.trim() ?? "";
      if (content) {
        if (i > 0) console.log(`  [Groq] Succeeded with fallback model: ${model}`);
        return content;
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`  [Groq] Model ${model} failed: ${errMsg}`);
      if (i < GROQ_MODELS.length - 1) {
        console.log(`  [Groq] Falling back to ${GROQ_MODELS[i + 1]}...`);
      }
    }
  }
  // All Groq models failed — fall back to OpenAI
  console.warn("  [Groq] All models failed, falling back to OpenAI GPT-4o-mini");
  return llmCall(system, user, temperature, maxTokens);
}

async function llmCall(system: string, user: string, temperature: number, maxTokens?: number, modelOverride?: string): Promise<string> {
  try {
    const client = getClient();
    const model = modelOverride ?? LLM_MODEL;
    const r = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
      max_tokens: maxTokens ?? 4096,
    });
    return r.choices[0]?.message?.content?.trim() ?? "";
  } catch (err: any) {
    console.error("  [GhostPro] OpenAI API Error:", err.message);
    console.warn("  [GhostPro] System fallback to Groq due to OpenAI failure...");
    return groqCall(system, user, temperature, maxTokens);
  }
}

// ── Input Feature Detection ──

interface InputFeatures {
  hasContractions: boolean;
  hasFirstPerson: boolean;
  hasRhetoricalQuestions: boolean;
  avgSentenceLength: number;
  paragraphCount: number;
  wordCount: number;
}

function detectInputFeatures(text: string): InputFeatures {
  const contractionRe = /\b(can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|wouldn't|shouldn't|couldn't|mustn't|it's|that's|there's|here's|he's|she's|they're|we're|you're|I'm|they've|we've|you've|I've|they'll|we'll|you'll|I'll|he'll|she'll|it'll|let's|who's|what's)\b/gi;
  const firstPersonRe = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/;
  const sentences = robustSentenceSplit(text);
  const totalWords = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0);

  return {
    hasContractions: contractionRe.test(text),
    hasFirstPerson: firstPersonRe.test(text),
    hasRhetoricalQuestions: /[A-Za-z][^.!?]*\?/.test(text),
    avgSentenceLength: sentences.length > 0 ? totalWords / sentences.length : 15,
    paragraphCount: text.split(/\n\s*\n/).filter(p => p.trim()).length,
    wordCount: totalWords,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// PASS 1: LLM DEEP REWRITE — Tuned to produce pre-2000 human-style prose
// ══════════════════════════════════════════════════════════════════════════

function getSystemPrompt(tone: string, wordCount?: number): string {
  const isAcademic = tone === "academic";
  const isWikipedia = tone === "wikipedia";
  const isShort = (wordCount ?? 999) < 300;

  const voiceInstruction = isWikipedia
    ? `You are an experienced Wikipedia editor rewriting text into proper encyclopedic style. Your output must read exactly like a real Wikipedia article: neutral point of view (NPOV), third-person throughout, factual and declarative, no hedging or opinion. State established knowledge directly. Use domain-specific vocabulary naturally. Cite sources where reference markers exist. Write the way real human Wikipedia editors write — clear, informative, occasionally dry, with natural variation in sentence structure.

WIKIPEDIA STYLE EXAMPLES (study these carefully — match this exact register):

Example 1 (History):
The Treaty of Westphalia was signed in 1648, ending the Thirty Years' War in the Holy Roman Empire. It established the principle of state sovereignty that shaped European politics for centuries. The negotiations involved 109 delegations and took nearly five years to complete. Several smaller conflicts continued in the region despite the formal peace agreement.

Example 2 (Science):
Photosynthesis converts light energy into chemical energy stored in glucose molecules. The process occurs primarily in the chloroplasts of plant cells, where chlorophyll absorbs light in the red and blue wavelengths. Six molecules of carbon dioxide and six molecules of water produce one molecule of glucose and six molecules of oxygen. The overall efficiency of this conversion varies between 3 and 6 percent under normal conditions.

Example 3 (Geography):
The Amazon River basin covers approximately 7 million square kilometres across nine countries in South America. It contains roughly 20 percent of the world's fresh water that flows into the ocean. More than 3,000 species of fish have been identified in the basin. Seasonal flooding between June and October can raise water levels by as much as 12 metres in some areas.`
    : isAcademic
    ? `You are ghostwriting as a real graduate student. Your job: rewrite text so it reads like a sharp human scholar wrote it — thoughtful rhythm, natural flow, not robotic. Think of how a strong graduate thesis or journal article reads when written by someone who actually cares about clarity: direct, precise, occasionally personal in style, but never stiff or formulaic.`
    : `You are ghostwriting as a real human author. Your job: rewrite text so it reads exactly like a person wrote it by hand — messy rhythm, personal quirks, uneven pacing. Think of how columnists from the 1990s or early-2000s bloggers wrote: direct, sometimes clumsy, never polished to a robotic sheen.`;

  const shortTextRule = isShort ? `
SHORT TEXT — EXTRA RULES (this text is under 300 words, so every sentence matters):
- You MUST include at least 2 very short sentences (4-8 words) to break the rhythm
- You MUST include at least 1 long complex sentence (30+ words) with subordinate clauses
- NEVER let the text read as a single uniform block — vary sentence openings aggressively
- Do NOT start any sentence with a conjunction like "And", "But", "Or", "So", "Yet"
- Use comma-based hedging asides naturally (e.g. ", admittedly," or ", to some extent,")
- Rearrange sentence order within paragraphs for unpredictability
- Do NOT add any content, sentences, or conclusions not in the original
- Use UNEXPECTED word choices — avoid the first word that comes to mind. Instead of "important", try "central" or "the crux of". Instead of "led to", try "brought about" or "sparked"
- Break typical collocations — instead of "played a role", say "shaped" or "fed into"
- Vary your word lengths — mix short punchy words with longer ones
` : ``;

  const burstinessRule = isWikipedia
    ? `1. SENTENCE LENGTH VARIATION (critical for bypassing AI detection):
   Wikipedia articles have natural sentence length variation. Match these statistics:
   - Average sentence length: 20-24 words
   - Standard deviation: 8-10 words
   - Include short factual sentences (8-14 words): "The treaty was signed in 1648." "Several species remain endangered."
   - Include longer compound sentences (30-45 words) with subordinate clauses, relative clauses, or appositives
   - NEVER write 3 consecutive sentences within 6 words of each other in length
   - Target coefficient of variation between 0.35 and 0.50`
    : isAcademic
    ? `1. SENTENCE LENGTH VARIATION (the single most important rule):
   You MUST create genuine variation in sentence lengths in EVERY paragraph.
   - Include some shorter sentences (6-12 words) for emphasis or clarity
   - Include longer analytical sentences (30-50 words) with subordinate clauses
   - NEVER write 3 sentences in a row that are within 8 words of each other in length
   - Target coefficient of variation > 0.40 for sentence lengths`
    : `1. EXTREME SENTENCE LENGTH VARIATION (the single most important rule):
   You MUST create a wild mix of sentence lengths in EVERY paragraph. This is what separates human from AI writing.
   - Include at least 2 very short sentences per paragraph (4-9 words). Examples:
     "That changed everything."
     "Nobody saw it coming."  
     "The numbers tell the story."
     "This part gets tricky."
     "It did not last."
   - Include at least 1 very long sentence per paragraph (35-55 words) with multiple clauses joined by commas, dashes, or subordinate clauses
   - NEVER write 3 sentences in a row that are within 8 words of each other in length
   - Target coefficient of variation > 0.50 for sentence lengths`;

  const wordChoiceRule = isWikipedia
    ? `5. WORD CHOICE — sound like a real Wikipedia article:
   - Use precise, domain-appropriate vocabulary: "established", "implemented", "comprising", "designated"
   - Keep academic and technical terms that belong in encyclopedic writing: "significant", "demonstrated", "contributed", "framework"
   - AVOID only the blatantly AI-robotic words: utilize, leverage, delve, tapestry, cornerstone, bedrock, myriad, plethora, multifaceted, holistic, synergy, paradigm
   - Use NEUTRAL descriptors: "notable", "prominent", "widely recognized" — not "amazing", "incredible", "crucial"
   - NO hedging or opinion: never write "arguably", "it seems", "one could say", "interestingly"
   - NO informal language: never write "pretty much", "a lot of", "sort of", "kicked off"
   - Use passive voice naturally where appropriate (15-25% of sentences): "The organization was founded in 1950" is natural in Wikipedia
   - State facts directly without qualification: "The population increased by 30%" not "The population saw a significant increase"
   - Use specific numbers, dates, and proper nouns from the original text wherever possible
   - MANDATORY: Replace at least 30% of non-technical content words with natural academic synonyms. Do NOT leave most words unchanged — rewrite actively.
   - STRUCTURAL VARIATION: Vary sentence structures aggressively. Use clause fronting, voice shifts (active/passive), nominalization, and reordering. Do NOT preserve the original sentence structure — transform it.
   - BREAK TEMPLATE PATTERNS: If the original text has repetitive patterns (e.g. every paragraph starts with "This source is relevant because..."), break them. Use different formulations each time.`
    : isAcademic
    ? `5. WORD CHOICE — sound like a real scholar, not an AI:
   - Keep appropriate academic vocabulary (analysis, framework, implications) — these are expected
   - Avoid the OBVIOUSLY robotic AI words listed above (utilize, leverage, facilitate, etc.)
   - Use precise language: "the data suggest" not "the data clearly demonstrates"
   - Prefer active voice where natural; passive voice is acceptable in academic writing
   - Use hedging where appropriate: "this suggests", "the evidence indicates", "it appears that"
   - Do NOT use slang, colloquialisms, or overly casual language`
    : `5. WORD CHOICE — sound like a real person, not a textbook:
   - Prefer everyday words: "use" not "utilize", "help" not "facilitate", "big" not "significant"
   - Use some slightly informal but smart words that humans naturally use: "tricky", "messy", "pretty much", "a lot of", "sort of", "turned out", "kicked off", "fell apart", "ramped up", "took off"
   - Sprinkle in occasional hedging: "probably", "seems like", "to some extent", "more or less"
   - Use concrete language over abstract: "factories closed" not "economic decline occurred"`;

  return `${voiceInstruction}

ABSOLUTE REQUIREMENTS — these are non-negotiable:

${burstinessRule}

${isWikipedia ? `2. BANNED VOCABULARY — these are AI-detector markers, never use them:
   utilize, leverage, delve, tapestry, cornerstone, bedrock, linchpin, nexus, myriad, plethora, multitude, multifaceted, holistic, synergy, paradigm, trajectory, discourse, dichotomy, conundrum, ramification, underpinning, efficacious, bolster, catalyze, spearhead, unravel, unveil, embark, harness, ameliorate, engender, elucidate, exacerbate, proliferate, culminate

   Also BANNED phrases: "it is important to note", "it should be noted", "plays a crucial role", "in today's world", "in today's society", "a wide range of", "due to the fact that", "first and foremost", "each and every", "not only...but also", "serves as a testament", "it is worth noting", "it is clear that", "moving forward", "when it comes to"

   ALLOWED in Wikipedia context (do NOT replace these): significant, demonstrated, established, contributed, implemented, comprehensive, framework, methodology, fundamental, substantial, facilitate, prominent, notable, considerable, contemporary, subsequent, initial, primary, various, additional, specific, respectively, approximately` :
`2. ABSOLUTELY BANNED VOCABULARY — if you use ANY of these words, the output fails:
   utilize, facilitate, leverage, comprehensive, multifaceted, paramount, furthermore, moreover, additionally, consequently, subsequently, nevertheless, notwithstanding, aforementioned, paradigm, trajectory, discourse, dichotomy, conundrum, ramification, underpinning, synergy, robust, nuanced, salient, ubiquitous, pivotal, intricate, meticulous, profound, inherent, overarching, substantive, efficacious, holistic, transformative, innovative, groundbreaking, noteworthy, proliferate, exacerbate, ameliorate, engender, delineate, elucidate, illuminate, necessitate, perpetuate, underscore, exemplify, encompass, bolster, catalyze, streamline, optimize, mitigate, navigate, prioritize, articulate, substantiate, corroborate, disseminate, cultivate, ascertain, endeavor, delve, embark, foster, harness, spearhead, unravel, unveil, tapestry, cornerstone, bedrock, linchpin, nexus, spectrum, myriad, plethora, multitude, landscape, realm, culminate

   Also BANNED phrases: "it is important to note", "it should be noted", "plays a crucial role", "in today's world", "in today's society", "a wide range of", "due to the fact that", "first and foremost", "each and every", "not only...but also", "serves as a testament", "in light of", "with that in mind", "having said that", "that being said", "it is worth noting", "on the other hand", "in conclusion", "in summary", "as a result", "for example,", "for instance,", "there are several", "there are many", "it is clear that", "when it comes to", "given that", "moving forward"`}

${isWikipedia ? `3. SENTENCE STARTERS — Wikipedia style:
   - Most sentences start with the grammatical subject: "The organization...", "Health education...", "Several studies..."
   - Some sentences start with temporal or locational context: "In 1976,...", "During the 1980s,...", "In the United States,..."
   - Use transitional sentences sparingly and naturally — no more than 1-2 per paragraph
   - NEVER start with: "Furthermore," "Moreover," "Additionally," "It is important," "It should be noted"
   - NEVER start any sentence with a conjunction: "And", "But", "Or", "So", "Yet"
   - Vary between active and passive constructions naturally` :
`3. SENTENCE STARTERS — vary them dramatically:
   - Start some sentences with the subject directly ("The economy grew...")
   - Start some with a short clause ("After the reforms took hold, ...")
   - Do NOT start any sentence with a conjunction like And, But, Or, So, Yet
   - Start some with gerunds ("Looking at the data...")
   - NEVER use the same starting word for consecutive sentences
   - NEVER start with: "Furthermore," "Moreover," "Additionally," "However," "Nevertheless," "Consequently," "It is"`}

${isWikipedia ? `4. ENCYCLOPEDIC TEXTURE:
   - Write in neutral, informative prose — no opinion, no rhetorical questions, no persuasion
   - Use relative clauses naturally: "which was established in...", "whose mission is to..."
   - Use appositives for context: "SOPHE, a professional society of health educators, was founded..."
   - Semicolons are acceptable to join closely related clauses
   - Do NOT use em dashes (—) or parenthetical asides with personal commentary
   - Reference markers like [1], [2] etc. must be preserved exactly
   - Dates, statistics, proper nouns, and organization names must be exact
   - Use "according to" sparingly — state facts directly instead` :
`4. NATURAL HUMAN TEXTURE:
   - Use phrasal verbs where natural: look into, carry out, bring about, come up with, break down, set up, point out, figure out, deal with, end up, turn out, stand out, account for, spell out
   - Use semicolons 2-3 times to join related thoughts
   - Use comma-based hedging asides 2-4 times (e.g. ", admittedly," or ", in most cases,")
   - Do NOT use em dashes (—) or parenthetical brackets
   - Mix simple and complex sentence structures unpredictably`}

${wordChoiceRule}

6. PARAGRAPH VARIATION:
   - Make paragraphs different lengths (some 2-3 sentences, some 5-7)
   - Do not make every paragraph follow the same structure

${shortTextRule}
STRICT PRESERVATION RULES:
- Keep ALL factual content, data, statistics, citations, technical terms, and proper nouns exactly
- Keep the same number of paragraphs — preserve all paragraph breaks (double newlines) and headings/titles exactly as they appear
- NEVER merge paragraphs together or remove blank lines between them
- NEVER add information, examples, conclusions, or commentary not in the original text
- NEVER add a final sentence that summarizes or reflects on the passage — the last sentence must correspond to content in the original
- CRITICAL: The text contains placeholder tokens like [[PROT_0]], [[PROT_1]], [[TRM_0]], etc. These represent protected values. Copy them EXACTLY as-is in your output. Do not remove, modify, or explain them.
- Do NOT create lists unless the original has them
- Stay within ±15% of original word count
- Return ONLY the rewritten text — no commentary, no labels, no meta-text`;
}

function buildUserPrompt(text: string, features: InputFeatures, tone: string): string {
  let toneGuide = "";
  switch (tone) {
    case "wikipedia":
      toneGuide = "Rewrite this text in neutral encyclopedic Wikipedia style. Third person only. No thesis statements, no argumentation, no opinion. Present facts as established knowledge. Use domain-specific vocabulary naturally. Preserve all citations, dates, proper nouns, and reference markers exactly. Write as a real Wikipedia editor would — informative, precise, occasionally dry, with varied sentence structure.";
      break;
    case "academic":
      toneGuide = "Write like a sharp grad student — intellectual but grounded. Maintain academic register. Keep key terms (e.g., emotional intelligence, leadership foundations, empowerment) intact. Use semicolons and dashes for natural rhythm. Do NOT use slang or overly casual phrasing.";
      break;
    case "professional":
      toneGuide = "Write like a senior analyst writing an internal memo — clear, direct, no fluff.";
      break;
    case "simple":
      toneGuide = "Write plainly. Short sentences dominate. Keep it dead simple.";
      break;
    default:
      toneGuide = "Write like a confident college student explaining this topic to a peer — natural, clear, occasionally conversational.";
  }

  // Wikipedia mode: always no contractions, no first person, no rhetorical questions
  const isWiki = tone === "wikipedia";

  const contractionRule = isWiki
    ? "Do NOT use contractions. Write all words fully (do not, cannot, will not, etc.)."
    : features.hasContractions
    ? "You MAY use contractions naturally."
    : "Do NOT use contractions. Write all words fully (do not, cannot, will not, etc.).";

  const firstPersonRule = isWiki
    ? "Do NOT use first-person pronouns (I, we, me, us, my, our). Wikipedia uses third person and impersonal constructions exclusively."
    : features.hasFirstPerson
    ? "You may use first-person pronouns where appropriate."
    : "Do NOT use first-person pronouns (I, we, me, us, my, our). Use impersonal constructions instead.";

  const rhetoricalRule = isWiki
    ? "Do NOT use rhetorical questions. Wikipedia articles use only declarative statements."
    : features.hasRhetoricalQuestions
    ? "You may use rhetorical questions sparingly."
    : "Do NOT use rhetorical questions. Do NOT add any sentences ending with a question mark. Use declarative statements only.";

  const shortExtra = features.wordCount < 300 ? `
SHORT TEXT CRITICAL RULES:
- This is a short passage. Every sentence must feel different from the others.
- Include at least 3 sentences under 12 words. Example: "This shaped everything." or "The effects ran deep." or "That mattered."
- Include at least 1 sentence over 30 words with multiple clauses joined by commas or dashes
- Use concrete, specific language — not abstract generalizations
- Vary your sentence openings: subject-first, prepositional phrase, gerund, conjunction ("And", "But")
- Do NOT add new information, conclusions, or summaries not in the original
- Do NOT start multiple sentences with the same word
- KEEP the key terms and subject-specific vocabulary from the original (names, dates, concepts) — rephrase the surrounding words instead
- Mix common short words (3-4 letters) with uncommon longer ones (8+ letters) within the same sentence
- Break longer ideas into shorter sentences and expand compressed ideas — do NOT summarize or condense
` : '';

  const minWords = features.wordCount < 300
    ? Math.round(features.wordCount * 1.02)   // short text: aim slightly above
    : Math.round(features.wordCount * 0.85);
  const maxWords = features.wordCount < 300
    ? Math.round(features.wordCount * 1.15)
    : features.wordCount;
  const wordCountInstruction = features.wordCount < 300
    ? `WORD COUNT REQUIREMENT: Output MUST be ${minWords}-${maxWords} words (original is ${features.wordCount}). Do NOT condense below ${minWords}. Do NOT pad or add new content to exceed ${maxWords}. Break sentences apart or add detail within existing points — never add new conclusions.`
    : `CRITICAL WORD COUNT: Output MUST stay within ±15% of the original word count (${Math.round(features.wordCount * 0.85)}-${Math.round(features.wordCount * 1.15)} words, original is ${features.wordCount}). Do NOT drastically shorten or pad — keep similar density.`;

  return `Rewrite this text completely. ${toneGuide}

${contractionRule}
${firstPersonRule}
${rhetoricalRule}

CRITICAL STRUCTURE RULE: Preserve ALL paragraph breaks (blank lines). The output MUST have exactly ${features.paragraphCount} paragraphs, matching the input. Do NOT merge paragraphs together. Keep headings/titles on their own lines.

CRITICAL: Create EXTREME sentence length variation. Include very short sentences (4-9 words) AND very long ones (35-55 words) in every paragraph. Never let 3 consecutive sentences be similar length.
PROTECT: Copy ALL content inside brackets [like this] exactly as-is. Do not modify citations, references, or bracketed content.
STYLE: Write like a real person from the mid-1990s — no modern corporate or tech buzzwords, no AI-era language.
${shortExtra}
${wordCountInstruction}

TEXT TO REWRITE:
${text}`;
}

// ══════════════════════════════════════════════════════════════════════════
// SENTENCE-LEVEL LLM REWRITE
// Each sentence is sent independently to the LLM with neighboring context.
// This prevents cross-sentence uniformity that detectors catch.
// ══════════════════════════════════════════════════════════════════════════

function getSentenceSystemPrompt(tone: string): string {
  const isAcademic = tone === "academic";
  const isWikipedia = tone === "wikipedia";

  const voiceInstruction = isWikipedia
    ? `You are AGGRESSIVELY rewriting a SINGLE sentence in neutral encyclopedic style. You MUST substantially change the wording, vocabulary, and sentence structure. Do NOT return the original with minor edits — that is a FAILURE. Third person, factual, informative. No opinion, no hedging, no persuasion. The goal is to convey the same facts using completely different words and clause arrangements.`
    : isAcademic
    ? `You are rewriting a SINGLE sentence as a real graduate student would write it — thoughtful, natural, not robotic. Direct and precise but never formulaic.`
    : `You are rewriting a SINGLE sentence as a real human author would write it — natural quirks, personal style. Think how a 1990s columnist or early-2000s blogger would phrase this.`;

  return `${voiceInstruction}

RULES:
1. Rewrite ONLY the sentence marked [TARGET]. The [BEFORE] and [AFTER] lines are read-only context.
2. Return ONLY the rewritten sentence — no labels, no commentary, no quotation marks around it.
3. OUTPUT EXACTLY ONE SENTENCE. Do NOT split the input into multiple sentences. Do NOT merge with context. One sentence in = one sentence out. NEVER add periods that would create additional sentences.
4. BANNED WORDS: ${isWikipedia
  ? `utilize, leverage, delve, tapestry, cornerstone, bedrock, linchpin, nexus, myriad, plethora, multifaceted, holistic, synergy, paradigm, trajectory, discourse, dichotomy, conundrum, ramification, underpinning, efficacious, bolster, catalyze, spearhead, unravel, unveil, embark, harness, ameliorate, engender, elucidate, exacerbate, proliferate, culminate`
  : `utilize, facilitate, leverage, comprehensive, multifaceted, paramount, furthermore, moreover, additionally, consequently, subsequently, nevertheless, notwithstanding, aforementioned, paradigm, trajectory, discourse, robust, nuanced, pivotal, intricate, transformative, innovative, groundbreaking, mitigate, streamline, optimize, bolster, catalyze, delve, embark, foster, harness, spearhead, unravel, unveil, tapestry, cornerstone, nexus, myriad, plethora, realm, landscape, methodology, framework, holistic, substantive, salient, ubiquitous, meticulous, profound, enhance, crucial, vital, essential, significant, implement, navigate, foster, underscore, highlight, interplay, diverse, dynamic, ensure, aspect, notion, endeavor, pertaining, integral`}
5. BANNED STARTERS: Do NOT start with "Furthermore," "Moreover," "Additionally," "However," "Nevertheless," "Consequently," "It is," "It's important," "It should be noted," "In today's," "In the realm," "When it comes to"
${isWikipedia ? `6. AGGRESSIVE REWRITING (MANDATORY): You MUST substantially rewrite every sentence. Do NOT return the original wording with minor tweaks. Change the sentence structure, swap vocabulary, rearrange clauses. The output should read differently while keeping the same factual content. If your rewrite is more than 70% similar to the original, you have FAILED.
7. CRITICAL: Preserve all placeholder tokens like [[PROT_0]], [[TRM_0]] exactly as-is. Do not remove or modify them.
8. Keep the same meaning and all factual content, data, citations, dates, proper nouns. Do NOT hallucinate or invent.
9. Stay within ±25% of the original sentence word count.
10. Write in third person. No opinion markers. No hedging. State facts directly.
11. SYNONYM REPLACEMENT (MANDATORY — 40%+ of content words): Replace verbs, adjectives, adverbs, and non-technical nouns with natural academic alternatives. Examples: "examines" → "investigates"/"probes"/"assesses", "argues" → "contends"/"maintains"/"posits", "provides" → "offers"/"presents"/"supplies", "highlights" → "underscores"/"draws attention to"/"brings out", "suggests" → "indicates"/"points to"/"implies", "addresses" → "confronts"/"deals with"/"takes on", "relevant" → "pertinent"/"applicable"/"germane", "valuable" → "useful"/"instructive"/"informative", "important" → "notable"/"consequential"/"key", "comprehensive" → "thorough"/"wide-ranging"/"in-depth", "significant" → "major"/"substantial"/"considerable". You MUST replace these words — do NOT keep original verbs and adjectives.
12. STRUCTURAL TRANSFORMATION (MANDATORY — apply to EVERY sentence):
    - CLAUSE FRONTING: Move subordinate clauses to the beginning ("X because Y" → "Because Y, X")
    - VOICE SHIFT: Change active to passive or vice versa ("The authors argue" → "It is argued by the authors" / "violence is shaped by" → "structural factors shape violence")
    - NOMINALIZATION: Convert verbs to nouns or vice versa ("the study examines" → "the examination in this study" / "an analysis of X" → "analyzing X")
    - REORDER INFORMATION: Move phrases to different positions ("Using data from surveys, the study examines..." → "The study, drawing on survey data, examines...")
    You MUST change the word order. Do NOT preserve the original clause arrangement.
13. PRESERVE COMPOUND TERMS: Keep established compound terms intact (e.g. "intimate partner violence", "gender-based violence", "civil society", "criminal justice", "policy change"). Do NOT replace words within these terms.
14. CAPITALIZATION: Only capitalize proper nouns (names, places, organizations). Common nouns like "health", "women", "crime", "education" must be lowercase mid-sentence.
15. Use passive voice naturally where appropriate. Preserve reference markers [1], [2] exactly. Use relative clauses and appositives.` : `6. Use everyday words: "use" not "utilize", "help" not "facilitate", "big" not "significant", "show" not "demonstrate", "part" not "aspect", "idea" not "notion"
7. CRITICAL: Preserve all placeholder tokens like [[PROT_0]], [[TRM_0]] exactly as-is. Do not remove or modify them.
8. Keep the same meaning and all factual content, data, citations. Do NOT hallucinate or invent information not present in the original.
9. CRITICAL WORD COUNT: Your output sentence MUST stay within ±15% of the original word count. Do NOT drastically shorten or pad.
10. Use phrasal verbs where natural: look into, carry out, bring about, figure out, deal with, end up.
14. SYNONYM REPLACEMENT: Replace at least 30% of content words with natural synonyms. Use everyday alternatives — "use" not "utilize", "help" not "facilitate", "show" not "demonstrate".
15. VOICE & TENSE VARIATION: Randomly apply ONE of these per sentence:
    - Switch active voice to passive or vice versa
    - Switch simple tense to continuous or vice versa ("process" ↔ "processing", "analyze" ↔ "analyzing")
    - Convert noun form to verb form or vice versa ("the analysis" ↔ "to analyze")
16. AI PHRASE KILLING: Replace any AI-typical phrasing with casual human alternatives. "It is important to note" → direct statement. "In today's rapidly evolving" → cut entirely or rephrase casually.
11. STRUCTURAL TRANSFORMATION — use these specific techniques to restructure the sentence:
    - CLAUSE FRONTING: Move subordinate clauses to the beginning ("Because X, Y" ↔ "Y because X")
    - NOMINALIZATION: Convert verbs to nouns or nouns to verbs ("to expand access" → "the expansion of access", "the assessment" → "to assess")
    - CONJUNCTION ROTATION: Vary linking words ("or" → "as well as", "and" → "along with", "but" → "however"/"yet")
    - VOICE SHIFT: Change active to passive or passive to active, swap the grammatical subject
    - CONDITIONAL SWAPS: "if" → "when"/"provided that", "because" → "since"/"given that"
    - PHRASE EXPANSION/COMPRESSION: "location" → "place of residence", "regardless of" → "no matter"
    - PARALLEL STRUCTURE BREAKING: Make lists asymmetric — "A, B, and C" → "A along with B, as well as C"
12. AVOID HEDGING: Do not use "it is important to note", "it is worth mentioning", "one could argue". Make direct statements.
13. PREFER CONCRETE OVER ABSTRACT: Say "the factory shut down" not "the operation ceased". Say "prices went up" not "costs increased significantly".`}`;
}

function buildSentenceUserPrompt(
  sentence: string,
  prevSentence: string | null,
  nextSentence: string | null,
  features: InputFeatures,
): string {
  const contractionRule = features.hasContractions
    ? "You MAY use contractions."
    : "Do NOT use contractions.";
  const firstPersonRule = features.hasFirstPerson
    ? "First-person pronouns OK."
    : "No first-person pronouns (I, we, me, us, my, our).";
  const rhetoricalRule = features.hasRhetoricalQuestions
    ? ""
    : "No rhetorical questions.";

  const contextBefore = prevSentence ? `[BEFORE]: ${prevSentence}\n` : "";
  const contextAfter = nextSentence ? `\n[AFTER]: ${nextSentence}` : "";

  const wordCount = sentence.split(/\s+/).length;
  const minWords = Math.floor(wordCount * 0.85);
  const maxWords = Math.ceil(wordCount * 1.15);

  return `${contractionRule} ${firstPersonRule} ${rhetoricalRule}
WORD RANGE: The original is ${wordCount} words. Your output MUST be between ${minWords} and ${maxWords} words. Do NOT drastically shorten or pad.

${contextBefore}[TARGET]: ${sentence}${contextAfter}`;
}

// ══════════════════════════════════════════════════════════════════════════
// PARAGRAPH-LEVEL LLM REWRITE (Wikipedia mode only)
// Sends full paragraphs to the LLM for natural cross-sentence dependencies.
// This prevents the per-sentence uniformity that neural detectors catch.
// ══════════════════════════════════════════════════════════════════════════

function getWikiParagraphSystemPrompt(): string {
  return `You are a seasoned Wikipedia editor COMPLETELY rewriting a paragraph into proper encyclopedic style. Your output must read exactly like a real Wikipedia article — neutral point of view (NPOV), third person, factual and declarative.

CRITICAL MANDATE: You MUST produce a SUBSTANTIALLY DIFFERENT version of the input. If your output resembles the original wording, you have FAILED. Rewrite every sentence from scratch using entirely different vocabulary and sentence structures. Imagine you are writing the paragraph for the first time based only on the facts.

RULES:
1. Rewrite the ENTIRE paragraph FROM SCRATCH. Return ONLY the rewritten paragraph — no labels, no commentary.
2. PRESERVE the same number of sentences. Do NOT merge or split sentences.
3. BANNED WORDS: utilize, leverage, delve, tapestry, cornerstone, bedrock, linchpin, nexus, myriad, plethora, multifaceted, holistic, synergy, paradigm, trajectory, discourse, dichotomy, conundrum, ramification, underpinning, efficacious, bolster, catalyze, spearhead, unravel, unveil, embark, harness, ameliorate, engender, elucidate, exacerbate, proliferate, culminate
4. ALLOWED academic vocabulary (use freely): significant, demonstrated, established, contributed, implemented, comprehensive, framework, methodology, fundamental, substantial, facilitate, prominent, notable, considerable, contemporary, subsequent, initial, primary, various, additional, specific, respectively, approximately
5. AGGRESSIVE REWRITING (MANDATORY): You MUST change at least 70% of content words. Restructure EVERY clause. Use completely different verbs, adjectives, and sentence openings than the original. The output should look like a DIFFERENT PERSON wrote it about the same topic.
6. SENTENCE LENGTH VARIATION (critical): Create natural variation in sentence length. Mix short declarative sentences (8-14 words) with longer complex ones (30-45 words). NEVER write 3+ consecutive sentences of similar length. Real Wikipedia articles have a standard deviation of 8-10 words in sentence length.
7. STRUCTURAL DIVERSITY across sentences: Use different grammatical structures for different sentences within the paragraph:
   - Some sentences: subject-verb-object (simple declarative)
   - Some sentences: fronted subordinate clause ("Drawing on X, the study...")
   - Some sentences: passive voice ("The data were collected from...")
   - Some sentences: relative clause insertion ("The report, which draws on extensive data, argues...")
   Do NOT use the same structure for consecutive sentences.
8. PRESERVE: All placeholder tokens [[PROT_0]], [[TRM_0]], all citations, dates, proper nouns, reference markers, and compound terms (intimate partner violence, gender-based violence, civil society, criminal justice).
9. No contractions. No first-person. No opinion markers. No hedging. State facts directly.
10. Third person throughout. Write as a real human Wikipedia editor — clear, informative, occasionally dry.
11. BANNED STARTERS: Do NOT start sentences with "Furthermore," "Moreover," "Additionally," "However," "Nevertheless," "Consequently," "It is," "It's important," "It should be noted"`;
}

function buildParagraphUserPrompt(
  paragraph: string,
  features: InputFeatures,
  sentenceCount: number,
): string {
  const wordCount = paragraph.split(/\s+/).length;
  const minWords = Math.floor(wordCount * 0.75);
  const maxWords = Math.ceil(wordCount * 1.25);

  return `No contractions. No first-person pronouns (I, we, me, us, my, our). No rhetorical questions.
WORD RANGE: The original is ${wordCount} words. Your output MUST be between ${minWords} and ${maxWords} words.
SENTENCE COUNT: The original has ${sentenceCount} sentences. Your output MUST have exactly ${sentenceCount} sentences.
REWRITE MANDATE: Do NOT copy phrases from the original. Every sentence must use different vocabulary and structure. Imagine you are writing this paragraph from scratch based only on the facts.

PARAGRAPH TO REWRITE:
${paragraph}`;
}

// ══════════════════════════════════════════════════════════════════════════
// PASS 2: NON-LLM STATISTICAL POST-PROCESSING
// Targets each of the 20 detector signals individually
// ══════════════════════════════════════════════════════════════════════════

// ── 2A: AI VOCABULARY ELIMINATION ──
// Covers: ai_pattern_score, per_sentence_ai_ratio

// Words that are SAFE in Wikipedia/encyclopedic context — do NOT replace these in wikipedia mode
const WIKIPEDIA_SAFE_WORDS = new Set([
  "significant", "demonstrate", "demonstrated", "demonstrates", "demonstrating",
  "established", "establishing", "establishment", "comprehensive", "facilitate",
  "facilitated", "facilitating", "contributed", "contributing", "contribution",
  "implemented", "implementing", "implementation", "framework", "methodology",
  "fundamental", "fundamentally", "substantial", "substantially", "prominent",
  "notable", "considerable", "considerably", "contemporary", "subsequent",
  "subsequently", "initial", "initially", "primary", "primarily", "various",
  "additional", "additionally", "specific", "specifically", "respectively",
  "approximately", "significant", "significance", "enhance", "enhanced",
  "enhancement", "crucial", "vital", "essential", "diverse", "diversity",
  "dynamic", "ensure", "ensuring", "aspect", "aspects", "integral",
  "foster", "fostered", "fostering", "encompass", "encompassed", "encompassing",
  "highlight", "highlighted", "highlighting", "furthermore", "moreover",
  "consequently", "nevertheless", "however", "therefore", "regarding",
  "pertaining", "designated", "designation", "comprised", "comprising",
  "advocating", "advocacy", "promoting", "promotion", "curriculum",
  "curricula", "intervention", "interventions", "assessment", "certification",
]);

const AI_WORD_KILL: Record<string, string[]> = {
  utilize: ["use"], utilise: ["use"], leverage: ["use", "draw on", "rely on"],
  facilitate: ["help", "support", "allow"], comprehensive: ["thorough", "extensive", "wide-ranging", "in-depth"],
  multifaceted: ["complex", "layered"], paramount: ["central", "most important", "top"],
  furthermore: ["also", "and", "on top of that"], moreover: ["also", "and", "plus"],
  additionally: ["also", "and", "on top of that"], consequently: ["so", "because of this", "this meant"],
  subsequently: ["then", "later", "after that"], nevertheless: ["still", "even so", "yet"],
  notwithstanding: ["despite", "even with"], aforementioned: ["earlier", "previous", "that"],
  paradigm: ["model", "approach"], trajectory: ["path", "course", "direction"],
  discourse: ["discussion", "debate", "talk"], dichotomy: ["divide", "split", "gap"],
  conundrum: ["problem", "puzzle", "challenge"], ramification: ["effect", "result", "outcome"],
  underpinning: ["basis", "root", "base"], synergy: ["combined effort", "teamwork"],
  robust: ["strong", "solid", "tough"], nuanced: ["detailed", "subtle", "fine-grained"],
  salient: ["key", "main", "standout"], ubiquitous: ["common", "everywhere", "widespread"],
  pivotal: ["key", "central", "turning-point"], intricate: ["complex", "detailed", "involved"],
  meticulous: ["careful", "thorough", "exact"], profound: ["deep", "serious", "far-reaching"],
  inherent: ["built-in", "natural", "baked-in"], overarching: ["main", "broad", "general"],
  substantive: ["real", "meaningful", "solid"], efficacious: ["effective", "working"],
  holistic: ["integrated", "complete", "all-encompassing"], transformative: ["game-changing", "major", "radical"],
  innovative: ["new", "fresh", "creative"], groundbreaking: ["pioneering", "first-of-its-kind"],
  noteworthy: ["worth noting", "interesting", "striking"], proliferate: ["spread", "grow", "multiply"],
  exacerbate: ["worsen", "intensify", "aggravate"], ameliorate: ["improve", "ease", "fix"],
  engender: ["create", "produce", "cause"], delineate: ["describe", "outline", "map out"],
  elucidate: ["explain", "clarify", "spell out"], illuminate: ["shed light on", "clarify", "show"],
  necessitate: ["call for", "demand", "require"], perpetuate: ["keep going", "continue", "maintain"],
  underscore: ["highlight", "stress", "bring out"], exemplify: ["show", "demonstrate", "reflect"],
  encompass: ["include", "cover", "take in"], bolster: ["support", "back up", "strengthen"],
  catalyze: ["trigger", "spark", "set off"], streamline: ["simplify", "cut down on", "trim"],
  optimize: ["improve", "fine-tune", "make better"], mitigate: ["reduce", "lessen", "soften"],
  navigate: ["handle", "work through", "deal with"], prioritize: ["focus on", "put first", "rank"],
  articulate: ["express", "state", "spell out"], substantiate: ["back up", "support", "prove"],
  corroborate: ["confirm", "support", "back up"], disseminate: ["spread", "share", "pass on"],
  cultivate: ["develop", "grow", "build"], ascertain: ["find out", "determine", "figure out"],
  endeavor: ["try", "attempt", "effort"], delve: ["dig into", "look into", "explore"],
  embark: ["start", "begin", "kick off"], foster: ["encourage", "support", "grow"],
  harness: ["use", "tap into", "put to work"], spearhead: ["lead", "drive", "head up"],
  unravel: ["untangle", "figure out", "break down"], unveil: ["reveal", "show", "roll out"],
  tapestry: ["mix", "web", "patchwork"], cornerstone: ["foundation", "base", "core"],
  bedrock: ["base", "foundation", "root"], linchpin: ["key piece", "core", "anchor"],
  nexus: ["connection", "link", "center"], spectrum: ["range", "spread"],
  myriad: ["many", "lots of", "countless"], plethora: ["many", "tons of", "a lot of"],
  multitude: ["many", "a lot of", "scores of"], landscape: ["scene", "field", "picture"],
  realm: ["area", "field", "world"], culminate: ["end in", "lead to", "result in"],
  enhance: ["improve", "boost", "strengthen"], crucial: ["key", "important", "critical"],
  vital: ["key", "important", "essential"], imperative: ["necessary", "essential", "urgent"],
  notable: ["worth noting", "interesting"], significant: ["important", "big", "major", "clear"],
  substantial: ["large", "big", "real", "major"], remarkable: ["striking", "unusual", "surprising"],
  considerable: ["large", "big", "a good deal of"], unprecedented: ["never-before-seen", "new", "first-ever"],
  methodology: ["method", "approach", "process"], framework: ["structure", "setup", "system"],
  implication: ["effect", "result", "what this means"], implications: ["effects", "results", "consequences"],
  // Additional common AI words caught by detector
  notably: ["especially", "in particular"], specifically: ["in particular", "especially"],
  crucially: ["importantly", "above all"], essentially: ["basically", "at its core", "really"],
  fundamentally: ["at its root", "basically", "at heart"], arguably: ["probably", "you could say"],
  undeniably: ["clearly", "without question"], undoubtedly: ["clearly", "no question"],
  interestingly: ["what stands out is", "curiously"], remarkably: ["surprisingly", "strikingly"],
  evidently: ["clearly", "as it turned out"], henceforth: ["from then on", "after that"],
  catalyst: ["trigger", "spark", "driver"],
  // Words heavily flagged by Surfer SEO, GPTZero, Originality, Copyleaks, Pangram
  ensure: ["make sure", "see to it", "guarantee"],
  aspect: ["part", "side", "piece", "angle"],
  notion: ["idea", "thought", "concept"],
  diverse: ["varied", "mixed", "different"],
  dynamic: ["active", "shifting", "changing"],
  implement: ["carry out", "apply", "execute"],
  pertaining: ["about", "related to", "tied to"],
  integral: ["key", "central", "core"],
  interplay: ["give and take", "back and forth", "exchange"],
  demonstrate: ["show", "prove", "make clear"],
  addressing: ["handling", "dealing with", "tackling"],
  highlight: ["point out", "show", "bring up"],
  ultimately: ["in the end", "finally", "when all was done"],
  therefore: ["so", "for that reason", "because of this"],
  however: ["but", "still", "yet", "even so"],
  particularly: ["especially", "mainly"],
  respectively: ["in that order", "each"],
  encompasses: ["includes", "covers", "takes in"],
};

const AI_PHRASE_KILL: [RegExp, string][] = [
  [/\bit is (?:important|crucial|essential|vital|imperative|worth noting|notable|noteworthy) (?:to note |to mention |to emphasize |to stress |to recognize |to acknowledge |to highlight |to consider )?that\b/gi, "notably,"],
  [/\bit (?:should|must|can|cannot|could|may) be (?:noted|argued|said|emphasized|stressed|acknowledged|recognized|observed|mentioned|highlighted|pointed out) that\b/gi, "one sees that"],
  [/\bin today'?s (?:world|society|landscape|era|age|environment|climate|context)\b/gi, "right now"],
  [/\bin the (?:modern|current|contemporary|present-day|digital) (?:era|age|world|landscape|context|environment)\b/gi, "today"],
  [/\bplay(?:s|ed|ing)? a (?:crucial|vital|key|significant|important|pivotal|critical|fundamental|instrumental|central|essential|major) role in\b/gi, "was key to"],
  [/\bplay(?:s|ed|ing)? a (?:crucial|vital|key|significant|important|pivotal|critical|fundamental|instrumental|central|essential|major) role\b/gi, "mattered"],
  [/\ba (?:wide|broad|vast|diverse|rich|extensive) (?:range|array|spectrum|variety|selection) of\b/gi, "many"],
  [/\ba (?:plethora|myriad|multitude|wealth|abundance|profusion) of\b/gi, "many"],
  [/\b(?:due to|owing to) the fact that\b/gi, "because"],
  [/\bfirst and foremost\b/gi, "first"],
  [/\beach and every\b/gi, "every"],
  [/\bneedless to say\b/gi, "clearly"],
  [/\bthere is no doubt that\b/gi, "clearly"],
  [/\bat the end of the day\b/gi, "in the end"],
  [/\bserves? as a (?:testament|reminder|catalyst|cornerstone|foundation|beacon|symbol)\b/gi, "shows"],
  [/\bnot only (.{5,80}?) but also\b/gi, "$1 and also"],
  [/\b(?:that being said|having said that|with that in mind|with this in mind)\b/gi, "still"],
  [/\b(?:in light of|in view of) (?:the above|this|these|the foregoing)\b/gi, "given this"],
  [/\bthe (?:importance|significance|impact|relevance|value) of\b/gi, "the weight of"],
  [/\bcontributed to\b/gi, "fed into"],
  [/\bmoving forward\b/gi, "going ahead"],
  [/\bin (?:order )?to\b/gi, "to"],
  [/\b(?:it is|it remains) (?:clear|evident|apparent|obvious) that\b/gi, "clearly"],
  [/\bas (?:a result|a consequence)\b/gi, "so"],
  [/\bfor (?:example|instance)\b/gi, "like"],
  [/\bthere (?:are|exist) (?:several|many|numerous|multiple|various)\b/gi, "several"],
  [/\bwhen it comes to\b/gi, "with"],
  [/\bon the other hand\b/gi, "then again"],
  [/\b(?:in|with) (?:regard|respect|reference) to\b/gi, "about"],
  [/\bin terms of\b/gi, "for"],
  [/\bin the context of\b/gi, "within"],
  [/\b(?:given|considering) (?:that|the fact that)\b/gi, "since"],
  [/\bhas the potential to\b/gi, "could"],
  [/\bhave the ability to\b/gi, "can"],
  [/\bin recent years\b/gi, "lately"],
  [/\bthe fact that\b/gi, "that"],
  [/\bat the same time\b/gi, "meanwhile"],
  [/\bon a global scale\b/gi, "worldwide"],
  [/\bcannot be overstated\b/gi, "is huge"],
  [/\ba comprehensive approach\b/gi, "a thorough plan"],
  [/\bthere is a (?:growing |increasing )?need (?:for|to)\b/gi, "the need is"],
  [/\bsheds? light on\b/gi, "clears up"],
  [/\bpaves? the way for\b/gi, "opens the door to"],
  [/\braises? important questions?\b/gi, "brings up questions"],
];

function killAIVocabulary(text: string): string {
  let result = text;
  // Apply local phrase kill patterns FIRST (before word-level, so phrases like "contributed to" are caught intact)
  for (const [pattern, replacement] of AI_PHRASE_KILL) {
    result = result.replace(pattern, replacement);
  }
  // Then word-level replacements from shared dictionaries (120+ AI words)
  result = applyAIWordKill(result);
  // Also apply expanded phrase patterns (500K+ variations from 9 categories:
  // verb phrases, modifiers, clause rephrasings, hedging, transitions,
  // quantifiers, temporal, causal, emphasis patterns)
  result = applyPhrasePatterns(result);
  // Cleanup artifacts
  result = result.replace(/ {2,}/g, " ");
  // Only capitalize after periods within a line — never match across paragraph breaks (\n\n)
  result = result.replace(/\.[ \t]+([a-z])/g, (_, ch) => ". " + ch.toUpperCase());
  result = result.replace(/^[ \t]+/gm, "");
  result = result.replace(/,\s*,/g, ",");

  return result;
}

// ── 2B: BURSTINESS ENFORCER ──
// Targets: burstiness, sentence_uniformity, readability_consistency, spectral_flatness

function enforceBurstiness(text: string): string {
  // Sentence order must be preserved — no reordering allowed.
  // Burstiness is achieved through per-sentence processing, not swapping.
  return text;
}

// ── 2C: STARTER DIVERSIFIER ──
// Targets: starter_diversity, per_sentence_ai_ratio

const AI_STARTERS = new Set([
  "furthermore", "moreover", "additionally", "consequently", "subsequently",
  "nevertheless", "notwithstanding", "accordingly", "thus", "hence",
  "indeed", "notably", "specifically", "crucially", "importantly",
  "essentially", "fundamentally", "arguably", "undeniably", "undoubtedly",
  "interestingly", "remarkably", "evidently",
]);

const NATURAL_REROUTES: string[] = [
  "In practice,", "Put differently,",
  "By that point,", "From that angle,",
  "At its core,", "As things stood,",
  "In real terms,", "With that shift,",
  "Looking at it this way,", "What this meant was",
  "The upshot:", "As a result,",
  "Even so,", "Still,",
];

function diversifyStarters(text: string): string {
  // Sentence starters are handled per-sentence during individual processing.
  // No cross-sentence starter injection to preserve independent processing.
  return text;
}

// ── 2D: CONNECTOR NATURALIZER ──
// Targets: ai_pattern_score (connector sub-signal)

const FORMAL_CONNECTORS: Record<string, string[]> = {
  "Furthermore, ": ["Also, ", "In addition, ", "Plus, "],
  "Moreover, ": ["On top of that, ", "In addition, ", "Beyond that, "],
  "Additionally, ": ["Also, ", "In addition, ", "Plus, "],
  "Consequently, ": ["So ", "Because of that, ", "That meant "],
  "Nevertheless, ": ["Still, ", "Even so, ", "All the same, "],
  "Nonetheless, ": ["Still, ", "Even so, ", "All the same, "],
  "In contrast, ": ["On the other hand, ", "Then again, ", "On the flip side, "],
  "Subsequently, ": ["After that, ", "Then ", "Later, "],
  "In conclusion, ": ["All in all, ", "When you put it together, ", "Looking at the whole picture, "],
  "Therefore, ": ["So ", "That is why ", "This is why "],
  "However, ": ["Still, ", "Even so, ", "All the same, "],
  "Thus, ": ["So ", "That way, ", "This meant "],
  "Hence, ": ["So ", "That is why ", "Because of that, "],
  "Indeed, ": ["In fact, ", "Sure enough, ", "As it turned out, "],
  "Accordingly, ": ["So ", "In response, ", "Because of this, "],
  "Notably, ": ["What stands out is ", "One thing worth noting: ", ""],
  "Specifically, ": ["In particular, ", "To be exact, ", ""],
  "As a result, ": ["So ", "Because of this, ", "That meant "],
  "For example, ": ["Take ", "Like ", "Consider "],
  "For instance, ": ["Take ", "Like ", "Say "],
  "On the other hand, ": ["Then again, ", "At the same time, ", "Conversely, "],
  "In other words, ": ["Put simply, ", "Basically, ", "What that means is "],
};

function naturalizeConnectors(text: string): string {
  // Delegate to shared dictionaries (27+ formal connector patterns)
  return applyConnectorNaturalization(text);
}

// ── Pre-2000 Era Buzzword Killer ──
// Eliminate modern (post-2000) corporate/tech/AI buzzwords.

const MODERN_BUZZWORDS: [RegExp, string][] = [
  [/\bsynergize\b/gi, "combine"],
  [/\bsynergies\b/gi, "benefits"],
  [/\bimpactful\b/gi, "effective"],
  [/\bactionable\b/gi, "practical"],
  [/\bscalable\b/gi, "expandable"],
  [/\bstakeholders?\b/gi, "parties involved"],
  [/\becosystem\b(?!\s+(?:of|in)\s+(?:forest|marine|aquatic|natural|river|lake|ocean))/gi, "setup"],
  [/\bparadigm shift\b/gi, "major change"],
  [/\bgranular\b/gi, "detailed"],
  [/\bbest practices?\b/gi, "sound methods"],
  [/\bcore competenc(?:y|ies)\b/gi, "main strengths"],
  [/\bthought leader(?:ship|s)?\b/gi, "expert opinion"],
  [/\bdisruptive?\b/gi, "radical"],
  [/\binnovative\b/gi, "fresh"],
  [/\bdata-driven\b/gi, "evidence-based"],
  [/\bholistic approach\b/gi, "broad view"],
  [/\bmoving the needle\b/gi, "making progress"],
  [/\bvalue-added?\b/gi, "useful"],
  [/\bbenchmark(?:ing|s)?\b/gi, "measure"],
  [/\boptics\b(?!\s+(?:fiber|lens|lab))/gi, "appearance"],
  [/\bpivot(?:ing)?\b(?!\s+(?:point|table|joint))/gi, "shift"],
  [/\bnarrativ(?:e|es)\b(?!\s+(?:poem|fiction|structure|technique|arc))/gi, "account"],
  [/\bempower(?:ing|ment|s)?\b/gi, "enable"],
  [/\bdeep dive\b/gi, "close look"],
  [/\bhigh-level\b/gi, "broad"],
  [/\blow-hanging fruit\b/gi, "easy wins"],
  [/\btake(?:away|aways)\b/gi, "points"],
  [/\b(?:circle|loop) back\b/gi, "return to"],
  [/\btouch base\b/gi, "check in"],
  [/\bdigital transformation\b/gi, "technical change"],
  [/\brobust solution\b/gi, "solid answer"],
  [/\brobust\b/gi, "solid"],
  [/\bseamless(?:ly)?\b/gi, "smooth"],
  [/\boptimal(?:ly)?\b/gi, "best"],
  [/\bproactive(?:ly)?\b/gi, "active"],
  [/\bintersectionality\b/gi, "overlap"],
  [/\bnuanced\b/gi, "detailed"],
  [/\bunpack(?:ing)?\b(?!\s+(?:bag|box|suitcase|luggage))/gi, "examine"],
  [/\bspace\b(?=\s+(?:for|of|around))/gi, "area"],
  [/\blens\b(?=\s+(?:of|through|for))/gi, "angle"],
  [/\bkey takeaway\b/gi, "main point"],
];

function killModernBuzzwords(text: string): string {
  let result = text;
  for (const [pattern, replacement] of MODERN_BUZZWORDS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ── 2E: PUNCTUATION HUMANIZER ──
// Targets: stylometric_score, dependency_depth

function humanizePunctuation(text: string, features: InputFeatures): string {
  const paragraphs = text.split(/\n\s*\n/);
  let semicolonBudget = 3;
  let dashBudget = 4;
  let parenBudget = 2;

  const result = paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = robustSentenceSplit(p);
    const processed: string[] = [];

    for (let i = 0; i < sentences.length; i++) {
      let sent = sentences[i].trim();
      if (!sent) continue;
      const words = sent.split(/\s+/);

      // STRICT: No sentence merging — each sentence stays independent.
      // Semicolon merging disabled to preserve sentence count.

      // Em-dash injection DISABLED — produces unnatural patterns
      // Original code converted comma-separated asides to em-dash format

      processed.push(sent);
    }

    return processed.join(" ");
  }).filter(Boolean).join("\n\n");

  // Handle contractions
  if (!features.hasContractions) {
    return removeContractions(result);
  }
  return result;
}

// ── Contraction handling ──

const EXPANSION_MAP: Record<string, string> = {
  "can't": "cannot", "won't": "will not", "don't": "do not",
  "doesn't": "does not", "didn't": "did not", "isn't": "is not",
  "aren't": "are not", "wasn't": "was not", "weren't": "were not",
  "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
  "wouldn't": "would not", "shouldn't": "should not", "couldn't": "could not",
  "mustn't": "must not", "it's": "it is", "that's": "that is",
  "there's": "there is", "here's": "here is", "he's": "he is",
  "she's": "she is", "they're": "they are", "we're": "we are",
  "you're": "you are", "i'm": "I am", "they've": "they have",
  "we've": "we have", "you've": "you have", "i've": "I have",
  "they'll": "they will", "we'll": "we will", "you'll": "you will",
  "i'll": "I will", "he'll": "he will", "she'll": "she will",
  "it'll": "it will", "let's": "let us", "who's": "who is",
  "what's": "what is",
};

const CONTRACTION_EXPAND_RE = new RegExp(
  "\\b(" + Object.keys(EXPANSION_MAP).map(k => k.replace(/'/g, "'?")).join("|") + ")\\b", "gi",
);

function removeContractions(text: string): string {
  let result = text.replace(CONTRACTION_EXPAND_RE, (match) => {
    const expanded = EXPANSION_MAP[match.toLowerCase()] ?? match;
    return match[0] === match[0].toUpperCase() && expanded[0] === expanded[0].toLowerCase()
      ? expanded[0].toUpperCase() + expanded.slice(1) : expanded;
  });
  result = expandContractions(result);
  return result;
}

// ── Post-LLM first-person removal ──

const FIRST_PERSON_RE = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/gi;

function removeFirstPerson(text: string): string {
  // Replace first-person patterns with NATURAL impersonal alternatives
  // Avoid passive constructions like "it is believed" — these score as AI
  let result = text;
  result = result.replace(/\bwe need\b/gi, "there is a need");
  result = result.replace(/\bwe must\b/gi, "one must");
  result = result.replace(/\bwe can\b/gi, "one can");
  result = result.replace(/\bwe should\b/gi, "one should");
  result = result.replace(/\bwe find that\b/gi, "the data shows");
  result = result.replace(/\bwe note that\b/gi, "notably,");
  result = result.replace(/\bwe see that\b/gi, "clearly,");
  result = result.replace(/\bwe observe that\b/gi, "as seen,");
  result = result.replace(/\bwe argue that\b/gi, "the case is that");
  result = result.replace(/\bwe believe\b/gi, "the view here is");
  result = result.replace(/\bwe suggest\b/gi, "one option is");
  result = result.replace(/\bwe propose\b/gi, "the idea is");
  result = result.replace(/\bin our view\b/gi, "from this angle");
  result = result.replace(/\bin our opinion\b/gi, "by this reading");
  result = result.replace(/\bour findings\b/gi, "the findings");
  result = result.replace(/\bour analysis\b/gi, "the analysis");
  result = result.replace(/\bour results\b/gi, "the results");
  result = result.replace(/\bour approach\b/gi, "the approach");
  result = result.replace(/\bour study\b/gi, "this study");
  result = result.replace(/\bour research\b/gi, "this research");
  result = result.replace(/\bI think\b/gi, "the sense is");
  result = result.replace(/\bI believe\b/gi, "the view here is");
  result = result.replace(/\bI argue\b/gi, "the case is");
  result = result.replace(/\bmy view\b/gi, "this angle");
  result = result.replace(/\bmy opinion\b/gi, "this reading");
  // Capitalize sentence starts after replacement — only within lines, preserve paragraph breaks
  result = result.replace(/\.[ \t]+([a-z])/g, (_, ch) => ". " + ch.toUpperCase());
  return result;
}

// ── Post-LLM rhetorical question removal ──

function removeRhetoricalQuestions(text: string): string {
  // Split by paragraph breaks first to preserve them
  return text.split(/\n\s*\n/).map(para => {
    const sentences = robustSentenceSplit(para.trim());
    const filtered = sentences.filter(s => {
      const trimmed = s.trim();
      if (trimmed.endsWith("?")) return false;
      return true;
    });
    return filtered.join(" ");
  }).filter(p => p.trim()).join("\n\n");
}

// ── 2F: PARAGRAPH VARIANCE ──
// Targets: paragraph_uniformity

function varyParagraphs(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  if (paragraphs.length < 3) return text;

  // Check paragraph word count variance
  const lengths = paragraphs.map(p => p.split(/\s+/).length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const cvVal = Math.sqrt(lengths.reduce((a, l) => a + (l - avg) ** 2, 0) / lengths.length) / Math.max(avg, 1);

  if (cvVal > 0.30) return text; // Already varied enough

  // Try to split long paragraphs or merge short ones
  const result: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const sentences = robustSentenceSplit(para);

    if (sentences.length >= 6 && Math.random() < 0.5) {
      // Split into two paragraphs
      const splitPoint = Math.floor(sentences.length * (0.4 + Math.random() * 0.2));
      result.push(sentences.slice(0, splitPoint).join(" "));
      result.push(sentences.slice(splitPoint).join(" "));
    } else if (sentences.length <= 2 && i < paragraphs.length - 1) {
      // Merge with next paragraph if next is also short
      const nextSentences = robustSentenceSplit(paragraphs[i + 1]);
      if (nextSentences.length <= 3) {
        result.push(sentences.concat(nextSentences).join(" "));
        i++; // skip next
      } else {
        result.push(para);
      }
    } else {
      result.push(para);
    }
  }

  return result.filter(p => p.trim()).join("\n\n");
}

// ── Paragraph count enforcement ──

function isTitleOrHeading(para: string): boolean {
  const trimmed = para.trim();
  if (!trimmed) return false;
  if (/^#{1,6}\s/.test(trimmed)) return true;
  if (/^[IVXLCDM]+\.\s/i.test(trimmed)) return true;
  if (/^(?:Part|Section|Chapter)\s+\d+/i.test(trimmed)) return true;
  if (/^[\d]+[.):]\s/.test(trimmed) || /^[A-Za-z][.):]\s/.test(trimmed)) return true;
  if (/^(?:Introduction|Conclusion|Summary|Abstract|Background|Discussion|Results|Methods|References|Acknowledgments|Appendix)\s*$/i.test(trimmed)) return true;
  const words = trimmed.split(/\s+/);
  if (words.length <= 10 && !/[.!?]$/.test(trimmed)) return true;
  if (words.length <= 12 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) return true;
  return false;
}

function enforceParagraphCount(text: string, targetCount: number): string {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  if (paragraphs.length === targetCount || targetCount <= 0) return text;

  // Too many paragraphs: merge shortest adjacent non-heading pairs
  while (paragraphs.length > targetCount && paragraphs.length > 1) {
    let minLen = Infinity;
    let mergeIdx = -1;
    for (let i = 0; i < paragraphs.length - 1; i++) {
      const combinedLen = paragraphs[i].split(/\s+/).length + paragraphs[i + 1].split(/\s+/).length;
      if (isTitleOrHeading(paragraphs[i]) || isTitleOrHeading(paragraphs[i + 1])) continue;
      if (combinedLen < minLen) {
        minLen = combinedLen;
        mergeIdx = i;
      }
    }
    if (mergeIdx < 0) break;
    paragraphs[mergeIdx] = paragraphs[mergeIdx] + " " + paragraphs[mergeIdx + 1];
    paragraphs.splice(mergeIdx + 1, 1);
  }

  // Too few paragraphs: split longest non-title at a sentence boundary
  while (paragraphs.length < targetCount) {
    let maxLen = 0;
    let splitIdx = 0;
    for (let i = 0; i < paragraphs.length; i++) {
      if (isTitleOrHeading(paragraphs[i])) continue;
      const wc = paragraphs[i].split(/\s+/).length;
      if (wc > maxLen) { maxLen = wc; splitIdx = i; }
    }
    if (maxLen < 10) break;

    const sentences = robustSentenceSplit(paragraphs[splitIdx]);
    if (sentences.length < 2) break;

    const mid = Math.ceil(sentences.length / 2);
    const part1 = sentences.slice(0, mid).join(" ");
    const part2 = sentences.slice(mid).join(" ");
    paragraphs.splice(splitIdx, 1, part1, part2);
  }

  return paragraphs.join("\n\n");
}

// ── 2G: FINAL SURFACE POLISH ──

function finalPolish(text: string): string {
  let result = text;

  // Strip markdown formatting (bold, italic) but preserve headings
  result = result.replace(/\*\*(.+?)\*\*/g, "$1");
  result = result.replace(/\*(.+?)\*/g, "$1");
  // NOTE: Do NOT strip heading markers (^#+\s*) — they are needed to preserve titles/headings

  // Fix spacing
  result = result.replace(/ {2,}/g, " ");
  result = result.replace(/\s+([.,;:!?])/g, "$1");
  result = result.replace(/([.,;:!?])([A-Za-z])/g, "$1 $2");

  // Strip all em-dashes and en-dashes — replace with commas
  result = result.replace(/ — /g, ", ").replace(/—/g, ", ");
  result = result.replace(/ – /g, ", ").replace(/–/g, ", ");

  // Fix doubled prepositions from word kill (e.g., "fed into to" → "fed into")
  result = result.replace(/\b(into|onto|from|with|for|about) (to|from|with|for|about|into|onto)\b/gi, "$1");
  // Fix "helped to the" pattern (wrong grammar, should be "helped the")
  result = result.replace(/\b(helped|spurred) to (the|a|an)\b/gi, "$1 $2");

  // Fix subject-verb agreement: plural noun + "was" → "were"
  const PLURAL_NOUNS = [
    "institutions", "colonies", "communities", "systems", "structures", "principles",
    "settlers", "leaders", "groups", "churches", "beliefs", "religions", "practices",
    "ideas", "values", "traditions", "movements", "efforts", "factors", "forces",
    "elements", "relationships", "connections", "networks", "regions", "areas",
    "societies", "populations", "organizations", "nations", "states", "countries",
    "people", "children", "men", "women", "individuals", "members", "citizens",
  ];
  const pluralPattern = new RegExp(`\\b(${PLURAL_NOUNS.join("|")})\\s+was\\b`, "gi");
  result = result.replace(pluralPattern, "$1 were");

  // Fix incorrect past participles (LLM sometimes uses past tense instead of participle)
  const PAST_PARTICIPLE_FIXES: Record<string, string> = {
    "was saw": "was seen", "was began": "was begun", "was came": "was come",
    "was did": "was done", "was drank": "was drunk", "was drove": "was driven",
    "was ate": "was eaten", "was fell": "was fallen", "was flew": "was flown",
    "was forgot": "was forgotten", "was froze": "was frozen", "was gave": "was given",
    "was went": "was gone", "was grew": "was grown", "was hid": "was hidden",
    "was knew": "was known", "was rode": "was ridden", "was rang": "was rung",
    "was rose": "was risen", "was ran": "was run", "was shook": "was shaken",
    "was showed": "was shown", "was sang": "was sung", "was spoke": "was spoken",
    "was stole": "was stolen", "was swam": "was swum", "was took": "was taken",
    "was threw": "was thrown", "was wore": "was worn", "was wrote": "was written",
    "were saw": "were seen", "were began": "were begun", "were drove": "were driven",
    "were gave": "were given", "were knew": "were known", "were took": "were taken",
    "were wrote": "were written", "were spoke": "were spoken", "were showed": "were shown",
    "been saw": "been seen", "been drove": "been driven", "been gave": "been given",
    "been took": "been taken", "been wrote": "been written",
  };
  for (const [wrong, right] of Object.entries(PAST_PARTICIPLE_FIXES)) {
    result = result.replace(new RegExp(`\\b${wrong}\\b`, 'gi'), right);
  }

  // Fix double punctuation
  result = result.replace(/\.{2,}/g, ".");
  result = result.replace(/,{2,}/g, ",");
  result = result.replace(/;{2,}/g, ";");
  result = result.replace(/—{2,}/g, "—");

  // Fix empty parens/brackets
  result = result.replace(/\(\s*\)/g, "");
  result = result.replace(/\[\s*\]/g, "");

  // Fix repeated words (but preserve intentional ones like "very very")
  result = result.replace(/\b((?!very|much|so|more|had|that)\w{4,})\s+\1\b/gi, "$1");

  // Fix a/an
  result = result.replace(/\ba ([aeiouAEIOU])/g, "an $1");
  result = result.replace(/\bA ([aeiouAEIOU])/g, "An $1");
  result = result.replace(/\ban ([bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ])/g, (match, letter) => {
    // Don't fix "an hour", "an honest", "an heir" etc
    const exceptions = ["h"];
    return exceptions.includes(letter.toLowerCase()) ? match : "a " + letter;
  });

  // Fix irregular plurals that the LLM sometimes botches
  const IRREGULAR_PLURALS: Record<string, string> = {
    "basises": "bases", "analysises": "analyses", "thesises": "theses",
    "crisises": "crises", "hypothesises": "hypotheses", "parenthesises": "parentheses",
    "phenomenons": "phenomena", "criterions": "criteria", "datums": "data",
    "mediums": "media", "curriculums": "curricula", "appendixs": "appendices",
    "indexs": "indices", "matrixs": "matrices", "vertebras": "vertebrae",
    "childs": "children", "mans": "men", "womans": "women", "mouses": "mice",
    "gooses": "geese", "tooths": "teeth", "foots": "feet", "oxes": "oxen",
    "persons": "people", "lifes": "lives", "knifes": "knives", "wolfs": "wolves",
  };
  for (const [wrong, right] of Object.entries(IRREGULAR_PLURALS)) {
    result = result.replace(new RegExp(`\\b${wrong}\\b`, 'gi'), right);
  }

  // Capitalize sentence starts — only within lines, preserve paragraph breaks (\n\n)
  result = result.replace(/\.[ \t]+([a-z])/g, (_, ch) => ". " + ch.toUpperCase());
  result = result.replace(/^([a-z])/gm, (_, ch) => ch.toUpperCase());

  return result.trim();
}

// ── 2H: NGRAM DE-REPEATER ──
// Targets: ngram_repetition, token_predictability, zipf_deviation

// Common word → less-common synonyms (increases vocabulary diversity + fixes zipf)
const DIVERSITY_SWAPS: Record<string, string[]> = {
  "big": ["sizable", "hefty", "sweeping"], "small": ["modest", "slight", "minor"],
  "good": ["solid", "decent", "strong"], "bad": ["poor", "rough", "weak"],
  "very": ["quite", "rather", "especially"], "many": ["plenty of", "a number of", "several"],
  "help": ["assist", "support", "aid"], "use": ["employ", "apply", "rely on"],
  "show": ["reveal", "indicate", "demonstrate"], "make": ["create", "produce", "generate"],
  "get": ["obtain", "gain", "acquire"], "give": ["provide", "offer", "supply"],
  "take": ["adopt", "assume", "accept"], "see": ["observe", "notice", "recognize"],
  "come": ["arrive", "emerge", "surface"], "go": ["proceed", "move", "shift"],
  "keep": ["retain", "maintain", "preserve"], "change": ["alter", "shift", "modify"],
  "grow": ["expand", "swell", "climb"], "move": ["shift", "transition", "migrate"],
  "start": ["launch", "kick off", "initiate"], "work": ["function", "operate", "perform"],
  "need": ["require", "demand", "call for"], "put": ["place", "position", "set"],
  "run": ["operate", "manage", "oversee"], "try": ["attempt", "strive", "seek"],
  "think": ["consider", "believe", "reckon"], "find": ["discover", "uncover", "identify"],
  "look": ["examine", "glance", "inspect"], "want": ["desire", "seek", "aim for"],
  "also": ["likewise", "similarly", "too"], "still": ["yet", "even now", "nonetheless"],
  "just": ["merely", "simply", "only"], "world": ["globe", "planet", "sphere"],
  "way": ["manner", "approach", "route"], "part": ["portion", "segment", "piece"],
  "place": ["location", "site", "spot"], "problem": ["issue", "challenge", "difficulty"],
  "people": ["individuals", "folks", "populations"], "same": ["identical", "equivalent", "matching"],
  "new": ["fresh", "recent", "novel"], "old": ["former", "earlier", "longstanding"],
  "high": ["elevated", "steep", "lofty"], "low": ["minimal", "reduced", "meager"],
  "long": ["extended", "prolonged", "lengthy"], "things": ["aspects", "elements", "factors"],
  "fact": ["reality", "truth", "detail"], "point": ["aspect", "element", "angle"],
  "area": ["region", "zone", "domain"], "kind": ["type", "sort", "variety"],
};

function deRepeatNgrams(text: string): string {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];

  // Count trigram frequencies
  const trigramCounts = new Map<string, number>();
  for (let i = 0; i < words.length - 2; i++) {
    const tri = words[i] + " " + words[i + 1] + " " + words[i + 2];
    trigramCounts.set(tri, (trigramCounts.get(tri) ?? 0) + 1);
  }

  // Find repeated trigrams
  const repeatedTrigrams = new Set<string>();
  for (const [tri, count] of trigramCounts) {
    if (count >= 2) repeatedTrigrams.add(tri);
  }

  if (repeatedTrigrams.size === 0) return text;

  // For each repeated trigram, try to swap one word in its second occurrence
  let result = text;
  for (const tri of repeatedTrigrams) {
    const triWords = tri.split(" ");
    // Find the word most amenable to swapping
    for (const w of triWords) {
      const swaps = DIVERSITY_SWAPS[w];
      if (swaps && swaps.length > 0) {
        const replacement = swaps[Math.floor(Math.random() * swaps.length)];
        // Replace only one occurrence (not the first)
        const firstIdx = result.toLowerCase().indexOf(w);
        if (firstIdx >= 0) {
          const secondIdx = result.toLowerCase().indexOf(w, firstIdx + w.length + 1);
          if (secondIdx >= 0) {
            const originalWord = result.slice(secondIdx, secondIdx + w.length);
            const isCapitalized = originalWord[0] === originalWord[0].toUpperCase();
            const finalReplacement = isCapitalized
              ? replacement[0].toUpperCase() + replacement.slice(1)
              : replacement;
            result = result.slice(0, secondIdx) + finalReplacement + result.slice(secondIdx + w.length);
            break;
          }
        }
      }
    }
  }

  return result;
}

// ── 2I: DEPENDENCY DEPTH ENRICHER ──
// Targets: dependency_depth (add subordinate clauses and relative pronouns)

function enrichDependencyDepth(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  let budget = 2; // Max 2 subordinate clause insertions

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = robustSentenceSplit(p);
    const result: string[] = [];

    for (const sent of sentences) {
      const s = sent.trim();
      if (!s) continue;
      const words = s.split(/\s+/);

      // Only enrich medium-length sentences (15-30 words) — don't make short ones complex
      if (budget > 0 && words.length >= 15 && words.length <= 30 && Math.random() < 0.15) {
        // Try to add a "which" or "where" relative clause after a noun
        const nounPatterns = [
          /\b(the \w+)\b(?=\s+(?:has|have|had|is|are|was|were|can|could|will|would)\b)/i,
          /\b(this \w+)\b(?=\s+(?:has|have|had|is|are|was|were|can|could|will|would)\b)/i,
          /\b(these \w+s?)\b(?=\s+(?:has|have|had|is|are|was|were|can|could|will|would)\b)/i,
        ];

        let modified = false;
        for (const pattern of nounPatterns) {
          const match = s.match(pattern);
          if (match && match.index !== undefined) {
            const insertPoint = match.index + match[0].length;
            const clauses = [
              ", which had been building for years,",
              ", where conditions varied widely,",
              ", which not everyone expected,",
              ", although details remained unclear,",
              ", even though opinions differed,",
              ", since the evidence pointed that way,",
            ];
            const clause = clauses[Math.floor(Math.random() * clauses.length)];
            const newSent = s.slice(0, insertPoint) + clause + s.slice(insertPoint);
            result.push(newSent);
            budget--;
            modified = true;
            break;
          }
        }
        if (!modified) result.push(s);
      } else {
        result.push(s);
      }
    }

    return result.join(" ");
  }).filter(Boolean).join("\n\n");
}

// ── 2J: WORD DIVERSITY INJECTOR ──
// Targets: avg_word_commonality, vocabulary_richness, shannon_entropy
// Replaces some common words with less-common (but still natural) alternatives

function injectWordDiversity(text: string): string {
  let result = text;
  const usedSwaps = new Set<string>();

  // Only replace words that appear 2+ times in the text
  const wordCounts = new Map<string, number>();
  const textWords = text.toLowerCase().match(/[a-z']+/g) ?? [];
  for (const w of textWords) wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);

  // Use shared DIVERSITY_SWAPS (50+ common words with natural alternatives)
  for (const [common, alternatives] of Object.entries(SHARED_DIVERSITY_SWAPS)) {
    const count = wordCounts.get(common) ?? 0;
    if (count < 2 || usedSwaps.has(common)) continue;

    let replaced = 0;
    const targetReplacements = Math.ceil(count / 2);
    let skipFirst = true;

    const regex = new RegExp(`\\b${common}\\b`, "gi");
    result = result.replace(regex, (match) => {
      if (skipFirst) { skipFirst = false; return match; }
      if (replaced >= targetReplacements) return match;

      const alt = alternatives[replaced % alternatives.length];
      replaced++;
      usedSwaps.add(common);

      if (match[0] === match[0].toUpperCase()) {
        return alt[0].toUpperCase() + alt.slice(1);
      }
      return alt;
    });
  }

  return result;
}

// ── Dictionary-Enhanced Contextual Synonym Replacement ──
// Uses 619K+ word validity dictionary + curated synonyms + mega thesaurus

function dictionaryEnhancedSynonymSwap(text: string, intensity: number = 0.10): string {
  const dict = getDictionary();
  const paragraphs = text.split(/\n\s*\n/);
  const usedReplacements = new Set<string>();

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = robustSentenceSplit(p);
    const result: string[] = [];

    for (const sent of sentences) {
      const words = sent.split(/\s+/);
      if (words.length < 6) { result.push(sent); continue; }

      const targetSwaps = Math.max(1, Math.floor(words.length * intensity));
      let swaps = 0;

      const newWords = words.map((word, idx) => {
        if (swaps >= targetSwaps) return word;
        const clean = word.replace(/[^a-zA-Z]/g, "");
        if (clean.length < 5 || idx === 0) return word;

        const lower = clean.toLowerCase();
        // Skip function words and already-replaced words
        const skipWords = new Set(["about", "after", "again", "being", "below", "between",
          "could", "doing", "during", "every", "found", "given", "going", "great",
          "their", "there", "these", "those", "under", "using", "where", "which",
          "while", "would", "shall", "should", "other", "still", "never", "often"]);
        if (skipWords.has(lower) || usedReplacements.has(lower)) return word;

        const replacement = dict.replaceWordSmartly(clean, sent, usedReplacements);
        if (replacement !== clean && replacement.length > 0) {
          usedReplacements.add(lower);
          swaps++;
          const prefix = word.match(/^[^a-zA-Z]*/)?.[0] ?? "";
          const suffix = word.match(/[^a-zA-Z]*$/)?.[0] ?? "";
          const isCapitalized = clean[0] === clean[0].toUpperCase();
          const final = isCapitalized ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
          return prefix + final + suffix;
        }
        return word;
      });

      result.push(newWords.join(" "));
    }

    return result.join(" ");
  }).filter(Boolean).join("\n\n");
}

// ── Syntactic Template Application ──
// Applies clause reordering, PP repositioning, conjunction swaps (25+ templates)

function applySyntacticTemplatePass(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  let budget = 6;

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = robustSentenceSplit(p);
    const result: string[] = [];

    for (const sent of sentences) {
      const s = sent.trim();
      if (!s) continue;

      if (budget > 0 && s.split(/\s+/).length >= 15 && Math.random() < 0.35) {
        const transformed = applySyntacticTemplate(s);
        if (transformed !== s) {
          result.push(transformed);
          budget--;
          continue;
        }
      }
      result.push(s);
    }

    return result.join(" ");
  }).filter(Boolean).join("\n\n");
}

// ══════════════════════════════════════════════════════════════════════════
// SIGNAL-AWARE REFINEMENT — Run detector, fix remaining weak signals
// ══════════════════════════════════════════════════════════════════════════

function analyzeSignals(text: string): Record<string, number> {
  const signals = new TextSignals(text);
  return signals.getAllSignals();
}

function signalAwareRefinement(text: string): string {
  const signals = analyzeSignals(text);
  let result = text;

  // Fix burstiness
  if (signals.burstiness < 55) {
    result = forceExtremeVariation(result);
  }

  // Fix AI vocabulary
  if (signals.ai_pattern_score > 20) {
    result = killAIVocabulary(result);
  }

  // Fix starters
  if (signals.starter_diversity < 55) {
    result = diversifyStarters(result);
  }

  // Fix uniformity
  if (signals.sentence_uniformity > 50) {
    result = breakSentenceUniformity(result);
  }

  // Skip enrichDependencyDepth in refinement — already applied in main pipeline
  // and random clause insertion damages meaning preservation

  return result;
}

function forceExtremeVariation(text: string): string {
  // STRICT SENTENCE-BY-SENTENCE: No splitting allowed.
  // Instead, apply internal word-level variation to break monotony.
  return text;
}

function breakSentenceUniformity(text: string): string {
  // STRICT SENTENCE-BY-SENTENCE: No splitting allowed.
  // Sentence count must remain identical.
  return text;
}

// ══════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
// CHUNKING — Split long text into processable segments
// ══════════════════════════════════════════════════════════════════════════

// Target ~800 words per chunk; never exceed ~1200
const CHUNK_TARGET_WORDS = 800;
const CHUNK_MAX_WORDS = 1200;
// Texts shorter than this go through the pipeline as-is (no chunking overhead)
const CHUNK_THRESHOLD_WORDS = 1000;

/**
 * Intelligently split text into chunks at section/paragraph boundaries.
 * Prioritizes splitting at section headers (lines starting with Roman numerals,
 * "Part", "Chapter", numbered headings, or all-caps lines), then at paragraph
 * boundaries (double newlines), and finally at sentence boundaries as a last
 * resort.  Every chunk is guaranteed to be ≤ CHUNK_MAX_WORDS.
 */
function splitIntoChunks(text: string): string[] {
  const totalWords = text.trim().split(/\s+/).length;
  if (totalWords <= CHUNK_THRESHOLD_WORDS) return [text];

  // Split on double-newlines first (paragraph/section boundaries)
  const blocks = text.split(/\n\s*\n/).filter(b => b.trim());
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWords = 0;

  for (const block of blocks) {
    const blockWords = block.trim().split(/\s+/).length;

    // If a single block exceeds max, split it by sentences
    if (blockWords > CHUNK_MAX_WORDS) {
      // Flush current
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join("\n\n"));
        currentChunk = [];
        currentWords = 0;
      }
      // Split oversized block by sentences
      const sentences = robustSentenceSplit(block);
      let sentBuf: string[] = [];
      let sentWords = 0;
      for (const sent of sentences) {
        const sw = sent.split(/\s+/).length;
        if (sentWords + sw > CHUNK_MAX_WORDS && sentBuf.length > 0) {
          chunks.push(sentBuf.join(" "));
          sentBuf = [];
          sentWords = 0;
        }
        sentBuf.push(sent);
        sentWords += sw;
      }
      if (sentBuf.length > 0) chunks.push(sentBuf.join(" "));
      continue;
    }

    // Check if adding this block would exceed target
    if (currentWords + blockWords > CHUNK_TARGET_WORDS && currentChunk.length > 0) {
      // Check if it's a section header — prefer splitting before headers
      const isHeader = /^(?:#{1,4}\s|Part\s+\d|Chapter\s+\d|(?:I{1,4}|IV|VI{0,3}|IX|X{0,3})\.?\s|[A-Z][A-Z\s]{3,}$)/m.test(block.trim());
      if (isHeader || currentWords >= CHUNK_TARGET_WORDS) {
        chunks.push(currentChunk.join("\n\n"));
        currentChunk = [];
        currentWords = 0;
      }
    }

    currentChunk.push(block);
    currentWords += blockWords;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join("\n\n"));
  }

  return chunks;
}

// ══════════════════════════════════════════════════════════════════════════
// SENTENCE-INDEPENDENT POST-PROCESSING
// Each sentence from the LLM output is processed independently as its own chunk.
// ══════════════════════════════════════════════════════════════════════════

/**
 * Post-process a single sentence independently through all transforms.
 * This is the core unit of work — each sentence is treated as an isolated chunk.
 */
function postProcessSingleSentence(sent: string, features: InputFeatures, strength: string = "light", tone: string = "neutral"): string {
  if (!sent.trim()) return sent;
  const originalSent = sent.trim();
  let result = originalSent;
  const isWiki = tone === "wikipedia";

  // 1. Kill AI vocabulary — local PHRASE patterns first
  // Wikipedia mode: only kill blatantly AI phrases, preserve encyclopedic vocabulary
  if (!isWiki) {
    for (const [pattern, replacement] of AI_PHRASE_KILL) {
      result = result.replace(pattern, replacement);
    }
  }

  // 2. Kill AI vocabulary — local WORD map (word by word through AI_WORD_KILL)
  // Wikipedia mode: skip words in WIKIPEDIA_SAFE_WORDS
  result = result.replace(/\b[a-zA-Z]+\b/g, (word) => {
    const lower = word.toLowerCase();
    if (isWiki && WIKIPEDIA_SAFE_WORDS.has(lower)) return word;
    const replacements = AI_WORD_KILL[lower];
    if (!replacements) return word;
    const rep = replacements[Math.floor(Math.random() * replacements.length)];
    if (word[0] === word[0].toUpperCase() && rep[0] === rep[0].toLowerCase()) {
      return rep[0].toUpperCase() + rep.slice(1);
    }
    return rep;
  });

  // 3. Kill AI vocabulary — shared dictionaries (120+ words + phrase patterns)
  // Wikipedia mode: skip shared dictionaries entirely — they replace academic vocabulary with casual alternatives
  if (!isWiki) {
    result = applyAIWordKill(result);
    result = applyPhrasePatterns(result);
  }

  // 4. Naturalize connectors
  // Wikipedia mode: skip — encyclopedic connectors are appropriate
  if (!isWiki) {
    result = applyConnectorNaturalization(result);
  }

  // Steps 5-9 REMOVED — applyPhrasePatterns in step 3 already covers all 9 swap dictionaries.
  // Applying them again was causing double/triple replacement that produced nonsensical output.

  // 10. Kill formal starters
  const firstWord = result.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (AI_STARTERS.has(firstWord)) {
    const comma = result.indexOf(",");
    if (comma > 0 && comma < 25) {
      result = result.slice(comma + 1).trim();
      if (result[0]) result = result[0].toUpperCase() + result.slice(1);
    }
  }

  // 11. Dictionary-enhanced synonym swap — REMOVED: produces off-context replacements.
  // The per-sentence LLM rewrite already handles synonym variation with proper context.

  // 12. Syntactic template — DISABLED: causes cascading duplication with
  // applyPhrasePatterns/applyConnectorNaturalization ("When when", "Since since").
  // The LLM rewrite already handles structural variation.
  // {
  //   const templateProb = strength === "strong" ? 0.35 : strength === "medium" ? 0.25 : 0.15;
  //   const rWords = result.split(/\s+/);
  //   if (rWords.length >= 12 && Math.random() < templateProb) {
  //     result = applySyntacticTemplate(result);
  //   }
  // }

  // 12a. Burstiness injection — break AI-typical sentence length uniformity
  // Real detectors (GPTZero, Pangram) flag sentences in the 15-25 word "AI sweet spot"
  {
    const words = result.split(/\s+/);
    const wc = words.length;
    if (wc >= 16 && wc <= 24) {
      const roll = Math.random();
      if (roll < 0.25) {
        // Shorten: remove a non-essential adverb or qualifier
        const adverbKill = /\b(very|really|quite|rather|somewhat|fairly|extremely|particularly|especially|significantly|substantially|generally|typically|essentially|fundamentally|relatively|primarily|largely|mainly)\s+/i;
        const before = result;
        result = result.replace(adverbKill, "");
        if (result === before) {
          // Try removing a hedging phrase
          result = result.replace(/\b(in fact|of course|to some extent|in many ways|for the most part|as a matter of fact),?\s*/i, "");
        }
      }
    }
  }

  // 12b. Second-pass AI word kill — catch any AI words reintroduced by synonym/template steps
  // Wikipedia mode: skip — encyclopedic vocabulary must be preserved
  if (!isWiki) {
    result = applyAIWordKill(result);
  }

  // 12b2. Structural diversity — DISABLED: random phrase injection was producing artifacts
  // like "By that point," and "Oddly," that corrupt academic text

  // 12c. Per-sentence anti-detection — score this sentence against the same 9 micro-signals
  // the detector uses and apply targeted fixes to push it below detection threshold
  // Wikipedia mode: skip — anti-detection uses casual phrasing inappropriate for academic text
  if (!isWiki) {
    const antiDetected = perSentenceAntiDetection([result], features.hasContractions);
    if (antiDetected.length > 0 && antiDetected[0].trim()) {
      result = antiDetected[0];
    }
  }

  // 12d. Deep cleaning — eliminate residual AI structural patterns
  // Wikipedia mode: skip — deep cleaning replaces academic vocabulary with casual alternatives
  if (!isWiki) {
    const deepCleaned = deepCleaningPass([result]);
    if (deepCleaned.length > 0 && deepCleaned[0].trim()) {
      result = deepCleaned[0];
    }
  }

  // 12e. Pre-1990 naturalness — replace modern collocations with older phrasing
  // Wikipedia mode: skip — modern collocations are appropriate in encyclopedic writing
  if (!isWiki) {
  result = result.replace(/\bin terms of\b/gi, "regarding");
  result = result.replace(/\bat the end of the day\b/gi, "when all is said and done");
  result = result.replace(/\bmoving forward\b/gi, "from here on");
  result = result.replace(/\bgame[- ]changer\b/gi, "turning point");
  result = result.replace(/\bimpact(?:s|ed|ing)? on\b/gi, (m) => m.replace(/impact/i, "effect"));
  result = result.replace(/\bfocus(?:es|ed|ing)? on\b/gi, (m) => m.replace(/focus/i, "center"));
  result = result.replace(/\bdriven by\b/gi, "caused by");
  result = result.replace(/\bengage(?:s|d|ment)? with\b/gi, (m) => m.replace(/engage/i, "deal"));
  result = result.replace(/\baddress(?:es|ed|ing)?\b(?!\s+(?:book|number|line|bar))/gi, (m) => m.replace(/address/i, "handle"));
  result = result.replace(/\bgoing forward\b/gi, "from now on");
  result = result.replace(/\bkey factor\b/gi, "main cause");
  result = result.replace(/\bplayed a role\b/gi, "mattered");
  result = result.replace(/\bplays a role\b/gi, "matters");
  result = result.replace(/\bdue to\b/gi, "because of");
  result = result.replace(/\bas well as\b/gi, "and");
  }

  // 12f. N-gram pattern breaking — Pangram and Copyleaks use n-gram frequency analysis
  // Wikipedia mode: only kill the most blatantly AI n-gram patterns (5 patterns)
  if (isWiki) {
    result = result.replace(/\bplays a crucial role\b/gi, "is central to");
    result = result.replace(/\bplay a crucial role\b/gi, "are central to");
    result = result.replace(/\bit is worth noting\b/gi, "notably");
    result = result.replace(/\bit is important to\b/gi, "it is necessary to");
    result = result.replace(/\bin order to\b/gi, "to");
  } else {
  // These are the most common AI bigram/trigram patterns that flag text as AI-generated
  result = result.replace(/\bplays a crucial role\b/gi, "matters a great deal");
  result = result.replace(/\bplay a crucial role\b/gi, "matter a great deal");
  result = result.replace(/\bplays an important role\b/gi, "carries real weight");
  result = result.replace(/\bit is worth noting\b/gi, "note that");
  result = result.replace(/\bit is important to\b/gi, "one must");
  result = result.replace(/\bit is essential to\b/gi, "one must");
  result = result.replace(/\bin order to\b/gi, "to");
  result = result.replace(/\bthe ability to\b/gi, "a way to");
  result = result.replace(/\ba wide range of\b/gi, "many");
  result = result.replace(/\ba wide variety of\b/gi, "many kinds of");
  result = result.replace(/\bon the other hand\b/gi, "then again");
  result = result.replace(/\bin this context\b/gi, "here");
  result = result.replace(/\bin this regard\b/gi, "in that respect");
  result = result.replace(/\bin the context of\b/gi, "within");
  result = result.replace(/\bwith regard to\b/gi, "about");
  result = result.replace(/\bwith respect to\b/gi, "about");
  result = result.replace(/\bin the case of\b/gi, "for");
  result = result.replace(/\bserves as a\b/gi, "works as a");
  result = result.replace(/\baims to\b/gi, "tries to");
  result = result.replace(/\bseeks to\b/gi, "tries to");
  result = result.replace(/\bhas the potential to\b/gi, "could");
  result = result.replace(/\bthe fact that\b/gi, "that");
  result = result.replace(/\bby means of\b/gi, "through");
  result = result.replace(/\bin light of\b/gi, "given");
  result = result.replace(/\btake into account\b/gi, "consider");
  result = result.replace(/\btaken into account\b/gi, "considered");
  result = result.replace(/\bgive rise to\b/gi, "cause");
  result = result.replace(/\bas a result of\b/gi, "from");
  result = result.replace(/\bas a consequence of\b/gi, "from");
  result = result.replace(/\bon the basis of\b/gi, "based on");
  }

  // 13. Constraint enforcement per sentence
  // Wikipedia mode: always expand contractions (encyclopedic style requires formal language)
  if (!features.hasContractions || isWiki) {
    result = result.replace(CONTRACTION_EXPAND_RE, (match) => {
      const expanded = EXPANSION_MAP[match.toLowerCase()] ?? match;
      return match[0] === match[0].toUpperCase() && expanded[0] === expanded[0].toLowerCase()
        ? expanded[0].toUpperCase() + expanded.slice(1) : expanded;
    });
    result = expandContractions(result);
  }

  // 14. Kill modern buzzwords (pre-2000 era naturalness)
  // Wikipedia mode: skip — modern terminology is appropriate in encyclopedic writing
  if (!isWiki) {
    result = killModernBuzzwords(result);
  }
  // NOTE: applyAIWordKill removed here — already applied in step 3. Running it again
  // caused recursive synonym drift that produced nonsensical output.

  // 15. Cleanup artifacts
  result = result.replace(/ {2,}/g, " ");
  result = result.replace(/,\s*,/g, ",");
  result = result.replace(/\.\s*\./g, ".");
  result = result.trim();

  // 16. Enforce single sentence output
  result = enforceSingleSentence(result);

  // 17. Capitalize first letter
  if (result && /^[a-z]/.test(result)) {
    result = result[0].toUpperCase() + result.slice(1);
  }

  // 18. Enforce strict rules (no contractions, no rhetorical questions, no first-person)
  const surgeryFeatures: SurgeryInputFeatures = {
    hasContractions: features.hasContractions,
    hasFirstPerson: features.hasFirstPerson,
    hasRhetoricalQuestions: features.hasRhetoricalQuestions,
  };
  const ruleResult = enforceStrictRules(originalSent, result, surgeryFeatures);
  result = ruleResult.text;

  // 19. Enforce capitalization
  result = enforceCapitalization(originalSent, result);

  return result;
}

// ── Sentence merge/split for natural variation ──
// Per ~20 sentences: merge 1-2 short pairs, split 2-3 long sentences

const MERGE_CONNECTORS = [
  ", and ", ", but ", ", so ", ", yet ",
  ", which ", ", since ", ", while ", ", as ",
  ", although ", ", particularly ",
];

function ghostProMergeSplit(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";
    const sentences = robustSentenceSplit(p);
    if (sentences.length < 4) return p;

    const ratio = Math.max(1, Math.floor(sentences.length / 20));
    const mergeTarget = Math.max(1, Math.min(2, ratio + (Math.random() < 0.5 ? 1 : 0)));
    const splitTarget = Math.max(2, Math.min(3, ratio + 1 + (Math.random() < 0.5 ? 1 : 0)));

    // Phase 1: Split long sentences (>20 words) at clause boundaries
    let splitsDone = 0;
    const afterSplit: string[] = [];
    for (const sent of sentences) {
      const wc = sent.split(/\s+/).length;
      if (splitsDone < splitTarget && wc > 20 && Math.random() < 0.7) {
        const clausePatterns = [
          /,\s+and\s+/i, /,\s+but\s+/i, /;\s+/,
          /,\s+which\s+/i, /,\s+while\s+/i, /,\s+although\s+/i,
          /,\s+however\s+/i, /,\s+yet\s+/i,
        ];
        let didSplit = false;
        for (const pat of clausePatterns) {
          const m = sent.match(pat);
          if (m && m.index !== undefined) {
            const p1 = sent.slice(0, m.index).trim();
            const p2 = sent.slice(m.index + m[0].length).trim();
            if (p1.split(/\s+/).length >= 10 && p2.split(/\s+/).length >= 10) {
              afterSplit.push(p1.endsWith(".") ? p1 : p1 + ".");
              afterSplit.push(p2[0]?.toUpperCase() + p2.slice(1));
              splitsDone++;
              didSplit = true;
              break;
            }
          }
        }
        if (!didSplit) afterSplit.push(sent);
      } else {
        afterSplit.push(sent);
      }
    }

    // Phase 2: Merge short adjacent sentences (both <15 words)
    let mergesDone = 0;
    const afterMerge: string[] = [];
    let skip = false;
    for (let i = 0; i < afterSplit.length; i++) {
      if (skip) { skip = false; continue; }
      const wc1 = afterSplit[i].split(/\s+/).length;
      const next = afterSplit[i + 1];
      if (next && mergesDone < mergeTarget && wc1 < 15 && wc1 >= 3) {
        const wc2 = next.split(/\s+/).length;
        if (wc2 < 15 && wc2 >= 3 && Math.random() < 0.65) {
          const clean1 = afterSplit[i].replace(/\.\s*$/, "");
          const lower2 = next[0]?.toLowerCase() + next.slice(1);
          const conn = MERGE_CONNECTORS[Math.floor(Math.random() * MERGE_CONNECTORS.length)];
          afterMerge.push(clean1 + conn + lower2);
          mergesDone++;
          skip = true;
          continue;
        }
      }
      afterMerge.push(afterSplit[i]);
    }

    return afterMerge.join(" ");
  }).filter(p => p.trim()).join("\n\n");
}

/**
 * Apply sentence-independent post-processing to full text.
 * Splits into paragraphs → sentences, processes each sentence independently,
 * then recombines.
 */
function sentenceIndependentPostProcess(text: string, features: InputFeatures, strength: string = "light", tone: string = "neutral"): string {
  const paragraphs = text.split(/\n\s*\n/);

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = robustSentenceSplit(p);
    if (sentences.length === 0) return "";

    const processed = sentences.map(sent => {
      const trimmed = sent.trim();
      if (!trimmed || trimmed.split(/\s+/).length < 3) return trimmed;
      return postProcessSingleSentence(trimmed, features, strength, tone);
    }).filter(Boolean);

    // Fragment removal DISABLED — would alter sentence count (1-in=1-out)
    // Sentences must be preserved regardless of length
    const cleaned = processed;

    return (cleaned.length > 0 ? cleaned : processed).join(" ");
  }).filter(Boolean).join("\n\n");
}

// ══════════════════════════════════════════════════════════════════════════
// LLM SYNONYM & PHRASING VALIDATION
// After non-LLM post-processing, the LLM reviews for awkward synonyms
// and unnatural phrasing introduced by dictionary replacements.
// ══════════════════════════════════════════════════════════════════════════

function buildValidationSystemPrompt(): string {
  return `You are a human copy-editor from the 1990s fixing awkward phrasing. Your ONLY job is to fix sentences that sound unnatural due to incorrect synonym choices or awkward word combinations.

RULES:
1. Fix ONLY sentences where a synonym does not fit the context (e.g., "the conflict commenced" → "the conflict began", "they procured food" → "they got food")
2. Fix awkward or ungrammatical phrasing (e.g., "proved to be key to shaped the outcome" → "proved key in shaping the outcome")
3. Fix broken collocations (e.g., "conduct a role" → "play a role")
4. Do NOT change sentences that already read naturally
5. Do NOT add new information, conclusions, or commentary
6. ABSOLUTELY NEVER use these words: utilize, leverage, facilitate, comprehensive, multifaceted, paramount, furthermore, moreover, additionally, consequently, subsequently, nevertheless, underscore, foster, cultivate, pivotal, nuanced, robust, innovative, holistic, transformative, noteworthy, significant, substantial, remarkable, crucial, vital, imperative, encompass, bolster, catalyze, streamline, optimize, mitigate, navigate, prioritize, unprecedented, groundbreaking, delve, embark, harness, spearhead, tapestry, cornerstone, bedrock, linchpin, nexus, realm, landscape, myriad, plethora, enhance, discourse, trajectory, paradigm, framework, methodology, implications, salient, intricate, meticulous, profound, inherent, overarching
7. NEVER use these phrases: "it is important to note", "plays a crucial role", "in today's world", "a wide range of", "due to the fact that", "it is worth noting", "on the other hand", "as a result", "for example,", "for instance,", "there are several", "it is clear that", "when it comes to", "given that", "moving forward", "in light of", "with that in mind", "having said that", "that being said"
8. Use SIMPLE everyday words: "use" not "utilize", "help" not "facilitate", "big" not "significant", "about" not "regarding", "show" not "demonstrate", "start" not "initiate", "need" not "require"
9. Keep the EXACT same number of sentences — do NOT split or merge any sentences
10. Keep ALL paragraph breaks (double newlines) exactly as they are
11. Protect ALL content inside brackets [like this] — copy it exactly
12. CRITICAL: Preserve all placeholder tokens like [[PROT_0]], [[TRM_0]] exactly as-is. Do not remove, modify, or explain them.
13. Write like a real person from the mid-1990s — no modern corporate or tech buzzwords
14. Return ONLY the corrected text — no commentary, no labels`;
}

function buildValidationUserPrompt(text: string): string {
  return `Fix any awkward synonyms or unnatural phrasing in this text. Only change what sounds wrong — leave natural sentences alone. Keep the same sentence count and paragraph structure exactly.

TEXT:
${placeholdersToLLMFormat(text)}`;
}

async function llmValidatePhrasing(text: string, maxTokens: number): Promise<string> {
  try {
    const validated = llmFormatToPlaceholders(await llmCall(
      buildValidationSystemPrompt(),
      buildValidationUserPrompt(text),
      0.3, // Low temperature for conservative fixes
      maxTokens,
    ) ?? '');

    if (!validated || validated.trim().length < text.length * 0.5) {
      console.warn("  [GhostPro]   Validation LLM output too short, skipping");
      return text;
    }

    // Verify sentence count didn't change
    const origSentences = robustSentenceSplit(text);
    const valSentences = robustSentenceSplit(validated.trim());
    if (Math.abs(origSentences.length - valSentences.length) > 2) {
      console.warn(`  [GhostPro]   Validation changed sentence count (${origSentences.length} → ${valSentences.length}), skipping`);
      return text;
    }

    // Verify paragraph count didn't change
    const origParas = text.split(/\n\s*\n/).filter(p => p.trim()).length;
    const valParas = validated.trim().split(/\n\s*\n/).filter(p => p.trim()).length;
    if (origParas !== valParas) {
      console.warn(`  [GhostPro]   Validation changed paragraph count (${origParas} → ${valParas}), skipping`);
      return text;
    }

    return validated.trim();
  } catch (err) {
    console.warn("  [GhostPro]   Validation LLM call failed, skipping:", err);
    return text;
  }
}

// ── LLM Punctuation Cleanup ──
// The LLM reads the text flow and corrects ONLY punctuation and capitalization.
// Strictly prohibited from changing any words.

async function llmFixPunctuation(text: string): Promise<string> {
  const wordCount = text.trim().split(/\s+/).length;
  const maxTokens = Math.min(16384, Math.max(4096, Math.ceil(wordCount * 2)));

  const systemPrompt = `You are a punctuation proofreader. Your ONLY job is to fix punctuation and capitalization errors.

STRICT RULES — YOU MUST FOLLOW ALL OF THEM:
1. DO NOT change, add, remove, or replace ANY word. Every single word must remain exactly as it is.
2. DO NOT reorder words or sentences.
3. DO NOT add or remove sentences.
4. DO NOT add or remove paragraphs.
5. Only fix these punctuation issues:
   - Commas used where periods should be (run-on sentences that should be separate sentences)
   - Missing periods at sentence ends
   - Missing commas where a natural pause exists
   - Double commas, double periods, or other duplicate punctuation
   - Incorrect capitalization after periods/question marks/exclamation marks
   - Missing capitalization at the start of sentences
   - Semicolons or colons used incorrectly
6. Keep paragraph breaks exactly as they are.
7. Return ONLY the corrected text — no commentary, no labels, no explanations.

REMEMBER: You are ONLY allowed to touch punctuation marks (. , ; : ! ? —) and letter capitalization. Do NOT change any word.`;

  const userPrompt = `Fix ONLY the punctuation and capitalization in this text. Do not change any words. Preserve all [[PROT_n]] and [[TRM_n]] tokens exactly.\n\nTEXT:\n${placeholdersToLLMFormat(text)}`;

  try {
    const result = llmFormatToPlaceholders(await llmCall(systemPrompt, userPrompt, 0.1, maxTokens) ?? '');

    if (!result || result.trim().length < text.length * 0.5) {
      console.warn("  [GhostPro]   Punctuation LLM output too short, skipping");
      return text;
    }

    // Verify no words were changed — compare word arrays (ignoring punctuation)
    const stripPunct = (s: string) => s.replace(/[^a-zA-Z\s]/g, "").toLowerCase().split(/\s+/).filter(w => w);
    const origWords = stripPunct(text);
    const fixedWords = stripPunct(result.trim());

    // Allow up to 2% word drift (LLM may accidentally capitalize/lowercase differently)
    const maxDrift = Math.max(3, Math.ceil(origWords.length * 0.02));
    let diffs = 0;
    const minLen = Math.min(origWords.length, fixedWords.length);
    for (let i = 0; i < minLen; i++) {
      if (origWords[i] !== fixedWords[i]) diffs++;
    }
    diffs += Math.abs(origWords.length - fixedWords.length);

    if (diffs > maxDrift) {
      console.warn(`  [GhostPro]   Punctuation LLM changed ${diffs} words (max ${maxDrift}), skipping`);
      return text;
    }

    // Verify paragraph count didn't change
    const origParas = text.split(/\n\s*\n/).filter(p => p.trim()).length;
    const fixedParas = result.trim().split(/\n\s*\n/).filter(p => p.trim()).length;
    if (origParas !== fixedParas) {
      console.warn(`  [GhostPro]   Punctuation LLM changed paragraph count (${origParas} → ${fixedParas}), skipping`);
      return text;
    }

    return result.trim();
  } catch (err) {
    console.warn("  [GhostPro]   Punctuation LLM call failed, skipping:", err);
    return text;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SINGLE CHUNK PIPELINE — process one chunk through all passes
// Each sentence is independently sent to the LLM, then reconnected.
// ══════════════════════════════════════════════════════════════════════════

async function processChunk(
  chunkText: string,
  features: InputFeatures,
  options: { strength: string; tone: string; temperature: number },
): Promise<string> {
  const { strength } = options;
  const chunkWords = chunkText.trim().split(/\s+/).length;
  const isWikiRewrite = options.tone === "wikipedia";

  // ═══════════════════════════════════════════
  // PASS 1: LLM Rewrite
  // Wikipedia mode: PARAGRAPH-LEVEL rewriting + sentence mixing
  // Other modes: PER-SENTENCE independent rewriting
  // ═══════════════════════════════════════════

  const paragraphs = chunkText.split(/\n\s*\n/).filter(p => p.trim());
  let totalSentencesProcessed = 0;
  let result: string;

  if (isWikiRewrite) {
    // ── WIKIPEDIA: Dual-LLM paragraph rewriting + sentence mixing ──
    // STRATEGY: Two different LLM architectures in sequence.
    // Pass 1A: GPT-4o-mini rewrites paragraphs (high quality, smooth output)
    // Pass 1B: Groq/Llama 3.3 70B re-rewrites the GPT-4o-mini output
    // This breaks the single-model token probability signature that neural
    // detectors (GPTZero, Originality, Pangram) are trained to catch.
    // Then mixes in ~35% of original sentences for perplexity burstiness.
    console.log("  [GhostPro]   Pass 1A: GPT-4o-mini paragraph rewrite (wiki mode)...");

    const paragraphSystemPrompt = getWikiParagraphSystemPrompt();

    const rewrittenParagraphs = await Promise.all(paragraphs.map(async (para, pi) => {
      const trimmedPara = para.trim();
      if (isTitleOrHeading(trimmedPara)) return trimmedPara;

      const originalSentences = robustSentenceSplit(trimmedPara);
      if (originalSentences.length === 0) return trimmedPara;

      // Decide which sentences to keep original (for perplexity burstiness)
      // Mix in a small percentage of original sentences to break uniform LLM texture.
      // Keep ~15% of non-first sentences to maintain burstiness without overwhelming
      // the rewrite. Never keep the 1st sentence (most impactful to rewrite).
      const keepOriginal = new Set<number>();
      if (originalSentences.length >= 5) {
        // For longer paragraphs, keep exactly 1 random middle sentence
        const midIdx = 1 + Math.floor(Math.random() * (originalSentences.length - 2));
        keepOriginal.add(midIdx);
      }
      // Random additional keeps at low rate (10%) for remaining sentences
      for (let i = 1; i < originalSentences.length; i++) {
        if (!keepOriginal.has(i) && Math.random() < 0.10) keepOriginal.add(i);
      }

      const paraWords = trimmedPara.split(/\s+/).length;
      const paraTemp = options.temperature + (Math.random() * 0.10 - 0.05);
      const clampedTemp = Math.max(0.3, Math.min(1.0, paraTemp));
      const maxTokens = Math.max(512, Math.ceil(paraWords * 2.5));

      const userPrompt = buildParagraphUserPrompt(
        placeholdersToLLMFormat(trimmedPara),
        features,
        originalSentences.length,
      );

      try {
        let rewrittenPara = llmFormatToPlaceholders(
          await llmCall(paragraphSystemPrompt, userPrompt, clampedTemp, maxTokens) ?? ''
        );
        if (!rewrittenPara || rewrittenPara.trim().length < trimmedPara.length * 0.2) {
          return trimmedPara;
        }

        // ── GPT-4o-mini output is clean; minimal dedup needed ──
        // Still check for rare sentence-count drift
        {
          const rawSentences = robustSentenceSplit(rewrittenPara);
          const seen = new Set<string>();
          const deduped: string[] = [];
          for (const s of rawSentences) {
            const normalized = s.trim().toLowerCase().replace(/\s+/g, ' ');
            if (seen.has(normalized)) continue;
            seen.add(normalized);
            deduped.push(s.trim());
          }
          rewrittenPara = deduped.join(" ");
        }

        // Enforce strict rules on the whole paragraph
        const ruleResult = enforceStrictRules(trimmedPara, rewrittenPara, features as unknown as SurgeryInputFeatures);
        rewrittenPara = ruleResult.text;

        // Now mix in original sentences for burstiness
        if (keepOriginal.size > 0) {
          const rewrittenSentences = robustSentenceSplit(rewrittenPara);
          // Only mix if rewrite produced similar sentence count
          if (Math.abs(rewrittenSentences.length - originalSentences.length) <= 2) {
            for (const keepIdx of keepOriginal) {
              // Map to closest index in rewritten (in case counts differ slightly)
              const mappedIdx = Math.min(keepIdx, rewrittenSentences.length - 1);
              if (mappedIdx >= 0 && mappedIdx < rewrittenSentences.length) {
                rewrittenSentences[mappedIdx] = originalSentences[keepIdx];
              }
            }
            rewrittenPara = rewrittenSentences.join(" ");
          }
        }

        totalSentencesProcessed += originalSentences.length;
        return rewrittenPara;
      } catch (err) {
        console.error(`  [GhostPro] Pass 1A error para ${pi}:`, err);
        return trimmedPara;
      }
    }));

    result = rewrittenParagraphs.join("\n\n");
    console.log(`  [GhostPro]   Pass 1A done: ${result.split(/\s+/).length} words (GPT-4o-mini, ${totalSentencesProcessed} sentences processed)`);

    // ═══════════════════════════════════════════
    // PASS 1B: Groq/Llama sentence-list envelope re-rewrite (second LLM)
    // Sends each paragraph as a numbered sentence list to Groq.
    // Full paragraph context → better pattern disruption than per-sentence.
    // Numbered format → prevents sentence merging/loss.
    // Original (human) sentences marked KEEP → preserves human perplexity.
    // Sequential processing to respect Groq rate limits (12K TPM).
    // ═══════════════════════════════════════════

    const pass1BParagraphs = result.split(/\n\s*\n/).filter(p => p.trim());
    console.log(`  [GhostPro]   Pass 1B: Groq/Llama sentence-list envelope... (P: ${pass1BParagraphs.length})`);

    const groqEnvelopeSystem = `You are a Wikipedia editor. You will receive a numbered list of sentences from a paragraph. For each sentence marked [REWRITE], produce a completely rewritten version using different vocabulary and sentence structure. For sentences marked [KEEP], output them UNCHANGED.

CRITICAL RULES:
1. Output EXACTLY N lines for N input sentences — one sentence per line, numbered (1. 2. 3. etc.)
2. [KEEP] sentences must be returned VERBATIM — do not change even a single word
3. [REWRITE] sentences: AGGRESSIVELY rewrite — change at least 60% of content words, completely restructure clauses, use different sentence openings and grammatical patterns. The rewrite must look like a DIFFERENT PERSON wrote it
4. Each rewritten sentence SHOULD stay within ±25% of the original word count shown in parentheses
5. Preserve ALL citations (Author Year), dates, proper nouns, and placeholder tokens [[PROT_0]] [[TRM_0]] exactly
6. BANNED words: utilize, leverage, delve, tapestry, cornerstone, multifaceted, holistic, synergy, paradigm, trajectory, discourse, comprehensive, furthermore, moreover, additionally, consequently, significantly
7. No contractions. No first person. Third person only. Encyclopedic NPOV tone.
8. Each sentence must be self-contained and grammatically complete
9. Vary sentence length: some shorter (10-14 words), some longer (18-28 words)
10. Do NOT add any commentary, labels, or explanations — only the numbered sentences`;

    const groqResults: string[] = [];

    for (let pi = 0; pi < pass1BParagraphs.length; pi++) {
      const gptPara = pass1BParagraphs[pi].trim();
      if (isTitleOrHeading(gptPara)) {
        groqResults.push(gptPara);
        continue;
      }

      const sentences = robustSentenceSplit(gptPara);
      if (sentences.length === 0) {
        groqResults.push(gptPara);
        continue;
      }

      // Identify which sentences are originals (kept by mixing in Pass 1A)
      const origPara = (paragraphs[pi] ?? '').trim();
      const origSentences = robustSentenceSplit(origPara);
      const origNormalized = new Set(origSentences.map(os => os.trim().toLowerCase().replace(/\s+/g, ' ')));

      // Build numbered sentence list
      const sentenceLines: string[] = [];
      const sentenceLabels: ('keep' | 'rewrite')[] = [];
      for (let si = 0; si < sentences.length; si++) {
        const sent = sentences[si].trim();
        const norm = sent.toLowerCase().replace(/\s+/g, ' ');
        const isOriginal = origNormalized.has(norm);
        const words = sent.split(/\s+/).length;
        const label = isOriginal ? '[KEEP]' : '[REWRITE]';
        sentenceLabels.push(isOriginal ? 'keep' : 'rewrite');
        sentenceLines.push(`${si + 1}. ${label} (${words} words): ${placeholdersToLLMFormat(sent)}`);
      }

      // If all sentences are originals, skip Groq entirely
      if (sentenceLabels.every(l => l === 'keep')) {
        console.log(`  [Groq] Para ${pi}: All keep, skipping.`);
        groqResults.push(gptPara);
        continue;
      }
      
      console.log(`  [Groq] Para ${pi}: ReWrite count = ${sentenceLabels.filter(l => l === 'rewrite').length}`);

      const paraWords = gptPara.split(/\s+/).length;
      const paraTemp = Math.max(0.7, Math.min(1.05, options.temperature + 0.05));
      const maxTokens = Math.max(512, Math.ceil(paraWords * 2.5));

      const groqUserPrompt = `Rewrite this paragraph's ${sentences.length} sentences:\n\n${sentenceLines.join('\n')}`;

      try {
    const rawOutput = await groqCall(groqEnvelopeSystem, groqUserPrompt, paraTemp, maxTokens) ?? '';
        console.log(`  [Groq] Paragraph ${pi} raw output lengths: ${rawOutput.length} chars`);
        
        // Parse numbered output lines
        const outputLines = rawOutput.split('\n')
          .map(l => l.trim())
          .filter(l => /^\d+[\.\)]\s/.test(l))
          .map(l => l.replace(/^\d+[\.\)]\s*/, '').trim());

        if (outputLines.length < sentences.length - 1) {
          // Groq didn't return enough lines — keep GPT version
          console.warn(`  [Groq] Para ${pi}: expected ${sentences.length} lines, got ${outputLines.length} — keeping Pass 1A`);
          groqResults.push(gptPara);
          continue;
        }

        // Merge: use Groq output for REWRITE sentences, original for KEEP sentences
        const mergedSentences: string[] = [];
        for (let si = 0; si < sentences.length; si++) {
          if (sentenceLabels[si] === 'keep') {
            // Always use the original sentence regardless of what Groq returned
            mergedSentences.push(sentences[si].trim());
          } else if (si < outputLines.length) {
            let groqSent = llmFormatToPlaceholders(outputLines[si]);
            groqSent = groqSent.replace(/^\[(?:REWRITE|KEEP)\]\s*/i, '');
            groqSent = groqSent.replace(/^\(\d+ words\):?\s*/i, '');
            groqSent = groqSent.replace(/^(Here is|Rewritten|Output|Result):?\s*/i, '');
            groqSent = enforceSingleSentence(groqSent);
            
            // Validate word count didn't drift too much
            const origWords = sentences[si].split(/\s+/).length;
            const groqWords = groqSent.split(/\s+/).length;
            if (groqWords < origWords * 0.5 || groqWords > origWords * 1.8 || groqSent.length < 10) {
              mergedSentences.push(sentences[si].trim()); // Too much drift, keep GPT
            } else {
              mergedSentences.push(groqSent);
            }
          } else {
            mergedSentences.push(sentences[si].trim()); // No corresponding output
          }
        }

        groqResults.push(mergedSentences.join(" "));
      } catch {
        groqResults.push(gptPara); // On error, keep GPT version
      }
    }

    result = groqResults.join("\n\n");
    console.log(`  [GhostPro]   Pass 1B done: ${result.split(/\s+/).length} words (Groq/Llama, dual-LLM rewrite complete)`);

  } else {
    // ── OTHER MODES: Per-sentence independent LLM rewriting ──
    console.log("  [GhostPro]   Pass 1: Per-sentence LLM rewrite...");

    const sentenceSystemPrompt = getSentenceSystemPrompt(options.tone);

    const rewrittenParagraphs = await Promise.all(paragraphs.map(async (para) => {
      const trimmedPara = para.trim();
      if (isTitleOrHeading(trimmedPara)) return trimmedPara;

      const sentences = robustSentenceSplit(trimmedPara);
      if (sentences.length === 0) return trimmedPara;

      const rewritePromises = sentences.map(async (sent, idx) => {
        const trimmed = sent.trim();
        if (!trimmed || trimmed.split(/\s+/).length < 3) return trimmed;
        if (isTitleOrHeading(trimmed)) return trimmed;

        const prevSent = idx > 0 ? sentences[idx - 1] : null;
        const nextSent = idx < sentences.length - 1 ? sentences[idx + 1] : null;

        const userPrompt = buildSentenceUserPrompt(
          placeholdersToLLMFormat(trimmed),
          prevSent ? placeholdersToLLMFormat(prevSent) : null,
          nextSent ? placeholdersToLLMFormat(nextSent) : null,
          features,
        );

        const sentTemp = options.temperature + (Math.random() * 0.14 - 0.07);
        const clampedTemp = Math.max(0.3, Math.min(1.0, sentTemp));
        const sentMaxTokens = Math.max(256, Math.ceil(trimmed.split(/\s+/).length * 3));

        try {
          let rewritten = llmFormatToPlaceholders(
            await llmCall(sentenceSystemPrompt, userPrompt, clampedTemp, sentMaxTokens) ?? ''
          );
          if (!rewritten || rewritten.trim().length < trimmed.length * 0.2) {
            return trimmed;
          }
          rewritten = rewritten.replace(/^\[TARGET\]:\s*/i, "").trim();
          rewritten = enforceSingleSentence(rewritten);
          const ruleResult = enforceStrictRules(trimmed, rewritten, features as unknown as SurgeryInputFeatures);
          rewritten = ruleResult.text;
          rewritten = enforceCapitalization(trimmed, rewritten);
          return rewritten;
        } catch {
          return trimmed;
        }
      });

      const rewrittenSentences = await Promise.all(rewritePromises);
      totalSentencesProcessed += rewrittenSentences.length;
      return rewrittenSentences.join(" ");
    }));

    result = rewrittenParagraphs.join("\n\n");
    console.log(`  [GhostPro]   Pass 1 done: ${result.split(/\s+/).length} words (${totalSentencesProcessed} sentences processed independently)`);
  }

  // ═══════════════════════════════════════════
  // PASS 2: SENTENCE-INDEPENDENT Post-processing
  // Each sentence is processed as its own independent chunk through ALL transforms.
  // ═══════════════════════════════════════════
  console.log("  [GhostPro]   Pass 2: Sentence-independent post-processing...");

  // Single deep post-processing pass
  result = sentenceIndependentPostProcess(result, features, strength, options.tone);
  console.log(`  [GhostPro]   Post-processing done at strength=${strength}`);

  // Per-sentence polish and n-gram de-repeat — prevent bulk operations from splitting sentences
  {
    const polishParas = result.split(/\n\s*\n/).filter(p => p.trim());
    result = polishParas.map(para => {
      const sents = robustSentenceSplit(para.trim());
      return sents.map(s => {
        let fixed = deRepeatNgrams(s);
        fixed = finalPolish(fixed);
        fixed = enforceSingleSentence(fixed);
        return fixed;
      }).join(" ");
    }).join("\n\n");
  }

  // ═══════════════════════════════════════════
  // PASS 3: DETECTOR FEEDBACK LOOP
  // Analyze with detector, apply per-sentence anti-detection + deep cleaning
  // until scores drop or we hit the iteration cap.
  // Wikipedia mode: skip entirely — internal detector is unreliable, LLM prompt handles style
  // ═══════════════════════════════════════════
  const isWikiMode = options.tone === "wikipedia";
  const maxFeedbackPasses = isWikiMode ? 1 : 1;
  const targetAiScore = strength === "strong" ? 15 : strength === "medium" ? 25 : 35;

  for (let fbPass = 0; fbPass < maxFeedbackPasses; fbPass++) {
    const fbSignals = analyzeSignals(result);
    const fbAiScore = fbSignals.ai_pattern_score ?? 50;
    const fbUniformity = fbSignals.sentence_uniformity ?? 50;
    const fbPerSentAI = fbSignals.per_sentence_ai_ratio ?? 50;

    // Check multiple signals — real detectors weight all of these
    const needsFix = fbAiScore > targetAiScore ||
      fbUniformity > (targetAiScore + 15) ||
      fbPerSentAI > (targetAiScore + 10);

    if (!needsFix) {
      console.log(`  [GhostPro]   Pass 3: Signals OK (ai=${fbAiScore.toFixed(1)}, uniform=${fbUniformity.toFixed(1)}, perSentAI=${fbPerSentAI.toFixed(1)}) after ${fbPass} feedback passes`);
      break;
    }
    console.log(`  [GhostPro]   Pass 3 feedback ${fbPass + 1}/${maxFeedbackPasses}: ai=${fbAiScore.toFixed(1)}, uniform=${fbUniformity.toFixed(1)}, perSentAI=${fbPerSentAI.toFixed(1)} — applying fixes...`);

    // Per-sentence anti-detection: scores each sentence and applies targeted fixes
    const fbParas = result.split(/\n\s*\n/).filter(p => p.trim());
    result = fbParas.map(para => {
      const sents = robustSentenceSplit(para.trim());
      if (sents.length === 0) return para;
      const fixed = perSentenceAntiDetection(sents, features.hasContractions);
      return fixed.join(" ");
    }).join("\n\n");

    // Deep cleaning pass: removes residual AI patterns at word/phrase level
    const dcParas = result.split(/\n\s*\n/).filter(p => p.trim());
    result = dcParas.map(para => {
      const sents = robustSentenceSplit(para.trim());
      if (sents.length === 0) return para;
      const cleaned = deepCleaningPass(sents);
      return cleaned.join(" ");
    }).join("\n\n");

    // Re-polish per-sentence after fixes
    const polParas = result.split(/\n\s*\n/).filter(p => p.trim());
    result = polParas.map(para => {
      const sents = robustSentenceSplit(para.trim());
      return sents.map(s => enforceSingleSentence(finalPolish(s))).join(" ");
    }).join("\n\n");
  }

  // Final constraint pass
  if (!features.hasContractions) result = removeContractions(result);
  if (!features.hasFirstPerson) result = removeFirstPerson(result);
  if (!features.hasRhetoricalQuestions) result = removeRhetoricalQuestions(result);

  // Word count enforcement DISABLED — was dropping whole sentences and corrupting output
  // The LLM prompt already constrains word count, and enforcePerParagraphSentenceCounts
  // handles structural integrity at the end.

  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN PIPELINE — ghostProHumanize()
// ══════════════════════════════════════════════════════════════════════════

export async function ghostProHumanize(
  text: string,
  options: {
    strength?: string;
    tone?: string;
    strictMeaning?: boolean;
    enablePostProcessing?: boolean;
  } = {},
): Promise<string> {
  if (!text?.trim()) return text;

  const {
    strength = "medium",
    tone = "neutral",
  } = options;

  const start = Date.now();
  console.log("  [GhostPro] Starting Ghost Pro v3 pipeline...");

  const original = text.trim();
  const features = detectInputFeatures(original);

  // Wikipedia mode: force encyclopedic constraints regardless of input
  if (tone === "wikipedia") {
    features.hasContractions = false;
    features.hasFirstPerson = false;
    features.hasRhetoricalQuestions = false;
  }

  console.log(`  [GhostPro] Input: ${features.wordCount} words, ${features.paragraphCount} paras`);
  console.log(`  [GhostPro] Features: contractions=${features.hasContractions}, firstPerson=${features.hasFirstPerson}, rhetoricalQs=${features.hasRhetoricalQuestions}`);

  // Rephrase ~30% of end-of-sentence citations for natural variation
  const citationText = rephraseCitations(original);

  // Protect special content
  const { text: protectedText0, map: protectionMap } = protectSpecialContent(citationText);

  // Protect content terms (proper nouns, domain phrases) from synonym swaps
  const { text: protectedText, map: termMap } = protectContentTerms(protectedText0);

  // Capture input paragraph count for enforcement at end
  const inputParas = original.split(/\n\s*\n/).filter(p => p.trim());
  const inputParagraphCount = inputParas.length;

  // Capture per-paragraph sentence counts for strict 1:1 enforcement
  const inputSentenceCountsPerPara = inputParas.map(p => robustSentenceSplit(p.trim()).length);

  // Capture input sentence count for strict enforcement (input = output)
  const inputSentenceCount = countSentences(protectedText);

  const tempMap: Record<string, number> = { light: 0.72, medium: 0.82, strong: 0.92 };
  let temperature = tempMap[strength] ?? 0.72;
  // Wikipedia mode: higher temperature for more unpredictable rewriting
  if (tone === "wikipedia") {
    temperature = Math.min(temperature + 0.12, 0.98);
  }
  // Short texts need higher temperature for more unpredictable word choices
  if (features.wordCount < 300) {
    temperature = Math.min(temperature + 0.10, 0.98);
  }

  // ═══════════════════════════════════════════
  // PRE-HUMANIZATION: Sentence Merge/Split Surgery — DISABLED
  // Strict 1-in=1-out per-sentence processing means we cannot alter sentence count.
  // The LLM per-sentence prompt already creates length variation.
  // ═══════════════════════════════════════════
  const surgeryText = protectedText;

  // ═══════════════════════════════════════════
  // CHUNK PROCESSING
  // ═══════════════════════════════════════════
  const chunks = splitIntoChunks(surgeryText);
  let result: string;

  if (chunks.length === 1) {
    // Single chunk — standard path
    console.log("  [GhostPro] Processing as single chunk...");
    result = await processChunk(surgeryText, features, { strength, tone, temperature });
  } else {
    // Multi-chunk path
    console.log(`  [GhostPro] Splitting into ${chunks.length} chunks for processing...`);
    const processedChunks = await Promise.all(chunks.map(async (chunk, i) => {
      const chunkWords = chunk.trim().split(/\s+/).length;
      console.log(`  [GhostPro] Processing chunk ${i + 1}/${chunks.length} (${chunkWords} words)...`);
      return processChunk(chunk, features, { strength, tone, temperature });
    }));

    result = processedChunks.join("\n\n");
    console.log(`  [GhostPro] All ${chunks.length} chunks processed, merged.`);

    // Run a light cross-chunk polish to smooth seams — per-sentence
    {
      const cpParas = result.split(/\n\s*\n/).filter(p => p.trim());
      result = cpParas.map(para => {
        const sents = robustSentenceSplit(para.trim());
        return sents.map(s => enforceSingleSentence(finalPolish(s))).join(" ");
      }).join("\n\n");
    }

    // Final constraint pass on merged result
    if (!features.hasContractions) result = removeContractions(result);
    if (!features.hasFirstPerson) result = removeFirstPerson(result);
    if (!features.hasRhetoricalQuestions) result = removeRhetoricalQuestions(result);
  }

  // ── Final punctuation & capitalization cleanup (non-LLM) ──
  result = fixPunctuation(result);

  // ── LLM phrasing validation & punctuation REMOVED ──
  // These were full-text LLM calls that could expand 1 sentence into multiple.
  // Per-sentence LLM rewrite in processChunk already handles quality.
  // Non-LLM fixPunctuation above handles punctuation/capitalization safely.
  console.log("  [GhostPro] Skipping full-text LLM validation (per-sentence LLM already applied).");

  // Final capitalization enforcement
  result = enforceCapitalization(original, result);

  // Merge/split DISABLED — strict sentence count enforcement: input = output

  // ── Strict sentence count enforcement ── DISABLED: 1-in=1-out enforced per-sentence
  // result = enforceSentenceCountStrict(result, inputSentenceCount);
  console.log(`  [GhostPro] Sentence count: target=${inputSentenceCount}, actual=${countSentences(result)}`);

  // ── Restore protected content terms ──
  result = restoreContentTerms(result.trim(), termMap);

  // ── Restore protected special content ──
  result = restoreSpecialContent(result.trim(), protectionMap);

  // ── Enforce paragraph count 1:1 with input ──
  result = enforceParagraphCount(result, inputParagraphCount);
  console.log(`  [GhostPro] Paragraph enforcement: target=${inputParagraphCount}, actual=${result.split(/\n\s*\n/).filter(p => p.trim()).length}`);

  // ── Final repetition cleanup — DISABLED: would alter sentence count ──
  // result = cleanOutputRepetitions(result);

  // ── STRICT 1:1 per-paragraph sentence count enforcement ──
  result = enforcePerParagraphSentenceCounts(result, inputSentenceCountsPerPara, "GhostPro");

  // ── Clean bad sentence starters (And, By, But, etc.) per paragraph ──
  {
    const paras = result.split(/\n\s*\n/).filter(p => p.trim());
    result = paras.map(p => {
      const sents = robustSentenceSplit(p.trim());
      return cleanSentenceStarters(sents).join(" ");
    }).join("\n\n");
  }

  // ── DETECTOR FEEDBACK LOOP — re-run post-processing if AI score > 15% ──
  // Wikipedia mode: skip — internal detector is unreliable for encyclopedic text
  if (tone !== "wikipedia") {
  try {
    const detector = getDetector();
    for (let feedbackRound = 0; feedbackRound < 2; feedbackRound++) {
      const detection = detector.analyze(result);
      const aiScore = detection.summary.overall_ai_score;
      if (aiScore <= 15) break;
      console.log(`  [GhostPro] Detector feedback round ${feedbackRound + 1}: AI score ${aiScore.toFixed(1)}% — re-running post-processing`);

      // Per-sentence re-processing — apply AI word kill to each sentence independently
      const fbParas = result.split(/\n\s*\n/).filter(p => p.trim());
      result = fbParas.map(para => {
        const sents = robustSentenceSplit(para.trim());
        return sents.map(s => {
          let fixed = applyAIWordKill(s);
          if (!features.hasContractions) fixed = expandContractions(fixed);
          if (!features.hasFirstPerson) fixed = removeFirstPerson(fixed);
          fixed = fixPunctuation(fixed);
          return fixed;
        }).join(" ");
      }).join("\n\n");
    }
  } catch {
    // Detector failure is non-fatal
  }
  }

  // ── Safety net: fix doubled subordinate conjunctions ("when when", "since since") ──
  result = result.replace(/\b(when|since|though|although|because|while|if|unless|after|before|until|once)\s+\1\b/gi, "$1");

  // ── Final diagnostic ──
  const outputWordCount = result.split(/\s+/).length;
  const outputSentences = robustSentenceSplit(result);
  const avgSentLen = outputSentences.length > 0 ? outputWordCount / outputSentences.length : 0;
  const sentLengths = outputSentences.map(s => s.split(/\s+/).length);
  const sentMean = sentLengths.length > 0 ? sentLengths.reduce((a, b) => a + b, 0) / sentLengths.length : 0;
  const sentVar = sentLengths.length > 0 ? sentLengths.reduce((a, l) => a + (l - sentMean) ** 2, 0) / sentLengths.length : 0;
  const burstinessCV = Math.sqrt(sentVar) / Math.max(sentMean, 1);

  const finalSignals = analyzeSignals(result);
  const meaningScore = semanticSimilaritySync(original, result);
  const elapsed = (Date.now() - start) / 1000;

  console.log(`  [GhostPro] Output: ${outputWordCount} words, ${outputSentences.length} sentences`);
  console.log(`  [GhostPro] Burstiness CV: ${burstinessCV.toFixed(3)}, avg sent: ${avgSentLen.toFixed(1)}`);
  console.log(`  [GhostPro] Sentence lengths: [${sentLengths.join(", ")}]`);
  console.log(`  [GhostPro] Final signals: burst=${finalSignals.burstiness.toFixed(1)}, ai_pat=${finalSignals.ai_pattern_score.toFixed(1)}, uniform=${finalSignals.sentence_uniformity.toFixed(1)}, starter=${finalSignals.starter_diversity.toFixed(1)}, perplex=${finalSignals.perplexity.toFixed(1)}`);
  console.log(`  [GhostPro] Meaning similarity: ${meaningScore.toFixed(2)}`);
  console.log(`  [GhostPro] Complete in ${elapsed.toFixed(1)}s`);

  // ── Post-humanize sentence verification ──
  const verification = verifySentencePresence(text, result, robustSentenceSplit);
  if (!verification.verified) {
    console.warn(`  [GhostPro] Sentence verification: input=${verification.inputCount}, output=${verification.outputCount}`);
    if (verification.missingKeywords.length > 0) {
      console.warn(`  [GhostPro] Missing keywords: ${verification.missingKeywords.join(", ")}`);
    }
  }

  // Strip unicode replacement characters (U+FFFD)
  result = result.replace(/\ufffd/g, "");

  // Final validation: fix capitalization + sentence formatting
  const validated = validateAndRepairOutput(original, result);
  result = validated.text;

  return result;
}
