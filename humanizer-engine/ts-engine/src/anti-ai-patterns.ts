/**
 * Anti-AI Pattern Library (APDE + MNIS)
 * =======================================
 *
 * AI Pattern Disruption Engine (APDE):
 *   Detects and breaks common LLM output patterns:
 *   - Repeated sentence openings
 *   - Predictable syntax loops
 *   - Uniform clause structures
 *   - Statistical pattern signatures
 *
 * Micro-Noise Injection System (MNIS):
 *   Adds controlled human imperfection:
 *   - Slight redundancy
 *   - Natural phrasing variation
 *   - Asymmetrical emphasis
 *   (NOT: grammar mistakes or randomness)
 *
 * Methods:
 *   - Structure rotation
 *   - Phrase entropy injection
 *   - Pattern blacklisting
 */

import type { StructuredSentenceMap, TextAnalysis } from "./linguistic-intelligence-core";

// ══════════════════════════════════════════════════════════════════════════
// 1. COMMON LLM OUTPUT PATTERNS (Blacklisted)
//    These are structural/statistical patterns that AI detectors look for.
// ══════════════════════════════════════════════════════════════════════════

/** Sentence-level structural patterns commonly produced by LLMs */
export const LLM_STRUCTURAL_PATTERNS = {
  // Pattern: every sentence follows Subject-Verb-Object order
  uniformSVO: {
    name: "Uniform SVO",
    description: "All sentences follow rigid Subject-Verb-Object order without variation",
    detectFn: (sentences: StructuredSentenceMap[]): boolean => {
      if (sentences.length < 4) return false;
      let svoCount = 0;
      for (const s of sentences) {
        if (s.subject && s.verb && s.subject.index < s.verb.index) svoCount++;
      }
      return svoCount / sentences.length > 0.85;
    },
  },

  // Pattern: sentences all start with a noun phrase subject
  uniformSubjectStart: {
    name: "Uniform Subject Start",
    description: "Most sentences begin with the grammatical subject (no fronting variation)",
    detectFn: (sentences: StructuredSentenceMap[]): boolean => {
      if (sentences.length < 4) return false;
      let subjectFirstCount = 0;
      for (const s of sentences) {
        if (s.subject && s.subject.index === 0) subjectFirstCount++;
      }
      return subjectFirstCount / sentences.length > 0.80;
    },
  },

  // Pattern: all sentences are of similar length (low burstiness)
  uniformLength: {
    name: "Uniform Length",
    description: "Sentence lengths too consistent (AI hallmark)",
    detectFn: (sentences: StructuredSentenceMap[]): boolean => {
      if (sentences.length < 3) return false;
      const lengths = sentences.map(s => s.complexity.wordCount);
      const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length;
      const cv = Math.sqrt(variance) / (mean || 1);
      return cv < 0.25; // coefficient of variation too low
    },
  },

  // Pattern: all sentences have same clause count
  uniformClauseCount: {
    name: "Uniform Clause Count",
    description: "Every sentence has the same number of clauses",
    detectFn: (sentences: StructuredSentenceMap[]): boolean => {
      if (sentences.length < 4) return false;
      const counts = sentences.map(s => s.complexity.clauseCount);
      const uniqueCounts = new Set(counts);
      return uniqueCounts.size <= 2 && sentences.length > 5;
    },
  },

  // Pattern: all sentences same voice
  uniformVoice: {
    name: "Uniform Voice",
    description: "Every sentence uses the same voice (all active or all passive)",
    detectFn: (sentences: StructuredSentenceMap[]): boolean => {
      if (sentences.length < 5) return false;
      const voices = sentences.map(s => s.tenseVoice.voice);
      const activeCount = voices.filter(v => v === "active").length;
      return activeCount === sentences.length || activeCount === 0;
    },
  },

  // Pattern: predictable complexity progression
  predictableComplexity: {
    name: "Predictable Complexity",
    description: "Complexity increases or decreases monotonically (too structured)",
    detectFn: (sentences: StructuredSentenceMap[]): boolean => {
      if (sentences.length < 5) return false;
      const scores = sentences.map(s => s.complexity.complexityScore);
      let increasing = 0;
      let decreasing = 0;
      for (let i = 1; i < scores.length; i++) {
        if (scores[i] >= scores[i - 1]) increasing++;
        if (scores[i] <= scores[i - 1]) decreasing++;
      }
      const n = scores.length - 1;
      return increasing / n > 0.85 || decreasing / n > 0.85;
    },
  },
};

