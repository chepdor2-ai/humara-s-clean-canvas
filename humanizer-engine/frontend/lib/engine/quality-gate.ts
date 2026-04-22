import { robustSentenceSplit, protectSpecialContent, restoreSpecialContent } from './content-protection';
import { getDetector } from './multi-detector';
import { semanticSimilaritySync } from './semantic-guard';
import {
  applyAIWordKill,
  applyConnectorNaturalization,
  applyPhrasePatterns,
  diversifyStarters,
  expandAllContractions,
  fixPunctuation,
  getHumanizationVariationSeed,
} from './shared-dictionaries';
import { getWordChangePercent } from './sentence-surgery';

export type EngineQualityRole = 'light' | 'rewrite' | 'polish' | 'forensic' | 'router';

export interface EngineQualityProfile {
  id: string;
  role: EngineQualityRole;
  minSimilarity: number;
  minWordChange: number;
  maxWordChange: number;
  minLengthRatio: number;
  maxLengthRatio: number;
  maxSentenceRatioDrift: number;
  maxReadabilityDrift: number;
  allowSurgery: boolean;
  allowForensic: boolean;
}

export interface QualityGateOptions {
  engine?: string;
  strength?: string;
  postProfile?: string;
  inputAiScore?: number;
  outputAiScore?: number;
  targetScore?: number;
  profile?: EngineQualityProfile;
}

export interface QualityGateResult {
  safe: boolean;
  shouldStop: boolean;
  shouldContinue: boolean;
  overProcessed: boolean;
  reasons: string[];
  targetScore: number;
  detectorPressure: number;
  inputAiScore: number;
  outputAiScore: number;
  improvement: number;
  semanticSimilarity: number;
  wordChangeRatio: number;
  lengthRatio: number;
  sentenceRatio: number;
  readabilityDrift: number;
  factualRetention: number;
  profile: EngineQualityProfile;
}

export interface DeterministicSignalPolishOptions extends QualityGateOptions {
  sourceText?: string;
  preserveContractions?: boolean;
  allowSentenceSurgery?: boolean;
  intensity?: number;
}

const DEFAULT_PROFILE: EngineQualityProfile = {
  id: 'default',
  role: 'rewrite',
  minSimilarity: 0.82,
  minWordChange: 0.18,
  maxWordChange: 0.62,
  minLengthRatio: 0.72,
  maxLengthRatio: 1.38,
  maxSentenceRatioDrift: 0.45,
  maxReadabilityDrift: 32,
  allowSurgery: false,
  allowForensic: false,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function syllableCount(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!cleaned) return 0;
  const groups = cleaned.replace(/e$/i, '').match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

function fleschReadingEase(text: string): number {
  const sentences = Math.max(1, robustSentenceSplit(text).length);
  const words = text.match(/\b[A-Za-z]+\b/g) ?? [];
  if (words.length === 0) return 70;
  const syllables = words.reduce((sum, word) => sum + syllableCount(word), 0);
  return 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllables / words.length);
}

function extractCriticalTokens(text: string): string[] {
  const tokens = new Set<string>();
  const patterns = [
    /\b\d+(?:[.,]\d+)*(?:%| percent| percentage points?)?\b/gi,
    /\b(?:19|20)\d{2}\b/g,
    /\([A-Z][A-Za-z' -]+,\s*(?:19|20)\d{2}[a-z]?\)/g,
    /\[[0-9,\s-]+\]/g,
    /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi,
    /https?:\/\/\S+/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0]?.trim();
      if (value) tokens.add(value.toLowerCase());
    }
  }
  return [...tokens];
}

function criticalTokenRetention(original: string, candidate: string): number {
  const critical = extractCriticalTokens(original);
  if (critical.length === 0) return 1;
  const normalizedCandidate = candidate.toLowerCase();
  const kept = critical.filter((token) => normalizedCandidate.includes(token)).length;
  return kept / critical.length;
}

function detectorAverage(text: string): number {
  try {
    return getDetector().analyze(text).summary.overall_ai_score;
  } catch {
    return 50;
  }
}

export function resolveAdaptiveTarget(
  inputAiScore: number,
  strength = 'medium',
  postProfile = 'balanced',
): number {
  const score = clamp(inputAiScore, 0, 100);
  let target = score < 15 ? 22 : score < 30 ? 18 : score < 55 ? 13 : 8;

  if (strength === 'light') target += 4;
  if (strength === 'strong') target -= 2;
  if (postProfile === 'quality') target += 2;
  if (postProfile === 'undetectability') target -= 4;

  return Math.round(clamp(target, 5, 25));
}

