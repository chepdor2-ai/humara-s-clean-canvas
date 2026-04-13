import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';

export const sentenceStructureRule: Rule = {
  id: 'sentence_structure',
  description: 'Detects sentence fragments and run-on sentences',

  apply(sentence: Sentence): Issue[] {
    const issues: Issue[] = [];
    const words = sentence.tokens.filter(t => t.kind === 'word');

    // Fragment detection
    if (words.length >= 3 && words.length <= 15) {
      const hasVerb = words.some(t => t.pos === 'VERB' || t.pos === 'AUX');
      if (!hasVerb) {
        issues.push({
          ruleId: 'fragment', message: 'This may be a sentence fragment (no verb detected).',
          severity: 'warning', start: sentence.start, end: sentence.end,
          replacements: [], confidence: 0.65, category: 'Sentence Structure', sentenceIndex: 0,
        });
      }
    }

    // Run-on detection
    const wordCount = words.length;
    const commaCount = sentence.tokens.filter(t => t.text === ',').length;
    const conjCount = sentence.tokens.filter(t => t.pos === 'CONJ').length;

    if (wordCount > 40 && commaCount < 2 && conjCount < 2) {
      issues.push({
        ruleId: 'run_on', message: 'This sentence is very long. Consider splitting it.',
        severity: 'style', start: sentence.start, end: sentence.end,
        replacements: [], confidence: 0.6, category: 'Sentence Structure', sentenceIndex: 0,
      });
    }
    if (wordCount > 50) {
      issues.push({
        ruleId: 'run_on', message: 'Very long sentence (50+ words). Break into shorter sentences for clarity.',
        severity: 'warning', start: sentence.start, end: sentence.end,
        replacements: [], confidence: 0.75, category: 'Sentence Structure', sentenceIndex: 0,
      });
    }

    return issues;
  },
};
