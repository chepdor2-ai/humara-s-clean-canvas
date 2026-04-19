/**
 * Omega Humanizer Engine v4 — StealthWriter-Grade LLM Per-Sentence Rewriting
 * ============================================================================
 *
 * ARCHITECTURE:
 *   Phase 1 — PRE-ANALYSIS
 *     • Detect first-person usage in input (preserve it only if present)
 *     • Extract paragraphs → identify titles/headings → extract sentences
 *     • Classify each sentence: protected, prompt assignment, error/starter flags
 *
 *   Phase 2 — INDEPENDENT PARALLEL PROCESSING
 *     • Each sentence gets ONE of 10 STRUCTURAL TRANSFORMATION prompts
 *     • Each prompt instructs specific techniques: clause fronting, nominalization,
 *       conjunction rotation, conditional→temporal swaps, phrase expansion/compression
 *     • Each sentence opens its OWN independent API call
 *     • 60% word-change enforcement with retry
 *
 *   Phase 3 — REASSEMBLY + POST-PROCESSING
 *     • Reassemble sentences into paragraphs
 *     • Apply statistical error injection to marked sentences
 *     • 9-phase post-processing: AI word kill, AI phrase kill, starter kill,
 *       contraction kill, uniformity break, sentence surgery, n-gram breaking,
 *       LLM flow cleanup, final cleanup
 *     • Detector feedback loop: re-run if AI score > 15%
 *
 *   STRICT OUTPUT RULES:
 *     • NO contractions — ever
 *     • NO first person unless the input contained first person
 *     • NO assumed colloquial or humorous phrases
 *     • Target: 0% AI detection score
 */

import { getDetector } from "./multi-detector";
import { robustSentenceSplit, humanizeTitle } from "./content-protection";
import { validateAndRepairOutput } from "./validation-post-process";
import OpenAI from "openai";

// ── MODEL SELECTION — OpenAI only (gpt-4o-mini → gpt-4.1-nano → AntiPangram fallback) ──
const LLM_MODEL = process.env.LLM_MODEL ?? 'gpt-4o-mini';
const LLM_FALLBACK_MODEL = 'gpt-4.1-nano';

let _openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (_openaiClient) return _openaiClient;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY not set.");
  _openaiClient = new OpenAI({ apiKey });
  return _openaiClient;
}

