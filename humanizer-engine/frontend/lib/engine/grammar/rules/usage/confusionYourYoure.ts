import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';
import { CONFUSION_PAIRS } from '../../lexicon/confusionSets';

export const confusionPairsRule: Rule = {
  id: 'confusion_pairs',
  description: 'Detects commonly confused words and misspellings',

  apply(sentence: Sentence): Issue[] {
    const issues: Issue[] = [];

    for (let i = 0; i < sentence.tokens.length; i++) {
      const token = sentence.tokens[i];
      if (token.kind !== 'word') continue;
      const entry = CONFUSION_PAIRS[token.norm];
      if (!entry) continue;

      if (entry.context === 'always') {
        issues.push({
          ruleId: 'confusion', message: entry.message,
          severity: 'error', start: token.start, end: token.end,
          replacements: [entry.correct], confidence: 0.95, category: 'Spelling', sentenceIndex: 0,
        });
        continue;
      }

      // Context-dependent
      const nextToken = sentence.tokens.slice(i + 1).find(t => t.kind === 'word');
      if (!nextToken) continue;

      if (entry.context === 'before_verb' &&
          (nextToken.pos === 'VERB' || nextToken.pos === 'AUX' || nextToken.norm === 'going' || nextToken.norm === 'not')) {
        issues.push({
          ruleId: 'confusion_ctx', message: entry.message,
          severity: 'warning', start: token.start, end: token.end,
          replacements: [entry.correct], confidence: 0.75, category: 'Confusion', sentenceIndex: 0,
        });
      }
      if (entry.context === 'before_noun' &&
          (nextToken.pos === 'NOUN' || nextToken.pos === 'ADJ' || nextToken.pos === 'DET')) {
        issues.push({
          ruleId: 'confusion_ctx', message: entry.message,
          severity: 'warning', start: token.start, end: token.end,
          replacements: [entry.correct], confidence: 0.75, category: 'Confusion', sentenceIndex: 0,
        });
      }
    }

    return issues;
  },
};
