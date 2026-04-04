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
} from "./utils";
import { SYNONYM_BANK, PROTECTED_WORDS } from "./rules";
import { postProcess } from "./post-processor";
import { analyze as analyzeContext, type TextContext } from "./context-analyzer";
import {
  voiceShift,
  deepRestructure,
  hasFirstPerson,
} from "./advanced-transforms";
import { getDictionary, type HumanizerDictionary } from "./dictionary";
import { getDetector, type AnalysisResult } from "./multi-detector";
import { protectSpecialContent, restoreSpecialContent, protectContentTerms, restoreContentTerms, cleanOutputRepetitions, robustSentenceSplit, countSentences, enforceSentenceCountStrict, enforcePerParagraphSentenceCounts, rephraseCitations, type ProtectionMap } from "./content-protection";
import { semanticSimilaritySync } from "./semantic-guard";
import {
  applyPhrasePatterns, applySyntacticTemplate, applyAIWordKill, applyConnectorNaturalization,
  VERB_PHRASE_SWAPS, MODIFIER_SWAPS, CLAUSE_REPHRASINGS, HEDGING_PHRASES,
  TRANSITION_SWAPS, QUANTIFIER_SWAPS, TEMPORAL_SWAPS, CAUSAL_SWAPS, EMPHASIS_SWAPS,
  fixPunctuation, cleanSentenceStarters, verifySentencePresence, deepCleaningPass, perSentenceAntiDetection,
} from "./shared-dictionaries";
import {
  applyMicroNoiseToText, humanNoiseInjection,
} from "./anti-ai-patterns";
import { slidingWindowProcess } from "./sliding-window-processor";

// ── Input Feature Detection ──
// These detect whether the ORIGINAL input uses contractions, first-person, or rhetorical questions.
// The engine must never inject these features unless they already appear in the input.

interface InputFeatures {
  hasContractions: boolean;
  hasFirstPerson: boolean;
  hasRhetoricalQuestions: boolean;
}

function detectInputFeatures(text: string): InputFeatures {
  // Detect contractions: don't, can't, it's, they're, etc.
  // Uses explicit list to avoid false positives from possessives (e.g., "company's", "John's")
  const hasContractions = /\b(?:can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|wouldn't|shouldn't|couldn't|mustn't|ain't|it's|that's|there's|here's|he's|she's|who's|what's|how's|where's|when's|why's|one's|let's|they're|we're|you're|I'm|they've|we've|you've|I've|they'll|we'll|you'll|I'll|he'll|she'll|it'll|they'd|we'd|you'd|he'd|she'd|I'd|who'd)\b/i.test(text);

  // Detect first-person pronouns (I, me, my, mine, myself, we, us, our, ours, ourselves)
  const hasFirstPerson = /\b(?:I|me|my|mine|myself|we|us|our|ours|ourselves)\b/.test(text);

  // Detect rhetorical questions (sentences ending with ?)
  const hasRhetoricalQuestions = /[A-Za-z][^.!?]*\?/.test(text);

  return { hasContractions, hasFirstPerson, hasRhetoricalQuestions };
}

/**
 * Extract proper nouns from the original text.
 * Only identifies names of people, places, and organizations —
 * NOT common English words that happen to appear in titles/headings.
 */
function extractProperNouns(text: string): Set<string> {
  // Common English words that appear capitalized in headings but are NOT proper nouns
  const COMMON_WORDS = new Set([
    "the", "and", "for", "with", "from", "into", "that", "this", "these", "those",
    "also", "both", "each", "most", "some", "such", "very", "just", "more",
    "about", "after", "before", "between", "through", "during", "within",
    "which", "where", "while", "when", "what", "how", "why", "who",
    // Common nouns and adjectives found in academic headings
    "introduction", "conclusion", "summary", "abstract", "discussion", "results",
    "methods", "background", "analysis", "overview", "review", "chapter", "part",
    "section", "table", "figure", "appendix", "references",
    "leadership", "management", "performance", "foundations", "emotional",
    "social", "cognitive", "moral", "psychological", "strategic", "organizational",
    "critical", "effective", "significant", "important", "fundamental",
    "marketing", "sales", "business", "financial", "economic",
    "intelligence", "communication", "development", "assessment", "evaluation",
    "behavior", "behaviour", "cultural", "professional", "personal",
    "environment", "approach", "perspective", "framework", "methodology",
    "research", "theory", "practice", "policy", "process", "system",
    "problem", "solution", "challenge", "opportunity", "strategy",
    "however", "therefore", "furthermore", "moreover", "consequently",
    "effectiveness", "relationship", "application", "improvement", "achievement",
    "empathy", "compassion", "motivation", "inspiration", "confidence",
    "her", "his", "their", "our", "its", "she", "they", "may", "can",
  ]);

  const properNouns = new Set<string>();

  // Strategy: Find words capitalized mid-sentence (after lowercase + space)
  // that appear capitalized in BODY text (not just in headings)
  // Only count if NOT a common English word
  const midSentence = text.matchAll(/(?<=[a-z,;]\s)([A-Z][a-z]{2,})/g);
  const midSentenceCounts = new Map<string, number>();
  for (const m of midSentence) {
    const w = m[1];
    if (!COMMON_WORDS.has(w.toLowerCase())) {
      midSentenceCounts.set(w, (midSentenceCounts.get(w) ?? 0) + 1);
    }
  }

  // A word is a proper noun if it appears capitalized mid-sentence at least once
  for (const [w] of midSentenceCounts) {
    properNouns.add(w);
  }

  return properNouns;
}

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
  // Roman numeral headings: "I.", "II.", "III.", "IV.", "V.", "VI.", etc.
  if (/^[IVXLCDM]+\.\s/i.test(trimmed)) return true;
  // Numbered parts: "Part 1:", "Part 2:", "Section 3.", etc.
  if (/^(?:Part|Section|Chapter)\s+\d+/i.test(trimmed)) return true;
  // Numbered headings: "1.", "2.", "1)", "A.", "a)"
  if (/^[\d]+[.):]\s/.test(trimmed) || /^[A-Za-z][.):]\s/.test(trimmed)) return true;
  // "Introduction", "Conclusion", "Summary", "Abstract" as standalone headings
  if (/^(?:Introduction|Conclusion|Summary|Abstract|Background|Discussion|Results|Methods|References|Acknowledgments|Appendix)\s*$/i.test(trimmed)) return true;
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
  // NOTE: "by" excluded — fronting "by" phrases produces an AI-hallmark pattern
  const endPhraseMatch = sent.match(/,\s+((?:in|on|at|for|with|through|during|within|across|among|between|under|over|after|before)\s+[^,]+)\.?\s*$/i);
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
  // Skip if sentence has 3+ commas (likely a list)
  const commaCount = (sent.match(/,/g) || []).length;
  const CLAUSE_VERBS = /\b(?:is|are|was|were|has|have|had|does|do|did|will|would|can|could|should|may|might|must|seems?|appears?|involves?|requires?|suggests?|shows?|provides?|leads?|plays?|helps?|makes?)\b/i;
  if (commaCount < 3) {
    for (const conj of [", and ", ", but ", ", yet ", ", while "]) {
      const idx = sent.toLowerCase().indexOf(conj);
      if (idx > 0 && idx < sent.length - conj.length - 5) {
        const clause1 = sent.slice(0, idx).trim();
        const clause2 = sent.slice(idx + conj.length).trim();
        if (clause1.split(/\s+/).length >= 5 && clause2.split(/\s+/).length >= 5
          && CLAUSE_VERBS.test(clause1) && CLAUSE_VERBS.test(clause2)) {
          const swapConj = conj === ", and " ? ", and " : conj === ", but " ? ", though " : conj === ", yet " ? ", and yet " : ", while ";
          let result = clause2.replace(/\.$/, "")[0].toUpperCase() + clause2.replace(/\.$/, "").slice(1) + swapConj + safeDowncaseFirst(clause1);
          if (!/[.!?]$/.test(result)) result += ".";
          return result;
        }
      }
    }
  }

  return sent;
}

/**
 * Restructure approximately 40% of sentences by reordering clauses and phrases.
 * Preserves topic keywords and ensures smooth flow.
 * Skips the first sentence of each group (topic sentence).
 */
