/**
 * Advanced Transforms — ported from advanced_transforms.py
 * Voice shifts, deep restructuring, sentence splitting/merging.
 * Uses compromise.js instead of spaCy for dependency parsing.
 */

import nlp from "compromise";
import * as rules from "./rules";
import { sentTokenize } from "./utils";

// ── Irregular past participles ──

const IRREGULAR_PP: Record<string, string> = {
  "give": "given", "take": "taken", "make": "made", "do": "done",
  "see": "seen", "write": "written", "know": "known", "show": "shown",
  "find": "found", "get": "gotten", "bring": "brought", "think": "thought",
  "tell": "told", "say": "said", "keep": "kept", "leave": "left",
  "feel": "felt", "put": "put", "run": "run", "read": "read",
  "grow": "grown", "draw": "drawn", "break": "broken", "speak": "spoken",
  "choose": "chosen", "drive": "driven", "eat": "eaten", "fall": "fallen",
  "fly": "flown", "forget": "forgotten", "hide": "hidden", "ride": "ridden",
  "rise": "risen", "shake": "shaken", "steal": "stolen", "swim": "swum",
  "throw": "thrown", "wake": "woken", "wear": "worn", "begin": "begun",
  "hold": "held", "lead": "led", "lose": "lost", "build": "built",
  "send": "sent", "spend": "spent", "stand": "stood", "understand": "understood",
  "win": "won", "pay": "paid", "set": "set", "cut": "cut",
  "hit": "hit", "let": "let", "shut": "shut", "spread": "spread",
  "go": "gone", "buy": "bought", "catch": "caught", "teach": "taught",
  "sell": "sold", "swear": "sworn", "freeze": "frozen",
  "tear": "torn", "bear": "borne", "bite": "bitten", "blow": "blown",
  "drink": "drunk", "forgive": "forgiven", "lay": "laid", "lend": "lent",
  "mean": "meant", "meet": "met", "prove": "proven", "sing": "sung",
  "sit": "sat", "sleep": "slept", "stick": "stuck", "strike": "struck",
  "feed": "fed", "fight": "fought", "hurt": "hurt", "seek": "sought",
  "bind": "bound", "dig": "dug", "hang": "hung", "light": "lit",
  "sew": "sewn", "spin": "spun", "split": "split", "spring": "sprung",
  // Multi-syllable verbs with final-syllable stress (MUST double)
  "permit": "permitted", "commit": "committed", "submit": "submitted",
  "admit": "admitted", "emit": "emitted", "omit": "omitted",
  "transmit": "transmitted", "occur": "occurred", "prefer": "preferred",
  "refer": "referred", "transfer": "transferred", "confer": "conferred",
  "defer": "deferred", "infer": "inferred", "deter": "deterred",
  "recur": "recurred", "incur": "incurred", "compel": "compelled",
  "excel": "excelled", "impel": "impelled", "propel": "propelled",
  "control": "controlled", "patrol": "patrolled", "equip": "equipped",
  // Common verbs that do NOT double (first-syllable stress)
  "alter": "altered", "offer": "offered", "suffer": "suffered",
  "differ": "differed", "enter": "entered", "gather": "gathered",
  "foster": "fostered", "trigger": "triggered", "deliver": "delivered",
  "consider": "considered", "discover": "discovered", "remember": "remembered",
  "empower": "empowered", "encounter": "encountered", "develop": "developed",
  "heighten": "heightened", "sharpen": "sharpened", "strengthen": "strengthened",
  "broaden": "broadened", "widen": "widened", "deepen": "deepened",
  "lighten": "lightened", "darken": "darkened", "frighten": "frightened",
  "flatten": "flattened", "fasten": "fastened", "hasten": "hastened",
  "lessen": "lessened", "worsen": "worsened", "loosen": "loosened",
};

// Verbs that cannot be passivized
const NO_PASSIVE = new Set([
  "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "having",
  // Modal verbs — never passivize
  "will", "would", "shall", "should", "can", "could", "may", "might", "must",
  "seem", "appear", "become", "remain", "exist", "occur",
  "happen", "belong", "consist", "depend", "matter",
  "arrive", "come", "go", "die", "live", "sleep", "stay",
  "emerge", "arise", "fall", "rise", "sit", "stand",
  "agree", "disagree", "laugh", "cry", "smile",
]);

