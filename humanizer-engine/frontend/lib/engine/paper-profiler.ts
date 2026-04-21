/**
 * Paper Profiler (Stage 1)
 * =========================
 * Intelligence layer that characterizes a paper on every dimension the
 * adaptive strategy selector needs. Runs once, feeds every downstream
 * phase so none of them need to re-detect the same things.
 *
 * Dimensions produced:
 *   • Domain         (STEM / medical / legal / business / humanities / ...)
 *   • Register       (journal / academic-essay / professional-report / blog / narrative / general)
 *   • Length bucket  (short / medium / long / very-long)
 *   • Sections       (abstract / introduction / methods / results / discussion / conclusion / references / body)
 *   • Audience       (peer-review / general / student)
 *   • Per-paragraph composite AI metrics
 *     - burstiness (length CV)
 *     - lexical diversity (TTR)
 *     - AI vocabulary density
 *     - hedging density
 *     - participial padding
 *     - rule-of-three frequency
 *     - promotional/significance inflation score
 *     - connector density
 *     - composite AI score (0-100)
 *   • Structural features (citations, formulas, code blocks, lists, tables)
 *
 * Pure-TS. No ML dependencies. Runs in ~50-200ms for papers up to 20k words.
 */

import { detectDomain, type DomainResult, type Domain } from "./domain-detector";
import { analyze as analyzeContext, type TextContext } from "./context-analyzer";
import { robustSentenceSplit } from "./content-protection";
import { looksLikeHeadingLine } from "./structure-preserver";

// ── Types ─────────────────────────────────────────────────────────────

export type Register =
  | "journal"            // peer-reviewed journal article
  | "academic-essay"     // undergraduate / course essay
  | "professional-report" // business / industry report
  | "technical-doc"      // technical documentation
  | "blog"               // informal long-form
  | "narrative"          // creative / storytelling
  | "general";

export type LengthBucket = "short" | "medium" | "long" | "very-long";

export type SectionKind =
  | "title"
  | "abstract"
  | "introduction"
  | "background"
  | "methods"
  | "results"
  | "discussion"
  | "conclusion"
  | "references"
  | "body";

export type Audience = "peer-review" | "general" | "student";

export interface ParagraphMetrics {
  index: number;
  wordCount: number;
  sentenceCount: number;
  burstinessCV: number;            // stddev/mean of sentence lengths (higher = more human)
  lexicalDiversity: number;        // type-token ratio
  aiVocabDensity: number;          // 0-1, share of AI marker words
  hedgingDensity: number;          // 0-1, hedging phrase count / sentence
  participialPadding: number;      // 0-1, -ing phrases at sentence tail
  ruleOfThreeCount: number;        // 0+, number of "X, Y, and Z" patterns
  promotionalScore: number;        // 0-1, superlative + inflation density
  connectorDensity: number;        // 0-1, formal connector density
  copulaAvoidance: number;         // 0-1, "serves as / functions as" density
  compositeAiScore: number;        // 0-100 aggregate
  sectionKind: SectionKind;
}

export interface PaperSection {
  kind: SectionKind;
  startParagraph: number;
  endParagraph: number;            // inclusive
  heading?: string;
  wordCount: number;
}

export interface PaperProfile {
  // Basic text facts
  totalWords: number;
  totalParagraphs: number;
  totalSentences: number;
  avgSentenceLength: number;
  avgParagraphLength: number;

  // Classification
  domain: DomainResult;            // reuse existing domain detector
  register: Register;
  lengthBucket: LengthBucket;
  audience: Audience;
  topics: string[];
  primaryTopic: string;
  toneHeuristic: string;           // from context-analyzer (formal/casual/persuasive/neutral)

  // Structure
  hasCitations: boolean;
  hasEquations: boolean;
  hasCodeBlocks: boolean;
  hasLists: boolean;
  hasFirstPerson: boolean;
  hasHeadings: boolean;

  // Sections
  sections: PaperSection[];

  // Per-paragraph metrics
  paragraphMetrics: ParagraphMetrics[];

  // Derived aggregate scores
  overallBurstiness: number;       // mean CV across paragraphs
  overallLexicalDiversity: number;
  overallAiDensity: number;        // weighted across paragraphs
  overallCompositeAi: number;      // 0-100
  worstParagraphIndex: number;     // index of paragraph with highest compositeAiScore