// ══════════════════════════════════════════════════════════════════════════
// 2. SENTENCE OPENER PATTERNS (Blacklisted AI Starters)
// ══════════════════════════════════════════════════════════════════════════

/** Extended AI starter patterns beyond single words — full phrase patterns */
export const AI_OPENER_PATTERNS: RegExp[] = [
  // "The [noun] is/are [adj]" pattern (very common LLM opening)
  /^The \w+ (?:is|are|was|were) (?:a |an )?(?:very |extremely |highly |particularly )?\w+/,
  // "This [noun] [verb]s" pattern
  /^This \w+ (?:demonstrates?|shows?|indicates?|reveals?|highlights?|suggests?|illustrates?|represents?|provides?|offers?|ensures?|enables?)/,
  // "It is [adj] that" pattern
  /^It (?:is|was|remains|has been) (?:\w+ )?(?:important|crucial|essential|vital|clear|evident|notable|noteworthy|significant|interesting|worth|necessary|imperative|critical) (?:that|to)/,
  // List-style openers
  /^(?:First(?:ly)?|Second(?:ly)?|Third(?:ly)?|Fourth(?:ly)?|Finally|Lastly|In addition|Additionally|Moreover|Furthermore),?\s/,
  // "One of the" pattern
  /^One of the (?:most |key |main |primary |central |fundamental )?\w+/,
  // "In order to" pattern
  /^In order to\b/,
  // "There is/are" existential pattern (overused by AI)
  /^There (?:is|are|was|were|exists?|remains?) (?:a |an |no |some |many |several |various |numerous )/,
  // "By + gerund" pattern (AI loves these)
  /^By (?:\w+ing)\b/,
  // "As such" / "As a result" / "As mentioned" pattern
  /^As (?:such|a result|a consequence|mentioned|noted|discussed|stated|described|illustrated|shown|demonstrated|highlighted|emphasized|outlined|indicated|observed|explored|examined|explained|established|suggested|argued|proposed|contended|asserted|maintained|claimed|implied|revealed|confirmed|supported|verified|validated|elaborated)/,
  // "When it comes to" pattern
  /^When it comes to\b/,
  // "According to" (AI overuses this)
  /^According to (?:\w+ )+/,
  // "The fact that" opener
  /^The fact that\b/,
  // "What is [adj] is" cleft (AI pattern)
  /^What is (?:\w+ )?(?:important|interesting|notable|significant|clear|crucial|worth noting) (?:is|here is) that\b/,
];

/** Counts how many AI opener patterns match in a set of sentences */
export function countAIOpenerMatches(sentences: string[]): number {
  let count = 0;
  for (const sent of sentences) {
    for (const pattern of AI_OPENER_PATTERNS) {
      if (pattern.test(sent)) {
        count++;
        break;
      }
    }
  }
  return count;
}

// ══════════════════════════════════════════════════════════════════════════
// 3. STATISTICAL PATTERN SIGNATURES (What detectors actually measure)
// ══════════════════════════════════════════════════════════════════════════

export interface PatternSignature {
  name: string;
  /** Score 0-100: 0 = very human, 100 = very AI */
  score: number;
  description: string;
  fixable: boolean;
}

