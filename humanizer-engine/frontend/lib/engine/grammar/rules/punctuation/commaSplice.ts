import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';

export const commaSpliceRule: Rule = {
  id: 'comma_splice',
  description: 'Detects comma splices (two independent clauses joined by comma)',

  apply(sentence: Sentence, fullText: string): Issue[] {
    const issues: Issue[] = [];
    const raw = fullText.slice(sentence.start, sentence.end);
    const base = sentence.start;
    const pattern = /([a-z]+),\s+(he|she|it|they|we|i|you)\s+(is|are|was|were|has|have|had|will|would|can|could|shall|should|may|might|must|do|does|did)\b/gi;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(raw)) !== null) {
      issues.push({
        ruleId: 'comma_splice', message: 'Possible comma splice. Use a period, semicolon, or conjunction.',
        severity: 'warning',
        start: base + match.index + match[1].length,
        end: base + match.index + match[1].length + 1,
        replacements: ['.', ';', ', and'], confidence: 0.7, category: 'Sentence Structure', sentenceIndex: 0,
      });
    }

    return issues;
  },
};

export const missingIntroCommaRule: Rule = {
  id: 'missing_intro_comma',
  description: 'Detects missing comma after introductory words',

  apply(sentence: Sentence, fullText: string): Issue[] {
    const issues: Issue[] = [];
    const raw = fullText.slice(sentence.start, sentence.end);
    const base = sentence.start;

    const introWords = [
      'however', 'moreover', 'furthermore', 'therefore', 'consequently',
      'nevertheless', 'additionally', 'meanwhile', 'unfortunately', 'fortunately',
      'surprisingly', 'interestingly', 'obviously', 'clearly', 'apparently',
    ];

    for (const w of introWords) {
      const pattern = new RegExp(`^${w}\\s+[a-z]`, 'i');
      if (pattern.test(raw)) {
        const end = w.length;
        if (raw[end] !== ',') {
          issues.push({
            ruleId: 'missing_intro_comma', message: `Add comma after introductory word "${w}".`,
            severity: 'warning', start: base + end, end: base + end,
            replacements: [','], confidence: 0.85, category: 'Punctuation', sentenceIndex: 0,
          });
        }
      }
    }

    return issues;
  },
};