// Nouns commonly misidentified as verbs by compromise.js — never passivize
const NOT_VERBS = new Set([
  "reduction", "indication", "awareness", "performance", "importance",
  "influence", "experience", "evidence", "resistance", "intelligence",
  "competence", "confidence", "preference", "reference", "difference",
  "significance", "consequence", "presence", "absence", "existence",
  "occurrence", "appearance", "maintenance", "guidance", "reliance",
  "compliance", "assistance", "insurance", "endurance", "tolerance",
  "excellence", "dependence", "independence", "correspondence",
  "instance", "substance", "distance", "circumstance", "governance",
  "acceptance", "attendance", "relevance", "dominance", "abundance",
  "observance", "allegiance", "perseverance", "temperance",
  "foundation", "motivation", "organization", "communication",
  "information", "education", "situation", "population", "generation",
  "evaluation", "administration", "application", "investigation",
  "interpretation", "implementation", "transformation", "participation",
  "interaction", "collaboration", "association", "conversation",
  "leadership", "relationship", "partnership", "membership", "ownership",
  "scholarship", "citizenship", "championship", "fellowship",
  "environment", "management", "development", "assessment", "achievement",
  "engagement", "requirement", "improvement", "involvement", "statement",
  "treatment", "adjustment", "commitment", "department", "employment",
  "framework", "network", "feedback", "outcome", "overview", "approach",
  // Gerunds/present participles — never passivize
  "dealing", "dealing", "building", "working", "making", "taking",
  "getting", "having", "using", "leading", "providing",
]);

// Generic agent nouns to omit in passive
const GENERIC_AGENTS = new Set([
  "people", "researchers", "scientists", "scholars", "experts",
  "analysts", "observers", "critics", "studies", "reports",
  "authors", "individuals", "organizations", "institutions",
  "governments", "authorities", "policymakers",
]);

// ── Active to Passive ──

export function activeToPassive(sentence: string): string {
  // Use compromise for basic sentence parsing
  const doc = nlp(sentence);
  const verbs = doc.verbs();

  if (verbs.length === 0) return sentence;

  // Try a simple SVO → OVS passive transform using compromise
  const subjects = doc.match("#Noun+ #Verb").match("#Noun+");
  const mainVerb = verbs.first();

  if (!subjects || !mainVerb) return sentence;

  const subjectText = subjects.text().trim();
  const verbText = mainVerb.text().trim();

  // Check if verb is passivizable
  const verbLower = verbText.toLowerCase().split(/\s+/)[0];
  if (NO_PASSIVE.has(verbLower)) return sentence;
  // Reject nouns misidentified as verbs by compromise.js
  if (NOT_VERBS.has(verbLower)) return sentence;
  // Never passivize gerunds/present participles (-ing words)
  if (verbLower.endsWith("ing")) return sentence;

  // Strip 3rd-person singular "s" to get base verb form
  let verbBase = verbLower;
  if (verbBase.endsWith("ies")) verbBase = verbBase.slice(0, -3) + "y";
  else if (verbBase.endsWith("ses") || verbBase.endsWith("zes") || verbBase.endsWith("xes") || verbBase.endsWith("ches") || verbBase.endsWith("shes")) verbBase = verbBase.slice(0, -2);
  else if (verbBase.endsWith("s") && !verbBase.endsWith("ss")) verbBase = verbBase.slice(0, -1);

  // Get past participle
  const pp = IRREGULAR_PP[verbBase] ?? IRREGULAR_PP[verbLower] ?? (verbBase.endsWith("e") ? verbBase + "d" : verbBase + "ed");

  // Validate past participle — reject nonsense forms:
  // Words ending in -tioned, -nced + ed, -mented etc. are likely misidentified nouns
  if (/(?:tion|sion|ment|ness|ance|ence|ship|ment)ed$/i.test(pp)) return sentence;

  // Find the object (text after the verb)
  const verbIdx = sentence.toLowerCase().indexOf(verbText.toLowerCase());
  if (verbIdx < 0) return sentence;

  const beforeVerb = sentence.slice(0, verbIdx).trim();
  const afterVerb = sentence.slice(verbIdx + verbText.length).trim();

  if (!afterVerb || afterVerb.split(/\s+/).length < 2) return sentence;

  // Determine auxiliary based on subject
  const subjectLower = subjectText.toLowerCase();
  const isPlural = subjectLower.endsWith("s") || ["they", "we", "people"].includes(subjectLower);
  const aux = isPlural ? "are" : "is";

  // Build passive: Object + aux + PP + by + Subject
  const objectText = afterVerb.replace(/\.$/, "");
  // Convert subject pronouns to object form for "by" clause
  const SUBJ_TO_OBJ: Record<string, string> = {
    "she": "her", "he": "him", "i": "me", "they": "them",
    "we": "us", "who": "whom", "it": "it",
  };
  const agentText = SUBJ_TO_OBJ[subjectLower] ?? subjectText.toLowerCase();
  const agent = GENERIC_AGENTS.has(subjectLower) ? "" : ` by ${agentText}`;

  let passive = `${objectText} ${aux} ${pp}${agent}`;
  // Capitalize first word
  passive = passive[0].toUpperCase() + passive.slice(1);
  if (sentence.endsWith(".")) passive += ".";

  return passive;
}

// ── Passive to Active ──

