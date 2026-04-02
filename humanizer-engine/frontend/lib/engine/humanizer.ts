/**
 * Humanizer Engine v3 — Aggressive Human-Flow Pipeline (TypeScript port)
 * =====================================================================
 * Context-aware, settings-driven humanizer achieving 75%+ word change
 * and targeting near-zero AI detection in stealth mode.
 */

import {
  sentTokenize,
  synonymReplace,
  phraseSubstitute,
  replaceAiStarters,
  restructureSentence,
  varyConnectors,
  makeBurstier,
  rejoinTokens,
} from "./utils.js";
import { SYNONYM_BANK, PROTECTED_WORDS, BURSTINESS_TARGET } from "./rules.js";
import { postProcess } from "./post-processor.js";
import { analyze as analyzeContext, type TextContext } from "./context-analyzer.js";
import {
  voiceShift,
  deepRestructure,
  expandContractions,
  hasFirstPerson,
  mergeShortSentences,
} from "./advanced-transforms.js";
import { getDictionary, type HumanizerDictionary } from "./dictionary.js";
import { getDetector, type AnalysisResult } from "./multi-detector.js";
import { protectSpecialContent, restoreSpecialContent, type ProtectionMap } from "./content-protection.js";

// ── Helpers ──

function safeDowncaseFirst(s: string): string {
  if (!s) return s;
  const firstWord = s.split(/\s+/)[0] ?? "";
  if (firstWord.length > 1 && firstWord === firstWord.toUpperCase()) return s;
  return s[0].toLowerCase() + s.slice(1);
}

/**
 * Detect whether a paragraph looks like a title or heading.
 * Titles/headings are preserved with minimal or no transformation.
 */
