import { robustSentenceSplit } from './content-protection';
import { TextSignals } from './multi-detector';

export type DocumentStyleProfile = 'academic' | 'blog' | 'wiki' | 'general';
export type SentenceStyleClass = 'fact' | 'analysis' | 'transition' | 'conclusion' | 'citation' | 'argument' | 'reflection' | 'narrative';
export type SentenceRiskLevel = 'low' | 'medium' | 'high';

export interface StyleStabilityOptions {
  sourceText?: string;
  tone?: string;
  engine?: string;
}

export interface SentenceStabilityScore {
  index: number;
  text: string;
  styleClass: SentenceStyleClass;
  aiScore: number;
  riskScore: number;
  riskLevel: SentenceRiskLevel;
  reasons: string[];
  wordCount: number;
  flaggedPhrases: string[];
}

export interface StyleStabilityReport {
  profile: DocumentStyleProfile;
  sentenceCount: number;
  overallScore: number;
  flatnessScore: number;
  openerDiversityScore: number;
  averageSentenceLength: number;
  sentenceLengthCv: number;
  highRiskCount: number;
  sentences: SentenceStabilityScore[];
}

export interface StyleStabilityNormalizationResult {
  text: string;
  changedSentenceCount: number;
  touchedSentenceIndices: number[];
}

interface ParagraphSegment {
  text: string;
  isHeading: boolean;
  sentences: string[];
}

const AIISH_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string; reason: string }> = [
  { pattern: /\bit is important to note that\s+/gi, replacement: '', reason: 'aiish_phrase' },
  { pattern: /\bplays? a crucial role in\b/gi, replacement: 'is important in', reason: 'aiish_phrase' },
  { pattern: /\bplays? a (?:key|vital|significant|pivotal) role in\b/gi, replacement: 'matters in', reason: 'aiish_phrase' },
  { pattern: /\bin today'?s (?:world|landscape|society|era)\b/gi, replacement: 'today', reason: 'aiish_phrase' },
  { pattern: /\bkey takeaway\b/gi, replacement: 'main point', reason: 'aiish_phrase' },
  { pattern: /\bsignificantly impacts?\b/gi, replacement: 'changes', reason: 'aiish_phrase' },
  { pattern: /\bsignificantly contributes? to\b/gi, replacement: 'helps', reason: 'detector_magnet' },
  { pattern: /\bsignificantly contributes?\b/gi, replacement: 'helps', reason: 'detector_magnet' },
  { pattern: /\bowing to the fact that\b/gi, replacement: 'because', reason: 'detector_magnet' },
  { pattern: /\bin conclusion,?\s+it is important to note that\s+/gi, replacement: 'Overall, ', reason: 'detector_magnet' },
  { pattern: /\bdelves? into\b/gi, replacement: 'looks at', reason: 'aiish_phrase' },
];

const DETECTOR_MAGNET_PATTERNS: RegExp[] = [
  /\bowing to the fact that\b/i,
  /\bfurthermore\b/i,
  /\bmoreover\b/i,
  /\bin conclusion,?\s+it is important to note that\b/i,
  /\bsignificantly contributes? to\b/i,
  /\bplays? a crucial role\b/i,
];

const LEXICAL_DOWNGRADES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\butili[sz]e\b/gi, replacement: 'use' },
  { pattern: /\bfacilitate\b/gi, replacement: 'help' },
  { pattern: /\bleverages?\b/gi, replacement: 'uses' },
  { pattern: /\brobust\b/gi, replacement: 'strong' },
  { pattern: /\boptimi[sz]e\b/gi, replacement: 'improve' },
  { pattern: /\bimpactful\b/gi, replacement: 'important' },
  { pattern: /\bfosters?\b/gi, replacement: 'helps' },
  { pattern: /\blandscape\b/gi, replacement: 'field' },
];

