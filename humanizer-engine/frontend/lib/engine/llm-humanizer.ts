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

import OpenAI from "openai";
import { sentTokenize } from "./utils";
import { expandContractions } from "./advanced-transforms";
import { protectSpecialContent, restoreSpecialContent } from "./content-protection";
import { semanticSimilaritySync } from "./semantic-guard";
import { TextSignals, getDetector } from "./multi-detector";
import { getStyleMemory, profileSummaryText } from "./style-memory";
import { analyzeText, computeGap, gapToInstructions } from "./text-analyzer";
import { validateAll } from "./validation";

// ── Config ──

const LLM_MODEL = process.env.LLM_MODEL ?? "gpt-4o";
const MAX_FEEDBACK_ITERATIONS = 6;
const TARGET_AI_SCORE = 5.0;

// ── OpenAI client singleton ──

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY not set. Add it to .env or environment variables.");
  _client = new OpenAI({ apiKey });
  return _client;
}

function llmCall(system: string, user: string, temperature: number): Promise<string> {
  const client = getClient();
  return client.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
    max_tokens: 4096,
  }).then((r: any) => r.choices[0]?.message?.content?.trim() ?? "");
}

// ── Input Feature Detection ──

interface InputFeatures {
  hasContractions: boolean;
  hasFirstPerson: boolean;
  avgSentenceLength: number;
  paragraphCount: number;
  wordCount: number;
  sentenceCount: number;
}