async function llmCall(
  system: string,
  user: string,
  temperature: number,
  maxTokens = 512,
): Promise<string> {
  const client = getOpenAIClient();
  for (const model of [LLM_MODEL, LLM_FALLBACK_MODEL]) {
    try {
      const r = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature,
        max_tokens: maxTokens,
      });
      const content = r.choices[0]?.message?.content?.trim() ?? "";
      if (content) return content;
    } catch (err: unknown) {
      console.warn(`[Omega] ${model} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error("All OpenAI models failed — AntiPangram fallback will apply.");
}

// ══════════════════════════════════════════════════════════════════════════
// PHASE 1: PRE-ANALYSIS
// ══════════════════════════════════════════════════════════════════════════

/** Detect whether the input text contains first-person pronouns. */
function detectFirstPerson(text: string): boolean {
  return /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/i.test(text);
}

/** Split text into paragraphs, ensuring headings are separated from body text. */
function extractParagraphs(text: string): string[] {
  // First split on double newlines
  const rawParagraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const result: string[] = [];

  for (const para of rawParagraphs) {
    // If a paragraph contains single newlines, check if any line is a heading
    // that should be separated from the body text below it
    const lines = para.split('\n');
    if (lines.length <= 1) {
      result.push(para);
      continue;
    }

    // Walk through lines: split off heading lines as separate paragraphs
    let bodyLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (isProtectedLine(trimmed) && bodyLines.length === 0) {
        // Heading at the start — push as its own paragraph
        result.push(trimmed);
      } else if (isProtectedLine(trimmed) && bodyLines.length > 0) {
        // Heading after body lines — flush body, then push heading
        result.push(bodyLines.join(' '));
        bodyLines = [];
        result.push(trimmed);
      } else {
        bodyLines.push(trimmed);
      }
    }
    if (bodyLines.length > 0) {
      result.push(bodyLines.join(' '));
    }
  }

  return result;
}

/** Check if a line is a heading, title, or structural marker. */
function isProtectedLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  // Markdown headings
  if (/^#{1,6}\s/.test(t)) return true;
  // Roman numeral headings: I. II. III. etc.
  if (/^[IVXLCDM]+[.)]\s/i.test(t)) return true;
  // Section keyword headings (standalone only)
  if (/^(?:Part|Section|Chapter|Abstract|Introduction|Conclusion|References|Bibliography|Appendix)\s*$/i.test(t)) return true;
  // Numbered/lettered headings: "1." "2)" "A." etc.
  if (/^[\d]+[.):\-]\s/.test(t) || /^[A-Za-z][.)]\s/.test(t)) {
    const words = t.split(/\s+/);
    if (words.length <= 10 && !/[.!?]$/.test(t)) return true;
  }
  const words = t.split(/\s+/);
  // ALL-CAPS lines (4+ chars) that are short
  if (words.length <= 12 && t === t.toUpperCase() && /[A-Z]/.test(t) && t.length >= 4) return true;
  // Short lines (<=3 words) without ending punctuation — likely headings
  if (words.length <= 3 && !/[.!?]$/.test(t)) return true;
  return false;
}

/** Extract sentences from a paragraph using robust splitting (handles abbreviations, decimals, URLs). */
function extractSentences(paragraph: string): string[] {
  return robustSentenceSplit(paragraph);
}

/** Deterministic hash for sentence-specific randomness. */
function hashSentence(s: string, salt: number = 0): number {
  let h = salt;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Classification for each sentence. */
interface SentenceClassification {
  text: string;
  index: number;
  paragraphIndex: number;
  localIndex: number;
  isProtected: boolean;
  assignedPrompt: number;
  shouldInjectError: boolean;
  shouldVaryStarter: boolean;
}

/**
 * Classify every sentence: protected? error injection? starter variance?
 * Prompt assignment is RANDOM (hash-based), not cycling.
 */
function classifySentences(paragraphs: string[]): {
  classifications: SentenceClassification[];
  paragraphMap: Map<number, number[]>; // paragraphIndex → classification indices
  protectedParagraphs: Map<number, string>; // paragraphIndex → original text for protected ones
} {
  const classifications: SentenceClassification[] = [];
  const paragraphMap = new Map<number, number[]>();
  const protectedParagraphs = new Map<number, string>();
  let globalIndex = 0;

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx];
    if (!para) {
      protectedParagraphs.set(pIdx, '');
      continue;
    }
    if (isProtectedLine(para)) {
      protectedParagraphs.set(pIdx, para);
      continue;
    }

    const sentences = extractSentences(para);
    const indices: number[] = [];

    for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
      const sent = sentences[sIdx];
      const gIdx = globalIndex++;
      const hash = hashSentence(sent, gIdx);
      const wordCount = sent.split(/\s+/).length;
      const isShort = wordCount < 4;

      // Randomly assign one of 10 prompts using hash
      const assignedPrompt = hash % 10;

      // ~40% get error injection — deterministic via hash
      const shouldInjectError = !isShort && ((hash * 11 + gIdx * 7 + gIdx * gIdx) % 100) < 40;

      // ~30% get starter variation
      const shouldVaryStarter = !isShort && ((hash * 13 + gIdx * 3) % 100) < 12;

      classifications.push({
        text: sent,
        index: gIdx,
        paragraphIndex: pIdx,
        localIndex: sIdx,
        isProtected: isShort,
        assignedPrompt,
        shouldInjectError,
        shouldVaryStarter,
      });
      indices.push(classifications.length - 1);
    }
    paragraphMap.set(pIdx, indices);
  }

  return { classifications, paragraphMap, protectedParagraphs };
}

// ══════════════════════════════════════════════════════════════════════════
// BANNED AI VOCABULARY
// ══════════════════════════════════════════════════════════════════════════

const BANNED_WORDS = [
  "utilize", "utilise", "facilitate", "leverage", "comprehensive", "multifaceted",
  "paramount", "furthermore", "moreover", "additionally", "consequently",
  "subsequently", "nevertheless", "notwithstanding", "aforementioned",
  "paradigm", "trajectory", "discourse", "nuanced", "pivotal", "intricate",
  "meticulous", "profound", "overarching", "transformative", "noteworthy",
  "elucidate", "delve", "embark", "foster", "harness", "tapestry",
  "cornerstone", "myriad", "plethora", "landscape", "realm", "culminate",
  "robust", "innovative", "groundbreaking", "streamline", "optimize",
  "bolster", "catalyze", "spearhead", "unravel", "unveil", "nexus",
  "methodology", "framework", "holistic", "substantive", "salient",
  "ubiquitous", "enhance", "crucial", "vital", "essential",
  "imperative", "underscores", "underscored", "underscore",
].join(", ");

const BANNED_PHRASES = [
  "it is important to note that", "it is crucial to note", "it is worth noting",
  "plays a crucial role", "plays a vital role", "plays a key role",
  "plays a significant role", "plays a pivotal role", "plays an important role",
  "in today's world", "in today's society", "in today's landscape",
  "serves as a testament", "serves as a reminder", "serves as a catalyst",
  "cannot be overstated", "needless to say", "first and foremost",
  "each and every", "when it comes to", "at the end of the day",
  "in the context of", "a wide range of", "a broad spectrum of",
  "due to the fact that", "in the realm of", "in order to",
  "it goes without saying", "navigate the complexities",
  "not only... but also", "in light of", "with respect to",
].join("; ");

// ══════════════════════════════════════════════════════════════════════════
// STRICT ENFORCEMENT RULES
// ══════════════════════════════════════════════════════════════════════════

function buildStrictRules(inputHasFirstPerson: boolean): string {
  const firstPersonRule = inputHasFirstPerson
    ? "12. First-person pronouns (I, we, my, our) are ALLOWED because the original text uses them."
    : "12. NEVER use first-person pronouns (I, me, my, mine, we, us, our, ours). The original text does not use them. Write in third person or use passive constructions.";

  return `
ABSOLUTE RULES — VIOLATION MEANS FAILURE:
1. Change at least 60% of the words. Rewrite at the CONCEPT level, not word-for-word substitution.
2. Restructure the sentence using specific techniques:
   - CLAUSE FRONTING: Move subordinate clauses to the beginning ("Because X, Y" ↔ "Y because X")
   - NOMINALIZATION: Convert verbs to nouns or nouns to verbs ("to expand" → "the expansion of", "assessment" → "to assess")
   - CONJUNCTION ROTATION: Vary linking words ("or" → "as well as", "and" → "along with", "but" → "however"/"yet")
   - CONDITIONAL SWAPS: "if" → "when"/"where"/"provided that", "because" → "since"/"given that"
   - PHRASE EXPANSION/COMPRESSION: "location" → "place of residence", "regardless of" → "irrespective of"
3. NEVER use these AI words: ${BANNED_WORDS}
4. NEVER use these AI phrases: ${BANNED_PHRASES}
5. Write in clear, natural academic language that reads like a careful student wrote it by hand.
6. Use everyday academic vocabulary — not thesaurus words, not fancy synonyms.
7. Keep the EXACT same meaning, facts, and logical relationships.
8. Return ONLY the rewritten sentence. No quotes, no explanations, no labels, no preamble.
9. Do NOT start with "This", "It is", "There is", "There are". Vary sentence openings.
10. NEVER use contractions (don't, can't, won't, etc.). Write them out fully (do not, cannot, will not).
11. NEVER use semicolons excessively. Do NOT capitalize for emphasis. Do NOT use bold or italic markers.
${firstPersonRule}
13. Do NOT add humor, colloquialisms, slang, or informal expressions that were not in the original.
14. Maintain the same level of formality and academic register as the original text.
15. Produce output that reads as if a human sat down, understood the meaning, and expressed it in their own words from scratch.
16. CRITICAL WORD COUNT: Your output MUST stay within ±15% of the original sentence word count. Do NOT drastically shorten or pad.
17. SYNONYM REPLACEMENT: Swap at least 30% of non-technical words with natural synonyms.
18. VOICE/TENSE VARIATION: Randomly apply ONE per sentence:
   - Active → passive or passive → active
   - Simple → continuous or vice versa ("process" → "are processing", "is managing" → "manages")
   - Noun → verb conversion ("the implementation of" → "implementing")
19. AI PHRASE KILLING: Replace AI constructions: "plays a crucial role" → "matters", "it is important to note" → cut, "a wide range of" → "many"
`;
}

// ══════════════════════════════════════════════════════════════════════════
// 10 PERSONA PROMPTS — each uses DIFFERENT structural transformation techniques
// ══════════════════════════════════════════════════════════════════════════

interface PersonaPrompt {
  system: (rules: string) => string;
  userTemplate: (sentence: string, sentIdx: number) => string;
  temperature: number;
}

const PERSONA_PROMPTS: PersonaPrompt[] = [
  // 0 — Clause fronting specialist
  {
    system: (rules) => `You are an academic rewriter who specializes in CLAUSE FRONTING. When you rewrite a sentence, you move subordinate clauses, prepositional phrases, or conditions to the front of the sentence. You change "X does Y because Z" to "Given Z, X does Y" or "Because of Z, Y occurs in X". You always restructure the sentence completely. You never use contractions. You write like a careful student submitting coursework.
${rules}`,
    userTemplate: (s, idx) => `Rewrite ${idx + 1}: Move a subordinate clause or condition to the FRONT of this sentence. Use completely different words. Change at least 60% of the vocabulary while keeping the exact meaning. No contractions.\n\nOriginal: "${s}"\n\nRewritten:`,
    temperature: 0.78,
  },
  // 1 — Nominalization transformer
  {
    system: (rules) => `You are an academic rewriter who uses NOMINALIZATION and DENOMINALIATION. When you see a verb phrase, you convert it to a noun phrase ("to expand access" → "the expansion of access"). When you see a heavy noun phrase, you convert it to a verb construction ("the assessment of quality" → "assessing quality"). You always restructure the whole sentence around these changes. You never use contractions.
${rules}`,
    userTemplate: (s, idx) => `Task ${idx + 1}: Rewrite this sentence using nominalization OR denominalization — convert key verbs to nouns or nouns to verbs. Build a completely new sentence structure around those changes. Change at least 60% of words. No contractions.\n\nOriginal: "${s}"\n\nRewritten:`,
    temperature: 0.77,
  },
  // 2 — Conjunction and connector rotator
  {
    system: (rules) => `You are an academic rewriter who ROTATES conjunctions and logical connectors. You replace "and" with "along with" or "as well as", "or" with "alternatively", "but" with "yet" or "however", "because" with "since" or "given that", "if" with "when" or "provided that". You also rearrange clause order. You never use contractions. You write naturally like a student who carefully rephrased their own work.
${rules}`,
    userTemplate: (s, idx) => `Rewrite #${idx + 1}: Completely rephrase this sentence. Rotate ALL conjunctions and connectors to different equivalents. Restructure the clauses. Change at least 60% of words. No contractions.\n\nSentence: "${s}"\n\nRephrased:`,
    temperature: 0.80,
  },
  // 3 — Voice and perspective shifter
  {
    system: (rules) => `You are an academic rewriter who shifts VOICE and PERSPECTIVE. You convert active constructions to passive or passive to active. You change the grammatical subject of the sentence. "Researchers found that X" becomes "X was identified through research" or "The findings revealed X". You restructure everything around the new subject. You never use contractions.
${rules}`,
    userTemplate: (s, idx) => `Item ${idx + 1}: Rewrite this sentence by CHANGING THE GRAMMATICAL SUBJECT. If the original says "A does B", rewrite as "B is done by A" or find a completely different subject. Change at least 60% of words. No contractions.\n\nOriginal: "${s}"\n\nRewritten:`,
    temperature: 0.76,
  },
  // 4 — Phrase expander/compressor
  {
    system: (rules) => `You are an academic rewriter who EXPANDS compact phrases and COMPRESSES wordy ones. Short words become multi-word equivalents: "regardless" → "irrespective of", "location" → "place of residence", "important" → "of particular concern". Wordy phrases become compact: "due to the fact that" → "because", "in the event that" → "if". You restructure the whole sentence. You never use contractions.
${rules}`,
    userTemplate: (s, idx) => `Sentence ${idx + 1}: Rewrite by expanding compact words into multi-word phrases AND compressing wordy phrases into shorter ones. The whole sentence structure should change. At least 60% word change. No contractions.\n\nOriginal: "${s}"\n\nRewritten:`,
    temperature: 0.79,
  },
  // 5 — Thesis-style restructurer
  {
    system: (rules) => `You write as someone preparing a thesis. You restructure sentences by placing the MAIN CLAIM first, then supporting detail. Or you place CONTEXT first, then the main point. You vary between these two patterns. You use transitional phrases naturally. You change vocabulary completely. You never use contractions.
${rules}`,
    userTemplate: (s, idx) => `Thesis rewrite ${idx + 1}: Restructure this sentence for a thesis. Place the main claim either FIRST (then support) or LAST (context first, then claim). Use entirely different vocabulary and phrasing. At least 60% word change. No contractions.\n\nSource: "${s}"\n\nThesis version:`,
    temperature: 0.81,
  },
  // 6 — Conditional and temporal transformer
  {
    system: (rules) => `You are an academic rewriter specializing in CONDITIONAL and TEMPORAL transformations. You change "if X then Y" to "when X, Y follows" or "provided that X, Y occurs". You change "X leads to Y" to "Y follows from X" or "as a result of X, Y emerges". You swap the order of cause and effect. You never use contractions.
${rules}`,
    userTemplate: (s, idx) => `Analysis ${idx + 1}: Rewrite this sentence by transforming all conditional/causal/temporal relationships. Swap cause and effect order. Change "if" to "when"/"provided that", "because" to "since"/"given that". At least 60% word change. No contractions.\n\nSentence: "${s}"\n\nTransformed:`,
    temperature: 0.75,
  },
  // 7 — Parallel structure breaker
  {
    system: (rules) => `You are an academic rewriter who BREAKS parallel structures. Where the original lists "A, B, and C", you rewrite as "A along with B, as well as C" or "not only A but B and additionally C". Where the original uses parallel clauses, you make them asymmetric. This creates natural human-like irregularity. You never use contractions.
${rules}`,
    userTemplate: (s, idx) => `Report item ${idx + 1}: Rewrite this sentence by BREAKING any parallel structures — make lists asymmetric, vary clause patterns, use different constructions for similar ideas. Completely different vocabulary. At least 60% word change. No contractions.\n\nOriginal: "${s}"\n\nRewritten:`,
    temperature: 0.77,
  },
  // 8 — Evidential and hedging reformulator
  {
    system: (rules) => `You write measured academic prose with careful evidential markers. You replace "X is Y" with "X appears to be Y" or "evidence suggests X is Y" or "based on available data, X is Y". You add or reshape hedging language naturally. You change the entire sentence structure. You never use contractions. Your output reads like a thoughtful student who is careful about claims.
${rules}`,
    userTemplate: (s, idx) => `Essay sentence ${idx + 1}: Rephrase this sentence with careful evidential framing. Add or reshape hedging where appropriate. Use completely different words and clause arrangement. At least 60% word change. No contractions.\n\nOriginal: "${s}"\n\nEssay version:`,
    temperature: 0.82,
  },
  // 9 — Semantic decomposer
  {
    system: (rules) => `You are an academic rewriter who DECOMPOSES and RECOMPOSES meaning. You break the sentence into its core semantic units (who did what to whom, why, how), then rebuild it using completely different words and grammar. The result expresses identical meaning but looks like it was written from scratch by a different person. You never use contractions.
${rules}`,
    userTemplate: (s, idx) => `Critical rewrite ${idx + 1}: Decompose this sentence into its core meaning (who/what/why/how), then rebuild it from scratch using entirely different vocabulary and sentence architecture. At least 60% word change. No contractions.\n\nInput: "${s}"\n\nRebuilt:`,
    temperature: 0.74,
  },
];

// ══════════════════════════════════════════════════════════════════════════
// 60% CHANGE ENFORCEMENT
// ══════════════════════════════════════════════════════════════════════════

function calculateWordChangePercent(original: string, rewritten: string): number {
  const normalize = (t: string) => t.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const origWords = normalize(original);
  const newWords = normalize(rewritten);
  if (origWords.length === 0) return 100;

  const origSet = new Set(origWords);
  const newSet = new Set(newWords);
  let kept = 0;
  for (const w of origSet) {
    if (newSet.has(w)) kept++;
  }
  return Math.round((1 - kept / origSet.size) * 100);
}

// ══════════════════════════════════════════════════════════════════════════
// ERROR INJECTION — applied post-LLM to statistically marked sentences
// ══════════════════════════════════════════════════════════════════════════

function injectAcademicError(sentence: string, sentIdx: number): string {
  const errors = [
    // 0: Missing comma before conjunction
    (s: string) => s.replace(/,\s*(and|but|so|yet)\s+/i, (_, conj) => ` ${conj} `),
    // 1: Oxford comma insertion
    (s: string) => {
      const andIdx = s.lastIndexOf(' and ');
      if (andIdx > 15 && s.indexOf(',') > 0 && s.indexOf(',') < andIdx) {
        return s.slice(0, andIdx) + ', and' + s.slice(andIdx + 4);
      }
      return s;
    },
    // 2: Slightly wordy qualifier
    (s: string) => s
      .replace(/\b(shows)\b/i, 'appears to show')
      .replace(/\b(suggests)\b/i, 'seems to suggest')
      .replace(/\b(indicates)\b/i, 'appears to indicate'),
    // 3: Run-on tendency
    (s: string) => {
      const periodIdx = s.indexOf('. ');
      if (periodIdx > 15 && periodIdx < s.length - 15) {
        return s.slice(0, periodIdx) + ', ' + s.slice(periodIdx + 2, periodIdx + 3).toLowerCase() + s.slice(periodIdx + 3);
      }
      return s;
    },
    // 4: Insert a hedging qualifier
    (s: string) => s
      .replace(/\b(is evident)\b/i, 'is somewhat evident')
      .replace(/\b(is clear)\b/i, 'is relatively clear')
      .replace(/\b(is significant)\b/i, 'appears to be significant'),
    // 5: Subject-verb distance insertion
    (s: string) => s.replace(/\b(the study|the research|this analysis|the findings|the results)\b/i, (match) => {
      const insertions = [', as noted earlier,', ', in this particular case,', ', to some degree,'];
      return match + insertions[s.length % insertions.length];
    }),
    // 6: Unnecessary repetition of concept
    (s: string) => s
      .replace(/\b(because)\b/i, 'because of the fact that')
      .replace(/\b(although)\b/i, 'despite the fact that'),
    // 7: Slightly awkward passive recast
    (s: string) => s
      .replace(/\b(shows? that)\b/i, 'has shown that')
      .replace(/\b(leads? to)\b/i, 'has led to')
      .replace(/\b(suggests? that)\b/i, 'would suggest that'),
    // 8: Minor hedging insertion
    (s: string) => s
      .replace(/\b(is)\b/i, 'appears to be')
      .replace(/\b(are clearly)\b/i, 'are seemingly')
      .replace(/\b(will)\b/i, 'may well'),
    // 9: Wrong article
    (s: string) => s
      .replace(/\ba important\b/gi, 'an important')
      .replace(/\ban significant\b/gi, 'a significant')
      .replace(/\bthe one\b/i, 'one'),
  ];

  const primaryIdx = (sentIdx * 3 + sentence.charCodeAt(0)) % errors.length;
  let result = errors[primaryIdx](sentence);

  // 15% chance of stacking a second error
  if ((sentIdx * 17 + sentence.length) % 100 < 15) {
    const secondIdx = (primaryIdx + 4) % errors.length;
    result = errors[secondIdx](result);
  }

  if (result !== sentence && result.length < sentence.length * 1.6 && result.length > sentence.length * 0.5) {
    return result;
  }
  return sentence;
}

// ══════════════════════════════════════════════════════════════════════════
// STARTER VARIATION — applied to statistically marked sentences
// ══════════════════════════════════════════════════════════════════════════

const ACADEMIC_STARTERS = [
  'In this regard, ', 'On this point, ', 'Notably, ', 'To that end, ',
  'By extension, ', 'In particular, ', 'Along these lines, ', 'Accordingly, ',
  'From this standpoint, ', 'With this in mind, ', 'At the same time, ',
  'In a broader sense, ', 'On closer inspection, ', 'As a result, ',
];

function applyStarterVariation(sentence: string, sentIdx: number, usedStarters: Set<string>): string {
  if (sentence.length < 20) return sentence;
  const starter = ACADEMIC_STARTERS[(sentIdx + sentence.charCodeAt(0)) % ACADEMIC_STARTERS.length];
  if (usedStarters.has(starter)) return sentence;
  usedStarters.add(starter);
  if (/^[A-Z]/.test(sentence)) {
    // Only lowercase if first word is a common word, not a proper noun
    const firstWord = sentence.split(/\s/)[0].replace(/[^a-zA-Z]/g, '');
    const commonStarts = new Set(['the','this','that','these','those','it','its','a','an','she','he','they','we','our','his','her','their','my','your','one','some','many','most','all','each','every','both','few','such','no','any','other','which','what','when','where','how','as','if','so','but','and','or','yet','for','nor','by','in','on','at','to','of','with','from','into','through','during','before','after','between','about','against','above','below','over','under','while','since','until','because','although','however','therefore','furthermore','moreover','additionally','consequently','meanwhile','nevertheless','nonetheless','regardless','otherwise','instead','also','then']);
    if (commonStarts.has(firstWord.toLowerCase())) {
      return starter + sentence[0].toLowerCase() + sentence.slice(1);
    }
    // Proper noun — keep capitalization
    return starter + sentence;
  }
  return starter + sentence;
}

// ══════════════════════════════════════════════════════════════════════════
// POST-PROCESSING PIPELINE — 7 phases
// ══════════════════════════════════════════════════════════════════════════

// Phase 1: AI word kill
const AI_WORDS_RE = /\b(utilize|utilise|facilitate|leverage|comprehensive|multifaceted|paramount|delve|foster|harness|tapestry|cornerstone|myriad|plethora|landscape|realm|pivotal|intricate|meticulous|profound|overarching|transformative|noteworthy|elucidate|embark|robust|innovative|groundbreaking|streamline|optimize|bolster|catalyze|spearhead|unravel|unveil|nexus|holistic|substantive|salient|ubiquitous|enhance|crucial|vital|essential|imperative|underscores?d?|discourse|trajectory|paradigm|nuanced|culminate)\b/gi;

const AI_REPLACEMENTS: Record<string, string[]> = {
  utilize: ['use', 'apply', 'work with'], utilise: ['use', 'apply', 'work with'],
  facilitate: ['help', 'support', 'make possible'], leverage: ['use', 'draw on', 'rely on'],
  comprehensive: ['thorough', 'complete', 'full', 'detailed'],
  multifaceted: ['complex', 'varied', 'layered'], paramount: ['critical', 'key', 'top priority'],
  delve: ['examine', 'explore', 'look into'],
  foster: ['encourage', 'promote', 'build'], harness: ['use', 'channel', 'put to use'],
  tapestry: ['mix', 'combination', 'blend'], cornerstone: ['foundation', 'basis', 'core part'],
  myriad: ['many', 'numerous', 'a large number of'], plethora: ['many', 'plenty of', 'a large number of'],
  landscape: ['field', 'area', 'setting'], realm: ['area', 'field', 'domain', 'space'],
  pivotal: ['key', 'central', 'major'], intricate: ['complex', 'detailed', 'involved'],
  meticulous: ['careful', 'detailed', 'thorough'], profound: ['deep', 'significant', 'strong'],
  overarching: ['main', 'broad', 'overall'], transformative: ['major', 'significant', 'far-reaching'],
  noteworthy: ['notable', 'worth mentioning', 'interesting'], elucidate: ['explain', 'clarify', 'spell out'],
  embark: ['begin', 'start', 'take on'], robust: ['strong', 'solid', 'reliable'],
  innovative: ['new', 'creative', 'fresh'], groundbreaking: ['new', 'original', 'pioneering'],
  streamline: ['simplify', 'speed up', 'make easier'], optimize: ['improve', 'fine-tune', 'make better'],
  bolster: ['support', 'strengthen', 'back up'], catalyze: ['trigger', 'spark', 'prompt'],
  spearhead: ['lead', 'drive', 'head up'], unravel: ['untangle', 'figure out', 'sort out'],
  unveil: ['reveal', 'show', 'present'], nexus: ['connection', 'link', 'center'],
  holistic: ['whole', 'complete', 'overall'], substantive: ['real', 'meaningful', 'solid'],
  salient: ['key', 'main', 'notable'], ubiquitous: ['common', 'widespread', 'present everywhere'],
  enhance: ['improve', 'boost', 'strengthen'], crucial: ['key', 'critical', 'needed'],
  vital: ['key', 'needed', 'critical'], essential: ['needed', 'key', 'necessary'],
  imperative: ['necessary', 'urgent', 'needed'], underscore: ['highlight', 'show', 'point to'],
  underscored: ['highlighted', 'showed', 'pointed to'], underscores: ['highlights', 'shows', 'points to'],
  discourse: ['discussion', 'conversation', 'debate'], trajectory: ['path', 'direction', 'course'],
  paradigm: ['model', 'approach', 'pattern'], nuanced: ['subtle', 'detailed', 'layered'],
  culminate: ['end', 'result', 'lead to'],
};

function ppAIWordKill(text: string): string {
  return text.replace(AI_WORDS_RE, (match) => {
    const key = match.toLowerCase().replace(/d$/, '').replace(/s$/, '');
    const alts = AI_REPLACEMENTS[key] || AI_REPLACEMENTS[match.toLowerCase()];
    if (!alts) return match;
    const pick = alts[(match.charCodeAt(0) + text.length) % alts.length];
    if (match[0] === match[0].toUpperCase()) return pick.charAt(0).toUpperCase() + pick.slice(1);
    return pick;
  });
}

// Phase 2: AI phrase kill
const AI_PHRASE_PATTERNS: [RegExp, string][] = [
  [/\bit is (?:important|crucial|essential|vital|imperative|worth noting) (?:to note |to mention |to recognize )?that\b/gi, ''],
  [/\bplays? a (?:crucial|vital|key|significant|important|pivotal|critical) role(?: in)?\b/gi, 'matters for'],
  [/\bin today'?s (?:world|society|landscape|era|age)\b/gi, 'at present'],
  [/\bserves? as a (?:testament|reminder|catalyst|cornerstone|foundation)\b/gi, 'demonstrates'],
  [/\bcannot be overstated\b/gi, 'is significant'],
  [/\bneedless to say\b/gi, ''],
  [/\bfirst and foremost\b/gi, 'first'],
  [/\beach and every\b/gi, 'every'],
  [/\bwhen it comes to\b/gi, 'regarding'],
  [/\bat the end of the day\b/gi, 'ultimately'],
  [/\bin the context of\b/gi, 'within'],
  [/\ba (?:wide|broad|vast) (?:range|array|spectrum) of\b/gi, 'many'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bin the realm of\b/gi, 'in'],
  [/\bin order to\b/gi, 'to'],
  [/\bit goes without saying\b/gi, ''],
  [/\bnavigate the complexities?\b/gi, 'address the challenges'],
  [/\bnot only\b(.{5,40})\bbut also\b/gi, '$1 and also'],
  [/\bin light of\b/gi, 'given'],
  [/\bwith respect to\b/gi, 'regarding'],
  [/\bfor the purpose of\b/gi, 'to'],
  [/\bin the event that\b/gi, 'if'],
  [/\bby virtue of\b/gi, 'through'],
  [/\bremarkably,?\s*/gi, ''], [/\bundeniably,?\s*/gi, ''], [/\bundoubtedly,?\s*/gi, ''],
  [/\binterestingly,?\s*/gi, ''], [/\bcrucially,?\s*/gi, ''], [/\bimportantly,?\s*/gi, ''],
  [/\bessentially,?\s*/gi, ''], [/\bfundamentally,?\s*/gi, ''], [/\barguably,?\s*/gi, ''],
  [/\bevidently,?\s*/gi, ''],
];

function ppAIPhrasesKill(text: string): string {
  return text.split(/\n\s*\n/).map(para => {
    let result = para;
    for (const [pattern, replacement] of AI_PHRASE_PATTERNS) {
      result = result.replace(pattern, replacement);
    }
    result = result.replace(/ {2,}/g, ' ').trim();
    const sents = robustSentenceSplit(result);
    return sents.map(s => {
      if (s[0] && s[0] !== s[0].toUpperCase()) return s[0].toUpperCase() + s.slice(1);
      return s;
    }).join(' ');
  }).join('\n\n');
}

// Phase 3: AI starter kill
const AI_STARTERS = new Set([
  'furthermore', 'moreover', 'additionally', 'however', 'nevertheless',
  'consequently', 'subsequently', 'notwithstanding', 'accordingly',
  'thus', 'hence', 'indeed', 'notably', 'specifically', 'crucially',
  'importantly', 'essentially', 'fundamentally', 'arguably',
  'undeniably', 'undoubtedly', 'interestingly', 'remarkably', 'evidently',
]);

function ppStarterKill(text: string): string {
  return text.split(/\n\s*\n/).map(para => {
    const sentences = robustSentenceSplit(para);
    return sentences.map(sent => {
      const firstWord = sent.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
      if (AI_STARTERS.has(firstWord)) {
        const comma = sent.indexOf(',');
        if (comma > 0 && comma < 25) {
          let rest = sent.slice(comma + 1).trim();
          if (rest[0]) rest = rest[0].toUpperCase() + rest.slice(1);
          return rest;
        }
      }
      return sent;
    }).join(' ');
  }).join('\n\n');
}

// Phase 4: Contraction kill — expand ALL contractions
function ppExpandContractions(text: string): string {
  const map: Record<string, string> = {
    "can't": "cannot", "won't": "will not", "don't": "do not",
    "doesn't": "does not", "didn't": "did not", "isn't": "is not",
    "aren't": "are not", "wasn't": "was not", "weren't": "were not",
    "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
    "wouldn't": "would not", "shouldn't": "should not", "couldn't": "could not",
    "mustn't": "must not", "it's": "it is", "that's": "that is",
    "there's": "there is", "here's": "here is", "he's": "he is",
    "she's": "she is", "they're": "they are", "we're": "we are",
    "you're": "you are", "I'm": "I am", "they've": "they have",
    "we've": "we have", "you've": "you have", "I've": "I have",
    "they'll": "they will", "we'll": "we will", "you'll": "you will",
    "I'll": "I will", "he'll": "he will", "she'll": "she will",
    "it'll": "it will", "let's": "let us", "who's": "who is",
    "what's": "what is", "where's": "where is", "when's": "when is",
    "how's": "how is", "ain't": "is not",
  };
  let result = text;
  for (const [c, e] of Object.entries(map)) {
    const re = new RegExp(c.replace("'", "[''']"), 'gi');
    result = result.replace(re, (m) => m[0] === m[0].toUpperCase() ? e.charAt(0).toUpperCase() + e.slice(1) : e);
  }
  return result;
}

// Phase 5: Uniformity breaker
function ppBreakUniformity(text: string): string {
  return text.split(/\n\s*\n/).map(para => {
    const sentences = robustSentenceSplit(para);
    if (sentences.length < 3) return para;

    const result: string[] = [];
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      const words = s.split(/\s+/);
      if (i >= 2) {
        const prevLen = sentences[i - 1].split(/\s+/).length;
        const prevPrevLen = sentences[i - 2].split(/\s+/).length;
        if (Math.abs(words.length - prevLen) < 5 && Math.abs(prevLen - prevPrevLen) < 5 && words.length > 12) {
          const midComma = s.indexOf(', ', Math.floor(s.length * 0.4));
          if (midComma > 10 && midComma < s.length - 10) {
            const first = s.slice(0, midComma) + '.';
            let second = s.slice(midComma + 2).trim();
            if (second[0]) second = second[0].toUpperCase() + second.slice(1);
            result.push(first, second);
            continue;
          }
        }
      }
      result.push(s);
    }
    return result.join(' ');
  }).join('\n\n');
}

// Phase 6: Final cleanup
function ppFinalCleanup(text: string): string {
  return text.split(/\n\s*\n/).map(para => {
    let r = para;
    r = r.replace(/ {2,}/g, ' ');
    r = r.replace(/\s+([.!?,;:])/g, '$1');
    r = r.replace(/([.!?])([A-Z])/g, '$1 $2');
    r = r.replace(/(?<=[.!?]\s)([a-z])/g, (_, c) => c.toUpperCase());
    return r.trim();
  }).join('\n\n');
}

// Phase 7 (bonus): Kill first person if not in input
function ppKillFirstPerson(text: string): string {
  // Replace common first-person constructions with passive/third-person
  let r = text;
  r = r.replace(/\bI believe that\b/gi, 'It can be argued that');
  r = r.replace(/\bI think that\b/gi, 'It appears that');
  r = r.replace(/\bI argue that\b/gi, 'The argument is that');
  r = r.replace(/\bI suggest that\b/gi, 'It is suggested that');
  r = r.replace(/\bwe can see that\b/gi, 'it can be observed that');
  r = r.replace(/\bwe observe that\b/gi, 'it is observed that');
  r = r.replace(/\bwe find that\b/gi, 'the findings indicate that');
  r = r.replace(/\bwe argue\b/gi, 'the argument holds');
  r = r.replace(/\bIn my view\b/gi, 'From this perspective');
  r = r.replace(/\bIn our view\b/gi, 'From this perspective');
  r = r.replace(/\bOur findings\b/gi, 'The findings');
  r = r.replace(/\bour results\b/gi, 'the results');
  r = r.replace(/\bour analysis\b/gi, 'the analysis');
  r = r.replace(/\bour research\b/gi, 'the research');
  r = r.replace(/\bour study\b/gi, 'the study');
  return r;
}

// ══════════════════════════════════════════════════════════════════════════
// SENTENCE SURGERY — burstiness injection via merge/split
// ══════════════════════════════════════════════════════════════════════════

const SURGERY_MERGE_CONNECTORS = [', and ', ', yet ', '; ', ', which means ', ', so '];
const SURGERY_SPLIT_PATTERNS: RegExp[] = [
  /,\s+and\s+/i, /,\s+but\s+/i, /;\s+/, /,\s+which\s+/i, /,\s+while\s+/i, /,\s+although\s+/i,
];

function ppSentenceSurgery(text: string): string {
  return text.split(/\n\s*\n/).map(para => {
    const trimmed = para.trim();
    if (!trimmed || isProtectedLine(trimmed)) return para;
    const sentences = robustSentenceSplit(trimmed);
    if (sentences.length < 4) return para;

    const result: string[] = [];
    let merges = 0;
    let splits = 0;
    const maxMerges = Math.max(1, Math.floor(sentences.length / 7));
    const maxSplits = Math.max(1, Math.floor(sentences.length / 10));
    const skip = new Set<number>();

    for (let i = 0; i < sentences.length; i++) {
      if (skip.has(i)) continue;
      const s = sentences[i];
      const wc = s.split(/\s+/).length;

      // Merge short adjacent pairs
      if (merges < maxMerges && i + 1 < sentences.length && !skip.has(i + 1)) {
        const nextWc = sentences[i + 1].split(/\s+/).length;
        if (wc >= 4 && wc <= 16 && nextWc >= 4 && nextWc <= 16 && (wc + nextWc) <= 32) {
          const clean = s.replace(/[.!?]\s*$/, '');
          const conn = SURGERY_MERGE_CONNECTORS[Math.floor(Math.random() * SURGERY_MERGE_CONNECTORS.length)];
          const next = sentences[i + 1];
          const lower = next[0]?.toLowerCase() + next.slice(1);
          result.push(clean + conn + lower);
          skip.add(i + 1);
          merges++;
          continue;
        }
      }

      // Split long sentences at clause boundaries
      if (splits < maxSplits && wc > 24) {
        let didSplit = false;
        for (const pat of SURGERY_SPLIT_PATTERNS) {
          const match = s.match(pat);
          if (match && match.index) {
            const before = s.slice(0, match.index);
            const after = s.slice(match.index + match[0].length);
            if (before.split(/\s+/).length >= 8 && after.split(/\s+/).length >= 6) {
              let p1 = before.trim();
              if (!/[.!?]$/.test(p1)) p1 += '.';
              let p2 = after.trim();
              if (p2[0]) p2 = p2[0].toUpperCase() + p2.slice(1);
              if (!/[.!?]$/.test(p2)) p2 += '.';
              result.push(p1, p2);
              splits++;
              didSplit = true;
              break;
            }
          }
        }
        if (!didSplit) result.push(s);
        continue;
      }

      result.push(s);
    }
    return result.join(' ');
  }).join('\n\n');
}

// ══════════════════════════════════════════════════════════════════════════
// N-GRAM PATTERN BREAKING
// ══════════════════════════════════════════════════════════════════════════

const DIVERSE_STARTERS = [
  'At the same time, ', 'On this basis, ', 'In practical terms, ',
  'From this angle, ', 'Taken together, ', 'Looking at this differently, ',
  'On a related point, ', 'In effect, ', 'Put another way, ',
];
const COMMON_STARTER_WORDS = new Set(['the','this','that','these','those','it','its','a','an','she','he','they','we','our','his','her','their','my','your','one','some','many','most','all','each','every','both','few','such','no','any','other']);

function ppNgramBreaking(text: string): string {
  return text.split(/\n\s*\n/).map(para => {
    const trimmed = para.trim();
    if (!trimmed || isProtectedLine(trimmed)) return para;
    const sentences = robustSentenceSplit(trimmed);
    if (sentences.length < 3) return para;

    let starterIdx = 0;
    for (let i = 1; i < sentences.length; i++) {
      const prevStart = sentences[i - 1].split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
      const currStart = sentences[i].split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
      if (prevStart && currStart && prevStart === currStart) {
        const starter = DIVERSE_STARTERS[starterIdx % DIVERSE_STARTERS.length];
        starterIdx++;
        const firstWord = sentences[i].split(/\s/)[0].replace(/[^a-zA-Z]/g, '');
        if (COMMON_STARTER_WORDS.has(firstWord.toLowerCase())) {
          sentences[i] = starter + sentences[i][0].toLowerCase() + sentences[i].slice(1);
        } else {
          sentences[i] = starter + sentences[i];
        }
      }
    }
    return sentences.join(' ');
  }).join('\n\n');
}

// ══════════════════════════════════════════════════════════════════════════
// LLM FLOW CLEANUP — final punctuation/capitalization fix
// ══════════════════════════════════════════════════════════════════════════

async function llmFlowCleanup(text: string): Promise<string> {
  try {
    const client = getOpenAIClient();
    const wordCount = text.split(/\s+/).length;
    const maxTokens = Math.min(16384, Math.max(4096, Math.ceil(wordCount * 2)));

    for (const model of [LLM_MODEL, LLM_FALLBACK_MODEL]) {
      try {
        const r = await client.chat.completions.create({
          model,
        messages: [
          {
            role: 'system',
            content: `You are a punctuation and capitalization proofreader. Your ONLY job is to fix punctuation and capitalization errors.

STRICT RULES:
1. DO NOT change, add, remove, or replace ANY word.
2. DO NOT reorder words or sentences.
3. Only fix: missing/wrong periods, commas, semicolons, colons; incorrect capitalization after sentence ends; missing capitalization at sentence starts; duplicate punctuation.
4. Keep paragraph breaks exactly as they are.
5. Return ONLY the corrected text — no commentary.`,
          },
          { role: 'user', content: `Fix ONLY the punctuation and capitalization in this text. Do not change any words.\n\nTEXT:\n${text}` },
        ],
        temperature: 0.1,
        max_tokens: maxTokens,
        });

        const result = r.choices[0]?.message?.content?.trim() ?? '';
        if (!result || result.length < text.length * 0.5) continue;

        // Word preservation check
        const strip = (s: string) => s.replace(/[^a-zA-Z\s]/g, '').toLowerCase().split(/\s+/).filter(w => w);
        const origWords = strip(text);
        const fixedWords = strip(result);
        if (Math.abs(origWords.length - fixedWords.length) <= 2) {
          return result;
        }
      } catch {
        // try next model
      }
    }
    return text;
  } catch {
    return text;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN ENGINE
// ══════════════════════════════════════════════════════════════════════════

export async function omegaHumanize(
  text: string,
  strength: string = 'medium',
  tone: string = 'academic',
): Promise<string> {
  if (!text || !text.trim()) return text;

  // ── CITATION PROTECTION ──
  const citationMap = new Map<string, string>();
  let citIdx = 0;
  const textWithPlaceholders = text.replace(/\(([A-Z][a-zA-Z&.\s]+,?\s*\d{4}[a-z]?(?:;\s*[A-Z][a-zA-Z&.\s]+,?\s*\d{4}[a-z]?)*)\)/g, (match) => {
    const placeholder = `__CITE_${citIdx++}__`;
    citationMap.set(placeholder, match);
    return placeholder;
  });

  // ── PHASE 1: PRE-ANALYSIS ──
  const inputHasFirstPerson = detectFirstPerson(textWithPlaceholders);
  const strictRules = buildStrictRules(inputHasFirstPerson);
  const paragraphs = extractParagraphs(textWithPlaceholders);
  const { classifications, paragraphMap, protectedParagraphs } = classifySentences(paragraphs);

  const tempBoost = strength === 'strong' ? 0.06 : strength === 'light' ? -0.04 : 0;
  // Tone drives contraction expansion: always expand for academic/professional
  const expandContractions = tone === 'academic' || tone === 'professional' || tone === 'neutral';

  // ── PHASE 2: INDEPENDENT PARALLEL PROCESSING ──
  // Each sentence fires its OWN independent API call. No batching.
  const results: Map<number, string> = new Map();

  const allPromises = classifications.map(async (cls) => {
    if (cls.isProtected) {
      results.set(cls.index, cls.text);
      return;
    }

    const persona = PERSONA_PROMPTS[cls.assignedPrompt];
    const temp = Math.max(0.5, Math.min(1.1, persona.temperature + tempBoost));
    const sentenceWordCount = cls.text.split(/\s+/).length;
    const minSentWords = Math.max(3, Math.floor(sentenceWordCount * 0.85));
    const maxSentWords = Math.ceil(sentenceWordCount * 1.15);

    try {
      let result = await llmCall(
        persona.system(strictRules),
        persona.userTemplate(cls.text, cls.index) + `\n\nWORD RANGE: The original is ${sentenceWordCount} words. Your output MUST be between ${minSentWords} and ${maxSentWords} words. Do NOT drastically shorten it.`,
        temp,
        512,
      );

      if (!result || result.length < cls.text.length * 0.2 || result.length > cls.text.length * 3.5) {
        results.set(cls.index, cls.text);
        return;
      }

      result = result.replace(/^["']|["']$/g, '').trim();

      // Enforce 60% change — retry with escalated instruction if needed
      const changePercent = calculateWordChangePercent(cls.text, result);
      if (changePercent < 55) {
        const retryResult = await llmCall(
          persona.system(strictRules),
          `CRITICAL: Your previous attempt only changed ${changePercent}% of the words. You MUST change at least 60%. Use COMPLETELY different vocabulary and sentence structure. Do NOT reuse phrases from the original.\n\n${persona.userTemplate(cls.text, cls.index)}`,
          Math.min(1.1, temp + 0.08),
          512,
        );
        if (retryResult && retryResult.length >= cls.text.length * 0.2) {
          const retryStripped = retryResult.replace(/^["']|["']$/g, '').trim();
          const retryChange = calculateWordChangePercent(cls.text, retryStripped);
          if (retryChange > changePercent) result = retryStripped;
        }
      }

      results.set(cls.index, result);
    } catch {
      results.set(cls.index, cls.text);
    }
  });

  // All calls fire independently in parallel
  await Promise.all(allPromises);

  // ── PHASE 3: REASSEMBLY + POST-PROCESSING ──
  const usedStarters = new Set<string>();
  const reassembledParagraphs: string[] = [];

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    // Protected paragraphs (headings, empty lines) — humanize titles >6 words
    if (protectedParagraphs.has(pIdx)) {
      const heading = protectedParagraphs.get(pIdx)!;
      reassembledParagraphs.push(humanizeTitle(heading));
      continue;
    }

    const sentenceIndices = paragraphMap.get(pIdx);
    if (!sentenceIndices || sentenceIndices.length === 0) {
      reassembledParagraphs.push(paragraphs[pIdx]);
      continue;
    }

    const processedSentences: string[] = [];
    for (const clsIdx of sentenceIndices) {
      const cls = classifications[clsIdx];
      let sent = results.get(cls.index) ?? cls.text;

      // Apply error injection to statistically marked sentences
      if (cls.shouldInjectError) {
        sent = injectAcademicError(sent, cls.index);
      }

      // Fix capitalization
      if (sent[0] && sent[0] !== sent[0].toUpperCase()) {
        sent = sent[0].toUpperCase() + sent.slice(1);
      }

      // Ensure sentence-ending punctuation
      const trimmed = sent.trim();
      if (trimmed && !/[.!?]$/.test(trimmed)) {
        sent = trimmed + '.';
      }

      processedSentences.push(sent);
    }

    reassembledParagraphs.push(processedSentences.join(' '));
  }

  // ── PROTECT HEADINGS DURING POST-PROCESSING ──
  const headingPlaceholders = new Map<string, string>();
  let hIdx = 0;
  const outputParagraphs = reassembledParagraphs.map(para => {
    const trimmed = para.trim();
    if (protectedParagraphs.has(hIdx) || (!trimmed) || isProtectedLine(trimmed)) {
      const placeholder = `__HEADING_${hIdx}__`;
      headingPlaceholders.set(placeholder, para);
      hIdx++;
      return placeholder;
    }
    hIdx++;
    return para;
  });
  let output = outputParagraphs.join('\n\n');

  // ── POST-PROCESSING PIPELINE ──
  output = ppAIWordKill(output);          // Phase 1: Kill AI words
  output = ppAIPhrasesKill(output);       // Phase 2: Kill AI phrases
  output = ppStarterKill(output);         // Phase 3: Kill AI starters
  if (expandContractions) {
    output = ppExpandContractions(output); // Phase 4: Kill ALL contractions
  }
  output = ppBreakUniformity(output);     // Phase 5: Break uniformity
  output = ppFinalCleanup(output);        // Phase 6: Final cleanup
  output = ppAIWordKill(output);          // Phase 7: Second AI word sweep

  // Kill first person if input did not contain it
  if (!inputHasFirstPerson) {
    output = ppKillFirstPerson(output);
  }

  // Final contraction sweep (catch any generated by post-processing)
  output = ppExpandContractions(output);

  // ── SENTENCE SURGERY FOR BURSTINESS ──
  output = ppSentenceSurgery(output);

  // ── N-GRAM PATTERN BREAKING ──
  output = ppNgramBreaking(output);

  // ── LLM FLOW CLEANUP ──
  output = await llmFlowCleanup(output);

  // ── FINAL POST-SURGERY CLEANUP ──
  output = ppExpandContractions(output);
  output = ppAIWordKill(output);

  // ── DETECTOR FEEDBACK LOOP ──
  // Run internal detector; if AI score > 15%, re-run aggressive post-processing (max 2 retries)
  try {
    const detector = getDetector();
    for (let feedbackRound = 0; feedbackRound < 2; feedbackRound++) {
      const analysis = detector.analyze(output);
      const aiScore = analysis.summary.overall_ai_score;
      if (aiScore <= 15) break; // Good enough — passes as human

      // Aggressive re-processing: run the full post-processing pipeline again
      output = ppAIWordKill(output);
      output = ppAIPhrasesKill(output);
      output = ppStarterKill(output);
      output = ppExpandContractions(output);
      output = ppBreakUniformity(output);
      output = ppFinalCleanup(output);
      output = ppAIWordKill(output);
      if (!inputHasFirstPerson) output = ppKillFirstPerson(output);
      output = ppExpandContractions(output);
      output = ppNgramBreaking(output);

      // If still high after post-processing, run LLM cleanup again
      const recheck = detector.analyze(output);
      if (recheck.summary.overall_ai_score > 15) {
        output = await llmFlowCleanup(output);
        output = ppExpandContractions(output);
        output = ppAIWordKill(output);
      }
    }
  } catch {
    // Detector failure is non-fatal — continue with current output
  }

  // Restore protected headings
  for (const [placeholder, heading] of headingPlaceholders) {
    output = output.replace(new RegExp(placeholder, 'g'), heading);
  }

  // Restore protected citations (case-insensitive since transforms may lowercase placeholders)
  for (const [placeholder, citation] of citationMap) {
    output = output.replace(new RegExp(placeholder, 'gi'), citation);
  }

  // Fix citation capitalization — capitalize author names in (Author, Year) patterns
  output = output.replace(/\(([a-z][a-zA-Z&.\s]+,?\s*\d{4}[a-z]?(?:;\s*[a-z][a-zA-Z&.\s]+,?\s*\d{4}[a-z]?)*)\)/g, (match) => {
    return match.replace(/([(\s;])([a-z])/g, (_, pre, letter) => pre + letter.toUpperCase());
  });

  // Final validation: fix capitalization + sentence formatting
  const validated = validateAndRepairOutput(text.trim(), output);
  output = validated.text;

  return output;
}