const ASSERTIVE_VERB_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bdemonstrates\b/i, replacement: 'suggests' },
  { pattern: /\bdemonstrated\b/i, replacement: 'suggested' },
  { pattern: /\bdemonstrate\b/i, replacement: 'suggest' },
  { pattern: /\bshows\b/i, replacement: 'suggests' },
  { pattern: /\bshowed\b/i, replacement: 'suggested' },
  { pattern: /\bshow\b/i, replacement: 'suggest' },
  { pattern: /\bindicates\b/i, replacement: 'suggests' },
  { pattern: /\bindicated\b/i, replacement: 'suggested' },
  { pattern: /\bindicate\b/i, replacement: 'suggest' },
  { pattern: /\bproves\b/i, replacement: 'appears to show' },
  { pattern: /\bproved\b/i, replacement: 'appeared to show' },
  { pattern: /\bprove\b/i, replacement: 'appear to show' },
  { pattern: /\bestablishes\b/i, replacement: 'suggests' },
  { pattern: /\bestablished\b/i, replacement: 'suggested' },
  { pattern: /\bestablish\b/i, replacement: 'suggest' },
];

const TRANSITION_START_RE = /^(?:Furthermore|Moreover|Additionally|In addition|Importantly|Notably|Specifically|Consequently|As a result|Therefore|Thus),?\s+/i;
const CONCLUSION_START_RE = /^(?:In conclusion|To conclude|Overall|Ultimately|Taken together),?\s+/i;
const HEDGE_RE = /\b(?:may|might|appears? to|seems? to|suggests?|in many cases|at times|often|likely|perhaps|arguably|can be understood as)\b/i;
const ANALYSIS_RE = /\b(?:suggests?|indicates?|shows?|demonstrates?|reveals?|implies?|argues?|contends?|establish(?:es|ed)?|proves?|proved)\b/i;
const ARGUMENT_RE = /\b(?:argues?|contends?|claims?|maintains?|asserts?|holds?|insists?|defends?)\b/i;
const REFLECTION_RE = /\b(?:I|we|my|our|me|us)\b|\b(?:in my view|I think|we can see|it seems to me|from my perspective)\b/i;
const CITATION_RE = /\([A-Za-z][^)]*\d{4}\)|\[[0-9,\s]+\]|\b(?:according to|as noted by|as argued by|as described by)\b/i;
const FACT_RE = /\b(?:\d{4}|\d+(?:\.\d+)?%|\$\d+|\[[0-9,\s]+\])\b/;
const AI_SWEET_SPOT_MIN = 13;
const AI_SWEET_SPOT_MAX = 30;

const TRANSITION_VARIANTS: Record<DocumentStyleProfile, string[]> = {
  academic: ['However, ', 'In many cases, ', 'At the same time, ', ''],
  blog: ['However, ', 'Sometimes, ', 'In many cases, ', ''],
  wiki: ['However, ', 'At the same time, ', ''],
  general: ['However, ', 'Often, ', 'In many cases, ', ''],
};

const CONCLUSION_VARIANTS: Record<DocumentStyleProfile, string[]> = {
  academic: ['Taken together, ', 'On balance, ', ''],
  blog: ['Overall, ', 'In the end, ', ''],
  wiki: ['Overall, ', ''],
  general: ['Overall, ', 'In the end, '],
};

const HEDGE_PREFIXES: Record<DocumentStyleProfile, string[]> = {
  academic: ['It may be argued that ', 'It appears that ', 'It may be observed that '],
  blog: ['In many cases, ', 'It appears that ', 'At times, '],
  wiki: ['It appears that ', 'In some cases, '],
  general: ['It appears that ', 'In many cases, ', 'At times, '],
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function std(values: number[]): number {
  const avg = mean(values);
  return values.length ? Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length) : 0;
}