function detectInputFeatures(text: string): InputFeatures {
  const contractionRe = /\b(can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|wouldn't|shouldn't|couldn't|mustn't|it's|that's|there's|here's|he's|she's|they're|we're|you're|I'm|they've|we've|you've|I've|they'll|we'll|you'll|I'll|he'll|she'll|it'll|let's|who's|what's)\b/gi;
  const firstPersonRe = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/;
  const sentences = sentTokenize(text);
  const totalWords = text.trim().split(/\s+/).length;

  return {
    hasContractions: contractionRe.test(text),
    hasFirstPerson: firstPersonRe.test(text),
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

const PHASE1_SYSTEM = `You are ghostwriting as a real human author. Your job: rewrite text so it reads exactly like a person wrote it by hand — messy rhythm, personal quirks, uneven pacing. Think of how columnists from the 1990s or early-2000s bloggers wrote.

ABSOLUTE REQUIREMENTS:

1. EXTREME SENTENCE LENGTH VARIATION (the single most important rule):
   - Include at least 2 very short sentences per paragraph (4-9 words)
   - Include at least 1 very long sentence per paragraph (35-55 words)
   - NEVER write 3 sentences in a row that are within 8 words of each other in length

2. BANNED VOCABULARY — if you use ANY of these, the output fails:
   utilize, facilitate, leverage, comprehensive, multifaceted, paramount, furthermore, moreover, additionally, consequently, subsequently, nevertheless, notwithstanding, aforementioned, paradigm, trajectory, discourse, holistic, robust, nuanced, pivotal, intricate, transformative, innovative, groundbreaking, mitigate, streamline, optimize, bolster, catalyze, delve, embark, foster, harness, spearhead, unravel, unveil, tapestry, cornerstone, nexus, myriad, plethora, realm, landscape, methodology, framework, implications, significant, substantial, remarkable, considerable, unprecedented

3. SENTENCE STARTERS — vary dramatically:
   - Start some with subject directly, some with short clauses
   - Start 1-2 with "And" or "But"
   - NEVER use the same starting word consecutively
   - NEVER start with: "Furthermore," "Moreover," "Additionally," "However," "Nevertheless," "It is"

4. NATURAL TEXTURE:
   - Use phrasal verbs: look into, carry out, come up with, break down, figure out
   - Use semicolons 2-3 times and em dashes (—) 2-4 times
   - Use parenthetical remarks 1-2 times

5. WORD CHOICE:
   - Prefer everyday words: "use" not "utilize", "help" not "facilitate"
   - Sprinkle hedging: "probably", "seems like", "to some extent"
   - Use concrete language over abstract

STRICT PRESERVATION:
- Keep ALL factual content, data, citations, technical terms exactly
- Keep same paragraph count
- Do NOT add new ideas or create lists
- Stay within ±15% of original word count
- Return ONLY the rewritten text`;

function buildPhase1Prompt(text: string, features: InputFeatures): string {
  const contractionRule = features.hasContractions
    ? "You MAY use contractions naturally."
    : "Do NOT use contractions. Write all words fully.";

  return `Rewrite this text completely as a human author would. ${contractionRule}

CRITICAL: Create EXTREME sentence length variation. Mix very short (4-9 words) with very long (35-55 words).

Word count target: ${features.wordCount} words (±15%, so ${Math.round(features.wordCount * 0.85)}-${Math.round(features.wordCount * 1.15)}).
Paragraphs: ${features.paragraphCount} (preserve exactly).

TEXT TO REWRITE:
${text}`;
}

// ── Phase 2: Humanization Layer ──
// Role: Add natural irregularities, vary rhythm, reduce predictability

function buildPhase2System(profile: import("./style-memory").StyleProfile, gapInstr: string): string {
  return `You are a Controlled Academic Humanization Engine. Your task: make the text sound like it was written by a real human academic — not a machine.

${profileSummaryText(profile)}

${gapInstr}

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

3. VOCABULARY:
   - Replace generic/AI-like words with specific, concrete alternatives
   - Use phrasal verbs naturally: "look into", "carry out", "come up with", "break down"
   - Avoid: utilize, facilitate, leverage, comprehensive, multifaceted, paramount, furthermore, moreover, additionally, subsequently, nevertheless, notwithstanding, aforementioned, paradigm, trajectory, discourse, holistic, robust, nuanced, pivotal, intricate, transformative, innovative, groundbreaking, mitigate, streamline, optimize, bolster, catalyze, delve, embark, foster, harness, spearhead, unravel, unveil, tapestry, cornerstone, nexus, myriad, plethora, realm, landscape
   - Also avoid: "it is important to note", "plays a crucial role", "in today's world", "a wide range of", "due to the fact that"

4. PUNCTUATION AND STYLE:
   - Use semicolons 2-3 times to join related thoughts
   - Use em dashes (—) 2-3 times for asides or emphasis
   - Use 1-2 parenthetical remarks: "(which few expected)" or "(at least in theory)"
   - Keep formal academic tone but with natural rhythm

5. FLOW AND HEDGING:
   - Use academic hedging where appropriate: "suggests", "indicates", "appears to"
   - Keep reasoning-driven flow
   - Allow minor imperfection in phrasing — real humans are not perfectly concise

STRICT CONSTRAINTS:
- Preserve at least 90% of original sentence boundaries
- Do NOT introduce new ideas or remove existing ones
- Do NOT use contractions
- Do NOT create lists unless the original has them
- Return only the rewritten text`;
}

function buildPhase2Prompt(text: string, strength: string, strictMeaning: boolean): string {
  let variationGuide = "Target 5-7% vocabulary change from the input.";
  if (strength === "light") variationGuide = "Target 3-5% vocabulary change. Very conservative.";
  if (strength === "strong") variationGuide = "Target 8-12% vocabulary change. More aggressive variation allowed.";

  let meaningGuide = "";
  if (strictMeaning) meaningGuide = "\nStrict meaning mode: content deviation must be zero.";

  return `Humanize this text to sound like authentic academic writing by a real person. Apply all humanization rules.

${variationGuide}${meaningGuide}

CRITICAL: Create EXTREME sentence length variation in every paragraph. Mix 4-9 word sentences with 30-50 word sentences.

Text:
${text}`;
}

// ── Phase 3: Constraint / Polish Layer ──
// Role: Enforce rules (sentence count, tone, no AI smoothness), final cleanup

const PHASE3_SYSTEM = `You are a final-pass academic quality reviewer. Your job is ONLY to:
1. Fix any remaining awkward phrasing
2. Ensure academic consistency
3. Remove any overly polished or mechanical-sounding passages
4. Verify logical connections between arguments

STRICT RULES:
- Make ONLY minimal edits — do NOT rewrite extensively
- Do NOT use contractions
- Do NOT change paragraph structure
- Do NOT add or remove ideas
- Preserve sentence count within ±5%
- Return only the polished text`;

function buildPhase3Prompt(text: string, originalSentCount: number): string {
  const currentSentCount = sentTokenize(text).length;
  return `Review and polish this text. Make only minimal edits for academic quality.

Original had ${originalSentCount} sentences. Current has ${currentSentCount}. Keep it close.

Text:
${text}`;
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
  [/\bthere is a (?:growing |increasing )?need (?:for|to)\b/gi, "we need"],
  [/\bsheds? light on\b/gi, "clears up"],
  [/\bpaves? the way for\b/gi, "opens the door to"],
  [/\braises? important questions?\b/gi, "brings up questions"],
];

function killAIVocabulary(text: string): string {
  let result = text;

  // Kill AI phrases first
  for (const [pattern, replacement] of AI_PHRASE_KILL) {
    result = result.replace(pattern, (match) => {
      if (replacement === "") return "";
      if (match[0] === match[0].toUpperCase() && replacement[0] === replacement[0].toLowerCase()) {
        return replacement[0].toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }

  // Kill AI words
  result = result.replace(/\b[a-zA-Z]+\b/g, (word) => {
    const lower = word.toLowerCase();
    const replacements = AI_WORD_KILL[lower];
    if (!replacements) return word;
    const replacement = replacements[Math.floor(Math.random() * replacements.length)];
    if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  });

  // Cleanup
  result = result.replace(/ {2,}/g, " ");
  result = result.replace(/\.\s+([a-z])/g, (_, ch) => ". " + ch.toUpperCase());
  result = result.replace(/^\s+/gm, "");
  result = result.replace(/,\s*,/g, ",");
  return result;
}

// ── Connector Naturalization ──

const FORMAL_CONNECTORS: Record<string, string[]> = {
  "Furthermore, ": ["Also, ", "And ", "Plus, "],
  "Moreover, ": ["On top of that, ", "And ", "Beyond that, "],
  "Additionally, ": ["Also, ", "And ", "Plus, "],
  "Consequently, ": ["So ", "Because of that, ", "That meant "],
  "Nevertheless, ": ["Still, ", "Even so, ", "But "],
  "Nonetheless, ": ["Still, ", "Yet ", "But "],
  "In contrast, ": ["But ", "Then again, ", "On the flip side, "],
  "Subsequently, ": ["After that, ", "Then ", "Later, "],
  "In conclusion, ": ["All in all, ", "When you put it together, "],
  "Therefore, ": ["So ", "That is why ", "This is why "],
  "However, ": ["But ", "That said, ", "Still, "],
  "Thus, ": ["So ", "That way, ", "This meant "],
  "Hence, ": ["So ", "That is why "],
  "Indeed, ": ["In fact, ", "Sure enough, "],
  "Accordingly, ": ["So ", "In response, "],
  "Notably, ": ["What stands out is ", "One thing worth noting: "],
  "Specifically, ": ["In particular, ", "To be exact, "],
  "As a result, ": ["So ", "Because of this, "],
  "For example, ": ["Take ", "Like ", "Consider "],
  "For instance, ": ["Take ", "Like ", "Say "],
  "On the other hand, ": ["Then again, ", "But "],
  "In other words, ": ["Put simply, ", "Basically, "],
};

function naturalizeConnectors(text: string): string {
  let result = text;
  for (const [formal, replacements] of Object.entries(FORMAL_CONNECTORS)) {
    while (result.includes(formal)) {
      const rep = replacements[Math.floor(Math.random() * replacements.length)];
      result = result.replace(formal, rep);
    }
  }
  return result;
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
  const paragraphs = text.split(/\n\s*\n/);

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = sentTokenize(p);
    if (sentences.length === 0) return "";

    const result: string[] = [];
    const usedStarters = new Set<string>();
    let rerouteIdx = 0;

    for (let i = 0; i < sentences.length; i++) {
      let sent = sentences[i].trim();
      if (!sent) continue;

      const firstWord = sent.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";

      // Kill AI formal starters
      if (AI_STARTERS.has(firstWord)) {
        const comma = sent.indexOf(",");
        if (comma > 0 && comma < 20) {
          sent = sent.slice(comma + 1).trim();
          sent = sent[0].toUpperCase() + sent.slice(1);
        }
      }

      // Check for duplicate starter
      const currentStarter = sent.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
      if (usedStarters.has(currentStarter) && sent.split(/\s+/).length > 6) {
        const reroute = NATURAL_REROUTES[rerouteIdx % NATURAL_REROUTES.length];
        rerouteIdx++;
        sent = reroute + " " + sent[0].toLowerCase() + sent.slice(1);
      }

      usedStarters.add(sent.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "");
      result.push(sent);
    }

    return result.join(" ");
  }).filter(Boolean).join("\n\n");
}

// ── Sentence Count Enforcement ──

function enforceSentenceCount(text: string, targetCount: number): string {
  const paragraphs = text.split(/\n\s*\n/);
  let allSentences: string[] = [];
  const paraBreaks: number[] = []; // track para boundaries

  for (const para of paragraphs) {
    const p = para.trim();
    if (!p) continue;
    const sents = sentTokenize(p);
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
  const paragraphs = text.split(/\n\s*\n/);

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = sentTokenize(p);
    if (sentences.length < 3) return p;

    const result: string[] = [];

    for (let i = 0; i < sentences.length; i++) {
      let sent = sentences[i].trim();
      if (!sent) continue;

      // Check for 3 consecutive similar lengths
      if (result.length >= 2) {
        const len = sent.split(/\s+/).length;
        const prev1Len = result[result.length - 1].split(/\s+/).length;
        const prev2Len = result[result.length - 2].split(/\s+/).length;

        if (Math.abs(len - prev1Len) < 8 && Math.abs(len - prev2Len) < 8 && Math.abs(prev1Len - prev2Len) < 8) {
          if (len > 20) {
            const splitPoints = [/,\s+(?:and|but|which|where|although|while|since|because|so)\s+/i, /;\s+/, /\s+—\s+/, /,\s+/];
            for (const sp of splitPoints) {
              const match = sent.match(sp);
              if (match && match.index) {
                const part1Words = sent.slice(0, match.index).split(/\s+/).length;
                const part2Words = sent.slice(match.index + match[0].length).split(/\s+/).length;
                if (part1Words >= 4 && part2Words >= 4 && Math.abs(part1Words - part2Words) > 5) {
                  let part1 = sent.slice(0, match.index).trim();
                  let part2 = sent.slice(match.index + match[0].length).trim();
                  if (!part1.endsWith(".")) part1 += ".";
                  part2 = part2[0].toUpperCase() + part2.slice(1);
                  result.push(part1);
                  sent = part2;
                  break;
                }
              }
            }
          }
        }
      }

      result.push(sent);
    }

    return result.join(" ");
  }).filter(Boolean).join("\n\n");
}

// ── Punctuation Humanization ──

function humanizePunctuation(text: string, features: InputFeatures): string {
  const paragraphs = text.split(/\n\s*\n/);
  let semicolonBudget = 3;
  let dashBudget = 4;
  let parenBudget = 2;

  const result = paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = sentTokenize(p);
    const processed: string[] = [];

    for (let i = 0; i < sentences.length; i++) {
      let sent = sentences[i].trim();
      if (!sent) continue;
      const words = sent.split(/\s+/);

      // Add semicolons: merge two medium sentences
      if (semicolonBudget > 0 && i < sentences.length - 1) {
        const next = sentences[i + 1]?.trim();
        if (next && words.length >= 8 && words.length <= 22) {
          const nextWords = next.split(/\s+/);
          if (nextWords.length >= 8 && nextWords.length <= 22) {
            const cleanSent = sent.replace(/\.$/, "");
            const lowerNext = next[0].toLowerCase() + next.slice(1);
            processed.push(cleanSent + "; " + lowerNext);
            semicolonBudget--;
            i++;
            continue;
          }
        }
      }

      // Add em dashes for mid-sentence asides
      if (dashBudget > 0 && words.length > 15) {
        const commaIdx = sent.indexOf(", ");
        if (commaIdx > 10 && commaIdx < sent.length - 20) {
          const nextComma = sent.indexOf(", ", commaIdx + 2);
          if (nextComma > commaIdx + 5 && nextComma < commaIdx + 40) {
            const aside = sent.slice(commaIdx + 2, nextComma);
            if (aside.split(/\s+/).length >= 3 && aside.split(/\s+/).length <= 10) {
              sent = sent.slice(0, commaIdx) + " — " + aside + " — " + sent.slice(nextComma + 2);
              dashBudget--;
            }
          }
        }
      }

      // Add parenthetical remark
      if (parenBudget > 0 && words.length > 18 && Math.random() < 0.3) {
        const asides = [
          "(at least in theory)", "(which few expected)", "(to some degree)",
          "(or so it seemed)", "(not without pushback)", "(though not everyone agreed)",
        ];
        const mid = Math.floor(sent.length / 2);
        const nearComma = sent.indexOf(", ", Math.max(mid - 20, 0));
        if (nearComma > 0 && nearComma < sent.length - 15) {
          const aside = asides[Math.floor(Math.random() * asides.length)];
          sent = sent.slice(0, nearComma + 2) + aside + " " + sent.slice(nearComma + 2);
          parenBudget--;
        }
      }

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
    const sentences = sentTokenize(para);

    if (sentences.length >= 6 && Math.random() < 0.5) {
      const splitPoint = Math.floor(sentences.length * (0.4 + Math.random() * 0.2));
      result.push(sentences.slice(0, splitPoint).join(" "));
      result.push(sentences.slice(splitPoint).join(" "));
    } else if (sentences.length <= 2 && i < paragraphs.length - 1) {
      const nextSentences = sentTokenize(paragraphs[i + 1]);
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

// ── Dependency Depth Enrichment ──

function enrichDependencyDepth(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  let budget = 4;

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = sentTokenize(p);
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

    const sentences = sentTokenize(p);
    const result: string[] = [];

    for (let i = 0; i < sentences.length; i++) {
      let sent = sentences[i].trim();
      if (!sent) continue;

      if (budget > 0 && Math.random() < 0.15) {
        const words = sent.split(/\s+/);

        // Strategy: Insert a hedging aside after a clause
        if (words.length > 12) {
          const hedges = [
            " — or at least that is the argument —",
            " — in broad terms —",
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
  result = result.replace(/—{2,}/g, "—");
  result = result.replace(/\(\s*\)/g, "");
  result = result.replace(/\[\s*\]/g, "");
  result = result.replace(/\b((?!very|much|so|more|had|that)\w{4,})\s+\1\b/gi, "$1");
  result = result.replace(/\ba ([aeiouAEIOU])/g, "an $1");
  result = result.replace(/\bA ([aeiouAEIOU])/g, "An $1");
  result = result.replace(/\ban ([bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ])/g, (match, letter) => {
    const exceptions = ["h"];
    return exceptions.includes(letter.toLowerCase()) ? match : "a " + letter;
  });
  result = result.replace(/\.\s+([a-z])/g, (_, ch) => ". " + ch.toUpperCase());
  result = result.replace(/^\s*([a-z])/gm, (_, ch) => ch.toUpperCase());

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

function signalAwareRefinement(text: string, features: InputFeatures, iteration: number): string {
  const signals = analyzeSignals(text);
  let result = text;

  // Fix burstiness (sentence length variation)
  if (signals.burstiness < 55) {
    result = forceExtremeVariation(result);
  }

  // Fix AI vocabulary patterns
  if (signals.ai_pattern_score > 20) {
    result = killAIVocabulary(result);
  }

  // Fix starter diversity
  if (signals.starter_diversity < 55) {
    result = diversifyStarters(result);
  }

  // Fix sentence uniformity
  if (signals.sentence_uniformity > 50) {
    result = breakSentenceUniformity(result);
  }

  // Fix dependency depth
  if (signals.dependency_depth < 40) {
    result = enrichDependencyDepth(result);
  }

  // Fix per-sentence AI ratio
  if (signals.per_sentence_ai_ratio > 40) {
    result = killAIVocabulary(result);
    result = naturalizeConnectors(result);
  }

  // Fix stylometric score
  if (signals.stylometric_score < 40) {
    result = humanizePunctuation(result, features);
  }

  // On later iterations, also address perplexity and vocabulary
  if (iteration >= 2) {
    if (signals.vocabulary_richness < 50) {
      result = injectWordDiversity(result);
    }
  }

  result = finalPolish(result);

  // Handle contractions
  if (!features.hasContractions) {
    result = removeContractions(result);
  }

  return result;
}

function forceExtremeVariation(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = sentTokenize(p);
    if (sentences.length < 3) return p;

    const result: string[] = [];

    for (let i = 0; i < sentences.length; i++) {
      const sent = sentences[i].trim();
      if (!sent) continue;
      const words = sent.split(/\s+/);

      // If in the "boring middle" (14-24 words) and too many already
      const middleCount = result.filter(s => {
        const len = s.split(/\s+/).length;
        return len >= 14 && len <= 24;
      }).length;

      if (words.length >= 14 && words.length <= 24 && middleCount >= 2) {
        const commaIdx = sent.indexOf(", ");
        if (commaIdx > 0 && commaIdx < sent.length / 2) {
          const part1Words = sent.slice(0, commaIdx).split(/\s+/).length;
          if (part1Words >= 3 && part1Words <= 9) {
            let part1 = sent.slice(0, commaIdx).trim();
            let part2 = sent.slice(commaIdx + 2).trim();
            if (!part1.endsWith(".")) part1 += ".";
            part2 = part2[0].toUpperCase() + part2.slice(1);
            result.push(part1);
            result.push(part2);
            continue;
          }
        }
      }

      result.push(sent);
    }

    return result.join(" ");
  }).filter(Boolean).join("\n\n");
}

function breakSentenceUniformity(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = sentTokenize(p);
    if (sentences.length < 4) return p;

    const result: string[] = [];
    let uniformRun = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sent = sentences[i].trim();
      if (!sent) continue;
      const len = sent.split(/\s+/).length;

      if (result.length > 0) {
        const prevLen = result[result.length - 1].split(/\s+/).length;
        if (Math.abs(len - prevLen) < 6) {
          uniformRun++;
        } else {
          uniformRun = 0;
        }
      }

      if (uniformRun >= 2 && len > 16) {
        const splitPoints = [/,\s+(?:and|but|which|while|so)\s+/i, /;\s+/, /\s+—\s+/];
        let split = false;
        for (const sp of splitPoints) {
          const match = sent.match(sp);
          if (match && match.index) {
            const part1Words = sent.slice(0, match.index).split(/\s+/).length;
            const part2Words = sent.slice(match.index + match[0].length).split(/\s+/).length;
            if (part1Words >= 4 && part2Words >= 4) {
              let part1 = sent.slice(0, match.index).trim();
              let part2 = sent.slice(match.index + match[0].length).trim();
              if (!part1.endsWith(".")) part1 += ".";
              part2 = part2[0].toUpperCase() + part2.slice(1);
              result.push(part1);
              result.push(part2);
              uniformRun = 0;
              split = true;
              break;
            }
          }
        }
        if (!split) result.push(sent);
      } else {
        result.push(sent);
      }
    }

    return result.join(" ");
  }).filter(Boolean).join("\n\n");
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

  for (const [common, alternatives] of Object.entries(DIVERSITY_SWAPS)) {
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

// ── Full Non-LLM Stealth Pass ──

function runStealthPass(
  text: string,
  features: InputFeatures,
  iteration: number,
): string {
  // Layer 2: Rule-based processing
  text = killAIVocabulary(text);
  text = naturalizeConnectors(text);
  text = diversifyStarters(text);

  // Layer 3: Statistical post-processing
  text = enforceBurstiness(text);
  text = humanizePunctuation(text, features);
  text = varyParagraphs(text);
  text = enrichDependencyDepth(text);

  // Only inject randomness on first pass
  if (iteration === 0) {
    text = injectControlledRandomness(text);
  }

  // Only inject word diversity on first pass (avoid over-diversifying)
  if (iteration === 0) {
    text = injectWordDiversity(text);
  }

  text = finalPolish(text);

  // Handle contractions
  if (!features.hasContractions) {
    text = removeContractions(text);
  }

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

  // Protect special content (brackets, figures, citations)
  const { text: protectedText, map: protectionMap } = protectSpecialContent(original);

  // ═══════════════════════════════════════════
  // LAYER 1: LLM Pipeline (3 separated phases)
  // ═══════════════════════════════════════════

  // -- Style profile for Phase 2
  const styleMem = getStyleMemory();
  const toneMap: Record<string, string> = {
    neutral: "journal_natural", formal: "thesis_formal", casual: "accessible_academic",
    academic: "academic_2010", natural: "journal_natural",
  };
  const profileName = toneMap[tone] ?? "journal_natural";
  const targetProfile = styleMem.get(profileName) ?? styleMem.getDefault();
  const currentStats = analyzeText(protectedText);
  const gap = computeGap(currentStats, targetProfile);
  const gapInstr = gapToInstructions(gap);

  console.log(`  [Ninja] Style profile: ${targetProfile.name}`);

  // Temperature map by strength
  const tempBase: Record<string, number> = { light: 0.55, medium: 0.70, strong: 0.85 };

  // ── Phase 1: Structural Rewrite ──
  console.log("  [Ninja] Phase 1: Structural rewrite...");
  let result = await llmCall(PHASE1_SYSTEM, buildPhase1Prompt(protectedText, features), tempBase[strength] ?? 0.70);

  if (!result || result.trim().length < protectedText.length * 0.3) {
    console.error("  [Ninja] Phase 1 too short, using original");
    result = protectedText;
  }
  console.log(`  [Ninja] Phase 1 done: ${result.split(/\s+/).length} words`);

  // ── Phase 2: Humanization Layer ──
  console.log("  [Ninja] Phase 2: Humanization layer...");
  const phase2System = buildPhase2System(targetProfile, gapInstr);
  const phase2Prompt = buildPhase2Prompt(result, strength, strictMeaning);
  result = await llmCall(phase2System, phase2Prompt, (tempBase[strength] ?? 0.70) + 0.05);

  if (!result || result.trim().length < protectedText.length * 0.3) {
    console.error("  [Ninja] Phase 2 too short, using Phase 1 output");
  }
  console.log(`  [Ninja] Phase 2 done: ${result.split(/\s+/).length} words`);

  // ── Phase 3: Constraint / Polish ──
  console.log("  [Ninja] Phase 3: Constraint / polish...");
  result = await llmCall(PHASE3_SYSTEM, buildPhase3Prompt(result, features.sentenceCount), 0.20);

  if (!result || result.trim().length < protectedText.length * 0.3) {
    console.error("  [Ninja] Phase 3 too short, using Phase 2 output");
  }
  console.log(`  [Ninja] Phase 3 done: ${result.split(/\s+/).length} words`);

  // ── LLM Validation + Auto-fix ──
  if (noContractions) result = removeContractions(result);

  const validation = validateAll(original, result);
  console.log(`  [Ninja] Validation: ${validation.all_passed ? "PASSED" : "ISSUES FOUND"}`);

  if (!validation.all_passed) {
    const checks = validation.checks;
    const fixIssues: string[] = [];
    if (noContractions && !checks.contractions.passed) {
      fixIssues.push(`Expand contractions: ${(checks.contractions.contractions_found as string[]).join(", ")}`);
    }
    if (!checks.structure.passed) {
      fixIssues.push(`Restore sentence count near ${checks.structure.original_sentences} (currently ${checks.structure.result_sentences}).`);
    }
    if (!checks.length.passed) {
      fixIssues.push(`Adjust word count near ${checks.length.original_words} (currently ${checks.length.result_words}).`);
    }
    if (!checks.lists.passed) {
      fixIssues.push("Remove introduced list formatting and keep prose.");
    }
    if (!checks.meaning.passed) {
      const missing = (checks.meaning.missing_keywords as string[]) ?? [];
      if (missing.length > 0) fixIssues.push("Reintroduce missing key terms: " + missing.slice(0, 8).join(", "));
    }
    if (fixIssues.length > 0) {
      console.log(`  [Ninja] Auto-fixing ${fixIssues.length} issues...`);
      const fixSystem = "You are a precise text editor. Fix only the listed issues and nothing else.";
      const fixPrompt = `Fix only these issues:\n${fixIssues.map(i => `- ${i}`).join("\n")}\n\nRules:\n- Do NOT use contractions.\n- Do NOT change paragraph structure.\n- Do NOT add or remove ideas.\n- Return only the fixed text.\n\nText:\n${result}`;
      result = await llmCall(fixSystem, fixPrompt, 0.15);
      if (noContractions) result = removeContractions(result);
    }
  }

  const llmPhaseCount = validation.all_passed ? 3 : 4;
  console.log(`  [Ninja] LLM pipeline complete (${llmPhaseCount} passes)`);

  // ═══════════════════════════════════════════
  // LAYERS 2+3: Non-LLM Stealth Processing
  // ═══════════════════════════════════════════
  console.log("  [Ninja] Starting non-LLM stealth processing...");

  // Initial analysis
  let perDetector = getPerDetectorScores(result);
  let worst = worstScore(perDetector);
  console.log(`  [Ninja] Post-LLM worst detector: ${worst.toFixed(1)}% (target: all <${TARGET_AI_SCORE}%)`);

  let bestResult = result;
  let bestScore = worst;

  if (allBelowTarget(perDetector)) {
    console.log(`  [Ninja] Already below ${TARGET_AI_SCORE}% — skipping stealth phases`);
  } else {
    // ═══════════════════════════════════════════
    // LAYER 4: Feedback Loop — iteratively refine
    // ═══════════════════════════════════════════

    for (let iteration = 0; iteration < MAX_FEEDBACK_ITERATIONS; iteration++) {
      // Run full stealth pass on first iteration, then signal-targeted on subsequent
      let processed: string;
      if (iteration === 0) {
        processed = runStealthPass(bestResult, features, iteration);
      } else {
        processed = signalAwareRefinement(bestResult, features, iteration);
      }

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

  // ── Restore protected content ──
  bestResult = restoreSpecialContent(bestResult.trim(), protectionMap);

  // ── Final diagnostics ──
  const outputWords = bestResult.split(/\s+/).length;
  const outputSentences = sentTokenize(bestResult);
  const finalSignals = analyzeSignals(bestResult);
  const meaningScore = semanticSimilaritySync(original, bestResult);
  const elapsed = (Date.now() - start) / 1000;
  const finalScores = getPerDetectorScores(bestResult);

  console.log(`  [Ninja] Output: ${outputWords} words, ${outputSentences.length} sentences`);
  console.log(`  [Ninja] Final signals: burst=${finalSignals.burstiness.toFixed(1)}, ai_pat=${finalSignals.ai_pattern_score.toFixed(1)}, uniform=${finalSignals.sentence_uniformity.toFixed(1)}, perplex=${finalSignals.perplexity.toFixed(1)}`);
  console.log(`  [Ninja] Final worst: ${worstScore(finalScores).toFixed(1)}%, overall: ${finalScores.overall?.toFixed(1) ?? "?"}%`);
  console.log(`  [Ninja] Meaning similarity: ${meaningScore.toFixed(2)}`);
  console.log(`  [Ninja] Complete in ${elapsed.toFixed(1)}s (${llmPhaseCount} LLM + ${MAX_FEEDBACK_ITERATIONS} max iterations)`);

  return bestResult;
}
