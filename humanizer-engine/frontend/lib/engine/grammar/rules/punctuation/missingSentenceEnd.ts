import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';

export const missingSentenceEndRule: Rule = {
  id: 'missing_sentence_end',
  description: 'Detects missing final punctuation at end of sentence',

  apply(sentence: Sentence): Issue[] {
    const issues: Issue[] = [];
    const trimmed = sentence.text.trim();
    if (trimmed.length > 3 && !/[.!?]$/.test(trimmed)) {
      issues.push({
        ruleId: 'missing_end_punct', message: 'Sentence missing final punctuation.',
        severity: 'warning', start: sentence.end - 1, end: sentence.end,
        replacements: [trimmed + '.'], confidence: 0.7, category: 'Punctuation', sentenceIndex: 0,
      });
    }
    return issues;
  },
};