  // Passthrough objects
  context: TextContext;
}

// ── Lexicon ───────────────────────────────────────────────────────────

const AI_VOCABULARY = new Set([
  "utilize", "utilise", "leverage", "facilitate", "comprehensive",
  "multifaceted", "paramount", "furthermore", "moreover", "additionally",
  "consequently", "subsequently", "nevertheless", "notwithstanding",
  "aforementioned", "paradigm", "methodology", "framework", "trajectory",
  "discourse", "underpinning", "synergy", "robust", "nuanced", "salient",
  "ubiquitous", "pivotal", "intricate", "meticulous", "profound", "inherent",
  "overarching", "holistic", "transformative", "innovative", "groundbreaking",
  "cutting-edge", "state-of-the-art", "noteworthy", "proliferate",
  "exacerbate", "ameliorate", "engender", "delineate", "elucidate",
  "underscore", "exemplify", "encompass", "bolster", "navigate",
  "articulate", "substantiate", "corroborate", "disseminate", "cultivate",
  "delve", "embark", "foster", "harness", "spearhead", "unravel", "unveil",
  "notably", "specifically", "crucially", "importantly", "significantly",
  "essentially", "fundamentally", "arguably", "undeniably",
  "realm", "landscape", "tapestry", "cornerstone", "bedrock", "catalyst",
  "nexus", "spectrum", "myriad", "plethora", "testament", "showcase",
  "highlight",
]);

const HEDGING_PHRASES: RegExp[] = [
  /\bit (?:could|may|might) be (?:argued|suggested|said)\b/i,
  /\bit is worth noting\b/i,
  /\bone (?:might|could) (?:argue|suggest|say|consider)\b/i,
  /\bit is (?:important|crucial|essential|vital) (?:to note )?that\b/i,
  /\bit (?:should|must|can) be (?:noted|argued|emphasized) that\b/i,
  /\bit is (?:widely|generally|commonly) (?:known|recognized|accepted)\b/i,
  /\bit appears that\b/i,
  /\bit seems that\b/i,
];

const FORMAL_CONNECTORS = new Set([
  "furthermore", "moreover", "additionally", "consequently",
  "subsequently", "nevertheless", "notwithstanding", "accordingly",
  "thus", "hence", "therefore", "similarly", "conversely",
  "specifically", "notably", "indeed",
]);

const PROMOTIONAL_WORDS = new Set([
  "groundbreaking", "revolutionary", "pivotal", "unprecedented",
  "cutting-edge", "state-of-the-art", "next-generation", "paradigm-shifting",
  "game-changing", "world-class", "best-in-class", "industry-leading",
  "transformative", "visionary", "remarkable", "extraordinary",
  "exceptional", "outstanding", "phenomenal", "stellar",
]);

const COPULA_AVOIDANCE_RE = /\b(?:serves? as|functions? as|stands? as|acts? as|operates? as)\b/i;

// ── Section heading patterns ──────────────────────────────────────────

const SECTION_PATTERNS: Array<{ kind: SectionKind; patterns: RegExp[] }> = [
  { kind: "abstract", patterns: [/\babstract\b/i, /\bsummary\b/i, /\boverview\b/i] },
  { kind: "introduction", patterns: [/\bintroduction\b/i, /\bbackground\b/i, /^1\.?\s+intro/i] },
  { kind: "background", patterns: [/\bliterature review\b/i, /\brelated work\b/i, /\bprior work\b/i] },
  { kind: "methods", patterns: [/\bmethodolog(?:y|ies)\b/i, /\bmethods?\b/i, /\bapproach\b/i, /\bmaterials\b/i, /\bstudy design\b/i, /\bexperimental setup\b/i] },
  { kind: "results", patterns: [/\bresults?\b/i, /\bfindings\b/i, /\bexperiments?\b/i] },
  { kind: "discussion", patterns: [/\bdiscussion\b/i, /\banalysis\b/i, /\binterpretation\b/i] },
  { kind: "conclusion", patterns: [/\bconclusions?\b/i, /\bimplications\b/i, /\bfuture work\b/i, /\bsummary and conclusions?\b/i] },
  { kind: "references", patterns: [/\breferences\b/i, /\bbibliography\b/i, /\bworks cited\b/i, /\bcitations\b/i] },
];

