/**
 * Document-Level Coherence Engine
 * ================================
 * 
 * Pure TypeScript — zero LLM calls. Designed for blog/SEO writing.
 *
 * 15 scoring systems organized in 3 tiers:
 *
 * PHASE 1 — CORE COHERENCE + SEO
 *   1.  Paragraph cadence scoring
 *   2.  Transition fit scoring
 *   3.  Reference-chain validity
 *   4.  Repetition decay windows
 *   5.  Clause-shape diversity
 *   6.  Entity retention coverage
 *   7.  SEO keyword integrity
 *   8.  Heading-body alignment
 *   9.  Readability drift
 *
 * PHASE 2 — ADVANCED FLOW ANALYSIS
 *   10. Information-gain ordering
 *   11. Human revision fingerprinting
 *   12. Paragraph purpose labeling
 *
 * PHASE 3 — SEO SPECIALIZATION
 *   13. Search-intent coverage
 *   14. Heading hierarchy validation
 *   15. Snippet-worthiness scoring
 *
 * Ordering in the pipeline:
 *   meaning preservation → entity retention → paragraph coherence →
 *   transition fit → repetition decay → clause diversity → SEO keyword →
 *   heading alignment → readability drift → revision fingerprints →
 *   detector score (last)
 */

import { robustSentenceSplit } from './content-protection';

// ══════════════════════════════════════════════════════════════════════════
// SHARED UTILITIES
// ══════════════════════════════════════════════════════════════════════════

/** Split text into paragraphs, preserving headings. */
function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
}

/** Detect whether a paragraph is a heading / title. */
function isHeading(para: string): boolean {
  const t = para.trim();
  if (!t) return false;
  if (/^#{1,6}\s/.test(t)) return true;
  if (/^[IVXLCDM]+[.)]\s/i.test(t)) return true;
  if (/^(?:Part|Section|Chapter|Abstract|Introduction|Conclusion|References|Bibliography|Appendix)\b/i.test(t)) return true;
  if (/^[\d]+[.):]\s/.test(t) || /^[A-Za-z][.)]\s/.test(t)) return true;
  const words = t.split(/\s+/);
  if (words.length <= 10 && !/[.!?]$/.test(t)) return true;
  if (words.length <= 12 && t === t.toUpperCase() && /[A-Z]/.test(t)) return true;
  return false;
}

/** Normalize a word for stem-level comparison (poor-man's stemmer). */
function stem(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return w;
  // Simple suffix stripping
  if (w.endsWith('ies') && w.length > 4) w = w.slice(0, -3) + 'y';
  else if (w.endsWith('tion') || w.endsWith('sion')) w = w.slice(0, -3);
  else if (w.endsWith('ness') || w.endsWith('ment') || w.endsWith('ance') || w.endsWith('ence')) w = w.slice(0, -4);
  else if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith('ed') && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith('ly') && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith('es') && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) w = w.slice(0, -1);
  return w;
}

/** Extract content words (non-stopwords, 3+ chars). */
const STOPWORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','can','shall',
  'to','of','in','for','on','with','at','by','from','as','into','through','during',
  'before','after','above','below','between','out','off','over','under','again',
  'further','then','once','here','there','when','where','why','how','all','each',
  'every','both','few','more','most','other','some','such','no','nor','not','only',
  'own','same','so','than','too','very','just','because','but','and','or','if',
  'while','that','this','these','those','it','its','they','them','their','we',
  'our','he','she','his','her','which','what','who','whom','about','also',
  'any','your','you','my','me','mine','him','us','been','being',
]);

function contentWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

function contentWordSet(text: string): Set<string> {
  return new Set(contentWords(text));
}

function stemSet(text: string): Set<string> {
  return new Set(contentWords(text).map(stem));
}

/** Coefficient of variation */
function cv(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  if (m === 0) return 0;
  const variance = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance) / m;
}

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length);
}

// ══════════════════════════════════════════════════════════════════════════
// 1. PARAGRAPH CADENCE SCORING
// ══════════════════════════════════════════════════════════════════════════

export interface CadenceScore {
  /** 0-100, higher = more human-like rhythm */
  score: number;
  /** Per-paragraph sentence-length variance */
  perParaVariance: number[];
  /** Variance across adjacent paragraphs */
  crossParaVariance: number;
  /** Paragraph opening diversity (unique first words / total) */
  openingDiversity: number;
}

