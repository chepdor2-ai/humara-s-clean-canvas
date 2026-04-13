import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';
import { PREPOSITIONS } from '../../lexicon';

export const wordOrderRule: Rule = {
  id: 'word_order',
  description: 'Detects adjective-after-noun and other word order issues',

  apply(sentence: Sentence): Issue[] {
    const issues: Issue[] = [];
    const words = sentence.tokens.filter(t => t.kind === 'word');

    for (let i = 0; i < words.length - 2; i++) {
      // "car big" instead of "big car"
      if (words[i].pos === 'NOUN' && words[i + 1].pos === 'ADJ' &&
          !PREPOSITIONS.has(words[i].norm) && words[i + 1].norm !== 'enough') {
        // Exception: predicate adjective "the car is big"
        if (i > 0 && ['is', 'are', 'was', 'were'].includes(words[i - 1].norm)) continue;
        issues.push({
          ruleId: 'word_order', message: `Consider "${words[i + 1].text} ${words[i].text}" (adjective before noun).`,
          severity: 'style', start: words[i].start, end: words[i + 1].end,
          replacements: [words[i + 1].text + ' ' + words[i].text],
          confidence: 0.55, category: 'Word Order', sentenceIndex: 0,
        });
      }
    }

    return issues;
  },
};