/** Analyze text for AI statistical signatures */
export function detectAISignatures(analysis: TextAnalysis, rawSentences: string[]): PatternSignature[] {
  const signatures: PatternSignature[] = [];
  const maps = analysis.sentences;

  // 1. Sentence length uniformity
  const lengths = maps.map(m => m.complexity.wordCount);
  const meanLen = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
  const varianceLen = lengths.reduce((a, b) => a + (b - meanLen) ** 2, 0) / (lengths.length || 1);
  const cvLen = Math.sqrt(varianceLen) / (meanLen || 1);
  signatures.push({
    name: "sentence_length_uniformity",
    score: Math.max(0, Math.min(100, Math.round((1 - cvLen) * 100))),
    description: `CV=${cvLen.toFixed(2)}. Below 0.30 is very AI-like.`,
    fixable: true,
  });

  // 2. Starter diversity
  const starters = rawSentences.map(s => s.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "");
  const uniqueStarters = new Set(starters);
  const starterDiversity = uniqueStarters.size / (starters.length || 1);
  signatures.push({
    name: "starter_diversity",
    score: Math.max(0, Math.min(100, Math.round((1 - starterDiversity) * 100))),
    description: `${uniqueStarters.size}/${starters.length} unique starters. Below 60% is AI-like.`,
    fixable: true,
  });

  // 3. Consecutive same-structure sentences
  let sameStructureRuns = 0;
  for (let i = 1; i < maps.length; i++) {
    const a = maps[i - 1];
    const b = maps[i];
    const sameVoice = a.tenseVoice.voice === b.tenseVoice.voice;
    const sameTense = a.tenseVoice.tense === b.tenseVoice.tense;
    const sameClauseCount = a.complexity.clauseCount === b.complexity.clauseCount;
    const similarLength = Math.abs(a.complexity.wordCount - b.complexity.wordCount) < 5;
    if (sameVoice && sameTense && sameClauseCount && similarLength) sameStructureRuns++;
  }
  const structureRunScore = maps.length > 1 ? (sameStructureRuns / (maps.length - 1)) * 100 : 0;
  signatures.push({
    name: "structure_monotony",
    score: Math.round(structureRunScore),
    description: `${sameStructureRuns} consecutive same-structure pairs. Above 50% is AI-like.`,
    fixable: true,
  });

  // 4. AI opener frequency
  const aiOpenerCount = countAIOpenerMatches(rawSentences);
  const openerScore = rawSentences.length > 0 ? (aiOpenerCount / rawSentences.length) * 100 : 0;
  signatures.push({
    name: "ai_opener_frequency",
    score: Math.round(openerScore),
    description: `${aiOpenerCount}/${rawSentences.length} sentences use AI opener patterns.`,
    fixable: true,
  });

  // 5. Clause complexity uniformity
  const clauseCounts = maps.map(m => m.complexity.clauseCount);
  const uniqueClauseCounts = new Set(clauseCounts);
  const clauseVariety = uniqueClauseCounts.size / (Math.min(5, maps.length) || 1);
  signatures.push({
    name: "clause_count_uniformity",
    score: Math.max(0, Math.min(100, Math.round((1 - clauseVariety) * 100))),
    description: `${uniqueClauseCounts.size} unique clause counts across ${maps.length} sentences.`,
    fixable: true,
  });

  // 6. Voice monotony
  const activeCount = maps.filter(m => m.tenseVoice.voice === "active").length;
  const voiceRatio = maps.length > 0 ? activeCount / maps.length : 0.5;
  const voiceSkew = Math.abs(voiceRatio - 0.5) * 2; // 0 = balanced, 1 = all one voice
  signatures.push({
    name: "voice_monotony",
    score: Math.round(voiceSkew * 80), // normalized to 0-80 (some skew is natural)
    description: `${Math.round(voiceRatio * 100)}% active voice. Extreme imbalance is AI-like.`,
    fixable: true,
  });

  // 7. Modifier density uniformity
  const modCounts = maps.map(m => m.modifiers.length);
  const modMean = modCounts.reduce((a, b) => a + b, 0) / (modCounts.length || 1);
  const modVariance = modCounts.reduce((a, b) => a + (b - modMean) ** 2, 0) / (modCounts.length || 1);
  const modCV = Math.sqrt(modVariance) / (modMean || 1);
  signatures.push({
    name: "modifier_density_uniformity",
    score: Math.max(0, Math.min(100, Math.round((1 - modCV) * 80))),
    description: `Modifier count CV=${modCV.toFixed(2)}. Low = robotic.`,
    fixable: true,
  });

  return signatures;
}

// ══════════════════════════════════════════════════════════════════════════
// 4. PATTERN DISRUPTION ENGINE
//    Methods to break detected AI patterns
// ══════════════════════════════════════════════════════════════════════════

/** Structure rotation — rearrange clause/phrase order within a sentence */
export function rotateStructure(sentence: string, map: StructuredSentenceMap): string {
  // If sentence has context phrases, try fronting one
  if (map.context.length > 0 && map.complexity.wordCount > 10) {
    // Pick a context phrase to front
    const ctx = map.context[map.context.length - 1]; // take last context phrase
    const ctxText = ctx.text;
    if (ctxText.split(/\s+/).length >= 2) {
      // Remove context from current position, put at front
      let result = sentence.replace(new RegExp(`\\s*${escapeRegex(ctxText)}\\s*`, "i"), " ").trim();
      // Capitalize the context phrase and add comma
      const frontedCtx = ctxText[0].toUpperCase() + ctxText.slice(1);
      result = frontedCtx + ", " + result[0].toLowerCase() + result.slice(1);
      // Fix ending punctuation
      if (!/[.!?]$/.test(result)) result += ".";
      return result;
    }
  }

  // If sentence has modifiers, try repositioning
  if (map.modifiers.length > 0 && map.modifiers[0].pos === "adv") {
    const adv = map.modifiers[0].text;
    // Move adverb to front
    let result = sentence.replace(new RegExp(`\\b${escapeRegex(adv)}\\b`, "i"), "").trim();
    result = result.replace(/ {2,}/g, " ");
    result = adv[0].toUpperCase() + adv.slice(1) + ", " + result[0].toLowerCase() + result.slice(1);
    if (!/[.!?]$/.test(result)) result += ".";
    return result;
  }

  return sentence;
}

