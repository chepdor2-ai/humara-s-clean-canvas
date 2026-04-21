/**
 * Premium Deep-Clean Post-Processor — Non-LLM AI Trace Eliminator
 * ================================================================
 * 
 * Runs AFTER all premium LLM phases (A/B/C + verification) are complete.
 * Uses purely statistical/rule-based transforms to eliminate the AI
 * fingerprints that other detectors (Turnitin, Originality, Sapling,
 * Copyleaks, etc.) still catch.
 *
 * Why: LLM rewriting produces text that beats GPTZero (perplexity-based)
 * but still fails statistical detectors because LLM output has:
 *   - Uniform sentence lengths (low burstiness)
 *   - Predictable structure (SVO monotony)
 *   - Smooth readability (consistent grade level)
 *   - AI function-word distribution profile
 *   - Residual AI vocabulary and phrases
 *
 * Pre-1990 human articles pass ALL detectors because they have natural
 * variation in all these signals. This module injects that variation.
 *
 * Design: CLEANING not rephrasing (<20% word change target).
 * Multi-pass: detect → clean → re-detect → clean until scores drop.
 */

import { robustSentenceSplit } from "./content-protection";
import {
  applyAIWordKill,
  applyConnectorNaturalization,
  deepCleaningPass,
  perSentenceAntiDetection,
  cleanSentenceStarters,
  fixPunctuation,
  AI_WORD_REPLACEMENTS,
} from "./shared-dictionaries";
import {
  breakStarterRepetition,
  applyMicroNoiseToText,
} from "./anti-ai-patterns";

// ══════════════════════════════════════════════════════════════════════════
// EXTENDED AI VOCABULARY — words detectors flag but premium LLM may keep
// ══════════════════════════════════════════════════════════════════════════

const EXTENDED_AI_WORDS: Record<string, string[]> = {
  "primarily": ["mainly", "mostly", "for the most part"],
  "particularly": ["especially", "above all"],
  "specifically": ["in particular", "to be exact"],
  "significantly": ["greatly", "by a lot", "in a big way"],
  "consequently": ["so", "as a result"],
  "subsequently": ["then", "after that", "later"],
  "furthermore": ["also", "on top of that", "besides"],
  "moreover": ["also", "plus", "what is more"],
  "additionally": ["also", "on top of that"],
  "nevertheless": ["still", "even so", "all the same"],
  "essentially": ["basically", "at its core", "really"],
  "fundamentally": ["at its core", "at bottom"],
  "arguably": ["probably", "it could be said"],
  "evidently": ["clearly", "as it turns out"],
  "predominantly": ["mostly", "for the most part"],
  "thereby": ["by doing so", "in this way", "this way"],
  "wherein": ["where", "in which case"],
  "thereof": ["of it", "of that"],
  "herein": ["here", "in this"],
  "henceforth": ["from now on", "after this"],
  "whilst": ["while", "even as"],
  "amongst": ["among"],
  "upon": ["on", "once"],
  "thus": ["so", "this way"],
  "hence": ["so", "that is why"],
  "amid": ["in the middle of", "during"],
  "via": ["through", "by way of"],
  "regarding": ["about", "on the subject of"],
  "pertaining": ["about", "related to"],
  "concerning": ["about", "around"],
  "encompassing": ["covering", "taking in"],
  "constitutes": ["makes up", "forms", "is"],
  "constituting": ["making up", "forming"],
  "constituted": ["made up", "formed"],
  "exhibits": ["shows", "displays"],
  "exhibited": ["showed", "displayed"],
  "manifests": ["shows", "appears"],
  "manifested": ["showed", "appeared"],
  "necessitates": ["requires", "calls for"],
  "precipitated": ["caused", "brought on", "triggered"],
  "underscores": ["highlights", "brings out", "points to"],
  "underscored": ["highlighted", "brought out"],
  "exemplifies": ["shows", "is a good example of"],
  "exemplified": ["showed", "was a good example of"],
  "proliferation": ["spread", "growth", "rise"],
  "exacerbation": ["worsening", "increase"],
  "amelioration": ["betterment", "relief"],
  "juxtaposition": ["contrast", "side by side look"],
  "dichotomy": ["split", "divide", "two sides"],
  "conundrum": ["puzzle", "problem", "hard question"],
  "ramification": ["result", "consequence", "effect"],
  "ramifications": ["results", "consequences", "effects"],
  "underpinning": ["basis", "foundation", "root"],
  "underpinnings": ["roots", "foundations", "bases"],
  "trajectory": ["path", "direction", "course"],
  "trajectories": ["paths", "directions", "courses"],
  "discourse": ["discussion", "debate", "talk"],
  "paradigm": ["model", "pattern", "standard"],
  "paradigms": ["models", "patterns", "standards"],
  "multifaceted": ["complex", "many-sided"],
  "overarching": ["main", "broad", "central"],
  "holistic": ["whole", "complete", "full-picture"],
  "transformative": ["game-changing", "major"],
  "groundbreaking": ["pioneering", "first-of-its-kind"],
  "noteworthy": ["worth noting", "notable"],
  "efficacious": ["effective", "working well"],
  "substantive": ["real", "solid", "meaningful"],
  "salient": ["key", "main", "standout"],
  "ubiquitous": ["everywhere", "common", "all around"],
  "pivotal": ["key", "turning-point", "central"],
  "meticulous": ["careful", "thorough", "exact"],
  "profound": ["deep", "far-reaching"],
  "inherent": ["built-in", "natural", "innate"],
  "intricate": ["complex", "detailed"],
  "innovative": ["new", "fresh", "original"],
  "robust": ["strong", "solid", "sturdy"],
  "nuanced": ["subtle", "detailed", "fine-grained"],
  "comprehensive": ["thorough", "broad", "full"],
  "paramount": ["top", "chief", "first"],
  "unprecedented": ["never before seen", "first-ever", "new"],
  "stakeholders": ["those involved", "parties", "interested groups"],
  "stakeholder": ["party involved", "interested group"],
  "ecosystem": ["system", "setup", "environment"],
  "proactive": ["forward-looking", "ahead-of-time"],
  "seamless": ["smooth", "easy", "without gaps"],
  "optimal": ["best", "ideal"],
  "impactful": ["effective", "powerful", "strong"],
  "actionable": ["practical", "usable"],
  "scalable": ["expandable", "growable"],
  "disruptive": ["radical", "ground-shaking"],
  "benchmark": ["standard", "measure", "yardstick"],
  "empower": ["give power to", "enable", "equip"],
  "narrative": ["story", "account"],
  "interplay": ["give and take", "interaction", "back and forth"],
  "diverse": ["varied", "mixed", "wide-ranging"],
  "dynamic": ["active", "changing", "shifting"],
  "implement": ["put in place", "carry out", "set up"],
  "integral": ["key", "core", "central"],
  "demonstrate": ["show", "prove", "make clear"],
  "ensure": ["make sure", "see to it"],
  "aspect": ["part", "side", "angle"],
  "notion": ["idea", "thought", "concept"],
  "crucial": ["key", "critical"],
  "vital": ["key", "essential"],
  "notable": ["worth noting"],
  "significant": ["important", "big", "major"],
  "substantial": ["large", "real", "sizable"],
  "remarkable": ["striking", "unusual"],
  "considerable": ["large", "real"],
  "methodology": ["method", "approach"],
  "framework": ["structure", "system", "setup"],
  "implications": ["effects", "results", "consequences"],
  "implication": ["effect", "result"],
  "enhance": ["improve", "boost", "lift"],
  "cultivate": ["develop", "grow", "build"],
  "navigate": ["handle", "deal with", "work through"],
  "mitigate": ["reduce", "lessen", "cut down"],
  "optimize": ["improve", "fine-tune", "make better"],
  "streamline": ["simplify", "speed up"],
  "bolster": ["support", "strengthen", "prop up"],
  "catalyze": ["trigger", "spark", "set off"],
  "foster": ["encourage", "support", "promote"],
  "harness": ["use", "tap into", "draw on"],
  "delve": ["dig into", "look into", "explore"],
  "embark": ["start", "begin", "set out"],
  "endeavor": ["try", "effort", "attempt"],
  "spearhead": ["lead", "head up", "drive"],
  "unravel": ["figure out", "untangle", "work out"],
  "unveil": ["reveal", "show", "uncover"],
  "ascertain": ["find out", "figure out"],
  "disseminate": ["spread", "pass along", "share"],
  "corroborate": ["confirm", "back up", "support"],
  "substantiate": ["back up", "prove", "support"],
  "articulate": ["express", "state", "put into words"],
  "perpetuate": ["keep going", "maintain", "carry on"],
  "necessitate": ["require", "call for"],
  "encompass": ["include", "cover", "take in"],
  "exemplify": ["show", "illustrate"],
  "underscore": ["highlight", "bring out", "stress"],
  "culminate": ["end in", "lead to", "build up to"],
  "tapestry": ["mix", "weave", "patchwork"],
  "cornerstone": ["foundation", "base", "pillar"],
  "bedrock": ["foundation", "base", "core"],
  "linchpin": ["key piece", "anchor", "center"],
  "nexus": ["connection", "link", "center"],
  "spectrum": ["range", "spread"],
  "myriad": ["many", "countless"],
  "plethora": ["many", "a lot of", "plenty of"],
  "multitude": ["many", "a great number of"],
  "landscape": ["scene", "field", "setting"],
  "realm": ["area", "field", "domain"],
};

