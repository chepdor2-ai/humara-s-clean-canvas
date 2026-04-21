/**
 * Candidate Generator — Multi-candidate sentence humanization
 * =============================================================
 * Generates N candidate rewrites for each sentence, scores them,
 * picks the best, and returns the rest as pre-generated alternatives.
 *
 * Used by ALL engines (premium + free) so sentence alternatives
 * are ready instantly when the user clicks a sentence — no extra
 * API call needed.
 */

import { humanizeSentence } from './humanize-transforms';
import { scoreSentenceDeep } from './engine/ai-signal-dictionary';
import {
  analyzeSingleSentenceRisk,
  analyzeStyleStability,
  inferDocumentStyleProfile,
  normalizeStyleStability,
  type DocumentStyleProfile,
  type SentenceStabilityScore,
} from './engine/style-stability';

const FIRST_PERSON_RE = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/i;
const TRANSITION_START_RE = /^(?:Furthermore|Moreover|Additionally|In addition|Importantly|Notably|Specifically|Consequently|As a result|Therefore|Thus),?\s+/i;

const DETECTOR_TRIMS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bit is important to note that\s+/gi, replacement: '' },
  { pattern: /\bowing to the fact that\b/gi, replacement: 'because' },
  { pattern: /\bsignificantly contributes? to\b/gi, replacement: 'helps' },
  { pattern: /\bsignificantly contributes?\b/gi, replacement: 'helps' },
  { pattern: /\bplays? a crucial role in\b/gi, replacement: 'matters in' },
  { pattern: /\bplays? a (?:key|vital|significant|pivotal) role in\b/gi, replacement: 'matters in' },
  { pattern: /\bin today'?s (?:world|landscape|society|era)\b/gi, replacement: 'today' },
  { pattern: /\bdelves? into\b/gi, replacement: 'looks at' },
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
];

const HEDGE_PREFIXES: Record<DocumentStyleProfile, string> = {
  academic: 'It appears that ',
  blog: 'In many cases, ',
  wiki: 'It appears that ',
  general: 'It appears that ',
};

export interface ScoredCandidate {
  text: string;
  score: number;
}

export interface SentenceWithAlternatives {
  /** The picked best sentence */
  text: string;
  /** Remaining candidates sorted by score (best first), excluding the picked one */
  alternatives: ScoredCandidate[];
}

function measureChangeRatio(original: string, candidate: string): number {
  const origWords = original.toLowerCase().split(/\s+/).filter(Boolean);
  const candWords = candidate.toLowerCase().split(/\s+/).filter(Boolean);
  const maxLen = Math.max(origWords.length, candWords.length);
  if (maxLen === 0) return 0;

  let diffs = 0;
  for (let index = 0; index < maxLen; index++) {
    if (!origWords[index] || !candWords[index] || origWords[index] !== candWords[index]) {
      diffs++;
    }
  }

  return diffs / maxLen;
}

function matchCase(match: string, replacement: string): string {
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

function normalizeSpacing(text: string): string {
  return text
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])(?!\s|$)/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function decapitalizeSentenceStart(text: string): string {
  return text.replace(/^("|'|\(|\[|\s)*([A-Z])([a-z])/, (_match, prefix = '', first: string, rest: string) => `${prefix}${first.toLowerCase()}${rest}`);
}

function preserveAnchorTokens(original: string, candidate: string): boolean {
  const anchors = original.match(/\([A-Za-z][^)]*\d{4}\)|\[[0-9,\s]+\]|\b\d+(?:\.\d+)?%?\b|\$\d+/g) ?? [];
  if (anchors.length === 0) return true;

  return anchors.every((anchor) => candidate.includes(anchor));
}

function trimDetectorMagnets(sentence: string): string {
  let result = sentence.replace(TRANSITION_START_RE, '');
  for (const rule of DETECTOR_TRIMS) {
    result = replaceCaseAware(result, rule.pattern, rule.replacement);
  }
  return normalizeSpacing(result);
}

function softenAssertion(sentence: string, profile: DocumentStyleProfile): string {
  let result = sentence;
  for (const replacement of ASSERTIVE_VERB_REPLACEMENTS) {
    const updated = replaceCaseAware(result, replacement.pattern, replacement.replacement);
    if (updated !== result) {
      return normalizeSpacing(updated);
    }
    result = updated;
  }

  if (/\b(?:may|might|appears? to|suggests?|likely|perhaps)\b/i.test(result)) {
    return normalizeSpacing(result);
  }

  return normalizeSpacing(`${HEDGE_PREFIXES[profile]}${decapitalizeSentenceStart(result)}`);
}

function varyRhythm(sentence: string): string {
  let result = sentence;
  const rhythmPatterns: Array<[RegExp, string]> = [
    [/,\s+(particularly|especially|in particular)\b/i, '; $1'],
    [/,\s+(because|while|although)\b/i, '; $1'],
    [/,\s+but\b/i, '; but'],
  ];

  for (const [pattern, replacement] of rhythmPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(result)) {
      result = result.replace(pattern, replacement);
      break;
    }
  }

  return normalizeSpacing(result);
}