/** Break consecutive same-starter sentences */
export function breakStarterRepetition(sentences: string[]): string[] {
  const result = [...sentences];
  const humanPrefixes = [
    "What happens is", "The thing is,", "Put simply,", "In a way,",
    "To be fair,", "Granted,", "That said,", "Truth be told,",
    "As it turns out,", "For the most part,", "In hindsight,",
    "Looking at it differently,", "From another angle,", "Oddly enough,",
    "At a glance,", "Step back and", "Zoom in and", "Taken together,",
    "On closer look,", "The key insight here is that",
    "A closer reading shows", "Dig deeper and", "Strip it down and",
    "What stands out is that", "Worth noting:", "Consider this:",
  ];

  for (let i = 1; i < result.length; i++) {
    const prevStarter = result[i - 1].split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
    const currStarter = result[i].split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";

    if (prevStarter === currStarter && result[i].split(/\s+/).length > 6) {
      const prefix = humanPrefixes[i % humanPrefixes.length];
      result[i] = prefix + " " + result[i][0].toLowerCase() + result[i].slice(1);
    }
  }

  return result;
}

/** Break syntax loops — when 3+ sentences have identical structural pattern */
export function breakSyntaxLoops(
  sentences: string[],
  maps: StructuredSentenceMap[],
): string[] {
  const result = [...sentences];

  for (let i = 2; i < maps.length; i++) {
    const m0 = maps[i - 2];
    const m1 = maps[i - 1];
    const m2 = maps[i];

    // Check if three consecutive sentences share structure
    const sameVoice = m0.tenseVoice.voice === m1.tenseVoice.voice &&
      m1.tenseVoice.voice === m2.tenseVoice.voice;
    const sameClauseCount = m0.complexity.clauseCount === m1.complexity.clauseCount &&
      m1.complexity.clauseCount === m2.complexity.clauseCount;
    const allSubjectFirst =
      (m0.subject?.index === 0) && (m1.subject?.index === 0) && (m2.subject?.index === 0);

    if (sameVoice && sameClauseCount && allSubjectFirst) {
      // Break the middle sentence by rotating its structure
      result[i - 1] = rotateStructure(result[i - 1], m1);
    }
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// 5. MICRO-NOISE INJECTION SYSTEM (MNIS)
//    Controlled imperfection = human signal
// ══════════════════════════════════════════════════════════════════════════

/** Natural comma-based hedging interjections — no brackets or em-dashes */
const _COMMA_HEDGES = [
  ", at least in theory,",
  ", or so it seems,",
  ", to some degree,",
  ", interestingly,",
  ", though not always,",
  ", perhaps unsurprisingly,",
  ", in most cases,",
  ", admittedly,",
  ", on the surface,",
  ", for better or worse,",
  ", rightly or wrongly,",
  ", all things considered,",
  ", arguably,",
  ", broadly speaking,",
  ", in practice,",
  ", to a point,",
];

/** Slight redundancy patterns — mimic how humans naturally repeat for emphasis */
const _EMPHASIS_REDUNDANCY = [
  { trigger: /\b(important)\b/i, insert: "really " },
  { trigger: /\b(clear)\b/i, insert: "quite " },
  { trigger: /\b(different)\b/i, insert: "fundamentally " },
  { trigger: /\b(difficult)\b/i, insert: "genuinely " },
  { trigger: /\b(effective)\b/i, insert: "remarkably " },
  { trigger: /\b(common)\b/i, insert: "fairly " },
  { trigger: /\b(simple)\b/i, insert: "deceptively " },
  { trigger: /\b(obvious)\b/i, insert: "seemingly " },
  { trigger: /\b(complex)\b/i, insert: "surprisingly " },
  { trigger: /\b(useful)\b/i, insert: "genuinely " },
];

/** Asymmetrical emphasis markers */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _EMPHASIS_MARKERS = [
  { pattern: /^(.{20,}?)\.\s*$/, replacement: "$1, and that matters." },
  { pattern: /^(.{20,}?)\.\s*$/, replacement: "$1, which says a lot." },
  { pattern: /^(.{20,}?)\.\s*$/, replacement: "$1. That part is worth sitting with." },
];

/**
 * Inject controlled micro-noise into a sentence.
 * This is NOT random — it's calibrated to mimic human imperfection.
 *
 * @param sentence The sentence to inject noise into
 * @param sentenceIndex Index in the paragraph (controls injection frequency)
 * @param totalSentences Total sentences in text
 * @returns Modified sentence with subtle human imperfections
 */
export function injectMicroNoise(
  sentence: string,
  sentenceIndex: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _totalSentences: number,
): string {
  let result = sentence;
  const words = result.split(/\s+/).length;

  // Only inject noise in longer sentences and not too frequently
  // Target: ~15-25% of sentences get some form of noise
  const shouldInject = (sentenceIndex * 7 + 3) % 5 === 0; // deterministic, not random
  if (!shouldInject || words < 12) return result;

  const noiseType = sentenceIndex % 3;

  switch (noiseType) {
    case 0: {
      // DISABLED — comma-hedge injection adds unnecessary fillers
      break;
    }
    case 1: {
      // DISABLED — emphasis redundancy adds unnecessary modifiers
      break;
    }
    case 2: {
      // Semicolon substitution for comma (human style) — no em-dashes
      if (words > 18) {
        const commaPositions: number[] = [];
        for (let i = 10; i < result.length - 10; i++) {
          if (result[i] === "," && result[i - 1] !== ",") commaPositions.push(i);
        }
        if (commaPositions.length > 0) {
          const pickIdx = commaPositions[sentenceIndex % commaPositions.length];
          result = result.slice(0, pickIdx) + ";" + result.slice(pickIdx + 1);
        }
      }
      break;
    }
  }

  return result;
}

/**
 * Apply micro-noise across all sentences in text.
 * Targets 15-25% of sentences for subtle human imperfection injection.
 *
 * @returns Array of sentences with controlled noise applied
 */
export function applyMicroNoiseToText(sentences: string[]): string[] {
  return sentences.map((sent, i) => injectMicroNoise(sent, i, sentences.length));
}

// ══════════════════════════════════════════════════════════════════════════
// 6. COMPREHENSIVE DISRUPTION PIPELINE
//    Runs all APDE + MNIS passes in sequence
// ══════════════════════════════════════════════════════════════════════════

export interface DisruptionResult {
  sentences: string[];
  signaturesDetected: PatternSignature[];
  patternsDisrupted: string[];
}

/**
 * Full AI pattern disruption pipeline.
 * Detects AI signatures, then applies targeted disruption.
 */
export function disruptAIPatterns(
  sentences: string[],
  analysis: TextAnalysis,
): DisruptionResult {
  let result = [...sentences];
  const patternsDisrupted: string[] = [];

  // 1. Detect all AI signatures
  const signatures = detectAISignatures(analysis, sentences);

  // 2. Check structural patterns
  const maps = analysis.sentences;
  for (const [, pattern] of Object.entries(LLM_STRUCTURAL_PATTERNS)) {
    if (pattern.detectFn(maps)) {
      patternsDisrupted.push(pattern.name);
    }
  }

  // 3. Break starter repetition
  const starterSig = signatures.find(s => s.name === "starter_diversity");
  if (starterSig && starterSig.score > 40) {
    result = breakStarterRepetition(result);
    patternsDisrupted.push("starter_repetition");
  }

  // 4. Break syntax loops
  const structureSig = signatures.find(s => s.name === "structure_monotony");
  if (structureSig && structureSig.score > 50) {
    result = breakSyntaxLoops(result, maps);
    patternsDisrupted.push("syntax_loops");
  }

  // 5. Structure rotation for remaining uniform patterns
  const svoPattern = LLM_STRUCTURAL_PATTERNS.uniformSVO.detectFn(maps);
  if (svoPattern) {
    // Rotate structure for every 3rd sentence
    for (let i = 2; i < result.length; i += 3) {
      if (maps[i]) {
        result[i] = rotateStructure(result[i], maps[i]);
      }
    }
    patternsDisrupted.push("uniform_svo_rotation");
  }

  // 6. Apply micro-noise injection
  result = applyMicroNoiseToText(result);
  patternsDisrupted.push("micro_noise");

  return {
    sentences: result,
    signaturesDetected: signatures,
    patternsDisrupted,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// HELPER
// ══════════════════════════════════════════════════════════════════════════

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