function isTitleOrHeading(para: string): boolean {
  const trimmed = para.trim();
  if (!trimmed) return false;
  // Markdown headings
  if (/^#{1,6}\s/.test(trimmed)) return true;
  // Very short (<=10 words) with no ending sentence punctuation
  const words = trimmed.split(/\s+/);
  if (words.length <= 10 && !/[.!?]$/.test(trimmed)) return true;
  // All-caps short line
  if (words.length <= 12 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) return true;
  return false;
}

function syllableCount(word: string): number {
  let w = word.toLowerCase().replace(/es$/, "").replace(/ed$/, "");
  const vowels = "aeiouy";
  let count = 0;
  let prev = false;
  for (const ch of w) {
    const isV = vowels.includes(ch);
    if (isV && !prev) count++;
    prev = isV;
  }
  return Math.max(1, count);
}

// ── 50% Sentence Restructuring ──

/**
 * Extract topic keywords from a set of sentences.
 * These are nouns/key terms that appear multiple times and must be preserved.
 */
function extractTopicKeywords(sentences: string[]): Set<string> {
  const stopWords = new Set([
    "the", "a", "an", "of", "in", "to", "for", "and", "or", "but",
    "is", "are", "was", "were", "be", "been", "being", "has", "have",
    "had", "do", "does", "did", "will", "would", "could", "should",
    "may", "might", "shall", "can", "this", "that", "these", "those",
    "it", "its", "they", "them", "their", "he", "she", "his", "her",
    "we", "our", "you", "your", "not", "no", "by", "at", "on", "with",
    "from", "as", "if", "so", "yet", "also", "all", "each", "both",
    "which", "who", "what", "when", "where", "how", "than", "more",
    "most", "such", "many", "much", "some", "any", "very", "just",
    "then", "there", "here", "into", "about", "after", "before",
  ]);
  const freq = new Map<string, number>();
  for (const s of sentences) {
    for (const w of s.split(/\s+/)) {
      const low = w.replace(/[^a-zA-Z]/g, "").toLowerCase();
      if (low.length > 3 && !stopWords.has(low)) {
        freq.set(low, (freq.get(low) ?? 0) + 1);
      }
    }
  }
  const keywords = new Set<string>();
  for (const [word, count] of freq) {
    if (count >= 2 || word.length >= 6) keywords.add(word);
  }
  return keywords;
}

/** Subordinating conjunctions that mark clause boundaries for restructuring */
const CLAUSE_SPLITTERS = /\b(because|since|although|though|while|whereas|unless|until|after|before|when|if|even though|given that|provided that|so that|in order to)\b/i;

/** Reorder clauses in a single sentence while preserving topic keywords */
function restructureSingleSentence(sent: string, topicKeywords: Set<string>): string {
  const words = sent.split(/\s+/);
  if (words.length < 8) return sent;

  // Strategy 1: Move subordinate clause to front
  const match = sent.match(new RegExp(",\\s*(" + CLAUSE_SPLITTERS.source + "\\s+.+)$", "i"));
  if (match && match[1]) {
    const subordinate = match[1].trim();
    const main = sent.slice(0, match.index!).trim();
    if (subordinate.split(/\s+/).length >= 4 && main.split(/\s+/).length >= 4) {
      const reordered = subordinate.replace(/\.$/, "") + ", " + safeDowncaseFirst(main);
      if (reordered[0] !== reordered[0].toUpperCase()) {
        return reordered[0].toUpperCase() + reordered.slice(1) + (reordered.endsWith(".") ? "" : ".");
      }
      return reordered + (reordered.endsWith(".") ? "" : ".");
    }
  }

  // Strategy 2: Move prepositional/adverbial phrase from end to front
  const endPhraseMatch = sent.match(/,\s+((?:in|on|at|for|with|by|through|during|within|across|among|between|under|over|after|before)\s+[^,]+)\.?\s*$/i);
  if (endPhraseMatch && endPhraseMatch[1]) {
    const phrase = endPhraseMatch[1].trim().replace(/\.$/, "");
    const rest = sent.slice(0, endPhraseMatch.index!).trim();
    if (phrase.split(/\s+/).length >= 3 && rest.split(/\s+/).length >= 5) {
      let result = phrase[0].toUpperCase() + phrase.slice(1) + ", " + safeDowncaseFirst(rest);
      if (!/[.!?]$/.test(result)) result += ".";
      return result;
    }
  }

  // Strategy 3: Swap two independent clauses around a conjunction
  for (const conj of [", and ", ", but ", ", yet ", ", while "]) {
    const idx = sent.toLowerCase().indexOf(conj);
    if (idx > 0 && idx < sent.length - conj.length - 5) {
      const clause1 = sent.slice(0, idx).trim();
      const clause2 = sent.slice(idx + conj.length).trim();
      if (clause1.split(/\s+/).length >= 5 && clause2.split(/\s+/).length >= 5) {
        const swapConj = conj === ", and " ? ", and " : conj === ", but " ? ", though " : conj === ", yet " ? ", and yet " : ", while ";
        let result = clause2.replace(/\.$/, "")[0].toUpperCase() + clause2.replace(/\.$/, "").slice(1) + swapConj + safeDowncaseFirst(clause1);
        if (!/[.!?]$/.test(result)) result += ".";
        return result;
      }
    }
  }

  return sent;
}

/**
 * Restructure approximately 50% of sentences by reordering clauses and phrases.
 * Preserves topic keywords and ensures smooth flow.
 */
function restructure50Percent(sentences: string[]): string[] {
  if (sentences.length < 2) return sentences;

  const topicKeywords = extractTopicKeywords(sentences);
  const targetCount = Math.ceil(sentences.length * 0.5);

  // Select indices to restructure: every other + fill randomly
  const indices = new Set<number>();
  for (let i = 0; i < sentences.length && indices.size < targetCount; i += 2) {
    indices.add(i);
  }
  while (indices.size < targetCount && indices.size < sentences.length) {
    const r = Math.floor(Math.random() * sentences.length);
    indices.add(r);
  }

  return sentences.map((sent, i) => {
    if (!indices.has(i)) return sent;
    if (sent.split(/\s+/).length < 8) return sent; // too short to restructure
    const restructured = restructureSingleSentence(sent, topicKeywords);
    // Verify topic keywords are preserved
    const origKeywords = new Set(
      sent.split(/\s+/).map((w) => w.replace(/[^a-zA-Z]/g, "").toLowerCase()).filter((w) => topicKeywords.has(w)),
    );
    const newKeywords = new Set(
      restructured.split(/\s+/).map((w) => w.replace(/[^a-zA-Z]/g, "").toLowerCase()).filter((w) => topicKeywords.has(w)),
    );
    // If we lost any topic keyword, keep original
    for (const kw of origKeywords) {
      if (!newKeywords.has(kw)) return sent;
    }
    return restructured;
  });
}

// ── Phrasal Verb Expansion ──

/** Phrasal verb expansions: verb → [phrasal alternatives] */
const PHRASAL_VERB_MAP: Record<string, string[]> = {
  "use": ["make use of", "draw on"],
  "show": ["bring to light", "point to"],
  "cause": ["give rise to", "bring about"],
  "find": ["come across", "arrive at"],
  "start": ["set out to", "embark on"],
  "stop": ["put an end to", "bring to a halt"],
  "increase": ["build up", "ramp up"],
  "decrease": ["scale back", "cut down on"],
  "create": ["bring into being", "come up with"],
  "improve": ["build on", "follow up on"],
  "support": ["stand behind", "back up"],
  "examine": ["look into", "go through"],
  "consider": ["think through", "take into account"],
  "develop": ["build on", "flesh out"],
  "establish": ["set up", "put in place"],
  "maintain": ["keep up", "hold on to"],
  "achieve": ["bring about", "follow through on"],
  "address": ["deal with", "attend to"],
  "provide": ["come up with", "put forward"],
  "indicate": ["point to", "speak to"],
  "suggest": ["point toward", "lean toward"],
  "require": ["call for", "count on"],
  "involve": ["take part in", "bring in"],
  "produce": ["turn out", "bring forth"],
  "analyze": ["break down", "look into"],
  "analyse": ["break down", "look into"],
  "explain": ["account for", "spell out"],
  "determine": ["figure out", "work out"],
  "demonstrate": ["bring out", "lay out"],
  "contribute": ["add to", "feed into"],
  "eliminate": ["do away with", "wipe out"],
  "implement": ["carry out", "put into practice"],
  "investigate": ["look into", "dig into"],
  "reveal": ["bring to light", "open up"],
  "resolve": ["sort out", "work through"],
  "reduce": ["cut back on", "scale down"],
  "identify": ["single out", "pick out"],
};

/**
 * Expand short sentences using phrasal verb substitutions.
 * Only targets sentences below 15 words, expanding them to stay in 10-50 range.
 * Uses statistical probability: only expands when it makes semantic sense.
 */
function expandWithPhrasalVerbs(sentences: string[], intensity: number): string[] {
  const expandProb = Math.min(0.08 * intensity, 0.40);

  return sentences.map((sent) => {
    const words = sent.split(/\s+/);
    if (words.length >= 20 || words.length < 6) return sent; // only target short-ish sentences
    if (Math.random() > expandProb) return sent;

    // Find a verb to expand
    for (let i = 0; i < words.length; i++) {
      const stripped = words[i].replace(/[^a-zA-Z]/g, "").toLowerCase();
      const expansions = PHRASAL_VERB_MAP[stripped];
      if (expansions && expansions.length > 0) {
        const phrasal = expansions[Math.floor(Math.random() * expansions.length)];
        // Check the expanded version stays within bounds
        const phrasalWords = phrasal.split(/\s+/);
        if (words.length + phrasalWords.length - 1 > 50) continue;

        // Preserve casing & punctuation
        const pre = words[i].match(/^[^a-zA-Z]*/)?.[0] ?? "";
        const suf = words[i].match(/[^a-zA-Z]*$/)?.[0] ?? "";
        const replacement = pre + phrasal + suf;
        words.splice(i, 1, replacement);
        return words.join(" ");
      }
    }
    return sent;
  });
}

// ── Relevant Phrase Injection ──

/** Context-relevant transitional phrases for natural sentence expansion */
const RELEVANT_PHRASES: string[][] = [
  ["in this context", "within this framework", "along these lines"],
  ["to a certain extent", "to some degree", "in certain respects"],
  ["in particular", "more specifically", "in this regard"],
  ["as a result", "for this reason", "on this basis"],
  ["at the same time", "in parallel", "alongside this"],
  ["in practical terms", "from a practical standpoint"],
  ["over time", "in the long run", "gradually"],
];

/**
 * Inject statistically relevant phrases into sentences that are too short (< 12 words).
 * Uses a probability-based approach: only injects when the sentence structure allows it.
 * Cap: no more than 10% of sentences get injected.
 */
function injectRelevantPhrases(sentences: string[], intensity: number): string[] {
  const injectProb = Math.min(0.04 * intensity, 0.20);
  const maxInjections = Math.max(1, Math.floor(sentences.length * 0.10));
  let injected = 0;

  return sentences.map((sent) => {
    const words = sent.split(/\s+/);
    if (words.length >= 18 || words.length < 8 || injected >= maxInjections) return sent;
    if (Math.random() > injectProb) return sent;

    // Find a comma position to insert a phrase
    for (let i = 3; i < words.length - 3; i++) {
      if (words[i].endsWith(",")) {
        const group = RELEVANT_PHRASES[Math.floor(Math.random() * RELEVANT_PHRASES.length)];
        const phrase = group[Math.floor(Math.random() * group.length)];
        if (words.length + phrase.split(/\s+/).length <= 50) {
          words.splice(i + 1, 0, phrase + ",");
          injected++;
          return words.join(" ");
        }
      }
    }

    // Try inserting after subject (position 2-4)
    if (words.length <= 14) {
      const insertPos = Math.min(3, words.length - 4);
      if (insertPos > 1) {
        const group = RELEVANT_PHRASES[Math.floor(Math.random() * RELEVANT_PHRASES.length)];
        const phrase = group[Math.floor(Math.random() * group.length)];
        if (words.length + phrase.split(/\s+/).length + 1 <= 50) {
          words.splice(insertPos, 0, phrase + ",");
          injected++;
          return words.join(" ");
        }
      }
    }

    return sent;
  });
}

// ── Sentence Distribution Enforcement (10-50 words, ≤5% split budget) ──

function wordChangeRatio(original: string, transformed: string): number {
  const funcWords = new Set([
    "the", "a", "an", "of", "in", "to", "for", "and", "or", "but",
    "is", "are", "was", "were", "be", "been", "being", "has", "have",
    "had", "do", "does", "did", "will", "would", "could", "should",
    "may", "might", "shall", "can", "this", "that", "these", "those",
    "it", "its", "they", "them", "their", "he", "she", "his", "her",
    "we", "our", "you", "your", "not", "no", "by", "at", "on", "with",
    "from", "as", "if", "so", "yet", "also", "all", "each", "both",
    "which", "who", "what", "when", "where", "how", "than", "more",
    "most", "such", "many", "much", "some", "any",
  ]);
  const strip = (w: string) => w.toLowerCase().replace(/[.,;:!?"'()\-\[\]{}]/g, "");
  const origWords = original.split(/\s+/).map(strip).filter(Boolean);
  const transSet = new Set(transformed.split(/\s+/).map(strip).filter(Boolean));
  const content = origWords.filter((w) => !funcWords.has(w) && w.length > 2);
  if (content.length === 0) return 1.0;
  const survived = content.filter((w) => transSet.has(w)).length;
  return Math.max(0, Math.min(1, 1 - survived / content.length));
}

// ── Configuration ──

export interface HumanizeSettings {
  mode: string | null;
  stealth: boolean;
  strength: string;
  preserveSentences: boolean;
  strictMeaning: boolean;
  tone: string;
  targetScore: number;
  maxIterations: number;
  baseIntensity: number;
  minChangeRatio: number;
  signalFixEnabled: boolean;
}

export function buildSettings(opts: {
  stealth?: boolean;
  strength?: string;
  preserveSentences?: boolean;
  strictMeaning?: boolean;
  tone?: string;
  mode?: string | null;
}): HumanizeSettings {
  const { stealth = true, strength = "medium", preserveSentences = false,
    strictMeaning = false, tone = "neutral", mode = null } = opts;

  let targetScore: number, maxIterations: number, baseIntensity: number,
    minChangeRatio: number, signalFixEnabled: boolean;

  const strengthMap3 = <T>(l: T, m: T, s: T): T =>
    strength === "light" ? l : strength === "strong" ? s : m;

  if (mode === "ghost_mini") {
    targetScore = 20.0;
    maxIterations = strengthMap3(8, 14, 22);
    baseIntensity = strengthMap3(1.0, 1.5, 2.0);
    minChangeRatio = 0.60;
    signalFixEnabled = true;
  } else if (mode === "ghost_pro") {
    targetScore = 5.0;
    maxIterations = strengthMap3(12, 20, 30);
    baseIntensity = strengthMap3(1.2, 1.8, 2.5);
    minChangeRatio = 0.70;
    signalFixEnabled = true;
  } else if (stealth) {
    targetScore = 5.0;
    maxIterations = strengthMap3(8, 14, 22);
    baseIntensity = strengthMap3(2.0, 10.0, 30.0);
    minChangeRatio = 0.65;
    signalFixEnabled = false;
  } else {
    targetScore = 20.0;
    maxIterations = strengthMap3(4, 8, 14);
    baseIntensity = strengthMap3(1.8, 9.0, 27.0);
    minChangeRatio = 0.55;
    signalFixEnabled = false;
  }

  if (strictMeaning) {
    baseIntensity *= 0.7;
    minChangeRatio = Math.max(0.40, minChangeRatio - 0.15);
  }

  return {
    mode, stealth, strength, preserveSentences, strictMeaning, tone,
    targetScore, maxIterations, baseIntensity, minChangeRatio, signalFixEnabled,
  };
}

// ── Dictionary blacklist ──

const DICT_BLACKLIST = new Set([
  "bodoni", "soh", "thence", "wherefore", "hitherto", "thereof",
  "mercantile", "pursuance", "pursuit", "moneymaking", "pecuniary",
  "remunerative", "lucrative", "stuff", "issue", "issues", "thing", "things",
  "recent", "latest", "current", "prospective", "doable", "workable",
  "ain", "tis", "twas", "nay", "aye", "hath", "doth",
  "thee", "thou", "thy", "thine", "whence", "whilst",
  "atm", "homophile", "homosexual", "dodo", "croak",
  "grizzle", "braw", "bodied", "facelift",
  "gloriole", "upwind", "canvas", "edifice", "tract",
  "genesis", "corporate", "lively", "hatful", "panoptic",
  "ardor", "fogey", "carrefour", "gild", "cosmos",
  "aerofoil", "appall", "bionomical", "planer", "rick",
  "permeant", "enounce", "audacious",
  "bod", "bole", "thriftiness", "commercing", "headroom",
  "phoner", "drape", "castrate", "bludgeon", "sporting",
  "gymnastic", "suzanne", "assure", "labourers", "heightened",
  "procession", "leverage", "tailor", "secures", "demands",
  "openings", "networks", "tackles", "assortment", "locale",
  "heft", "mien", "writ", "brio", "nub", "vim", "cog",
  "jot", "ken", "ilk", "kin", "orb", "pith", "rout",
  "woe", "gist", "boon", "onus", "bane", "crux",
  "forebear", "proffer", "betoken", "bespeak", "parlance",
  "forthwith", "henceforward", "anent", "betwixt",
]);

function isAcceptableReplacement(word: string, commonWords: Set<string>): boolean {
  const low = word.toLowerCase();
  if (DICT_BLACKLIST.has(low)) return false;
  if (low.length > 12 || low.length < 3) return false;
  if (syllableCount(low) > 3) return false;
  if (!/^[a-z]+$/i.test(low)) return false;
  if (commonWords.size > 0 && !commonWords.has(low)) return false;
  return true;
}

// ── Dictionary synonym replacement ──

function dictSynonymReplace(
  sent: string, intensity: number, used: Set<string>,
  ctx: TextContext | null, dict: HumanizerDictionary, commonWords: Set<string>,
): string {
  const replaceProb = Math.min(0.008 * intensity, 0.80);
  const words = sent.split(/\s+/);
  const result: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const stripped = w.replace(/^[.,;:!?"'()\-\[\]{}]+/, "").replace(/[.,;:!?"'()\-\[\]{}]+$/, "");
    const lower = stripped.toLowerCase();

    if (ctx?.protectedTerms.has(lower)) { result.push(w); continue; }
    if (stripped.length <= 3 || PROTECTED_WORDS.has(lower) || used.has(lower) || Math.random() > replaceProb) {
      result.push(w); continue;
    }

    let replacement: string | null = null;
    try { replacement = dict.replaceWordSmartly(lower, sent, used); } catch { replacement = null; }

    if (replacement && replacement !== lower && !DICT_BLACKLIST.has(replacement.toLowerCase())
      && replacement.length < 25 && !replacement.includes(" ")
      && isAcceptableReplacement(replacement, commonWords) && dict.isValidWord(replacement)) {
      const prev = result.length > 0 ? result[result.length - 1].replace(/[.,;:!?"'()\-\[\]{}]/g, "").toLowerCase() : "";
      const next = i + 1 < words.length ? words[i + 1].replace(/[.,;:!?"'()\-\[\]{}]/g, "").toLowerCase() : "";
      if (replacement.toLowerCase() === prev || replacement.toLowerCase() === next) { result.push(w); continue; }
      if (stripped[0] === stripped[0].toUpperCase()) replacement = replacement[0].toUpperCase() + replacement.slice(1);
      if (stripped === stripped.toUpperCase()) replacement = replacement.toUpperCase();
      const prefixMatch = w.match(/^[.,;:!?"'()\-\[\]{}]+/);
      const suffixMatch = w.match(/[.,;:!?"'()\-\[\]{}]+$/);
      result.push((prefixMatch?.[0] ?? "") + replacement + (suffixMatch?.[0] ?? ""));
      used.add(lower);
      used.add(replacement.toLowerCase());
    } else {
      result.push(w);
    }
  }
  return result.join(" ");
}

function applyLargeDictionary(
  sent: string, intensity: number, used: Set<string>,
  ctx: TextContext | null, mode: string | null,
  dict: HumanizerDictionary, commonWords: Set<string>,
): string {
  const eff = (mode === "mini" || mode === "ghost_mini") ? intensity * 0.5 : intensity * 0.7;
  return dictSynonymReplace(sent, eff, used, ctx, dict, commonWords);
}

// ── Human texture ──

const HUMAN_STARTERS = [
  "And ", "But ", "Yet ", "Still, ", "Now, ",
  "Of course, ", "Then again, ", "True, ", "Granted, ",
  "Oddly enough, ", "Interestingly, ", "To be fair, ",
  "In practice, ", "Not surprisingly, ",
  "What matters here is that ", "Put simply, ",
  "It helps to remember that ", "Part of the issue is that ",
  "To put it another way, ",
  "What often goes unnoticed is that ", "In many ways, ",
];

const FORMAL_TO_NATURAL: Record<string, string[]> = {
  "Furthermore, ": ["Plus, ", "On top of that, ", "And beyond that, ", "Another thing worth noting, ", "What is more, "],
  "Moreover, ": ["Besides, ", "Adding to this, ", "On a related note, ", "And then there is the fact that "],
  "Additionally, ": ["Also, ", "On top of this, ", "Then there is ", "Add to that "],
  "Consequently, ": ["So, ", "As a result, ", "The outcome? ", "What follows from this is "],
  "Nevertheless, ": ["Still, ", "Even so, ", "But then again, ", "That said, "],
  "Nonetheless, ": ["Even still, ", "Yet, ", "All the same, ", "But here is the thing, "],
  "In contrast, ": ["But, ", "On the flip side, ", "Then again, ", "Compare that to "],
  "Conversely, ": ["On the other hand, ", "Flip that around and ", "But look at it differently, "],
  "Subsequently, ": ["After that, ", "Then, ", "What followed was ", "From there, "],
  "In conclusion, ": ["All things considered, ", "When it comes down to it, ", "At the end of the day, ", "Taking everything into account, "],
  "Ultimately, ": ["In the end, ", "When it comes down to it, ", "At the end of the day, ", "The bottom line is "],
  "In this regard, ": ["On that note, ", "Speaking of which, ", "Which brings up ", "Related to this, "],
  "Along these lines, ": ["In a similar vein, ", "Tied to this, ", "Going further, ", "Relatedly, "],
  "On a related note, ": ["Tied into this, ", "Connected to that, ", "Which brings us to ", "There is also "],
  "Worth noting is that ": ["One thing to keep in mind is that ", "A key point here, ", "Something often missed, "],
  "Equally, ": ["Just as much, ", "Similarly, ", "By the same token, "],
  "At the same time, ": ["Meanwhile, ", "But alongside that, ", "In parallel, ", "Simultaneously, "],
  "Building on this, ": ["Taking that further, ", "Extending that idea, ", "Going one step further, "],
  "From a different angle, ": ["Looked at differently, ", "If we flip the perspective, ", "Seen another way, "],
  "Expanding on this point, ": ["To elaborate, ", "Digging deeper, ", "More specifically, "],
  "Following from this, ": ["From there, ", "That then leads to ", "Which naturally brings up "],
};

function naturalizeConnectors(text: string): string {
  for (const [formal, replacements] of Object.entries(FORMAL_TO_NATURAL)) {
    if (text.startsWith(formal)) {
      return replacements[Math.floor(Math.random() * replacements.length)] + text.slice(formal.length);
    }
  }
  return text;
}

function applyHumanTexture(sentences: string[], intensity: number, _settings: HumanizeSettings): string[] {
  // Naturalize stiff connectors
  const touched = new Set<number>();
  sentences = sentences.map((s, i) => {
    const ns = naturalizeConnectors(s);
    if (ns !== s) touched.add(i);
    return ns;
  });

  const casualPrefixes = [
    "and ", "but ", "yet ", "still,", "now,", "sure,", "so,", "plus,",
    "besides,", "also,", "then,", "granted,", "true,", "that said",
    "even so", "however", "meanwhile", "of course",
  ];
  for (let i = 0; i < sentences.length; i++) {
    if (casualPrefixes.some((p) => sentences[i].toLowerCase().startsWith(p))) touched.add(i);
  }

  // Inject casual human starters (sparse)
  const probStart = Math.min(0.03 * intensity, 0.30);
  let starterCount = 0;
  const usedStarters = new Set<string>();
  const result = [sentences[0]];

  for (let i = 1; i < sentences.length; i++) {
    const s = sentences[i];
    const hasNoConnector = !casualPrefixes.some((p) => s.toLowerCase().startsWith(p));
    if (Math.random() < probStart && s.split(/\s+/).length > 6 && starterCount < 2 && !touched.has(i) && hasNoConnector) {
      const available = HUMAN_STARTERS.filter((st) => !usedStarters.has(st));
      if (available.length > 0) {
        const starter = available[Math.floor(Math.random() * available.length)];
        usedStarters.add(starter);
        result.push(starter + safeDowncaseFirst(s));
        touched.add(i);
        starterCount++;
        continue;
      }
    }
    result.push(s);
  }

  return result;
}

// ── Cleanup ──

function cleanup(text: string): string {
  // Preserve paragraph boundaries by processing each paragraph independently
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs.map((para) => {
    let p = para;
    p = p.replace(/  +/g, " ");
    p = p.replace(/\.{2,}/g, ".");
    p = p.replace(/\s+([.,;:!?])/g, "$1");
    p = p.replace(/\b(\w+(?:\s+\w+){0,2})\s+\1\b/gi, "$1");
    p = p.replace(/,{2,}/g, ",");
    p = p.replace(/;{2,}/g, ";");
    p = p.replace(/ — /g, ", ").replace(/—/g, ", ");
    p = p.replace(/ – /g, ", ").replace(/–/g, ", ");
    p = p.replace(/ - (?=[A-Za-z])/g, ", ");
    p = p.replace(/,\s*,/g, ",");
    p = p.replace(/\(\s*\)/g, "");
    p = p.replace(/ {2,}/g, " ");
    p = p.replace(/\band\b[,;]?\s+\band\b/gi, "and");
    p = p.replace(/\bbut\b[,;]?\s+\bbut\b/gi, "but");
    p = p.replace(/,\s+and\s+the\b/g, ", the");
    p = p.replace(/\ba ([aeiouAEIOU])/g, "an $1");
    p = p.replace(/\bA ([aeiouAEIOU])/g, "An $1");
    p = p.replace(/\ban ([bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ])/g, "a $1");
    // Mid-sentence capitalization fix
    p = p.replace(/(?<=[a-z,;] )([A-Z])([a-z]{2,})/g, (_m, c1: string, rest: string) => c1.toLowerCase() + rest);
    p = expandContractions(p);
    const sentences = sentTokenize(p);
    return sentences.map((s) => { s = s.trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; }).filter(Boolean).join(" ");
  }).join("\n\n");
}

// ── Sentence enforcement ──

const MIN_SENT_WORDS = 8;
const MAX_SENT_WORDS = 50;
const MERGE_SPLIT_BUDGET = 0.05;

function enforceSentenceDistribution(sentences: string[]): string[] {
  if (sentences.length < 2) return sentences;
  const budget = Math.max(2, Math.floor(sentences.length * MERGE_SPLIT_BUDGET));
  let used = 0;

  // Phase 1: merge short sentences (<MIN_SENT_WORDS)
  let result: string[] = [];
  let i = 0;
  while (i < sentences.length) {
    const sent = sentences[i];
    const wc = sent.split(/\s+/).length;
    if (wc < MIN_SENT_WORDS) {
      if (i + 1 < sentences.length) {
        const next = sentences[i + 1];
        if (wc + next.split(/\s+/).length <= MAX_SENT_WORDS) {
          let merged = sent.replace(/[.\s]+$/, "") + ", " + safeDowncaseFirst(next);
          if (!/[.!?]$/.test(merged.trim())) merged = merged.replace(/[.,;:\s]+$/, "") + ".";
          result.push(merged);
          used++;
          i += 2;
          continue;
        }
      }
      if (result.length > 0) {
        const prevWc = result[result.length - 1].split(/\s+/).length;
        if (wc + prevWc <= MAX_SENT_WORDS) {
          let merged = result[result.length - 1].replace(/[.\s]+$/, "") + ", " + safeDowncaseFirst(sent);
          if (!/[.!?]$/.test(merged.trim())) merged = merged.replace(/[.,;:\s]+$/, "") + ".";
          result[result.length - 1] = merged;
          used++;
          i++;
          continue;
        }
      }
    }
    result.push(sent);
    i++;
  }
  sentences = result;

  // Phase 2: split long sentences (>MAX_SENT_WORDS)
  result = [];
  for (const sent of sentences) {
    const words = sent.split(/\s+/);
    if (words.length > MAX_SENT_WORDS) {
      const mid = Math.floor(words.length / 2);
      let done = false;
      for (let offset = 0; offset < Math.min(15, mid - MIN_SENT_WORDS); offset++) {
        for (const pos of [mid + offset, mid - offset]) {
          if (pos < MIN_SENT_WORDS || pos > words.length - MIN_SENT_WORDS) continue;
          const w = words[pos - 1];
          const nextW = words[pos].toLowerCase().replace(/[.,;:]/g, "");
          if (w.endsWith(",") || w.endsWith(";") || ["and", "but", "while", "though", "although", "because", "since", "whereas", "however"].includes(nextW)) {
            const s1 = words.slice(0, pos).join(" ").replace(/[,;]+$/, "") + ".";
            const s2Words = [...words.slice(pos)];
            if (s2Words[0]) s2Words[0] = s2Words[0][0].toUpperCase() + s2Words[0].slice(1);
            let s2 = s2Words.join(" ");
            if (!/[.!?]$/.test(s2)) s2 = s2.replace(/[.,;:\s]+$/, "") + ".";
            if (s1.split(/\s+/).length >= MIN_SENT_WORDS && s2.split(/\s+/).length >= MIN_SENT_WORDS) {
              result.push(s1, s2);
              used++;
              done = true;
              break;
            }
          }
        }
        if (done) break;
      }
      if (!done) result.push(sent);
    } else {
      result.push(sent);
    }
  }

  // Phase 3: variety if too uniform
  const bucket = (wc: number) => wc <= 15 ? 0 : wc <= 25 ? 1 : wc <= 35 ? 2 : wc <= 45 ? 3 : 4;
  if (result.length >= 4) {
    const lengths = result.map((s) => s.split(/\s+/).length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const stdDev = Math.sqrt(lengths.reduce((s, l) => s + (l - avg) ** 2, 0) / lengths.length);
    if (stdDev < 8 && used < budget) {
      const conjunctions = [", and ", ", while ", ", though ", " because ", " since ", ", which means "];
      const merged: string[] = [];
      const mergePositions = new Set<number>();
      for (let idx = 1; idx < result.length - 1; idx += 3) {
        if (used >= budget) break;
        const l1 = result[idx].split(/\s+/).length;
        const l2 = result[idx + 1].split(/\s+/).length;
        if (l1 + l2 <= MAX_SENT_WORDS && l1 + l2 >= 28) {
          mergePositions.add(idx);
          used++;
        }
      }
      let mi = 0;
      while (mi < result.length) {
        if (mergePositions.has(mi) && mi + 1 < result.length) {
          const s1 = result[mi].replace(/[.\s]+$/, "");
          const s2 = safeDowncaseFirst(result[mi + 1]);
          let m = s1 + conjunctions[Math.floor(Math.random() * conjunctions.length)] + s2;
          if (!/[.!?]$/.test(m.trim())) m = m.replace(/[.,;:\s]+$/, "") + ".";
          merged.push(m);
          mi += 2;
        } else {
          merged.push(result[mi]);
          mi++;
        }
      }
      result = merged;
    }
  }

  // Phase 4: break 3+ consecutive same-bucket runs
  if (result.length >= 3) {
    for (let k = 2; k < result.length; k++) {
      const b0 = bucket(result[k - 2].split(/\s+/).length);
      const b1 = bucket(result[k - 1].split(/\s+/).length);
      const b2 = bucket(result[k].split(/\s+/).length);
      if (b0 === b1 && b1 === b2 && k + 1 < result.length) {
        [result[k], result[k + 1]] = [result[k + 1], result[k]];
      }
    }
  }

  return result;
}

// ── Vary sentence starts ──

const OPENER_VARIANTS = [
  "On that note, ", "Tied to this, ", "Related to this, ",
  "And ", "But ", "Meanwhile, ", "At the same time, ",
  "Then again, ", "Put differently, ", "Seen another way, ",
  "Which means ", "In other words, ",
  "Equally worth noting, ", "Just as relevant, ",
];

function varySentenceStarts(sentences: string[]): string[] {
  if (sentences.length < 2) return sentences;
  const result = [sentences[0]];
  for (let i = 1; i < sentences.length; i++) {
    const prevStart = result[result.length - 1].split(/\s+/)[0]?.toLowerCase() ?? "";
    const currStart = sentences[i].split(/\s+/)[0]?.toLowerCase() ?? "";
    if (prevStart && currStart === prevStart && sentences[i].split(/\s+/).length > 4) {
      const connector = OPENER_VARIANTS[Math.floor(Math.random() * OPENER_VARIANTS.length)];
      result.push(connector + safeDowncaseFirst(sentences[i]));
    } else {
      result.push(sentences[i]);
    }
  }
  return result;
}

// ── Detection scoring ──

const TOP_5_DETECTOR_GROUPS: Record<string, Set<string>> = {
  gptzero: new Set(["gptzero"]),
  turnitin: new Set(["turnitin"]),
  originality: new Set(["originality_ai", "originality.ai", "originalityai"]),
  winston: new Set(["winston_ai", "winston.ai", "winstonai"]),
  copyleaks: new Set(["copyleaks", "crossplag"]),
};

const HUMAN_POSITIVE_SIGNALS = new Set([
  "perplexity", "burstiness", "vocabulary_richness", "shannon_entropy",
  "readability_consistency", "stylometric_score", "starter_diversity",
  "word_length_variance", "spectral_flatness", "lexical_density_var",
  "dependency_depth",
]);

const AI_POSITIVE_SIGNALS = new Set([
  "sentence_uniformity", "ai_pattern_score", "ngram_repetition",
  "paragraph_uniformity", "avg_word_commonality", "zipf_deviation",
  "token_predictability", "per_sentence_ai_ratio", "function_word_freq",
]);

function normalizeDetectorName(name: string): string {
  return (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function checkDetectorTargets(analysis: AnalysisResult, mode: string): {
  passed: boolean; worstDetector: string; maxAiScore: number;
  detectorScores: Record<string, number>;
} {
  const detectorScores: Record<string, number> = {};
  for (const d of analysis.detectors) {
    const name = d.detector.toLowerCase().replace(/ /g, "_");
    detectorScores[name] = Math.round((100 - d.human_score) * 10) / 10;
  }

  if (mode === "ghost_mini") {
    const target = 20.0;
    const normScores: Record<string, number> = {};
    for (const d of analysis.detectors) {
      normScores[normalizeDetectorName(d.detector)] = Math.round((100 - d.human_score) * 10) / 10;
    }
    const top5Scores: Record<string, number> = {};
    for (const [groupName, aliases] of Object.entries(TOP_5_DETECTOR_GROUPS)) {
      const aliasScores: number[] = [];
      for (const alias of aliases) {
        const normAlias = normalizeDetectorName(alias);
        for (const [seen, score] of Object.entries(normScores)) {
          if (seen === normAlias || normAlias.includes(seen) || seen.includes(normAlias)) aliasScores.push(score);
        }
      }
      if (aliasScores.length > 0) top5Scores[groupName] = Math.max(...aliasScores);
    }
    if (Object.keys(top5Scores).length < 5) return { passed: false, worstDetector: "unknown", maxAiScore: 100, detectorScores };
    const worst = Object.entries(top5Scores).sort((a, b) => b[1] - a[1])[0];
    return { passed: Object.values(top5Scores).every((s) => s <= target), worstDetector: worst[0], maxAiScore: worst[1], detectorScores };
  } else if (mode === "ghost_pro") {
    const target = 5.0;
    if (Object.keys(detectorScores).length === 0) return { passed: false, worstDetector: "unknown", maxAiScore: 100, detectorScores };
    const worst = Object.entries(detectorScores).sort((a, b) => b[1] - a[1])[0];
    return { passed: worst[1] <= target, worstDetector: worst[0], maxAiScore: worst[1], detectorScores };
  } else {
    const overall = 100 - (analysis.summary.overall_human_score ?? 50);
    return { passed: overall <= 20, worstDetector: "overall", maxAiScore: overall, detectorScores };
  }
}

function identifyWeakSignals(signals: Record<string, number>): [string, number][] {
  const weaknesses: [string, number][] = [];
  for (const [sig, val] of Object.entries(signals)) {
    if (HUMAN_POSITIVE_SIGNALS.has(sig)) {
      const badness = Math.max(0, 100 - val);
      if (badness > 25) weaknesses.push([sig, badness]);
    } else if (AI_POSITIVE_SIGNALS.has(sig)) {
      if (val > 25) weaknesses.push([sig, val]);
    }
  }
  return weaknesses.sort((a, b) => b[1] - a[1]);
}

// ── Signal fix functions ──

function fixLowPerplexity(sentences: string[], intensity: number, used: Set<string>, ctx: TextContext | null, dict: HumanizerDictionary, cw: Set<string>): string[] {
  return sentences.map((s) => {
    s = synonymReplace(s, Math.min(intensity * 0.8, 4.0), used, ctx?.protectedTerms);
    s = applyLargeDictionary(s, Math.min(intensity * 0.6, 3.5), used, ctx, "ghost_pro", dict, cw);
    return s;
  });
}

function fixLowBurstiness(sentences: string[], intensity: number): string[] {
  if (sentences.length < 3) return sentences;
  const fillers = new Set(["very", "really", "quite", "rather", "somewhat", "extremely", "incredibly", "significantly", "essentially", "fundamentally", "particularly", "specifically"]);
  return sentences.map((s, i) => {
    if (i % 3 === 0 && s.split(/\s+/).length > 20 && Math.random() < 0.3 * intensity) {
      const words = s.split(/\s+/).filter((w) => !fillers.has(w.toLowerCase().replace(/[.,;:]/g, "")));
      if (words.length >= 8) return words.join(" ");
    }
    return s;
  });
}

function fixHighUniformity(sentences: string[], intensity: number): string[] {
  if (sentences.length < 2) return sentences;
  const result: string[] = [];
  for (let i = 0; i < sentences.length; i++) {
    const wc = sentences[i].split(/\s+/).length;
    if (i % 3 === 0 && wc > 8) {
      const r = deepRestructure(sentences[i], Math.min(intensity * 1.2, 2.5));
      if (r !== sentences[i]) { result.push(r); continue; }
    }
    if (i % 3 === 1 && wc >= 8 && wc <= 22) {
      const shifted = voiceShift(sentences[i], 0.35);
      if (shifted !== sentences[i]) { result.push(shifted); continue; }
    }
    result.push(sentences[i]);
  }
  return fixStarterDiversity(result);
}

function fixAiPatterns(sentences: string[], _intensity: number): string[] {
  const aiConnectors: [RegExp, string[]][] = [
    [/^Furthermore,?\s+/i, ["Also, ", "Plus, ", "And "]],
    [/^Moreover,?\s+/i, ["Besides, ", "And "]],
    [/^Additionally,?\s+/i, ["Also, ", "On top of that, "]],
    [/^Consequently,?\s+/i, ["So, ", "As a result, "]],
    [/^Subsequently,?\s+/i, ["Then, ", "After that, "]],
    [/^Nevertheless,?\s+/i, ["Still, ", "Even so, "]],
    [/^Nonetheless,?\s+/i, ["Yet, ", "Even so, "]],
    [/^In\s+conclusion,?\s+/i, ["Overall, ", "To sum up, "]],
    [/^It\s+is\s+(?:important|worth|crucial|essential)\s+to\s+(?:note|recognize|mention)\s+that\s+/i, [""]],
    [/^(?:This|These)\s+(?:findings?|results?|analysis|report)\s+(?:suggest|indicate|demonstrate|aims?|will)\s+that\s+/i, [""]],
    [/^In\s+(?:today'?s?|the\s+modern)\s+(?:world|era|age|society),?\s+/i, [""]],
  ];
  return sentences.map((sent) => {
    for (const [pattern, replacements] of aiConnectors) {
      const m = sent.match(pattern);
      if (m) {
        const repl = replacements[Math.floor(Math.random() * replacements.length)];
        let rest = sent.slice(m[0].length);
        if (!repl && rest) rest = rest[0].toUpperCase() + rest.slice(1);
        return repl + rest;
      }
    }
    return replaceAiStarters(sent);
  });
}

function fixLowVocabulary(sentences: string[], intensity: number, used: Set<string>, ctx: TextContext | null, dict: HumanizerDictionary, cw: Set<string>): string[] {
  return sentences.map((s) => {
    s = synonymReplace(s, Math.min(intensity * 0.8, 4.0), used, ctx?.protectedTerms);
    s = applyLargeDictionary(s, Math.min(intensity * 0.6, 3.5), used, ctx, "ghost_mini", dict, cw);
    return s;
  });
}

function fixStarterDiversity(sentences: string[]): string[] {
  if (sentences.length < 2) return sentences;
  const starters = [
    "And yet, ", "But then, ", "Still, ", "Now, ",
    "Meanwhile, ", "Of course, ", "In practice, ",
    "That said, ", "To be fair, ", "Put differently, ",
    "Looking closer, ", "Granted, ", "True, ",
    "What matters is ", "The key point is ",
    "Consider that ", "It helps to know that ",
    "Worth noting, ", "On the flip side, ",
    "To put it plainly, ", "As it turns out, ",
    "Interestingly, ", "Crucially, ", "Not surprisingly, ",
  ];
  const usedStarts = new Set<string>();
  return sentences.map((sent, i) => {
    const words = sent.split(/\s+/);
    if (!words.length) return sent;
    const start = words[0].toLowerCase().replace(/[,;:]/g, "");
    if (usedStarts.has(start) && words.length > 4) {
      const avail = starters.filter((s) => !usedStarts.has(s.split(/\s+/)[0].toLowerCase().replace(/[,;:]/g, "")));
      if (avail.length > 0) {
        const st = avail[Math.floor(Math.random() * avail.length)];
        usedStarts.add(st.split(/\s+/)[0].toLowerCase().replace(/[,;:]/g, ""));
        return st + safeDowncaseFirst(sent);
      }
    }
    usedStarts.add(start);
    return sent;
  });
}

function fixNgramRepetition(sentences: string[], _intensity: number, used: Set<string>, _ctx: TextContext | null): string[] {
  const allText = sentences.join(" ").toLowerCase();
  const words = allText.split(/\s+/);
  const trigrams = new Map<string, number>();
  for (let i = 0; i < words.length - 2; i++) {
    const tri = words[i] + " " + words[i + 1] + " " + words[i + 2];
    trigrams.set(tri, (trigrams.get(tri) ?? 0) + 1);
  }
  const repeated = new Set([...trigrams.entries()].filter(([, c]) => c >= 2).map(([t]) => t));
  if (repeated.size === 0) return sentences;

  return sentences.map((sent) => {
    const sw = sent.split(/\s+/);
    for (let i = 0; i < sw.length - 2; i++) {
      const tri = sw[i].toLowerCase().replace(/[.,;:!?]/g, "") + " " + sw[i + 1].toLowerCase().replace(/[.,;:!?]/g, "") + " " + sw[i + 2].toLowerCase().replace(/[.,;:!?]/g, "");
      if (repeated.has(tri) && Math.random() < 0.6) {
        const mid = sw[i + 1].replace(/^[.,;:!?"'()\-\[\]{}]+/, "").replace(/[.,;:!?"'()\-\[\]{}]+$/, "");
        const candidates = (SYNONYM_BANK[mid.toLowerCase()] ?? []).filter((c: string) => !c.includes(" ") && !used.has(c.toLowerCase()));
        if (candidates.length > 0) {
          let repl = candidates[Math.floor(Math.random() * candidates.length)];
          if (mid[0] === mid[0].toUpperCase()) repl = repl[0].toUpperCase() + repl.slice(1);
          const suffixMatch = sw[i + 1].match(/[.,;:!?"'()\-\[\]{}]+$/);
          sw[i + 1] = repl + (suffixMatch?.[0] ?? "");
          used.add(repl.toLowerCase());
          repeated.delete(tri);
        }
      }
    }
    return sw.join(" ");
  });
}

function fixPerSentenceAi(sentences: string[], intensity: number, used: Set<string>, ctx: TextContext | null, dict: HumanizerDictionary, cw: Set<string>): string[] {
  return sentences.map((sent) => {
    sent = replaceAiStarters(sent);
    sent = phraseSubstitute(sent, Math.min(intensity, 4.0));
    if (sent.split(/\s+/).length > 8) sent = deepRestructure(sent, Math.min(intensity * 0.8, 4.5));
    sent = synonymReplace(sent, Math.min(intensity * 0.7, 3.8), used, ctx?.protectedTerms);
    sent = applyLargeDictionary(sent, Math.min(intensity * 0.5, 3.0), used, ctx, "ghost_pro", dict, cw);
    return sent;
  });
}

function fixReadabilityConsistency(sentences: string[], intensity: number): string[] {
  const fillers = new Set(["very", "extremely", "fundamentally", "inherently", "basically", "essentially", "significantly", "particularly", "substantially", "considerably"]);
  const clauses = [", which makes a difference", ", though that depends", ", at least in most cases", ", even if only slightly"];
  return sentences.map((sent, i) => {
    const words = sent.split(/\s+/);
    if (i % 3 === 0 && words.length > 12) {
      return words.filter((w) => !fillers.has(w.toLowerCase().replace(/[.,;:]/g, ""))).join(" ");
    }
    if (i % 3 === 2 && words.length < 12 && words.length > 5 && sent.endsWith(".") && Math.random() < 0.25 * intensity) {
      return sent.slice(0, -1) + clauses[Math.floor(Math.random() * clauses.length)] + ".";
    }
    return sent;
  });
}

function fixFunctionWordFreq(sentences: string[], _intensity: number): string[] {
  const fwSwaps: Record<string, string> = {
    "it is important to note that": "", "it is worth noting that": "",
    "it is crucial to recognize that": "", "it is essential to note that": "",
    "the purpose of this analysis is to": "this analysis will",
    "delve into": "explore", "paramount": "key", "multifaceted": "complex",
    "foster": "build", "underscore": "highlight", "crucial role": "key part",
    "utilize": "use", "utilization": "use", "in order to": "to",
    "due to the fact that": "because", "for the purpose of": "to",
    "with regard to": "about", "in terms of": "for",
    "on the basis of": "based on", "in the context of": "in",
    "with respect to": "about", "it is important to": "we should",
    "it is necessary to": "we need to", "it is evident that": "clearly",
    "it should be noted that": "",
  };
  return sentences.map((sent) => {
    for (const [old, repl] of Object.entries(fwSwaps)) {
      const idx = sent.toLowerCase().indexOf(old);
      if (idx >= 0) {
        let r = repl;
        if (sent[idx] === sent[idx].toUpperCase() && r) r = r[0].toUpperCase() + r.slice(1);
        let rest = sent.slice(idx + old.length);
        if (!r && rest) { rest = rest.trimStart(); if (rest) rest = rest[0].toUpperCase() + rest.slice(1); }
        sent = sent.slice(0, idx) + r + (r && !r.endsWith(" ") ? " " : "") + rest;
        sent = sent.replace(/  +/g, " ");
        break;
      }
    }
    return sent;
  });
}

function fixLowDependencyDepth(sentences: string[], intensity: number): string[] {
  if (sentences.length < 3) return sentences;
  const subordinators = [" because ", " since ", " although ", " while ", " whereas ", " even though ", " given that "];
  const result: string[] = [];
  let i = 0;
  while (i < sentences.length) {
    const wc = sentences[i].split(/\s+/).length;
    if (i + 1 < sentences.length && wc >= MIN_SENT_WORDS && wc <= 20
      && sentences[i + 1].split(/\s+/).length >= MIN_SENT_WORDS
      && sentences[i + 1].split(/\s+/).length <= 20
      && wc + sentences[i + 1].split(/\s+/).length <= MAX_SENT_WORDS
      && Math.random() < 0.3 * intensity) {
      const s1 = sentences[i].replace(/\.$/, "");
      const s2 = safeDowncaseFirst(sentences[i + 1]);
      if (!s2.startsWith("and ") && !s2.startsWith("but ") && !s2.startsWith("yet ") && !s2.startsWith("still ")) {
        const conj = subordinators[Math.floor(Math.random() * subordinators.length)];
        let merged = s1 + conj + s2;
        if (!/[.!?]$/.test(merged)) merged = merged.replace(/[.,;:\s]+$/, "") + ".";
        result.push(merged);
        i += 2;
        continue;
      }
    }
    result.push(sentences[i]);
    i++;
  }
  return result;
}

function fixLowShannonEntropy(sentences: string[], intensity: number, used: Set<string>, ctx: TextContext | null, dict: HumanizerDictionary, cw: Set<string>): string[] {
  return sentences.map((s) => {
    s = synonymReplace(s, Math.min(intensity * 0.8, 4.0), used, ctx?.protectedTerms);
    s = applyLargeDictionary(s, Math.min(intensity * 0.6, 3.5), used, ctx, "ghost_mini", dict, cw);
    return s;
  });
}

const TOKEN_MODIFIERS = ["quite", "rather", "somewhat", "fairly", "genuinely",
  "truly", "notably", "largely", "partly", "mostly"];

function fixTokenPredictability(sentences: string[], intensity: number, used: Set<string>, ctx: TextContext | null, dict: HumanizerDictionary, cw: Set<string>): string[] {
  // Insert modifiers before adjectives and replace synonyms to break predictable token sequences
  return sentences.map((s) => {
    const words = s.split(/\s+/);
    if (words.length < 6) return s;
    // Insert a modifier before an adjective-like word
    if (Math.random() < 0.25 * intensity) {
      for (let j = 1; j < words.length; j++) {
        const w = words[j].replace(/[^a-zA-Z]/g, "").toLowerCase();
        // Simple adjective heuristic: ends in common adj suffixes and not a stop word
        if (w.length > 3 && /(?:ous|ive|ful|ble|ent|ant|ial|ary|ory|ing|cal|tic)$/.test(w)
          && !["more", "most", "many", "much", "several", "few", "various", "other", "such"].includes(w)) {
          const prevW = words[j - 1].replace(/[^a-zA-Z]/g, "").toLowerCase();
          // Don't stack modifiers
          if (!TOKEN_MODIFIERS.includes(prevW)) {
            const mod = TOKEN_MODIFIERS[Math.floor(Math.random() * TOKEN_MODIFIERS.length)];
            if (!s.toLowerCase().includes(mod)) {
              words.splice(j, 0, mod);
              break;
            }
          }
        }
      }
      s = words.join(" ");
    }
    s = synonymReplace(s, Math.min(intensity * 0.7, 3.8), used, ctx?.protectedTerms);
    s = applyLargeDictionary(s, Math.min(intensity * 0.5, 3.0), used, ctx, "ghost_mini", dict, cw);
    return s;
  });
}

function fixLowStylometric(sentences: string[], _intensity: number): string[] {
  // Improve stylometric score: more punctuation variety, personal touches
  // Currently minimal — creates over-long sentences if aggressive
  return sentences;
}

function fixWordCommonality(sentences: string[], intensity: number, used: Set<string>, ctx: TextContext | null, dict: HumanizerDictionary, cw: Set<string>): string[] {
  // Replace overly common words with curated + large dictionary synonyms
  return sentences.map((s) => {
    s = synonymReplace(s, Math.min(intensity * 0.8, 4.0), used, ctx?.protectedTerms);
    s = applyLargeDictionary(s, Math.min(intensity * 0.6, 3.5), used, ctx, "ghost_pro", dict, cw);
    return s;
  });
}

function fixParagraphUniformity(_paragraphs: string[]): string[] {
  // Paragraph structure preserved — LLM pipeline handles this
  return _paragraphs;
}

function applySignalFixes(text: string, weakSignals: [string, number][], intensity: number,
  used: Set<string>, ctx: TextContext | null, settings: HumanizeSettings,
  dict: HumanizerDictionary, commonWords: Set<string>): string {
  const fixes = new Set(weakSignals.slice(0, 4).map(([s]) => s));
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  const fixed: string[] = [];

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    // Preserve titles and headings from signal-fix transforms
    if (isTitleOrHeading(trimmedPara)) { fixed.push(trimmedPara); continue; }
    let sentences = sentTokenize(trimmedPara);

    if (fixes.has("perplexity")) sentences = fixLowPerplexity(sentences, intensity, used, ctx, dict, commonWords);
    if (fixes.has("burstiness")) sentences = fixLowBurstiness(sentences, intensity);
    if (fixes.has("sentence_uniformity")) sentences = fixHighUniformity(sentences, intensity);
    if (fixes.has("ai_pattern_score")) sentences = fixAiPatterns(sentences, intensity);
    if (fixes.has("vocabulary_richness")) sentences = fixLowVocabulary(sentences, intensity, used, ctx, dict, commonWords);
    if (fixes.has("starter_diversity")) sentences = fixStarterDiversity(sentences);
    if (fixes.has("ngram_repetition")) sentences = fixNgramRepetition(sentences, intensity, used, ctx);
    if (fixes.has("per_sentence_ai_ratio")) sentences = fixPerSentenceAi(sentences, intensity, used, ctx, dict, commonWords);
    if (fixes.has("readability_consistency")) sentences = fixReadabilityConsistency(sentences, intensity);
    if (fixes.has("function_word_freq")) sentences = fixFunctionWordFreq(sentences, intensity);
    if (fixes.has("dependency_depth")) sentences = fixLowDependencyDepth(sentences, intensity);
    if (fixes.has("shannon_entropy")) sentences = fixLowShannonEntropy(sentences, intensity, used, ctx, dict, commonWords);
    if (fixes.has("token_predictability")) sentences = fixTokenPredictability(sentences, intensity, used, ctx, dict, commonWords);
    if (fixes.has("stylometric_score")) sentences = fixLowStylometric(sentences, intensity);
    if (fixes.has("avg_word_commonality")) sentences = fixWordCommonality(sentences, intensity, used, ctx, dict, commonWords);

    sentences = enforceSentenceDistribution(sentences);
    fixed.push(sentences.join(" "));
  }

  return fixed.join("\n\n");
}

// ── Single-pass paragraph humanization ──

function humanizeParagraph(
  para: string, intensity: number, usedWords: Set<string>,
  ctx: TextContext | null, settings: HumanizeSettings, iteration: number,
  dict: HumanizerDictionary, commonWords: Set<string>,
): string {
  const rawSentences = sentTokenize(para);

  // Step 0: 50% sentence restructuring — reorder clauses/phrases for variation
  const restructured = restructure50Percent(rawSentences);

  let transformed: string[] = [];

  for (let sent of restructured) {
    sent = sent.trim();
    if (!sent) continue;

    // 1. Phrase substitutions
    sent = phraseSubstitute(sent, intensity);
    // 2. AI starter replacement
    sent = replaceAiStarters(sent);
    // 3. Deep restructuring
    const before = sent;
    if (sent.split(/\s+/).length > 8) sent = deepRestructure(sent, intensity);
    const deepChanged = sent !== before;
    // 4. Voice shifts
    const hasCommaHedge = /,\s+(?:in practice|admittedly|it seems|to some extent|rightly or wrongly|at least partly|in most cases|to be fair|to a degree|on the whole|broadly speaking|in theory|for the most part),/i.test(sent);
    if (!deepChanged && !hasCommaHedge && sent.split(/\s+/).length >= 10 && sent.split(/\s+/).length <= 22) {
      sent = voiceShift(sent, Math.min(0.015 * intensity, 0.45));
    }
    // 5. Synonym replacement
    sent = synonymReplace(sent, intensity, usedWords, ctx?.protectedTerms);
    // 6. Large dictionary intelligence pass
    sent = applyLargeDictionary(sent, intensity, usedWords, ctx, settings.mode, dict, commonWords);
    // 7. Connector variation
    sent = varyConnectors(sent);
    // 8. Clause restructuring
    sent = restructureSentence(sent, intensity);

    sent = sent.split(/\s+/).join(" ");
    if (sent) transformed.push(sent);
  }

  // 9. Phrasal verb expansion for shorter sentences
  transformed = expandWithPhrasalVerbs(transformed, intensity);

  // 9b. Inject relevant phrases where statistically appropriate
  transformed = injectRelevantPhrases(transformed, intensity);

  // 10. Vary starts
  transformed = varySentenceStarts(transformed);
  // 11. Human texture (first pass only)
  if (iteration === 0) transformed = applyHumanTexture(transformed, intensity, settings);

  // 12. Burstiness (simplified — no textstat)
  transformed = makeBurstier(transformed);

  // 12b. Enforce sentence distribution (10-50 words, ≤5% split budget)
  transformed = enforceSentenceDistribution(transformed);

  let result = transformed.join(" ");
  // 13. Cleanup
  result = cleanup(result);
  return result;
}

// ── Main humanize function ──

export function humanize(
  text: string,
  opts: {
    strength?: string;
    targetScore?: number;
    stealth?: boolean;
    preserveSentences?: boolean;
    strictMeaning?: boolean;
    tone?: string;
    mode?: string | null;
    enablePostProcessing?: boolean;
  } = {},
): string {
  if (!text?.trim()) return text;

  const {
    strength = "medium", stealth = true, preserveSentences = false,
    strictMeaning = false, tone = "neutral", mode = null,
    enablePostProcessing = true,
  } = opts;

  // Protect brackets, figures, percentages before any processing
  const { text: protectedText, map: protectionMap } = protectSpecialContent(text);

  const settings = buildSettings({ stealth, strength, preserveSentences, strictMeaning, tone, mode });
  if (opts.targetScore != null) settings.targetScore = opts.targetScore;

  // Count input paragraphs for enforcement (excluding empty lines)
  const inputParagraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  const inputParagraphCount = inputParagraphs.length;

  // Context analysis
  const ctx = analyzeContext(protectedText);

  // Load dictionary
  const dict = getDictionary();
  const commonWords = new Set<string>();
  try {
    if (dict.thesaurus && dict.thesaurus.size > 0) {
      for (const key of dict.thesaurus.keys()) {
        const k = key.toLowerCase().trim();
        if (k.length >= 3 && k.length <= 12 && /^[a-z]+$/.test(k) && syllableCount(k) <= 3 && !DICT_BLACKLIST.has(k)) {
          commonWords.add(k);
        }
      }
    }
  } catch { /* ignore */ }

  const detector = getDetector();
  const originalText = protectedText;
  let bestResult = protectedText;
  let bestScore = 100.0;
  const usedWordsGlobal = new Set<string>();

  for (let iteration = 0; iteration < settings.maxIterations; iteration++) {
    // Intensity cap
    let cap: number;
    if (mode === "ghost_pro") cap = ({ light: 3.1, medium: 5.5, strong: 8.0 } as Record<string, number>)[strength] ?? 5.5;
    else if (mode === "ghost_mini") cap = ({ light: 2.8, medium: 5.0, strong: 7.5 } as Record<string, number>)[strength] ?? 5.0;
    else cap = 2.5;
    const intensity = Math.min(settings.baseIntensity + iteration * 0.35, cap);

    // Every 3 iterations restart from original
    let source: string;
    let usedWords: Set<string>;
    if (iteration > 0 && iteration % 3 === 0) {
      source = originalText;
      usedWords = new Set();
    } else {
      source = iteration > 0 ? bestResult : protectedText;
      usedWords = new Set(usedWordsGlobal);
    }

    const paragraphs = source.split(/\n\s*\n/).filter((p) => p.trim());
    const processed: string[] = [];
    for (const para of paragraphs) {
      const trimmedPara = para.trim();
      // Preserve titles and headings — only light cleanup, no heavy transforms
      if (isTitleOrHeading(trimmedPara)) {
        processed.push(trimmedPara);
        continue;
      }
      const r = humanizeParagraph(trimmedPara, intensity, usedWords, ctx, settings, iteration, dict, commonWords);
      if (r) processed.push(r);
    }

    let currentResult = processed.join("\n\n");
    currentResult = expandContractions(currentResult);

    if ((mode === "ghost_mini" || mode === "ghost_pro") && enablePostProcessing) {
      currentResult = postProcess(currentResult);
    }

    // Enforce paragraph count: input must match output
    currentResult = enforceParagraphCount(currentResult, inputParagraphCount);

    for (const w of usedWords) usedWordsGlobal.add(w);
    const changeRatio = wordChangeRatio(originalText, currentResult);

    if (mode === "ghost_mini" || mode === "ghost_pro") {
      const analysis = detector.analyze(currentResult);
      const { passed, maxAiScore } = checkDetectorTargets(analysis, mode);
      const signals = analysis.signals;
      const currentScore = maxAiScore;

      if (currentScore < bestScore || (currentScore <= bestScore + 2 && changeRatio > wordChangeRatio(originalText, bestResult))) {
        bestResult = currentResult;
        bestScore = currentScore;
      }

      if (passed && changeRatio >= settings.minChangeRatio) break;

      // Signal-aware fixes from iteration 2+
      if (settings.signalFixEnabled && iteration >= 2) {
        const weak = identifyWeakSignals(signals);
        if (weak.length > 0) {
          let fixed = applySignalFixes(bestResult, weak, intensity, usedWordsGlobal, ctx, settings, dict, commonWords);
          fixed = expandContractions(fixed);
          fixed = cleanup(fixed);
          if (enablePostProcessing) fixed = postProcess(fixed);

          const fixedAnalysis = detector.analyze(fixed);
          const { passed: fp, maxAiScore: fm } = checkDetectorTargets(fixedAnalysis, mode);
          if (fm < bestScore) { bestResult = fixed; bestScore = fm; }
          if (fp && wordChangeRatio(originalText, fixed) >= settings.minChangeRatio) break;
        }
      }
    } else {
      const currentScore = 100 - (detector.analyze(currentResult).summary.overall_human_score ?? 50);
      if (currentScore < bestScore || (currentScore <= bestScore + 2 && changeRatio > wordChangeRatio(originalText, bestResult))) {
        bestResult = currentResult;
        bestScore = currentScore;
      }
      if (bestScore <= settings.targetScore && changeRatio >= settings.minChangeRatio) break;
    }
  }

  // Phase 2: extra signal-targeted passes
  if ((mode === "ghost_mini" || mode === "ghost_pro") && settings.signalFixEnabled) {
    const extraBase = ({ light: 4, medium: 8, strong: 12 } as Record<string, number>)[strength] ?? 8;
    const extraMax = mode === "ghost_pro" ? extraBase + 4 : extraBase;
    let stallCount = 0;
    for (let ep = 0; ep < extraMax; ep++) {
      const analysis = detector.analyze(bestResult);
      const { passed } = checkDetectorTargets(analysis, mode);
      if (passed) break;

      const weak = identifyWeakSignals(analysis.signals);
      if (weak.length === 0) break;

      const p2Cap = ({ light: 2.5, medium: 4.5, strong: 6.5 } as Record<string, number>)[strength] ?? 4.5;
      const intensity = Math.min(2.0 + ep * 0.15, p2Cap);
      let fixed = applySignalFixes(bestResult, weak, intensity, usedWordsGlobal, ctx, settings, dict, commonWords);
      fixed = expandContractions(fixed);
      fixed = cleanup(fixed);
      if (enablePostProcessing) fixed = postProcess(fixed);

      const { maxAiScore: fm } = checkDetectorTargets(detector.analyze(fixed), mode);
      if (fm < bestScore) { bestResult = fixed; bestScore = fm; stallCount = 0; }
      else stallCount++;
      if (stallCount >= 3) break;
    }
  }

  if (enablePostProcessing) bestResult = postProcess(bestResult);

  // Final paragraph count enforcement
  bestResult = enforceParagraphCount(bestResult, inputParagraphCount);

  // Restore protected content (brackets, figures, percentages)
  bestResult = restoreSpecialContent(bestResult, protectionMap);

  return bestResult;
}

// ── Paragraph Count Enforcement ──

/**
 * Ensure output has the same number of paragraphs as the input.
 * If output has more paragraphs, merge the shortest adjacent ones.
 * If output has fewer paragraphs, split the longest one at a natural boundary.
 */
function enforceParagraphCount(text: string, targetCount: number): string {
  let paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  if (paragraphs.length === targetCount || targetCount <= 0) return text;

  // Too many paragraphs: merge shortest adjacent pairs
  while (paragraphs.length > targetCount && paragraphs.length > 1) {
    let minLen = Infinity;
    let mergeIdx = 0;
    for (let i = 0; i < paragraphs.length - 1; i++) {
      const combinedLen = paragraphs[i].split(/\s+/).length + paragraphs[i + 1].split(/\s+/).length;
      // Skip merging if either is a title/heading
      if (isTitleOrHeading(paragraphs[i]) || isTitleOrHeading(paragraphs[i + 1])) continue;
      if (combinedLen < minLen) {
        minLen = combinedLen;
        mergeIdx = i;
      }
    }
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
    if (maxLen < 10) break; // nothing left to split meaningfully

    const sentences = sentTokenize(paragraphs[splitIdx]);
    if (sentences.length < 2) break;

    const mid = Math.ceil(sentences.length / 2);
    const part1 = sentences.slice(0, mid).join(" ");
    const part2 = sentences.slice(mid).join(" ");
    paragraphs.splice(splitIdx, 1, part1, part2);
  }

  return paragraphs.join("\n\n");
}