export function resolveEngineQualityProfile(
  engine = 'default',
  strength = 'medium',
  postProfile = 'balanced',
): EngineQualityProfile {
  const id = engine.toLowerCase();
  const base: EngineQualityProfile = { ...DEFAULT_PROFILE, id };

  if (['easy', 'swift'].includes(id)) {
    Object.assign(base, {
      role: 'light',
      minSimilarity: 0.88,
      minWordChange: 0.10,
      maxWordChange: 0.45,
      minLengthRatio: 0.82,
      maxLengthRatio: 1.22,
      maxSentenceRatioDrift: 0.25,
      maxReadabilityDrift: 22,
      allowSurgery: false,
    });
  } else if (['nuru', 'nuru_v2', 'oxygen', 'oxygen3', 'oxygen_t5'].includes(id)) {
    Object.assign(base, {
      role: 'polish',
      minSimilarity: 0.84,
      minWordChange: 0.14,
      maxWordChange: 0.55,
      minLengthRatio: 0.78,
      maxLengthRatio: 1.30,
      maxSentenceRatioDrift: 0.32,
      maxReadabilityDrift: 26,
      allowSurgery: false,
    });
  } else if (['antipangram', 'phantom'].includes(id)) {
    Object.assign(base, {
      role: 'forensic',
      minSimilarity: 0.78,
      minWordChange: 0.22,
      maxWordChange: 0.70,
      minLengthRatio: 0.68,
      maxLengthRatio: 1.45,
      maxSentenceRatioDrift: 0.55,
      maxReadabilityDrift: 38,
      allowSurgery: false,
      allowForensic: true,
    });
  } else if (id === 'auto' || id === 'ai_analysis') {
    Object.assign(base, {
      role: 'router',
      minSimilarity: 0.86,
      minWordChange: 0.10,
      maxWordChange: 0.48,
      allowSurgery: false,
    });
  }

  if (strength === 'light') {
    base.maxWordChange = Math.min(base.maxWordChange, 0.48);
    base.minSimilarity = Math.max(base.minSimilarity, 0.86);
  }
  if (strength === 'strong' || postProfile === 'undetectability') {
    base.maxWordChange = Math.min(0.74, base.maxWordChange + 0.08);
    base.minSimilarity = Math.max(0.76, base.minSimilarity - 0.04);
    base.allowForensic = true;
  }
  if (postProfile === 'quality') {
    base.maxWordChange = Math.min(base.maxWordChange, 0.58);
    base.minSimilarity = Math.max(base.minSimilarity, 0.84);
  }

  return base;
}

export function assessQualityGate(
  original: string,
  candidate: string,
  options: QualityGateOptions = {},
): QualityGateResult {
  const profile = options.profile ?? resolveEngineQualityProfile(options.engine, options.strength, options.postProfile);
  const inputAiScore = options.inputAiScore ?? detectorAverage(original);
  const outputAiScore = options.outputAiScore ?? detectorAverage(candidate);
  const targetScore = options.targetScore ?? resolveAdaptiveTarget(inputAiScore, options.strength, options.postProfile);
  const originalWords = Math.max(1, wordCount(original));
  const candidateWords = Math.max(1, wordCount(candidate));
  const originalSentences = Math.max(1, robustSentenceSplit(original).length);
  const candidateSentences = Math.max(1, robustSentenceSplit(candidate).length);
  const semanticSimilarity = semanticSimilaritySync(original, candidate);
  const wordChangeRatio = getWordChangePercent(original, candidate) / 100;
  const lengthRatio = candidateWords / originalWords;
  const sentenceRatio = candidateSentences / originalSentences;
  const readabilityDrift = Math.abs(fleschReadingEase(original) - fleschReadingEase(candidate));
  const factualRetention = criticalTokenRetention(original, candidate);
  const improvement = inputAiScore - outputAiScore;
  const detectorPressure = clamp01((outputAiScore - targetScore) / 55);
  const reasons: string[] = [];

  if (semanticSimilarity < profile.minSimilarity) reasons.push('meaning_drift');
  if (candidateSentences !== originalSentences) reasons.push('sentence_count_changed');
  if (wordChangeRatio > profile.maxWordChange) reasons.push('word_change_over_cap');
  if (lengthRatio < profile.minLengthRatio || lengthRatio > profile.maxLengthRatio) reasons.push('length_drift');
  if (Math.abs(1 - sentenceRatio) > profile.maxSentenceRatioDrift) reasons.push('sentence_shape_drift');
  if (readabilityDrift > profile.maxReadabilityDrift) reasons.push('readability_drift');
  if (factualRetention < 0.98) reasons.push('fact_or_citation_loss');

  const overProcessed = reasons.some((reason) =>
    reason === 'word_change_over_cap' ||
    reason === 'length_drift' ||
    reason === 'sentence_shape_drift' ||
    reason === 'sentence_count_changed' ||
    reason === 'readability_drift' ||
    reason === 'meaning_drift'
  );
  const safe = reasons.length === 0;
  const alreadyLowRisk = inputAiScore <= targetScore + 3;
  const enoughImprovement = improvement >= Math.max(4, inputAiScore * 0.18);
  const nearTarget = outputAiScore <= targetScore + 2;
  const meaningfulChange = wordChangeRatio >= Math.max(0.04, Math.min(profile.minWordChange, 0.14));
  const shouldStop = safe && meaningfulChange && (alreadyLowRisk || nearTarget || enoughImprovement);
  const shouldContinue = safe && !shouldStop && (outputAiScore > targetScore || !meaningfulChange);

  if (!safe) reasons.push('quality_gate_block');
  if (safe && shouldStop) reasons.push('quality_target_met');

  return {
    safe,
    shouldStop,
    shouldContinue,
    overProcessed,
    reasons,
    targetScore,
    detectorPressure,
    inputAiScore,
    outputAiScore,
    improvement,
    semanticSimilarity,
    wordChangeRatio,
    lengthRatio,
    sentenceRatio,
    readabilityDrift,
    factualRetention,
    profile,
  };
}

