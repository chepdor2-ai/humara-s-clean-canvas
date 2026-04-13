import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';
import { VOWELS, VOWEL_SOUND_EXCEPTIONS, CONSONANT_SOUND_EXCEPTIONS } from '../../lexicon';

export const articleUsageRule: Rule = {
  id: 'article_usage',
  description: 'Checks correct a/an usage based on vowel/consonant sounds',

  apply(sentence: Sentence): Issue[] {
    const issues: Issue[] = [];
    const words = sentence.tokens.filter(t => t.kind === 'word');

    for (let i = 0; i < words.length - 1; i++) {
      const art = words[i].norm;
      const next = words[i + 1].norm;
      if (art !== 'a' && art !== 'an') continue;

      const vowelSound = VOWELS.has(next[0]) || VOWEL_SOUND_EXCEPTIONS.has(next);
      const consonantSound = !vowelSound || CONSONANT_SOUND_EXCEPTIONS.has(next);

      // Abbreviation handling: "a FBI agent" → "an FBI agent"
      if (words[i + 1].kind === 'abbr' || /^[A-Z]{2,}/.test(words[i + 1].text)) {
        const firstLetter = words[i + 1].text[0].toLowerCase();
        const abbrVowelSound = 'aefhilmnorsx'.includes(firstLetter);
        if (art === 'a' && abbrVowelSound) {
          issues.push({
            ruleId: 'article_abbr', message: `Use "an" before abbreviation "${words[i + 1].text}".`,
            severity: 'error', start: words[i].start, end: words[i].end,
            replacements: ['an'], confidence: 0.92, category: 'Articles', sentenceIndex: 0,
          });
        } else if (art === 'an' && !abbrVowelSound) {
          issues.push({
            ruleId: 'article_abbr', message: `Use "a" before abbreviation "${words[i + 1].text}".`,
            severity: 'error', start: words[i].start, end: words[i].end,
            replacements: ['a'], confidence: 0.92, category: 'Articles', sentenceIndex: 0,
          });
        }
        continue;
      }

      if (art === 'a' && vowelSound && !CONSONANT_SOUND_EXCEPTIONS.has(next)) {
        issues.push({
          ruleId: 'article_a_an', message: `Use "an" before "${words[i + 1].text}" (vowel sound).`,
          severity: 'error', start: words[i].start, end: words[i].end,
          replacements: ['an'], confidence: 0.9, category: 'Articles', sentenceIndex: 0,
        });
      } else if (art === 'an' && consonantSound && !VOWEL_SOUND_EXCEPTIONS.has(next)) {
        issues.push({
          ruleId: 'article_a_an', message: `Use "a" before "${words[i + 1].text}" (consonant sound).`,
          severity: 'error', start: words[i].start, end: words[i].end,
          replacements: ['a'], confidence: 0.9, category: 'Articles', sentenceIndex: 0,
        });
      }
    }

    return issues;
  },
};