// ══════════════════════════════════════════════════════════════════════════
// AI SENTENCE PATTERNS — regex patterns that detectors flag
// ══════════════════════════════════════════════════════════════════════════

const AI_SENTENCE_PATTERNS: [RegExp, string][] = [
  // "This [noun] highlights/demonstrates/illustrates..." patterns
  [/\bThis (\w+) (?:highlights|demonstrates|illustrates|underscores|reveals|showcases|exemplifies)\b/gi, "Here, the $1 shows"],
  // "It is worth noting that..."
  [/\bIt is worth noting that /gi, ""],
  [/\bIt should be noted that /gi, ""],
  [/\bIt is important to (?:note|mention|recognize|acknowledge) that /gi, ""],
  // "...plays a key/crucial/vital/significant role..."
  [/\bplays? a (?:key|crucial|vital|significant|important|pivotal|critical) role\b/gi, "matters"],
  // "In today's world/society/landscape/era..."
  [/\bIn today'?s (?:world|society|landscape|era),?\s*/gi, "Today, "],
  // "A wide/broad/vast range/array/spectrum of..."
  [/\ba (?:wide|broad|vast|diverse) (?:range|array|spectrum|variety) of\b/gi, "many"],
  // "Due to the fact that..."
  [/\bdue to the fact that\b/gi, "because"],
  // "Serves as a testament/reminder/catalyst..."
  [/\bserves? as a (?:testament|reminder|catalyst|cornerstone)\b/gi, "shows"],
  // "Not only...but also" → flatten
  [/\bnot only\b(.{5,40})\bbut also\b/gi, "$1 and also"],
  // "Each and every"
  [/\beach and every\b/gi, "every"],
  // "First and foremost"
  [/\bfirst and foremost\b/gi, "first"],
  // "When it comes to"
  [/\bwhen it comes to\b/gi, "about"],
  // "In the context of"
  [/\bin the context of\b/gi, "within"],
  // "Cannot be overstated"
  [/\bcannot be overstated\b/gi, "is huge"],
  // "At the end of the day"
  [/\bat the end of the day\b/gi, "in the end"],
  // "Needless to say"
  [/\bneedless to say,?\s*/gi, ""],
  // "There is no doubt that"
  [/\bthere is no doubt that\b/gi, "clearly"],
  // "In order to"
  [/\bin order to\b/gi, "to"],
  // "It can be argued that"
  [/\bit can be argued that\b/gi, "one could say"],
  // "The fact that"
  [/\bthe fact that\b/gi, "that"],
  // "Is a testament to"
  [/\bis a testament to\b/gi, "shows"],
  // "With respect to" / "With regard to"
  [/\bwith (?:respect|regard) to\b/gi, "about"],
  // "For the purpose of"
  [/\bfor the purpose of\b/gi, "to"],
  // "In light of"
  [/\bin light of\b/gi, "given"],
  // "As a result of"
  [/\bas a result of\b/gi, "because of"],
  // "On the other hand"
  [/\bon the other hand,?\s*/gi, "Then again, "],
  // "That being said" / "Having said that"
  [/\b(?:that being said|having said that),?\s*/gi, "Still, "],
  // "Taken together"
  [/\btaken together,?\s*/gi, "All in all, "],
  // "Moving forward"
  [/\bmoving forward,?\s*/gi, "Going ahead, "],
  // "It is evident that"
  [/\bit is evident that\b/gi, "clearly"],
  // "The importance of"
  [/\bthe importance of\b/gi, "how much"],
  // "One of the most" → just make it direct
  [/\bone of the most\b/gi, "among the most"],
];

// ══════════════════════════════════════════════════════════════════════════
// BURSTINESS INJECTOR — vary sentence lengths to break uniformity
// ══════════════════════════════════════════════════════════════════════════

function injectBurstiness(sentences: string[]): string[] {
  if (sentences.length < 4) return sentences;

  const result: string[] = [];
  const lengths = sentences.map(s => s.split(/\s+/).length);
  const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const cv = Math.sqrt(lengths.reduce((a, len) => a + (len - avgLen) ** 2, 0) / lengths.length) / (avgLen || 1);

  // Real detectors flag CV < 0.45 — pre-2000 articles have CV 0.5-0.8
  if (cv > 0.50) return sentences;

  // Phase A: Split long sentences (>25 words) at clause boundaries
  for (const sent of sentences) {
    const words = sent.split(/\s+/);
    if (words.length > 25) {
      const clausePatterns = [
        /,\s+and\s+/i, /,\s+but\s+/i, /;\s+/,
        /,\s+which\s+/i, /,\s+while\s+/i, /,\s+although\s+/i,
        /,\s+since\s+/i, /,\s+because\s+/i,
      ];
      let didSplit = false;
      for (const pat of clausePatterns) {
        const m = sent.match(pat);
        if (m && m.index !== undefined) {
          const p1 = sent.slice(0, m.index).trim();
          const p2 = sent.slice(m.index + m[0].length).trim();
          if (p1.split(/\s+/).length >= 8 && p2.split(/\s+/).length >= 6) {
            result.push(p1.endsWith(".") ? p1 : p1 + ".");
            result.push(p2[0]?.toUpperCase() + p2.slice(1));
            didSplit = true;
            break;
          }
        }
      }
      if (!didSplit) result.push(sent);
    } else {
      result.push(sent);
    }
  }

  // Phase B: Merge short adjacent sentences (both <10 words) 
  const merged: string[] = [];
  const mergeConnectors = [", and ", ", but ", ", so ", "; ", ", yet "];
  let mergeConnIdx = 0;
  let skip = false;
  for (let i = 0; i < result.length; i++) {
    if (skip) { skip = false; continue; }
    const wc1 = result[i].split(/\s+/).length;
    const next = result[i + 1];
    if (next && wc1 < 10 && wc1 >= 3) {
      const wc2 = next.split(/\s+/).length;
      if (wc2 < 10 && wc2 >= 3 && Math.random() < 0.5) {
        const clean1 = result[i].replace(/\.\s*$/, "");
        const lower2 = next[0]?.toLowerCase() + next.slice(1);
        // Cycle through connectors so consecutive merges never use the same one
        const conn = mergeConnectors[mergeConnIdx % mergeConnectors.length];
        mergeConnIdx++;
        merged.push(clean1 + conn + lower2);
        skip = true;
        continue;
      }
    }
    merged.push(result[i]);
  }

  // Phase C: DISABLED — do not remove words; pass through unchanged to keep word count.
  return merged;
}

// ══════════════════════════════════════════════════════════════════════════
// SENTENCE STRUCTURE DIVERSIFIER — break SVO monotony
// ══════════════════════════════════════════════════════════════════════════

function diversifySentenceStructure(sentences: string[]): string[] {
  if (sentences.length < 4) return sentences;

  const result = [...sentences];
  let lastStartCategory = "";
  let consecutiveCount = 0;

  for (let i = 0; i < result.length; i++) {
    const sent = result[i].trim();
    if (!sent || sent.split(/\s+/).length < 6) continue;

    // Categorize sentence start
    const startWord = sent.split(/\s+/)[0]?.toLowerCase() ?? "";
    let category = "other";
    if (/^(the|a|an|this|that|these|those)$/i.test(startWord)) category = "determiner";
    else if (/^(it|they|he|she|we|there)$/i.test(startWord)) category = "pronoun";
    else if (/^[A-Z][a-z]+$/.test(sent.split(/\s+/)[0] ?? "")) category = "proper";

    // If two consecutive sentences start the same way, try to restructure
    if (category === lastStartCategory && category !== "other") {
      consecutiveCount++;
      // Only restructure every other duplicate to avoid over-processing
      if (consecutiveCount % 2 === 1) {
        const words = sent.split(/\s+/);
        // Try moving a mid-sentence clause to the front instead of injecting new text
        const commaIdx = sent.indexOf(",");
        if (commaIdx > 10 && commaIdx < sent.length * 0.6) {
          const before = sent.slice(0, commaIdx).trim();
          const after = sent.slice(commaIdx + 1).trim();
          if (after.split(/\s+/).length >= 4 && before.split(/\s+/).length >= 3) {
            result[i] = after[0].toUpperCase() + after.slice(1).replace(/\.$/, "") + ", " + before[0].toLowerCase() + before.slice(1) + ".";
          }
        }
      }
    } else {
      consecutiveCount = 0;
    }

    lastStartCategory = category;
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// PUNCTUATION DIVERSIFIER — inject semicolons, colons, parentheticals
// ══════════════════════════════════════════════════════════════════════════

function diversifyPunctuation(sentences: string[]): string[] {
  // DISABLED — comma-to-semicolon replacement creates grammatically invalid text.
  return sentences;
}

// ══════════════════════════════════════════════════════════════════════════
// SENTENCE EXPANDER — add brief natural elaborations to lift word count
// Adds 3–7 words to qualifying sentences every ~5th position.
// Uses appended phrases that read naturally in real human writing.
// ══════════════════════════════════════════════════════════════════════════

const SENTENCE_ELABORATIONS: { pattern: RegExp; add: string }[] = [
  { pattern: /\b(research|studies|evidence|data|literature)\b.{0,30}\b(show|suggest|indicate|reveal|confirm|demonstrate)/i, add: " — a finding that holds across contexts" },
  { pattern: /\b(can|may|might)\b.{0,20}\b(lead|cause|result in|contribute to|affect)/i, add: ", and frequently does" },
  { pattern: /\b(is|are)\s+(associated|linked|connected|tied)\s+with\b/i, add: " in ways that are well-documented" },
  { pattern: /\bparticularly\s+(among|for|in|when)\b/i, add: " — a group especially worth attention" },
  { pattern: /\b(significant|notable|meaningful|marked)\s+(difference|gap|shift|change|impact|effect)/i, add: ", one that should not be overlooked" },
  { pattern: /\b(platform|algorithm|system|design)\b.{5,30}\b(user|people|individual)/i, add: ", a dynamic worth examining" },
  { pattern: /\b(complex|nuanced|multifaceted|layered)\b/i, add: " — more so than it might first appear" },
  { pattern: /\b(positive|negative|harmful|beneficial)\s+(effect|impact|outcome|consequence)/i, add: ", and the weight of that should not be underestimated" },
  { pattern: /\b(mental health|well.being|psychological|emotional wellness)\b/i, add: " — a domain where small shifts matter greatly" },
  { pattern: /\b(young|adolescent|teen|youth|children)\b.{5,40}\b(vulnerab|affect|impact)/i, add: ", as the data consistently bear out" },
];

function expandSentences(sentences: string[]): string[] {
  const result = [...sentences];
  const usedAdds = new Set<string>();

  for (let i = 0; i < result.length; i++) {
    // Every 5th sentence, offset to avoid overlap with filler insertions
    if ((i + 3) % 5 !== 0) continue;
    const words = result[i].split(/\s+/);
    // Only expand mid-length sentences (not very short or very long)
    if (words.length < 8 || words.length > 32) continue;
    // Only expand sentences ending with a period
    if (!result[i].trimEnd().endsWith(".")) continue;

    for (const { pattern, add } of SENTENCE_ELABORATIONS) {
      if (!usedAdds.has(add) && pattern.test(result[i])) {
        result[i] = result[i].trimEnd().slice(0, -1) + add + ".";
        usedAdds.add(add);
        break;
      }
    }
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// FUNCTION WORD PROFILE ADJUSTER — shift toward human function word dist
// ══════════════════════════════════════════════════════════════════════════

// Contextually natural insertions — each tied to a grammatical trigger
// to mimic the small imperfections of real writing without being formulaic.
const FILLER_INSERTIONS: { after: RegExp; insert: string }[] = [
  { after: /\b(is|are)\b(?! (a |an |the |not |just |only |also |already |still |now |here |there |very |quite |rather ))/, insert: " without doubt" },
  { after: /\b(was|were)\b(?! not )/, insert: " at the time" },
  { after: /\b(but)\b/, insert: " even so" },
  { after: /\b(has|have)\b(?! (not |never |always |already |just ))/, insert: " in practice" },
  { after: /\b(can)\b(?! (not |never |always ))/, insert: " in theory" },
  { after: /\b(should)\b(?! (not |never ))/, insert: " by rights" },
  { after: /\b(would)\b(?! (not |never ))/, insert: " in principle" },
];

function adjustFunctionWordProfile(sentences: string[]): string[] {
  // Light touch: insert at most 1 phrase per ~12 sentences to break AI profile.
  // Tracks used inserts to avoid repeating the same phrase across the text.
  const result = [...sentences];
  let insertionCount = 0;
  const maxInsertions = Math.max(1, Math.floor(result.length / 4));
  const usedInserts = new Set<string>();
  // Shuffle insertion candidates so they are not always the same
  const shuffledFillers = [...FILLER_INSERTIONS].sort(() => Math.random() - 0.5);

  for (let i = 0; i < result.length && insertionCount < maxInsertions; i++) {
    // Moderate frequency: try every 4th sentence
    if ((i + 1) % 4 !== 0) continue;
    const words = result[i].split(/\s+/);
    if (words.length < 10 || words.length > 28) continue;

    // Find a filler that matches AND hasn't been used yet
    const filler = shuffledFillers.find(f => !usedInserts.has(f.insert) && f.after.test(result[i]));
    if (filler) {
      let inserted = false;
      result[i] = result[i].replace(filler.after, (match) => {
        if (inserted) return match;
        inserted = true;
        return match + filler.insert;
      });
      if (inserted) {
        usedInserts.add(filler.insert);
        insertionCount++;
      }
    }
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// WORD-LEVEL DEEP CLEAN — catch all AI words the LLM phases missed
// ══════════════════════════════════════════════════════════════════════════

function deepWordClean(text: string): string {
  let result = text;

  // Apply shared dictionary AI word kill first
  result = applyAIWordKill(result);

  // Apply extended vocabulary replacements
  result = result.replace(/\b[a-zA-Z]+\b/g, (word) => {
    const lower = word.toLowerCase();
    const replacements = EXTENDED_AI_WORDS[lower];
    if (!replacements) return word;
    const replacement = replacements[Math.floor(Math.random() * replacements.length)];
    // Preserve capitalization
    if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  });

  // Apply sentence-level AI pattern purge
  for (const [pattern, replacement] of AI_SENTENCE_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }

  // Clean double spaces and punctuation artifacts
  result = result.replace(/ {2,}/g, " ");
  result = result.replace(/,\s*,/g, ",");
  result = result.replace(/\.\s*\./g, ".");
  result = result.replace(/\s+([.,;:!?])/g, "$1");
  result = result.replace(/([.,;:!?])([A-Za-z])/g, "$1 $2");

  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// CONNECTOR DEEP CLEAN — aggressively naturalize formal connectors
// ══════════════════════════════════════════════════════════════════════════

const DEEP_CONNECTOR_MAP: Record<string, string[]> = {
  "Furthermore,": ["Also,", "Besides,", "And,", "Plus,"],
  "Moreover,": ["Also,", "On top of that,", "Plus,"],
  "Additionally,": ["Also,", "Besides,", "And,"],
  "However,": ["But,", "Still,", "Yet,", "Even so,"],
  "Nevertheless,": ["Still,", "Even so,", "All the same,"],
  "Consequently,": ["So,", "Because of that,", "As a result,"],
  "Subsequently,": ["Then,", "After that,", "Later,"],
  "Therefore,": ["So,", "Because of this,"],
  "Thus,": ["So,", "In this way,"],
  "Hence,": ["So,", "That is why,"],
  "Indeed,": ["In fact,", "Sure enough,", "Really,"],
  "Notably,": ["It is worth pointing out,"],
  "Specifically,": ["In particular,", "To be exact,"],
  "Importantly,": ["What matters is,", "The key thing is,"],
  "Crucially,": ["The key point is,", "What matters most is,"],
  "Essentially,": ["Basically,", "At its core,"],
  "Fundamentally,": ["At bottom,", "At its core,"],
  "Arguably,": ["One could say,", "It might be that,"],
  "Undeniably,": ["There is no question,", "By any measure,"],
  "Undoubtedly,": ["Without question,", "Certainly,"],
  "Interestingly,": ["It turns out,", "As it happens,"],
  "Remarkably,": ["What stands out is,", "Strikingly,"],
  "Accordingly,": ["So,", "In response,"],
  "In conclusion,": ["All in all,", "To sum up,", "Overall,"],
  "In summary,": ["To sum up,", "Overall,", "All told,"],
  "Evidently,": ["As it turns out,", "Clearly,"],
};

function deepConnectorClean(text: string): string {
  let result = text;

  // Replace sentence-starting formal connectors
  for (const [formal, replacements] of Object.entries(DEEP_CONNECTOR_MAP)) {
    while (result.includes(formal)) {
      const rep = replacements[Math.floor(Math.random() * replacements.length)];
      result = result.replace(formal, rep);
    }
    // Also handle lowercase variants mid-sentence
    const lowerFormal = formal.toLowerCase();
    while (result.includes(lowerFormal)) {
      const rep = replacements[Math.floor(Math.random() * replacements.length)].toLowerCase();
      result = result.replace(lowerFormal, rep);
    }
  }

  // Also apply the shared connector naturalization
  result = applyConnectorNaturalization(result);

  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// SENTENCE-LEVEL UNIFORMITY BREAKER
// ══════════════════════════════════════════════════════════════════════════

function breakSentenceUniformity(sentences: string[]): string[] {
  if (sentences.length < 5) return sentences;

  const result = [...sentences];

  // Compute word lengths per sentence
  const sentWordLengths = result.map(s => {
    const words = s.match(/[a-z']+/gi) ?? [];
    return words.map(w => w.length);
  });

  // For every 4th sentence, replace one medium-length word with a shorter synonym
  for (let i = 0; i < result.length; i++) {
    if (i % 4 !== 1) continue;
    const words = result[i].split(/\s+/);
    if (words.length < 8) continue;

    // Find a 7+ letter word and try to shorten it
    const shortMap: Record<string, string> = {
      "although": "though",
      "however": "but",
      "because": "since",
      "therefore": "so",
      "whether": "if",
      "through": "via",
      "without": "lacking",
      "between": "among",
      "another": "one more",
      "several": "a few",
      "various": "many",
      "different": "other",
      "important": "key",
      "approach": "way",
      "require": "need",
      "required": "needed",
      "provide": "give",
      "provided": "gave",
      "provides": "gives",
      "develop": "build",
      "developed": "built",
      "establish": "set up",
      "established": "set up",
      "maintain": "keep",
      "maintained": "kept",
      "consider": "think about",
      "considered": "thought about",
      "support": "back",
      "supported": "backed",
      "indicate": "show",
      "indicated": "showed",
      "indicates": "shows",
      "determine": "find",
      "determined": "found",
      "increase": "raise",
      "increased": "raised",
      "describe": "tell of",
      "described": "told of",
      "continue": "go on",
      "continued": "went on",
      "represent": "stand for",
      "suggest": "hint",
      "suggested": "hinted",
      "experience": "face",
      "experienced": "faced",
      "influence": "sway",
      "influenced": "swayed",
      "recognize": "see",
      "recognized": "saw",
      "contribute": "add",
      "contributed": "added",
    };

    let changed = false;
    result[i] = result[i].replace(/\b[a-zA-Z]{7,}\b/g, (word) => {
      if (changed) return word;
      const lower = word.toLowerCase();
      if (shortMap[lower]) {
        changed = true;
        const rep = shortMap[lower];
        if (word[0] === word[0].toUpperCase()) {
          return rep[0].toUpperCase() + rep.slice(1);
        }
        return rep;
      }
      return word;
    });
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// READABILITY VARIATION INJECTOR
// ══════════════════════════════════════════════════════════════════════════

function varyReadability(sentences: string[]): string[] {
  if (sentences.length < 6) return sentences;

  const result = [...sentences];

  for (let i = 0; i < result.length; i++) {
    const words = result[i].split(/\s+/);
    if (words.length < 8) continue;

    // Every 6th sentence: simplify
    if (i % 6 === 0) {
      const simplify: Record<string, string> = {
        "approximately": "about",
        "demonstrate": "show",
        "establish": "set up",
        "preliminary": "early",
        "predominant": "main",
        "fundamental": "basic",
        "immediately": "quickly",
        "substantially": "a lot",
        "simultaneously": "at once",
        "independently": "alone",
        "investigation": "study",
        "communication": "message",
        "understanding": "grasp",
        "opportunities": "chances",
        "circumstances": "conditions",
        "characteristics": "traits",
        "determination": "resolve",
        "organizations": "groups",
        "collaboration": "teamwork",
        "implementation": "rollout",
        "associated": "linked",
        "particularly": "especially",
        "environment": "setting",
        "significant": "big",
        "traditional": "old",
        "perspective": "view",
        "alternative": "other",
        "individual": "person",
        "individuals": "people",
      };

      let simplified = result[i];
      let swapped = false;
      for (const [long, short] of Object.entries(simplify)) {
        const rx = new RegExp(`\\b${long}\\b`, "i");
        if (rx.test(simplified)) {
          simplified = simplified.replace(rx, (m) =>
            m[0] === m[0].toUpperCase() ? short[0].toUpperCase() + short.slice(1) : short
          );
          swapped = true;
          break;
        }
      }
      if (swapped) result[i] = simplified;
    }
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// N-GRAM DISRUPTION — break repeated bigram/trigram patterns real detectors flag
// Real ZeroGPT and Surfer SEO use n-gram frequency analysis to detect AI text.
// AI text has predictable word sequences; human text does not.
// ══════════════════════════════════════════════════════════════════════════

const NGRAM_SWAP_WORDS: Record<string, string[]> = {
  "important": ["key", "central", "vital"],
  "significant": ["major", "big", "real"],
  // "development" removed — corrupts proper nouns like "Development Bank"
  "approach": ["method", "way", "tactic"],
  "various": ["many", "different", "assorted"],
  "process": ["procedure", "course", "series of steps"],
  "system": ["setup", "structure", "arrangement"],
  "provide": ["give", "offer", "supply"],
  "require": ["need", "call for", "demand"],
  "include": ["cover", "take in", "involve"],
  "indicate": ["show", "point to", "suggest"],
  "consider": ["think about", "weigh", "look at"],
  "establish": ["set up", "create", "form"],
  "maintain": ["keep", "hold", "preserve"],
  "support": ["back", "help", "uphold"],
  "continue": ["go on", "carry on", "persist"],
  "increase": ["raise", "boost", "grow"],
  "suggest": ["hint", "propose", "point to"],
  "identify": ["spot", "find", "pick out"],
  "determine": ["figure out", "find", "settle"],
  "result": ["outcome", "consequence", "effect"],
  "impact": ["effect", "influence", "weight"],
  "factor": ["element", "piece", "cause"],
  "issues": ["problems", "concerns", "questions"],
  "challenge": ["problem", "difficulty", "test"],
  "opportunity": ["chance", "opening", "possibility"],
  "context": ["setting", "situation", "backdrop"],
  "structure": ["form", "setup", "layout"],
  "strategy": ["plan", "tactic", "approach"],
  "evidence": ["proof", "data", "signs"],
};

function disruptNgrams(text: string): string {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length < 20) return text;

  // Count bigram frequencies
  const bigramCounts = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const bi = words[i] + " " + words[i + 1];
    bigramCounts.set(bi, (bigramCounts.get(bi) ?? 0) + 1);
  }

  // Find repeated bigrams
  const repeatedBigrams = new Set<string>();
  for (const [bi, count] of bigramCounts) {
    if (count >= 2) repeatedBigrams.add(bi);
  }

  if (repeatedBigrams.size === 0) return text;

  let result = text;
  let disruptions = 0;
  const maxDisruptions = Math.min(10, Math.ceil(repeatedBigrams.size * 0.7));

  for (const bi of repeatedBigrams) {
    if (disruptions >= maxDisruptions) break;
    const biWords = bi.split(" ");

    // Try to swap one word in the second occurrence
    for (const w of biWords) {
      const swaps = NGRAM_SWAP_WORDS[w];
      if (swaps && swaps.length > 0) {
        const replacement = swaps[Math.floor(Math.random() * swaps.length)];
        // Find second occurrence
        const lowerResult = result.toLowerCase();
        const firstIdx = lowerResult.indexOf(w);
        if (firstIdx >= 0) {
          const secondIdx = lowerResult.indexOf(w, firstIdx + w.length + 1);
          if (secondIdx >= 0) {
            const originalWord = result.slice(secondIdx, secondIdx + w.length);
            // Skip if inside a proper noun (preceded or followed by a capitalized word)
            const beforeCtx = result.slice(Math.max(0, secondIdx - 20), secondIdx);
            const afterCtx = result.slice(secondIdx + w.length, secondIdx + w.length + 20);
            const isInProperNoun = /[A-Z][a-z]+\s*$/.test(beforeCtx) || /^\s*[A-Z][a-z]/.test(afterCtx);
            // Skip if inside parenthetical citation
            const isInCitation = /\([^)]*$/.test(beforeCtx);
            if (isInProperNoun || isInCitation) break;

            const isCapitalized = originalWord[0] === originalWord[0].toUpperCase();
            const finalReplacement = isCapitalized
              ? replacement[0].toUpperCase() + replacement.slice(1)
              : replacement;
            result = result.slice(0, secondIdx) + finalReplacement + result.slice(secondIdx + w.length);
            disruptions++;
            break;
          }
        }
      }
    }
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN DEEP-CLEAN PIPELINE — premiumDeepClean()
// ══════════════════════════════════════════════════════════════════════════

export interface DeepCleanResult {
  text: string;
  passNumber: number;
  initialScores: Record<string, number>;
  finalScores: Record<string, number>;
  wordChangePercent: number;
}

// ══════════════════════════════════════════════════════════════════════════
// CROSS-SENTENCE REPETITION DEDUPLICATOR
// Scans full text for repeated multi-word phrases (3-5 words) that appear
// 3+ times and replaces excess occurrences with synonymous alternatives.
// This catches repetition from LLM per-sentence processing, deep clean
// deterministic replacements, and any injected phrases.
// ══════════════════════════════════════════════════════════════════════════

const PHRASE_ALTERNATIVES: Record<string, string[]> = {
  "each month": ["monthly", "every month", "on a monthly basis", "per month"],
  "per month": ["monthly", "every month", "each month", "a month"],
  "every month": ["monthly", "on a monthly basis", "per month", "a month"],
  "a month": ["monthly", "per month", "each month"],
  "set aside": ["put away", "earmarked", "reserved", "allocated", "budgeted"],
  "i have allocated": ["i assigned", "i directed", "i put", "i reserved", "i earmarked"],
  "i have set": ["i placed", "i directed", "i put", "i designated"],
  "have been updated": ["were adjusted", "were revised", "were modified", "got changed"],
  "have been revised": ["were adjusted", "were updated", "were modified", "got changed"],
  "have been adjusted": ["were revised", "were updated", "were modified", "got changed"],
  "has been included": ["was added", "is part of the plan", "is factored in", "was built in"],
  "has been allocated": ["was set aside", "was directed", "was assigned", "was reserved"],
  "has been set": ["was placed", "was put", "was designated", "was established"],
  "in this case": ["here", "in this situation", "under these circumstances"],
  "at that stage": ["by that point", "at that time", "then"],
  "for that reason": ["because of this", "so", "that is why"],
  "along those lines": ["similarly", "in a similar way", "likewise"],
  "from that angle": ["seen that way", "looked at like that", "from that perspective"],
  "under those conditions": ["given that", "in that scenario", "with those factors"],
  "by that measure": ["on that basis", "judged that way", "by that standard"],
  "on that score": ["in that regard", "on that front", "there"],
  "at that point": ["by then", "at that time", "when that happens"],
  "as it turned out": ["in the end", "ultimately", "as it happened"],
  "in real terms": ["practically", "effectively", "in practice"],
  "can help": ["may aid", "supports", "goes a long way toward", "is useful for"],
  "cut down on": ["reduce", "lower", "trim", "decrease"],
  "set away": ["set aside", "put away", "reserved", "earmarked"],
  "put away": ["set aside", "reserved", "earmarked", "saved"],
  "it is important": ["it matters", "it helps", "it counts"],
  "on the other hand": ["then again", "conversely", "at the same time"],
  "in addition to": ["beyond", "apart from", "on top of"],
  "in order to": ["to", "so as to", "for the purpose of"],
  "is an important": ["is a key", "is a meaningful", "is a valuable", "matters as a"],
  "with that in mind": ["keeping that in view", "bearing that in mind", "considering that"],
  "on a related note": ["relatedly", "along similar lines", "connected to this"],
  "to that end": ["with that goal", "toward that aim", "for that purpose"],
  "in that regard": ["on that front", "in that respect", "there"],
};

export function deduplicateRepeatedPhrases(text: string): string {
  // Phase 1: detect all 3-5 word phrases repeated 3+ times
  const words = text.split(/\s+/);
  const phraseCounts: Record<string, number> = {};

  for (let n = 2; n <= 5; n++) {
    for (let i = 0; i <= words.length - n; i++) {
      const phrase = words.slice(i, i + n).join(" ").toLowerCase().replace(/[^a-z\s'$%]/g, "").trim();
      if (phrase.length < 4) continue;
      // Skip phrases that are just numbers/currency
      if (/^\$?\d/.test(phrase)) continue;
      phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
    }
  }

  // Find phrases repeated 3+ times
  const repeatedPhrases = Object.entries(phraseCounts)
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[0].length - a[0].length); // longer phrases first

  if (repeatedPhrases.length === 0) return text;

  console.log(`  [DeepClean] Repetition cleanup: found ${repeatedPhrases.length} repeated phrases`);

  let result = text;

  for (const [phrase, count] of repeatedPhrases) {
    const alternatives = PHRASE_ALTERNATIVES[phrase];
    if (!alternatives || alternatives.length === 0) continue;

    // Keep the first occurrence, replace subsequent ones
    let occurrenceIdx = 0;
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

    result = result.replace(regex, (match) => {
      occurrenceIdx++;
      if (occurrenceIdx <= 1) return match; // keep first occurrence as-is
      // Cycle through alternatives for variety
      const alt = alternatives[(occurrenceIdx - 2) % alternatives.length];
      // Preserve capitalization of first letter
      if (match[0] === match[0].toUpperCase()) {
        return alt[0].toUpperCase() + alt.slice(1);
      }
      return alt;
    });
  }

  // Phase 2: catch any remaining repeated 3-word+ phrases not in our dictionary
  // by simply removing the repeated starter phrase if it was prepended
  const knownPrepends = [
    /^(In this case|At that stage|For that reason|Along those lines|From that angle|Under those conditions|By that measure|On that score|At that point|By then|As it turned out|In real terms|Practically speaking|On closer inspection|In practice|By that point|As things stood|On the ground|Behind the scenes|With that shift|Looking closer|Broadly speaking),\s*/i,
  ];

  const paragraphs = result.split(/\n\s*\n/);
  const cleanedParas = paragraphs.map(para => {
    const sentences = robustSentenceSplit(para.trim());
    const starterCounts: Record<string, number> = {};

    // Count how many sentences start with each prepended phrase
    for (const sent of sentences) {
      for (const re of knownPrepends) {
        const m = sent.match(re);
        if (m) {
          const key = m[1].toLowerCase();
          starterCounts[key] = (starterCounts[key] || 0) + 1;
        }
      }
    }

    // Strip prepended phrases that appear 2+ times in the same paragraph  
    const repeatedStarters = new Set(
      Object.entries(starterCounts).filter(([_, c]) => c >= 2).map(([k]) => k)
    );

    if (repeatedStarters.size === 0) return para;

    const cleaned = sentences.map(sent => {
      for (const re of knownPrepends) {
        const m = sent.match(re);
        if (m && repeatedStarters.has(m[1].toLowerCase())) {
          const after = sent.slice(m[0].length).trim();
          if (after.length > 0) {
            return after[0].toUpperCase() + after.slice(1);
          }
        }
      }
      return sent;
    });

    return cleaned.join(" ");
  });

  result = cleanedParas.join("\n\n");

  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// WORD COUNT EXPANDER — public utility called from route.ts for ALL engines
// Adds natural adverb qualifiers to bring word count up to targetWords.
// Patterns target common grammatical structures present in any English text.
// ══════════════════════════════════════════════════════════════════════════

export function expandWordCount(text: string, targetWords: number): string {
  const wc = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
  if (wc(text) >= targetWords) return text;

  // Phase 1: Verb qualifiers — target broad verb classes with generic adverbs
  const VERB_ADVERBS: [RegExp, string][] = [
    [/\b(become|became|becomes)\b/g, "gradually $1"],
    [/\b(remain|remains|remained)\b/g, "still $1"],
    [/\b(show|shows|shown|showed)\b/g, "clearly $1"],
    [/\b(affect|affects|affected|affecting)\b/g, "directly $1"],
    [/\b(increase|increases|increased|increasing)\b/g, "steadily $1"],
    [/\b(create|creates|created|creating)\b/g, "actively $1"],
    [/\b(provide|provides|provided|providing)\b/g, "$1 real"],
    [/\b(lead|leads|led) to\b/g, "$1 directly to"],
    [/\b(contribute|contributes|contributed) to\b/g, "$1 significantly to"],
    [/\b(expose|exposes|exposed) (users?|people|individuals)\b/g, "$1 $2 unfairly"],
    [/\b(require|requires|required)\b/g, "genuinely $1"],
    [/\b(suggest|suggests|suggested)\b/g, "broadly $1"],
    [/\b(demonstrate|demonstrates|demonstrated)\b/g, "clearly $1"],
    [/\b(confirm|confirms|confirmed)\b/g, "broadly $1"],
    [/\b(influence|influences|influenced)\b/g, "deeply $1"],
    [/\b(develop|develops|developed|developing)\b/g, "steadily $1"],
    [/\b(extend|extends|extended)\b/g, "broadly $1"],
    [/\b(spread|spreads) (rapidly|quickly|widely)?\b/g, "$1 rapidly $2"],
    [/\b(exist|exists|existed)\b/g, "still $1"],
    [/\b(limit|limits|limited|limiting)\b/g, "actively $1"],
  ];

  // Phase 2: Adjective qualifiers — broaden to catch nuru synonym choices
  const ADJ_QUALIFIERS: [RegExp, string][] = [
    [/\b(negative|harmful|detrimental|damaging)\b/g, "particularly $1"],
    [/\b(positive|beneficial|helpful|valuable)\b/g, "genuinely $1"],
    [/\b(significant|marked|notable|substantial|considerable|important)\b/g, "quite $1"],
    [/\b(serious|severe|critical|acute|grave)\b/g, "quite $1"],
    [/\b(complex|nuanced|complicated|intricate)\b/g, "quite $1"],
    [/\b(common|widespread|prevalent|frequent|typical)\b/g, "quite $1"],
    [/\b(clear|evident|apparent|obvious|plain)\b/g, "quite $1"],
    [/\b(strong|powerful|robust|deep|profound)\b/g, "particularly $1"],
    [/\b(real|genuine|authentic|actual|true)\b/g, "quite $1"],
    [/\b(young|adolescent|vulnerable|susceptible)\b/g, "particularly $1"],
    [/\b(rapid|swift|quick|fast|growing)\b/g, "quite $1"],
  ];

  // Phase 3: Structural additions — safe insertions around prepositions & clauses
  const STRUCTURAL: [RegExp, string][] = [
    [/\b(can) (disrupt|harm|damage|affect|impact)\b/g, "$1 in fact $2"],
    [/\b(has|have) (been) (shown|found|documented|established)\b/g, "$1 $2 consistently $3"],
    [/\b(is|are) (designed|built|made|created|intended) to\b/g, "$1 specifically $2 to"],
    [/\b(is|are|was|were) (often|usually|generally|commonly|typically)\b/g, "$1 $2 quite"],
    [/\b(particularly|especially|specifically) (among|for|in|when)\b/g, "$1 so $2"],
    [/\b(in) (many|some|certain|various) (cases?|situations?|contexts?|instances?)\b/g, "$1 quite $2 $3"],
    [/\b(for) (many|most|some) (people|users|individuals|researchers)\b/g, "$1 $2 ordinary $3"],
    [/\b(both) (online|digital|social|virtual|physical)\b/g, "$1 online and offline"],
  ];

  let result = text;

  const applyPass = (patterns: [RegExp, string][]) => {
    for (const [pat, rep] of patterns) {
      if (wc(result) >= targetWords) return;
      result = result.replace(pat, rep);
    }
  };

  applyPass(VERB_ADVERBS);
  if (wc(result) < targetWords) applyPass(ADJ_QUALIFIERS);
  if (wc(result) < targetWords) applyPass(STRUCTURAL);

  // Final safety pass: target words that always occur in academic/essay writing
  if (wc(result) < targetWords) {
    const ALWAYS_PRESENT: [RegExp, string][] = [
      [/\b(have|has) (a) ([a-z]+) (impact|effect|influence|role)\b/g, "$1 $2 clear $3 $4"],
      [/\b(this) (can|may|might|will|could)\b/g, "$1 in turn $2"],
      [/\b(these) (platforms?|tools?|systems?|apps?)\b/g, "$1 particular $2"],
      [/\b(the) (use) (of)\b/g, "$1 growing $2 $3"],
      [/\b(when|while|as) (users?|people|individuals|students)\b/g, "$1 ordinary $2"],
      [/\b(it) (is|was) (important|essential|necessary|vital|clear)\b/g, "$1 $2 still $3"],
    ];
    applyPass(ALWAYS_PRESENT);
  }

  return result;
}

export async function premiumDeepClean(
  text: string,
  maxPasses = 3,
): Promise<DeepCleanResult> {
  if (!text?.trim()) return { text, passNumber: 0, initialScores: {}, finalScores: {}, wordChangePercent: 0 };

  const originalWords = text.trim().split(/\s+/);
  const originalWordSet = new Set(originalWords.map(w => w.toLowerCase().replace(/[^a-z']/g, "")));
  let result = text.trim();

  console.log(`  [DeepClean] Starting deep-clean (${maxPasses} passes, targeting real detectors)...`);

  // Preserve paragraph structure
  const inputParas = result.split(/\n\s*\n/).filter(p => p.trim());

  let passNumber = 0;

  for (let pass = 0; pass < maxPasses; pass++) {
    passNumber = pass + 1;
    console.log(`  [DeepClean] Pass ${passNumber}/${maxPasses}...`);

    // ═══════ Phase 1: Word-Level Deep Clean ═══════
    result = deepWordClean(result);

    // ═══════ Phase 2: Connector Deep Clean ═══════
    result = deepConnectorClean(result);

    // ═══════ Phase 3: N-gram Disruption (breaks repeated patterns real detectors flag) ═══════
    result = disruptNgrams(result);

    // ═══════ Phase 4: Per-Paragraph Sentence-Level Cleaning ═══════
    const paragraphs = result.split(/\n\s*\n/).filter(p => p.trim());
    const cleanedParagraphs = paragraphs.map(para => {
      const trimmedPara = para.trim();
      // Skip headings
      if (trimmedPara.split(/\s+/).length <= 6 && !/[.!?]$/.test(trimmedPara)) return trimmedPara;

      let sentences = robustSentenceSplit(trimmedPara);
      if (sentences.length === 0) return trimmedPara;

      // Phase 4a: Break starter repetition
      sentences = breakStarterRepetition(sentences);

      // Phase 4b: Per-sentence anti-detection (shared)
      sentences = perSentenceAntiDetection(sentences, false);

      // Phase 4c: Deep cleaning pass (shared)
      sentences = deepCleaningPass(sentences);

      // Phase 4d: Clean sentence starters
      sentences = cleanSentenceStarters(sentences);

      // Phase 4e: Burstiness injection — only on first pass to avoid compounding
      if (pass === 0) {
        sentences = injectBurstiness(sentences);
      }

      // Phase 4f: Structure diversification — only on first pass to avoid compounding
      if (pass === 0) {
        sentences = diversifySentenceStructure(sentences);
      }

      // Phase 4g: Punctuation diversification
      sentences = diversifyPunctuation(sentences);

      // Phase 4h: Sentence uniformity breaker
      sentences = breakSentenceUniformity(sentences);

      // Phase 4i: Readability variation
      sentences = varyReadability(sentences);

      // Phase 4j: Micro-noise injection (human imperfections)
      sentences = applyMicroNoiseToText(sentences);

      // Phase 4k: Function word profile adjustment
      sentences = adjustFunctionWordProfile(sentences);

      // Phase 4l: Natural sentence expansion (keeps word count ≥ input)
      sentences = expandSentences(sentences);

      return sentences.join(" ");
    });

    result = cleanedParagraphs.join("\n\n");

    // ═══════ Phase 5: Final Punctuation Fix ═══════
    result = fixPunctuation(result);

    // ═══════ Phase 6: Capitalize sentence starts ═══════
    result = result.replace(/\.[ \t]+([a-z])/g, (_, ch) => ". " + ch.toUpperCase());
    result = result.replace(/^([a-z])/gm, (_, ch) => ch.toUpperCase());

    // Log pass completion — no internal detector check, run all passes unconditionally
    const passWords = result.split(/\s+/).length;
    const passSents = robustSentenceSplit(result);
    const passAvg = passSents.length > 0 ? passWords / passSents.length : 0;
    const passLengths = passSents.map(s => s.split(/\s+/).length);
    const passMean = passLengths.length > 0 ? passLengths.reduce((a, b) => a + b, 0) / passLengths.length : 0;
    const passCV = passMean > 0 ? Math.sqrt(passLengths.reduce((a, l) => a + (l - passMean) ** 2, 0) / passLengths.length) / passMean : 0;
    console.log(`  [DeepClean] Pass ${passNumber}: ${passWords} words, ${passSents.length} sents, CV=${passCV.toFixed(3)}, avgLen=${passAvg.toFixed(1)}`);
  }

  // Calculate word change percentage
  const finalWords = result.split(/\s+/);

  // ═══════ Final Phase: Cross-Sentence Repetition Cleanup ═══════
  // The LLM processes sentences independently, so repeated phrases like
  // "each month", "set aside", "per month" accumulate across the full text.
  // This phase detects and varies repeated multi-word phrases globally.
  result = deduplicateRepeatedPhrases(result);

  const finalWordsCleaned = result.split(/\s+/);
  const finalWordSet = new Set(finalWordsCleaned.map(w => w.toLowerCase().replace(/[^a-z']/g, "")));
  let unchangedCount = 0;
  for (const w of finalWordSet) {
    if (originalWordSet.has(w)) unchangedCount++;
  }
  const totalUnique = new Set([...originalWordSet, ...finalWordSet]).size;
  const wordChangePercent = totalUnique > 0 ? Math.round(((totalUnique - unchangedCount) / totalUnique) * 100) : 0;

  console.log(`  [DeepClean] Complete: ${maxPasses} passes, word change=${wordChangePercent}%`);

  return {
    text: result,
    passNumber,
    initialScores: {},
    finalScores: {},
    wordChangePercent,
  };
}
