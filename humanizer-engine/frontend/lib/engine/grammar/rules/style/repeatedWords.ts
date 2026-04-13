import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';

export const repeatedWordsRule: Rule = {
  id: 'repeated_words',
  description: 'Detects duplicated consecutive words',

  apply(sentence: Sentence): Issue[] {
    const issues: Issue[] = [];
    const words = sentence.tokens.filter(t => t.kind === 'word');

    for (let i = 0; i < words.length - 1; i++) {
      if (words[i].norm === words[i + 1].norm) {
        // Exception: "that that" and "had had" can be valid
        if (words[i].norm === 'that' || words[i].norm === 'had') continue;
        issues.push({
          ruleId: 'repeated_word', message: `Repeated word: "${words[i].text}"`,
          severity: 'error', start: words[i].start, end: words[i + 1].end,
          replacements: [words[i].text], confidence: 0.95, category: 'Repetition', sentenceIndex: 0,
        });
      }
    }

    return issues;
  },
};