// ── Helpers ───────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdDev(arr: number[]): number {
  const m = mean(arr);
  if (arr.length === 0) return 0;
  const v = arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
}

function wordsOf(text: string): string[] {
  return (text.toLowerCase().match(/[a-z']+/g) ?? []);
}

// ── Register detection ────────────────────────────────────────────────

function detectRegister(text: string, ctx: TextContext, domain: DomainResult): Register {
  const lower = text.toLowerCase();

  // Structural signals
  const citationCount = (text.match(/\([A-Z][a-z]+(?:\s+et\s+al\.)?,?\s*\d{4}[a-z]?\)/g) ?? []).length
    + (text.match(/\[\d+\]/g) ?? []).length;
  const numberedSections = (text.match(/^\d+\.\s+[A-Z]/gm) ?? []).length;
  const headingCount = text.split("\n").filter((line) => looksLikeHeadingLine(line.trim())).length;
  const contractionCount = (text.match(/\b(?:don't|can't|won't|isn't|aren't|wasn't|weren't|didn't|doesn't|hasn't|haven't|hadn't|shouldn't|wouldn't|couldn't|i've|i'll|we've|we'll|they've|they'll|you've|you'll)\b/gi) ?? []).length;
  const firstPersonCount = (text.match(/\b(?:I|we|my|our|me|us)\b/g) ?? []).length;
  const exclamations = (text.match(/!/g) ?? []).length;
  const rhetoricalQuestions = (text.match(/\?/g) ?? []).length;

  const wordCount = ctx.totalWords;
  const perKiloWord = (n: number) => (wordCount > 0 ? (n / wordCount) * 1000 : 0);

  const citationDensity = perKiloWord(citationCount);
  const contractionDensity = perKiloWord(contractionCount);
  const firstPersonDensity = perKiloWord(firstPersonCount);
  const exclamationDensity = perKiloWord(exclamations);

  // Rule: journal = heavy citations + formal register + structured sections
  if (citationDensity >= 4 && numberedSections >= 2 && contractionDensity < 1) {
    return "journal";
  }

  // Rule: technical-doc = code patterns or API/function language + minimal citations
  if ((domain.primary === "technical" || domain.primary === "stem")
    && /\b(?:function|variable|parameter|endpoint|api|config|install|deploy|build)\b/i.test(lower)
    && citationDensity < 2) {
    return "technical-doc";
  }

  // Rule: narrative/blog = high first-person + contractions + exclamations
  if (firstPersonDensity >= 8 && (contractionDensity >= 3 || exclamationDensity >= 1)) {
    return domain.primary === "creative" ? "narrative" : "blog";
  }

  // Rule: blog = contractions present, modest citations, some rhetorical questions
  if (contractionDensity >= 2 && citationDensity < 2 && headingCount <= 2) {
    return "blog";
  }

  // Rule: academic-essay = some citations and third-person (no I/we) — even
  // when the overall tone heuristic is only "neutral".
  if (citationDensity >= 1 && firstPersonDensity < 2 && contractionDensity < 1) {
    return "academic-essay";
  }

  // Rule: academic-essay = moderate formality, some citations, few headings
  if (ctx.tone === "formal" && citationDensity >= 1 && citationDensity < 5) {
    return "academic-essay";
  }

  // Rule: professional-report = structured + business language + minimal citations
  if (domain.primary === "business" && (headingCount >= 2 || numberedSections >= 2)) {
    return "professional-report";
  }

  // Rule: academic-essay when formal-ish without many citations
  if (ctx.tone === "formal") return "academic-essay";

  // Rule: academic-essay when the text is clearly third-person scholarly
  // prose (no first-person, no contractions) with an academic domain.
  if (
    (domain.primary === "academic" || domain.primary === "humanities" || domain.primary === "stem") &&
    firstPersonDensity < 1 && contractionDensity < 1
  ) {
    return "academic-essay";
  }

  return "general";
}

// ── Length bucket ─────────────────────────────────────────────────────

function bucketLength(wordCount: number): LengthBucket {
  if (wordCount < 500) return "short";
  if (wordCount < 2000) return "medium";
  if (wordCount < 5000) return "long";
  return "very-long";
}

// ── Audience inference ────────────────────────────────────────────────

function inferAudience(register: Register, domain: Domain): Audience {
  if (register === "journal") return "peer-review";
  if (register === "academic-essay") return "student";
  if (register === "technical-doc" && (domain === "stem" || domain === "technical")) return "peer-review";
  if (register === "blog" || register === "narrative") return "general";
  if (register === "professional-report") return "general";
  return "general";
}

// ── Section segmentation ──────────────────────────────────────────────

function detectSectionKind(headingText: string): SectionKind | null {
  const trimmed = headingText.trim();
  if (!trimmed) return null;
  // Strip leading numbers / punctuation
  const cleaned = trimmed.replace(/^[\d.\s]*[-.)]?\s*/, "").trim();
  for (const { kind, patterns } of SECTION_PATTERNS) {
    if (patterns.some((p) => p.test(cleaned))) return kind;
  }
  return null;
}

function segmentSections(paragraphs: string[]): PaperSection[] {
  if (paragraphs.length === 0) return [];

  const sections: PaperSection[] = [];
  let currentKind: SectionKind = "body";
  let currentHeading: string | undefined = undefined;
  let currentStart = 0;
  let currentWords = 0;

  // Heuristic: very first short paragraph often acts as title
  let startIndex = 0;
  const firstParaWords = wordsOf(paragraphs[0]).length;
  const firstIsTitle =
    firstParaWords > 0 &&
    firstParaWords <= 15 &&
    !/[.!?]\s*$/.test(paragraphs[0].trim()) &&
    /[A-Z]/.test(paragraphs[0].charAt(0));
  if (firstIsTitle) {
    sections.push({
      kind: "title",
      startParagraph: 0,
      endParagraph: 0,
      heading: paragraphs[0].trim(),
      wordCount: firstParaWords,
    });
    startIndex = 1;
  }

  const flush = (endIdx: number) => {
    if (endIdx < currentStart) return;
    sections.push({
      kind: currentKind,
      startParagraph: currentStart,
      endParagraph: endIdx,
      heading: currentHeading,
      wordCount: currentWords,
    });
  };

  for (let i = startIndex; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const firstLine = para.split("\n")[0].trim();
    const looksHeading = looksLikeHeadingLine(firstLine) ||
      (firstLine.length > 0 && firstLine.length <= 80 &&
        !/[.!?]$/.test(firstLine) &&
        firstLine.split(/\s+/).length <= 10 &&
        /^[A-Z0-9]/.test(firstLine));

    if (looksHeading) {
      const kind = detectSectionKind(firstLine);
      if (kind) {
        // Close previous section
        flush(i - 1);
        currentKind = kind;
        currentHeading = firstLine;
        currentStart = i;
        currentWords = 0;
        continue;
      }
    }

    currentWords += wordsOf(para).length;
  }
  flush(paragraphs.length - 1);

  // Filter out empty sections (where start > end)
  return sections.filter((s) => s.endParagraph >= s.startParagraph);
}

function kindForParagraph(sections: PaperSection[], paraIdx: number): SectionKind {
  for (const s of sections) {
    if (paraIdx >= s.startParagraph && paraIdx <= s.endParagraph) return s.kind;
  }
  return "body";
}

// ── Per-paragraph metrics ─────────────────────────────────────────────

function computeParagraphMetrics(
  paragraph: string,
  index: number,
  sectionKind: SectionKind,
): ParagraphMetrics {
  const sentences = robustSentenceSplit(paragraph);
  const sentenceCount = Math.max(sentences.length, 1);
  const allWords = wordsOf(paragraph);
  const wordCount = allWords.length;

  // 1. Burstiness — CV of sentence lengths
  const sentLengths = sentences.map((s) => wordsOf(s).length);
  const avgLen = mean(sentLengths);
  const burstinessCV = avgLen > 0 ? stdDev(sentLengths) / avgLen : 0;

  // 2. Lexical diversity (type-token ratio)
  const uniq = new Set(allWords);
  const lexicalDiversity = wordCount > 0 ? uniq.size / wordCount : 0;

  // 3. AI vocabulary density
  const aiMatches = allWords.filter((w) => AI_VOCABULARY.has(w)).length;
  const aiVocabDensity = wordCount > 0 ? aiMatches / wordCount : 0;

  // 4. Hedging density
  let hedgingCount = 0;
  for (const re of HEDGING_PHRASES) {
    const m = paragraph.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"));
    if (m) hedgingCount += m.length;
  }
  const hedgingDensity = sentenceCount > 0 ? hedgingCount / sentenceCount : 0;

  // 5. Participial padding — "-ing X, -ing Y, -ing Z" tails
  let participialCount = 0;
  for (const s of sentences) {
    const m = s.match(/,\s+(\w+ing\b[^.!?]*)[.!?]?$/);
    if (m && m[1].split(/\s+/).length >= 3) participialCount++;
  }
  const participialPadding = sentenceCount > 0 ? participialCount / sentenceCount : 0;

  // 6. Rule-of-three — "X, Y, and Z"
  const ruleOfThreeMatches = paragraph.match(/\b\w+\s*,\s+\w+[\w\s]*,\s+and\s+\w+/g) ?? [];
  const ruleOfThreeCount = ruleOfThreeMatches.length;

  // 7. Promotional score
  const promoMatches = allWords.filter((w) => PROMOTIONAL_WORDS.has(w)).length;
  const promotionalScore = wordCount > 0 ? promoMatches / wordCount : 0;

  // 8. Connector density
  const connectorMatches = allWords.filter((w) => FORMAL_CONNECTORS.has(w)).length;
  const connectorDensity = sentenceCount > 0 ? connectorMatches / sentenceCount : 0;

  // 9. Copula avoidance
  const copulaMatches = (paragraph.match(new RegExp(COPULA_AVOIDANCE_RE.source, "gi")) ?? []).length;
  const copulaAvoidance = sentenceCount > 0 ? copulaMatches / sentenceCount : 0;

  // 10. Composite AI score (weighted blend, 0-100)
  // Higher = more AI-like. Weights tuned so typical AI text scores 60-85.
  const burstinessScore = Math.max(0, 1 - burstinessCV / 0.55) * 100; // Low CV = AI
  const diversityScore = Math.max(0, 1 - Math.min(lexicalDiversity, 0.65) / 0.65) * 100; // Low TTR = AI
  const aiVocabScore = Math.min(1, aiVocabDensity / 0.08) * 100;
  const hedgingScore = Math.min(1, hedgingDensity / 0.3) * 100;
  const participialScore = Math.min(1, participialPadding / 0.3) * 100;
  const r3Score = sentenceCount > 0 ? Math.min(1, ruleOfThreeCount / Math.max(1, sentenceCount * 0.3)) * 100 : 0;
  const promoScore = Math.min(1, promotionalScore / 0.02) * 100;
  const connectorScore = Math.min(1, connectorDensity / 0.4) * 100;
  const copulaScore = Math.min(1, copulaAvoidance / 0.15) * 100;

  const compositeAiScore = Math.round(
    burstinessScore * 0.22 +
    aiVocabScore * 0.18 +
    hedgingScore * 0.10 +
    participialScore * 0.08 +
    r3Score * 0.08 +
    promoScore * 0.06 +
    connectorScore * 0.12 +
    copulaScore * 0.06 +
    diversityScore * 0.10,
  );

  return {
    index,
    wordCount,
    sentenceCount,
    burstinessCV,
    lexicalDiversity,
    aiVocabDensity,
    hedgingDensity,
    participialPadding,
    ruleOfThreeCount,
    promotionalScore,
    connectorDensity,
    copulaAvoidance,
    compositeAiScore,
    sectionKind,
  };
}

// ── Structural feature detection ──────────────────────────────────────

function detectStructuralFeatures(text: string): {
  hasCitations: boolean;
  hasEquations: boolean;
  hasCodeBlocks: boolean;
  hasLists: boolean;
  hasHeadings: boolean;
} {
  const hasCitations =
    /\([A-Z][a-z]+(?:\s+et\s+al\.)?,?\s*\d{4}[a-z]?\)/.test(text) ||
    /\[\d+\]/.test(text) ||
    /\b(?:et\s+al\.|ibid\.|op\.\s*cit\.)/i.test(text);
  const hasEquations =
    /\$[^$\n]+\$/.test(text) ||
    /\\\(.*\\\)/.test(text) ||
    /[=+\-*/]\s*\d+.*[=+\-*/]/.test(text) ||
    /\b\d+\s*[×x]\s*\d+\b/.test(text);
  const hasCodeBlocks =
    /```[\s\S]*?```/.test(text) ||
    /`[^`\n]+`/.test(text) ||
    /^[ \t]{4,}\S/m.test(text);
  const hasLists =
    /^\s*(?:[-•*]|\d+[.)])\s+\S/m.test(text);
  const hasHeadings = text.split("\n").some((line) => looksLikeHeadingLine(line.trim()));
  return { hasCitations, hasEquations, hasCodeBlocks, hasLists, hasHeadings };
}

// ── Main entry point ──────────────────────────────────────────────────

export function profilePaper(text: string): PaperProfile {
  const trimmed = text.trim();
  const paragraphs = splitParagraphs(trimmed);
  const context = analyzeContext(trimmed);
  const domain = detectDomain(trimmed);
  const register = detectRegister(trimmed, context, domain);
  const lengthBucket = bucketLength(context.totalWords);
  const audience = inferAudience(register, domain.primary);

  // Sections
  const sections = segmentSections(paragraphs);

  // Per-paragraph metrics
  const paragraphMetrics: ParagraphMetrics[] = paragraphs.map((p, i) =>
    computeParagraphMetrics(p, i, kindForParagraph(sections, i)),
  );

  // Structural features
  const structural = detectStructuralFeatures(trimmed);

  // Aggregates
  const cvs = paragraphMetrics.map((m) => m.burstinessCV);
  const ttrs = paragraphMetrics.map((m) => m.lexicalDiversity);
  const aiDensities = paragraphMetrics.map((m) => m.aiVocabDensity);
  const composites = paragraphMetrics.map((m) => m.compositeAiScore);

  const totalWordsInParas = paragraphMetrics.reduce((s, m) => s + m.wordCount, 0);
  const weightedComposite = totalWordsInParas > 0
    ? paragraphMetrics.reduce((s, m) => s + m.compositeAiScore * m.wordCount, 0) / totalWordsInParas
    : 0;
  const weightedAiDensity = totalWordsInParas > 0
    ? paragraphMetrics.reduce((s, m) => s + m.aiVocabDensity * m.wordCount, 0) / totalWordsInParas
    : 0;

  let worstParagraphIndex = 0;
  let worstScore = -1;
  for (const m of paragraphMetrics) {
    if (m.compositeAiScore > worstScore) {
      worstScore = m.compositeAiScore;
      worstParagraphIndex = m.index;
    }
  }

  const totalSentences = paragraphMetrics.reduce((s, m) => s + m.sentenceCount, 0);
  const avgSentenceLength = totalSentences > 0
    ? paragraphMetrics.reduce((s, m) => s + m.sentenceCount * (m.wordCount / Math.max(1, m.sentenceCount)), 0) / totalSentences
    : 0;
  const avgParagraphLength = paragraphs.length > 0 ? totalWordsInParas / paragraphs.length : 0;

  return {
    totalWords: context.totalWords,
    totalParagraphs: paragraphs.length,
    totalSentences,
    avgSentenceLength,
    avgParagraphLength,

    domain,
    register,
    lengthBucket,
    audience,
    topics: context.topics,
    primaryTopic: context.primaryTopic,
    toneHeuristic: context.tone,

    hasCitations: structural.hasCitations,
    hasEquations: structural.hasEquations,
    hasCodeBlocks: structural.hasCodeBlocks,
    hasLists: structural.hasLists,
    hasFirstPerson: context.hasFirstPerson,
    hasHeadings: structural.hasHeadings,

    sections,
    paragraphMetrics,

    overallBurstiness: mean(cvs),
    overallLexicalDiversity: mean(ttrs),
    overallAiDensity: weightedAiDensity,
    overallCompositeAi: Math.round(weightedComposite),
    worstParagraphIndex,

    context,
  };
}

// ── Utility: brief summary for logging ────────────────────────────────

export function summarizeProfile(p: PaperProfile): string {
  const parts = [
    `domain=${p.domain.primary}(${Math.round(p.domain.confidence * 100)}%)`,
    `register=${p.register}`,
    `length=${p.lengthBucket}(${p.totalWords}w)`,
    `audience=${p.audience}`,
    `aiComposite=${p.overallCompositeAi}`,
    `burstiness=${p.overallBurstiness.toFixed(2)}`,
    `sections=${p.sections.map((s) => s.kind).join(",") || "body"}`,
  ];
  return parts.join(" | ");
}
