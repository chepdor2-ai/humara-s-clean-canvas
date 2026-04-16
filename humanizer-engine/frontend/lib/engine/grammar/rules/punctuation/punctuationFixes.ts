import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';

/**
 * Punctuation fixes from Python backend: missing spaces, smart punct cleanup.
 * Covers punct-007, punct-008, and normalizer punctuation rules.
 */

interface PunctPattern {
  id: string;
  pattern: RegExp;
  replacement: string | ((m: RegExpExecArray) => string);
  message: string;
  severity: 'error' | 'warning' | 'style';
  confidence: number;
}

const PUNCT_FIXES: PunctPattern[] = [
  // punct-007: missing space after period before uppercase
  {
    id: 'punct-007',
    pattern: /([a-z])\.([A-Z])/g,
    replacement: (m) => `${m[1]}. ${m[2]}`,
    message: 'Missing space after period.',
    severity: 'warning',
    confidence: 0.92,
  },
  // punct-008: missing space after comma
  {
    id: 'punct-008',
    pattern: /,([A-Za-z])/g,
    replacement: (m) => `, ${m[1]}`,
    message: 'Missing space after comma.',
    severity: 'warning',
    confidence: 0.95,
  },
  // missing space after semicolon
  {
    id: 'punct-semi-space',
    pattern: /;([A-Za-z])/g,
    replacement: (m) => `; ${m[1]}`,
    message: 'Missing space after semicolon.',
    severity: 'warning',
    confidence: 0.95,
  },
  // missing space after colon (not time like 10:30 or URLs)
  {
    id: 'punct-colon-space',
    pattern: /([a-zA-Z]):([A-Za-z])/g,
    replacement: (m) => `${m[1]}: ${m[2]}`,
    message: 'Missing space after colon.',
    severity: 'warning',
    confidence: 0.85,
  },
  // space before comma
  {
    id: 'punct-space-comma',
    pattern: /(\w) ,/g,
    replacement: (m) => `${m[1]},`,
    message: 'Remove space before comma.',
    severity: 'warning',
    confidence: 0.95,
  },
  // space before period (not decimal or ellipsis)
  {
    id: 'punct-space-period',
    pattern: /(\w) \.(?!\.|[0-9])/g,
    replacement: (m) => `${m[1]}.`,
    message: 'Remove space before period.',
    severity: 'warning',
    confidence: 0.93,
  },
  // double comma
  {
    id: 'punct-double-comma',
    pattern: /,,+/g,
    replacement: ',',
    message: 'Remove duplicate comma.',
    severity: 'warning',
    confidence: 0.98,
  },
  // comma before period
  {
    id: 'punct-comma-period',
    pattern: /,\./g,
    replacement: '.',
    message: 'Remove comma before period.',
    severity: 'warning',
    confidence: 0.98,
  },
  // semicolon-comma
  {
    id: 'punct-semi-comma',
    pattern: /;,/g,
    replacement: ';',
    message: 'Remove comma after semicolon.',
    severity: 'warning',
    confidence: 0.98,
  },
];

export const punctuationFixesRule: Rule = {
  id: 'punctuation-fixes',
  description: 'Fixes missing spaces around punctuation and duplicate punctuation',
  apply(sentence: Sentence, _fullText: string): Issue[] {
    const issues: Issue[] = [];
    const text = sentence.text;

    for (const rule of PUNCT_FIXES) {
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        const start = sentence.start + match.index;
        const end = start + match[0].length;
        const rep = typeof rule.replacement === 'function' ? rule.replacement(match) : rule.replacement;

        issues.push({
          ruleId: rule.id,
          message: rule.message,
          severity: rule.severity,
          start,
          end,
          replacements: [rep],
          confidence: rule.confidence,
          category: 'Punctuation',
          sentenceIndex: 0,
        });
      }
    }

    return issues;
  },
};
