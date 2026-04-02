/**
 * LLM-Powered Academic Humanizer — Ninja Engine (TypeScript port)
 * ================================================================
 * PHASE A — LLM (4 OpenAI passes)
 *   Pass 1 - Core Draft (content fidelity)
 *   Pass 2 - Precision Humanizer (low-change mode with StyleProfile)
 *   Pass 3 - Natural Variation (light realism)
 *   Pass 4 - Academic Consistency (final review)
 *
 * PHASE B — Non-LLM Stealth Processing (4 aggressive phases)
 *   Phase 5 - AI Pattern Elimination
 *   Phase 6 - Deep Structural Transform
 *   Phase 7 - Synonym & Vocabulary Obfuscation
 *   Phase 8 - Human Texture Injection
 *
 * PHASE C — Iterative Detection Loop
 *   Re-run Phase B until ALL individual detector scores < 5% (max 6 iter)
 */

import OpenAI from "openai";
import { sentTokenize } from "./utils.js";
import * as rules from "./rules.js";
import * as utils from "./utils.js";
import { voiceShift, deepRestructure, expandContractions } from "./advanced-transforms.js";
import { getDictionary } from "./dictionary.js";
import { getDetector } from "./multi-detector.js";
import { getStyleMemory, profileSummaryText, type StyleProfile } from "./style-memory.js";
import { analyzeText, computeGap, gapToInstructions } from "./text-analyzer.js";
import { analyze as analyzeContext } from "./context-analyzer.js";
import { postProcess } from "./post-processor.js";
import { executeNinjaNonLlmPhases } from "./ninja-post-processor.js";
import { validateAll } from "./validation.js";
import { protectSpecialContent, restoreSpecialContent } from "./content-protection.js";

// ── Config ──

const LLM_MODEL = process.env.LLM_MODEL ?? "gpt-4o";
const MAX_STEALTH_ITERATIONS = 6;
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

// ── Contraction expansion ──

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

