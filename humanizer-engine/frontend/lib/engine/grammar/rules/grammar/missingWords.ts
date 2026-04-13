import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';

export const missingWordsRule: Rule = {
  id: 'missing_words',
  description: 'Detects common missing word patterns like "going [to]"',

  apply(sentence: Sentence): Issue[] {
    const issues: Issue[] = [];
    const words = sentence.tokens.filter(t => t.kind === 'word');

    for (let i = 0; i < words.length - 1; i++) {
      // "going" without "to" before destination
      if (words[i].norm === 'going' && i + 1 < words.length) {
        const next = words[i + 1];
        if (next.pos === 'DET' || next.pos === 'NOUN' || next.pos === 'ADJ') {
          if (i > 0 && ['am', 'is', 'are', 'was', 'were'].includes(words[i - 1].norm)) {
            const actualNext = sentence.tokens[sentence.tokens.indexOf(words[i]) + 1];
            if (actualNext && actualNext.norm !== 'to') {
              issues.push({
                ruleId: 'missing_to', message: 'Missing "to" after "going".',
                severity: 'error', start: words[i].end, end: words[i].end,
                replacements: [' to'], confidence: 0.85, category: 'Grammar', sentenceIndex: 0,
              });
            }
          }
        }
      }
    }

    return issues;
  },
};