function stabilizeCandidate(candidate: string, original: string): string {
  const report = analyzeStyleStability(candidate, { sourceText: original });
  return normalizeStyleStability(candidate, report).text || candidate;
}

function buildTargetedDrafts(
  originalSentence: string,
  inputHadFirstPerson: boolean,
  sourceRisk: SentenceStabilityScore,
  count: number,
): string[] {
  const profile = inferDocumentStyleProfile(originalSentence, { sourceText: originalSentence });
  const drafts: string[] = [];

  const pushDraft = (candidate: string) => {
    const cleaned = normalizeSpacing(candidate);
    if (cleaned) drafts.push(cleaned);
  };

  const minimalDraft = stabilizeCandidate(trimDetectorMagnets(originalSentence), originalSentence);
  pushDraft(minimalDraft);

  const baseline = humanizeSentence(originalSentence, inputHadFirstPerson);
  pushDraft(stabilizeCandidate(baseline, originalSentence));

  if (sourceRisk.reasons.includes('formal_transition') || sourceRisk.reasons.includes('detector_magnet')) {
    pushDraft(stabilizeCandidate(trimDetectorMagnets(baseline), originalSentence));
  }

  if (sourceRisk.styleClass === 'analysis' || sourceRisk.styleClass === 'argument' || sourceRisk.styleClass === 'reflection') {
    pushDraft(stabilizeCandidate(softenAssertion(baseline, profile), originalSentence));
  }

  if (sourceRisk.riskLevel === 'high') {
    const stronger = humanizeSentence(baseline, inputHadFirstPerson);
    pushDraft(stabilizeCandidate(varyRhythm(trimDetectorMagnets(stronger)), originalSentence));
  } else if (sourceRisk.riskLevel === 'medium') {
    pushDraft(stabilizeCandidate(varyRhythm(trimDetectorMagnets(baseline)), originalSentence));
  }

  if (sourceRisk.styleClass === 'fact' || sourceRisk.styleClass === 'citation') {
    pushDraft(stabilizeCandidate(trimDetectorMagnets(originalSentence), originalSentence));
  }

  while (drafts.length < Math.max(3, count + 1)) {
    const sampled = humanizeSentence(originalSentence, inputHadFirstPerson);
    const targeted = sourceRisk.riskLevel === 'high'
      ? varyRhythm(trimDetectorMagnets(sampled))
      : trimDetectorMagnets(sampled);
    pushDraft(stabilizeCandidate(targeted, originalSentence));
  }

  return drafts;
}

/**
 * Score a candidate sentence for quality.
 * Higher = better. Considers:
 *   - Length similarity to original
 *   - Ends with proper punctuation
 *   - Not identical to original (some change happened)
 *   - No broken patterns (double prepositions, garbled text)
 */
function scoreCandidate(original: string, candidate: string, sourceRisk: SentenceStabilityScore): number {
  const trimmed = candidate.trim();
  if (!trimmed) return -100;

  let score = 50;

  // Different from original = good
  if (trimmed.toLowerCase() !== original.trim().toLowerCase()) score += 10;

  // Ends with punctuation
  if (/[.!?]$/.test(trimmed)) score += 5;

  // Length ratio penalty
  const origWords = original.trim().split(/\s+/).length;
  const candWords = trimmed.split(/\s+/).length;
  const ratio = candWords / Math.max(origWords, 1);
  if (ratio < 0.5 || ratio > 2.0) score -= 30;
  else if (ratio < 0.7 || ratio > 1.5) score -= 10;

  // Broken patterns penalty
  if (/\b(\w+)\s+\1\b/i.test(trimmed)) score -= 20; // repeated word
  if (/\b(of|to|in|for|on|at|by|with|from) \1\b/gi.test(trimmed)) score -= 25; // double preposition
  if (/,,|;;|\.\./g.test(trimmed)) score -= 15; // double punctuation

  // Uniqueness bonus — longer candidates that have structural changes
  const origStart = original.trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase();
  const candStart = trimmed.split(/\s+/).slice(0, 3).join(' ').toLowerCase();
  if (candStart !== origStart) score += 5; // different opening

  const detectorReport = scoreSentenceDeep(trimmed);
  score -= detectorReport.scorePct * 0.7;

  const candidateRisk = analyzeSingleSentenceRisk(trimmed, { sourceText: original });
  if (candidateRisk.reasons.includes('formal_transition')) score -= 8;
  if (candidateRisk.reasons.includes('detector_magnet')) score -= 10;
  if (candidateRisk.reasons.includes('polished_lexicon')) score -= 6;

  const changeRatio = measureChangeRatio(original, trimmed);
  if (sourceRisk.riskLevel === 'low') {
    if (changeRatio > 0.38) score -= 18;
    if (changeRatio >= 0.12 && changeRatio <= 0.32) score += 8;
  } else if (sourceRisk.riskLevel === 'medium') {
    if (changeRatio < 0.18) score -= 10;
    if (changeRatio >= 0.22 && changeRatio <= 0.55) score += 6;
  } else {
    if (changeRatio < 0.25) score -= 18;
    if (changeRatio >= 0.28 && changeRatio <= 0.68) score += 8;
  }

  if ((sourceRisk.styleClass === 'analysis' || sourceRisk.styleClass === 'argument' || sourceRisk.styleClass === 'reflection')
    && /\b(?:may|might|appears? to|suggests?|likely|perhaps)\b/i.test(trimmed)) {
    score += 6;
  }

  if ((sourceRisk.styleClass === 'fact' || sourceRisk.styleClass === 'citation') && !preserveAnchorTokens(original, trimmed)) {
    score -= 28;
  }

  if (sourceRisk.reasons.includes('formal_transition') && !TRANSITION_START_RE.test(trimmed)) {
    score += 6;
  }

  if (candidateRisk.riskLevel === 'low') score += 6;
  else if (candidateRisk.riskLevel === 'medium') score += 2;
  else score -= 8;

  return score;
}

