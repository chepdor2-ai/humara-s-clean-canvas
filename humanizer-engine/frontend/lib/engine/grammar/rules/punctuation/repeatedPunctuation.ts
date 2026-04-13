import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';

export const repeatedPunctuationRule: Rule = {
  id: 'repeated_punctuation',
  description: 'Detects duplicate punctuation (excluding ellipsis)',

  apply(sentence: Sentence, fullText: string): Issue[] {
    const issues: Issue[] = [];
    const raw = fullText.slice(sentence.start, sentence.end);
    const base = sentence.start;
    const dupPunct = /([.!?,;:])\1+/g;
    let match: RegExpExecArray | null;

    while ((match = dupPunct.exec(raw)) !== null) {
      if (match[1] === '.' && match[0].length === 3) continue; // ellipsis
      issues.push({
        ruleId: 'dup_punct', message: `Duplicate punctuation: "${match[0]}"`,
        severity: 'warning', start: base + match.index, end: base + match.index + match[0].length,
        replacements: [match[1]], confidence: 0.95, category: 'Punctuation', sentenceIndex: 0,
      });
    }

    return issues;
  },
};
