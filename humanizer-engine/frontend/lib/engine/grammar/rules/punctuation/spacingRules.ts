import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';

export const spacingRule: Rule = {
  id: 'spacing',
  description: 'Checks extra spaces, space before punctuation, missing space after punctuation',

  apply(sentence: Sentence, fullText: string): Issue[] {
    const issues: Issue[] = [];
    const raw = fullText.slice(sentence.start, sentence.end);
    const base = sentence.start;
    let match: RegExpExecArray | null;

    // Extra spaces
    const multiSpace = /  +/g;
    while ((match = multiSpace.exec(raw)) !== null) {
      issues.push({
        ruleId: 'extra_spaces', message: 'Remove extra spaces.',
        severity: 'style', start: base + match.index, end: base + match.index + match[0].length,
        replacements: [' '], confidence: 0.99, category: 'Spacing', sentenceIndex: 0,
      });
    }

    // Space before punctuation
    const spaceBefore = / ([,;:!?.])/g;
    while ((match = spaceBefore.exec(raw)) !== null) {
      issues.push({
        ruleId: 'space_before_punct', message: 'Remove space before punctuation.',
        severity: 'style', start: base + match.index, end: base + match.index + match[0].length,
        replacements: [match[1]], confidence: 0.97, category: 'Spacing', sentenceIndex: 0,
      });
    }

    // Missing space after punctuation (not abbreviations)
    const noSpaceAfter = /([,;:!?])([A-Za-z])/g;
    while ((match = noSpaceAfter.exec(raw)) !== null) {
      issues.push({
        ruleId: 'missing_space_after_punct', message: `Add space after "${match[1]}".`,
        severity: 'error', start: base + match.index, end: base + match.index + match[0].length,
        replacements: [match[1] + ' ' + match[2]], confidence: 0.95, category: 'Spacing', sentenceIndex: 0,
      });
    }

    return issues;
  },
};
