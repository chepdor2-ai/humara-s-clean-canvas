/**
 * Ninja Engine v2 — Stealthy-Style Hybrid Humanizer
 * ===================================================
 *
 * Architecture (per the stealthy hybrid model):
 *
 * LAYER 1 — LLM Pipeline (3 phases, separation of roles)
 *   Phase 1: Structural Rewrite (rephrase content, maintain meaning)
 *   Phase 2: Humanization Layer (add natural irregularities, vary rhythm, reduce predictability)
 *   Phase 3: Constraint/Polish (enforce rules, tone control, final cleanup)
 *
 * LAYER 2 — Rule-Based / Deterministic Processing
 *   - Sentence structure preservation
 *   - AI vocabulary elimination (120+ words, 40+ phrases)
 *   - Connector naturalization
 *   - Starter diversification
 *
 * LAYER 3 — Post-Processing Filters (Statistical Tweaks)
 *   - Burstiness enforcement (sentence length variation)
 *   - Punctuation humanization (semicolons, dashes, parentheticals)
 *   - Paragraph variance
 *   - Dependency depth enrichment
 *   - Word diversity injection
 *   - Controlled randomness injection
 *
 * LAYER 4 — Scoring / Feedback Loop
 *   - Run output through 22-detector engine
 *   - Identify weak signals
 *   - Apply targeted signal fixes
 *   - Iterate until scores improve (max 6 iterations)
 */

import { sentTokenize } from "./utils";
import { expandContractions } from "./advanced-transforms";
import { protectSpecialContent, restoreSpecialContent, protectContentTerms, restoreContentTerms, cleanOutputRepetitions, robustSentenceSplit, placeholdersToLLMFormat, llmFormatToPlaceholders, countSentences, enforceSentenceCountStrict, enforcePerParagraphSentenceCounts, rephraseCitations } from "./content-protection";
import { validateAndRepairOutput } from "./validation-post-process";
import { semanticSimilaritySync } from "./semantic-guard";
import { TextSignals, getDetector } from "./multi-detector";
import { getStyleMemory, profileSummaryText } from "./style-memory";
import { analyzeText, computeGap, gapToInstructions } from "./text-analyzer";
import { validateAll } from "./validation";
import {
  applyAIWordKill, applyConnectorNaturalization, applyPhrasePatterns,
  applySyntacticTemplate,
  DIVERSITY_SWAPS as SHARED_DIVERSITY_SWAPS,
  fixPunctuation,
  cleanSentenceStarters,
  verifySentencePresence,
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
import { getGroqClient, resolveGroqChatModel } from "./groq-client";
import OpenAI from "openai";
import { detectDomain, getToneGuidance, type DomainResult } from "./domain-detector";

// ── Config ──

const LLM_MODEL = resolveGroqChatModel(process.env.LLM_MODEL, "llama-3.3-70b-versatile");
const GPT4O_MINI_MODEL = "gpt-4o-mini";
const MAX_FEEDBACK_ITERATIONS_MAP: Record<string, number> = { light: 1, medium: 1, strong: 2 };
const TARGET_AI_SCORE = 5.0;

// ── OpenAI direct client (for GPT-4o mini) ──
let _openaiClient: OpenAI | null = null;
function getOpenAIDirectClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  if (!_openaiClient) {
    _openaiClient = new OpenAI({ apiKey: key });
  }
  return _openaiClient;
}

// ── Primary LLM call: Groq (base model) ──
function llmCall(system: string, user: string, temperature: number, maxTokens = 4096): Promise<string> {
  const client = getGroqClient();
  return client.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
    max_tokens: maxTokens,
  }).then((r: any) => r.choices[0]?.message?.content?.trim() ?? "");
}

// ── GPT-4o mini first, Groq fallback ──
async function llmCallWithFallback(
  system: string,
  user: string,
  temperature: number,
  maxTokens = 1024,
): Promise<string> {
  const openai = getOpenAIDirectClient();
  if (openai) {
    try {
      const res = await openai.chat.completions.create({
        model: GPT4O_MINI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature,
        max_tokens: maxTokens,
      });
      const content = res.choices[0]?.message?.content?.trim();
      if (content) return content;
    } catch (err) {
      console.warn("[LLM] GPT-4o mini failed, falling back to Groq:", err instanceof Error ? err.message : err);
    }
  }
  return llmCall(system, user, temperature, maxTokens);
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
  const contractionRe = /\b(can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|wouldn't|shouldn't|couldn't|mustn't|it's|that's|there's|here's|he's|she's|they're|we're|you're|I'm|they've|we've|you've|I've|they'll|we'll|you'll|I'll|he'll|she'll|it'll|let's|who's|what's)\b/gi;
  const firstPersonRe = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/;
  const sentences = robustSentenceSplit(text);
  const totalWords = text.trim().split(/\s+/).length;

  return {
    hasContractions: contractionRe.test(text),
    hasFirstPerson: firstPersonRe.test(text),
    hasRhetoricalQuestions: /[A-Za-z][^.!?]*\?/.test(text),
    avgSentenceLength: sentences.length > 0 ? totalWords / sentences.length : 15,
    paragraphCount: text.split(/\n\s*\n/).filter(p => p.trim()).length,
    wordCount: totalWords,
    sentenceCount: sentences.length,
  };
}

// ── Helpers ──

function safeDowncaseFirst(s: string): string {
  if (!s) return s;
  const fw = s.split(/\s+/)[0] ?? "";
  if (fw.length > 1 && fw === fw.toUpperCase()) return s;
  return s[0].toLowerCase() + s.slice(1);
}

// ══════════════════════════════════════════════════════════════════════════
// LAYER 1: LLM PIPELINE — 3 phases with separated roles
// ══════════════════════════════════════════════════════════════════════════

// ── Phase 1: Structural Rewrite ──
// Role: Rephrase content, maintain meaning, preserve argument order

const PHASE1_SYSTEM = `You are ghostwriting as a published author of a pre-2000 print encyclopedia or early Wikipedia article. Your job: rewrite text so it reads exactly like an objective, highly factual reference work before AI or corporate marketing buzzwords existed. Think of how Britannica, Encarta, or 2001-era Wikipedia authors wrote.

ABSOLUTE REQUIREMENTS:

1. EXTREME SENTENCE LENGTH VARIATION (the single most important rule):
   - Include very short, factual sentences (4-9 words) to anchor core entities
   - Include at least 1 very long, appositive-rich sentence per paragraph (35-55 words)
   - NEVER write 3 sentences in a row that are within 8 words of each other in length

2. SEO FLOW AND ENTITY DENSITY:
   - Maximize the natural retention of core nouns, entities, and subjects. The text must read as highly informative.
   - Do NOT use filler transitions ("It is important to note", "Additionally", "Furthermore"). Instead, transition through conceptual or chronological links.

3. BANNED VOCABULARY — if you use ANY of these, the output fails:
   utilize, facilitate, leverage, comprehensive, multifaceted, paramount, furthermore, moreover, additionally, consequently, subsequently, nevertheless, notwithstanding, aforementioned, paradigm, trajectory, discourse, holistic, robust, nuanced, pivotal, intricate, transformative, innovative, groundbreaking, mitigate, streamline, optimize, bolster, catalyze, delve, embark, foster, harness, spearhead, unravel, unveil, tapestry, cornerstone, nexus, myriad, plethora, realm, landscape, methodology, framework, implications, significant, substantial, remarkable, considerable, unprecedented, impactful, actionable, scalable, stakeholder, ecosystem, synergy, proactive, seamless, optimal, empower, narrative, unpack, deep dive, data-driven, high-level, benchmark, disruptive, thought leadership

4. SENTENCE STARTERS — vary dramatically:
   - Start primarily with the subject directly or a temporal/spatial clause.
   - Do NOT start any sentence with a conjunction like "And", "But", "Or", "So", "Yet"
   - NEVER use the same starting word consecutively

5. NATURAL TEXTURE (pre-2000 encyclopedic style):
   - Use declarative, objective framing. Avoid subjective hedging.
   - Avoid flowery adjectives; use precise, concrete nouns instead.

STRICT PRESERVATION:
- Keep ALL factual content, data, citations [in brackets], technical terms exactly
- Keep same paragraph count
- Do NOT add new ideas or create lists
- Protect ALL content inside brackets [like this] or (like this with numbers) — copy them exactly as-is
- CRITICAL: The text contains placeholder tokens like [[PROT_0]], [[PROT_1]], [[TRM_0]], etc. These represent protected values. Copy them EXACTLY as-is in your output. Do not remove, modify, or explain them.
- Stay within ±10% of original word count
- Return ONLY the rewritten text`;

function buildPhase1Prompt(text: string, features: InputFeatures): string {
  const contractionRule = features.hasContractions
    ? "You MAY use contractions naturally."
    : "Do NOT use contractions. Write all words fully.";

  const firstPersonRule = features.hasFirstPerson
    ? "You may use first-person pronouns where appropriate."
    : "Do NOT use first-person pronouns (I, we, me, us, my, our). Use impersonal constructions instead.";

  const rhetoricalRule = features.hasRhetoricalQuestions
    ? "You may use rhetorical questions sparingly."
    : "Do NOT use rhetorical questions. Do NOT add any sentences ending with a question mark. Use declarative statements only.";

  return `Rewrite this text completely as a human author from the mid-1990s would — before AI or corporate buzzwords existed. ${contractionRule}
${firstPersonRule}
${rhetoricalRule}

CRITICAL: Create EXTREME sentence length variation. Mix very short (4-9 words) with very long (35-55 words).
PROTECT: Copy ALL content inside brackets [like this] exactly as-is. Do not modify citations.

Word count target: ${features.wordCount} words (±10%, so ${Math.round(features.wordCount * 0.90)}-${Math.round(features.wordCount * 1.10)}). Do NOT pad with filler.
Paragraphs: ${features.paragraphCount} (preserve exactly).

TEXT TO REWRITE:
${text}`;
}

// ── Phase 2: Humanization Layer ──
// Role: Add natural irregularities, vary rhythm, reduce predictability

function buildPhase2System(profile: import("./style-memory").StyleProfile, gapInstr: string, features: InputFeatures): string {
  const contractionConstraint = features.hasContractions
    ? "- You MAY use contractions naturally"
    : "- Do NOT use contractions";
  const firstPersonConstraint = features.hasFirstPerson
    ? "- You may use first-person pronouns where appropriate"
    : "- Do NOT use first-person pronouns (I, we, me, us, my, our)";
  const rhetoricalConstraint = features.hasRhetoricalQuestions
    ? "- You may use rhetorical questions sparingly"
    : "- Do NOT use rhetorical questions or sentences ending with question marks";

  return `You are a Controlled Humanization Engine. Your task: make the text sound like it was written by a real human writer in the mid-1990s — not a machine, not a post-2010 corporate writer.

DOMAIN GUIDANCE:
${gapInstr}

${profileSummaryText(profile)}

HUMANIZATION RULES (apply all of these):

1. SENTENCE LENGTH VARIATION (most critical):
   - Create EXTREME variation: mix very short sentences (4-9 words) with long ones (30-50 words)
   - NEVER write 3 consecutive sentences within 8 words of each other in length
   - Target coefficient of variation > 0.40 for sentence lengths
   - Include at least 2 punchy short sentences per paragraph

2. NATURAL IRREGULARITIES:
   - Vary sentence openings dramatically (never repeat starting words consecutively)
   - Introduce mild syntactic variation by reordering clauses where natural
   - Allow slight redundancy where it improves realism
   - Avoid making the text overly polished or perfectly uniform

3. VOCABULARY (pre-2000 era — no modern buzzwords):
   - Replace generic/AI-like words with specific, concrete alternatives
   - Use phrasal verbs naturally: "look into", "carry out", "come up with", "break down"
   - Avoid: utilize, facilitate, leverage, comprehensive, multifaceted, paramount, furthermore, moreover, additionally, subsequently, nevertheless, notwithstanding, aforementioned, paradigm, trajectory, discourse, holistic, robust, nuanced, pivotal, intricate, transformative, innovative, groundbreaking, mitigate, streamline, optimize, bolster, catalyze, delve, embark, foster, harness, spearhead, unravel, unveil, tapestry, cornerstone, nexus, myriad, plethora, realm, landscape
   - Also avoid modern buzzwords: impactful, actionable, scalable, stakeholder, ecosystem, synergy, proactive, seamless, optimal, empower, narrative, disruptive, benchmark, data-driven, high-level, deep dive, thought leadership, unpack
   - Also avoid: "it is important to note", "plays a crucial role", "in today's world", "a wide range of", "due to the fact that"
   - Write like a textbook from 1995 — direct, clear, no fluff

4. PUNCTUATION AND STYLE:
   - Use semicolons 2-3 times to join related thoughts
   - Use comma-based hedging 2-3 times for asides (e.g. ", in most cases," or ", admittedly,")
   - Do NOT use em dashes (—) or parenthetical brackets
   - Keep formal academic tone but with natural rhythm

5. FLOW AND HEDGING:
   - Use academic hedging where appropriate: "suggests", "indicates", "appears to"
   - Keep reasoning-driven flow
   - Allow minor imperfection in phrasing — real humans are not perfectly concise

STRICT CONSTRAINTS:
- Preserve at least 90% of original sentence boundaries
- Keep the same number of paragraphs — preserve all paragraph breaks (double newlines) and headings/titles exactly as they appear
- NEVER merge paragraphs together or remove blank lines between them
- Do NOT introduce new ideas or remove existing ones
- Protect ALL content inside brackets [like this] exactly as-is — citations must remain unchanged
- CRITICAL: The text contains placeholder tokens like [[PROT_0]], [[PROT_1]], [[TRM_0]], etc. These represent protected values. Copy them EXACTLY as-is in your output. Do not remove, modify, or explain them.
${contractionConstraint}
${firstPersonConstraint}
${rhetoricalConstraint}
- Do NOT create lists unless the original has them
- Return only the rewritten text`;
}