const CONTRACTION_RE = new RegExp(
  "\\b(" + Object.keys(EXPANSION_MAP).map((k) => k.replace(/'/g, "'?")).join("|") + ")\\b", "gi",
);

function ninjaExpandContractions(text: string): string {
  return text.replace(CONTRACTION_RE, (match) => {
    const expanded = EXPANSION_MAP[match.toLowerCase()] ?? match;
    return match[0] === match[0].toUpperCase() && expanded[0] === expanded[0].toLowerCase()
      ? expanded[0].toUpperCase() + expanded.slice(1) : expanded;
  });
}

// ── Helpers ──

function safeDowncaseFirst(s: string): string {
  if (!s) return s;
  const fw = s.split(/\s+/)[0] ?? "";
  if (fw.length > 1 && fw === fw.toUpperCase()) return s;
  return s[0].toLowerCase() + s.slice(1);
}

// ── Dict blacklist ──

const DICT_BLACKLIST = new Set([
  "bodoni","soh","thence","wherefore","hitherto","thereof",
  "mercantile","pursuance","pecuniary","remunerative","lucrative",
  "ain","tis","twas","nay","aye","hath","doth","thee","thou",
  "thy","thine","whence","whilst","atm","homophile","dodo",
  "grizzle","braw","facelift","gloriole","upwind","ardor",
  "fogey","carrefour","gild","cosmos","aerofoil","appall",
  "bionomical","planer","rick","permeant","enounce","audacious",
  "stuff","issue","issues","thing","things",
]);

function syllableCount(word: string): number {
  word = word.toLowerCase().replace(/es$/, "").replace(/ed$/, "");
  const vowels = "aeiouy";
  let count = 0, prev = false;
  for (const ch of word) {
    const isV = vowels.includes(ch);
    if (isV && !prev) count++;
    prev = isV;
  }
  return Math.max(1, count);
}

function isAcceptableWord(word: string): boolean {
  const low = word.toLowerCase();
  if (DICT_BLACKLIST.has(low)) return false;
  if (low.length > 12 || low.length < 3) return false;
  if (syllableCount(low) > 3) return false;
  return /^[a-z]+$/i.test(low);
}

// ── Detection scoring ──

function getAvgScore(text: string): number {
  if (!text.trim()) return 0;
  try {
    const detector = getDetector();
    const result = detector.analyze(text);
    return 100 - (result.summary?.overall_human_score ?? 50);
  } catch { return 0; }
}

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

// ── LLM Prompts ──

const CORE_DRAFT_SYSTEM = "You are an academic drafting assistant focused on content fidelity, logical structure, and completeness.";

function coreDraftUser(text: string): string {
  return `Write a clear academic draft explaining the following content.

Rules:
- Preserve original meaning and argument order exactly.
- Keep the same paragraph structure.
- Do not add new ideas or remove ideas.
- Do not use contractions.
- Return only the draft text.

Text:
${text}`;
}

const PRECISION_SYSTEM = `You are a Controlled Academic Rewriting Engine with Style Memory.

Your task is to rewrite the provided text so it reads like natural human academic writing while preserving original meaning, structure, and nearly all wording.

Do low-change rewriting only. No aggressive paraphrasing.`;

function buildPrecisionPrompt(
  text: string, profile: StyleProfile, gapInstructions: string,
  strength: string, strictMeaning: boolean, preserveSentences: boolean,
): string {
  let prompt = `Rewrite the following text to resemble authentic pre-2010 academic writing while preserving the original content, meaning, and overall sentence structure.

STRICT CONSTRAINTS (MANDATORY)
- Preserve at least 95% of original sentence boundaries.
- Only split or merge sentences when absolutely necessary (maximum 5%).
- Do NOT introduce new ideas, remove ideas, or reorganize argument flow.
- Do NOT convert prose into lists unless original text already contains lists.
- Do NOT use contractions.

${profileSummaryText(profile)}

${gapInstructions}

Sentence-level adjustments (subtle):
- Lightly vary sentence openings.
- Introduce mild syntactic variation by reordering clauses where natural.
- Insert occasional qualifying phrases like "in many cases" or "to some extent".
- Allow a small number of longer sentences through clause embedding.

Flow and academic tone:
- Replace overly direct phrasing with measured academic tone.
- Use hedging where appropriate: "suggests", "indicates", "appears to", "is likely to".
- Keep reasoning-driven flow.

Vocabulary refinement:
- Replace modern, generic, or AI-like wording with neutral scholarly vocabulary.
- Avoid exaggerated wording such as "crucial", "game-changing", "in today's world", "leveraging".
- Keep key technical terminology unchanged.

Structural realism:
- Introduce slight irregularity in rhythm and pacing.
- Avoid making the text overly polished or perfectly concise.
- Preserve complexity where it exists.

Punctuation and style:
- Maintain formal academic punctuation.
- Use commas for clause variation and occasional semicolons or dashes where natural.
- Do not overuse stylistic punctuation.

Output rules:
- Return only the rewritten text.
- Preserve paragraph structure exactly.
- Do not change sentence order.
`;

  if (strength === "light") prompt += "\nVariation control: target 3-5% maximum change, very low vocabulary drift.\n";
  else if (strength === "strong" || strength === "deep") prompt += "\nVariation control: allow up to 8% change, while preserving content and order.\n";
  else prompt += "\nVariation control: target 5-7% maximum change, low structural change.\n";

  if (strictMeaning) prompt += "\nStrict meaning mode: content deviation must be zero.\n";
  if (preserveSentences) prompt += "\nSentence lock: do not split or merge any sentence.\n";

  prompt += `\nText to rewrite:\n${text}`;
  return prompt;
}

const PASS3_SYSTEM = "You are a meticulous academic style editor.";
function pass3User(text: string): string {
  return `Refine the text to improve natural academic flow while preserving meaning and structure.
- Maintain sentence structure; do not rewrite extensively.
- Introduce slight variation in rhythm and phrasing.
- Allow minor redundancy where it improves realism.
- Ensure transitions feel natural rather than mechanical.
- Avoid making the text overly polished or perfectly uniform.
- Do NOT use contractions.
- Return only the refined text.

Text:
${text}`;
}

const PASS4_SYSTEM = "You are an academic quality reviewer.";
function pass4User(text: string): string {
  return `Review the text for academic tone and coherence.
- Ensure arguments are logically connected.
- Maintain formal academic language.
- Avoid modern or conversational phrasing.
- Preserve complexity where appropriate.
- Make only minimal edits.
- Do NOT use contractions.
- Return only the final text.

Text:
${text}`;
}

const FIX_SYSTEM = "You are a precise text editor. Fix only the listed issues and nothing else.";
function buildFixPrompt(text: string, issues: string[]): string {
  const issueText = issues.map((i) => `- ${i}`).join("\n");
  return `Fix only these issues:
${issueText}

Rules:
- Do NOT use contractions.
- Do NOT change paragraph structure.
- Do NOT add or remove ideas.
- Return only the fixed text.

Text:
${text}`;
}

// ── Phase 5: AI Pattern Elimination ──

const AI_MARKERS_REPLACE: Record<string, string> = {
  utilize:"use", utilise:"use", leverage:"use",
  facilitate:"support", comprehensive:"broad", multifaceted:"complex",
  paramount:"central", furthermore:"also", moreover:"also",
  additionally:"also", consequently:"so", subsequently:"then",
  nevertheless:"still", notwithstanding:"despite",
  aforementioned:"previous", paradigm:"model",
  methodology:"method", framework:"approach",
  trajectory:"path", discourse:"discussion",
  dichotomy:"divide", conundrum:"problem",
  ramification:"effect", underpinning:"basis",
  synergy:"cooperation", robust:"strong",
  nuanced:"detailed", salient:"notable",
  ubiquitous:"widespread", pivotal:"key",
  intricate:"complex", meticulous:"careful",
  profound:"deep", inherent:"built-in",
  overarching:"main", substantive:"real",
  efficacious:"effective", holistic:"whole",
  transformative:"major", innovative:"new",
  groundbreaking:"important", noteworthy:"notable",
  proliferate:"spread", exacerbate:"worsen",
  ameliorate:"improve", engender:"produce",
  delineate:"describe", elucidate:"explain",
  illuminate:"clarify", necessitate:"require",
  perpetuate:"continue", underscore:"highlight",
  exemplify:"show", encompass:"include",
  bolster:"support", catalyze:"drive",
  streamline:"simplify", optimize:"improve",
  mitigate:"reduce", navigate:"handle",
  prioritize:"focus on", articulate:"express",
  substantiate:"support", corroborate:"confirm",
  disseminate:"spread", cultivate:"develop",
  ascertain:"determine", endeavor:"attempt",
  delve:"look", embark:"start", foster:"encourage",
  harness:"use", spearhead:"lead", unravel:"untangle",
  unveil:"reveal", notably:"in particular",
  crucially:"importantly", significantly:"greatly",
  essentially:"basically", fundamentally:"at its core",
  arguably:"perhaps", undeniably:"clearly",
  undoubtedly:"certainly", interestingly:"surprisingly",
  remarkably:"unusually", evidently:"clearly",
  tapestry:"mix", cornerstone:"foundation",
  bedrock:"basis", linchpin:"key element",
  catalyst:"driver", nexus:"connection",
  spectrum:"range", myriad:"many",
  plethora:"abundance", multitude:"many",
  landscape:"field", realm:"area",
  culminate:"end", enhance:"improve",
};

const AI_PHRASE_KILLS: [RegExp, string][] = [
  [/it is (?:important|crucial|essential|vital|imperative) (?:to note )?that\s*/gi, ""],
  [/it (?:should|must|can|cannot) be (?:noted|argued|said|emphasized|stressed|acknowledged) that\s*/gi, ""],
  [/in (?:order )?to\b/gi, "to"],
  [/in today'?s (?:world|society|landscape|era)\b/gi, "today"],
  [/in the modern (?:era|age|world)\b/gi, "today"],
  [/plays? a (?:crucial|vital|key|significant|important|pivotal|critical|fundamental|instrumental|central) role\b/gi, "matters"],
  [/a (?:wide|broad|vast|diverse) (?:range|array|spectrum|variety) of\b/gi, "many"],
  [/a (?:plethora|myriad|multitude|wealth|abundance) of\b/gi, "many"],
  [/(?:due to|owing to) the fact that\b/gi, "because"],
  [/as a (?:result|consequence)\b/gi, "so"],
  [/(?:with (?:respect|regard) to)\b/gi, "about"],
  [/first and foremost\b/gi, "first"],
  [/each and every\b/gi, "every"],
  [/needless to say\b/gi, "clearly"],
  [/there is no doubt that\b/gi, "clearly"],
  [/at the end of the day\b/gi, "ultimately"],
  [/on the other hand\b/gi, "but"],
  [/this (?:paper|essay|study|analysis) (?:discusses|examines|explores|investigates|delves into|aims to)\b/gi, "this work considers"],
  [/serves? as a (?:testament|reminder|catalyst|cornerstone|foundation)\b/gi, "shows"],
  [/the (?:importance|significance|impact) of\b/gi, "how"],
  [/(?:moving|going|looking) forward\b/gi, "next"],
  [/not only (.{5,40}?) but also\b/gi, "$1 and also"],
  [/it (?:remains|is) (?:unclear|debatable|yet to be seen)\b/gi, "the question remains"],
  [/(?:taken together|all things considered|on the whole)\b/gi, "overall"],
  [/(?:that being said|having said that|with that in mind)\b/gi, "still"],
  [/(?:in light of|in view of) (?:the above|this|these)\b/gi, "given this"],
];

function phase5AiPatternElimination(text: string, intensity = 1.5): string {
  // Process each paragraph independently to preserve breaks
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs.map((para) => {
    let p = para.trim();
    if (!p) return "";

    // Kill AI phrases
    for (const [pattern, replacement] of AI_PHRASE_KILLS) {
      p = p.replace(new RegExp(pattern.source, pattern.flags), replacement);
    }

    // Replace AI marker words
    const words = p.split(/\s+/);
    const newWords: string[] = [];
    for (const w of words) {
      const stripped = w.replace(/^[.,;:!?"'()\-\[\]{}]+/, "").replace(/[.,;:!?"'()\-\[\]{}]+$/, "");
      const lower = stripped.toLowerCase();
      if (AI_MARKERS_REPLACE[lower] && Math.random() < Math.min(0.85 * intensity, 0.95)) {
        let replacement = AI_MARKERS_REPLACE[lower];
        if (stripped[0] === stripped[0].toUpperCase() && replacement[0] === replacement[0].toLowerCase()) {
          replacement = replacement[0].toUpperCase() + replacement.slice(1);
        }
        const pre = w.match(/^[.,;:!?"'()\-\[\]{}]+/)?.[0] ?? "";
        const suf = w.match(/[.,;:!?"'()\-\[\]{}]+$/)?.[0] ?? "";
        newWords.push(pre + replacement + suf);
      } else {
        newWords.push(w);
      }
    }
    p = newWords.join(" ");

    // Replace AI sentence starters
    const sentences = sentTokenize(p);
    return sentences.map((sent) => utils.replaceAiStarters(sent)).join(" ");
  }).filter(Boolean).join("\n\n");
}

// ── Phase 6: Deep Structural Transform ──

const CONNECTOR_SWAPS: Record<string, string[]> = {
  "Furthermore, ": ["Plus, ", "On top of that, ", "And beyond that, "],
  "Moreover, ": ["Besides, ", "Adding to this, ", "On a related note, "],
  "Additionally, ": ["Also, ", "On top of this, ", "Then there is "],
  "Consequently, ": ["So, ", "As a result, ", "The outcome? "],
  "Nevertheless, ": ["Still, ", "Even so, ", "But then again, "],
  "Nonetheless, ": ["Even still, ", "Yet, ", "All the same, "],
  "In contrast, ": ["But, ", "On the flip side, ", "Then again, "],
  "Subsequently, ": ["After that, ", "Then, ", "From there, "],
  "In conclusion, ": ["All things considered, ", "When it comes down to it, "],
  "Ultimately, ": ["In the end, ", "When it comes down to it, "],
  "Therefore, ": ["So, ", "For this reason, ", "Hence, "],
  "Accordingly, ": ["In response, ", "As a result, "],
};

const OPENER_VARIANTS = [
  "On that note, ", "Tied to this, ", "Related to this, ",
  "Meanwhile, ", "At the same time, ", "Then again, ",
  "Put differently, ", "In other words, ", "Equally worth noting, ",
];

function phase6DeepStructuralTransform(text: string, intensity = 1.5): string {
  // Process each paragraph independently to preserve breaks
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs.map((para) => {
    const p = para.trim();
    if (!p) return "";

    const sentences = sentTokenize(p);
    const transformed: string[] = [];

    for (const rawSent of sentences) {
      let sent = rawSent.trim();
      if (!sent) continue;

      // Connector replacement
      for (const [formal, replacements] of Object.entries(CONNECTOR_SWAPS)) {
        if (sent.startsWith(formal)) {
          sent = replacements[Math.floor(Math.random() * replacements.length)] + sent.slice(formal.length);
          break;
        }
      }

      // Deep restructuring
      if (sent.split(/\s+/).length > 8 && Math.random() < Math.min(0.40 * intensity, 0.80)) {
        sent = deepRestructure(sent, intensity);
      }

      // Voice shift
      const wc = sent.split(/\s+/).length;
      if (wc >= 10 && wc <= 25) {
        const voiceProb = Math.min(0.12 * intensity, 0.45);
        sent = voiceShift(sent, voiceProb);
      }

      // Clause reorder + connector variation
      sent = utils.restructureSentence(sent, intensity);
      sent = utils.varyConnectors(sent);

      transformed.push(sent);
    }

    // Vary repetitive sentence starts
    const result: string[] = [transformed[0] ?? ""];
    for (let i = 1; i < transformed.length; i++) {
      const prevStart = (result[result.length - 1].split(/\s+/)[0] ?? "").toLowerCase();
      const currStart = (transformed[i].split(/\s+/)[0] ?? "").toLowerCase();
      if (prevStart && currStart === prevStart && transformed[i].split(/\s+/).length > 5) {
        const opener = OPENER_VARIANTS[Math.floor(Math.random() * OPENER_VARIANTS.length)];
        result.push(opener + safeDowncaseFirst(transformed[i]));
      } else {
        result.push(transformed[i]);
      }
    }

    return result.join(" ");
  }).filter(Boolean).join("\n\n");
}

// ── Phase 7: Synonym & Vocabulary Obfuscation ──

function phase7SynonymObfuscation(text: string, intensity = 1.5): string {
  const capped = Math.min(intensity, 0.6);
  let protectedExtra: Set<string> | undefined;
  try { protectedExtra = analyzeContext(text).protectedTerms; } catch { /* skip */ }

  // Process each paragraph independently to preserve breaks
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs.map((para) => {
    const p = para.trim();
    if (!p) return "";
    const sentences = sentTokenize(p);
    const usedWords = new Set<string>();
    return sentences.map((sent) => {
      sent = utils.synonymReplace(sent, capped, usedWords, protectedExtra);
      sent = utils.phraseSubstitute(sent, capped);
      return sent;
    }).join(" ");
  }).filter(Boolean).join("\n\n");
}

// ── Phase 8: Human Texture Injection ──

const HUMAN_STARTERS = [
  "And ", "But ", "Yet ", "Still, ", "Now, ", "Sure, ",
  "Of course, ", "Then again, ", "True, ", "Granted, ",
  "To be fair, ", "In practice, ", "Not surprisingly, ",
  "Put simply, ", "It helps to remember that ",
  "Part of the issue is that ", "In many ways, ",
];

const HUMAN_HEDGES = [
  " -- at least in theory --", " -- and this matters --",
  " -- or so it seems --", " -- to a point --",
  " (arguably)", " (at least partly)", " (to some degree)",
  " (in most cases)", ", to some extent,", ", it seems,",
  ", in practice,", ", admittedly,",
];

const PUNCHY_INSERTS = [
  "That matters.", "This is not trivial.", "The stakes are real.",
  "And it shows.", "That distinction matters.", "Few would dispute this.",
  "That alone says a lot.", "The shift is noticeable.",
];

function phase8HumanTexture(text: string, intensity = 1.5): string {
  // Process each paragraph independently to preserve breaks
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs.map((para) => {
    const p = para.trim();
    if (!p) return "";

    let sentences = sentTokenize(p);
    if (sentences.length < 3) return p;

    // Rhythm variation: break uniform sentence lengths
    const lengths = sentences.map((s) => s.split(/\s+/).length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, l) => a + (l - avg) ** 2, 0) / lengths.length;

    if (variance < 25) {
      const newSents: string[] = [];
      for (const s of sentences) {
        const words = s.split(/\s+/);
        if (words.length > 20 && Math.random() < 0.30) {
          const mid = Math.floor(words.length / 2);
          let split = false;
          outer: for (let offset = 0; offset < Math.min(5, mid); offset++) {
            for (const pos of [mid + offset, mid - offset]) {
              if (pos > 0 && pos < words.length && words[pos - 1].endsWith(",")) {
                const nextWord = words[pos].toLowerCase();
                if (!["which", "who", "that", "where", "when"].includes(nextWord)) {
                  const part1 = words.slice(0, pos).join(" ").replace(/\.$/, "");
                  let part2 = words.slice(pos).join(" ");
                  part2 = part2[0].toUpperCase() + part2.slice(1);
                  newSents.push(part1, part2);
                  split = true;
                  break outer;
                }
              }
            }
          }
          if (!split) newSents.push(s);
        } else {
          newSents.push(s);
        }
      }
      sentences = newSents;
    }

    // Inject casual human starters (max 2)
    const probStart = Math.min(0.15 * intensity, 0.40);
    let starterCount = 0;
    const usedStarters = new Set<string>();
    let result = [sentences[0]];
    for (let i = 1; i < sentences.length; i++) {
      let s = sentences[i];
      if (Math.random() < probStart && s.split(/\s+/).length > 6 && starterCount < 2) {
        const available = HUMAN_STARTERS.filter((st) => !usedStarters.has(st));
        if (available.length > 0) {
          const starter = available[Math.floor(Math.random() * available.length)];
          usedStarters.add(starter);
          s = starter + safeDowncaseFirst(s);
          starterCount++;
        }
      }
      result.push(s);
    }
    sentences = result;

    // Inject hedging/asides (max 1)
    const probHedge = Math.min(0.10 * intensity, 0.05);
    let hedgeDone = false;
    const result2: string[] = [];
    for (const s of sentences) {
      const words = s.split(/\s+/);
      if (!hedgeDone && Math.random() < probHedge && words.length > 12) {
        const commaPositions = words.map((w, j) => w.endsWith(",") && j > 4 && j < words.length - 4 ? j : -1).filter((j) => j >= 0);
        if (commaPositions.length > 0) {
          const pos = commaPositions[Math.floor(Math.random() * commaPositions.length)];
          const hedge = HUMAN_HEDGES[Math.floor(Math.random() * HUMAN_HEDGES.length)].trim();
          words.splice(pos + 1, 0, hedge);
          result2.push(words.join(" "));
          hedgeDone = true;
          continue;
        }
      }
      result2.push(s);
    }
    sentences = result2;

    // Insert punchy sentences (max 1)
    const result3: string[] = [];
    let punchyDone = false;
    for (let i = 0; i < sentences.length; i++) {
      result3.push(sentences[i]);
      if (!punchyDone && sentences[i].split(/\s+/).length > 18 && Math.random() < 0.20 && i < sentences.length - 1) {
        result3.push(PUNCHY_INSERTS[Math.floor(Math.random() * PUNCHY_INSERTS.length)]);
        punchyDone = true;
      }
    }

    return result3.join(" ");
  }).filter(Boolean).join("\n\n");
}

// ── Cleanup ──

function cleanupText(text: string): string {
  // Process each paragraph independently to preserve breaks
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs.map((para) => {
    let p = para.trim();
    if (!p) return "";
    p = p.replace(/ {2,}/g, " ");
    p = p.replace(/\.{2,}/g, ".");
    p = p.replace(/\s+([.,;:!?])/g, "$1");
    p = p.replace(/,{2,}/g, ",");
    p = p.replace(/;{2,}/g, ";");
    p = p.replace(/—{2,}/g, "—");
    p = p.replace(/\(\s*\)/g, "");
    p = p.replace(/[^\S\n]{2,}/g, " ");
    p = p.replace(/\band\b[,;]?\s+\band\b/gi, "and");
    p = p.replace(/\bbut\b[,;]?\s+\bbut\b/gi, "but");
    p = p.replace(/\ba ([aeiouAEIOU])/g, "an $1");
    p = p.replace(/\bA ([aeiouAEIOU])/g, "An $1");
    p = p.replace(/\ban ([bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ])/g, "a $1");
    const sentences = sentTokenize(p);
    return sentences.map((s) => {
      s = s.trim();
      return s ? s[0].toUpperCase() + s.slice(1) : "";
    }).filter(Boolean).join(" ");
  }).filter(Boolean).join("\n\n");
}

// ── Full Non-LLM Stealth Pass (Phases 5-8) ──

function runStealthPhases(
  text: string, intensity: number, noContractions: boolean,
  iteration: number, enablePostProcessing: boolean,
): string {
  text = phase5AiPatternElimination(text, intensity);
  text = phase6DeepStructuralTransform(text, intensity);
  // Full intensity on first pass, gentle on repeats
  const synIntensity = iteration === 0 ? intensity : 0.3;
  text = phase7SynonymObfuscation(text, synIntensity);
  text = phase8HumanTexture(text, intensity);
  text = cleanupText(text);
  if (noContractions) {
    text = ninjaExpandContractions(text);
    text = expandContractions(text);
  }
  if (enablePostProcessing) text = postProcess(text);
  return text;
}

// ── Public API ──

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
  const metrics = { llmPasses: 0, stealthIterations: 0, fixes: 0 };

  const original = text.trim();
  const paragraphs = original.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  let cleaned = paragraphs.join("\n\n");

  // Protect brackets, figures, percentages before any processing
  const { text: protectedCleaned, map: protectionMap } = protectSpecialContent(cleaned);
  cleaned = protectedCleaned;
  const inputParagraphCount = paragraphs.length;

  // ── PHASE A: LLM Pipeline (4 passes) ──

  const styleMem = getStyleMemory();
  // Map tone → profile name
  const toneProfileMap: Record<string, string> = {
    neutral: "academic_2010", formal: "thesis_formal", casual: "accessible_academic",
    academic: "academic_2005", natural: "journal_natural",
  };
  const profileName = toneProfileMap[tone] ?? "academic_2010";
  const targetProfile = styleMem.get(profileName) ?? styleMem.getDefault();
  const currentStats = analyzeText(cleaned);
  const gap = computeGap(currentStats, targetProfile);
  const gapInstr = gapToInstructions(gap);

  console.log(`  [Ninja] Style profile: ${targetProfile.name}`);

  // Pass 1: Core Draft
  let result = await llmCall(CORE_DRAFT_SYSTEM, coreDraftUser(cleaned), 0.3);
  metrics.llmPasses++;
  console.log("  [Ninja] Pass 1 complete (core draft)");

  // Pass 2: Precision Humanizer
  const precisionPrompt = buildPrecisionPrompt(result, targetProfile, gapInstr, strength, strictMeaning, preserveSentences);
  result = await llmCall(PRECISION_SYSTEM, precisionPrompt, 0.45);
  metrics.llmPasses++;
  console.log("  [Ninja] Pass 2 complete (precision humanizer)");

  // Pass 3: Natural Variation
  result = await llmCall(PASS3_SYSTEM, pass3User(result), 0.4);
  metrics.llmPasses++;
  console.log("  [Ninja] Pass 3 complete (natural variation)");

  // Pass 4: Academic Consistency
  result = await llmCall(PASS4_SYSTEM, pass4User(result), 0.25);
  metrics.llmPasses++;
  console.log("  [Ninja] Pass 4 complete (academic consistency)");

  // Deterministic post-processing
  result = executeNinjaNonLlmPhases(result);
  console.log("  [Ninja] Non-LLM aggressive processing completed");

  // Contractions & paragraph preservation
  if (noContractions) result = ninjaExpandContractions(result);

  // LLM validation + fix
  const validation = validateAll(original, result);
  console.log(`  [Ninja] LLM validation: ${validation.all_passed ? "PASSED" : "ISSUES FOUND"}`);

  if (!validation.all_passed && metrics.fixes < 2) {
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
      const fixPrompt = buildFixPrompt(result, fixIssues);
      result = await llmCall(FIX_SYSTEM, fixPrompt, 0.2);
      if (noContractions) result = ninjaExpandContractions(result);
      metrics.llmPasses++;
      metrics.fixes++;
      console.log(`  [Ninja] LLM auto-fix applied (${fixIssues.length} issues)`);
    }
  }

  console.log(`  [Ninja] LLM phase complete (${metrics.llmPasses} passes)`);

  // ── PHASE B+C: Non-LLM Stealth + Detection Loop ──

  const intensityMap: Record<string, number> = { light: 1.0, medium: 1.5, strong: 2.0 };
  const baseIntensity = intensityMap[strength] ?? 1.5;
  const intensityCap: Record<string, number> = { light: 2.5, medium: 3.5, strong: 4.5 };
  const cap = intensityCap[strength] ?? 3.5;

  let bestResult = result;
  let bestScore = 100.0;

  // Check initial score after LLM passes
  const initialPerDetector = getPerDetectorScores(result);
  const initialWorst = worstScore(initialPerDetector);
  console.log(`  [Ninja] Post-LLM worst detector: ${initialWorst.toFixed(1)}% (target: all <${TARGET_AI_SCORE}%)`);

  if (allBelowTarget(initialPerDetector)) {
    bestResult = result;
    bestScore = initialWorst;
    console.log(`  [Ninja] Already below ${TARGET_AI_SCORE}% — skipping stealth phases`);
  } else {
    for (let iteration = 0; iteration < MAX_STEALTH_ITERATIONS; iteration++) {
      const intensity = Math.min(baseIntensity + iteration * 0.3, cap);

      const stealthResult = runStealthPhases(
        bestResult, intensity, noContractions, iteration, enablePostProcessing,
      );
      metrics.stealthIterations++;

      const perDetector = getPerDetectorScores(stealthResult);
      const worst = worstScore(perDetector);

      console.log(
        `  [Ninja] Stealth iteration ${iteration + 1}: worst=${worst.toFixed(1)}% ` +
        `(scores: ${JSON.stringify(perDetector)})`,
      );

      if (worst < bestScore) {
        bestResult = stealthResult;
        bestScore = worst;
      }

      if (allBelowTarget(perDetector)) {
        console.log(`  [Ninja] Target reached: all detectors < ${TARGET_AI_SCORE}%`);
        break;
      }
    }
  }

  // ── Final stats ──
  const outputStats = analyzeText(bestResult);
  const elapsed = (Date.now() - start) / 1000;
  const finalScores = getPerDetectorScores(bestResult);
  console.log(
    `  [Ninja] Output: sents=${outputStats.sentence_count}, words=${outputStats.word_count}, ` +
    `avg_sl=${outputStats.avg_sentence_length}, hedge=${outputStats.hedging_rate.toFixed(2)}, ` +
    `ttr=${outputStats.lexical_diversity.toFixed(2)}`,
  );
  console.log(`  [Ninja] Final scores: ${JSON.stringify(finalScores)}`);
  console.log(
    `  [Ninja] Complete: ${metrics.llmPasses} LLM passes, ` +
    `${metrics.stealthIterations} stealth iterations, ` +
    `${metrics.fixes} fixes, ${elapsed.toFixed(1)}s`,
  );

  return restoreSpecialContent(bestResult.trim(), protectionMap);
}