/**
 * Deduplicate candidates — keep only unique text, merge scores.
 */
function deduplicateCandidates(candidates: ScoredCandidate[]): ScoredCandidate[] {
  const seen = new Map<string, ScoredCandidate>();
  for (const c of candidates) {
    const key = c.text.trim().toLowerCase();
    const existing = seen.get(key);
    if (!existing || c.score > existing.score) {
      seen.set(key, c);
    }
  }
  return Array.from(seen.values());
}

/**
 * Generate N candidate rewrites for a single sentence.
 * Returns the best pick + remaining alternatives.
 *
 * @param originalSentence - The sentence to humanize
 * @param inputHadFirstPerson - Whether the full input text had first-person
 * @param count - Total candidates to generate (default 5)
 */
export function generateCandidates(
  originalSentence: string,
  inputHadFirstPerson: boolean,
  count = 3,
): SentenceWithAlternatives {
  const trimmed = originalSentence.trim();
  // Skip very short sentences — just return as-is
  if (!trimmed || trimmed.length < 15) {
    return { text: trimmed, alternatives: [] };
  }

  const sourceRisk = analyzeSingleSentenceRisk(trimmed, { sourceText: trimmed });

  // Generate targeted draft families and then score them by detector heat,
  // preservation, and the amount of change that sentence risk actually needs.
  const raw: ScoredCandidate[] = [];
  const draftPool = buildTargetedDrafts(trimmed, inputHadFirstPerson, sourceRisk, count);
  for (const candidate of draftPool) {
    raw.push({
      text: candidate,
      score: scoreCandidate(trimmed, candidate, sourceRisk),
    });
  }

  // Deduplicate
  let candidates = deduplicateCandidates(raw);

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // If we lost all to dedup, generate ONE more (no loop)
  if (candidates.length < 2) {
    const extra = stabilizeCandidate(humanizeSentence(trimmed, inputHadFirstPerson), trimmed);
    const scored = { text: extra, score: scoreCandidate(trimmed, extra, sourceRisk) };
    candidates.push(scored);
    candidates = deduplicateCandidates(candidates);
    candidates.sort((a, b) => b.score - a.score);
  }

  const limitedCandidates = candidates.slice(0, Math.max(1, count));

  // Pick the best
  const best = limitedCandidates[0];
  const alternatives = limitedCandidates.slice(1);

  return {
    text: best.text,
    alternatives,
  };
}

/**
 * Process a full text by splitting into sentences, generating candidates
 * for each, and returning the assembled best output + per-sentence alternatives.
 *
 * This is the main export used by engines that don't have their own
 * sentence-level processing.
 */
export function generateCandidatesForText(
  text: string,
  count = 5,
): { humanized: string; sentenceAlternatives: Record<number, ScoredCandidate[]> } {
  const inputHadFirstPerson = FIRST_PERSON_RE.test(text);

  // Split into sentences
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const results: string[] = [];
  const sentenceAlternatives: Record<number, ScoredCandidate[]> = {};

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    if (!sentence) continue;

    const { text: best, alternatives } = generateCandidates(sentence, inputHadFirstPerson, Math.min(count, 3));
    results.push(best);
    if (alternatives.length > 0) {
      sentenceAlternatives[i] = alternatives;
    }
  }

  return {
    humanized: results.join(' '),
    sentenceAlternatives,
  };
}