function buildPhase2Prompt(text: string, strength: string, strictMeaning: boolean): string {
  let variationGuide = "Target 5-7% vocabulary change from the input.";
  if (strength === "light") variationGuide = "Target 5-7% vocabulary change from the input.";
  if (strength === "medium") variationGuide = "Target 10-15% vocabulary change. Actively rephrase clauses and swap word choices to create a clearly distinct version.";
  if (strength === "strong") variationGuide = "Target 18-25% vocabulary change. Aggressively restructure sentences, rephrase clauses, and diversify word choices. Push hard for human-sounding variation.";

  let meaningGuide = "";
  if (strictMeaning) meaningGuide = "\nStrict meaning mode: content deviation must be zero.";

  return `Humanize this text to sound like authentic writing by a real person from the 1990s — before AI tools existed. Apply all humanization rules.

${variationGuide}${meaningGuide}

CRITICAL: Create EXTREME sentence length variation in every paragraph. Mix 4-9 word sentences with 30-50 word sentences.
PROTECT: Copy ALL content inside brackets [like this] exactly as-is.
PARAGRAPHS: Preserve all paragraph breaks exactly. Keep the same number of paragraphs.

Text:
${text}`;
}

// ── Phase 3: Constraint / Polish Layer ──
// Role: Enforce rules (sentence count, tone, no AI smoothness), final cleanup

function buildPhase3System(features: InputFeatures): string {
  const contractionConstraint = features.hasContractions
    ? "- You MAY use contractions naturally"
    : "- Do NOT use contractions";
  const firstPersonConstraint = features.hasFirstPerson
    ? "- You may use first-person pronouns where appropriate"
    : "- Do NOT use first-person pronouns (I, we, me, us, my, our)";
  const rhetoricalConstraint = features.hasRhetoricalQuestions
    ? "- You may use rhetorical questions sparingly"
    : "- Do NOT use rhetorical questions or sentences ending with question marks";

  return `You are a final-pass quality reviewer. Your job is ONLY to:
1. Fix any remaining awkward phrasing
2. Ensure consistency with the text's subject domain and register
3. Remove any overly polished or mechanical-sounding passages — the result should read like authentic 1990s-era writing
4. Verify logical connections between arguments
5. Remove any modern corporate or tech buzzwords (post-2000 language)

STRICT RULES:
- Make ONLY minimal edits — do NOT rewrite extensively
- Protect ALL content inside brackets [like this] exactly as-is
- CRITICAL: The text contains placeholder tokens like [[PROT_0]], [[PROT_1]], [[TRM_0]], etc. These represent protected values. Copy them EXACTLY as-is in your output. Do not remove, modify, or explain them.
${contractionConstraint}
${firstPersonConstraint}
${rhetoricalConstraint}
- Do NOT change paragraph structure
- Do NOT add or remove ideas
- Preserve sentence count within ±5%
- Return only the polished text`;
}

function buildPhase3Prompt(text: string, originalSentCount: number): string {
  const currentSentCount = robustSentenceSplit(text).length;
  return `Review and polish this text. Make only minimal edits for academic quality.

Original had ${originalSentCount} sentences. Current has ${currentSentCount}. Keep it close.

Text:
${text}`;
}

// ══════════════════════════════════════════════════════════════════════════
// SENTENCE-LEVEL LLM REWRITE (Combined 3-Phase)
// Instead of 3 separate full-text LLM passes, each sentence gets a SINGLE
// LLM call that combines structural rewrite + humanization + polish.
// Adjacent sentences provided as read-only context for coherence.
// ══════════════════════════════════════════════════════════════════════════

// ── 20+ rotating academic-student system prompts for Ninja sentence rewrite ──
// Each prompt simulates a university student writing an assignment targeting an excellent score.
// The rotation prevents pattern detection and produces naturally varied academic prose.

const NINJA_STUDENT_PROMPTS: string[] = [
  // 1 — The Britannica archivist
  `You are an archivist contributing a sentence to a pre-2000 print encyclopedia. You write with supreme factual density and objective clarity. Your prose is completely devoid of filler, transitionary fluff, or conversational voice. You anchor sentences around specific entities, dates, and core concepts, ensuring excellent structural permanence.`,

  // 2 — The early Wikipedia contributor
  `You are drafting a sentence for an early Wikipedia article (circa 2002). Your tone is dry, informative, and structurally direct. You avoid "marketing speak" and instead ensure that the core subjects of the sentence are positioned logically at the front or end. There is absolutely no subjectivity or unnecessary padding in your writing.`,

  // 3 — The factual academic
  `You are an academic researcher preparing an entry for an academic glossary. Every word must serve a factual, informative purpose. Your sentence structure varies naturally—some short and punchy, others containing dense appositive clauses—but you never resort to mechanical connectors like "Furthermore" or "Additionally."`,

  // 4 — The historical cataloguer
  `You are cataloguing information for a historical reference book. Your style is stark, direct, and heavily nominal (relying on strong nouns rather than flowery adjectives). The reader should feel they are reading an authoritative reference work, not a student essay or a blog post. Focus intensely on keeping the entities intact.`,

  // 5 — The objective chronicler
  `You are an objective chronicler summarizing complex data for a reference manual. Your writing isolates the core facts and presents them with syntactical economy. The sentence should flow through factual linkage rather than conversational transitions. Avoid any phrasing that sounds like it is trying to persuade the reader.`,

  // 6 — The reference book editor
  `You are the chief editor of a mid-1990s scientific or historical reference book. You ruthlessly cut "AI-sounding" buzzwords and replace them with concrete, precise terminology. Your sentences vary dramatically in length, allowing for short declarative facts followed by expansive, detailed explanatory clauses.`,

  // 7 — The systematic classifier
  `You are a systematic classifier writing a definitive summary. Your prose is highly structured and objective. You never use rhetorical questions, and you never use "we" or "our" unless explicitly mandated. You write as if the text will be engraved in a static, pre-digital encyclopedia.`,

  // 8 — The authoritative expert
  `You are an authoritative expert contributing to an encyclopedic volume. Your tone is serious, restrained, and profoundly informative. You structure the sentence to maximize the density of keywords and factual entities, providing a deeply readable but completely unopinionated flow.`,

  // 9 — The vintage encyclopedist
  `You are a vintage encyclopedist from the 1980s or 1990s. Your writing is classical, formal, and slightly dry. You employ varied sentence boundaries—sometimes utilizing a semicolon or an appositive phrase—to manage flow naturally. You refuse to use modern corporate language entirely.`,

  // 10 — The technical manual writer
  `You are a writer for a highly precise technical or historical manual. You remove all conversational hedging ("it is important to note", "interestingly") and replace it with direct statements of fact. The prose is clean, dense, and structurally varied, maximizing factual throughput.`,

  // 11 — The objective summarizer
  `You are an objective summarizer drafting a section of an encyclopedic overview. You use varied sentence starters, deliberately avoiding conjunctions. Your paragraphs hold tight to their thematic subjects, exhibiting high entity density and strong structural integrity.`,

  // 12 — The early wiki administrator
  `You are an administrator of an early, stringent wiki platform. You write with the intent to provide purely factual, NPOV (neutral point of view) text. You strip out any persuasive language or artificial transitions, allowing the facts themselves to guide the flow of the sentence.`,

  // 13 — The archival historian
  `You are an archival historian compiling an encyclopedic entry. Your phrasing is slightly traditional, heavily utilizing concrete nouns and precise verbs. You avoid "essay syntax" and instead write with the authority of an established, objective reference work.`,

  // 14 — The encyclopedic synthesist
  `You are synthesizing multiple facts into a single, cohesive encyclopedia sentence. You excel at blending clauses seamlessly without using mechanical connecting words. Your sentence structures are complex but perfectly legible, exhibiting excellent flow through topical continuity.`,

  // 15 — The reference compiler
  `You are compiling data for an offline reference database. Your sentences are modular, independent, and fiercely factual. They do not rely on the surrounding context to make grammatical sense, and they never use buzzwords that degrade the informational density of the text.`,

  // 16 — The factual editor
  `You are a factual editor revising text for an encyclopedia. You strip away all opinion and conversational tone. Your writing is highly legible, preferring active voice and strong entities to passive constructions or flowery language. Your output reads as permanently authoritative.`,

  // 17 — The classical scholar
  `You are a classical scholar writing a summary for a reference tome. Your prose is robust, utilizing classical academic phrasing that feels timeless. You avoid modern buzzwords entirely, focusing instead on structural variation and factual accuracy.`,

  // 18 — The textbook author
  `You are a pre-2000 textbook author. Your goal is to convey information efficiently and clearly. Your sentences are varied in length—some simple and direct, others compound and detailed—providing an engaging but strictly academic rhythm.`,

  // 19 — The informational writer
  `You are an informational writer crafting dense, keyword-rich summaries. Your writing naturally weaves entities and core concepts into the subject and object of the sentence, avoiding prepositional bloat or unnecessary adverbial phrases. The result is pure, high-quality information.`,

  // 20 — The objective surveyor
  `You are an objective surveyor presenting a broad factual overview. Your tone is distinctly encyclopedic: dispassionate, comprehensive, and clear. You do not try to engage the reader emotionally; you engage them through the sheer quality and density of the facts presented.`,

  // 21 — The dictionary contributor
  `You are a contributor to a definitive academic dictionary or encyclopedia. Every word is chosen for its precision. You avoid "fluff" and "filler" at all costs. Your sentences are structurally sound and exhibit natural, human-like variation without losing their formal rigor.`,

  // 22 — The peer-reviewed editor
  `You are an editor for a highly respected, pre-digital reference publication. You ensure that sentences do not start with predictable AI patterns ("This", "These", "Furthermore"). Instead, you use natural chronological, spatial, or topical fronting to begin sentences.`,

  // 23 — The encyclopedic chronologist
  `You are an encyclopedic chronologist ordering facts precisely. You write with an awareness of flow, but your transitions are logical rather than mechanical. You are allergic to modern corporate buzzwords and exclusively use classical, precise academic terminology.`,

  // 24 — The definitive author
  `You are the definitive author of a specific encyclopedia entry. You write with absolute authority and factual density. Your sentence commands the reader's attention through its clear, objective, and information-packed structure, reflecting excellent natural SEO flow.`,
];

// Counter for round-robin prompt selection
let _ninjaPromptIndex = 0;

function normalizeNinjaTone(tone: string): "wikipedia" | "academic" | "seo" | "professional" | "simple" | "technical" | "creative" | "neutral" {
  const normalized = tone.trim().toLowerCase();
  if (normalized.includes("wiki")) return "wikipedia";
  if (normalized.includes("academic")) return "academic";
  if (normalized.includes("seo") || normalized.includes("blog")) return "seo";
  if (normalized.includes("professional")) return "professional";
  if (normalized.includes("simple")) return "simple";
  if (normalized.includes("technical")) return "technical";
  if (normalized.includes("creative")) return "creative";
  return "neutral";
}

