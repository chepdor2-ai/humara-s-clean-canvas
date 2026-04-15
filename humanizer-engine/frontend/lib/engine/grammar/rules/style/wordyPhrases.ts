import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';

/**
 * Detects wordy/redundant phrases and suggests concise alternatives.
 */

const WORDY_PHRASES: Array<{ pattern: RegExp; replacement: string; message: string }> = [
  { pattern: /\b(in order to)\b/gi, replacement: 'to', message: '"In order to" → "to"' },
  { pattern: /\b(due to the fact that)\b/gi, replacement: 'because', message: '"Due to the fact that" → "because"' },
  { pattern: /\b(in the event that)\b/gi, replacement: 'if', message: '"In the event that" → "if"' },
  { pattern: /\b(at this point in time)\b/gi, replacement: 'now', message: '"At this point in time" → "now"' },
  { pattern: /\b(at the present time)\b/gi, replacement: 'now', message: '"At the present time" → "now"' },
  { pattern: /\b(for the purpose of)\b/gi, replacement: 'to', message: '"For the purpose of" → "to"' },
  { pattern: /\b(in spite of the fact that)\b/gi, replacement: 'although', message: '"In spite of the fact that" → "although"' },
  { pattern: /\b(has the ability to)\b/gi, replacement: 'can', message: '"Has the ability to" → "can"' },
  { pattern: /\b(is able to)\b/gi, replacement: 'can', message: '"Is able to" → "can"' },
  { pattern: /\b(a large number of)\b/gi, replacement: 'many', message: '"A large number of" → "many"' },
  { pattern: /\b(the vast majority of)\b/gi, replacement: 'most', message: '"The vast majority of" → "most"' },
  { pattern: /\b(on a daily basis)\b/gi, replacement: 'daily', message: '"On a daily basis" → "daily"' },
  { pattern: /\b(on a regular basis)\b/gi, replacement: 'regularly', message: '"On a regular basis" → "regularly"' },
  { pattern: /\b(with regard to)\b/gi, replacement: 'about', message: '"With regard to" → "about"' },
  { pattern: /\b(with respect to)\b/gi, replacement: 'about', message: '"With respect to" → "about"' },
  { pattern: /\b(in regard to)\b/gi, replacement: 'about', message: '"In regard to" → "about"' },
  { pattern: /\b(make a decision)\b/gi, replacement: 'decide', message: '"Make a decision" → "decide"' },
  { pattern: /\b(come to a conclusion)\b/gi, replacement: 'conclude', message: '"Come to a conclusion" → "conclude"' },
  { pattern: /\b(take into consideration)\b/gi, replacement: 'consider', message: '"Take into consideration" → "consider"' },
  { pattern: /\b(give consideration to)\b/gi, replacement: 'consider', message: '"Give consideration to" → "consider"' },
  { pattern: /\b(it is important to note that)\b/gi, replacement: 'notably,', message: 'Wordy: simplify "it is important to note that"' },
  { pattern: /\b(it should be noted that)\b/gi, replacement: 'notably,', message: 'Wordy: simplify "it should be noted that"' },
  { pattern: /\b(each and every)\b/gi, replacement: 'every', message: '"Each and every" → "every"' },
  { pattern: /\b(first and foremost)\b/gi, replacement: 'first', message: '"First and foremost" → "first"' },
  { pattern: /\b(basic fundamentals)\b/gi, replacement: 'fundamentals', message: '"Basic fundamentals" is redundant' },
  { pattern: /\b(end result)\b/gi, replacement: 'result', message: '"End result" is redundant' },
  { pattern: /\b(past history)\b/gi, replacement: 'history', message: '"Past history" is redundant' },
  { pattern: /\b(free gift)\b/gi, replacement: 'gift', message: '"Free gift" is redundant' },
  { pattern: /\b(advance planning)\b/gi, replacement: 'planning', message: '"Advance planning" is redundant' },
  { pattern: /\b(added bonus)\b/gi, replacement: 'bonus', message: '"Added bonus" is redundant' },
];

export const wordyPhraseRule: Rule = {
  id: 'wordy_phrases',
  description: 'Detects wordy/redundant phrases and suggests concise alternatives',

  apply(sentence: Sentence, fullText: string): Issue[] {
    const issues: Issue[] = [];
    const raw = fullText.slice(sentence.start, sentence.end);
    const base = sentence.start;

    for (const { pattern, replacement, message } of WORDY_PHRASES) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(raw)) !== null) {
        issues.push({
          ruleId: 'wordy_phrase',
          message,
          severity: 'style',
          start: base + match.index,
          end: base + match.index + match[0].length,
          replacements: [replacement],
          confidence: 0.80,
          category: 'Clarity',
          sentenceIndex: 0,
        });
      }
    }

    return issues;
  },
};