export function passiveToActive(sentence: string): string {
  // Match passive pattern: X is/are/was/were PP (by Y)
  const passiveMatch = sentence.match(
    /^(.+?)\s+(is|are|was|were)\s+(\w+(?:ed|en|wn|lt|nt|pt|ht|ght|ck|ng|un|ut|st))\s+(?:by\s+(.+?))?[.]?$/i,
  );
  if (!passiveMatch) return sentence;

  const [, subject, , , agent] = passiveMatch;
  if (!agent) return sentence; // Can't reconstruct active without agent

  // This is error-prone; return original to avoid corruption
  return sentence;
}

// ── Voice shift (probabilistic) ──

export function voiceShift(sentence: string, probability: number = 0.30): string {
  if (Math.random() > probability) return sentence;
  if (sentence.split(/\s+/).length < 8) return sentence;

  // Only do active → passive (passive → active is too error-prone)
  // Check if already passive
  if (/\b(is|are|was|were|been)\s+\w+(ed|en)\b/i.test(sentence)) {
    return sentence;
  }

  return activeToPassive(sentence);
}

// ── Deep restructure ──

function frontAdverbial(sentence: string): string {
  // Move a trailing prepositional phrase to the front
  // Require whitespace before preposition to prevent splitting words (e.g. "somewhat" → "somewh, at")
  const match = sentence.match(/^(.+?)(,?\s+\b(?:in|at|by|with|through|during|after|before)\b\s+.+?)([.!?])$/i);
  if (!match) return sentence;
  const [, main, pp, punct] = match;
  // Make sure the PP is substantial
  if (pp.trim().split(/\s+/).length < 3) return sentence;
  const cleanPP = pp.replace(/^,\s*/, "");
  const capitalPP = cleanPP[0].toUpperCase() + cleanPP.slice(1);
  const lowerMain = main[0].toLowerCase() + main.slice(1);
  return `${capitalPP}, ${lowerMain}${punct}`;
}

function clauseSwap(sentence: string, intensity: number): string {
  if (Math.random() > rules.CLAUSE_SWAP_RATE * intensity) return sentence;

  // Don't swap in sentences with 3+ commas (likely lists)
  const commaCount = (sentence.match(/,/g) || []).length;
  if (commaCount >= 3) return sentence;

  const CLAUSE_VERBS = /\b(?:is|are|was|were|has|have|had|does|do|did|will|would|can|could|should|may|might|must|seems?|appears?|involves?|requires?|suggests?|shows?|provides?|leads?|plays?|helps?|makes?)\b/i;

  const conjunctions = [", and ", ", but ", ", yet ", ", so "];
  for (const conj of conjunctions) {
    const idx = sentence.indexOf(conj);
    if (idx > 0 && idx < sentence.length - conj.length - 5) {
      const part1 = sentence.slice(0, idx);
      const part2 = sentence.slice(idx + conj.length);
      if (part1.split(/\s+/).length >= 4 && part2.split(/\s+/).length >= 4
        && CLAUSE_VERBS.test(part1) && CLAUSE_VERBS.test(part2)) {
        const cap2 = part2[0].toUpperCase() + part2.slice(1);
        const lower1 = part1[0].toLowerCase() + part1.slice(1);
        return cap2.replace(/\.$/, "") + conj + lower1 + (sentence.endsWith(".") ? "." : "");
      }
    }
  }
  return sentence;
}

export function deepRestructure(sentence: string, intensity: number = 1.0): string {
  let result = sentence;

  // More aggressive fronting of adverbials
  if (Math.random() < 0.5 * intensity) {
    result = frontAdverbial(result);
  }

  // Try clause swap with boosted intensity
  result = clauseSwap(result, intensity * 1.3);

  return result;
}

// ── Merge short sentences ──

const MERGE_CONNECTORS = [
  ", and ", ", which ", ", notably ", ", particularly ", ", especially ",
  ", although ", ", while ", ", since ", ", as ",
];

export function mergeShortSentences(sent1: string, sent2: string): string {
  const clean1 = sent1.replace(/\.$/, "");
  const lower2 = sent2[0].toLowerCase() + sent2.slice(1);
  const connector = MERGE_CONNECTORS[Math.floor(Math.random() * MERGE_CONNECTORS.length)];
  return clean1 + connector + lower2;
}

// ── First person detection ──

export function hasFirstPerson(text: string): boolean {
  const markers = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/;
  return markers.test(text);
}

// ── Expand contractions ──

const CONTRACTION_MAP: Record<string, string> = {
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
  "they'd": "they would", "we'd": "we would", "you'd": "you would",
  "i'd": "I would", "he'd": "he would", "she'd": "she would",
};

const CONTRACTION_RE = new RegExp(
  "\\b(" + Object.keys(CONTRACTION_MAP).map((k) => k.replace("'", "'")).join("|") + ")\\b",
  "gi",
);

export function expandContractions(text: string): string {
  return text.replace(CONTRACTION_RE, (match) => {
    const expanded = CONTRACTION_MAP[match.toLowerCase()] ?? match;
    if (match[0] === match[0].toUpperCase() && expanded[0] === expanded[0].toLowerCase()) {
      return expanded[0].toUpperCase() + expanded.slice(1);
    }
    return expanded;
  });
}