function getNinjaToneLabel(tone: string): string {
  switch (normalizeNinjaTone(tone)) {
    case "wikipedia":
      return "a neutral encyclopedic reference work";
    case "academic":
      return "an academic article or research discussion";
    case "seo":
      return "a strong blog or SEO article";
    case "professional":
      return "a professional analysis or briefing";
    case "simple":
      return "a plain-language explainer";
    case "technical":
      return "a technical document or engineering report";
    case "creative":
      return "a creative or literary piece";
    default:
      return "a clear human-written article";
  }
}

function getNinjaToneDirective(tone: string): string {
  switch (normalizeNinjaTone(tone)) {
    case "wikipedia":
      return "Use third-person, factual, reference-style prose. Keep the delivery dry, precise, and detached.";
    case "academic":
      return "Use a measured academic register. Keep the prose clear, evidence-led, and readable rather than stiff or over-formal.";
    case "seo":
      return "Write with smooth blog flow. Keep the topic terms and entities visible, explain points clearly, avoid hype, and make the sentence easy to continue reading.";
    case "professional":
      return "Write with direct professional clarity. Keep the sentence efficient, grounded, and free of padding.";
    case "simple":
      return "Use plain, highly readable wording. Prefer direct syntax and short concrete words where possible.";
    case "technical":
      return "Write with precise technical clarity. Preserve all technical terms, specifications, and code references exactly. Keep prose structured and methodical.";
    case "creative":
      return "Preserve the author's creative voice. Maintain literary devices, intentional style choices, and emotional texture. Focus on making the prose sound authentically human.";
    default:
      return "Write with natural article flow. Balance clarity, information density, and readable cadence without sounding scripted.";
  }
}

function getNinjaSentenceSystemPrompt(features: InputFeatures, tone: string, domainGuidance?: string): string {
  const contractionConstraint = features.hasContractions
    ? "You MAY use contractions naturally."
    : "Do NOT use contractions. Write all words fully.";
  const firstPersonConstraint = features.hasFirstPerson
    ? "First-person pronouns OK where appropriate."
    : "Do NOT use first-person pronouns (I, we, me, us, my, our).";
  const rhetoricalConstraint = features.hasRhetoricalQuestions
    ? ""
    : "No rhetorical questions.";

  // Pick a rotating student persona prompt
  const studentPersona = NINJA_STUDENT_PROMPTS[_ninjaPromptIndex % NINJA_STUDENT_PROMPTS.length];
  _ninjaPromptIndex++;

  return `${studentPersona}

You are rewriting a SINGLE sentence for ${getNinjaToneLabel(tone)}. Your goal is to sound unmistakably human while staying informative, smooth, and structurally varied.

TONE TARGET:
${getNinjaToneDirective(tone)}
${domainGuidance ? `\nDOMAIN GUIDANCE:\n${domainGuidance}` : ''}

STRUCTURAL TECHNIQUES (use naturally when they improve flow — do NOT force every technique):
- CLAUSE FRONTING: Occasionally move subordinate clauses to the beginning
- VOICE SHIFT: Swap active/passive only where it sounds more natural
- CONJUNCTION ROTATION: Vary linking words occasionally
- CONDITIONAL SWAPS: "if" → "when"/"provided that" where appropriate
- PHRASE EXPANSION/COMPRESSION: Adjust phrasing density for natural rhythm
Do NOT apply these mechanically to every sentence. Some sentences should stay simple and direct.

FLOW RULES:
- Write as a human subject-matter writer, NOT as an AI or a corporate marketer.
- Keep key entities, terms, and topic words present in natural positions so the paragraph stays informative.
- Avoid fluff, sales phrasing, and generic transition padding.
- Vary your sentence length naturally: mix shorter observations with longer analytical sentences.
- If the tone is academic, use measured caution where honest. If the tone is blog/SEO, prefer clarity and forward movement over hedging.

STRICT RULES:
- Rewrite ONLY the sentence marked [TARGET]. [BEFORE] and [AFTER] are read-only context.
- Return ONLY the rewritten sentence — no labels, no commentary, no quotes.
- OUTPUT EXACTLY ONE SENTENCE. Do NOT split into multiple sentences or merge with context.
- BANNED WORDS: utilize, facilitate, leverage, comprehensive, multifaceted, paramount, furthermore, moreover, additionally, consequently, subsequently, nevertheless, notwithstanding, aforementioned, paradigm, trajectory, discourse, robust, nuanced, pivotal, intricate, transformative, innovative, groundbreaking, mitigate, streamline, optimize, bolster, catalyze, delve, embark, foster, harness, spearhead, unravel, unveil, tapestry, cornerstone, nexus, myriad, plethora, realm, landscape, methodology, framework, holistic, salient, ubiquitous, meticulous, profound
- BANNED STARTERS: "Furthermore," "Moreover," "Additionally," "However," "Nevertheless," "Consequently," "It is"
- BANNED PHRASES: "plays a crucial role", "it is important to note", "a wide range of", "in today's world", "due to the fact that", "in order to", "it should be noted that"
- Use everyday academic words: "use" not "utilize", "help" not "facilitate", "strong" not "robust"
- ${contractionConstraint}
- ${firstPersonConstraint}
- ${rhetoricalConstraint}
- CRITICAL: Preserve all placeholder tokens like [[PROT_0]], [[TRM_0]] exactly as-is.
- Keep all factual content, data, citations, technical terms exactly.
- WORD COUNT: Output must stay within ±15% of the original. Do NOT pad or drastically shorten.
- SYNONYM REPLACEMENT: Naturally vary vocabulary — do not mechanically replace every word, but avoid leaving the sentence too similar to the original.
- Do NOT hallucinate or invent information not present in the original.
- Do NOT add explanatory phrases, hedging clauses, or extra context beyond what the original states.`;
}

function buildNinjaSentenceUserPrompt(
  sentence: string,
  prevSentence: string | null,
  nextSentence: string | null,
  strength: string,
  tone: string,
): string {
  let variationGuide = "";
  if (strength === "strong") variationGuide = "Rewrite aggressively — change structure and vocabulary substantially.";
  else if (strength === "medium") variationGuide = "Rewrite moderately — change phrasing and some structure.";
  else variationGuide = "Rewrite lightly — change vocabulary and minor phrasing.";

  let toneGuide = "";
  switch (normalizeNinjaTone(tone)) {
    case "academic":
      toneGuide = "Maintain an academic register with natural rhythm. Keep the reasoning careful and the wording readable.";
      break;
    case "seo":
      toneGuide = "Keep the sentence smooth for blog readers. Preserve core entities and keywords naturally, but never stuff them or sound promotional.";
      break;
    case "wikipedia":
      toneGuide = "Keep the sentence neutral, factual, and third-person. Avoid opinion, persuasion, or conversational asides.";
      break;
    case "professional":
      toneGuide = "Keep the sentence direct, concise, and information-led.";
      break;
    case "simple":
      toneGuide = "Keep the sentence plain, easy to follow, and concrete.";
      break;
    default:
      toneGuide = "Keep the sentence natural, smooth, and informative.";
  }

  const contextBefore = prevSentence ? `[BEFORE]: ${prevSentence}\n` : "";
  const contextAfter = nextSentence ? `\n[AFTER]: ${nextSentence}` : "";

  const wordCount = sentence.split(/\s+/).length;
  const minWords = Math.max(3, Math.floor(wordCount * 0.85));
  const maxWords = Math.ceil(wordCount * 1.15);

  return `${variationGuide}
TONE: ${toneGuide}
WORD RANGE: The original is ${wordCount} words. Your output MUST be between ${minWords} and ${maxWords} words. Do NOT drastically shorten it.

CRITICAL: Rewrite ONLY the [TARGET] sentence. Do NOT borrow, merge, or incorporate ANY content from [BEFORE] or [AFTER]. They are read-only context for tone continuity only. Your output must contain ONLY the meaning from [TARGET].

${contextBefore}[TARGET]: ${sentence}${contextAfter}`;
}

function smoothNinjaFlow(text: string, tone: string): string {
  let result = text;

  result = result.replace(/\bhow much \.\.\. matters\b/gi, "importance");
  result = result.replace(/\b(when|since|though|although|because|while|if|unless|after|before|until|once)\s+\1\b/gi, "$1");
  result = result.replace(/\b([A-Za-z]+)\s+\1\b/g, "$1");
  result = result.replace(/\bthe the\b/gi, "the");
  result = result.replace(/\bof of\b/gi, "of");
  result = result.replace(/\bto to\b/gi, "to");
  result = result.replace(/\s+,/g, ",");
  result = result.replace(/,\s*,/g, ",");
  result = result.replace(/\.\s*\./g, ".");

  if (normalizeNinjaTone(tone) === "seo") {
    result = result.replace(/\bIn conclusion,?\s+/gi, "");
    result = result.replace(/\bOverall,?\s+/gi, "");
    result = result.replace(/\bMoreover,?\s+/gi, "Also, ");
    result = result.replace(/\bFurthermore,?\s+/gi, "Also, ");
  }

  return result.replace(/ {2,}/g, " ").trim();
}

// ══════════════════════════════════════════════════════════════════════════
// DEEP AI CLEANING PHASE — LLM-based sentence-level AI signal removal
// Runs AFTER the initial student-persona rewrite and BEFORE post-processing.
// Targets residual AI patterns: uniform rhythm, predictable transitions,
// overly polished phrasing, and mechanical sentence structure.
// ══════════════════════════════════════════════════════════════════════════

const DEEP_AI_CLEAN_SYSTEM = `You are a reference text copy-editor reviewing an encyclopedic draft. Your ONLY job is to remove any traces of AI-generated or machine-polished writing while keeping the factual, objective quality intact.

DETECT AND FIX these AI signals:
1. PREDICTABLE RHYTHM: If the sentence has a mechanical cadence (subject-verb-object repeated uniformly), break it with a clause insertion, inversion, or temporal aside.
2. OVER-SMOOTH TRANSITIONS: Replace any transition that sounds templated ("This demonstrates that", "It is evident that", "This suggests that") with a direct factual statement.
3. MARKETING/CORPORATE UNIFORMITY: Strip away flowery adjectives or corporate buzzwords. Substitute with concrete, precise, encyclopedic nouns.
4. PASSIVE CONSTRUCTION OVERUSE: If the sentence is needlessly passive, make it active and direct.
5. FORMULAIC HEDGING: Replace "It can be argued that" with direct statements. Replace "It is worth noting that" with nothing — just state the point.
6. PERFECT PARALLELISM: If lists or comparisons are too symmetrical, make them slightly asymmetric — natural writing is rarely mathematically perfect.
7. SENTENCE-INITIAL PATTERNS: If starting with a common AI opener (This, These, Such, The, It is), rework the opening to start with the core entity or conceptual subject.

ABSOLUTE RULES:
- Output EXACTLY ONE sentence. Never split or merge.
- Return ONLY the cleaned sentence — no labels, commentary, or quotes.
- Keep ALL factual content, citations, data, and technical terms unchanged.
- Preserve placeholder tokens like [[PROT_0]], [[TRM_0]] exactly.
- Stay within ±10% of the input word count.
- Do NOT introduce new information or remove existing claims.
- The result must read as a high-quality, pre-2000 publication: dense, factual, and strictly objective.
- Do NOT use: utilize, facilitate, leverage, comprehensive, multifaceted, robust, nuanced, pivotal, transformative, innovative, groundbreaking, furthermore, moreover, additionally, consequently, subsequently, nevertheless, paradigm, discourse, holistic, streamline, optimize, mitigate, delve, foster, harness, spearhead, unveil, myriad, plethora, realm, landscape, framework, methodology`;

function buildDeepAICleanUserPrompt(sentence: string, prevSentence: string | null, nextSentence: string | null): string {
  const contextBefore = prevSentence ? `[CONTEXT BEFORE]: ${prevSentence}\n` : "";
  const contextAfter = nextSentence ? `\n[CONTEXT AFTER]: ${nextSentence}` : "";
  const wordCount = sentence.split(/\s+/).length;

  return `Clean this sentence of any remaining AI signals. Keep it factual, objective, and dense with entities — like a pre-2000 reference text.
WORD COUNT: ~${wordCount} words (stay within ±10%).

${contextBefore}[CLEAN THIS]: ${sentence}${contextAfter}`;
}

/**
 * Deep AI Cleaning pass — runs each sentence through a dedicated LLM call
 * to strip residual AI patterns after the initial student-persona rewrite.
 * This is the "deep cleaning phase" before post-processing.
 */