function cleanupSpacing(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/([.,;:!?])([A-Za-z])/g, '$1 $2')
    .replace(/,\s*,/g, ',')
    .replace(/\.{2,}/g, '.')
    .trim();
}

function variationHash(value: string): number {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h) ^ value.charCodeAt(i);
  return h >>> 0;
}

function pickHumanVariant(options: string[], key: string): string {
  if (options.length === 0) return "";
  const seed = variationHash(`${getHumanizationVariationSeed()}:${key}`);
  return options[seed % options.length];
}

function applyHumanCadencePolish(text: string): string {
  const rules: Array<[RegExp, string[]]> = [
    [/\bwould be used\b/gi, ["is used", "can be used"]],
    [/\bto control order\b/gi, ["to maintain order", "to keep order"]],
    [/\battain their objectives\b/gi, ["meet their goals", "achieve their goals"]],
    [/\bcurrent social requirements\b/gi, ["present social needs", "current social needs"]],
    [/\bmoral rationale\b/gi, ["moral reasoning", "moral judgment"]],
    [/\bchanging standards of justice\b/gi, ["evolving standards of justice", "changing ideas of justice"]],
    [/\bpopular policy\b/gi, ["public policy"]],
    [/\bpolicy of the population\b/gi, ["public policy"]],
    [/\bthe policies of the people\b/gi, ["public policy"]],
    [/\bpublic schools\b/gi, ["public schools"]],
    [/\bstate schools\b/gi, ["public schools"]],
    [/\bparity of protection\b/gi, ["equal protection"]],
    [/\bthe correctional employees\b/gi, ["correctional staff"]],
    [/\bemployees and prisoners\b/gi, ["staff and prisoners"]],
    [/\bprisoners and employees\b/gi, ["prisoners and staff"]],
    [/\brigid powers\b/gi, ["strict authority"]],
    [/\bclaustrophobic atmosphere\b/gi, ["restrictive environment"]],
    [/\bhealthy prison environment\b/gi, ["positive prison climate", "sound prison environment"]],
    [/\bpositive prison environment\b/gi, ["positive prison climate", "supportive prison environment"]],
    [/\bmisbehavior\b/gi, ["misconduct"]],
    [/\bProverbs 31:89\b/g, ["Proverbs 31:8-9"]],
    [/\bProverbs 31:8–9\b/g, ["Proverbs 31:8-9"]],
    [/\bcannot speak in your voice\b/gi, ["cannot speak for themselves"]],
    [/\bas machine\b/gi, ["mechanically"]],
    [/\bto a certain degree solve\b/gi, ["address"]],
    [/\bon a final note\b/gi, ["In conclusion"]],
  ];

  let result = text;
  for (const [pattern, variants] of rules) {
    result = result.replace(pattern, (match) => {
      const replacement = pickHumanVariant(variants, `${pattern.source}:${match}`);
      if (match[0] === match[0].toUpperCase() && replacement[0] === replacement[0].toLowerCase()) {
        return replacement[0].toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }
  return result;
}

export function applyDeterministicSignalPolish(
  text: string,
  options: DeterministicSignalPolishOptions = {},
): string {
  if (!text.trim()) return text;

  const intensity = clamp01(options.intensity ?? 0.45);
  const { text: protectedText, map } = protectSpecialContent(text);
  let result = protectedText;

  result = applyAIWordKill(result);
  if (intensity >= 0.18) result = applyPhrasePatterns(result);
  if (intensity >= 0.35) result = applyConnectorNaturalization(result);
  result = diversifyStarters(result);
  result = applyHumanCadencePolish(result);
  if (options.preserveContractions === false) result = expandAllContractions(result);
  result = fixPunctuation(cleanupSpacing(result));

  result = cleanupSpacing(fixPunctuation(result));
  result = restoreSpecialContent(result, map);

  if (options.sourceText) {
    const gate = assessQualityGate(options.sourceText, result, options);
    if (!gate.safe && gate.overProcessed) return text;
  }

  return result;
}
