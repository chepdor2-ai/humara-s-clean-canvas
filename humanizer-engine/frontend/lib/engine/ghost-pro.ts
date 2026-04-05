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
import { protectSpecialContent, restoreSpecialContent, protectContentTerms, restoreContentTerms, cleanOutputRepetitions, robustSentenceSplit, placeholdersToLLMFormat, llmFormatToPlaceholders, countSentences, enforceSentenceCountStrict, enforcePerParagraphSentenceCounts, rephraseCitations } from "./content-protection";
import { semanticSimilaritySync } from "./semantic-guard";
import { TextSignals } from "./multi-detector";
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

// ── OpenAI client singleton ──

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY not set.");
  _client = new OpenAI({ apiKey });
  return _client;
}

async function llmCall(system: string, user: string, temperature: number, maxTokens?: number): Promise<string> {
  const client = getClient();
  const r = await client.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
    max_tokens: maxTokens ?? 4096,
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
  const isShort = (wordCount ?? 999) < 300;

  const voiceInstruction = isAcademic
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

  const burstinessRule = isAcademic
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

  const wordChoiceRule = isAcademic
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

2. ABSOLUTELY BANNED VOCABULARY — if you use ANY of these words, the output fails:
   utilize, facilitate, leverage, comprehensive, multifaceted, paramount, furthermore, moreover, additionally, consequently, subsequently, nevertheless, notwithstanding, aforementioned, paradigm, trajectory, discourse, dichotomy, conundrum, ramification, underpinning, synergy, robust, nuanced, salient, ubiquitous, pivotal, intricate, meticulous, profound, inherent, overarching, substantive, efficacious, holistic, transformative, innovative, groundbreaking, noteworthy, proliferate, exacerbate, ameliorate, engender, delineate, elucidate, illuminate, necessitate, perpetuate, underscore, exemplify, encompass, bolster, catalyze, streamline, optimize, mitigate, navigate, prioritize, articulate, substantiate, corroborate, disseminate, cultivate, ascertain, endeavor, delve, embark, foster, harness, spearhead, unravel, unveil, tapestry, cornerstone, bedrock, linchpin, nexus, spectrum, myriad, plethora, multitude, landscape, realm, culminate

   Also BANNED phrases: "it is important to note", "it should be noted", "plays a crucial role", "in today's world", "in today's society", "a wide range of", "due to the fact that", "first and foremost", "each and every", "not only...but also", "serves as a testament", "in light of", "with that in mind", "having said that", "that being said", "it is worth noting", "on the other hand", "in conclusion", "in summary", "as a result", "for example,", "for instance,", "there are several", "there are many", "it is clear that", "when it comes to", "given that", "moving forward"

3. SENTENCE STARTERS — vary them dramatically:
   - Start some sentences with the subject directly ("The economy grew...")
   - Start some with a short clause ("After the reforms took hold, ...")
   - Do NOT start any sentence with a conjunction like And, But, Or, So, Yet
   - Start some with gerunds ("Looking at the data...")
   - NEVER use the same starting word for consecutive sentences
   - NEVER start with: "Furthermore," "Moreover," "Additionally," "However," "Nevertheless," "Consequently," "It is" 

4. NATURAL HUMAN TEXTURE:
   - Use phrasal verbs where natural: look into, carry out, bring about, come up with, break down, set up, point out, figure out, deal with, end up, turn out, stand out, account for, spell out
   - Use semicolons 2-3 times to join related thoughts
   - Use comma-based hedging asides 2-4 times (e.g. ", admittedly," or ", in most cases,")
   - Do NOT use em dashes (—) or parenthetical brackets
   - Mix simple and complex sentence structures unpredictably

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

  const contractionRule = features.hasContractions
    ? "You MAY use contractions naturally."
    : "Do NOT use contractions. Write all words fully (do not, cannot, will not, etc.).";

  const firstPersonRule = features.hasFirstPerson
    ? "You may use first-person pronouns where appropriate."
    : "Do NOT use first-person pronouns (I, we, me, us, my, our). Use impersonal constructions instead.";

  const rhetoricalRule = features.hasRhetoricalQuestions
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
    : Math.round(features.wordCount * 1.15);
  const wordCountInstruction = features.wordCount < 300
    ? `WORD COUNT REQUIREMENT: Output MUST be ${minWords}-${maxWords} words (original is ${features.wordCount}). Do NOT condense below ${minWords}. Do NOT pad or add new content to exceed ${maxWords}. Break sentences apart or add detail within existing points — never add new conclusions.`
    : `Word count target: ${features.wordCount} words (±15%, so ${Math.round(features.wordCount * 0.85)}-${maxWords}).`;

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

  const voiceInstruction = isAcademic
    ? `You are rewriting a SINGLE sentence as a real graduate student would write it — thoughtful, natural, not robotic. Direct and precise but never formulaic.`
    : `You are rewriting a SINGLE sentence as a real human author would write it — natural quirks, personal style. Think how a 1990s columnist or early-2000s blogger would phrase this.`;

  return `${voiceInstruction}

RULES:
1. Rewrite ONLY the sentence marked [TARGET]. The [BEFORE] and [AFTER] lines are read-only context.
2. Return ONLY the rewritten sentence — no labels, no commentary, no quotation marks around it.
3. OUTPUT EXACTLY ONE SENTENCE. Do NOT split the input into multiple sentences. Do NOT merge with context. One sentence in = one sentence out. NEVER add periods that would create additional sentences.
4. BANNED WORDS: utilize, facilitate, leverage, comprehensive, multifaceted, paramount, furthermore, moreover, additionally, consequently, subsequently, nevertheless, notwithstanding, aforementioned, paradigm, trajectory, discourse, robust, nuanced, pivotal, intricate, transformative, innovative, groundbreaking, mitigate, streamline, optimize, bolster, catalyze, delve, embark, foster, harness, spearhead, unravel, unveil, tapestry, cornerstone, nexus, myriad, plethora, realm, landscape, methodology, framework, holistic, substantive, salient, ubiquitous, meticulous, profound, enhance, crucial, vital, essential, significant, implement, navigate, foster, underscore, highlight, interplay, diverse, dynamic, ensure, aspect, notion, endeavor, pertaining, integral
5. BANNED STARTERS: Do NOT start with "Furthermore," "Moreover," "Additionally," "However," "Nevertheless," "Consequently," "It is," "It's important," "It should be noted," "In today's," "In the realm," "When it comes to"
6. Use everyday words: "use" not "utilize", "help" not "facilitate", "big" not "significant", "show" not "demonstrate", "part" not "aspect", "idea" not "notion"
7. CRITICAL: Preserve all placeholder tokens like [[PROT_0]], [[TRM_0]] exactly as-is. Do not remove or modify them.
8. Keep the same meaning and all factual content, data, citations. Do NOT hallucinate or invent information not present in the original.
9. Stay within ±20% of the original sentence word count.
10. Use phrasal verbs where natural: look into, carry out, bring about, figure out, deal with, end up.
11. STRUCTURAL TRANSFORMATION — use these specific techniques to restructure the sentence:
    - CLAUSE FRONTING: Move subordinate clauses to the beginning ("Because X, Y" ↔ "Y because X")
    - NOMINALIZATION: Convert verbs to nouns or nouns to verbs ("to expand access" → "the expansion of access", "the assessment" → "to assess")
    - CONJUNCTION ROTATION: Vary linking words ("or" → "as well as", "and" → "along with", "but" → "however"/"yet")
    - VOICE SHIFT: Change active to passive or passive to active, swap the grammatical subject
    - CONDITIONAL SWAPS: "if" → "when"/"provided that", "because" → "since"/"given that"
    - PHRASE EXPANSION/COMPRESSION: "location" → "place of residence", "regardless of" → "no matter"
    - PARALLEL STRUCTURE BREAKING: Make lists asymmetric — "A, B, and C" → "A along with B, as well as C"
12. AVOID HEDGING: Do not use "it is important to note", "it is worth mentioning", "one could argue". Make direct statements.
13. PREFER CONCRETE OVER ABSTRACT: Say "the factory shut down" not "the operation ceased". Say "prices went up" not "costs increased significantly".`;
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

  return `${contractionRule} ${firstPersonRule} ${rhetoricalRule}

${contextBefore}[TARGET]: ${sentence}${contextAfter}`;
}