export async function deepAICleanSentences(
  text: string,
  features: InputFeatures,
): Promise<string> {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

  const cleanedParagraphs = await Promise.all(paragraphs.map(async (para) => {
    const trimmedPara = para.trim();
    if (isTitleOrHeading(trimmedPara)) return trimmedPara;

    const sentences = robustSentenceSplit(trimmedPara);
    if (sentences.length === 0) return trimmedPara;

    const cleanedSentences = await Promise.all(sentences.map(async (sent, idx) => {
      const trimmed = sent.trim();
      if (!trimmed || trimmed.split(/\s+/).length < 4) return trimmed;
      if (isTitleOrHeading(trimmed)) return trimmed;

      const prevSent = idx > 0 ? sentences[idx - 1] : null;
      const nextSent = idx < sentences.length - 1 ? sentences[idx + 1] : null;

      const userPrompt = buildDeepAICleanUserPrompt(trimmed, prevSent, nextSent);
      const temp = 0.65 + (Math.random() * 0.15);
      const maxTokens = Math.max(200, Math.ceil(trimmed.split(/\s+/).length * 2.5));

      try {
        let cleaned = await llmCall(DEEP_AI_CLEAN_SYSTEM, userPrompt, temp, maxTokens);
        if (!cleaned || cleaned.trim().length < trimmed.length * 0.3) return trimmed;
        cleaned = cleaned.replace(/^\[CLEAN THIS\]:\s*/i, "").trim();
        // Enforce single sentence
        cleaned = enforceSingleSentence(cleaned);
        // Enforce capitalization
        cleaned = enforceCapitalization(trimmed, cleaned);
        return cleaned;
      } catch {
        return trimmed;
      }
    }));

    return cleanedSentences.join(" ");
  }));

  return cleanedParagraphs.join("\n\n");
}

/**
 * Per-sentence deep AI cleaning — uses GPT-4o mini (fallback Groq).
 * For use in route.ts pipeline phases.
 * Takes a single sentence and returns a cleaned version.
 */
