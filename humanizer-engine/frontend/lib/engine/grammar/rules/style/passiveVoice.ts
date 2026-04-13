import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';
import { FORM_TO_BASE } from '../../lexicon/irregularVerbs';

export const passiveVoiceRule: Rule = {
  id: 'passive_voice',
  description: 'Flags passive voice constructions for style improvement',

  apply(sentence: Sentence): Issue[] {
    const issues: Issue[] = [];
    if (!sentence.isPassive) return issues;

    const words = sentence.tokens.filter(t => t.kind === 'word');
    for (let i = 0; i < words.length - 1; i++) {
      const w = words[i].norm;
      if (
        (w === 'is' || w === 'are' || w === 'was' || w === 'were' || w === 'been' || w === 'be') &&
        (words[i + 1].norm.endsWith('ed') || FORM_TO_BASE.has(words[i + 1].norm))
      ) {
        issues.push({
          ruleId: 'passive_voice', message: 'Consider using active voice for clearer writing.',
          severity: 'style', start: words[i].start, end: words[i + 1].end,
          replacements: [], confidence: 0.5, category: 'Style', sentenceIndex: 0,
        });
        break;
      }
    }

    return issues;
  },
};