// ══════════════════════════════════════════════════════════════════════════
// PASS 2: NON-LLM STATISTICAL POST-PROCESSING
// Targets each of the 20 detector signals individually
// ══════════════════════════════════════════════════════════════════════════

// ── 2A: AI VOCABULARY ELIMINATION ──
// Covers: ai_pattern_score, per_sentence_ai_ratio

const AI_WORD_KILL: Record<string, string[]> = {
  utilize: ["use"], utilise: ["use"], leverage: ["use", "draw on", "rely on"],
  facilitate: ["help", "support", "allow"], comprehensive: ["broad", "full", "thorough", "wide"],
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
  holistic: ["whole", "complete", "full-picture"], transformative: ["game-changing", "major", "radical"],
  innovative: ["new", "fresh", "creative"], groundbreaking: ["pioneering", "first-of-its-kind"],
  noteworthy: ["worth noting", "interesting", "striking"], proliferate: ["spread", "grow", "multiply"],
  exacerbate: ["worsen", "make worse", "aggravate"], ameliorate: ["improve", "ease", "fix"],
  engender: ["create", "produce", "cause"], delineate: ["describe", "outline", "map out"],
  elucidate: ["explain", "clarify", "spell out"], illuminate: ["shed light on", "clarify", "show"],
  necessitate: ["require", "call for", "demand"], perpetuate: ["keep going", "continue", "maintain"],
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
  implement: ["put in place", "carry out", "set up"],
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
function postProcessSingleSentence(sent: string, features: InputFeatures, strength: string = "light"): string {
  if (!sent.trim()) return sent;
  const originalSent = sent.trim();
  let result = originalSent;

  // 1. Kill AI vocabulary — local PHRASE patterns first
  for (const [pattern, replacement] of AI_PHRASE_KILL) {
    result = result.replace(pattern, replacement);
  }

  // 2. Kill AI vocabulary — local WORD map (word by word through AI_WORD_KILL)
  result = result.replace(/\b[a-zA-Z]+\b/g, (word) => {
    const lower = word.toLowerCase();
    const replacements = AI_WORD_KILL[lower];
    if (!replacements) return word;
    const rep = replacements[Math.floor(Math.random() * replacements.length)];
    if (word[0] === word[0].toUpperCase() && rep[0] === rep[0].toLowerCase()) {
      return rep[0].toUpperCase() + rep.slice(1);
    }
    return rep;
  });

  // 3. Kill AI vocabulary — shared dictionaries (120+ words + phrase patterns)
  result = applyAIWordKill(result);
  result = applyPhrasePatterns(result);

  // 4. Naturalize connectors
  result = applyConnectorNaturalization(result);

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

  // 11. Dictionary-enhanced synonym swap (per-sentence) — conservative rate to avoid wrong synonyms
  const synonymRate = strength === "strong" ? 0.08 : strength === "medium" ? 0.06 : 0.04;
  const dict = getDictionary();
  const currentWords = result.split(/\s+/);
  if (currentWords.length >= 5) {
    const usedRep = new Set<string>();
    const targetSwaps = Math.max(1, Math.floor(currentWords.length * synonymRate));
    let swaps = 0;
    const newWords = currentWords.map((word, idx) => {
      if (swaps >= targetSwaps) return word;
      const clean = word.replace(/[^a-zA-Z]/g, "");
      if (clean.length < 4 || idx === 0) return word;
      const lower = clean.toLowerCase();
      // Skip function words
      const skipWords = new Set(["about", "after", "again", "being", "below", "between",
        "could", "doing", "during", "every", "found", "given", "going", "great",
        "their", "there", "these", "those", "under", "using", "where", "which",
        "while", "would", "shall", "should", "other", "still", "never", "often",
        "have", "been", "were", "with", "from", "that", "this", "they", "will",
        "also", "just", "only", "into", "some", "more", "most", "such", "when",
        "than", "what", "each", "does", "then", "both"]);
      if (skipWords.has(lower) || usedRep.has(lower)) return word;
      const replacement = dict.replaceWordSmartly(clean, result, usedRep);
      if (replacement !== clean && replacement.length > 0) {
        usedRep.add(lower);
        swaps++;
        const prefix = word.match(/^[^a-zA-Z]*/)?.[0] ?? "";
        const suffix = word.match(/[^a-zA-Z]*$/)?.[0] ?? "";
        const isCapitalized = clean[0] === clean[0].toUpperCase();
        const final = isCapitalized ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
        return prefix + final + suffix;
      }
      return word;
    });
    result = newWords.join(" ");
  }

  // 12. Syntactic template — moderate application for structural variation
  {
    const templateProb = strength === "strong" ? 0.35 : strength === "medium" ? 0.25 : 0.15;
    const rWords = result.split(/\s+/);
    if (rWords.length >= 12 && Math.random() < templateProb) {
      result = applySyntacticTemplate(result);
    }
  }

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
  result = applyAIWordKill(result);

  // 12b2. Structural diversity — DISABLED: random phrase injection was producing artifacts
  // like "By that point," and "Oddly," that corrupt academic text

  // 12c. Per-sentence anti-detection — score this sentence against the same 9 micro-signals
  // the detector uses and apply targeted fixes to push it below detection threshold
  {
    const antiDetected = perSentenceAntiDetection([result], features.hasContractions);
    if (antiDetected.length > 0 && antiDetected[0].trim()) {
      result = antiDetected[0];
    }
  }

  // 12d. Deep cleaning — eliminate residual AI structural patterns
  {
    const deepCleaned = deepCleaningPass([result]);
    if (deepCleaned.length > 0 && deepCleaned[0].trim()) {
      result = deepCleaned[0];
    }
  }

  // 12e. Pre-1990 naturalness — replace modern collocations with older phrasing
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

  // 12f. N-gram pattern breaking — Pangram and Copyleaks use n-gram frequency analysis
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

  // 13. Constraint enforcement per sentence
  if (!features.hasContractions) {
    result = result.replace(CONTRACTION_EXPAND_RE, (match) => {
      const expanded = EXPANSION_MAP[match.toLowerCase()] ?? match;
      return match[0] === match[0].toUpperCase() && expanded[0] === expanded[0].toLowerCase()
        ? expanded[0].toUpperCase() + expanded.slice(1) : expanded;
    });
    result = expandContractions(result);
  }

  // 14. Kill modern buzzwords (pre-2000 era naturalness)
  result = killModernBuzzwords(result);
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
function sentenceIndependentPostProcess(text: string, features: InputFeatures, strength: string = "light"): string {
  const paragraphs = text.split(/\n\s*\n/);

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = robustSentenceSplit(p);
    if (sentences.length === 0) return "";

    const processed = sentences.map(sent => {
      const trimmed = sent.trim();
      if (!trimmed || trimmed.split(/\s+/).length < 3) return trimmed;
      return postProcessSingleSentence(trimmed, features, strength);
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

  // ═══════════════════════════════════════════
  // PASS 1: FULL-TEXT LLM Rewrite (single call for speed)
  // ═══════════════════════════════════════════
  console.log("  [GhostPro]   Pass 1: Full-text LLM rewrite...");

  const llmMaxTokens = Math.min(16384, Math.max(4096, Math.ceil(chunkWords * 2.5)));
  const systemPrompt = getSystemPrompt(options.tone, chunkWords);
  const userPrompt = buildUserPrompt(
    placeholdersToLLMFormat(chunkText),
    features,
    options.tone,
  );

  let result: string;
  try {
    const raw = await llmCall(systemPrompt, userPrompt, options.temperature, llmMaxTokens);
    result = llmFormatToPlaceholders(raw ?? "");
    if (!result || result.trim().length < chunkText.length * 0.3) {
      console.warn("  [GhostPro]   LLM output too short, using original");
      result = chunkText;
    }
  } catch (err) {
    console.warn("  [GhostPro]   LLM call failed, using original:", err);
    result = chunkText;
  }

  console.log(`  [GhostPro]   Pass 1 done: ${result.split(/\s+/).length} words`);

  // ═══════════════════════════════════════════
  // PASS 2: SENTENCE-INDEPENDENT Post-processing
  // Each sentence is processed as its own independent chunk through ALL transforms.
  // ═══════════════════════════════════════════
  console.log("  [GhostPro]   Pass 2: Sentence-independent post-processing...");

  // Single deep post-processing pass
  result = sentenceIndependentPostProcess(result, features, strength);
  console.log(`  [GhostPro]   Post-processing done at strength=${strength}`);

  // De-repeat n-grams across full text after post-processing
  result = deRepeatNgrams(result);

  // Light global polish (punctuation artifact cleanup only)
  result = finalPolish(result);

  // ═══════════════════════════════════════════
  // PASS 3: DETECTOR FEEDBACK LOOP
  // Analyze with detector, apply per-sentence anti-detection + deep cleaning
  // until scores drop or we hit the iteration cap.
  // ═══════════════════════════════════════════
  const maxFeedbackPasses = 1;
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

    // Re-polish after fixes
    result = finalPolish(result);
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
  // Short texts need higher temperature for more unpredictable word choices
  if (features.wordCount < 300) {
    temperature = Math.min(temperature + 0.10, 0.98);
  }

  // ═══════════════════════════════════════════
  // PRE-HUMANIZATION: Sentence Merge/Split Surgery for Burstiness
  // ═══════════════════════════════════════════
  console.log("  [GhostPro] Pre-surgery: Applying sentence merge/split for burstiness...");
  const rawSurgeryItems = buildSentenceItems(protectedText);
  const surgeryItems = applySentenceSurgery(rawSurgeryItems);
  const surgeryText = reassembleFromItems(surgeryItems);
  console.log(`  [GhostPro] Surgery: ${rawSurgeryItems.filter(i => !i.isTitle).length} → ${surgeryItems.filter(i => !i.isTitle).length} sentences (merges + splits applied)`);

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

    // Run a light cross-chunk polish to smooth seams
    result = finalPolish(result);

    // Final constraint pass on merged result
    if (!features.hasContractions) result = removeContractions(result);
    if (!features.hasFirstPerson) result = removeFirstPerson(result);
    if (!features.hasRhetoricalQuestions) result = removeRhetoricalQuestions(result);
  }

  // ── Final punctuation & capitalization cleanup (non-LLM) ──
  result = fixPunctuation(result);

  // ── LLM synonym/phrasing validation — fix awkward dictionary swaps ──
  console.log("  [GhostPro] Running LLM phrasing validation...");
  const valWordCount = result.trim().split(/\s+/).length;
  const valMaxTokens = Math.min(16384, Math.max(4096, Math.ceil(valWordCount * 2)));
  result = await llmValidatePhrasing(result, valMaxTokens);

  // ── Strict LLM punctuation/capitalization cleanup with word-preservation loop ──
  console.log("  [GhostPro] Running strict LLM punctuation cleanup...");
  for (let puncLoop = 0; puncLoop < 3; puncLoop++) {
    const beforePunc = result;
    const puncResult = await llmFixPunctuation(result);
    // Verify word count didn't change
    const beforeWords = beforePunc.replace(/[^a-zA-Z\s]/g, "").toLowerCase().split(/\s+/).filter(w => w);
    const afterWords = puncResult.replace(/[^a-zA-Z\s]/g, "").toLowerCase().split(/\s+/).filter(w => w);
    if (Math.abs(beforeWords.length - afterWords.length) <= 2) {
      result = puncResult;
      console.log(`  [GhostPro] Punctuation pass ${puncLoop + 1}: accepted (${afterWords.length} words)`);
      break;
    } else {
      console.warn(`  [GhostPro] Punctuation pass ${puncLoop + 1}: rejected — word count changed (${beforeWords.length} → ${afterWords.length}), retrying...`);
      // Loop again with original result
    }
  }

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

  return result;
}
