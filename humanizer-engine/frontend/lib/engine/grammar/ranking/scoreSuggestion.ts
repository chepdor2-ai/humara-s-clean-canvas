import type { Issue, Severity } from '../core/types';

/**
 * Compute a confidence score for an individual issue based on its source rule
 * and context quality.
 */
export function scoreSuggestion(issue: Issue): number {
  let score = 0.5; // baseline

  // High-confidence patterns
  const highConfidenceRules = new Set([
    'repeated-words', 'article-usage', 'capitalization',
    'spacing', 'repeated-punctuation', 'missing-sentence-end',
  ]);

  if (highConfidenceRules.has(issue.ruleId)) {
    score += 0.35;
  }

  // Grammar rules are medium-high
  const grammarRules = new Set([
    'subject-verb-agreement', 'verb-form-after-auxiliary',
    'confusion-pairs', 'double-negative',
  ]);
  if (grammarRules.has(issue.ruleId)) {
    score += 0.25;
  }

  // Style rules are lower confidence (more subjective)
  const styleRules = new Set(['passive-voice', 'sentence-structure']);
  if (styleRules.has(issue.ruleId)) {
    score -= 0.1;
  }

  // Boost if there's a concrete suggestion
  if (issue.replacements && issue.replacements.length > 0) {
    score += 0.1;
  }

  return Math.max(0, Math.min(1, score));
}