function _restructure50Percent(sentences: string[]): string[] {
  if (sentences.length < 2) return sentences;

  const topicKeywords = extractTopicKeywords(sentences);
  const targetCount = Math.ceil(sentences.length * 0.4);

  // Select indices to restructure — SKIP index 0 (topic sentence)
  const indices = new Set<number>();
  for (let i = 2; i < sentences.length && indices.size < targetCount; i += 2) {
    indices.add(i);
  }
  while (indices.size < targetCount && indices.size < sentences.length) {
    const r = 1 + Math.floor(Math.random() * (sentences.length - 1)); // never pick 0
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
function expandWithPhrasalVerbs(sentences: string[], _intensity: number): string[] {
  // DISABLED — phrasal verb expansion adds unnecessary filler words
  // ("use" → "make use of" inflates word count without value)
  return sentences;
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
function _injectRelevantPhrases(sentences: string[], intensity: number): string[] {
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
    targetScore = strengthMap3(15.0, 10.0, 5.0);
    maxIterations = strengthMap3(1, 1, 2);
    baseIntensity = strengthMap3(2.5, 4.0, 5.5);
    minChangeRatio = 0.35;
    signalFixEnabled = true;
  } else if (mode === "ghost_pro") {
    targetScore = strengthMap3(5.0, 3.0, 1.0);
    maxIterations = strengthMap3(2, 3, 4);
    baseIntensity = strengthMap3(4.0, 6.5, 9.0);
    minChangeRatio = 0.80;
    signalFixEnabled = true;
  } else if (stealth) {
      targetScore = strengthMap3(5.0, 3.0, 1.0);
      maxIterations = strengthMap3(2, 3, 4);
      baseIntensity = strengthMap3(4.0, 6.5, 9.0);
      minChangeRatio = 0.55;
      signalFixEnabled = true;
    } else {
    targetScore = 20.0;
    maxIterations = strengthMap3(2, 3, 5);
    baseIntensity = strengthMap3(1.8, 3.0, 4.5);
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
  // Bad thesaurus synonyms that produce garbled text
  "caller", "calling", "selling", "flunk", "lesson", "handler",
  "societal", "communal", "assort", "checker", "pleader",
  "roomer", "settler", "capper", "shaker", "sayer",
  "proofed", "dataed", "interplays", "principally",
  // Bad synonyms that change register or meaning
  "boss", "wearable", "covering", "tactical", "falling",
  "public", "amend", "planned", "calculated", "construction",
  "substance", "direction", "understandings",
  "quartet", "pity", "associate", "topics", "interplays",
  "advance", "hurdles", "dropping", "dealings",
  "vesture", "coating", "specially", "understanding",
  "interplay", "appraising", "dialogues",
  "earn", "quatern", "concluded", "wearable",
  "transfers", "main",
  "center", "eve", "tactics",
  "lotion", "prosody", "primer", "ticker", "cosmos",
  "formation", "winner", "clean", "maker", "backer",
  "tract", "genesis", "heed", "craft", "deed",
  "lodge", "patch", "file", "register", "post",
  "terminal", "cabinet", "chamber", "trunk", "cell",
  "organ", "press", "plant", "stock", "draft",
  "bark", "pool", "court", "match", "spring",
  "seal", "mold", "cast", "strain", "plot",
  "master", "hindrances", "principally",
  "mentation", "cogitation", "bettor",
  "rivet", "centre", "link",
  // Bad thesaurus results that produce nonsensical output in context
  "chassis", "unitedly", "limitless", "lonely", "retrieve",
  "apparatus", "contrivance", "contraption", "gizmo", "gadget",
  "habitation", "domicile", "abode", "lodgings", "berth",
  "vessel", "conduit", "receptacle", "depository",
  "corporeal", "ethereal", "ephemeral", "nascent", "cognizant",
  "obfuscate", "prognosticate", "remunerate", "conflagration",
  "perambulate", "masticate", "regurgitate", "cogitate",
  "veritably", "assuredly", "indubitably", "irrefutably",
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
      && Math.abs(replacement.length - lower.length) <= Math.max(3, lower.length * 0.4)
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
  const eff = (mode === "mini" || mode === "ghost_mini") ? intensity * 0.15 : intensity * 0.7;
  return dictSynonymReplace(sent, eff, used, ctx, dict, commonWords);
}

// ── Human texture ──

const HUMAN_STARTERS = [
  "Still, ", "Now, ",
  "Of course, ", "Then again, ", "True, ", "Granted, ",
  "Interestingly, ", "To be fair, ",
  "In practice, ", "Not surprisingly, ",
  "What matters here is that ", "Put simply, ",
  "It helps to remember that ", "Part of the issue is that ",
  "To put it another way, ",
  "What often goes unnoticed is that ", "In many ways, ",
];

const FORMAL_TO_NATURAL: Record<string, string[]> = {
  "Furthermore, ": ["Plus, ", "On top of that, ", "Another thing worth noting, ", "What is more, "],
  "Moreover, ": ["Besides, ", "Adding to this, ", "On a related note, "],
  "Additionally, ": ["Also, ", "On top of this, ", "Then there is ", "Add to that "],
  "Consequently, ": ["So, ", "As a result, ", "Because of this, ", "What follows from this is "],
  "Nevertheless, ": ["Still, ", "Even so, ", "All the same, "],
  "Nonetheless, ": ["Even still, ", "Yet, ", "All the same, "],
  "In contrast, ": ["On the flip side, ", "Then again, ", "Compare that to "],
  "Conversely, ": ["On the other hand, ", "Flip that around and ", "Look at it differently, "],
  "Subsequently, ": ["After that, ", "Then, ", "What followed was ", "From there, "],
  "In conclusion, ": ["All things considered, ", "When it comes down to it, ", "At the end of the day, ", "Taking everything into account, "],
  "Ultimately, ": ["In the end, ", "When it comes down to it, ", "At the end of the day, ", "The bottom line is "],
  "In this regard, ": ["On that note, ", "Speaking of which, ", "Which brings up ", "Related to this, "],
  "Along these lines, ": ["In a similar vein, ", "Tied to this, ", "Going further, ", "Relatedly, "],
  "On a related note, ": ["Tied into this, ", "Connected to that, ", "Which brings us to ", "There is also "],
  "Worth noting is that ": ["One thing to keep in mind is that ", "A key point here, ", "Something often missed, "],
  "Equally, ": ["Just as much, ", "Similarly, ", "By the same token, "],
  "At the same time, ": ["Meanwhile, ", "Alongside that, ", "In parallel, ", "Simultaneously, "],
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

function _applyHumanTexture(sentences: string[], intensity: number, _settings: HumanizeSettings): string[] {
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

// ── Add contractions (opposite of expandContractions) ──

const ADD_CONTRACTION_MAP: [RegExp, string][] = [
  [/\bdo not\b/gi, "don't"],
  [/\bdoes not\b/gi, "doesn't"],
  [/\bdid not\b/gi, "didn't"],
  [/\bcannot\b/gi, "can't"],
  [/\bwill not\b/gi, "won't"],
  [/\bwould not\b/gi, "wouldn't"],
  [/\bshould not\b/gi, "shouldn't"],
  [/\bcould not\b/gi, "couldn't"],
  [/\bis not\b/gi, "isn't"],
  [/\bare not\b/gi, "aren't"],
  [/\bwas not\b/gi, "wasn't"],
  [/\bwere not\b/gi, "weren't"],
  [/\bhas not\b/gi, "hasn't"],
  [/\bhave not\b/gi, "haven't"],
  [/\bhad not\b/gi, "hadn't"],
  [/\bmust not\b/gi, "mustn't"],
  [/\bit is\b/gi, "it's"],
  [/\bthat is\b/gi, "that's"],
  [/\bthey are\b/gi, "they're"],
  [/\bwe are\b/gi, "we're"],
  [/\byou are\b/gi, "you're"],
  [/\bthey have\b/gi, "they've"],
  [/\bwe have\b/gi, "we've"],
  [/\byou have\b/gi, "you've"],
  [/\bthey will\b/gi, "they'll"],
  [/\bwe will\b/gi, "we'll"],
  [/\byou will\b/gi, "you'll"],
  [/\bhe will\b/gi, "he'll"],
  [/\bshe will\b/gi, "she'll"],
  [/\bit will\b/gi, "it'll"],
  [/\blet us\b/gi, "let's"],
];

function addContractions(text: string): string {
  let result = text;
  // Apply contractions with 40% probability per match to keep it natural (not ALL contracted)
  for (const [pattern, replacement] of ADD_CONTRACTION_MAP) {
    result = result.replace(pattern, (match) => {
      if (Math.random() < 0.40) {
        // Preserve capitalization of first char
        if (match[0] === match[0].toUpperCase() && replacement[0] === replacement[0].toLowerCase()) {
          return replacement[0].toUpperCase() + replacement.slice(1);
        }
        return replacement;
      }
      return match;
    });
  }
  return result;
}

// ── Sentence de-duplication ──
// Removes sentences that are near-duplicates within a paragraph (common after multiple iterations)
function deduplicateSentences(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs.map((para) => {
    if (isTitleOrHeading(para.trim())) return para;
    const sentences = robustSentenceSplit(para);
    if (sentences.length < 2) return para;
    const seenKeys = new Set<string>();
    const seenWordSets: Set<string>[] = [];
    const result: string[] = [];
    for (const sent of sentences) {
      // Normalize: lowercase content words (3+ chars)
      const norm = sent.toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
      // Key-based dedup: first 40 chars match
      const key = norm.slice(0, 40);
      if (key.length > 20 && seenKeys.has(key)) continue;
      // Word-set overlap dedup: if 70%+ of content words overlap a previous sentence
      const contentWords = new Set(norm.split(" ").filter(w => w.length >= 4));
      if (contentWords.size >= 4) {
        let isDup = false;
        for (const prev of seenWordSets) {
          let overlap = 0;
          for (const w of contentWords) { if (prev.has(w)) overlap++; }
          const overlapRatio = overlap / Math.min(contentWords.size, prev.size);
          if (overlapRatio >= 0.7) { isDup = true; break; }
        }
        if (isDup) continue;
        seenWordSets.push(contentWords);
      }
      seenKeys.add(key);
      result.push(sent);
    }
    return result.join(" ");
  }).join("\n\n");
}

// ── Word corruption detection ──
// Catches nonsense words created by bad suffix concatenation
const NONSENSE_SUFFIX_PATTERNS = /(?:tion|sion|ment|ness|ance|ence|ship|ment)(?:ing|ed|tion|ment|ness|ize|ify)$/i;
const NONSENSE_DOUBLE_SUFFIX = /(?:nesses|ments|tioned|tioning|sioned|sioning|shiped|shipping|mented|menting|lacksed|lacksing|ksed|ksing|ssed(?!ing)|(?:ves|nds|rks|lts|cts|pts|nts|mps|ngs)ed|(?<=[a-z]{2})inged|eded|(?:[a-z])eded)$/i;

function containsNonsenseWords(text: string): string[] {
  const words = text.split(/\s+/);
  const nonsense: string[] = [];
  for (const w of words) {
    const clean = w.replace(/[^a-zA-Z]/g, "").toLowerCase();
    if (clean.length > 4 && (NONSENSE_SUFFIX_PATTERNS.test(clean) || NONSENSE_DOUBLE_SUFFIX.test(clean))) {
      nonsense.push(clean);
    }
  }
  return nonsense;
}

// ── Pre-2000 Era Buzzword Killer ──

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

// ── Cleanup ──

function cleanupGibberish(text: string): string {
  let result = text;
  // Fix trailing dangling conjunctions: "... , and." or "... , but." or "... and."
  result = result.replace(/,?\s*\b(?:and|but|or|nor|yet)\s*[.!?]\s*$/gi, ".");
  // Fix trailing discourse cues before period: ", meanwhile." / ", then again,." / ", particularly." / ", on that note,."
  result = result.replace(/,?\s*\b(?:meanwhile|then again|even so|that said|on that note|tied to this|put differently|seen another way|particularly|by contrast|in other words|equally worth noting|from another (?:standpoint|viewpoint|perspective|angle)|related to this|to rephrase|to put it plainly|still|and yet|simultaneously),?\s*[.!?]/gi, ".");
  // Fix "which means but" / "which means and" / "which means or" patterns
  result = result.replace(/,?\s*which means\s+(?:and|but|or|nor|yet)\b/gi, "");
  // Fix stacked discourse cues at sentence start (e.g., "On that note, in other words,")
  result = result.replace(/^((?:on that note|tied to this|related to this|meanwhile|at the same time|then again|put differently|seen another way|equally worth noting|in other words|by contrast|even so|that said|as it turns out|looking closer|in practice|to be fair|and yet|but then|of course|granted|true|now|still),?\s*){2,}/gim, (m) => {
    // Keep only the last cue
    const cues = m.match(/(?:on that note|tied to this|related to this|meanwhile|at the same time|then again|put differently|seen another way|equally worth noting|in other words|by contrast|even so|that said|as it turns out|looking closer|in practice|to be fair|and yet|but then|of course|granted|true|now|still),?\s*/gi);
    if (cues && cues.length > 1) {
      const last = cues[cues.length - 1].trim().replace(/,\s*$/, "");
      return last[0].toUpperCase() + last.slice(1) + ", ";
    }
    return m;
  });
  // Fix mid-sentence stacked cues: "since even so," / "because that said," / "while on that note,"
  result = result.replace(/\b(?:since|because|while|though|although)\s+(?:even so|that said|on that note|then again|put differently|in other words),?\s*/gi, "");
  // Fix double comma-conjunction patterns: ", and, and " or ", but, but "
  result = result.replace(/,\s*(and|but|or)\s*,\s*\1\b/gi, ", $1");
  // Fix "... , in dealing, and." pattern (fragment ending)
  result = result.replace(/,\s*in\s+\w+ing\s*,\s*(?:and|but|or)\s*[.!?]/gi, ".");
  // Remove trailing ", and" / ", but" before period
  result = result.replace(/,\s*(?:and|but|or)\s*\./g, ".");
  // Fix trailing fragment patterns: ", in dealing." / ", especially." / ", to rephrase." / ", while." / ", notably."
  result = result.replace(/,\s*(?:in\s+\w+ing|especially|particularly|notably|to\s+\w+|while\s+from|from\s+another|while|though)\s*[.!?]/gi, ".");
  // Fix ", in dealing, meanwhile." type patterns (mid-sentence fragments attached at end)
  result = result.replace(/,\s*in\s+\w+ing\s*,\s*(?:meanwhile|then again|even so|that said)\s*[.!?]/gi, ".");
  return result;
}

function cleanup(text: string, inputFeatures?: InputFeatures, properNouns?: Set<string>): string {
    // Preserve paragraph boundaries by processing each paragraph independently
    const paragraphs = text.split(/\n\s*\n/);
    return paragraphs.map((para) => {
      let p = para;
      const isHeading = isTitleOrHeading(p.trim());

      // Headings: only do minimal cleanup (whitespace, dedupe), skip aggressive transforms
      p = p.replace(/  +/g, " ");
      p = p.replace(/\.{2,}/g, ".");
      p = p.replace(/\s+([.,;:!?])/g, "$1");
      p = p.replace(/\b(\w+(?:\s+\w+){0,2})\s+\1\b/gi, "$1");
      p = p.replace(/,{2,}/g, ",");
      p = p.replace(/;{2,}/g, ";");
      if (!isHeading) {
        // Clean up gibberish patterns from multi-pass restructuring
        p = cleanupGibberish(p);
        // Only replace dashes and certain punctuation in body paragraphs, not headings
        p = p.replace(/ — /g, ", ").replace(/—/g, ", ");
        p = p.replace(/ – /g, ", ").replace(/–/g, ", ");
        // Fix spaced-out hyphens in compound words BACK to proper hyphenation
        // e.g. "game - changer" → "game-changer", "decision - making" → "decision-making"
        p = p.replace(/(\w)\s+-\s+(\w)/g, "$1-$2");
      }
      p = p.replace(/,\s*,/g, ",");
      p = p.replace(/\(\s*\)/g, "");
      p = p.replace(/ {2,}/g, " ");
      p = p.replace(/\band\b[,;]?\s+\band\b/gi, "and");
      p = p.replace(/\bbut\b[,;]?\s+\bbut\b/gi, "but");
      p = p.replace(/,\s+and\s+the\b/g, ", the");
      p = p.replace(/\ba ([aeiouAEIOU])/g, "an $1");
      p = p.replace(/\bA ([aeiouAEIOU])/g, "An $1");
      p = p.replace(/\ban ([bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ])/g, "a $1");
      if (!isHeading) {
        // Mid-sentence capitalization fix — skip proper nouns and multi-word titled phrases
        p = p.replace(/(?<=[a-z,;] )([A-Z])([a-z]{2,})/g, (_m: string, c1: string, rest: string, offset: number) => {
          const word = c1 + rest;
          if (properNouns && properNouns.has(word)) return word; // preserve proper nouns
          // Preserve words that are part of a multi-word capitalized sequence (e.g. "Chief Marketing Officer")
          if (offset >= 2) {
            const textBefore = p.slice(Math.max(0, offset - 50), offset - 1);
            if (/[A-Z][a-z]+$/.test(textBefore)) return word;
          }
          // Also check if the next word is capitalized (part of title)
          const textAfter = p.slice(offset + word.length);
          if (/^\s+[A-Z][a-z]/.test(textAfter)) {
            // Both this word and next are capitalized mid-sentence — likely a title
            return word;
          }
          return c1.toLowerCase() + rest;
        });
      }
        // Restore proper nouns that were lowercased by safeDowncaseFirst or other transforms
        if (properNouns && properNouns.size > 0) {
          for (const pn of properNouns) {
            const lower = pn.toLowerCase();
            if (lower !== pn) {
              p = p.replace(new RegExp(`\\b${lower}\\b`, 'g'), pn);
            }
          }
        }
        // Contractions DISABLED — zero-tolerance policy for academic output
        if (isHeading) return p.trim();
        const sentences = robustSentenceSplit(p);
      return sentences.map((s) => { s = s.trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; }).filter(Boolean).join(" ");
    }).join("\n\n");
  }

// ── Sentence enforcement ──

function _enforceSentenceDistribution(sentences: string[]): string[] {
  // STRICT SENTENCE-BY-SENTENCE: No splitting or merging allowed.
  // Only reorder consecutive same-bucket runs to break uniformity patterns.
  if (sentences.length < 3) return sentences;
  const bucket = (wc: number) => wc <= 15 ? 0 : wc <= 25 ? 1 : wc <= 35 ? 2 : wc <= 45 ? 3 : 4;
  const result = [...sentences];
  for (let k = 2; k < result.length; k++) {
    const b0 = bucket(result[k - 2].split(/\s+/).length);
    const b1 = bucket(result[k - 1].split(/\s+/).length);
    const b2 = bucket(result[k].split(/\s+/).length);
    if (b0 === b1 && b1 === b2 && k + 1 < result.length) {
      [result[k], result[k + 1]] = [result[k + 1], result[k]];
    }
  }
  return result;
}

// ── Sentence merge/split for natural variation ──
// Per 300 words: merge 1-2 short adjacent sentences, split 2-3 long sentences

const SENT_MERGE_CONNECTORS = [
  ", and ", ", which ", ", since ", ", while ", ", as ",
  ", although ", ", particularly ", ", especially ",
];

function mergeSentences(s1: string, s2: string): string {
  const clean1 = s1.replace(/\.\s*$/, "");
  const lower2 = s2[0]?.toLowerCase() + s2.slice(1);
  const conn = SENT_MERGE_CONNECTORS[Math.floor(Math.random() * SENT_MERGE_CONNECTORS.length)];
  return clean1 + conn + lower2;
}

function splitSentence(sent: string): string[] {
  const words = sent.split(/\s+/);
  if (words.length < 14) return [sent];

  // Helper: check if a text fragment has a verb (i.e. is a clause, not a list item)
  const hasVerb = (text: string) => /\b(?:is|are|was|were|has|have|had|do|does|did|will|would|could|should|shall|may|might|can|must|need|make|made|take|took|get|got|give|gave|lead|led|show|find|found|keep|say|said|know|knew|mean|meant|become|became|remain|run|seem|appear|include|provide|allow|help|create|cause|produce|affect|result|involve|require|suggest|indicate|demonstrate|reveal|exist|occur|happen|depend|contribute|continue|begin|began|start|play|serve|represent|support|develop|establish|change|move|work|turn|come|came|go|went|see|saw|think|thought|believe|argue|claim|prove|ensure|determine|consider|examine|discuss|increase|decrease|reduce|improve|reflect|prevent|enable|bring|brought|set|put)\b/i.test(text);

  // Try splitting at clause boundaries: ", and ", ", but ", ", which ", "; "
  // Only split when both halves have a verb (form independent clauses).
  const clausePatterns = [
    /,\s+and\s+/i, /,\s+but\s+/i, /;\s+/,
    /,\s+which\s+/i, /,\s+while\s+/i, /,\s+although\s+/i,
    /,\s+however\s+/i, /,\s+yet\s+/i,
  ];
  for (const pattern of clausePatterns) {
    const match = sent.match(pattern);
    if (match && match.index !== undefined) {
      const splitPos = match.index;
      const part1 = sent.slice(0, splitPos).trim();
      const part2 = sent.slice(splitPos + match[0].length).trim();
      // Ensure both parts are substantial and both have verbs (are clauses, not list items)
      if (part1.split(/\s+/).length >= 5 && part2.split(/\s+/).length >= 5 && hasVerb(part1) && hasVerb(part2)) {
        const p1 = part1.endsWith(".") ? part1 : part1 + ".";
        const p2 = part2[0]?.toUpperCase() + part2.slice(1);
        return [p1, p2];
      }
    }
  }

  // Fallback: split at a middle comma
  const midStart = Math.floor(words.length * 0.35);
  const midEnd = Math.floor(words.length * 0.65);
  for (let i = midStart; i <= midEnd; i++) {
    if (words[i]?.endsWith(",")) {
      const part1 = words.slice(0, i + 1).join(" ").replace(/,\s*$/, ".");
      const rest = words.slice(i + 1).join(" ").trim();
      if (rest.length > 0 && rest.split(/\s+/).length >= 5) {
        const part2 = rest[0]?.toUpperCase() + rest.slice(1);
        return [part1, part2];
      }
    }
  }

  return [sent];
}

function applySentenceMergeSplit(sentences: string[]): string[] {
  if (sentences.length < 3) return sentences;

  // Target: per ~20 sentences → merge 1-2 and split 2-3
  const ratio = Math.max(1, Math.floor(sentences.length / 20));

  // Budget: 1-2 merges and 2-3 splits per 20 sentences
  const mergeTarget = Math.max(1, Math.min(2, ratio + (Math.random() < 0.5 ? 1 : 0)));
  const splitTarget = Math.max(2, Math.min(3, ratio + 1 + (Math.random() < 0.5 ? 1 : 0)));

  let result = [...sentences];

  // Phase 1: Split long sentences (>20 words) at clause boundaries
  let splitsDone = 0;
  const afterSplit: string[] = [];
  for (const sent of result) {
    const wc = sent.split(/\s+/).length;
    if (splitsDone < splitTarget && wc > 20 && Math.random() < 0.7) {
      const parts = splitSentence(sent);
      if (parts.length > 1) {
        afterSplit.push(...parts);
        splitsDone++;
        continue;
      }
    }
    afterSplit.push(sent);
  }
  result = afterSplit;

  // Phase 2: Merge short adjacent sentences (both <15 words)
  let mergesDone = 0;
  const afterMerge: string[] = [];
  let skip = false;
  for (let i = 0; i < result.length; i++) {
    if (skip) { skip = false; continue; }
    const wc1 = result[i].split(/\s+/).length;
    const next = result[i + 1];
    if (next && mergesDone < mergeTarget && wc1 < 15 && wc1 >= 3) {
      const wc2 = next.split(/\s+/).length;
      if (wc2 < 15 && wc2 >= 3 && Math.random() < 0.65) {
        afterMerge.push(mergeSentences(result[i], next));
        mergesDone++;
        skip = true;
        continue;
      }
    }
    afterMerge.push(result[i]);
  }
  result = afterMerge;

  return result;
}

// ── Vary sentence starts ──

const _OPENER_VARIANTS = [
  "On that note, ", "Tied to this, ", "Related to this, ",
  "And ", "But ", "Meanwhile, ", "At the same time, ",
  "Then again, ", "Put differently, ",
  "In other words, ",
  "Equally worth noting, ",
];

// Check if sentence already starts with a discourse cue
const DISCOURSE_CUE_RE = /^(?:on that note|tied to this|related to this|meanwhile|at the same time|then again|put differently|seen another way|which means|in other words|equally worth noting|just as relevant|by contrast|from another|to put it|even so|that said|looking at it|from a different|along these lines|in this regard|and |but )/i;

function varySentenceStarts(sentences: string[]): string[] {
  // Pass through — no filler prepending. Sentence variation comes from
  // restructuring/synonym swap, not from injecting discourse cues.
  return sentences;
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
      if (badness > 10) weaknesses.push([sig, badness]);
    } else if (AI_POSITIVE_SIGNALS.has(sig)) {
      if (val > 10) weaknesses.push([sig, val]);
    }
  }
  return weaknesses.sort((a, b) => b[1] - a[1]);
}

// ── Signal fix functions ──

function fixLowPerplexity(sentences: string[], intensity: number, used: Set<string>, ctx: TextContext | null, dict: HumanizerDictionary, cw: Set<string>): string[] {
  return sentences.map((s) => {
    s = synonymReplace(s, Math.min(intensity * 0.3, 2.0), used, ctx?.protectedTerms);
    return s;
  });
}

function _fixLowBurstiness(sentences: string[], intensity: number): string[] {
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

function _fixHighUniformity(sentences: string[], intensity: number): string[] {
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
    [/^Furthermore,?\s+/i, ["Also, ", "Plus, ", "On top of that, "]],
    [/^Moreover,?\s+/i, ["Besides, ", "On top of that, "]],
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
    s = synonymReplace(s, Math.min(intensity * 0.3, 2.0), used, ctx?.protectedTerms);
    return s;
  });
}

function fixStarterDiversity(sentences: string[]): string[] {
  if (sentences.length < 2) return sentences;
  const starters = [
    "And yet, ", "But then, ", "Still, ", "Now, ",
    "Meanwhile, ", "Of course, ", "In practice, ",
    "That said, ", "To be fair, ",
    "Looking closer, ", "Granted, ", "True, ",
    "Worth noting, ",
    "As it turns out, ",
    "Interestingly, ", "Crucially, ",
  ];
  const usedStarts = new Set<string>();
  return sentences.map((sent, i) => {
    const words = sent.split(/\s+/);
    if (!words.length) return sent;
    // Skip if sentence already has a discourse cue (prevent stacking across iterations)
    if (DISCOURSE_CUE_RE.test(sent)) {
      usedStarts.add(words[0].toLowerCase().replace(/[,;:]/g, ""));
      return sent;
    }
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
  // Full AI kill pipeline per sentence — mirrors ghost-pro's aggressive approach
  return sentences.map((sent) => {
    // Step 1: Kill AI words and phrases
    sent = applyAIWordKill(sent);
    sent = applyPhrasePatterns(sent);
    sent = applyConnectorNaturalization(sent);
    sent = replaceAiStarters(sent);
    sent = killModernBuzzwords(sent);

    // Step 2: Restructure and vary (only for longer sentences)
    sent = phraseSubstitute(sent, Math.min(intensity, 3.0));
    if (sent.split(/\s+/).length > 15) sent = deepRestructure(sent, Math.min(intensity * 0.6, 2.5));

    // Step 3: Vocabulary — reduced synonym coverage (target ≈12%)
    sent = synonymReplace(sent, Math.min(intensity * 0.3, 2.0), used, ctx?.protectedTerms);

    // Step 4: Syntactic template for structural variation — 8% probability, ≥20 words only
    if (Math.random() < 0.08 && sent.split(/\s+/).length >= 20) {
      const templated = applySyntacticTemplate(sent);
      if (templated !== sent && containsNonsenseWords(templated).length === 0) sent = templated;
    }

    // Step 5: Final AI residue sweep
    sent = applyAIWordKill(sent);
    sent = killModernBuzzwords(sent);
    if (sent && /^[a-z]/.test(sent)) sent = sent[0].toUpperCase() + sent.slice(1);
    return sent;
  });
}

function fixReadabilityConsistency(sentences: string[], _intensity: number): string[] {
  const fillers = new Set(["very", "extremely", "fundamentally", "inherently", "basically", "essentially", "significantly", "particularly", "substantially", "considerably"]);
  const _clauses = [", which makes a difference", ", though that depends", ", at least in most cases", ", even if only slightly"];
  return sentences.map((sent, i) => {
    const words = sent.split(/\s+/);
    if (i % 3 === 0 && words.length > 12) {
      return words.filter((w) => !fillers.has(w.toLowerCase().replace(/[.,;:]/g, ""))).join(" ");
    }
    // DISABLED — clause appending adds unnecessary fillers
    // if (i % 3 === 2 && words.length < 12 ...) { ... }
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
    "with respect to": "about", "it is important to": "",
    "it is necessary to": "", "it is evident that": "clearly",
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
  // STRICT SENTENCE-BY-SENTENCE: No merging allowed.
  // Instead, add subordinate clauses within individual sentences to increase depth.
  if (sentences.length < 2) return sentences;
  const subordinators = ["because", "since", "although", "while", "whereas", "even though", "given that"];
  return sentences.map((s) => {
    const wc = s.split(/\s+/).length;
    if (wc >= 8 && wc <= 25 && Math.random() < 0.2 * intensity) {
      // Add a subordinate clause within the sentence by inserting after the first clause
      const commaIdx = s.indexOf(",");
      if (commaIdx > 10 && commaIdx < s.length - 10) {
        const sub = subordinators[Math.floor(Math.random() * subordinators.length)];
        // Add a qualifying phrase after the comma
        const qualifiers = [
          `, ${sub} this matters in practice,`,
          `, ${sub} the context demands it,`,
          `, ${sub} these factors interact,`,
        ];
        const q = qualifiers[Math.floor(Math.random() * qualifiers.length)];
        const before = s.slice(0, commaIdx);
        const after = s.slice(commaIdx + 1);
        const result = before + q + after;
        if (result.split(/\s+/).length <= 40) return result;
      }
    }
    return s;
  });
}

function fixLowShannonEntropy(sentences: string[], intensity: number, used: Set<string>, ctx: TextContext | null, dict: HumanizerDictionary, cw: Set<string>): string[] {
  return sentences.map((s) => {
    s = synonymReplace(s, Math.min(intensity * 0.3, 2.0), used, ctx?.protectedTerms);
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
    // Skip if sentence ALREADY contains any modifier (prevents accumulation across iterations)
    const sLower = s.toLowerCase();
    if (TOKEN_MODIFIERS.some(mod => sLower.includes(mod))) {
      // Just do synonym replacement, no modifier insertion
      s = synonymReplace(s, Math.min(intensity * 0.7, 3.8), used, ctx?.protectedTerms);
      s = applyLargeDictionary(s, Math.min(intensity * 0.5, 3.0), used, ctx, "ghost_mini", dict, cw);
      return s;
    }
    // Insert a modifier before an adjective-like word (reduced probability, stricter heuristic)
    if (Math.random() < 0.04 * intensity) {
      // Academic/technical adjectives that should NEVER receive casual modifiers
      const ACADEMIC_ADJECTIVES = new Set([
        "cognitive", "social", "emotional", "moral", "ethical", "critical",
        "essential", "organizational", "operational", "strategic", "collaborative",
        "participative", "constructive", "supportive", "productive", "transformational",
        "interpersonal", "professional", "analytical", "fundamental", "substantial",
        "significant", "influential", "effective", "impersonal", "dismissive",
        "environmental", "educational", "institutional", "motivational", "relational",
        "functional", "behavioral", "rational", "inspirational", "directional",
      ]);
      for (let j = 1; j < words.length; j++) {
        const w = words[j].replace(/[^a-zA-Z]/g, "").toLowerCase();
        // Skip if we're inside a comma-separated list (prev word ends with comma AND next word exists)
        const prevRaw = words[j - 1];
        if (prevRaw.endsWith(",") && j + 1 < words.length && (words[j].endsWith(",") || (j + 2 < words.length && words[j + 1].toLowerCase() === "and"))) continue;
        // Strict adjective heuristic: ends in common adj-only suffixes
        // Excludes -ing (gerunds/participles) to avoid "rather marketing" errors
        if (w.length > 4 && /(?:ous|ive|ful|ble|ent|ant|ial|ary|ory|cal|tic)$/.test(w)
          && !w.endsWith("ment") // -ment words are nouns, not adjectives (environment, management)
          && !["more", "most", "many", "much", "several", "few", "various", "other", "such"].includes(w)
          && !ACADEMIC_ADJECTIVES.has(w)) {
          // Skip if the next word is a technical noun (compound noun phrase like "cognitive foundations")
          const nextW = (j + 1 < words.length) ? words[j + 1].replace(/[^a-zA-Z]/g, "").toLowerCase() : "";
          if (nextW && /(?:tion|sion|ment|ness|ance|ence|ship|ity|ics|ing)$/.test(nextW)) continue;
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
    s = synonymReplace(s, Math.min(intensity * 0.3, 2.0), used, ctx?.protectedTerms);
    return s;
  });
}

function fixLowStylometric(sentences: string[], intensity: number, inputFeatures?: InputFeatures): string[] {
      // Improve stylometric score: parenthetical asides always allowed.
      // Contractions, first-person pronouns, and rhetorical questions ONLY if present in the original input.
      const pronounInserts = [
        "we can see that ", "one might argue that ", "we find that ",
        "it is worth asking whether ", "one could say that ",
        "we should note that ", "looking at this, we notice ",
      ];
      const parentheticals = [
        ", at least in part,", ", though not always,", ", or so it appears,",
        ", to some extent,", ", in most cases,", ", admittedly,",
        ", to be precise,", ", roughly speaking,",
      ];
      const rhetoricalEndings = [
        " But is that really the case?", " And why does that matter?",
        " The question is: how far does this go?", " But at what cost?",
        " So what does this tell us?", " And what follows from this?",
      ];
      const contractionInserts: [RegExp, string][] = [
        [/\bdo not\b/gi, "don't"], [/\bcannot\b/gi, "can't"],
        [/\bwill not\b/gi, "won't"], [/\bdoes not\b/gi, "doesn't"],
        [/\bis not\b/gi, "isn't"], [/\bare not\b/gi, "aren't"],
        [/\bwould not\b/gi, "wouldn't"], [/\bshould not\b/gi, "shouldn't"],
        [/\bcould not\b/gi, "couldn't"], [/\bhas not\b/gi, "hasn't"],
        [/\bhave not\b/gi, "haven't"], [/\bdid not\b/gi, "didn't"],
        [/\bit is\b/gi, "it's"], [/\bthat is\b/gi, "that's"],
        [/\bthey are\b/gi, "they're"], [/\bwe are\b/gi, "we're"],
      ];
      let pronounCount = 0;
      let rhetoricalDone = false;
      let parentheticalCount = 0;

      return sentences.map((sent, i) => {
        const words = sent.split(/\s+/);
        let result = sent;

        // Add contractions ONLY if the original input already contained contractions
        if (inputFeatures?.hasContractions && Math.random() < 0.30 * intensity) {
          for (const [pattern, repl] of contractionInserts) {
            if (pattern.test(result)) {
              result = result.replace(pattern, repl);
              break;
            }
          }
        }

        // Insert personal pronoun opener ONLY if the original input already used first-person
        if (inputFeatures?.hasFirstPerson && pronounCount < 2 && Math.random() < 0.15 * intensity && words.length > 6 && i > 0) {
          const insert = pronounInserts[Math.floor(Math.random() * pronounInserts.length)];
          result = insert + safeDowncaseFirst(result);
          pronounCount++;
        }

        // Add comma-based hedging aside (no brackets) — rare, max 1 per text
        if (parentheticalCount < 1 && Math.random() < 0.04 * intensity && words.length > 15) {
          const commaPositions: number[] = [];
          const w = result.split(/\s+/);
          for (let j = 4; j < w.length - 3; j++) {
            if (w[j].endsWith(",")) commaPositions.push(j);
          }
          if (commaPositions.length > 0) {
            const pos = commaPositions[Math.floor(Math.random() * commaPositions.length)];
            const aside = parentheticals[Math.floor(Math.random() * parentheticals.length)];
            w.splice(pos + 1, 0, aside.trim());
            result = w.join(" ");
            parentheticalCount++;
          }
        }

        // Add rhetorical question ONLY if the original input already contained questions
        if (inputFeatures?.hasRhetoricalQuestions && !rhetoricalDone && Math.random() < 0.08 * intensity && words.length > 15 && i > 2) {
          const q = rhetoricalEndings[Math.floor(Math.random() * rhetoricalEndings.length)];
          result = result.replace(/\.$/, ".") + q;
          rhetoricalDone = true;
        }

        return result;
      });
    }

function fixWordCommonality(sentences: string[], intensity: number, used: Set<string>, ctx: TextContext | null, dict: HumanizerDictionary, cw: Set<string>): string[] {
  // Replace overly common words with curated + large dictionary synonyms
  return sentences.map((s) => {
    s = synonymReplace(s, Math.min(intensity * 0.8, 4.0), used, ctx?.protectedTerms);
    s = applyLargeDictionary(s, Math.min(intensity * 0.6, 3.5), used, ctx, "ghost_pro", dict, cw);
    return s;
  });
}

function _fixParagraphUniformity(_paragraphs: string[]): string[] {
    // STRICT: No paragraph splitting or merging allowed.
    // Paragraph breaks must be preserved exactly as-is.
    return _paragraphs;
  }

function applySignalFixes(text: string, weakSignals: [string, number][], intensity: number,
    used: Set<string>, ctx: TextContext | null, settings: HumanizeSettings,
    dict: HumanizerDictionary, commonWords: Set<string>, inputFeatures?: InputFeatures): string {
  const fixes = new Set(weakSignals.slice(0, 6).map(([s]) => s));
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  const fixed: string[] = [];

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    // Preserve titles and headings from signal-fix transforms
    if (isTitleOrHeading(trimmedPara)) { fixed.push(trimmedPara); continue; }
    const sentences = robustSentenceSplit(trimmedPara);

    // Process each sentence independently through signal fixes
    const fixedSentences = sentences.map((sent) => {
      let s = [sent]; // Signal fix functions take arrays, wrap single sentence
      if (fixes.has("perplexity")) s = fixLowPerplexity(s, intensity, used, ctx, dict, commonWords);
      if (fixes.has("ai_pattern_score")) s = fixAiPatterns(s, intensity);
      if (fixes.has("vocabulary_richness")) s = fixLowVocabulary(s, intensity, used, ctx, dict, commonWords);
      if (fixes.has("ngram_repetition")) s = fixNgramRepetition(s, intensity, used, ctx);
      if (fixes.has("per_sentence_ai_ratio")) s = fixPerSentenceAi(s, intensity, used, ctx, dict, commonWords);
      if (fixes.has("readability_consistency")) s = fixReadabilityConsistency(s, intensity);
      if (fixes.has("function_word_freq")) s = fixFunctionWordFreq(s, intensity);
      if (fixes.has("dependency_depth")) s = fixLowDependencyDepth(s, intensity);
      if (fixes.has("shannon_entropy")) s = fixLowShannonEntropy(s, intensity, used, ctx, dict, commonWords);
      if (fixes.has("token_predictability")) s = fixTokenPredictability(s, intensity, used, ctx, dict, commonWords);
      if (fixes.has("stylometric_score")) s = fixLowStylometric(s, intensity, inputFeatures);
      if (fixes.has("avg_word_commonality")) s = fixWordCommonality(s, intensity, used, ctx, dict, commonWords);

      // Always run AI word kill on every signal fix pass — AI words are the #1 detection signal
      let fixed0 = s[0] ?? sent;
      fixed0 = applyAIWordKill(fixed0);
      fixed0 = applyPhrasePatterns(fixed0);
      fixed0 = killModernBuzzwords(fixed0);
      if (fixed0 && /^[a-z]/.test(fixed0)) fixed0 = fixed0[0].toUpperCase() + fixed0.slice(1);

      // Enforce 1-in=1-out: collapse multi-sentence outputs into a single sentence
      const subSents = robustSentenceSplit(fixed0);
      if (subSents.length > 1) {
        fixed0 = subSents.map((ss, si) => {
          if (si === 0) return ss.replace(/[.!?]\s*$/, "");
          return ss[0]?.toLowerCase() + ss.slice(1);
        }).join(", ") + (subSents[subSents.length - 1].match(/[.!?]$/) ? "" : ".");
      }

      // Ensure sentence ends with proper punctuation
      if (fixed0 && !/[.!?]$/.test(fixed0.trim())) {
        fixed0 = fixed0.trim() + ".";
      }

      return fixed0;
    });

    // Sentences were processed independently — just join them without cross-sentence operations
    fixed.push(fixedSentences.join(" "));
  }

    return fixed.join("\n\n");
  }

// ── Natural phrase-level variation (not just synonym swaps) ──
// Rephrases common sentence constructions to increase output diversity.
// Applied sparingly (~35% of sentences) to maintain natural reading flow.
const NATURAL_PHRASE_VARIATIONS: [RegExp, string[]][] = [
  // "This is because" → varied causal phrasing
  [/\bThis is because\b/i, ["The reason is that", "This happens because", "This comes down to the fact that"]],
  // "It is important to" → more direct
  [/\bIt is important to\b/i, ["It matters to", "One should", "It helps to"]],
  // "In order to" → simpler
  [/\bIn order to\b/i, ["To", "So as to", "For the purpose of"]],
  // "Due to the fact that" → concise
  [/\bDue to the fact that\b/i, ["Because", "Since", "Given that"]],
  // "It should be noted that" → direct
  [/\bIt should be noted that\b/i, ["Notably,", "Worth noting,", "One point is that"]],
  // "There are many" → varied existence phrasing
  [/\bThere are many\b/i, ["Plenty of", "A number of", "Several"]],
  // "has the ability to" → simpler
  [/\bhas the ability to\b/i, ["can", "is able to", "has the capacity to"]],
  // "on the basis of" → concise
  [/\bon the basis of\b/i, ["based on", "from", "drawing on"]],
  // "a large number of" → natural
  [/\ba large number of\b/i, ["many", "numerous", "quite a few"]],
  // "it can be seen that" → direct
  [/\bit can be seen that\b/i, ["clearly,", "as shown,", "evidently,"]],
  // "plays a role in" → varied
  [/\bplays a (?:key |important |crucial |vital )?role in\b/i, ["shapes", "feeds into", "affects", "contributes to"]],
  // "with respect to" → simpler
  [/\bwith respect to\b/i, ["regarding", "about", "when it comes to"]],
  // "is considered to be" → shorter
  [/\bis considered to be\b/i, ["is seen as", "counts as", "is regarded as"]],
  // "the fact that" → trim
  [/\bthe fact that\b/i, ["that", "how", "the way"]],
  // "As a result of" → natural cause
  [/\bAs a result of\b/i, ["Because of", "Thanks to", "Owing to"]],
  // "It is clear that" → direct
  [/\bIt is clear that\b/i, ["Clearly,", "Obviously,", "As is plain,"]],
  // "in the context of" → simpler
  [/\bin the context of\b/i, ["within", "in", "as part of"]],
  // "has been shown to" → active
  [/\bhas been shown to\b/i, ["turns out to", "appears to", "tends to"]],
  // Passive "was conducted" → active alternatives
  [/\bwas conducted\b/i, ["took place", "was carried out", "happened"]],
  // "serves as" → varied
  [/\bserves as\b/i, ["acts as", "works as", "functions as"]],
];

function applyNaturalPhraseVariation(sent: string): string {
  let result = sent;
  let applied = 0;
  // Apply at most 2 phrase variations per sentence to avoid over-transformation
  for (const [pattern, replacements] of NATURAL_PHRASE_VARIATIONS) {
    if (applied >= 2) break;
    if (pattern.test(result)) {
      const replacement = replacements[Math.floor(Math.random() * replacements.length)];
      result = result.replace(pattern, replacement);
      applied++;
    }
  }
  return result;
}

// ── Independent single-sentence humanization ──
// Each sentence is treated as an independent chunk. All transforms are applied
// to the sentence in isolation to maximize transformation depth.

function humanizeSingleSentence(
  sent: string, intensity: number, usedWords: Set<string>,
  ctx: TextContext | null, settings: HumanizeSettings,
  dict: HumanizerDictionary, commonWords: Set<string>,
  inputFeatures?: InputFeatures, properNouns?: Set<string>,
  isFirstInParagraph: boolean = false,
): string {
  if (!sent.trim()) return sent;
  const originalSent = sent.trim();
  let result = originalSent;

  // ── Step 1: Kill AI vocabulary via shared dictionaries (120+ words with stemming) ──
  result = applyAIWordKill(result);

  // ── Step 2: Kill AI phrase patterns (500K+ variations) ──
  result = applyPhrasePatterns(result);

  // ── Step 3: Clause restructuring — reorder clauses/phrases for variation ──
  // Skip for topic sentences (first sentence of each paragraph) to preserve paragraph flow
  if (!isFirstInParagraph && result.split(/\s+/).length > 6) {
    const restructured = restructureSingleSentence(result, extractTopicKeywords([result]));
    if (restructured !== result && containsNonsenseWords(restructured).length === 0) {
      result = restructured;
    }
  }

  // ── Step 4: Phrase substitutions ──
  result = phraseSubstitute(result, intensity);

  // ── Step 5: AI starter replacement ──
  result = replaceAiStarters(result);

  // ── Step 6: Deep restructuring — DISABLED (compounds with step 3, over-mutates) ──

  // ── Step 7: VERB_PHRASE_SWAPS — 100+ academic passive→active rewrites ──
  for (const [pattern, replacements] of Object.entries(VERB_PHRASE_SWAPS)) {
    const rx = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    if (rx.test(result)) {
      result = result.replace(rx, replacements[Math.floor(Math.random() * replacements.length)]);
    }
  }

  // ── Step 8: MODIFIER_SWAPS — "very important"→"key" etc. ──
  for (const [pattern, replacements] of Object.entries(MODIFIER_SWAPS)) {
    const rx = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    if (rx.test(result)) {
      result = result.replace(rx, replacements[Math.floor(Math.random() * replacements.length)]);
    }
  }

  // ── Step 9: CLAUSE_REPHRASINGS — "in relation to"→"about" etc. ──
  for (const [pattern, replacements] of Object.entries(CLAUSE_REPHRASINGS)) {
    const rx = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    if (rx.test(result)) {
      result = result.replace(rx, replacements[Math.floor(Math.random() * replacements.length)]);
    }
  }

  // ── Step 10: HEDGING_PHRASES — "it is possible that"→"possibly" etc. ──
  for (const [pattern, replacements] of Object.entries(HEDGING_PHRASES)) {
    const rx = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    if (rx.test(result)) {
      result = result.replace(rx, replacements[Math.floor(Math.random() * replacements.length)]);
    }
  }

  // ── Step 11: MEGA_SWAPS — TRANSITION, QUANTIFIER, TEMPORAL, CAUSAL, EMPHASIS ──
  const megaSwaps = [TRANSITION_SWAPS, QUANTIFIER_SWAPS, TEMPORAL_SWAPS, CAUSAL_SWAPS, EMPHASIS_SWAPS];
  for (const swapDict of megaSwaps) {
    for (const [pattern, replacements] of Object.entries(swapDict)) {
      const rx = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      if (rx.test(result)) {
        result = result.replace(rx, replacements[Math.floor(Math.random() * replacements.length)]);
      }
    }
  }

  // ── Step 12: Connector naturalization — single pass ──
  result = applyConnectorNaturalization(result);

  // ── Step 13: Syntactic template restructuring — 8% probability, ≥20 words, skip topic sentences ──
  if (!isFirstInParagraph && Math.random() < 0.08 && result.split(/\s+/).length >= 20) {
    const templated = applySyntacticTemplate(result);
    if (templated !== result && containsNonsenseWords(templated).length === 0) {
      result = templated;
    }
  }

  // ── Step 14: Voice shift ──
  const hasCommaHedge = /,\s+(?:in practice|admittedly|it seems|to some extent|rightly or wrongly|at least partly|in most cases|to be fair|to a degree|on the whole|broadly speaking|in theory|for the most part),/i.test(result);
  if (!hasCommaHedge && result.split(/\s+/).length >= 8 && result.split(/\s+/).length <= 30) {
    const shifted = voiceShift(result, Math.min(0.02 * intensity, 0.45));
    if (containsNonsenseWords(shifted).length === 0) result = shifted;
  }

  // ── Step 14b: Natural phrase variation (not just synonym swaps) ──
  // Sparingly rephrase common sentence constructions to increase diversity
  if (Math.random() < 0.15) {
    result = applyNaturalPhraseVariation(result);
  }

  // ── Step 15: Synonym replacement — single pass, reduced coverage (≈12%) ──
  result = synonymReplace(result, intensity * 0.5, usedWords, ctx?.protectedTerms);

  // ── Step 16: Large dictionary — disabled (creates crazy phrases) ──
  // applyLargeDictionary DISABLED — thesaurus swaps introduce unnatural vocabulary

  // ── Step 17: Additional clause restructuring — DISABLED (3rd pass, over-mutates) ──

  // ── Step 18: Formal starter replacement (not deletion — keep sentence coherent) ──
  const commaIdx = result.indexOf(",");
  if (commaIdx > 0 && commaIdx < 25) {
    const before = result.slice(0, commaIdx).trim().toLowerCase();
    const starterReplacements: Record<string, string> = {
      "moreover": "Also,",
      "furthermore": "Also,",
      "additionally": "Also,",
      "consequently": "As a result,",
      "subsequently": "Later,",
      "nevertheless": "Still,",
      "notwithstanding": "Still,",
      "accordingly": "So,",
      "henceforth": "From now on,",
      "conversely": "On the flip side,",
    };
    if (starterReplacements[before]) {
      result = starterReplacements[before] + result.slice(commaIdx + 1);
    }
  }

  // ── Step 19: Validate — reject if nonsense (fall back to original) ──
  if (containsNonsenseWords(result).length > 0 && containsNonsenseWords(originalSent).length === 0) {
    result = originalSent;
  }

  // ── Step 20: Kill modern buzzwords (but NOT a second full AI kill sweep) ──
  result = killModernBuzzwords(result);

  // ── Step 22: Contractions DISABLED — zero-tolerance policy for academic output ──

  // ── Step 23: Cleanup ──
  result = result.split(/\s+/).join(" ").trim();
  result = result.replace(/,\s*,/g, ",");
  result = result.replace(/\.\./g, ".");

  // ── Step 24: Capitalize first letter ──
  if (result && /^[a-z]/.test(result)) {
    result = result[0].toUpperCase() + result.slice(1);
  }

  // ── Step 25: Restore proper nouns ──
  if (properNouns && properNouns.size > 0) {
    for (const pn of properNouns) {
      const lower = pn.toLowerCase();
      if (lower !== pn) {
        result = result.replace(new RegExp(`\\b${lower}\\b`, 'g'), pn);
      }
    }
  }

  return result;
}

// ── Single-pass paragraph humanization (sentence-independent) ──
// Each sentence is processed as its own independent chunk.
// Paragraph structure is preserved; sentences are recombined after processing.

function humanizeParagraph(
    para: string, intensity: number, usedWords: Set<string>,
    ctx: TextContext | null, settings: HumanizeSettings, iteration: number,
    dict: HumanizerDictionary, commonWords: Set<string>, inputFeatures?: InputFeatures,
    properNouns?: Set<string>,
  ): string {
  const rawSentences = robustSentenceSplit(para);
  if (rawSentences.length === 0) return para;

  // Process each sentence independently as its own chunk
  const transformed: string[] = [];
  for (const rawSent of rawSentences) {
    const trimmed = rawSent.trim();
    if (!trimmed) continue;

    // Skip very short fragments (< 3 words) — pass through as-is
    if (trimmed.split(/\s+/).length < 3) {
      transformed.push(trimmed);
      continue;
    }

    let humanized = humanizeSingleSentence(
      trimmed, intensity, usedWords, ctx, settings,
      dict, commonWords, inputFeatures, properNouns,
    );
    if (humanized) {
      // Enforce 1-in=1-out: if the transformation accidentally created multiple sentences,
      // collapse them back into a single sentence by replacing internal sentence-ending
      // punctuation followed by a capital letter with a comma.
      const subSentences = robustSentenceSplit(humanized);
      if (subSentences.length > 1) {
        humanized = subSentences.map((s, i) => {
          if (i === 0) return s.replace(/[.!?]\s*$/, "");
          return s[0]?.toLowerCase() + s.slice(1);
        }).join(", ") + (subSentences[subSentences.length - 1].match(/[.!?]$/) ? "" : ".");
      }
      transformed.push(humanized);
    }
  }

  if (transformed.length === 0) return para;

  // Word budget: cap growth at 120% of input
  const inputWordCount = rawSentences.join(" ").split(/\s+/).length;
  const maxWordCount = Math.ceil(inputWordCount * 1.20);
  const currentWordCount = () => transformed.join(" ").split(/\s+/).length;

  // Phrasal verb expansion for shorter sentences (skip if over budget)
  if (currentWordCount() < maxWordCount) {
    // Apply per-sentence to maintain independence
    for (let i = 0; i < transformed.length; i++) {
      if (currentWordCount() >= maxWordCount) break;
      const expanded = expandWithPhrasalVerbs([transformed[i]], intensity);
      if (expanded[0]) transformed[i] = expanded[0];
    }
  }

  // Sentences were already fully processed independently in humanizeSingleSentence().
  // No cross-sentence operations — just use the transformed sentences directly.
  const varied = transformed;

  // Cleanup each sentence independently (proper nouns + contractions handled in humanizeSingleSentence)
  const cleaned = varied.map((s) => s.trim());

  let result = cleaned.join(" ");
  // Final cleanup on recombined paragraph
  result = cleanup(result, inputFeatures, properNouns);
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

    // Rephrase ~30% of end-of-sentence citations for natural variation
    const citationText = rephraseCitations(text);

    // Protect brackets, figures, percentages before any processing
    const { text: protectedText00, map: protectionMap } = protectSpecialContent(citationText);

    // Protect content terms (proper nouns, domain phrases) from synonym swaps
    const { text: protectedText0, map: termMap } = protectContentTerms(protectedText00);
    let protectedText = protectedText0;

    // Normalize single-newline-separated headings into double-newline-separated paragraphs
    // This ensures headers like "Part 1: Introduction\nBody text..." become separate paragraphs
    // Step 1: Known heading patterns
    protectedText = protectedText.replace(
      /^((?:#{1,6}\s.+|[IVXLCDM]+\.\s.+|(?:Part|Section|Chapter)\s+\d+.+|(?:Introduction|Conclusion|Summary|Abstract|Background|Discussion|Results|Methods)\s*))\n(?!\n)/gim,
      "$1\n\n"
    );
    // Step 2: Short non-punctuated lines (likely titles) followed by content
    // A line of ≤10 words that doesn't end in sentence punctuation (.!?) is likely a heading
    protectedText = protectedText.replace(
      /^([^\n]{1,80}[^.!?\n])\n(?!\n)(?=[A-Z])/gm,
      (match, line) => {
        const words = line.trim().split(/\s+/);
        if (words.length <= 10) return line + "\n\n";
        return match;
      }
    );

    // Detect input features — engine must NOT inject contractions, first-person, or
    // rhetorical questions unless the original input already contains them.
    const inputFeatures = detectInputFeatures(text);
    // Extract proper nouns from original text so cleanup() never lowercases them
    const properNouns = extractProperNouns(text);

  const settings = buildSettings({ stealth, strength, preserveSentences, strictMeaning, tone, mode });
  if (opts.targetScore != null) settings.targetScore = opts.targetScore;

  // Count input paragraphs AFTER heading normalization so the count
  // includes headings that were separated into their own paragraphs.
  const inputParagraphs = protectedText.split(/\n\s*\n/).filter((p) => p.trim());
  const inputParagraphCount = inputParagraphs.length;

  // Capture per-paragraph sentence counts for strict 1:1 enforcement
  // Use ORIGINAL text (before protection) to get accurate sentence counts
  const origParasForCount = text.trim().split(/\n\s*\n/).filter((p: string) => p.trim());
  const inputSentenceCountsPerPara = origParasForCount.map((p: string) => robustSentenceSplit(p.trim()).length);
  console.log(`  [GhostMini] inputSentenceCountsPerPara from original: ${JSON.stringify(inputSentenceCountsPerPara)}`);

  // Capture input sentence count for strict enforcement (input = output)
  const inputSentenceCount = countSentences(protectedText);

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
    // Intensity cap — raised for aggressive transformation
    let cap: number;
    if (mode === "ghost_pro") cap = ({ light: 8.0, medium: 13.0, strong: 18.0 } as Record<string, number>)[strength] ?? 8.0;
      else if (mode === "ghost_mini") cap = ({ light: 8.0, medium: 13.0, strong: 18.0 } as Record<string, number>)[strength] ?? 8.0;
      else if (stealth) cap = ({ light: 7.0, medium: 11.0, strong: 15.0 } as Record<string, number>)[strength] ?? 7.0;
      else cap = ({ light: 4.0, medium: 6.0, strong: 9.0 } as Record<string, number>)[strength] ?? 4.0;
    const intensity = Math.min(settings.baseIntensity + iteration * 0.45, cap);

    // Best-of-N pool strategy: always build on the best result, never restart from scratch
      let source: string;
      let usedWords: Set<string>;
      if (iteration === 0) {
        source = protectedText;
        usedWords = new Set();
      } else {
        source = bestResult;
        usedWords = new Set(usedWordsGlobal);
        // Reset used words periodically to prevent synonym exhaustion
        if (iteration % 5 === 0) usedWords = new Set();
      }

    // ── Paragraph-level processing architecture ──
    // Process each paragraph as a whole block (not sentence-by-sentence)
    // for natural cross-sentence context and varied transformation patterns.
    const paragraphs = source.split(/\n\s*\n/).filter((p) => p.trim());

    // Build paragraph-level items
    const chunkItems: { text: string; paraIdx: number; isTitle: boolean; chunkIdxInPara: number }[] = [];
    for (let pi = 0; pi < paragraphs.length; pi++) {
      const trimmedPara = paragraphs[pi].trim();
      if (isTitleOrHeading(trimmedPara)) {
        chunkItems.push({ text: trimmedPara, paraIdx: pi, isTitle: true, chunkIdxInPara: 0 });
        continue;
      }
      // Process the entire paragraph as one block
      chunkItems.push({ text: trimmedPara, paraIdx: pi, isTitle: false, chunkIdxInPara: 0 });
    }

    // Process each chunk through the full pipeline
    for (const item of chunkItems) {
      if (item.isTitle) continue; // titles pass through unchanged

      // Skip very short fragments (< 3 words) — pass through as-is
      if (item.text.split(/\s+/).length < 3) continue;

      const humanized = humanizeSingleSentence(
        item.text, intensity, usedWords, ctx, settings,
        dict, commonWords, inputFeatures, properNouns,
        item.chunkIdxInPara === 0, // isFirstInParagraph — skip heavy restructuring for topic sentences
      );
      if (humanized) {
        // Per-chunk phrasal verb expansion
        const expanded = expandWithPhrasalVerbs([humanized], intensity);
        let sent = expanded[0] || humanized;

        // Per-chunk AI vocabulary sweep
        sent = applyAIWordKill(sent);
        sent = applyPhrasePatterns(sent);
        sent = applyConnectorNaturalization(sent);
        sent = killModernBuzzwords(sent);
        sent = sent.replace(/ {2,}/g, " ").trim();
        if (sent && /^[a-z]/.test(sent)) sent = sent[0].toUpperCase() + sent.slice(1);

        // Ensure chunk ends with proper punctuation
        if (sent && !/[.!?]$/.test(sent.trim())) {
          sent = sent.trim() + ".";
        }

        item.text = sent;
      }
    }

    // Reassemble into paragraphs preserving original structure
    const processed: string[] = [];
    let curIdx = -1;
    let curSents: string[] = [];
    let curIsTitle = false;

    const flushParagraph = () => {
      if (curSents.length === 0) return;
      if (curIsTitle) {
        processed.push(curSents[0]);
      } else {
        let joined = curSents.join(" ");
        joined = cleanup(joined, inputFeatures, properNouns);
        if (joined.trim()) processed.push(joined);
      }
    };

    for (const item of chunkItems) {
      if (item.paraIdx !== curIdx) {
        flushParagraph();
        curIdx = item.paraIdx;
        curSents = [item.text];
        curIsTitle = item.isTitle;
      } else {
        curSents.push(item.text);
        if (!item.isTitle) curIsTitle = false;
      }
    }
    flushParagraph();

    let currentResult = processed.join("\n\n");
        // Contractions DISABLED — zero-tolerance policy for academic output

    if ((mode === "ghost_mini" || mode === "ghost_pro") && enablePostProcessing) {
      currentResult = postProcess(currentResult);
    }

    // Enforce paragraph count: input must match output
    currentResult = enforceParagraphCount(currentResult, inputParagraphCount);

    for (const w of usedWords) usedWordsGlobal.add(w);
      const changeRatio = wordChangeRatio(originalText, currentResult);

      // Semantic similarity check — reject outputs that drift too far from original meaning
      const semanticScore = semanticSimilaritySync(originalText, currentResult);
      const semanticThreshold = settings.strictMeaning ? 0.45 : 0.30;
      if (semanticScore < semanticThreshold) {
        // Output drifted too far — skip this iteration
        continue;
      }

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
            let fixed = applySignalFixes(bestResult, weak, intensity, usedWordsGlobal, ctx, settings, dict, commonWords, inputFeatures);
              // Contractions DISABLED — zero-tolerance policy for academic output
            fixed = cleanup(fixed, inputFeatures, properNouns);
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

  // Phase 2: extra signal-targeted passes — more aggressive
  if ((mode === "ghost_mini" || mode === "ghost_pro" || stealth) && settings.signalFixEnabled) {
    const extraMax = 3;
    let stallCount = 0;
    for (let ep = 0; ep < extraMax; ep++) {
      const analysis = detector.analyze(bestResult);
      const { passed } = checkDetectorTargets(analysis, mode ?? (stealth ? "stealth" : "default"));
      if (passed) break;

      const weak = identifyWeakSignals(analysis.signals);
      if (weak.length === 0) break;

      const p2Cap = ({ light: 7.0, medium: 11.0, strong: 15.0 } as Record<string, number>)[strength] ?? 7.0;
      const intensity = Math.min(3.0 + ep * 0.25, p2Cap);
        let fixed = applySignalFixes(bestResult, weak, intensity, usedWordsGlobal, ctx, settings, dict, commonWords, inputFeatures);
          // Contractions DISABLED — zero-tolerance policy for academic output
          fixed = cleanup(fixed, inputFeatures, properNouns);
          // deduplicateSentences DISABLED — would alter sentence count
      if (enablePostProcessing) fixed = postProcess(fixed);

      const { maxAiScore: fm } = checkDetectorTargets(detector.analyze(fixed), mode ?? (stealth ? "stealth" : "default"));
      if (fm < bestScore) { bestResult = fixed; bestScore = fm; stallCount = 0; }
      else stallCount++;
      if (stallCount >= 2) break;
    }
  }

  // Single-pass post-processing cleanup (postProcess now includes AI vocabulary killing)
  if (enablePostProcessing) {
    bestResult = postProcess(bestResult);
    bestResult = cleanup(bestResult, inputFeatures, properNouns);
    // deduplicateSentences DISABLED — would alter sentence count
  }

  // ── Phase X-1: Sentence Synonym Processor (light pass) ──
  // Reduced from 50% to ~15% replacement to preserve quality.
  bestResult = slidingWindowProcess(bestResult);

  // ── Phase X-2: Human Noise Injection ──
  // Introduces controlled human imperfections (5-12%): hedging asides,
  // emphasis modifiers, punctuation variation, slight phrasing asymmetry.
  // NOT errors — human-like irregularities.
  bestResult = humanNoiseInjection(bestResult);

  // Final paragraph count enforcement
  bestResult = enforceParagraphCount(bestResult, inputParagraphCount);

  // Final punctuation & capitalization cleanup
  bestResult = fixPunctuation(bestResult);

  // Merge/split DISABLED — strict sentence count enforcement: input = output

  // ── Strict sentence count enforcement ── DISABLED: 1-in=1-out is enforced per-sentence
  // bestResult = enforceSentenceCountStrict(bestResult, inputSentenceCount);

  // Restore protected content terms (proper nouns, domain phrases)
  bestResult = restoreContentTerms(bestResult, termMap);

  // Restore protected content (brackets, figures, percentages)
  bestResult = restoreSpecialContent(bestResult, protectionMap);

  // Final repetition cleanup — DISABLED: would alter sentence count (removes near-dupe sentences)
  // bestResult = cleanOutputRepetitions(bestResult);

  // ── STRICT 1:1 per-paragraph sentence count enforcement ──
  bestResult = enforcePerParagraphSentenceCounts(bestResult, inputSentenceCountsPerPara, "GhostMini");

  // ── Clean bad sentence starters (And, By, But, etc.) per paragraph ──
  {
    const paras = bestResult.split(/\n\s*\n/).filter(p => p.trim());
    bestResult = paras.map(p => {
      const sents = robustSentenceSplit(p.trim());
      return cleanSentenceStarters(sents).join(" ");
    }).join("\n\n");
  }

  // ── Post-humanize sentence verification ──
  const verification = verifySentencePresence(text, bestResult, robustSentenceSplit);
  if (!verification.verified) {
    console.warn(`  [GhostMini] Sentence verification: input=${verification.inputCount}, output=${verification.outputCount}`);
    if (verification.missingKeywords.length > 0) {
      console.warn(`  [GhostMini] Missing keywords: ${verification.missingKeywords.join(", ")}`);
    }
  }

  // ── Final quality cleanup (after ALL transforms including slidingWindowProcess) ──
  // Fix spaced-out hyphens in compound words: "game - changer" → "game-changer"
  bestResult = bestResult.replace(/(\w)\s+-\s+(\w)/g, "$1-$2");
  // Fix article agreement: "a" before vowel → "an"
  bestResult = bestResult.replace(/\b(a)\s+([aeiouAEIOU]\w*)/g, (match, article, word) => {
    if (/^(uni|use|usu|uter|one|once|eu)/i.test(word)) return match;
    return article === "A" ? "An " + word : "an " + word;
  });
  // Fix reverse: "an" before consonant → "a"
  bestResult = bestResult.replace(/\b(an)\s+([bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]\w*)/g, (match, article, word) => {
    if (/^(ho(?:ur|nest|nour|norab))/i.test(word)) return match;
    return article === "An" ? "A " + word : "a " + word;
  });
  // Fix double spaces
  bestResult = bestResult.replace(/ {2,}/g, " ");

  // Fix auxiliary + base verb form errors: "has create" → "has created", "have produce" → "have produced"
  bestResult = bestResult.replace(
    /\b(has|have|had)\s+(create|produce|generate|transform|establish|develop|evolve|emerge|become|arrive|achieve|contribute|demonstrate|integrate|incorporate|facilitate|utilize|enable|enhance|influence|trigger|spark|shape|alter|expand|improve|increase|raise|reduce|provide|indicate|require|involve|include|exclude|promote|migrate|operate|evaluate|analyze|accelerate|exacerbate|undermine|aggravate|form|yield|deliver|prompt|detect|diagnose|examine|observe|stimulate|illustrate)\b/gi,
    (match, aux, verb) => {
      const v = verb.toLowerCase();
      if (v.endsWith("e")) return aux + " " + verb + "d";
      return aux + " " + verb + "ed";
    }
  );

  return bestResult;
}

// ── Paragraph Count Enforcement ──

/**
 * Ensure output has the same number of paragraphs as the input.
 * If output has more paragraphs, merge the shortest adjacent ones.
 * If output has fewer paragraphs, split the longest one at a natural boundary.
 */
function enforceParagraphCount(text: string, targetCount: number): string {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  if (paragraphs.length === targetCount || targetCount <= 0) return text;

  // Too many paragraphs: merge shortest adjacent pairs
  while (paragraphs.length > targetCount && paragraphs.length > 1) {
    let minLen = Infinity;
    let mergeIdx = -1;
    for (let i = 0; i < paragraphs.length - 1; i++) {
      const combinedLen = paragraphs[i].split(/\s+/).length + paragraphs[i + 1].split(/\s+/).length;
      // Skip merging if either is a title/heading
      if (isTitleOrHeading(paragraphs[i]) || isTitleOrHeading(paragraphs[i + 1])) continue;
      if (combinedLen < minLen) {
        minLen = combinedLen;
        mergeIdx = i;
      }
    }
    // No valid merge candidates — all remaining pairs involve headings
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
    if (maxLen < 10) break; // nothing left to split meaningfully

    const sentences = robustSentenceSplit(paragraphs[splitIdx]);
    if (sentences.length < 2) break;

    const mid = Math.ceil(sentences.length / 2);
    const part1 = sentences.slice(0, mid).join(" ");
    const part2 = sentences.slice(mid).join(" ");
    paragraphs.splice(splitIdx, 1, part1, part2);
  }

  return paragraphs.join("\n\n");
}

// ── Text Chunking for Long Documents ──

const CHUNK_SIZE = 800; // words per chunk

/**
 * Process long documents by splitting into ~800-word chunks,
 * humanizing each independently, then stitching back together.
 * Prevents pattern drift and maintains consistency in long texts.
 */
export function humanizeWithChunking(
  text: string,
  opts: Parameters<typeof humanize>[1] = {},
): string {
  if (!text?.trim()) return text;

  const words = text.split(/\s+/);
  if (words.length <= CHUNK_SIZE * 1.2) {
    // Short enough to process as single block
    return humanize(text, opts);
  }

  // Split into chunks at paragraph boundaries
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWords = 0;

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).length;
    if (currentWords + paraWords > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n\n"));
      currentChunk = [para];
      currentWords = paraWords;
    } else {
      currentChunk.push(para);
      currentWords += paraWords;
    }
  }
  if (currentChunk.length > 0) chunks.push(currentChunk.join("\n\n"));

  // Humanize each chunk independently
  const processed = chunks.map(chunk => humanize(chunk, opts));

  return processed.join("\n\n");
}

// ── Writing Style Profile Matching ──

export interface WritingStyleProfile {
  avgSentenceLength: number;
  sentenceLengthStdDev: number;
  avgParagraphLength: number;
  contractionRate: number;
  firstPersonRate: number;
  questionRate: number;
  vocabularyLevel: "basic" | "intermediate" | "advanced";
}

/**
 * Extract a writing style fingerprint from a sample text.
 * Users can upload their own writing and the engine will match it.
 */
export function extractStyleProfile(sampleText: string): WritingStyleProfile {
  const sentences = robustSentenceSplit(sampleText);
  const words = sampleText.split(/\s+/).filter(Boolean);
  const totalWords = words.length;

  // Sentence length stats
  const sentLengths = sentences.map(s => s.split(/\s+/).length);
  const avgSentLen = sentLengths.length > 0
    ? sentLengths.reduce((a, b) => a + b, 0) / sentLengths.length
    : 15;
  const variance = sentLengths.reduce((s, l) => s + (l - avgSentLen) ** 2, 0) / Math.max(sentLengths.length, 1);
  const stdDev = Math.sqrt(variance);

  // Paragraph length
  const paragraphs = sampleText.split(/\n\s*\n/).filter(p => p.trim());
  const avgParaLen = paragraphs.length > 0
    ? paragraphs.reduce((s, p) => s + p.split(/\s+/).length, 0) / paragraphs.length
    : 50;

  // Contraction rate
  const contractionMatches = sampleText.match(/\b\w+'(t|s|re|ve|ll|d|m)\b/gi) ?? [];
  const contractionRate = totalWords > 0 ? contractionMatches.length / totalWords : 0;

  // First person rate
  const firstPersonWords = words.filter(w => /^(i|me|my|mine|myself|we|us|our|ours)$/i.test(w));
  const firstPersonRate = totalWords > 0 ? firstPersonWords.length / totalWords : 0;

  // Question rate
  const questionSents = sentences.filter(s => s.trim().endsWith("?"));
  const questionRate = sentences.length > 0 ? questionSents.length / sentences.length : 0;

  // Vocabulary level
  const longWords = words.filter(w => w.length > 8);
  const longWordRate = totalWords > 0 ? longWords.length / totalWords : 0;
  const vocabularyLevel = longWordRate > 0.15 ? "advanced" : longWordRate > 0.08 ? "intermediate" : "basic";

  return {
    avgSentenceLength: avgSentLen,
    sentenceLengthStdDev: stdDev,
    avgParagraphLength: avgParaLen,
    contractionRate,
    firstPersonRate,
    questionRate,
    vocabularyLevel,
  };
}

/**
 * Apply a writing style profile to humanized text to make it match
 * the user's personal writing patterns.
 */
export function applyStyleProfile(text: string, profile: WritingStyleProfile, inputFeatures?: InputFeatures): string {
    let result = text;

    // Contractions DISABLED — zero-tolerance policy for academic output

    // Match first person usage — only if original input already used first-person
    if (profile.firstPersonRate > 0.01 && inputFeatures?.hasFirstPerson) {
      const sentences = robustSentenceSplit(result);
      const enhanced = sentences.map((sent, i) => {
        if (i > 0 && i % 5 === 0 && Math.random() < profile.firstPersonRate * 10) {
          const inserts = ["We find that ", "In our view, ", "We note that "];
          return inserts[Math.floor(Math.random() * inserts.length)] + safeDowncaseFirst(sent);
        }
        return sent;
      });
      const paragraphs = result.split(/\n\s*\n/);
      if (paragraphs.length === 1) {
        result = enhanced.join(" ");
      }
    }

    // Strip unicode replacement characters (U+FFFD) that leak from encoding issues
    result = result.replace(/\ufffd/g, "");

    return result;
  }

// ── Real Detector API Validation Hooks ──

export interface DetectorAPIConfig {
  gptzeroApiKey?: string;
  originalityApiKey?: string;
  copyleaksApiKey?: string;
}

/**
 * Validate humanized output against real detector APIs.
 * Returns actual detection scores from external services.
 * Only called when API keys are provided (optional feature).
 */
export async function validateWithRealDetectors(
  text: string,
  config: DetectorAPIConfig,
): Promise<Record<string, number>> {
  const scores: Record<string, number> = {};

  // GPTZero API
  if (config.gptzeroApiKey) {
    try {
      const response = await fetch("https://api.gptzero.me/v2/predict/text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.gptzeroApiKey,
        },
        body: JSON.stringify({ document: text }),
      });
      if (response.ok) {
        const data = await response.json() as any;
        scores.gptzero = (data.documents?.[0]?.completely_generated_prob ?? 0) * 100;
      }
    } catch { /* skip */ }
  }

  // Originality.ai API
  if (config.originalityApiKey) {
    try {
      const response = await fetch("https://api.originality.ai/api/v1/scan/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.originalityApiKey}`,
        },
        body: JSON.stringify({ content: text }),
      });
      if (response.ok) {
        const data = await response.json() as any;
        scores.originality = (data.score?.ai ?? 0) * 100;
      }
    } catch { /* skip */ }
  }

  return scores;
}

// ── Dynamic Blacklist System ──

const dynamicBlacklist = new Set<string>();

/**
 * Add words to the dynamic blacklist at runtime.
 * These words will be avoided in synonym replacement.
 * Useful for responding to new detector patterns.
 */
export function addToBlacklist(words: string[]): void {
  for (const w of words) {
    dynamicBlacklist.add(w.toLowerCase());
  }
}

/**
 * Get the current dynamic blacklist.
 */
export function getBlacklist(): Set<string> {
  return new Set([...DICT_BLACKLIST, ...dynamicBlacklist]);
}

/**
 * Check if a word is blacklisted (static + dynamic).
 */
export function isBlacklisted(word: string): boolean {
  const lower = word.toLowerCase();
  return DICT_BLACKLIST.has(lower) || dynamicBlacklist.has(lower);
}