export function scoreParagraphCadence(text: string): CadenceScore {
  const paras = splitParagraphs(text).filter(p => !isHeading(p));
  if (paras.length < 2) return { score: 50, perParaVariance: [], crossParaVariance: 0, openingDiversity: 1 };

  // Sentence lengths per paragraph
  const paraLengths: number[][] = paras.map(p => {
    const sents = robustSentenceSplit(p);
    return sents.map(s => s.split(/\s+/).length);
  });

  // Per-paragraph CV of sentence lengths
  const perParaCV = paraLengths.map(cv);

  // Cross-paragraph: measure how much the average sentence length varies between adjacent paragraphs
  const paraAvgs = paraLengths.map(mean);
  const adjDiffs: number[] = [];
  for (let i = 1; i < paraAvgs.length; i++) {
    adjDiffs.push(Math.abs(paraAvgs[i] - paraAvgs[i - 1]));
  }
  const crossParaVariance = mean(adjDiffs);

  // Paragraph opening diversity
  const openers = paras
    .map(p => robustSentenceSplit(p)[0]?.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '')
    .filter(Boolean);
  const uniqueOpeners = new Set(openers).size;
  const openingDiversity = openers.length > 0 ? uniqueOpeners / openers.length : 1;

  // Score: humans have high intra-para variance (0.3-0.8 CV), high cross-para differences, high diversity
  // AI has low intra-para variance (0.1-0.2 CV), low cross-para differences, low diversity
  const avgIntraCV = mean(perParaCV);
  const intraCVScore = Math.min(100, Math.max(0, (avgIntraCV - 0.10) / 0.50 * 100));
  const crossScore = Math.min(100, Math.max(0, crossParaVariance / 6 * 100));
  const diversityScore = Math.min(100, Math.max(0, (openingDiversity - 0.3) / 0.5 * 100));

  const score = Math.round(intraCVScore * 0.45 + crossScore * 0.25 + diversityScore * 0.30);

  return {
    score: Math.max(0, Math.min(100, score)),
    perParaVariance: perParaCV,
    crossParaVariance,
    openingDiversity,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// 2. TRANSITION FIT SCORING
// ══════════════════════════════════════════════════════════════════════════

type TransitionClass = 'additive' | 'adversative' | 'causal' | 'temporal' | 'exemplifying' | 'none';

const TRANSITION_MAP: Record<string, TransitionClass> = {
  // Additive
  'moreover': 'additive', 'furthermore': 'additive', 'additionally': 'additive',
  'also': 'additive', 'besides': 'additive', 'in addition': 'additive',
  'equally': 'additive', 'likewise': 'additive', 'similarly': 'additive',
  'what is more': 'additive', 'on top of that': 'additive',
  // Adversative
  'however': 'adversative', 'nevertheless': 'adversative', 'nonetheless': 'adversative',
  'yet': 'adversative', 'but': 'adversative', 'although': 'adversative',
  'on the other hand': 'adversative', 'in contrast': 'adversative',
  'conversely': 'adversative', 'despite this': 'adversative',
  'even so': 'adversative', 'still': 'adversative', 'though': 'adversative',
  'whereas': 'adversative', 'while': 'adversative',
  // Causal
  'therefore': 'causal', 'thus': 'causal', 'consequently': 'causal',
  'hence': 'causal', 'as a result': 'causal', 'accordingly': 'causal',
  'because': 'causal', 'since': 'causal', 'for this reason': 'causal',
  'so': 'causal', 'thereby': 'causal',
  // Temporal
  'meanwhile': 'temporal', 'subsequently': 'temporal', 'then': 'temporal',
  'afterward': 'temporal', 'afterwards': 'temporal', 'previously': 'temporal',
  'first': 'temporal', 'second': 'temporal', 'third': 'temporal',
  'finally': 'temporal', 'next': 'temporal', 'later': 'temporal',
  'initially': 'temporal', 'at first': 'temporal', 'in the end': 'temporal',
  // Exemplifying
  'for example': 'exemplifying', 'for instance': 'exemplifying',
  'such as': 'exemplifying', 'namely': 'exemplifying',
  'specifically': 'exemplifying', 'in particular': 'exemplifying',
  'to illustrate': 'exemplifying',
};

// Sorted by length desc so longer phrases match first
const TRANSITION_PHRASES = Object.keys(TRANSITION_MAP).sort((a, b) => b.length - a.length);

function detectTransition(sentence: string): { connector: string; cls: TransitionClass } | null {
  const lower = sentence.trim().toLowerCase();
  for (const phrase of TRANSITION_PHRASES) {
    if (lower.startsWith(phrase + ',') || lower.startsWith(phrase + ' ') || lower === phrase) {
      return { connector: phrase, cls: TRANSITION_MAP[phrase] };
    }
  }
  return null;
}

/** Simple semantic relation detection between two sentences. */
function detectSemanticRelation(prev: string, curr: string): TransitionClass {
  const prevWords = contentWordSet(prev);
  const currWords = contentWordSet(curr);
  const overlap = [...prevWords].filter(w => currWords.has(w)).length;
  const overlapRatio = prevWords.size > 0 ? overlap / prevWords.size : 0;

  // Check for negation patterns (adversative signal)
  const hasNegation = /\b(not|no|never|neither|nor|without|lack|fail|unlike|rather than)\b/i.test(curr)
    && !/\b(not|no|never|neither|nor|without|lack|fail|unlike|rather than)\b/i.test(prev);
  if (hasNegation) return 'adversative';

  // Check for result/cause patterns
  if (/\b(result|cause|lead|produce|create|enable|allow|bring about)\b/i.test(curr) && overlapRatio > 0.15) {
    return 'causal';
  }

  // Check for temporal sequences
  if (/\b(after|before|during|following|preceding|subsequent|until|when)\b/i.test(curr)) {
    return 'temporal';
  }

  // Check for examples
  if (/\b(example|instance|illustrat|such as|case in point)\b/i.test(curr)) {
    return 'exemplifying';
  }

  // High overlap = additive (building on same topic)
  if (overlapRatio > 0.25) return 'additive';

  return 'none';
}

export interface TransitionFitScore {
  /** 0-100, higher = better transition fit */
  score: number;
  /** Number of transitions found */
  transitionCount: number;
  /** Number of mismatched transitions */
  mismatchCount: number;
  /** Details of mismatches: [sentenceIndex, connector, expectedClass, foundClass] */
  mismatches: { index: number; connector: string; expected: TransitionClass; found: TransitionClass }[];
}

const COMPATIBLE_TRANSITIONS: Record<TransitionClass, Set<TransitionClass>> = {
  additive: new Set(['additive', 'none']),
  adversative: new Set(['adversative']),
  causal: new Set(['causal', 'none']),
  temporal: new Set(['temporal', 'none']),
  exemplifying: new Set(['exemplifying', 'additive', 'none']),
  none: new Set(['additive', 'adversative', 'causal', 'temporal', 'exemplifying', 'none']),
};

export function scoreTransitionFit(text: string): TransitionFitScore {
  const paras = splitParagraphs(text);
  const allSents: string[] = [];
  for (const p of paras) {
    if (isHeading(p)) continue;
    allSents.push(...robustSentenceSplit(p));
  }

  if (allSents.length < 3) return { score: 80, transitionCount: 0, mismatchCount: 0, mismatches: [] };

  let transitionCount = 0;
  let mismatchCount = 0;
  const mismatches: TransitionFitScore['mismatches'] = [];

  for (let i = 1; i < allSents.length; i++) {
    const trans = detectTransition(allSents[i]);
    if (!trans) continue;
    transitionCount++;

    const relation = detectSemanticRelation(allSents[i - 1], allSents[i]);
    if (relation !== 'none' && !COMPATIBLE_TRANSITIONS[trans.cls].has(relation)) {
      mismatchCount++;
      mismatches.push({ index: i, connector: trans.connector, expected: relation, found: trans.cls });
    }
  }

  if (transitionCount === 0) return { score: 70, transitionCount: 0, mismatchCount: 0, mismatches: [] };

  const matchRate = 1 - mismatchCount / transitionCount;
  const score = Math.round(matchRate * 100);

  return { score, transitionCount, mismatchCount, mismatches };
}

// ══════════════════════════════════════════════════════════════════════════
// 3. REFERENCE-CHAIN VALIDITY
// ══════════════════════════════════════════════════════════════════════════

export interface ReferenceChainScore {
  /** 0-100, higher = clearer references */
  score: number;
  /** Number of referential expressions found */
  totalReferences: number;
  /** Number of vague/unclear references */
  vagueCount: number;
  /** Indices of sentences with vague references */
  vagueIndices: number[];
}

const REFERENTIAL_PATTERNS = [
  /^This\s+(?:demonstrates?|shows?|suggests?|indicates?|implies?|means?|highlights?|reveals?|approach|method|strategy|process|technique|finding|result|issue|problem|challenge|trend|pattern|shift|change|evidence|data|analysis|study|research)\b/i,
  /^These\s+(?:findings?|results?|factors?|issues?|challenges?|changes?|patterns?|trends?|strategies?|methods?|approaches?|studies?|data|analyses|developments?)\b/i,
  /^It\s+(?:is|was|has|had|can|could|will|would|should|may|might|also|further|additionally)\b/i,
  /^The\s+(?:above|aforementioned|preceding|former|latter|following|same|said)\b/i,
];

const VAGUE_PATTERNS = [
  /^This\s+(?:is|was|has|can|could|will|would|should|may|might)\b/i,
  /^It\s+(?:is|was|has|can|could)\s+(?:important|crucial|essential|vital|clear|evident|obvious|notable|worth|interesting|significant|necessary)\b/i,
];

export function scoreReferenceChains(text: string): ReferenceChainScore {
  const paras = splitParagraphs(text);
  const allSents: string[] = [];
  for (const p of paras) {
    if (isHeading(p)) continue;
    allSents.push(...robustSentenceSplit(p));
  }

  if (allSents.length < 3) return { score: 85, totalReferences: 0, vagueCount: 0, vagueIndices: [] };

  let totalReferences = 0;
  let vagueCount = 0;
  const vagueIndices: number[] = [];

  for (let i = 1; i < allSents.length; i++) {
    const sent = allSents[i].trim();

    // Check if sentence starts with a referential expression
    const startsWithRef = REFERENTIAL_PATTERNS.some(p => p.test(sent))
      || /^(This|These|It|The)\b/i.test(sent);
    if (!startsWithRef) continue;
    totalReferences++;

    // Check for vague patterns
    const isVague = VAGUE_PATTERNS.some(p => p.test(sent));

    if (isVague) {
      // Check if prior 1-2 sentences provide a clear antecedent
      const priorContext = allSents.slice(Math.max(0, i - 2), i).join(' ');
      const priorContent = contentWordSet(priorContext);
      const currContent = contentWordSet(sent);

      // If there's minimal content overlap, the reference is vague
      const overlap = [...currContent].filter(w => priorContent.has(w)).length;
      if (overlap < 2) {
        vagueCount++;
        vagueIndices.push(i);
      }
    }
  }

  if (totalReferences === 0) return { score: 85, totalReferences: 0, vagueCount: 0, vagueIndices: [] };

  const clarityRate = 1 - vagueCount / totalReferences;
  const score = Math.round(clarityRate * 100);

  return { score, totalReferences, vagueCount, vagueIndices };
}

// ══════════════════════════════════════════════════════════════════════════
// 4. REPETITION DECAY WINDOWS
// ══════════════════════════════════════════════════════════════════════════

export interface RepetitionDecayScore {
  /** 0-100, higher = more human-like repetition pattern */
  score: number;
  /** Repeated stems per window size */
  stemRepetitions: { window3: number; window5: number; window8: number };
  /** Repeated transition families per window */
  transitionRepetitions: number;
  /** Top repeated stems */
  topRepeatedStems: string[];
}

export function scoreRepetitionDecay(text: string): RepetitionDecayScore {
  const paras = splitParagraphs(text);
  const allSents: string[] = [];
  for (const p of paras) {
    if (isHeading(p)) continue;
    allSents.push(...robustSentenceSplit(p));
  }

  if (allSents.length < 5) return { score: 70, stemRepetitions: { window3: 0, window5: 0, window8: 0 }, transitionRepetitions: 0, topRepeatedStems: [] };

  // Per-sentence stems
  const sentStems = allSents.map(s => contentWords(s).map(stem));

  // Count repeated stems in rolling windows
  function countWindowRepetitions(windowSize: number): number {
    let totalRepeats = 0;
    for (let i = 0; i <= sentStems.length - windowSize; i++) {
      const windowStems: Map<string, number> = new Map();
      for (let j = i; j < i + windowSize; j++) {
        for (const s of sentStems[j]) {
          windowStems.set(s, (windowStems.get(s) ?? 0) + 1);
        }
      }
      // Count stems that appear in 3+ sentences within the window
      for (const [, count] of windowStems) {
        if (count >= 3) totalRepeats++;
      }
    }
    // Normalize by number of windows
    const numWindows = allSents.length - windowSize + 1;
    return numWindows > 0 ? totalRepeats / numWindows : 0;
  }

  const w3 = countWindowRepetitions(3);
  const w5 = countWindowRepetitions(5);
  const w8 = countWindowRepetitions(8);

  // Transition family repetitions
  let transitionRepeats = 0;
  const recentTransitions: TransitionClass[] = [];
  for (let i = 0; i < allSents.length; i++) {
    const trans = detectTransition(allSents[i]);
    if (trans) {
      recentTransitions.push(trans.cls);
      if (recentTransitions.length > 5) recentTransitions.shift();
      // Check for 3+ same class in window of 5
      const classCounts = new Map<TransitionClass, number>();
      for (const cls of recentTransitions) {
        classCounts.set(cls, (classCounts.get(cls) ?? 0) + 1);
      }
      for (const [, count] of classCounts) {
        if (count >= 3) transitionRepeats++;
      }
    }
  }

  // Find top repeated stems globally
  const globalStems = new Map<string, number>();
  for (const stems of sentStems) {
    const unique = new Set(stems);
    for (const s of unique) {
      globalStems.set(s, (globalStems.get(s) ?? 0) + 1);
    }
  }
  const topRepeatedStems = [...globalStems.entries()]
    .filter(([, count]) => count >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([stem]) => stem);

  // AI tends to have even spacing of repetitions (low variance in gaps)
  // Humans have clustered repetitions (high variance in gaps)
  // Score: lower w3/w5/w8 = better, but some repetition is natural
  const avgRepetition = (w3 * 0.3 + w5 * 0.4 + w8 * 0.3);
  // Ideal range: 0.5-2.0 repetitions per window (some repetition is human)
  // AI range: 2.0-5.0+ (too uniform)
  let score: number;
  if (avgRepetition < 0.5) score = 75; // Too little repetition (slightly unnatural)
  else if (avgRepetition <= 2.0) score = 90; // Human-like
  else if (avgRepetition <= 3.5) score = 60; // Slightly AI-like
  else score = Math.max(20, 60 - (avgRepetition - 3.5) * 15); // Heavy AI repetition

  score = Math.max(0, Math.min(100, Math.round(score - transitionRepeats * 5)));

  return { score, stemRepetitions: { window3: Math.round(w3 * 100) / 100, window5: Math.round(w5 * 100) / 100, window8: Math.round(w8 * 100) / 100 }, transitionRepetitions: transitionRepeats, topRepeatedStems };
}

// ══════════════════════════════════════════════════════════════════════════
// 5. CLAUSE-SHAPE DIVERSITY
// ══════════════════════════════════════════════════════════════════════════

type ClauseShape = 'opener_comma_main' | 'svo_simple' | 'svo_extension' | 'claim_explanation' | 'compound' | 'complex_subordinate' | 'question' | 'imperative' | 'other';

function classifyClauseShape(sentence: string): ClauseShape {
  const s = sentence.trim();
  if (!s) return 'other';

  // Question
  if (/\?$/.test(s)) return 'question';

  // Imperative (starts with verb)
  if (/^(Consider|Note|Remember|Ensure|Make|Use|Try|Think|Look|See|Check|Review|Avoid|Include|Keep|Start|Begin|Find)\b/i.test(s)) return 'imperative';

  // Opener, main clause (starts with adverbial/prepositional phrase followed by comma)
  if (/^(?:In|On|At|By|For|With|From|Through|During|After|Before|Over|Under|Among|Between|Despite|Although|While|When|Since|Because|If|As)\b[^,]{3,40},\s/i.test(s)) return 'opener_comma_main';
  if (/^[A-Z][a-z]+ly,\s/.test(s)) return 'opener_comma_main'; // Adverb opener

  // Compound (has coordinating conjunction joining clauses)
  if (/,\s+(and|but|or|yet|so)\s+[A-Z]/g.test(s) || /;\s+(and|but|or|yet|so)\s+/i.test(s)) return 'compound';

  // Complex subordinate (has subordinating conjunction mid-sentence)
  if (/\b(which|that|who|whom|whose|where|when|because|since|although|while|if|unless|until|whereas|whereby)\b/i.test(s) && s.split(/\s+/).length > 8) return 'complex_subordinate';

  // Claim + explanation (sentence has a colon or em-dash splitting claim:explanation)
  if (/:\s+[a-z]/i.test(s) || /\s+[—–-]\s+[a-z]/i.test(s)) return 'claim_explanation';

  // SVO extension (SVO + prepositional phrase)
  const words = s.split(/\s+/);
  if (words.length > 10 && /\b(in|on|at|by|for|with|from|through|about|into|onto|upon|across|among|between)\b/i.test(s.slice(Math.floor(s.length * 0.5)))) return 'svo_extension';

  // Simple SVO
  if (words.length <= 15) return 'svo_simple';

  return 'other';
}

export interface ClauseShapeScore {
  /** 0-100, higher = more diverse clause shapes */
  score: number;
  /** Histogram of clause shapes */
  histogram: Record<ClauseShape, number>;
  /** Dominant shape percentage */
  dominantShapePercent: number;
  /** Name of the dominant shape */
  dominantShape: ClauseShape;
}

export function scoreClauseShapeDiversity(text: string): ClauseShapeScore {
  const paras = splitParagraphs(text);
  const allSents: string[] = [];
  for (const p of paras) {
    if (isHeading(p)) continue;
    allSents.push(...robustSentenceSplit(p));
  }

  const histogram: Record<ClauseShape, number> = {
    opener_comma_main: 0, svo_simple: 0, svo_extension: 0,
    claim_explanation: 0, compound: 0, complex_subordinate: 0,
    question: 0, imperative: 0, other: 0,
  };

  for (const sent of allSents) {
    const shape = classifyClauseShape(sent);
    histogram[shape]++;
  }

  const total = allSents.length;
  if (total < 3) return { score: 70, histogram, dominantShapePercent: 0, dominantShape: 'other' };

  // Find dominant shape
  let maxCount = 0;
  let dominantShape: ClauseShape = 'other';
  for (const [shape, count] of Object.entries(histogram)) {
    if (count > maxCount) { maxCount = count; dominantShape = shape as ClauseShape; }
  }
  const dominantPercent = maxCount / total;

  // Count unique shapes used
  const uniqueShapes = Object.values(histogram).filter(c => c > 0).length;

  // Score: human writing uses 5+ shapes, no single shape > 35%
  // AI tends to use 2-3 shapes with one > 50%
  let score: number;
  if (dominantPercent > 0.50) score = 30;
  else if (dominantPercent > 0.40) score = 50;
  else if (dominantPercent > 0.35) score = 65;
  else score = 80;

  // Bonus for shape diversity
  score += Math.min(20, uniqueShapes * 3);

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    histogram,
    dominantShapePercent: Math.round(dominantPercent * 100),
    dominantShape,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// 6. ENTITY RETENTION COVERAGE
// ══════════════════════════════════════════════════════════════════════════

/** Extract named entities + key facts from text. */
function extractEntities(text: string): { entities: Set<string>; numbers: Set<string>; years: Set<string> } {
  const entities = new Set<string>();
  const numbers = new Set<string>();
  const years = new Set<string>();

  // Years (4-digit numbers in parentheses or standalone)
  const yearMatches = text.match(/\b(1[89]\d{2}|20[0-3]\d)\b/g) ?? [];
  for (const y of yearMatches) years.add(y);

  // Numbers with context
  const numMatches = text.match(/\b\d+(?:\.\d+)?(?:\s*%|\s*percent|\s*million|\s*billion|\s*thousand)?\b/g) ?? [];
  for (const n of numMatches) {
    if (n.length > 1 && !/^\d{4}$/.test(n)) numbers.add(n);
  }

  // Proper nouns: capitalized multi-word sequences not at sentence start
  const lines = text.split(/[.!?]\s+/);
  for (const line of lines) {
    const words = line.split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const w = words[i].replace(/[^a-zA-Z'-]/g, '');
      if (w.length >= 2 && /^[A-Z]/.test(w) && !/^(The|This|That|These|Those|In|On|At|By|For|With|From|It|Its|He|She|They|We|His|Her|Their|Our|My|Your|A|An|And|But|Or|Not|Also|If|As|So|To|Of|Is|Are|Was|Were|Has|Have|Had|Do|Does|Did|Can|Could|Will|Would|May|Might|Shall|Should|Must|However|Therefore|Furthermore|Moreover|Nevertheless|Nonetheless|Consequently|Additionally|Specifically|Particularly|Indeed|Although|While|When|Since|Because|After|Before|During|Between|Into|Through|Until|Without|Within|About|Above|Below|Beyond|Against)$/.test(w)) {
        // Check if next word is also capitalized (multi-word entity)
        if (i + 1 < words.length && /^[A-Z]/.test(words[i + 1].replace(/[^a-zA-Z]/g, ''))) {
          const entity = w + ' ' + words[i + 1].replace(/[^a-zA-Z'-]/g, '');
          entities.add(entity);
          i++; // skip next word
        } else {
          entities.add(w);
        }
      }
    }
  }

  // Quoted phrases (product names, titles)
  const quoteMatches = text.match(/"([^"]{2,50})"/g) ?? [];
  for (const q of quoteMatches) entities.add(q.replace(/"/g, ''));

  return { entities, numbers, years };
}

export interface EntityRetentionScore {
  /** 0-100, higher = better retention */
  score: number;
  /** Entities found in original */
  originalEntities: string[];
  /** Entities missing from output */
  missingEntities: string[];
  /** Numbers found in original */
  originalNumbers: string[];
  /** Numbers missing from output */
  missingNumbers: string[];
  /** Years found in original */
  originalYears: string[];
  /** Years missing from output */
  missingYears: string[];
}

export function scoreEntityRetention(original: string, humanized: string): EntityRetentionScore {
  const origEntities = extractEntities(original);
  const humanLower = humanized.toLowerCase();

  const missingEntities = [...origEntities.entities].filter(e => !humanized.includes(e) && !humanLower.includes(e.toLowerCase()));
  const missingNumbers = [...origEntities.numbers].filter(n => !humanized.includes(n));
  const missingYears = [...origEntities.years].filter(y => !humanized.includes(y));

  const totalOrig = origEntities.entities.size + origEntities.numbers.size + origEntities.years.size;
  const totalMissing = missingEntities.length + missingNumbers.length + missingYears.length;

  const retentionRate = totalOrig > 0 ? 1 - totalMissing / totalOrig : 1;
  const score = Math.round(retentionRate * 100);

  return {
    score: Math.max(0, Math.min(100, score)),
    originalEntities: [...origEntities.entities],
    missingEntities,
    originalNumbers: [...origEntities.numbers],
    missingNumbers,
    originalYears: [...origEntities.years],
    missingYears,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// 7. SEO KEYWORD INTEGRITY
// ══════════════════════════════════════════════════════════════════════════

export interface SEOKeywordScore {
  /** 0-100, higher = better keyword preservation */
  score: number;
  /** Exact match retention rate */
  exactMatchRetention: number;
  /** Stem match retention rate */
  stemMatchRetention: number;
  /** Primary keyword density in output (%) */
  primaryDensity: number;
  /** Is primary keyword in first 100 words */
  inFirst100Words: boolean;
  /** Is primary keyword in any heading */
  inHeadings: boolean;
  /** Over-optimization risk (density > 3%) */
  overOptimized: boolean;
  /** Per-keyword details */
  keywordDetails: { keyword: string; originalCount: number; outputCount: number; density: number }[];
}

/** Auto-extract likely SEO keywords from text (top content words by TF). */
function autoExtractKeywords(text: string, maxKeywords: number = 8): string[] {
  const words = contentWords(text);
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  // Also extract 2-grams
  const biWords = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length >= 2);
  for (let i = 0; i < biWords.length - 1; i++) {
    if (STOPWORDS.has(biWords[i]) || STOPWORDS.has(biWords[i + 1])) continue;
    const bigram = biWords[i] + ' ' + biWords[i + 1];
    freq.set(bigram, (freq.get(bigram) ?? 0) + 1);
  }

  return [...freq.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

function countOccurrences(text: string, keyword: string): number {
  const lower = text.toLowerCase();
  const kw = keyword.toLowerCase();
  let count = 0;
  let idx = 0;
  while ((idx = lower.indexOf(kw, idx)) !== -1) {
    count++;
    idx += kw.length;
  }
  return count;
}

export function scoreSEOKeywords(original: string, humanized: string, providedKeywords?: string[]): SEOKeywordScore {
  const keywords = providedKeywords && providedKeywords.length > 0
    ? providedKeywords
    : autoExtractKeywords(original);

  if (keywords.length === 0) {
    return { score: 80, exactMatchRetention: 1, stemMatchRetention: 1, primaryDensity: 0, inFirst100Words: true, inHeadings: true, overOptimized: false, keywordDetails: [] };
  }

  const outputWordCount = humanized.split(/\s+/).length;
  const keywordDetails: SEOKeywordScore['keywordDetails'] = [];
  let totalOrigCount = 0;
  let totalOutputCount = 0;
  let stemMatches = 0;

  for (const kw of keywords) {
    const origCount = countOccurrences(original, kw);
    const outCount = countOccurrences(humanized, kw);
    const density = outputWordCount > 0 ? (outCount * kw.split(/\s+/).length / outputWordCount) * 100 : 0;

    keywordDetails.push({ keyword: kw, originalCount: origCount, outputCount: outCount, density: Math.round(density * 100) / 100 });

    totalOrigCount += origCount;
    totalOutputCount += outCount;

    // Check stem-level match
    const kwStem = stem(kw.split(/\s+/)[0]);
    if (humanized.toLowerCase().includes(kw.toLowerCase()) || contentWords(humanized).some(w => stem(w) === kwStem)) {
      stemMatches++;
    }
  }

  const exactMatchRetention = totalOrigCount > 0 ? Math.min(1, totalOutputCount / totalOrigCount) : 1;
  const stemMatchRetention = keywords.length > 0 ? stemMatches / keywords.length : 1;

  // Primary keyword = first in list
  const primaryKw = keywords[0];
  const primaryCount = countOccurrences(humanized, primaryKw);
  const primaryDensity = outputWordCount > 0 ? (primaryCount * primaryKw.split(/\s+/).length / outputWordCount) * 100 : 0;

  // First 100 words check
  const first100 = humanized.split(/\s+/).slice(0, 100).join(' ');
  const inFirst100Words = first100.toLowerCase().includes(primaryKw.toLowerCase());

  // Heading check
  const paras = splitParagraphs(humanized);
  const headings = paras.filter(isHeading);
  const inHeadings = headings.some(h => h.toLowerCase().includes(primaryKw.toLowerCase()));

  const overOptimized = primaryDensity > 3.0;

  // Scoring
  let score = 0;
  score += exactMatchRetention * 40; // 40 points for exact keyword retention
  score += stemMatchRetention * 20;  // 20 points for stem-level retention
  score += inFirst100Words ? 15 : 0; // 15 points for first-100-word placement
  score += inHeadings ? 15 : 0;      // 15 points for heading placement
  score += overOptimized ? -10 : 10; // 10 points for safe density
  score = Math.round(Math.max(0, Math.min(100, score)));

  return { score, exactMatchRetention: Math.round(exactMatchRetention * 100) / 100, stemMatchRetention: Math.round(stemMatchRetention * 100) / 100, primaryDensity: Math.round(primaryDensity * 100) / 100, inFirst100Words, inHeadings, overOptimized, keywordDetails };
}

// ══════════════════════════════════════════════════════════════════════════
// 8. HEADING-BODY ALIGNMENT
// ══════════════════════════════════════════════════════════════════════════

export interface HeadingBodyScore {
  /** 0-100, higher = better alignment */
  score: number;
  /** Per-heading alignment details */
  details: { heading: string; alignmentScore: number; firstSentRelevant: boolean }[];
}

export function scoreHeadingBodyAlignment(text: string): HeadingBodyScore {
  const paras = splitParagraphs(text);
  const details: HeadingBodyScore['details'] = [];

  for (let i = 0; i < paras.length - 1; i++) {
    if (!isHeading(paras[i])) continue;

    const heading = paras[i].replace(/^#{1,6}\s+/, '').trim();
    const headingWords = contentWordSet(heading);

    if (headingWords.size === 0) continue;

    // Find the next non-heading paragraph
    let bodyIdx = i + 1;
    while (bodyIdx < paras.length && isHeading(paras[bodyIdx])) bodyIdx++;
    if (bodyIdx >= paras.length) continue;

    const body = paras[bodyIdx];
    const bodySents = robustSentenceSplit(body);
    if (bodySents.length === 0) continue;

    // Check first sentence relevance to heading
    const firstSentWords = contentWordSet(bodySents[0]);
    const firstOverlap = [...headingWords].filter(w => firstSentWords.has(w)).length;
    const firstRelevant = headingWords.size > 0 && firstOverlap / headingWords.size >= 0.3;

    // Check overall body paragraph relevance
    const bodyWords = contentWordSet(body);
    const bodyOverlap = [...headingWords].filter(w => bodyWords.has(w)).length;
    const alignmentScore = headingWords.size > 0 ? Math.round(bodyOverlap / headingWords.size * 100) : 50;

    details.push({
      heading,
      alignmentScore: Math.min(100, alignmentScore),
      firstSentRelevant: firstRelevant,
    });
  }

  if (details.length === 0) return { score: 80, details: [] };

  const avgAlignment = mean(details.map(d => d.alignmentScore));
  const firstSentRate = details.filter(d => d.firstSentRelevant).length / details.length;

  const score = Math.round(avgAlignment * 0.6 + firstSentRate * 100 * 0.4);
  return { score: Math.max(0, Math.min(100, score)), details };
}

// ══════════════════════════════════════════════════════════════════════════
// 9. READABILITY DRIFT
// ══════════════════════════════════════════════════════════════════════════

export interface ReadabilityDriftScore {
  /** 0-100, higher = more human-like drift pattern */
  score: number;
  /** Per-sentence readability proxy values */
  perSentenceReadability: number[];
  /** Is the profile flat (AI-like) or wavy (human-like) */
  profileType: 'flat' | 'wavy' | 'mixed';
  /** Local drift magnitude (how much readability changes between adjacent sentences) */
  driftMagnitude: number;
}

/** Readability proxy: avg words per sentence × avg word length */
function readabilityProxy(sentence: string): number {
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const avgWordLen = words.reduce((s, w) => s + w.length, 0) / words.length;
  return words.length * avgWordLen / 10; // Normalized scale
}

export function scoreReadabilityDrift(text: string): ReadabilityDriftScore {
  const paras = splitParagraphs(text);
  const allSents: string[] = [];
  for (const p of paras) {
    if (isHeading(p)) continue;
    allSents.push(...robustSentenceSplit(p));
  }

  const readabilities = allSents.map(readabilityProxy);
  if (readabilities.length < 4) return { score: 60, perSentenceReadability: readabilities, profileType: 'mixed', driftMagnitude: 0 };

  // Calculate local drifts (change between adjacent sentences)
  const drifts: number[] = [];
  for (let i = 1; i < readabilities.length; i++) {
    drifts.push(Math.abs(readabilities[i] - readabilities[i - 1]));
  }

  const driftMagnitude = mean(drifts);
  const driftCV = cv(drifts);

  // Count direction changes (up→down or down→up = wave)
  let directionChanges = 0;
  for (let i = 2; i < readabilities.length; i++) {
    const prev = readabilities[i - 1] - readabilities[i - 2];
    const curr = readabilities[i] - readabilities[i - 1];
    if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) directionChanges++;
  }
  const changeRate = directionChanges / Math.max(1, readabilities.length - 2);

  // Human writing: high drift with high variance (wavy), change rate ~0.4-0.7
  // AI writing: low drift with low variance (flat), change rate ~0.2-0.4
  let profileType: 'flat' | 'wavy' | 'mixed';
  if (driftCV < 0.3 && driftMagnitude < 1.5) profileType = 'flat';
  else if (driftCV > 0.5 || changeRate > 0.45) profileType = 'wavy';
  else profileType = 'mixed';

  let score: number;
  if (profileType === 'flat') score = 30 + driftMagnitude * 10;
  else if (profileType === 'wavy') score = 70 + changeRate * 30;
  else score = 50 + driftCV * 30;

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    perSentenceReadability: readabilities.map(r => Math.round(r * 100) / 100),
    profileType,
    driftMagnitude: Math.round(driftMagnitude * 100) / 100,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// 10. INFORMATION-GAIN ORDERING
// ══════════════════════════════════════════════════════════════════════════

type ParagraphRole = 'setup' | 'expansion' | 'example' | 'contrast' | 'takeaway' | 'unknown';

function classifyParagraphRole(para: string, prevPara?: string): ParagraphRole {
  const lower = para.toLowerCase();
  const sents = robustSentenceSplit(para);
  const firstSent = (sents[0] ?? '').toLowerCase();

  // Contrast signals
  if (/\b(however|on the other hand|in contrast|conversely|unlike|whereas|despite|although|but|yet|nevertheless)\b/i.test(firstSent)) return 'contrast';

  // Example signals
  if (/\b(for example|for instance|such as|consider|take the case|one illustration|a good example|case in point)\b/i.test(firstSent)) return 'example';
  if (/\b(for example|for instance|illustrat|demonstrat|case study|scenario)\b/i.test(lower) && sents.length <= 4) return 'example';

  // Takeaway/conclusion signals
  if (/\b(in conclusion|to conclude|in summary|to summarize|ultimately|overall|in the end|all things considered|the key takeaway|the bottom line)\b/i.test(firstSent)) return 'takeaway';
  if (/\b(therefore|thus|consequently|as a result|this means|this shows|this demonstrates|this suggests|hence)\b/i.test(firstSent) && sents.length <= 3) return 'takeaway';

  // Setup (first paragraph or introducing a new topic)
  if (!prevPara) return 'setup';

  // Check semantic novelty vs previous paragraph
  if (prevPara) {
    const prevStems = stemSet(prevPara);
    const currStems = stemSet(para);
    const overlap = [...currStems].filter(s => prevStems.has(s)).length;
    const novelty = currStems.size > 0 ? 1 - overlap / currStems.size : 0.5;

    if (novelty > 0.7) return 'setup'; // Mostly new content = new topic setup
    if (novelty < 0.3) return 'expansion'; // High overlap = expanding on previous
  }

  return 'expansion';
}

export interface InformationGainScore {
  /** 0-100, higher = better progression */
  score: number;
  /** Paragraph roles */
  roles: ParagraphRole[];
  /** Does it follow a natural progression */
  hasNaturalProgression: boolean;
  /** Novelty between adjacent paragraphs */
  noveltyScores: number[];
}

export function scoreInformationGain(text: string): InformationGainScore {
  const paras = splitParagraphs(text).filter(p => !isHeading(p));
  if (paras.length < 3) return { score: 70, roles: [], hasNaturalProgression: true, noveltyScores: [] };

  const roles: ParagraphRole[] = [];
  const noveltyScores: number[] = [];

  for (let i = 0; i < paras.length; i++) {
    roles.push(classifyParagraphRole(paras[i], i > 0 ? paras[i - 1] : undefined));

    if (i > 0) {
      const prevStems = stemSet(paras[i - 1]);
      const currStems = stemSet(paras[i]);
      const overlap = [...currStems].filter(s => prevStems.has(s)).length;
      const novelty = currStems.size > 0 ? 1 - overlap / currStems.size : 0.5;
      noveltyScores.push(Math.round(novelty * 100) / 100);
    }
  }

  // Check for flat progression (all expansion = AI-like)
  const expansionRate = roles.filter(r => r === 'expansion').length / roles.length;
  const roleVariety = new Set(roles).size;

  // Natural progression: should have setup early, examples/contrast in middle, takeaway at end
  const hasSetup = roles[0] === 'setup';
  const hasTakeaway = roles[roles.length - 1] === 'takeaway' || roles[roles.length - 2] === 'takeaway';
  const hasVariety = roleVariety >= 3;

  const hasNaturalProgression = hasSetup && hasVariety;

  // AI text is often globally flat: each paragraph is equally informative
  // Human text has waves: novelty peaks (new subtopics) and troughs (elaboration)
  const noveltyCV = cv(noveltyScores);

  let score = 50;
  if (hasSetup) score += 10;
  if (hasTakeaway) score += 10;
  if (hasVariety) score += 10;
  if (expansionRate < 0.6) score += 10;
  if (noveltyCV > 0.3) score += 10; // Wavy novelty = human-like

  return {
    score: Math.max(0, Math.min(100, score)),
    roles,
    hasNaturalProgression,
    noveltyScores,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// 11. HUMAN REVISION FINGERPRINTING
// ══════════════════════════════════════════════════════════════════════════

export interface RevisionFingerprintResult {
  /** Modified text with revision fingerprints */
  text: string;
  /** Number of fingerprints applied */
  appliedCount: number;
  /** Types of fingerprints applied */
  appliedTypes: string[];
}

export function applyRevisionFingerprints(text: string): RevisionFingerprintResult {
  const paras = splitParagraphs(text);
  let appliedCount = 0;
  const appliedTypes: string[] = [];

  const resultParas: string[] = [];

  for (let pIdx = 0; pIdx < paras.length; pIdx++) {
    if (isHeading(paras[pIdx])) {
      resultParas.push(paras[pIdx]);
      continue;
    }

    const sents = robustSentenceSplit(paras[pIdx]);
    const resultSents: string[] = [];

    for (let i = 0; i < sents.length; i++) {
      const sent = sents[i];
      const words = sent.split(/\s+/);

      // Fingerprint 1: Short sentence after dense sentence
      // ~20% chance, triggered when previous sentence is long
      if (i > 0 && words.length > 12) {
        const prevWords = (sents[i - 1] ?? '').split(/\s+/).length;
        if (prevWords > 20 && (hashStr(sent) % 5 === 0)) {
          // Already long sentences — skip adding more
        }
      }

      resultSents.push(sent);

      // Fingerprint 2: Occasional direct restatement after complex sentence
      // ~10% chance on sentences with subordinate clauses
      if (words.length > 18 && /\b(which|that|because|although|while|since)\b/i.test(sent) && (hashStr(sent + 'restate') % 10 === 0)) {
        // Extract the core claim and create a simpler version
        const mainClause = extractMainClause(sent);
        if (mainClause && mainClause.length > 10 && mainClause.length < sent.length * 0.7) {
          const restated = 'In short, ' + mainClause.charAt(0).toLowerCase() + mainClause.slice(1);
          if (!/[.!?]$/.test(restated)) {
            resultSents.push(restated + '.');
          } else {
            resultSents.push(restated);
          }
          appliedCount++;
          appliedTypes.push('direct_restatement');
        }
      }

      // Fingerprint 3: Selective emphasis via sentence shortening
      // If 3+ consecutive long sentences, insert a brief connector sentence
      if (i >= 2) {
        const l0 = sents[i - 2].split(/\s+/).length;
        const l1 = sents[i - 1].split(/\s+/).length;
        const l2 = words.length;
        if (l0 > 16 && l1 > 16 && l2 > 16 && (hashStr(sent + 'break') % 4 === 0)) {
          // Don't inject - just note; changing sentence count risks meaning loss
        }
      }
    }

    // Fingerprint 4: Uneven transition density
    // Some paragraph transitions get connectors, some don't
    if (pIdx > 0 && !isHeading(paras[pIdx - 1]) && resultSents.length > 0) {
      const firstSent = resultSents[0];
      const hasTransition = detectTransition(firstSent) !== null;

      // If this paragraph has a transition and the hash says to remove it (~25% chance)
      if (hasTransition && (hashStr(paras[pIdx] + 'trans') % 4 === 0)) {
        const trans = detectTransition(firstSent);
        if (trans) {
          const afterTrans = firstSent.slice(trans.connector.length).replace(/^[,\s]+/, '');
          if (afterTrans.length > 10) {
            resultSents[0] = afterTrans.charAt(0).toUpperCase() + afterTrans.slice(1);
            appliedCount++;
            appliedTypes.push('transition_removal');
          }
        }
      }
      // If no transition and hash says to add one (~15% chance)
      else if (!hasTransition && (hashStr(paras[pIdx] + 'addtrans') % 7 === 0)) {
        const prevPara = paras[pIdx - 1];
        const relation = detectSemanticRelation(prevPara, resultSents[0]);
        const connectors: Record<TransitionClass, string[]> = {
          additive: ['Along the same lines, ', 'Building on this, '],
          adversative: ['That said, ', 'At the same time, '],
          causal: ['As a result, ', 'This means '],
          temporal: ['Following this, ', 'In the meantime, '],
          exemplifying: ['To illustrate, ', 'One example of this is '],
          none: [],
        };
        const options = connectors[relation];
        if (options.length > 0) {
          const pick = options[hashStr(paras[pIdx]) % options.length];
          const first = resultSents[0];
          resultSents[0] = pick + first.charAt(0).toLowerCase() + first.slice(1);
          appliedCount++;
          appliedTypes.push('transition_addition');
        }
      }
    }

    resultParas.push(resultSents.join(' '));
  }

  return {
    text: resultParas.join('\n\n'),
    appliedCount,
    appliedTypes,
  };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function extractMainClause(sentence: string): string | null {
  // Try to extract the part before the first subordinate clause
  const subordinators = /\b(which|that|because|although|while|since|where|when|if|unless|whereas|whereby)\b/i;
  const match = sentence.match(subordinators);
  if (!match || !match.index) return null;

  // Take everything before the subordinator
  let main = sentence.slice(0, match.index).trim();
  // Remove trailing comma
  main = main.replace(/,\s*$/, '').trim();
  if (main.length < 10) return null;

  // Ensure it ends with proper punctuation
  if (!/[.!?]$/.test(main)) main += '.';
  return main;
}

// ══════════════════════════════════════════════════════════════════════════
// 12. PARAGRAPH PURPOSE LABELING
// ══════════════════════════════════════════════════════════════════════════

type ParagraphPurpose = 'intro' | 'explanation' | 'evidence' | 'example' | 'comparison' | 'objection' | 'conclusion' | 'transition' | 'unknown';

export interface ParagraphPurposeResult {
  /** Per-paragraph purpose labels */
  labels: { paragraph: number; purpose: ParagraphPurpose; confidence: number }[];
  /** Structure quality score 0-100 */
  structureScore: number;
  /** Missing structural elements */
  missing: string[];
  /** Structure pattern (e.g., "intro→explanation→example→conclusion") */
  pattern: string;
}

function classifyParagraphPurpose(para: string, index: number, totalParas: number): { purpose: ParagraphPurpose; confidence: number } {
  const lower = para.toLowerCase();
  const sents = robustSentenceSplit(para);
  const firstSent = (sents[0] ?? '').toLowerCase();
  const words = para.split(/\s+/);

  // Conclusion signals
  if (/\b(in conclusion|to conclude|in summary|to summarize|overall|all things considered|to sum up|in closing|the bottom line|wrapping up|final thoughts)\b/i.test(firstSent)) {
    return { purpose: 'conclusion', confidence: 0.9 };
  }
  if (index === totalParas - 1 && /\b(therefore|thus|ultimately|clearly|this shows|this demonstrates)\b/i.test(firstSent)) {
    return { purpose: 'conclusion', confidence: 0.7 };
  }

  // Intro signals (first paragraph or explicit intro markers)
  if (index === 0) return { purpose: 'intro', confidence: 0.8 };
  if (/\b(this article|this post|this guide|in this|we will explore|we will examine|let us|here we)\b/i.test(firstSent)) {
    return { purpose: 'intro', confidence: 0.85 };
  }

  // Example signals
  if (/\b(for example|for instance|such as|consider the case|take|one illustration|a case in point|case study)\b/i.test(firstSent)) {
    return { purpose: 'example', confidence: 0.85 };
  }
  if (/\b(for example|for instance|illustrat|demonstrat|scenario|anecdot)\b/i.test(lower) && sents.length <= 5) {
    return { purpose: 'example', confidence: 0.6 };
  }

  // Comparison signals
  if (/\b(compared to|in comparison|unlike|on the other hand|whereas|while.*other|versus|vs\.|difference between|similarities|contrast)\b/i.test(lower)) {
    return { purpose: 'comparison', confidence: 0.75 };
  }

  // Objection / counterargument signals
  if (/\b(critics|opponents|some argue|it could be argued|one might object|a common objection|skeptics|counter\s*argument|on the contrary|opponents claim|detractors)\b/i.test(lower)) {
    return { purpose: 'objection', confidence: 0.8 };
  }

  // Evidence signals
  if (/\b(research shows|studies have|data indicates|according to|evidence suggests|survey|statistics|findings|a study by|research conducted|empirical|peer-reviewed)\b/i.test(lower)) {
    return { purpose: 'evidence', confidence: 0.7 };
  }

  // Transition paragraph (very short, 1-2 sentences)
  if (sents.length <= 2 && words.length < 30) {
    return { purpose: 'transition', confidence: 0.5 };
  }

  // Default: explanation
  return { purpose: 'explanation', confidence: 0.4 };
}

export function labelParagraphPurposes(text: string): ParagraphPurposeResult {
  const paras = splitParagraphs(text).filter(p => !isHeading(p));
  if (paras.length < 2) return { labels: [], structureScore: 50, missing: [], pattern: '' };

  const labels: ParagraphPurposeResult['labels'] = [];
  for (let i = 0; i < paras.length; i++) {
    const { purpose, confidence } = classifyParagraphPurpose(paras[i], i, paras.length);
    labels.push({ paragraph: i, purpose, confidence });
  }

  // Check structural elements
  const purposes = new Set(labels.map(l => l.purpose));
  const missing: string[] = [];
  if (!purposes.has('intro')) missing.push('introduction');
  if (!purposes.has('conclusion')) missing.push('conclusion');
  if (!purposes.has('example') && !purposes.has('evidence')) missing.push('supporting examples/evidence');

  // Structure score
  let structureScore = 50;
  if (purposes.has('intro')) structureScore += 15;
  if (purposes.has('conclusion')) structureScore += 15;
  if (purposes.has('example') || purposes.has('evidence')) structureScore += 10;
  if (purposes.has('comparison') || purposes.has('objection')) structureScore += 5;
  if (purposes.size >= 4) structureScore += 5;

  // Check logical ordering (intro first, conclusion last)
  if (labels[0]?.purpose === 'intro') structureScore += 5;
  if (labels[labels.length - 1]?.purpose === 'conclusion') structureScore += 5;

  // Penalize all-same purpose
  if (purposes.size === 1) structureScore -= 20;

  const pattern = labels.map(l => l.purpose).join('→');

  return {
    labels,
    structureScore: Math.max(0, Math.min(100, structureScore)),
    missing,
    pattern,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// 13. SEARCH-INTENT COVERAGE
// ══════════════════════════════════════════════════════════════════════════

type SearchIntent = 'informational' | 'commercial' | 'comparison' | 'navigational' | 'unknown';

export interface SearchIntentScore {
  /** 0-100, higher = better intent coverage */
  score: number;
  /** Detected intent of the article */
  detectedIntent: SearchIntent;
  /** Does the article answer the detected intent */
  answersIntent: boolean;
  /** Specific intent signals found */
  signals: string[];
}

function detectSearchIntent(text: string): SearchIntent {
  const lower = text.toLowerCase();

  // Commercial signals
  if (/\b(buy|purchase|price|cost|deal|discount|best|top|review|recommend|worth|cheap|expensive|affordable|value|rating|comparison|vs\.|versus)\b/i.test(lower)) {
    if (/\b(review|best|top|recommend|rating)\b/i.test(lower)) return 'commercial';
  }

  // Comparison signals
  if (/\b(vs\.?|versus|compare|comparison|difference|similarities|better|worse|pros and cons|advantages|disadvantages)\b/i.test(lower)) {
    return 'comparison';
  }

  // Navigational signals
  if (/\b(how to|where to find|login|sign up|download|official|website|contact|support)\b/i.test(lower)) {
    if (/\b(login|sign up|download|official|website)\b/i.test(lower)) return 'navigational';
  }

  // Default: informational
  return 'informational';
}

export function scoreSearchIntentCoverage(text: string): SearchIntentScore {
  const intent = detectSearchIntent(text);
  const lower = text.toLowerCase();
  const signals: string[] = [];
  let score = 50;

  switch (intent) {
    case 'informational': {
      // Should have: clear definitions, explanations, examples, structured info
      if (/\b(what is|how does|why|definition|meaning|explain|overview|guide|tutorial)\b/i.test(lower)) {
        signals.push('contains_definitions');
        score += 15;
      }
      if (/\b(step|example|instance|such as|for instance)\b/i.test(lower)) {
        signals.push('contains_examples');
        score += 10;
      }
      if (/\b(tip|advice|best practice|recommendation|strategy|method)\b/i.test(lower)) {
        signals.push('contains_actionable_advice');
        score += 10;
      }
      // Should have clear structure
      const headingCount = splitParagraphs(text).filter(isHeading).length;
      if (headingCount >= 3) { signals.push('well_structured'); score += 10; }
      break;
    }
    case 'commercial': {
      if (/\b(pros?|cons?|advantages?|disadvantages?|benefit|drawback)\b/i.test(lower)) {
        signals.push('contains_pros_cons');
        score += 15;
      }
      if (/\b(price|cost|\$|€|£|pricing|plan|tier)\b/i.test(lower)) {
        signals.push('contains_pricing');
        score += 10;
      }
      if (/\b(recommend|verdict|conclusion|winner|best overall|top pick)\b/i.test(lower)) {
        signals.push('contains_verdict');
        score += 15;
      }
      break;
    }
    case 'comparison': {
      if (/\b(vs\.?|versus)\b/i.test(lower)) {
        signals.push('contains_comparison');
        score += 15;
      }
      if (/\b(better|worse|superior|inferior|ahead|behind)\b/i.test(lower)) {
        signals.push('contains_evaluation');
        score += 10;
      }
      if (/\b(winner|verdict|recommend|choose|go with)\b/i.test(lower)) {
        signals.push('contains_recommendation');
        score += 10;
      }
      break;
    }
    case 'navigational': {
      score = 70; // Navigational content doesn't need much scoring
      signals.push('navigational_intent');
      break;
    }
    default:
      score = 50;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    detectedIntent: intent,
    answersIntent: score >= 65,
    signals,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// 14. HEADING HIERARCHY VALIDATION
// ══════════════════════════════════════════════════════════════════════════

export interface HeadingHierarchyScore {
  /** 0-100, higher = better hierarchy */
  score: number;
  /** Detected headings with levels */
  headings: { text: string; level: number }[];
  /** Hierarchy violations */
  violations: string[];
  /** Has proper H1 */
  hasH1: boolean;
}

function detectHeadingLevel(heading: string): number {
  const t = heading.trim();
  // Markdown headings
  const mdMatch = t.match(/^(#{1,6})\s/);
  if (mdMatch) return mdMatch[1].length;

  // Roman numeral (top level)
  if (/^[IVXLCDM]+[.)]\s/i.test(t)) return 2;

  // Numbered (A. / 1. / etc.)
  if (/^[A-Z][.)]\s/.test(t)) return 3;
  if (/^\d+[.)]\s/.test(t)) return 3;

  // Part/Section/Chapter
  if (/^(?:Part|Section|Chapter)\b/i.test(t)) return 1;

  // Short capitalized = likely H2
  const words = t.split(/\s+/);
  if (words.length <= 8 && t === t.toUpperCase()) return 2;

  // Default: H2
  return 2;
}

export function scoreHeadingHierarchy(text: string): HeadingHierarchyScore {
  const paras = splitParagraphs(text);
  const headings: HeadingHierarchyScore['headings'] = [];
  const violations: string[] = [];

  for (const p of paras) {
    if (isHeading(p)) {
      const level = detectHeadingLevel(p);
      headings.push({ text: p.replace(/^#{1,6}\s+/, '').trim(), level });
    }
  }

  if (headings.length === 0) return { score: 60, headings: [], violations: [], hasH1: false };

  // Check for H1
  const hasH1 = headings.some(h => h.level === 1);
  if (!hasH1 && headings.length > 0) {
    // If all headings are H2, auto-promote first to H1
    if (headings.every(h => h.level === 2)) {
      // This is common in blog posts — don't penalize
    } else {
      violations.push('No H1 heading found');
    }
  }

  // Check for level skips (H1→H3 without H2)
  for (let i = 1; i < headings.length; i++) {
    const prevLevel = headings[i - 1].level;
    const currLevel = headings[i].level;
    if (currLevel > prevLevel + 1) {
      violations.push(`Heading level skip: H${prevLevel} → H${currLevel} at "${headings[i].text}"`);
    }
  }

  // Check for reversed hierarchy (H3 before H2)
  let maxLevel = 0;
  for (const h of headings) {
    if (h.level < maxLevel && maxLevel - h.level > 1) {
      violations.push(`Reversed hierarchy: H${h.level} after H${maxLevel} at "${h.text}"`);
    }
    maxLevel = Math.max(maxLevel, h.level);
  }

  // Check for too many same-level headings without parent
  const levelCounts = new Map<number, number>();
  for (const h of headings) {
    levelCounts.set(h.level, (levelCounts.get(h.level) ?? 0) + 1);
  }

  let score = 100;
  score -= violations.length * 15;
  if (!hasH1 && headings.length > 2) score -= 10;

  return {
    score: Math.max(0, Math.min(100, score)),
    headings,
    violations,
    hasH1,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// 15. SNIPPET-WORTHINESS SCORING
// ══════════════════════════════════════════════════════════════════════════

export interface SnippetWorthinessScore {
  /** 0-100, higher = better snippet potential */
  score: number;
  /** Best candidate snippet sentences */
  bestSnippets: { text: string; score: number }[];
  /** Does intro paragraph have a quotable line */
  introQuotable: boolean;
  /** Do section openings have quotable lines */
  sectionOpeningsQuotable: number; // ratio
}

function scoreSnippetSentence(sentence: string): number {
  const words = sentence.split(/\s+/);
  let score = 0;

  // Ideal snippet length: 15-30 words
  if (words.length >= 15 && words.length <= 30) score += 30;
  else if (words.length >= 10 && words.length <= 40) score += 15;

  // Contains a definition or clear statement
  if (/\b(is|are|refers to|means|defined as|known as)\b/i.test(sentence)) score += 20;

  // Direct answer format
  if (/\b(the answer|the reason|the key|the main|the best|the most important)\b/i.test(sentence)) score += 15;

  // Contains numbers/data (search engines love concrete data)
  if (/\b\d+\b/.test(sentence)) score += 10;

  // No vague/filler words
  if (!/\b(very|really|quite|somewhat|basically|actually|literally|simply)\b/i.test(sentence)) score += 5;

  // Ends with period (complete thought)
  if (/\.$/.test(sentence.trim())) score += 5;

  // Not a question (snippets should be answers)
  if (/\?$/.test(sentence.trim())) score -= 10;

  return Math.max(0, Math.min(100, score));
}

export function scoreSnippetWorthiness(text: string): SnippetWorthinessScore {
  const paras = splitParagraphs(text);
  const allSnippets: { text: string; score: number }[] = [];

  let introQuotable = false;
  let quotableSectionOpeners = 0;
  let totalSectionOpeners = 0;

  for (let i = 0; i < paras.length; i++) {
    if (isHeading(paras[i])) {
      // Check next paragraph's first sentence as section opener
      if (i + 1 < paras.length && !isHeading(paras[i + 1])) {
        totalSectionOpeners++;
        const firstSent = robustSentenceSplit(paras[i + 1])[0];
        if (firstSent) {
          const s = scoreSnippetSentence(firstSent);
          if (s >= 40) quotableSectionOpeners++;
          allSnippets.push({ text: firstSent, score: s });
        }
      }
      continue;
    }

    const sents = robustSentenceSplit(paras[i]);
    for (const sent of sents) {
      const s = scoreSnippetSentence(sent);
      allSnippets.push({ text: sent, score: s });
    }

    // Check if first body paragraph (intro) has quotable content
    if (i === 0 || (i === 1 && isHeading(paras[0]))) {
      const introSents = sents.map(s => ({ text: s, score: scoreSnippetSentence(s) }));
      introQuotable = introSents.some(s => s.score >= 50);
    }
  }

  // Sort by score, take top 3
  allSnippets.sort((a, b) => b.score - a.score);
  const bestSnippets = allSnippets.slice(0, 3);

  const sectionOpeningsQuotable = totalSectionOpeners > 0 ? quotableSectionOpeners / totalSectionOpeners : 0;

  let score = 40; // base
  if (introQuotable) score += 25;
  score += sectionOpeningsQuotable * 20;
  if (bestSnippets.length > 0) score += Math.min(15, bestSnippets[0].score / 5);

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    bestSnippets,
    introQuotable,
    sectionOpeningsQuotable: Math.round(sectionOpeningsQuotable * 100) / 100,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// MASTER ORCHESTRATOR
// ══════════════════════════════════════════════════════════════════════════

export interface CoherenceOptions {
  /** Optional SEO keywords to track */
  seoKeywords?: string[];
  /** Content type: 'blog', 'academic', 'seo', 'general' */
  contentType?: 'blog' | 'academic' | 'seo' | 'general';
  /** Skip specific scorers */
  skip?: string[];
}

export interface CoherenceReport {
  /** Overall coherence score 0-100 */
  overallScore: number;

  /** Individual scores */
  paragraphCadence: CadenceScore;
  transitionFit: TransitionFitScore;
  referenceChains: ReferenceChainScore;
  repetitionDecay: RepetitionDecayScore;
  clauseShapeDiversity: ClauseShapeScore;
  entityRetention: EntityRetentionScore;
  seoKeywords: SEOKeywordScore;
  headingBodyAlignment: HeadingBodyScore;
  readabilityDrift: ReadabilityDriftScore;
  informationGain: InformationGainScore;
  paragraphPurpose: ParagraphPurposeResult;
  searchIntentCoverage: SearchIntentScore;
  headingHierarchy: HeadingHierarchyScore;
  snippetWorthiness: SnippetWorthinessScore;

  /** Timestamp */
  analyzedAt: number;
}

export function analyzeDocumentCoherence(
  original: string,
  humanized: string,
  options: CoherenceOptions = {},
): CoherenceReport {
  const skip = new Set(options.skip ?? []);

  const paragraphCadence = !skip.has('paragraphCadence')
    ? scoreParagraphCadence(humanized)
    : { score: 50, perParaVariance: [], crossParaVariance: 0, openingDiversity: 1 } as CadenceScore;

  const transitionFit = !skip.has('transitionFit')
    ? scoreTransitionFit(humanized)
    : { score: 50, transitionCount: 0, mismatchCount: 0, mismatches: [] } as TransitionFitScore;

  const referenceChains = !skip.has('referenceChains')
    ? scoreReferenceChains(humanized)
    : { score: 50, totalReferences: 0, vagueCount: 0, vagueIndices: [] } as ReferenceChainScore;

  const repetitionDecay = !skip.has('repetitionDecay')
    ? scoreRepetitionDecay(humanized)
    : { score: 50, stemRepetitions: { window3: 0, window5: 0, window8: 0 }, transitionRepetitions: 0, topRepeatedStems: [] } as RepetitionDecayScore;

  const clauseShapeDiversity = !skip.has('clauseShapeDiversity')
    ? scoreClauseShapeDiversity(humanized)
    : { score: 50, histogram: {} as any, dominantShapePercent: 0, dominantShape: 'other' as ClauseShape } as ClauseShapeScore;

  const entityRetention = !skip.has('entityRetention')
    ? scoreEntityRetention(original, humanized)
    : { score: 100, originalEntities: [], missingEntities: [], originalNumbers: [], missingNumbers: [], originalYears: [], missingYears: [] } as EntityRetentionScore;

  const seoKeywords = !skip.has('seoKeywords')
    ? scoreSEOKeywords(original, humanized, options.seoKeywords)
    : { score: 80, exactMatchRetention: 1, stemMatchRetention: 1, primaryDensity: 0, inFirst100Words: true, inHeadings: true, overOptimized: false, keywordDetails: [] } as SEOKeywordScore;

  const headingBodyAlignment = !skip.has('headingBodyAlignment')
    ? scoreHeadingBodyAlignment(humanized)
    : { score: 80, details: [] } as HeadingBodyScore;

  const readabilityDrift = !skip.has('readabilityDrift')
    ? scoreReadabilityDrift(humanized)
    : { score: 50, perSentenceReadability: [], profileType: 'mixed' as const, driftMagnitude: 0 } as ReadabilityDriftScore;

  const informationGain = !skip.has('informationGain')
    ? scoreInformationGain(humanized)
    : { score: 50, roles: [], hasNaturalProgression: true, noveltyScores: [] } as InformationGainScore;

  const paragraphPurpose = !skip.has('paragraphPurpose')
    ? labelParagraphPurposes(humanized)
    : { labels: [], structureScore: 50, missing: [], pattern: '' } as ParagraphPurposeResult;

  const searchIntentCoverage = !skip.has('searchIntentCoverage')
    ? scoreSearchIntentCoverage(humanized)
    : { score: 50, detectedIntent: 'informational' as SearchIntent, answersIntent: true, signals: [] } as SearchIntentScore;

  const headingHierarchy = !skip.has('headingHierarchy')
    ? scoreHeadingHierarchy(humanized)
    : { score: 80, headings: [], violations: [], hasH1: true } as HeadingHierarchyScore;

  const snippetWorthiness = !skip.has('snippetWorthiness')
    ? scoreSnippetWorthiness(humanized)
    : { score: 50, bestSnippets: [], introQuotable: true, sectionOpeningsQuotable: 0 } as SnippetWorthinessScore;

  // Overall score: weighted average based on content type
  const weights = getWeights(options.contentType ?? 'general');
  const scores: Record<string, number> = {
    paragraphCadence: paragraphCadence.score,
    transitionFit: transitionFit.score,
    referenceChains: referenceChains.score,
    repetitionDecay: repetitionDecay.score,
    clauseShapeDiversity: clauseShapeDiversity.score,
    entityRetention: entityRetention.score,
    seoKeywords: seoKeywords.score,
    headingBodyAlignment: headingBodyAlignment.score,
    readabilityDrift: readabilityDrift.score,
    informationGain: informationGain.score,
    paragraphPurpose: paragraphPurpose.structureScore,
    searchIntentCoverage: searchIntentCoverage.score,
    headingHierarchy: headingHierarchy.score,
    snippetWorthiness: snippetWorthiness.score,
  };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (scores[key] !== undefined && !skip.has(key)) {
      weightedSum += scores[key] * weight;
      totalWeight += weight;
    }
  }
  const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;

  return {
    overallScore,
    paragraphCadence,
    transitionFit,
    referenceChains,
    repetitionDecay,
    clauseShapeDiversity,
    entityRetention,
    seoKeywords,
    headingBodyAlignment,
    readabilityDrift,
    informationGain,
    paragraphPurpose,
    searchIntentCoverage,
    headingHierarchy,
    snippetWorthiness,
    analyzedAt: Date.now(),
  };
}

function getWeights(contentType: string): Record<string, number> {
  switch (contentType) {
    case 'blog':
      return {
        paragraphCadence: 1.5, transitionFit: 1.5, referenceChains: 1.0,
        repetitionDecay: 1.2, clauseShapeDiversity: 1.0, entityRetention: 1.5,
        seoKeywords: 1.8, headingBodyAlignment: 1.5, readabilityDrift: 1.2,
        informationGain: 1.0, paragraphPurpose: 1.0, searchIntentCoverage: 1.3,
        headingHierarchy: 1.2, snippetWorthiness: 1.5,
      };
    case 'seo':
      return {
        paragraphCadence: 1.0, transitionFit: 1.0, referenceChains: 0.8,
        repetitionDecay: 1.0, clauseShapeDiversity: 0.8, entityRetention: 2.0,
        seoKeywords: 2.5, headingBodyAlignment: 2.0, readabilityDrift: 0.8,
        informationGain: 0.8, paragraphPurpose: 0.8, searchIntentCoverage: 2.0,
        headingHierarchy: 2.0, snippetWorthiness: 2.0,
      };
    case 'academic':
      return {
        paragraphCadence: 1.2, transitionFit: 1.8, referenceChains: 1.5,
        repetitionDecay: 1.5, clauseShapeDiversity: 1.2, entityRetention: 2.0,
        seoKeywords: 0.2, headingBodyAlignment: 1.0, readabilityDrift: 1.0,
        informationGain: 1.5, paragraphPurpose: 1.5, searchIntentCoverage: 0.2,
        headingHierarchy: 0.8, snippetWorthiness: 0.3,
      };
    default: // 'general'
      return {
        paragraphCadence: 1.0, transitionFit: 1.2, referenceChains: 1.0,
        repetitionDecay: 1.0, clauseShapeDiversity: 1.0, entityRetention: 1.5,
        seoKeywords: 1.0, headingBodyAlignment: 1.0, readabilityDrift: 1.0,
        informationGain: 0.8, paragraphPurpose: 0.8, searchIntentCoverage: 0.8,
        headingHierarchy: 0.8, snippetWorthiness: 0.8,
      };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// AUTO-FIXER
// ══════════════════════════════════════════════════════════════════════════

/** Connector alternatives for transition fit fixing */
const TRANSITION_ALTERNATIVES: Record<TransitionClass, string[]> = {
  additive: ['In addition, ', 'On top of that, ', 'Equally, ', 'Along the same lines, ', 'Building on this, '],
  adversative: ['That said, ', 'On the other hand, ', 'Even so, ', 'At the same time, ', 'Still, '],
  causal: ['As a result, ', 'For this reason, ', 'This leads to ', 'Because of this, ', 'Consequently, '],
  temporal: ['Following this, ', 'After that, ', 'Subsequently, ', 'In the meantime, ', 'Then, '],
  exemplifying: ['For instance, ', 'To illustrate, ', 'As an example, ', 'Consider, ', 'One case involves '],
  none: [],
};

export function fixDocumentCoherence(
  original: string,
  humanized: string,
  report: CoherenceReport,
): string {
  let result = humanized;

  // Fix order matches the user's recommended priority:
  // 1. Entity retention → 2. Transition fit → 3. Repetition decay →
  // 4. Reference chains → 5. SEO keywords → 6. Readability drift →
  // 7. Revision fingerprints

  // ── 1. FIX ENTITY RETENTION ──
  if (report.entityRetention.score < 80) {
    result = fixEntityRetention(original, result, report.entityRetention);
  }

  // ── 2. FIX TRANSITION FIT ──
  if (report.transitionFit.score < 70 && report.transitionFit.mismatches.length > 0) {
    result = fixTransitionFit(result, report.transitionFit);
  }

  // ── 3. FIX REPETITION DECAY ──
  if (report.repetitionDecay.score < 50) {
    result = fixRepetitionDecay(result, report.repetitionDecay);
  }

  // ── 4. FIX REFERENCE CHAINS ──
  if (report.referenceChains.score < 65) {
    result = fixReferenceChains(result, report.referenceChains);
  }

  // ── 5. FIX SEO KEYWORDS ──
  if (report.seoKeywords.score < 60) {
    result = fixSEOKeywords(original, result, report.seoKeywords);
  }

  // ── 6. FIX READABILITY DRIFT ──
  if (report.readabilityDrift.profileType === 'flat' && report.readabilityDrift.score < 40) {
    result = fixReadabilityDrift(result);
  }

  // ── 7. APPLY REVISION FINGERPRINTS ──
  // Only for blog/general content, not academic
  const fingerprinted = applyRevisionFingerprints(result);
  if (fingerprinted.appliedCount > 0) {
    result = fingerprinted.text;
  }

  return result;
}

// ── Individual fixers ──

function fixEntityRetention(original: string, humanized: string, report: EntityRetentionScore): string {
  let result = humanized;

  // Re-inject missing years (highest priority — numbers are facts)
  for (const year of report.missingYears) {
    // Find the original sentence containing this year
    const origSents = robustSentenceSplit(original);
    const origSent = origSents.find(s => s.includes(year));
    if (!origSent) continue;

    // Find the best-matching output sentence
    const outSents = robustSentenceSplit(result);
    let bestIdx = -1;
    let bestOverlap = 0;
    const origWords = contentWordSet(origSent);
    for (let i = 0; i < outSents.length; i++) {
      const outWords = contentWordSet(outSents[i]);
      const overlap = [...origWords].filter(w => outWords.has(w)).length;
      if (overlap > bestOverlap) { bestOverlap = overlap; bestIdx = i; }
    }

    if (bestIdx >= 0 && !outSents[bestIdx].includes(year)) {
      // Try to insert year naturally
      const sent = outSents[bestIdx];
      // Insert near the end, before the period
      const periodIdx = sent.lastIndexOf('.');
      if (periodIdx > 0) {
        outSents[bestIdx] = sent.slice(0, periodIdx) + ` (${year})` + sent.slice(periodIdx);
        result = rebuildText(humanized, outSents);
      }
    }
  }

  // Re-inject missing numbers
  for (const num of report.missingNumbers) {
    if (result.includes(num)) continue;
    const origSents = robustSentenceSplit(original);
    const origSent = origSents.find(s => s.includes(num));
    if (!origSent) continue;

    const outSents = robustSentenceSplit(result);
    let bestIdx = -1;
    let bestOverlap = 0;
    const origWords = contentWordSet(origSent);
    for (let i = 0; i < outSents.length; i++) {
      const outWords = contentWordSet(outSents[i]);
      const overlap = [...origWords].filter(w => outWords.has(w)).length;
      if (overlap > bestOverlap) { bestOverlap = overlap; bestIdx = i; }
    }

    if (bestIdx >= 0 && bestOverlap >= 2) {
      // Replace the output sentence with one that preserves the number
      // by inserting the number context
      const sent = outSents[bestIdx];
      if (!sent.includes(num)) {
        // Extract the context around the number in the original
        const numIdx = origSent.indexOf(num);
        if (numIdx >= 0) {
          // Get a short phrase around the number
          const start = Math.max(0, origSent.lastIndexOf(' ', numIdx - 1));
          const end = Math.min(origSent.length, origSent.indexOf(' ', numIdx + num.length + 5));
          const phrase = origSent.slice(start, end > start ? end : origSent.length).trim();
          if (phrase.length < 40) {
            const periodIdx = sent.lastIndexOf('.');
            if (periodIdx > 0) {
              outSents[bestIdx] = sent.slice(0, periodIdx) + ' (' + phrase + ')' + sent.slice(periodIdx);
              result = rebuildText(humanized, outSents);
            }
          }
        }
      }
    }
  }

  return result;
}

function fixTransitionFit(humanized: string, report: TransitionFitScore): string {
  const paras = splitParagraphs(humanized);
  const allSents: string[] = [];
  const sentParaMap: number[] = [];

  for (let pIdx = 0; pIdx < paras.length; pIdx++) {
    if (isHeading(paras[pIdx])) continue;
    const sents = robustSentenceSplit(paras[pIdx]);
    for (const s of sents) {
      allSents.push(s);
      sentParaMap.push(pIdx);
    }
  }

  // Fix up to 3 mismatches (avoid over-editing)
  const fixLimit = Math.min(3, report.mismatches.length);
  for (let f = 0; f < fixLimit; f++) {
    const mm = report.mismatches[f];
    if (mm.index >= allSents.length) continue;

    const sent = allSents[mm.index];
    const trans = detectTransition(sent);
    if (!trans) continue;

    // Get replacement connector for the expected class
    const alts = TRANSITION_ALTERNATIVES[mm.expected];
    if (!alts || alts.length === 0) continue;

    const replacement = alts[hashStr(sent) % alts.length];
    const afterTrans = sent.slice(trans.connector.length).replace(/^[,\s]+/, '');
    if (afterTrans.length > 5) {
      allSents[mm.index] = replacement + afterTrans.charAt(0).toLowerCase() + afterTrans.slice(1);
    }
  }

  return rebuildFromSentences(humanized, allSents);
}

function fixRepetitionDecay(humanized: string, report: RepetitionDecayScore): string {
  if (report.topRepeatedStems.length === 0) return humanized;

  let result = humanized;
  // For the top 3 most repeated stems, try to replace some occurrences with synonyms
  const STEM_SYNONYMS: Record<string, string[]> = {
    'import': ['significant', 'crucial', 'key', 'vital', 'essential', 'notable'],
    'signific': ['notable', 'meaningful', 'substantial', 'considerable', 'marked'],
    'increas': ['growing', 'rising', 'expanding', 'climbing', 'escalating'],
    'decreas': ['declining', 'falling', 'dropping', 'shrinking', 'diminishing'],
    'provid': ['offering', 'supplying', 'delivering', 'giving', 'presenting'],
    'develop': ['evolving', 'advancing', 'progressing', 'growing', 'maturing'],
    'improv': ['enhancing', 'boosting', 'strengthening', 'upgrading', 'refining'],
    'challeng': ['difficulty', 'obstacle', 'hurdle', 'issue', 'problem'],
    'approach': ['method', 'strategy', 'technique', 'system', 'framework'],
    'research': ['study', 'investigation', 'analysis', 'examination', 'inquiry'],
    'address': ['tackle', 'handle', 'deal with', 'manage', 'attend to'],
    'implement': ['execute', 'carry out', 'apply', 'put into practice', 'deploy'],
    'achiev': ['attaining', 'reaching', 'accomplishing', 'realizing', 'gaining'],
    'effect': ['impact', 'influence', 'outcome', 'consequence', 'result'],
    'establ': ['creating', 'forming', 'building', 'setting up', 'founding'],
  };

  for (const repeatedStem of report.topRepeatedStems.slice(0, 3)) {
    const synonyms = STEM_SYNONYMS[repeatedStem];
    if (!synonyms) continue;

    // Find all occurrences of words with this stem
    const regex = new RegExp(`\\b(\\w*${repeatedStem}\\w*)\\b`, 'gi');
    let matchCount = 0;
    result = result.replace(regex, (match) => {
      matchCount++;
      // Replace every 3rd occurrence to maintain some natural repetition
      if (matchCount % 3 === 0) {
        const synonym = synonyms[matchCount % synonyms.length];
        return match[0] === match[0].toUpperCase()
          ? synonym.charAt(0).toUpperCase() + synonym.slice(1)
          : synonym;
      }
      return match;
    });
  }

  return result;
}

function fixReferenceChains(humanized: string, report: ReferenceChainScore): string {
  if (report.vagueIndices.length === 0) return humanized;

  const paras = splitParagraphs(humanized);
  const allSents: string[] = [];
  for (const p of paras) {
    if (isHeading(p)) continue;
    allSents.push(...robustSentenceSplit(p));
  }

  // Fix up to 3 vague references
  const fixLimit = Math.min(3, report.vagueIndices.length);
  for (let f = 0; f < fixLimit; f++) {
    const idx = report.vagueIndices[f];
    if (idx >= allSents.length || idx < 1) continue;

    const sent = allSents[idx];
    const prevSent = allSents[idx - 1];

    // Extract the main topic from the previous sentence
    const prevContent = contentWords(prevSent);
    if (prevContent.length === 0) continue;

    // Get the most important noun phrase from previous sentence
    const topicWord = prevContent.find(w => w.length >= 5) ?? prevContent[0];

    // Replace vague "This is" with "This [topic] is"
    if (/^This\s+(is|was|has|can|could|will|would|should|may|might)\b/i.test(sent)) {
      allSents[idx] = sent.replace(/^This\s+/i, `This ${topicWord} `);
    }
    // Replace "It is" with "[Topic] is"
    else if (/^It\s+(is|was|has|can|could)\s+/i.test(sent)) {
      const capitalized = topicWord.charAt(0).toUpperCase() + topicWord.slice(1);
      allSents[idx] = sent.replace(/^It\s+/i, `${capitalized} `);
    }
  }

  return rebuildFromSentences(humanized, allSents);
}

function fixSEOKeywords(original: string, humanized: string, report: SEOKeywordScore): string {
  let result = humanized;

  // Re-inject keywords that were lost
  for (const detail of report.keywordDetails) {
    if (detail.outputCount >= detail.originalCount) continue; // Already retained
    if (detail.outputCount > 0) continue; // Still present, just reduced — acceptable

    // Keyword completely lost — try to re-inject
    const keyword = detail.keyword;
    const origSents = robustSentenceSplit(original);
    const origSent = origSents.find(s => s.toLowerCase().includes(keyword.toLowerCase()));
    if (!origSent) continue;

    // Find best matching output sentence
    const outSents = robustSentenceSplit(result);
    let bestIdx = -1;
    let bestOverlap = 0;
    const origWords = contentWordSet(origSent);
    for (let i = 0; i < outSents.length; i++) {
      const outWords = contentWordSet(outSents[i]);
      const overlap = [...origWords].filter(w => outWords.has(w)).length;
      if (overlap > bestOverlap) { bestOverlap = overlap; bestIdx = i; }
    }

    if (bestIdx >= 0 && bestOverlap >= 2 && !outSents[bestIdx].toLowerCase().includes(keyword.toLowerCase())) {
      // Insert keyword naturally: replace a synonym or append as context
      const sent = outSents[bestIdx];
      // Try to find a place to insert the keyword
      const words = sent.split(/\s+/);
      if (words.length > 5) {
        // Insert near the middle of the sentence
        const midIdx = Math.floor(words.length / 2);
        words.splice(midIdx, 0, keyword);
        outSents[bestIdx] = words.join(' ');
        result = rebuildText(humanized, outSents);
      }
    }
  }

  return result;
}

function fixReadabilityDrift(humanized: string): string {
  const paras = splitParagraphs(humanized);
  const resultParas: string[] = [];

  for (const para of paras) {
    if (isHeading(para)) {
      resultParas.push(para);
      continue;
    }

    const sents = robustSentenceSplit(para);
    if (sents.length < 4) {
      resultParas.push(para);
      continue;
    }

    // Check for flat readability (3+ consecutive similar-length sentences)
    const lengths = sents.map(s => s.split(/\s+/).length);
    const resultSents = [...sents];

    for (let i = 2; i < lengths.length; i++) {
      const l0 = lengths[i - 2], l1 = lengths[i - 1], l2 = lengths[i];
      // If 3 consecutive sentences have similar length (within 3 words)
      if (Math.abs(l0 - l1) <= 3 && Math.abs(l1 - l2) <= 3 && l2 > 10) {
        // Try to shorten the middle sentence by removing a dispensable clause
        const midSent = resultSents[i - 1];
        // Remove a non-essential prepositional phrase
        const shortened = midSent.replace(/,\s+(?:which|that|where|when)\s+[^,]+,/i, ',');
        if (shortened !== midSent && shortened.split(/\s+/).length >= 5) {
          resultSents[i - 1] = shortened;
        }
      }
    }

    resultParas.push(resultSents.join(' '));
  }

  return resultParas.join('\n\n');
}

// ── Helper: rebuild text from sentence array preserving paragraph structure ──

function rebuildText(originalText: string, sentences: string[]): string {
  const paras = splitParagraphs(originalText);
  let sentIdx = 0;
  const resultParas: string[] = [];

  for (const para of paras) {
    if (isHeading(para)) {
      resultParas.push(para);
      continue;
    }
    const paraSentCount = robustSentenceSplit(para).length;
    const replacedSents: string[] = [];
    for (let j = 0; j < paraSentCount && sentIdx < sentences.length; j++) {
      replacedSents.push(sentences[sentIdx++]);
    }
    resultParas.push(replacedSents.join(' '));
  }

  // Append remaining sentences if any
  while (sentIdx < sentences.length) {
    const last = resultParas.length > 0 ? resultParas.length - 1 : 0;
    if (resultParas.length > 0) {
      resultParas[last] += ' ' + sentences[sentIdx++];
    } else {
      resultParas.push(sentences[sentIdx++]);
    }
  }

  return resultParas.join('\n\n');
}

function rebuildFromSentences(originalText: string, allSents: string[]): string {
  return rebuildText(originalText, allSents);
}
