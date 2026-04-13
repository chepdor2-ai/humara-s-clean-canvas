import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';

export const doubleNegativeRule: Rule = {
  id: 'double_negative',
  description: 'Detects double negatives that may reverse meaning',

  apply(sentence: Sentence): Issue[] {
    const issues: Issue[] = [];
    const words = sentence.tokens.filter(t => t.kind === 'word');
    const negatives = new Set([
      'not', "n't", 'no', 'never', 'nobody', 'nothing', 'nowhere',
      'neither', 'nor', 'hardly', 'scarcely', 'barely',
    ]);

    let negCount = 0;
    for (const w of words) {
      if (negatives.has(w.norm) || w.norm.endsWith("n't")) negCount++;
    }

    if (negCount >= 2) {
      issues.push({
        ruleId: 'double_negative', message: 'Double negative detected. This may reverse meaning unintentionally.',
        severity: 'warning', start: sentence.start, end: sentence.end,
        replacements: [], confidence: 0.7, category: 'Grammar', sentenceIndex: 0,
      });
    }

    return issues;
  },
};