export async function deepAICleanOneSentence(sentence: string): Promise<string> {
  const trimmed = sentence.trim();
  if (!trimmed || trimmed.split(/\s+/).length < 4) return trimmed;
  if (isTitleOrHeading(trimmed)) return trimmed;

  const userPrompt = buildDeepAICleanUserPrompt(trimmed, null, null);
  const temp = 0.65 + (Math.random() * 0.15);
  const maxTokens = Math.max(200, Math.ceil(trimmed.split(/\s+/).length * 2.5));

  try {
    let cleaned = await llmCallWithFallback(DEEP_AI_CLEAN_SYSTEM, userPrompt, temp, maxTokens);
    if (!cleaned || cleaned.trim().length < trimmed.length * 0.3) return trimmed;
    cleaned = cleaned.replace(/^\[CLEAN THIS\]:\s*/i, "").trim();
    cleaned = enforceSingleSentence(cleaned);
    cleaned = enforceCapitalization(trimmed, cleaned);
    return cleaned;
  } catch {
    return trimmed;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// RESTRUCTURING PHASE — Deep sentence-level structural transformation
// Every sentence gets its clause order, voice, and presentation rewritten.
// ══════════════════════════════════════════════════════════════════════════

const RESTRUCTURE_SYSTEM = `You are an expert academic editor specialising in sentence restructuring. Your SOLE job is to deeply restructure the presentation of a single sentence — change its clause order, voice, and syntactic frame — while keeping every fact, citation, and technical term intact.

RESTRUCTURING TECHNIQUES (apply one or more):
1. CLAUSE REORDERING — Move subordinate clauses to the front or end, swap subject-complement positions
2. VOICE CHANGE — Switch active ↔ passive, or use impersonal constructions ("It is..." / "There is...")
3. NOMINALISATION SWAP — Convert verb phrases to noun phrases or vice-versa (e.g. "measures X" → "measurement of X")
4. RELATIVE CLAUSE TRANSFORMATION — Convert participial phrases to which-/that- clauses or vice-versa
5. ADVERBIAL FRONTING — Move time/place/manner adverbs to sentence start
6. SENTENCE TYPE CHANGE — Convert simple → complex or complex → compound sentence structures
7. NATURAL SYNONYM REPLACEMENT — Replace 30-60% of non-technical words with natural academic alternatives

STRICT RULES:
- Output EXACTLY one sentence (no splitting into multiple sentences)
- Preserve ALL citations [1], [2], (Author, Year), etc. — copy verbatim
- Preserve ALL technical terms, proper nouns, measurements, and formulas
- Preserve ALL placeholder tokens like [[PROT_0]], [[TRM_0]], etc. — copy exactly
- The restructured sentence MUST convey the same meaning
- Do NOT add new information or opinions
- Do NOT use AI-typical words: utilize, facilitate, leverage, comprehensive, multifaceted, paradigm, trajectory, discourse, robust, nuanced, pivotal, delve, foster, harness, underscore, bolster, streamline, furthermore, moreover, additionally, consequently, subsequently, nevertheless
- Return ONLY the restructured sentence, nothing else`;

function buildRestructurePrompt(sentence: string): string {
  return `Restructure the following sentence by changing its clause order, voice, and presentation. Keep all facts, citations, and technical terms. Output only the restructured sentence.

SENTENCE:
${sentence}`;
}

/**
 * Restructure a single sentence via LLM — tries GPT-4o mini first,
 * falls back to Groq. Changes clause order, voice, and syntactic frame
 * while preserving meaning, citations, and technical terms.
 */
export async function restructureSentence(sentence: string): Promise<string> {
  const trimmed = sentence.trim();
  if (!trimmed || trimmed.split(/\s+/).length < 5) return trimmed;
  if (isTitleOrHeading(trimmed)) return trimmed;

  // Convert ⟦PROTn⟧ placeholders → [[PROT_n]] so LLMs preserve them correctly
  const llmInput = placeholdersToLLMFormat(trimmed);
  const userPrompt = buildRestructurePrompt(llmInput);
  const temp = 0.7 + (Math.random() * 0.15);
  const maxTokens = Math.max(200, Math.ceil(trimmed.split(/\s+/).length * 3));

  try {
    let result = await llmCallWithFallback(RESTRUCTURE_SYSTEM, userPrompt, temp, maxTokens);
    if (!result || result.trim().length < llmInput.length * 0.3) return trimmed;
    result = result.replace(/^["']|["']$/g, '').trim();
    // Convert [[PROT_n]] back to ⟦PROTn⟧ so the outer restoreSpecialContent can resolve them
    result = llmFormatToPlaceholders(result);
    result = enforceSingleSentence(result);
    result = enforceCapitalization(trimmed, result);
    return result;
  } catch {
    return trimmed;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// NURU READABILITY POLISH — Post-Nuru smoothing for natural human flow
// Uses GPT-4o mini (fallback Groq) with a light touch to fix awkward
// collocations and mechanical-sounding phrases produced by Nuru's
// dictionary-based transforms, without restructuring or adding content.
// ══════════════════════════════════════════════════════════════════════════

const NURU_READABILITY_SYSTEM = `You are a copy-editor reviewing a sentence that went through automated word-substitution. Your ONLY job is to make it read naturally — like something a real person wrote — by fixing awkward word pairings or mechanical-sounding constructions.

STRICT RULES:
- Fix ONLY unnatural collocations, mechanical phrasing, or stilted constructions.
- Do NOT restructure, rewrite, or change the meaning.
- Do NOT add any new ideas, facts, or context.
- Do NOT remove existing facts, citations, or technical terms.
- Do NOT use AI buzzwords: utilize, facilitate, leverage, comprehensive, multifaceted, furthermore, moreover, additionally, consequently, nevertheless, robust, nuanced, pivotal, intricate, transformative, innovative, paradigm, trajectory, holistic, streamline, optimize, mitigate, bolster, catalyze, foster, harness, underscore, exemplify.
- Do NOT use banned starters: "Furthermore," "Moreover," "Additionally," "However," "Consequently," "It is important to note"
- Keep sentence length within ±10% of the input.
- Preserve ALL placeholder tokens like [[PROT_0]], [[TRM_0]] exactly as-is.
- Output EXACTLY ONE sentence. No labels, no commentary, no quotation marks.
- If the sentence already reads naturally, return it unchanged.`;

function buildNuruReadabilityPrompt(sentence: string): string {
  const wordCount = sentence.split(/\s+/).length;
  return `Smooth this sentence so it reads naturally as written by a real person. Fix only awkward word pairings. Keep ALL content and meaning intact.
WORD COUNT: ~${wordCount} words (stay within ±10%).

SENTENCE: ${sentence}`;
}

/**
 * Nuru Readability Polish — per-sentence LLM smoothing pass.
 * Runs after Nuru stealth transforms to fix mechanical-sounding output.
 * Uses GPT-4o mini first, falls back to Groq.
 * Exported for use in route.ts phase pipelines.
 */
export async function nuruReadabilityPolish(sentence: string): Promise<string> {
  const trimmed = sentence.trim();
  if (!trimmed || trimmed.split(/\s+/).length < 5) return trimmed;
  if (isTitleOrHeading(trimmed)) return trimmed;

  // Convert ⟦PROTn⟧ placeholders → [[PROT_n]] so LLMs preserve them correctly
  const llmInput = placeholdersToLLMFormat(trimmed);
  const userPrompt = buildNuruReadabilityPrompt(llmInput);
  const temp = 0.35 + (Math.random() * 0.10); // Low temp for conservative smoothing
  const maxTokens = Math.max(150, Math.ceil(trimmed.split(/\s+/).length * 2));

  try {
    let result = await llmCallWithFallback(NURU_READABILITY_SYSTEM, userPrompt, temp, maxTokens);
    if (!result || result.trim().length < llmInput.length * 0.5) return trimmed;
    result = result.replace(/^["']|["']$/g, '').trim();
    result = result.replace(/^SENTENCE:\s*/i, '').trim();
    // Convert [[PROT_n]] back to ⟦PROTn⟧ so the outer restoreSpecialContent can resolve them
    result = llmFormatToPlaceholders(result);
    result = enforceSingleSentence(result);
    result = enforceCapitalization(trimmed, result);
    return result;
  } catch {
    return trimmed;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// LAYER 2: RULE-BASED / DETERMINISTIC PROCESSING
// ══════════════════════════════════════════════════════════════════════════

// ── AI Vocabulary Elimination ──

const AI_WORD_KILL: Record<string, string[]> = {
  utilize: ["use"], utilise: ["use"], leverage: ["use", "draw on", "rely on"],
  facilitate: ["help", "support", "allow"], comprehensive: ["broad", "full", "thorough"],
  multifaceted: ["complex", "layered"], paramount: ["central", "most important"],
  furthermore: ["also", "and"], moreover: ["also", "and", "plus"],
  additionally: ["also", "and"], consequently: ["so", "because of this"],
  subsequently: ["then", "later", "after that"], nevertheless: ["still", "even so", "yet"],
  notwithstanding: ["despite", "even with"], aforementioned: ["earlier", "previous"],
  paradigm: ["model", "approach"], trajectory: ["path", "course", "direction"],
  discourse: ["discussion", "debate"], dichotomy: ["divide", "split"],
  conundrum: ["problem", "puzzle"], ramification: ["effect", "result"],
  underpinning: ["basis", "root"], synergy: ["combined effort", "teamwork"],
  robust: ["strong", "solid"], nuanced: ["detailed", "subtle"],
  salient: ["key", "main"], ubiquitous: ["common", "widespread"],
  pivotal: ["key", "central"], intricate: ["complex", "detailed"],
  meticulous: ["careful", "thorough"], profound: ["deep", "serious"],
  inherent: ["built-in", "natural"], overarching: ["main", "broad"],
  substantive: ["real", "meaningful"], efficacious: ["effective"],
  holistic: ["whole", "complete"], transformative: ["major", "radical"],
  innovative: ["new", "fresh"], groundbreaking: ["pioneering"],
  noteworthy: ["worth noting", "interesting"], proliferate: ["spread", "grow"],
  exacerbate: ["worsen", "make worse"], ameliorate: ["improve", "ease"],
  engender: ["create", "produce"], delineate: ["describe", "outline"],
  elucidate: ["explain", "clarify"], illuminate: ["shed light on", "show"],
  necessitate: ["require", "call for"], perpetuate: ["keep going", "continue"],
  underscore: ["highlight", "stress"], exemplify: ["show", "demonstrate"],
  encompass: ["include", "cover"], bolster: ["support", "strengthen"],
  catalyze: ["trigger", "spark"], streamline: ["simplify", "cut down on"],
  optimize: ["improve", "fine-tune"], mitigate: ["reduce", "lessen"],
  navigate: ["handle", "work through"], prioritize: ["focus on", "put first"],
  articulate: ["express", "state"], substantiate: ["back up", "support"],
  corroborate: ["confirm", "back up"], disseminate: ["spread", "share"],
  cultivate: ["develop", "grow"], ascertain: ["find out", "determine"],
  endeavor: ["try", "attempt"], delve: ["dig into", "look into"],
  embark: ["start", "begin"], foster: ["encourage", "support"],
  harness: ["use", "tap into"], spearhead: ["lead", "drive"],
  unravel: ["untangle", "figure out"], unveil: ["reveal", "show"],
  tapestry: ["mix", "web"], cornerstone: ["foundation", "core"],
  bedrock: ["base", "foundation"], linchpin: ["key piece", "core"],
  nexus: ["connection", "link"], spectrum: ["range", "spread"],
  myriad: ["many", "lots of"], plethora: ["many", "a lot of"],
  multitude: ["many", "a lot of"], landscape: ["scene", "field"],
  realm: ["area", "field"], culminate: ["end in", "lead to"],
  enhance: ["improve", "boost"], crucial: ["key", "important"],
  vital: ["key", "essential"], imperative: ["necessary", "urgent"],
  notable: ["worth noting", "interesting"], significant: ["important", "big", "major"],
  substantial: ["large", "real", "major"], remarkable: ["striking", "surprising"],
  considerable: ["large", "big"], unprecedented: ["never-before-seen", "new"],
  methodology: ["method", "approach"], framework: ["structure", "system"],
  implication: ["effect", "result"], implications: ["effects", "consequences"],
  notably: ["especially", "in particular"], specifically: ["in particular"],
  crucially: ["importantly"], essentially: ["basically", "at its core"],
  fundamentally: ["at its root", "basically"], arguably: ["probably"],
  undeniably: ["clearly"], undoubtedly: ["clearly", "no question"],
  interestingly: ["curiously", "what stands out is"], remarkably: ["surprisingly"],
  evidently: ["clearly"], catalyst: ["trigger", "spark", "driver"],
};

const AI_PHRASE_KILL: [RegExp, string][] = [
  [/\bit is (?:important|crucial|essential|vital|imperative|worth noting|notable) (?:to note |to mention |to emphasize |to stress |to recognize |to acknowledge |to highlight |to consider )?that\b/gi, ""],
  [/\bit (?:should|must|can|cannot|could|may) be (?:noted|argued|said|emphasized|stressed|acknowledged|recognized|observed|mentioned|highlighted|pointed out) that\b/gi, ""],
  [/\bin today'?s (?:world|society|landscape|era|age|environment|climate|context)\b/gi, "right now"],
  [/\bin the (?:modern|current|contemporary|present-day|digital) (?:era|age|world|landscape|context)\b/gi, "today"],
  [/\bplays? a (?:crucial|vital|key|significant|important|pivotal|critical|fundamental|instrumental|central|essential|major) role(?: in)?\b/gi, "matters"],
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
  [/\bthe (?:importance|significance|impact|relevance|value) of\b/gi, "how much ... matters"],
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
  [/\bthere is a (?:growing |increasing )?need (?:for|to)\b/gi, "the need is"],
  [/\bsheds? light on\b/gi, "clears up"],
  [/\bpaves? the way for\b/gi, "opens the door to"],
  [/\braises? important questions?\b/gi, "brings up questions"],
];

function killAIVocabulary(text: string): string {
  // Delegate to shared dictionaries (120+ AI words, 48+ phrase patterns)
  let result = applyAIWordKill(text);
  // Also apply expanded phrase patterns (500K+ variations from 9 categories:
  // verb phrases, modifiers, clause rephrasings, hedging, transitions,
  // quantifiers, temporal, causal, emphasis patterns)
  result = applyPhrasePatterns(result);
  // Cleanup
  result = result.replace(/ {2,}/g, " ");
  // Only capitalize within lines — never match across paragraph breaks (\n\n)
  result = result.replace(/\.[ \t]+([a-z])/g, (_, ch) => ". " + ch.toUpperCase());
  result = result.replace(/^[ \t]+/gm, "");
  result = result.replace(/,\s*,/g, ",");
  return result;
}

// ── Connector Naturalization ──

const FORMAL_CONNECTORS: Record<string, string[]> = {
  "Furthermore, ": ["Also, ", "In addition, ", "Plus, "],
  "Moreover, ": ["On top of that, ", "In addition, ", "Beyond that, "],
  "Additionally, ": ["Also, ", "In addition, ", "Plus, "],
  "Consequently, ": ["So ", "Because of that, ", "That meant "],
  "Nevertheless, ": ["Still, ", "Even so, ", "All the same, "],
  "Nonetheless, ": ["Still, ", "Even so, ", "All the same, "],
  "In contrast, ": ["On the other hand, ", "Then again, ", "On the flip side, "],
  "Subsequently, ": ["After that, ", "Then ", "Later, "],
  "In conclusion, ": ["All in all, ", "When you put it together, "],
  "Therefore, ": ["So ", "That is why ", "This is why "],
  "However, ": ["Still, ", "Even so, ", "All the same, "],
  "Thus, ": ["So ", "That way, ", "This meant "],
  "Hence, ": ["So ", "That is why "],
  "Indeed, ": ["In fact, ", "Sure enough, "],
  "Accordingly, ": ["So ", "In response, "],
  "Notably, ": ["What stands out is ", "One thing worth noting: "],
  "Specifically, ": ["In particular, ", "To be exact, "],
  "As a result, ": ["So ", "Because of this, "],
  "For example, ": ["Take ", "Like ", "Consider "],
  "For instance, ": ["Take ", "Like ", "Say "],
  "On the other hand, ": ["Then again, ", "At the same time, "],
  "In other words, ": ["Put simply, ", "Basically, "],
};

function naturalizeConnectors(text: string): string {
  // Delegate to shared dictionaries (27+ formal connector patterns)
  return applyConnectorNaturalization(text);
}

// ── Starter Diversification ──

const AI_STARTERS = new Set([
  "furthermore", "moreover", "additionally", "consequently", "subsequently",
  "nevertheless", "notwithstanding", "accordingly", "thus", "hence",
  "indeed", "notably", "specifically", "crucially", "importantly",
  "essentially", "fundamentally", "arguably", "undeniably", "undoubtedly",
  "interestingly", "remarkably", "evidently",
]);

const NATURAL_REROUTES: string[] = [
  "On closer inspection,", "In practice,", "By that point,",
  "From that angle,", "Practically speaking,", "At its core,",
  "To put it differently,", "As things stood,", "On the ground,",
  "In real terms,", "Behind the scenes,", "With that shift,",
  "Looking closer,", "Broadly speaking,",
];

function diversifyStarters(text: string): string {
  // Sentence starters are handled per-sentence during individual processing.
  // No cross-sentence starter injection to preserve independent processing.
  return text;
}

// ── Sentence Count Enforcement ──

function enforceSentenceCount(text: string, targetCount: number): string {
  const paragraphs = text.split(/\n\s*\n/);
  let allSentences: string[] = [];
  const paraBreaks: number[] = []; // track para boundaries

  for (const para of paragraphs) {
    const p = para.trim();
    if (!p) continue;
    const sents = robustSentenceSplit(p);
    const startIdx = allSentences.length;
    allSentences.push(...sents);
    paraBreaks.push(allSentences.length);
  }

  const currentCount = allSentences.length;
  const tolerance = Math.ceil(targetCount * 0.05);

  if (Math.abs(currentCount - targetCount) <= tolerance) return text; // Close enough

  if (currentCount > targetCount + tolerance) {
    // Too many sentences — merge short adjacent ones
    const toMerge = currentCount - targetCount;
    let merged = 0;
    const result: string[] = [];
    let i = 0;
    while (i < allSentences.length) {
      if (merged < toMerge && i + 1 < allSentences.length) {
        const len1 = allSentences[i].split(/\s+/).length;
        const len2 = allSentences[i + 1].split(/\s+/).length;
        if (len1 < 15 && len2 < 15 && len1 + len2 <= 45) {
          const s1 = allSentences[i].replace(/\.\s*$/, "");
          const s2 = allSentences[i + 1];
          result.push(s1 + "; " + s2[0].toLowerCase() + s2.slice(1));
          merged++;
          i += 2;
          continue;
        }
      }
      result.push(allSentences[i]);
      i++;
    }
    allSentences = result;
  }

  // Reconstruct with original paragraph breaks (approximate)
  return allSentences.join(" ");
}

// ══════════════════════════════════════════════════════════════════════════
// LAYER 3: POST-PROCESSING FILTERS (Statistical Tweaks)
// ══════════════════════════════════════════════════════════════════════════

// ── Burstiness Enforcement ──

function enforceBurstiness(text: string): string {
  // Sentence order and count must be preserved — no splitting or reordering allowed.
  // Burstiness is achieved through per-sentence LLM processing, not post-hoc splitting.
  return text;
}

// ── Punctuation Humanization ──

function humanizePunctuation(text: string, features: InputFeatures): string {
  const paragraphs = text.split(/\n\s*\n/);
  const semicolonBudget = 3;
  const dashBudget = 4;
  const parenBudget = 2;

  const result = paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = robustSentenceSplit(p);
    const processed: string[] = [];

    for (let i = 0; i < sentences.length; i++) {
      const sent = sentences[i].trim();
      if (!sent) continue;
      const words = sent.split(/\s+/);

      // STRICT: No sentence merging — each sentence stays independent.
      // Semicolon merging disabled to preserve sentence count.

      // Em-dash injection DISABLED — produces unnatural patterns
      // Original code converted comma-separated asides to em-dash format

      // Comma-based hedging DISABLED — produces unnatural phrases that detectors flag

      processed.push(sent);
    }

    return processed.join(" ");
  }).filter(Boolean).join("\n\n");

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

function removeFirstPerson(text: string): string {
  let result = text;
  // Use natural, non-AI replacements — avoid "it is" constructions that trigger detectors
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
  // Only capitalize within lines — never match across paragraph breaks (\n\n)
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

// ── Paragraph Variance ──

function varyParagraphs(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  if (paragraphs.length < 3) return text;

  const lengths = paragraphs.map(p => p.split(/\s+/).length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const cvVal = Math.sqrt(lengths.reduce((a, l) => a + (l - avg) ** 2, 0) / lengths.length) / Math.max(avg, 1);

  if (cvVal > 0.30) return text;

  const result: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const sentences = robustSentenceSplit(para);

    if (sentences.length >= 6 && Math.random() < 0.5) {
      const splitPoint = Math.floor(sentences.length * (0.4 + Math.random() * 0.2));
      result.push(sentences.slice(0, splitPoint).join(" "));
      result.push(sentences.slice(splitPoint).join(" "));
    } else if (sentences.length <= 2 && i < paragraphs.length - 1) {
      const nextSentences = robustSentenceSplit(paragraphs[i + 1]);
      if (nextSentences.length <= 3) {
        result.push(sentences.concat(nextSentences).join(" "));
        i++;
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

// ── Dependency Depth Enrichment ──

function enrichDependencyDepth(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  let budget = 4;

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = robustSentenceSplit(p);
    const result: string[] = [];

    for (const sent of sentences) {
      const s = sent.trim();
      if (!s) continue;
      const words = s.split(/\s+/);

      if (budget > 0 && words.length >= 15 && words.length <= 30 && Math.random() < 0.4) {
        const nounPatterns = [
          /\b(the \w+)\b(?=\s+(?:has|have|had|is|are|was|were|can|could|will|would)\b)/i,
          /\b(this \w+)\b(?=\s+(?:has|have|had|is|are|was|were|can|could|will|would)\b)/i,
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
            result.push(s.slice(0, insertPoint) + clause + s.slice(insertPoint));
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

// ── Controlled Randomness Injection ──
// (Grammar inconsistencies that look human)

function injectControlledRandomness(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  let budget = 3;

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = robustSentenceSplit(p);
    const result: string[] = [];

    for (let i = 0; i < sentences.length; i++) {
      let sent = sentences[i].trim();
      if (!sent) continue;

      // Re-enabled with comma-based hedges only (no em-dashes or brackets)
      if (budget > 0 && Math.random() < 0.15) {
        const words = sent.split(/\s+/);

        // Strategy: Insert a hedging aside after a clause
        if (words.length > 12) {
          const hedges = [
            ", or at least that is the argument,",
            ", in broad terms,",
            ", to some extent,",
            ", admittedly,",
            ", in most cases,",
          ];
          const commaPositions: number[] = [];
          for (let j = 4; j < words.length - 4; j++) {
            if (words[j].endsWith(",")) commaPositions.push(j);
          }
          if (commaPositions.length > 0) {
            const pos = commaPositions[Math.floor(Math.random() * commaPositions.length)];
            const hedge = hedges[Math.floor(Math.random() * hedges.length)].trim();
            words.splice(pos + 1, 0, hedge);
            sent = words.join(" ");
            budget--;
          }
        }
      }

      result.push(sent);
    }

    return result.join(" ");
  }).filter(Boolean).join("\n\n");
}

// ── Final Surface Polish ──

function finalPolish(text: string): string {
  let result = text;

  result = result.replace(/ {2,}/g, " ");
  result = result.replace(/\s+([.,;:!?])/g, "$1");
  result = result.replace(/([.,;:!?])([A-Za-z])/g, "$1 $2");
  result = result.replace(/\.{2,}/g, ".");
  result = result.replace(/,{2,}/g, ",");
  result = result.replace(/;{2,}/g, ";");
  // Strip all em-dashes and en-dashes — replace with commas
  result = result.replace(/ — /g, ", ").replace(/—/g, ", ");
  result = result.replace(/ – /g, ", ").replace(/–/g, ", ");
  result = result.replace(/\(\s*\)/g, "");
  result = result.replace(/\[\s*\]/g, "");
  result = result.replace(/\b((?!very|much|so|more|had|that)\w{4,})\s+\1\b/gi, "$1");
  result = result.replace(/\ba ([aeiouAEIOU])/g, "an $1");
  result = result.replace(/\bA ([aeiouAEIOU])/g, "An $1");
  result = result.replace(/\ban ([bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ])/g, (match, letter) => {
    const exceptions = ["h"];
    return exceptions.includes(letter.toLowerCase()) ? match : "a " + letter;
  });
  // Only capitalize within lines — never match across paragraph breaks (\n\n)
  result = result.replace(/\.[ \t]+([a-z])/g, (_, ch) => ". " + ch.toUpperCase());
  result = result.replace(/^([a-z])/gm, (_, ch) => ch.toUpperCase());

  return result.trim();
}

// ══════════════════════════════════════════════════════════════════════════
// LAYER 4: SCORING / FEEDBACK LOOP
// ══════════════════════════════════════════════════════════════════════════

function getPerDetectorScores(text: string): Record<string, number> {
  if (!text.trim()) return {};
  try {
    const detector = getDetector();
    const result = detector.analyze(text);
    const scores: Record<string, number> = {};
    for (const d of result.detectors ?? []) {
      const name = (d.detector ?? "unknown").toLowerCase().replace(/ /g, "_");
      scores[name] = Math.round((100 - (d.human_score ?? 50)) * 10) / 10;
    }
    scores.overall = Math.round((100 - (result.summary?.overall_human_score ?? 50)) * 10) / 10;
    return scores;
  } catch { return {}; }
}

function allBelowTarget(scores: Record<string, number>): boolean {
  if (Object.keys(scores).length === 0) return false;
  return Object.entries(scores).every(([k, s]) => k === "overall" || s < TARGET_AI_SCORE);
}

function worstScore(scores: Record<string, number>): number {
  const vals = Object.entries(scores).filter(([k]) => k !== "overall").map(([, v]) => v);
  return vals.length > 0 ? Math.max(...vals) : 100;
}

function analyzeSignals(text: string): Record<string, number> {
  const signals = new TextSignals(text);
  return signals.getAllSignals();
}

// ── Signal-Aware Targeted Fixes ──

function signalAwareRefinement(text: string, features: InputFeatures, iteration: number, strength: string = "light"): string {
  const signals = analyzeSignals(text);
  let result = text;

  // Signal thresholds scale with strength
  const aiPatThreshold = strength === "strong" ? 8 : strength === "medium" ? 12 : 15;
  const aiRatioThreshold = strength === "strong" ? 15 : strength === "medium" ? 22 : 30;
  const burstThreshold = strength === "strong" ? 60 : strength === "medium" ? 58 : 55;
  const starterThreshold = strength === "strong" ? 60 : strength === "medium" ? 58 : 55;
  const uniformThreshold = strength === "strong" ? 40 : strength === "medium" ? 45 : 50;

  // Only run safe/idempotent AI word kill — NOT sentenceIndependentStealthPass
  // because it re-applies applyPhrasePatterns, applyConnectorNaturalization, and
  // applySyntacticTemplate which compound on repeated calls ("When when", "Since since").
  if (signals.ai_pattern_score > aiPatThreshold || signals.per_sentence_ai_ratio > aiRatioThreshold) {
    result = applyAIWordKill(result);
  }

  // Fix burstiness (sentence length variation)
  if (signals.burstiness < burstThreshold) {
    result = forceExtremeVariation(result);
  }

  // Fix starter diversity
  if (signals.starter_diversity < starterThreshold) {
    result = diversifyStarters(result);
  }

  // Fix sentence uniformity
  if (signals.sentence_uniformity > uniformThreshold) {
    result = breakSentenceUniformity(result);
  }

  // Fix dependency depth — disabled: random clause insertion damages phrasing
  // if (signals.dependency_depth < 40) {
  //   result = enrichDependencyDepth(result);
  // }

  // Fix stylometric score — handled by sentence-independent processing
  // humanizePunctuation removed: was injecting random asides that broke flow

  // Kill modern buzzwords on every refinement pass
  result = killModernBuzzwords(result);

  result = finalPolish(result);

  // Strict constraint enforcement
  if (!features.hasContractions) result = removeContractions(result);
  if (!features.hasFirstPerson) result = removeFirstPerson(result);
  if (!features.hasRhetoricalQuestions) result = removeRhetoricalQuestions(result);

  return result;
}

function forceExtremeVariation(text: string): string {
  // Sentence splitting disabled — 1 sentence in = 1 sentence out.
  // Variation is achieved through per-sentence LLM processing.
  return text;
}

function breakSentenceUniformity(text: string): string {
  // Sentence splitting disabled — 1 sentence in = 1 sentence out.
  // Uniformity is broken through per-sentence LLM processing.
  return text;
}

// ── Word Diversity Injection ──

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
  "also": ["likewise", "similarly", "too"], "still": ["yet", "even now", "nonetheless"],
  "just": ["merely", "simply", "only"], "way": ["manner", "approach", "route"],
  "part": ["portion", "segment", "piece"], "problem": ["issue", "challenge", "difficulty"],
  "people": ["individuals", "folks", "populations"], "new": ["fresh", "recent", "novel"],
  "things": ["aspects", "elements", "factors"], "fact": ["reality", "truth", "detail"],
};

function injectWordDiversity(text: string): string {
  let result = text;
  const usedSwaps = new Set<string>();

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

  // Also use HumanizerDictionary for context-aware synonym replacement
  // (619K+ word dictionary + curated synonyms + mega thesaurus)
  result = ninjaDictionarySynonymSwap(result);

  return result;
}

// ── Dictionary-Enhanced Contextual Synonym Replacement ──
// Uses 619K+ word validity dictionary + curated synonyms + mega thesaurus

function ninjaDictionarySynonymSwap(text: string, intensity: number = 0.10): string {
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

function ninjaSyntacticTemplatePass(text: string): string {
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

// ── Full Non-LLM Stealth Pass ──
// Each sentence is processed independently through ALL transforms.
// Paragraph structure is preserved; sentences are recombined after processing.

/**
 * Process a single sentence independently through all non-LLM transforms.
 * This is the core atomic unit — each sentence is treated as isolated text.
 */
function stealthProcessSingleSentence(sent: string, features: InputFeatures, strength: string = "light"): string {
  if (!sent.trim()) return sent;
  let result = sent.trim();

  // 1. Kill remaining AI vocabulary — shared dictionary only (120+ words + 48 phrase patterns)
  // NOTE: Local AI_PHRASE_KILL and applyPhrasePatterns removed — they were destroying
  // meaning by applying aggressive replacements on text already humanized by LLM:
  //   - "the importance of" → "how much ... matters" (literal dots → garbled grammar)
  //   - "plays a crucial role in" → "matters" (drops "in" → broken sentence)
  //   - 9 random swap dictionaries that change phrasing the LLM intentionally chose
  // The shared applyAIWordKill already handles phrase + word replacement with better grammar.
  // Local AI_WORD_KILL per-word loop also removed — redundant with applyAIWordKill.
  result = applyAIWordKill(result);

  // 3. Naturalize connectors
  result = applyConnectorNaturalization(result);

  // 4. Kill formal/AI starters
  const firstWord = result.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (AI_STARTERS.has(firstWord)) {
    const comma = result.indexOf(",");
    if (comma > 0 && comma < 20) {
      result = result.slice(comma + 1).trim();
      if (result[0]) result = result[0].toUpperCase() + result.slice(1);
    }
  }

  // 5. Dictionary-enhanced synonym swap (per-sentence) — VERY conservative after LLM rewrite
  // The LLM already varies vocabulary. Aggressive thesaurus swaps produce wrong synonyms
  // ("healthy" → "sizeable", "system" → "arrangement") that destroy meaning.
  const synonymRate = strength === "strong" ? 0.03 : strength === "medium" ? 0.02 : 0.01;
  const dict = getDictionary();
  const words = result.split(/\s+/);
  if (words.length >= 10) {
    const usedRep = new Set<string>();
    const targetSwaps = Math.min(1, Math.floor(words.length * synonymRate));
    let swaps = 0;
    const swapped = words.map((word, idx) => {
      if (swaps >= targetSwaps) return word;
      const clean = word.replace(/[^a-zA-Z]/g, "");
      if (clean.length < 5 || idx === 0) return word;
      const lower = clean.toLowerCase();
      const skipWords = new Set(["about", "after", "again", "being", "below", "between",
        "could", "doing", "during", "every", "found", "given", "going", "great",
        "their", "there", "these", "those", "under", "using", "where", "which",
        "while", "would", "shall", "should", "other", "still", "never", "often"]);
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
    result = swapped.join(" ");
  }

  // 6. Syntactic template — DISABLED: The LLM rewrite already handles clause fronting,
  // nominalization, conjunction rotation, etc. Applying syntactic templates in the non-LLM
  // pipeline AFTER phrase/connector naturalization causes cascading duplication:
  //   - applyPhrasePatterns inserts "since" → because_front template fronts it → "Since since"
  //   - applyConnectorNaturalization inserts "When" → when_front template fronts → "When when"
  // const templateProb = strength === "strong" ? 0.55 : strength === "medium" ? 0.42 : 0.35;
  // if (result.split(/\s+/).length >= 15 && Math.random() < templateProb) {
  //   const transformed = applySyntacticTemplate(result);
  //   if (transformed !== result) result = transformed;
  // }

  // 7. Word diversity swaps (overused common words)
  for (const [common, alternatives] of Object.entries(SHARED_DIVERSITY_SWAPS)) {
    const regex = new RegExp(`\\b${common}\\b`, "gi");
    if (regex.test(result) && Math.random() < 0.5) {
      const alt = alternatives[Math.floor(Math.random() * alternatives.length)];
      result = result.replace(regex, (match) => {
        if (match[0] === match[0].toUpperCase()) return alt[0].toUpperCase() + alt.slice(1);
        return alt;
      });
    }
  }

  // 8. Pre-2000 era naturalness: kill modern buzzwords
  result = killModernBuzzwords(result);

  // 9. Constraint enforcement per sentence
  if (!features.hasContractions) {
    result = result.replace(CONTRACTION_EXPAND_RE, (match) => {
      const expanded = EXPANSION_MAP[match.toLowerCase()] ?? match;
      return match[0] === match[0].toUpperCase() && expanded[0] === expanded[0].toLowerCase()
        ? expanded[0].toUpperCase() + expanded.slice(1) : expanded;
    });
    result = expandContractions(result);
  }
  if (!features.hasFirstPerson) {
    result = removeFirstPerson(result);
  }

  // 10. Cleanup artifacts
  result = result.replace(/ {2,}/g, " ");
  result = result.replace(/,\s*,/g, ",");
  result = result.replace(/\s+([.,;:!?])/g, "$1");
  result = result.trim();

  // 11. Capitalize first letter
  if (result && /^[a-z]/.test(result)) {
    result = result[0].toUpperCase() + result.slice(1);
  }

  return result;
}

/**
 * Apply sentence-independent stealth processing to full text.
 * Splits into paragraphs → sentences, processes each sentence independently,
 * then recombines.
 */
function sentenceIndependentStealthPass(text: string, features: InputFeatures, strength: string = "light"): string {
  const paragraphs = text.split(/\n\s*\n/);

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = robustSentenceSplit(p);
    if (sentences.length === 0) return "";

    const processed = sentences.map(sent => {
      const trimmed = sent.trim();
      if (!trimmed || trimmed.split(/\s+/).length < 3) return trimmed;
      return stealthProcessSingleSentence(trimmed, features, strength);
    }).filter(Boolean);

    // Fragment removal DISABLED — would alter sentence count (1-in=1-out)
    // Sentences must be preserved regardless of length
    const cleaned = processed;

    return (cleaned.length > 0 ? cleaned : processed).join(" ");
  }).filter(Boolean).join("\n\n");
}

// ── Pre-2000 Era Buzzword Killer ──
// Eliminate modern (post-2000) corporate/tech/AI buzzwords that give away machine authorship.
// Real pre-2000 writing used simpler, more direct language.

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

// ══════════════════════════════════════════════════════════════════════════
// LLM SYNONYM & PHRASING VALIDATION (Ninja)
// After non-LLM stealth processing, the LLM reviews for awkward synonyms
// and unnatural phrasing introduced by dictionary replacements.
// ══════════════════════════════════════════════════════════════════════════

async function llmValidateNinjaPhrasing(text: string): Promise<string> {
  const wordCount = text.trim().split(/\s+/).length;
  const maxTok = Math.min(16384, Math.max(4096, Math.ceil(wordCount * 2)));

  const system = `You are a copy-editor fixing awkward phrasing. Your ONLY job is to fix sentences that sound unnatural due to incorrect synonym choices or awkward word combinations.

RULES:
1. Fix ONLY sentences where a synonym does not fit the context (e.g., "the conflict commenced" should be "the conflict began")
2. Fix awkward or ungrammatical phrasing (e.g., "proved to be key to shaped the outcome" → "proved key in shaping the outcome")
3. Fix broken collocations (e.g., "conduct a role" should be "play a role")
4. Do NOT change sentences that already read naturally
5. Do NOT add new information, conclusions, or commentary
6. Do NOT use AI vocabulary: utilize, leverage, facilitate, comprehensive, multifaceted, paramount, furthermore, moreover, additionally, consequently, subsequently, nevertheless, underscore, foster, cultivate, pivotal, nuanced, robust, innovative, holistic, transformative, noteworthy, significant, substantial, remarkable, crucial, vital, imperative
7. Keep the EXACT same number of sentences — do NOT split or merge any sentences
8. Keep ALL paragraph breaks exactly as they are
9. Protect ALL content inside brackets [like this] — copy it exactly
10. CRITICAL: Preserve all placeholder tokens like [[PROT_0]], [[TRM_0]] exactly as-is. Do not remove, modify, or explain them.
11. Write like a real person from the 1990s — no modern corporate buzzwords
12. Return ONLY the corrected text — no commentary`;

  const user = `Fix any awkward synonyms or unnatural phrasing in this text. Only change what sounds wrong — leave natural sentences alone. Keep the same sentence count and paragraph structure exactly.

TEXT:
${placeholdersToLLMFormat(text)}`;

  try {
    const validated = llmFormatToPlaceholders(await llmCall(system, user, 0.3, maxTok) ?? '');
    if (!validated || validated.trim().length < text.length * 0.5) {
      console.warn("  [Ninja]   Validation LLM output too short, skipping");
      return text;
    }

    const origSents = robustSentenceSplit(text).length;
    const valSents = robustSentenceSplit(validated.trim()).length;
    if (Math.abs(origSents - valSents) > 2) {
      console.warn(`  [Ninja]   Validation changed sentence count (${origSents} → ${valSents}), skipping`);
      return text;
    }

    const origParas = text.split(/\n\s*\n/).filter(p => p.trim()).length;
    const valParas = validated.trim().split(/\n\s*\n/).filter(p => p.trim()).length;
    if (origParas !== valParas) {
      console.warn(`  [Ninja]   Validation changed paragraph count (${origParas} → ${valParas}), skipping`);
      return text;
    }

    return validated.trim();
  } catch (err) {
    console.warn("  [Ninja]   Validation LLM call failed, skipping:", err);
    return text;
  }
}

// ── Strict LLM Punctuation Cleanup (Ninja) ──
// Only fixes punctuation and capitalization. Loops if words change.

async function llmFixNinjaPunctuation(text: string): Promise<string> {
  const wordCount = text.trim().split(/\s+/).length;
  const maxTokens = Math.min(16384, Math.max(4096, Math.ceil(wordCount * 2)));

  const systemPrompt = `You are a punctuation proofreader. Your ONLY job is to fix punctuation and capitalization errors.

STRICT RULES — YOU MUST FOLLOW ALL OF THEM:
1. DO NOT change, add, remove, or replace ANY word. Every single word must remain exactly as it is.
2. DO NOT reorder words or sentences.
3. DO NOT add or remove sentences.
4. DO NOT add or remove paragraphs.
5. Only fix these punctuation issues:
   - Commas used where periods should be (run-on sentences)
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
      console.warn("  [Ninja]   Punctuation LLM output too short, skipping");
      return text;
    }

    // Verify no words were changed
    const stripPunct = (s: string) => s.replace(/[^a-zA-Z\s]/g, "").toLowerCase().split(/\s+/).filter(w => w);
    const origWords = stripPunct(text);
    const fixedWords = stripPunct(result.trim());

    const maxDrift = Math.max(3, Math.ceil(origWords.length * 0.02));
    let diffs = 0;
    const minLen = Math.min(origWords.length, fixedWords.length);
    for (let i = 0; i < minLen; i++) {
      if (origWords[i] !== fixedWords[i]) diffs++;
    }
    diffs += Math.abs(origWords.length - fixedWords.length);

    if (diffs > maxDrift) {
      console.warn(`  [Ninja]   Punctuation LLM changed ${diffs} words (max ${maxDrift}), skipping`);
      return text;
    }

    const origParas = text.split(/\n\s*\n/).filter(p => p.trim()).length;
    const fixedParas = result.trim().split(/\n\s*\n/).filter(p => p.trim()).length;
    if (origParas !== fixedParas) {
      console.warn(`  [Ninja]   Punctuation LLM changed paragraph count (${origParas} → ${fixedParas}), skipping`);
      return text;
    }

    return result.trim();
  } catch (err) {
    console.warn("  [Ninja]   Punctuation LLM call failed, skipping:", err);
    return text;
  }
}

function runStealthPass(
  text: string,
  features: InputFeatures,
  iteration: number,
  strength: string = "light",
): string {
  // ── Sentence-independent processing through all transforms ──
  text = sentenceIndependentStealthPass(text, features, strength);

  // ── Light global passes (these need cross-sentence context) ──
  // Burstiness: adjusts sentence length variation across the paragraph
  text = enforceBurstiness(text);
  // humanizePunctuation removed: was injecting random asides that broke flow
  // Dependency depth and randomness: disabled — they insert random clauses
  // that produce awkward phrasing and damage meaning preservation.

  text = finalPolish(text);

  // Strict constraint enforcement
  if (!features.hasContractions) text = removeContractions(text);
  if (!features.hasFirstPerson) text = removeFirstPerson(text);
  if (!features.hasRhetoricalQuestions) text = removeRhetoricalQuestions(text);

  return text;
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN PUBLIC API — llmHumanize()
// ══════════════════════════════════════════════════════════════════════════

export async function llmHumanize(
  text: string,
  strength = "medium",
  preserveSentences = true,
  strictMeaning = true,
  tone = "neutral",
  noContractions = true,
  enablePostProcessing = true,
): Promise<string> {
  if (!text?.trim()) return text;

  const start = Date.now();
  const original = text.trim();
  const features = detectInputFeatures(original);

  console.log(`  [Ninja] Starting Ninja v2 pipeline...`);
  console.log(`  [Ninja] Input: ${features.wordCount} words, ${features.sentenceCount} sents, ${features.paragraphCount} paras`);
  console.log(`  [Ninja] Tone profile: ${normalizeNinjaTone(tone)}`);

  // Detect text domain for adaptive prompts
  const domainResult = detectDomain(original);
  const domainGuidance = getToneGuidance(domainResult, tone);
  console.log(`  [Ninja] Domain: ${domainResult.primary} (confidence: ${(domainResult.confidence * 100).toFixed(0)}%)${domainResult.secondary ? ` + ${domainResult.secondary}` : ''}`);

  // Rephrase ~30% of end-of-sentence citations for natural variation
  const citationText = rephraseCitations(original);

  // Protect special content (brackets, figures, citations)
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

  // ═══════════════════════════════════════════
  // PRE-HUMANIZATION: Sentence Merge/Split Surgery for Burstiness
  // ═══════════════════════════════════════════
  console.log("  [Ninja] Pre-surgery: Applying sentence merge/split for burstiness...");
  const rawSurgeryItems = buildSentenceItems(protectedText);
  const surgeryItems = applySentenceSurgery(rawSurgeryItems);
  const surgeryText = reassembleFromItems(surgeryItems);
  console.log(`  [Ninja] Surgery: ${rawSurgeryItems.filter(i => !i.isTitle).length} → ${surgeryItems.filter(i => !i.isTitle).length} sentences (merges + splits applied)`);

  // ═══════════════════════════════════════════
  // LAYER 1: SENTENCE-BY-SENTENCE LLM Pipeline
  // Each sentence is independently rewritten by the LLM (combined 3-phase).
  // Adjacent sentences provided as read-only context for coherence.
  // ═══════════════════════════════════════════

  // Temperature map by strength
  const tempBase: Record<string, number> = { light: 0.70, medium: 0.82, strong: 0.92 };

  console.log("  [Ninja] Sentence-by-sentence LLM rewrite (combined 3-phase)...");
  const sentenceSystem = getNinjaSentenceSystemPrompt(features, tone, domainGuidance);
  const paragraphs = surgeryText.split(/\n\s*\n/).filter(p => p.trim());
  let totalSentencesProcessed = 0;

  // Surgery features for rule enforcement
  const surgeryFeatures: SurgeryInputFeatures = {
    hasContractions: features.hasContractions,
    hasFirstPerson: features.hasFirstPerson,
    hasRhetoricalQuestions: features.hasRhetoricalQuestions,
  };

  // Process ALL paragraphs in parallel for maximum speed
  const rewrittenParagraphs = await Promise.all(paragraphs.map(async (para) => {
    const trimmedPara = para.trim();
    // Skip headings/titles — pass through unchanged
    if (isTitleOrHeading(trimmedPara)) {
      return trimmedPara;
    }

    const sentences = robustSentenceSplit(trimmedPara);
    if (sentences.length === 0) {
      return trimmedPara;
    }

    // Process each sentence independently via LLM (parallel for speed)
    const rewritePromises = sentences.map(async (sent, idx) => {
      const trimmed = sent.trim();
      if (!trimmed || trimmed.split(/\s+/).length < 3) return trimmed;

      // Skip title-like sentences (short, no terminal punctuation, or all caps)
      if (isTitleOrHeading(trimmed)) return trimmed;

      const prevSent = idx > 0 ? sentences[idx - 1] : null;
      const nextSent = idx < sentences.length - 1 ? sentences[idx + 1] : null;

      const userPrompt = buildNinjaSentenceUserPrompt(
        placeholdersToLLMFormat(trimmed),
        prevSent ? placeholdersToLLMFormat(prevSent) : null,
        nextSent ? placeholdersToLLMFormat(nextSent) : null,
        strength,
        tone,
      );

      // Vary temperature per-sentence for maximum unpredictability
      const sentTemp = (tempBase[strength] ?? 0.70) + (Math.random() * 0.14 - 0.07);
      const clampedTemp = Math.max(0.3, Math.min(1.0, sentTemp));
      const sentMaxTokens = Math.max(256, Math.ceil(trimmed.split(/\s+/).length * 3));

      try {
        let rewritten = llmFormatToPlaceholders(
          await llmCall(sentenceSystem, userPrompt, clampedTemp, sentMaxTokens) ?? ''
        );
        if (!rewritten || rewritten.trim().length < trimmed.length * 0.2) {
          return trimmed;
        }
        rewritten = rewritten.replace(/^\[TARGET\]:\s*/i, "").trim();
        // Enforce single sentence: if LLM returned multiple sentences, collapse to one
        rewritten = enforceSingleSentence(rewritten);

        // Enforce strict rules (no contractions, no rhetorical questions, no first-person)
        const ruleResult = enforceStrictRules(trimmed, rewritten, surgeryFeatures);
        rewritten = ruleResult.text;

        // Enforce capitalization
        rewritten = enforceCapitalization(trimmed, rewritten);

        return rewritten;
      } catch {
        return trimmed;
      }
    });

    const rewrittenSentences = await Promise.all(rewritePromises);
    // Strict sentence count enforcement: input sentences = output sentences per paragraph
    if (rewrittenSentences.length !== sentences.length) {
      console.warn(`  [Ninja] Sentence count mismatch in paragraph: input=${sentences.length}, output=${rewrittenSentences.length}`);
    }
    totalSentencesProcessed += rewrittenSentences.length;
    return rewrittenSentences.join(" ");
  }));

  let result = rewrittenParagraphs.join("\n\n");
  console.log(`  [Ninja] LLM done: ${result.split(/\s+/).length} words (${totalSentencesProcessed} sentences processed independently)`);

  // ── Constraint enforcement after LLM (rule-based only, no extra LLM calls) ──
  if (!features.hasContractions) result = removeContractions(result);
  if (!features.hasFirstPerson) result = removeFirstPerson(result);
  if (!features.hasRhetoricalQuestions) result = removeRhetoricalQuestions(result);

  console.log(`  [Ninja] LLM pipeline complete (${totalSentencesProcessed} sentence calls)`);

  // ── Word count enforcement — DISABLED: would drop sentences, breaking 1-in=1-out ──
  // Instead, log the word count so we can monitor it
  const maxAllowedWords = Math.round(features.wordCount * 1.10);
  const currentWords = result.trim().split(/\s+/).length;
  if (currentWords > maxAllowedWords) {
    console.log(`  [Ninja] Word count over budget: ${currentWords} > ${maxAllowedWords} (input=${features.wordCount}) — skipping trim to preserve sentence mapping`);
  }

  // ═══════════════════════════════════════════
  // LAYERS 2+3: Non-LLM Stealth Processing
  // ═══════════════════════════════════════════
  console.log("  [Ninja] Starting non-LLM stealth processing...");

  // Always run one stealth pass first (fast, rule-based) before expensive detector
  let bestResult = runStealthPass(result, features, 0, strength);

  // Feedback iterations scale with strength (reduced for speed)
  const maxFeedbackIterations = MAX_FEEDBACK_ITERATIONS_MAP[strength] ?? 1;

  // Check detector AFTER stealth pass (save 1 call if already passing)
  let perDetector = getPerDetectorScores(bestResult);
  let worst = worstScore(perDetector);
  console.log(`  [Ninja] Post-stealth worst detector: ${worst.toFixed(1)}% (target: all <${TARGET_AI_SCORE}%)`);

  let bestScore = worst;

  if (!allBelowTarget(perDetector) && maxFeedbackIterations > 0) {
    // ═══════════════════════════════════════════
    // LAYER 4: Feedback Loop — targeted refinement only
    // ═══════════════════════════════════════════

    for (let iteration = 0; iteration < maxFeedbackIterations; iteration++) {
      const processed = signalAwareRefinement(bestResult, features, iteration, strength);

      perDetector = getPerDetectorScores(processed);
      worst = worstScore(perDetector);

      console.log(
        `  [Ninja] Iteration ${iteration + 1}: worst=${worst.toFixed(1)}%` +
        ` (overall=${perDetector.overall?.toFixed(1) ?? "?"}%)`,
      );

      if (worst < bestScore) {
        bestResult = processed;
        bestScore = worst;
      }

      if (allBelowTarget(perDetector)) {
        console.log(`  [Ninja] Target reached: all detectors <${TARGET_AI_SCORE}%`);
        break;
      }
    }
  }

  // ═══════════════════════════════════════════
  // POST-FEEDBACK: Light AI word cleanup only (rule-based only — no LLM rewrite)
  // NOTE: Full sentenceIndependentStealthPass was removed here because it was the
  // 2nd/3rd invocation — applyPhrasePatterns, applyConnectorNaturalization, and
  // applySyntacticTemplate compound on re-application ("When when", "Since since").
  // ═══════════════════════════════════════════
  console.log("  [Ninja] Final rule-based stealth cleanup...");
  bestResult = applyAIWordKill(bestResult);
  bestResult = fixPunctuation(bestResult);

  // ═══════════════════════════════════════════
  // DETECTOR FEEDBACK LOOP — re-run post-processing if AI score > 15%
  // ═══════════════════════════════════════════
  try {
    const feedbackDetector = getDetector();
    for (let feedbackRound = 0; feedbackRound < 2; feedbackRound++) {
      const detection = feedbackDetector.analyze(bestResult);
      const aiScore = detection.summary.overall_ai_score;
      if (aiScore <= 15) break;
      console.log(`  [Ninja] Detector feedback round ${feedbackRound + 1}: AI score ${aiScore.toFixed(1)}% — re-running stealth pass`);

      // Light re-processing only — sentenceIndependentStealthPass already applies
      // applyAIWordKill, applyPhrasePatterns, applyConnectorNaturalization internally.
      // Re-applying them here causes compounding ("when when", "though though").
      bestResult = applyAIWordKill(bestResult);
      if (!features.hasContractions) bestResult = removeContractions(bestResult);
      if (!features.hasFirstPerson) bestResult = removeFirstPerson(bestResult);
      bestResult = fixPunctuation(bestResult);
    }
  } catch {
    // Detector failure is non-fatal
  }

  // ═══════════════════════════════════════════
  // FINAL: Strict constraint enforcement (catch anything the feedback loop re-introduced)
  // ═══════════════════════════════════════════
  if (!features.hasContractions) bestResult = removeContractions(bestResult);
  if (!features.hasFirstPerson) bestResult = removeFirstPerson(bestResult);
  if (!features.hasRhetoricalQuestions) bestResult = removeRhetoricalQuestions(bestResult);

  // ── Final punctuation & capitalization cleanup ──
  bestResult = fixPunctuation(bestResult);

  // ── Safety net: fix doubled subordinate conjunctions ("when when", "since since") ──
  bestResult = bestResult.replace(/\b(when|since|though|although|because|while|if|unless|after|before|until|once)\s+\1\b/gi, "$1");
  bestResult = bestResult.replace(/\b(When|Since|Though|Although|Because|While|If|Unless|After|Before|Until|Once)\s+\1\b/gi, "$1");

  // ── Deterministic flow cleanup — avoid extra document-level LLM passes ──
  console.log("  [Ninja] Running deterministic flow cleanup...");
  bestResult = smoothNinjaFlow(bestResult, tone);
  bestResult = fixPunctuation(bestResult);

  // Final capitalization enforcement
  bestResult = enforceCapitalization(original, bestResult);

  // ── FINAL safety net: fix doubled subordinate conjunctions and garbled phrases ──
  // Must run AFTER llmValidateNinjaPhrasing and llmFixNinjaPunctuation since those
  // LLM calls can re-introduce "when when", "while while", etc.
  bestResult = bestResult.replace(/\b(when|since|though|although|because|while|if|unless|after|before|until|once)\s+\1\b/gi, "$1");
  // Fix garbled accessibility phrases the LLM produces:
  //   "easy to entry" → "easy to access", "easier to availability" → "easier to access"
  bestResult = bestResult.replace(/\b(eas(?:y|ier)) to (entry|availability)\b/gi, "$1 to access");
  // Fix "cause" used as "promote/foster" (LLM garble):
  //   "can cause Efficiency" → "can improve Efficiency"
  bestResult = bestResult.replace(/\bcan cause (a more|Efficiency|social)/gi, "can bring about $1");
  // Fix "Healthcare care" redundancy
  bestResult = bestResult.replace(/\bHealthcare care\b/g, "Healthcare");

  // Merge/split DISABLED — strict sentence count enforcement: input = output

  // ── Strict sentence count enforcement ── DISABLED: 1-in=1-out enforced per-sentence
  // bestResult = enforceSentenceCountStrict(bestResult, inputSentenceCount);
  console.log(`  [Ninja] Sentence count: target=${inputSentenceCount}, actual=${countSentences(bestResult)}`);

  // ── Restore protected content terms ──
  bestResult = restoreContentTerms(bestResult.trim(), termMap);

  // ── Restore protected special content ──
  bestResult = restoreSpecialContent(bestResult.trim(), protectionMap);

  // ── Enforce paragraph count 1:1 with input ──
  bestResult = enforceParagraphCount(bestResult, inputParagraphCount);
  console.log(`  [Ninja] Paragraph enforcement: target=${inputParagraphCount}, actual=${bestResult.split(/\n\s*\n/).filter(p => p.trim()).length}`);

  // ── Final repetition cleanup — DISABLED: would alter sentence count ──
  // bestResult = cleanOutputRepetitions(bestResult);

  // ── STRICT 1:1 per-paragraph sentence count enforcement ──
  bestResult = enforcePerParagraphSentenceCounts(bestResult, inputSentenceCountsPerPara, "Ninja");

  // ── Clean bad sentence starters (And, By, But, etc.) per paragraph ──
  {
    const paras = bestResult.split(/\n\s*\n/).filter(p => p.trim());
    bestResult = paras.map(p => {
      const sents = robustSentenceSplit(p.trim());
      return cleanSentenceStarters(sents).join(" ");
    }).join("\n\n");
  }

  // ── Final diagnostics ──
  const outputWords = bestResult.split(/\s+/).length;
  const outputSentences = robustSentenceSplit(bestResult);
  const finalSignals = analyzeSignals(bestResult);
  const meaningScore = semanticSimilaritySync(original, bestResult);
  const elapsed = (Date.now() - start) / 1000;
  const finalScores = getPerDetectorScores(bestResult);

  console.log(`  [Ninja] Output: ${outputWords} words, ${outputSentences.length} sentences`);
  console.log(`  [Ninja] Final signals: burst=${finalSignals.burstiness.toFixed(1)}, ai_pat=${finalSignals.ai_pattern_score.toFixed(1)}, uniform=${finalSignals.sentence_uniformity.toFixed(1)}, perplex=${finalSignals.perplexity.toFixed(1)}`);
  console.log(`  [Ninja] Final worst: ${worstScore(finalScores).toFixed(1)}%, overall: ${finalScores.overall?.toFixed(1) ?? "?"}%`);
  console.log(`  [Ninja] Meaning similarity: ${meaningScore.toFixed(2)}`);
  console.log(`  [Ninja] Complete in ${elapsed.toFixed(1)}s (${totalSentencesProcessed} LLM + ${maxFeedbackIterations} max iterations)`);

  // ── Post-humanize sentence verification ──
  const verification = verifySentencePresence(original, bestResult, robustSentenceSplit);
  if (!verification.verified) {
    console.warn(`  [Ninja] Sentence verification: input=${verification.inputCount}, output=${verification.outputCount}`);
    if (verification.missingKeywords.length > 0) {
      console.warn(`  [Ninja] Missing keywords: ${verification.missingKeywords.join(", ")}`);
    }
  }

  // ── ABSOLUTE FINAL safety net ──
  // Runs after ALL processing (including enforcePerParagraphSentenceCounts and
  // cleanSentenceStarters which can re-introduce doubled conjunctions via
  // sentence merge/split operations).
  const beforeNet = bestResult;
  bestResult = bestResult.replace(/\b(when|since|though|although|because|while|if|unless|after|before|until|once)\s+\1\b/gi, "$1");
  bestResult = bestResult.replace(/\b(eas(?:y|ier))\s+(?:for\s+\w+\s+)?to\s+(entry|availability)\b/gi, "$1 to access");
  bestResult = bestResult.replace(/\bto entry\b/gi, "to access");
  bestResult = bestResult.replace(/\bto availability\b/gi, "to access");
  bestResult = bestResult.replace(/\bcan cause (a more|Efficiency|social)/gi, "can bring about $1");
  bestResult = bestResult.replace(/\bHealthcare care\b/g, "Healthcare");
  // Kill offensive/archaic words that should never appear in output
  bestResult = bestResult.replace(/\bquislingism\b/gi, "collaboration");
  bestResult = bestResult.replace(/\bquisling\b/gi, "collaborator");
  if (beforeNet !== bestResult) console.log("  [Ninja] SAFETY NET caught issues in final output");

  // Final validation: fix capitalization + sentence formatting
  const validated = validateAndRepairOutput(original, bestResult);
  bestResult = validated.text;

  return bestResult;
}