function coefficientOfVariation(values: number[]): number {
  const avg = mean(values);
  return avg > 0 ? std(values) / avg : 0;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function isHeadingLike(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const words = trimmed.split(/\s+/);
  return /^#{1,6}\s/.test(trimmed)
    || /^[IVXLCDM]+[.)]\s/i.test(trimmed)
    || ((/^[\d]+[.):\-]\s/.test(trimmed) || /^[A-Za-z][.)]\s/.test(trimmed)) && words.length <= 12)
    || (words.length <= 5 && !/[.!?]$/.test(trimmed));
}

function segmentParagraphs(text: string): ParagraphSegment[] {
  return text.split(/\n\s*\n/).map((paragraph) => {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      return { text: '', isHeading: true, sentences: [] };
    }

    if (isHeadingLike(trimmed)) {
      return { text: trimmed, isHeading: true, sentences: [trimmed] };
    }

    const sentences = robustSentenceSplit(trimmed);
    return {
      text: trimmed,
      isHeading: false,
      sentences: sentences.length ? sentences : [trimmed],
    };
  });
}

function matchCase(match: string, replacement: string): string {
  if (!replacement) return '';
  if (match === match.toUpperCase()) return replacement.toUpperCase();
  if (match[0] === match[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function replaceCaseAware(text: string, pattern: RegExp, replacement: string): string {
  pattern.lastIndex = 0;
  return text.replace(pattern, (match) => matchCase(match, replacement));
}

function capitalizeSentenceStart(text: string): string {
  return text.replace(/^(["'([\s]*)([a-z])/, (_, prefix: string, first: string) => `${prefix}${first.toUpperCase()}`);
}

function decapitalizeSentenceStart(text: string): string {
  return text.replace(/^(["'([\s]*)([A-Z])([a-z])/, (_, prefix: string, first: string, rest: string) => `${prefix}${first.toLowerCase()}${rest}`);
}

function normalizeSpacing(text: string): string {
  return text
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])(?!\s|$)/g, '$1 ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function detectOpenerFamily(sentence: string): string {
  const trimmed = sentence.trim().replace(/^["'([\s]+/, '');
  if (!trimmed) return 'empty';
  if (CONCLUSION_START_RE.test(trimmed)) return 'conclusion';
  if (TRANSITION_START_RE.test(trimmed)) return 'transition';
  const words = trimmed.toLowerCase().split(/\s+/).map(word => word.replace(/^[^a-z]+|[^a-z]+$/g, '')).filter(Boolean);
  if (!words.length) return 'empty';
  if (['this', 'these', 'it', 'there'].includes(words[0])) return words[0];
  return words.slice(0, Math.min(2, words.length)).join(' ');
}

export function getSentenceRiskLevel(riskScore: number): SentenceRiskLevel {
  if (riskScore < 12) return 'low';
  if (riskScore < 22) return 'medium';
  return 'high';
}

export function inferDocumentStyleProfile(text: string, options: StyleStabilityOptions = {}): DocumentStyleProfile {
  const source = options.sourceText ?? text;
  if (options.engine === 'ghost_pro_wiki') return 'wiki';
  if (options.tone === 'academic_blog') return 'blog';
  if (options.tone === 'academic') return 'academic';

  const citationCount = (source.match(/\([A-Za-z][^)]*\d{4}\)|\[[0-9,\s]+\]/g) ?? []).length;
  const headingCount = (source.match(/^\s*(?:#{1,6}\s|[0-9]+[.)]\s)/gm) ?? []).length;
  const firstPersonCount = (source.match(/\b(?:I|we|my|our|me|us)\b/g) ?? []).length;

  if (citationCount >= 2) return 'academic';
  if (headingCount >= 2 && firstPersonCount > 0) return 'blog';
  if (headingCount >= 2) return 'blog';
  return 'general';
}

function classifySentence(sentence: string, index: number, totalSentences: number): SentenceStyleClass {
  const trimmed = sentence.trim();
  if (CITATION_RE.test(trimmed) && (FACT_RE.test(trimmed) || /\([A-Za-z][^)]*\d{4}\)/.test(trimmed))) {
    return 'citation';
  }
  if (CONCLUSION_START_RE.test(trimmed) || (index === totalSentences - 1 && /\b(?:therefore|overall|ultimately|in summary|in short)\b/i.test(trimmed))) {
    return 'conclusion';
  }
  if (TRANSITION_START_RE.test(trimmed)) return 'transition';
  if (REFLECTION_RE.test(trimmed)) return 'reflection';
  if (ARGUMENT_RE.test(trimmed)) return 'argument';
  if (ANALYSIS_RE.test(trimmed)) return 'analysis';
  if (FACT_RE.test(trimmed)) return 'fact';
  return 'narrative';
}

function computeFlatnessScore(sentenceLengthCv: number, sentenceCount: number): number {
  if (sentenceCount < 4) return 60;
  if (sentenceLengthCv < 0.18) return 28;
  if (sentenceLengthCv < 0.22) return 42;
  if (sentenceLengthCv < 0.28) return 58;
  if (sentenceLengthCv < 0.36) return 74;
  if (sentenceLengthCv < 0.55) return 86;
  if (sentenceLengthCv < 0.75) return 78;
  return 68;
}

export function analyzeStyleStability(text: string, options: StyleStabilityOptions = {}): StyleStabilityReport {
  const profile = inferDocumentStyleProfile(text, options);
  const segments = segmentParagraphs(text);
  const sentences = segments.flatMap(segment => segment.isHeading ? [] : segment.sentences);
  const sentenceLengths = sentences.map(sentence => sentence.split(/\s+/).filter(Boolean).length);
  const sentenceLengthCv = coefficientOfVariation(sentenceLengths);
  const averageSentenceLength = mean(sentenceLengths);
  const flatnessScore = computeFlatnessScore(sentenceLengthCv, sentences.length);
  const openerFamilies = sentences.map(detectOpenerFamily);
  const openerDiversityRatio = sentences.length ? new Set(openerFamilies).size / sentences.length : 1;
  const openerDiversityScore = Math.round(openerDiversityRatio * 100);

  const details = sentences.length ? new TextSignals(sentences.join(' ')).perSentenceDetails() : [];
  const openerCounts = new Map<string, number>();
  for (const family of openerFamilies) {
    openerCounts.set(family, (openerCounts.get(family) ?? 0) + 1);
  }

  const scoredSentences = sentences.map<SentenceStabilityScore>((sentence, index) => {
    const wordCount = sentenceLengths[index] ?? 0;
    const styleClass = classifySentence(sentence, index, sentences.length);
    const reasons: string[] = [];
    let riskScore = 0;

    const detail = details[index];
    const aiScore = Math.round(detail?.ai_score ?? 0);
    const flaggedPhrases = detail?.flagged_phrases ?? [];

    if (aiScore >= 42) {
      riskScore += 12;
      reasons.push('detector_hot');
    }
    if (flaggedPhrases.length > 0) {
      riskScore += Math.min(12, flaggedPhrases.length * 3);
      reasons.push('flagged_phrase');
    }

    let detectorMagnetHits = 0;
    for (const pattern of DETECTOR_MAGNET_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(sentence)) detectorMagnetHits++;
    }
    if (detectorMagnetHits > 0) {
      riskScore += Math.min(12, detectorMagnetHits * 4);
      reasons.push('detector_magnet');
    }

    if (TRANSITION_START_RE.test(sentence)) {
      riskScore += 16;
      reasons.push('formal_transition');
    }
    if (CONCLUSION_START_RE.test(sentence)) {
      riskScore += 14;
      reasons.push('conclusion_opener');
    }

    for (const replacement of AIISH_REPLACEMENTS) {
      replacement.pattern.lastIndex = 0;
      if (replacement.pattern.test(sentence)) {
        riskScore += 10;
        reasons.push(replacement.reason);
      }
    }

    let lexicalHits = 0;
    for (const downgrade of LEXICAL_DOWNGRADES) {
      downgrade.pattern.lastIndex = 0;
      if (downgrade.pattern.test(sentence)) lexicalHits++;
    }
    if (lexicalHits > 0) {
      riskScore += Math.min(12, lexicalHits * 4);
      reasons.push('polished_lexicon');
    }

    if ((styleClass === 'analysis' || styleClass === 'argument' || styleClass === 'reflection') && !HEDGE_RE.test(sentence) && profile !== 'wiki') {
      riskScore += 8;
      reasons.push('overcertain_analysis');
    }

    if (styleClass === 'citation' || styleClass === 'fact') {
      riskScore = Math.max(0, riskScore - 6);
      reasons.push('fact_preservation');
    }

    const openerFamily = openerFamilies[index];
    if (index > 0 && openerFamily === openerFamilies[index - 1] && openerFamily !== 'empty') {
      riskScore += 6;
      reasons.push('opener_repetition');
    }
    if ((openerCounts.get(openerFamily) ?? 0) >= 3 && openerFamily !== 'empty') {
      riskScore += 4;
      reasons.push('opener_density');
    }

    if (wordCount >= AI_SWEET_SPOT_MIN && wordCount <= AI_SWEET_SPOT_MAX) {
      riskScore += 4;
      reasons.push('ai_length_band');
    }
    if (profile === 'blog' && wordCount > 28 && !/[;:]/.test(sentence)) {
      riskScore += 4;
      reasons.push('flat_punctuation');
    }

    const clampedRisk = clamp(riskScore);

    return {
      index,
      text: sentence,
      styleClass,
      aiScore,
      riskScore: clampedRisk,
      riskLevel: getSentenceRiskLevel(clampedRisk),
      reasons: [...new Set(reasons)],
      wordCount,
      flaggedPhrases,
    };
  });

  const averageRisk = mean(scoredSentences.map(sentence => sentence.riskScore));
  const openerPenalty = openerDiversityScore < 55 ? (55 - openerDiversityScore) * 0.4 : 0;
  const flatnessPenalty = flatnessScore < 55 ? (55 - flatnessScore) * 0.7 : 0;
  const overallScore = clamp(Math.round(100 - averageRisk - openerPenalty - flatnessPenalty));

  return {
    profile,
    sentenceCount: scoredSentences.length,
    overallScore,
    flatnessScore,
    openerDiversityScore,
    averageSentenceLength: Math.round(averageSentenceLength * 10) / 10,
    sentenceLengthCv: Math.round(sentenceLengthCv * 100) / 100,
    highRiskCount: scoredSentences.filter(sentence => sentence.riskLevel === 'high').length,
    sentences: scoredSentences,
  };
}

export function analyzeSingleSentenceRisk(
  sentence: string,
  options: StyleStabilityOptions = {},
): SentenceStabilityScore {
  const report = analyzeStyleStability(sentence, options);
  if (report.sentences[0]) {
    return report.sentences[0];
  }

  return {
    index: 0,
    text: sentence,
    styleClass: 'narrative',
    aiScore: 0,
    riskScore: 0,
    riskLevel: 'low',
    reasons: [],
    wordCount: sentence.trim().split(/\s+/).filter(Boolean).length,
    flaggedPhrases: [],
  };
}

function normalizeTransition(sentence: string, profile: DocumentStyleProfile, seed: number): string {
  const match = sentence.match(TRANSITION_START_RE);
  if (!match) return sentence;
  const replacement = TRANSITION_VARIANTS[profile][seed % TRANSITION_VARIANTS[profile].length] ?? '';
  const remainder = sentence.slice(match[0].length).trimStart();
  if (!replacement) return capitalizeSentenceStart(remainder);
  return `${replacement}${decapitalizeSentenceStart(remainder)}`;
}

function normalizeConclusion(sentence: string, profile: DocumentStyleProfile, seed: number): string {
  const match = sentence.match(CONCLUSION_START_RE);
  if (!match) return sentence;
  const replacement = CONCLUSION_VARIANTS[profile][seed % CONCLUSION_VARIANTS[profile].length] ?? '';
  const remainder = sentence.slice(match[0].length).trimStart();
  if (!replacement) return capitalizeSentenceStart(remainder);
  return `${replacement}${decapitalizeSentenceStart(remainder)}`;
}

function softenAssertion(sentence: string, profile: DocumentStyleProfile, seed: number): string {
  let result = sentence;
  for (const replacement of ASSERTIVE_VERB_REPLACEMENTS) {
    const updated = replaceCaseAware(result, replacement.pattern, replacement.replacement);
    if (updated !== result) return updated;
    result = updated;
  }

  const prefix = HEDGE_PREFIXES[profile][seed % HEDGE_PREFIXES[profile].length] ?? '';
  if (!prefix) return sentence;
  return `${prefix}${decapitalizeSentenceStart(sentence)}`;
}

function varyPunctuation(sentence: string): string {
  if (sentence.includes(';')) return sentence;
  const variants: Array<[RegExp, string]> = [
    [/,\s+(particularly|especially|in particular)\b/i, '; $1'],
    [/,\s+(because|while|although)\b/i, '; $1'],
    [/,\s+but\b/i, '; but'],
  ];

  for (const [pattern, replacement] of variants) {
    pattern.lastIndex = 0;
    if (pattern.test(sentence)) {
      return sentence.replace(pattern, replacement);
    }
  }

  return sentence;
}

function normalizeSentence(
  sentence: string,
  profile: DocumentStyleProfile,
  report: StyleStabilityReport,
  item: SentenceStabilityScore,
  docSeed: number,
): string {
  let result = sentence;
  const seed = hashString(`${docSeed}:${item.index}:${item.text}`);

  for (const replacement of AIISH_REPLACEMENTS) {
    result = replaceCaseAware(result, replacement.pattern, replacement.replacement);
  }
  for (const downgrade of LEXICAL_DOWNGRADES) {
    result = replaceCaseAware(result, downgrade.pattern, downgrade.replacement);
  }

  if (item.reasons.includes('formal_transition')) {
    result = normalizeTransition(result, profile, seed);
  }
  if (item.reasons.includes('conclusion_opener')) {
    result = normalizeConclusion(result, profile, seed);
  }
  if (item.styleClass === 'analysis' && !HEDGE_RE.test(result) && (item.riskScore >= 18 || item.aiScore >= 42)) {
    result = softenAssertion(result, profile, seed);
  }
  if (report.flatnessScore < 52 && item.wordCount >= 22) {
    result = varyPunctuation(result);
  }

  result = normalizeSpacing(result);
  if (/^[a-z]/.test(result)) result = capitalizeSentenceStart(result);
  return result;
}

export function normalizeStyleStability(
  text: string,
  report: StyleStabilityReport,
): StyleStabilityNormalizationResult {
  const segments = segmentParagraphs(text);
  const docSeed = hashString(text);
  let sentencePointer = 0;
  let changedSentenceCount = 0;
  const touchedSentenceIndices: number[] = [];

  const rebuilt = segments.map((segment) => {
    if (segment.isHeading) return segment.text;

    const normalizedSentences = segment.sentences.map((sentence) => {
      const item = report.sentences[sentencePointer];
      sentencePointer++;
      if (!item || item.riskScore < 12) return sentence;

      const normalized = normalizeSentence(sentence, report.profile, report, item, docSeed);
      if (normalized !== sentence) {
        changedSentenceCount++;
        touchedSentenceIndices.push(item.index);
      }
      return normalized;
    });

    return normalizedSentences.join(' ');
  });

  return {
    text: rebuilt.join('\n\n').trim(),
    changedSentenceCount,
    touchedSentenceIndices,
  };
}