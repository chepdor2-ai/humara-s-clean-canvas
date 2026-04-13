import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';

export const pronounAgreementRule: Rule = {
  id: 'pronoun_agreement',
  description: 'Checks pronoun case errors (me vs I, between you and I)',

  apply(sentence: Sentence): Issue[] {
    const issues: Issue[] = [];
    const raw = sentence.text;

    // "Me and him went" → "He and I went"
    if (/\bme and (him|her|them)\b/i.test(raw) || /\b(him|her|them) and me\b/i.test(raw)) {
      const match = raw.match(/\b(me and (?:him|her|them)|(?:him|her|them) and me)\b/i);
      if (match) {
        const idx = raw.indexOf(match[0]);
        issues.push({
          ruleId: 'pronoun_case', message: `"${match[0]}" in subject position should be "he/she/they and I".`,
          severity: 'warning', start: sentence.start + idx, end: sentence.start + idx + match[0].length,
          replacements: [], confidence: 0.75, category: 'Grammar', sentenceIndex: 0,
        });
      }
    }

    // "between you and I" → "between you and me"
    if (/\bbetween you and i\b/i.test(raw)) {
      const idx = raw.toLowerCase().indexOf('between you and i');
      issues.push({
        ruleId: 'pronoun_case', message: '"between you and I" should be "between you and me".',
        severity: 'error', start: sentence.start + idx, end: sentence.start + idx + 'between you and i'.length,
        replacements: ['between you and me'], confidence: 0.9, category: 'Grammar', sentenceIndex: 0,
      });
    }

    return issues;
  },
};
