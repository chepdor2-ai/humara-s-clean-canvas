import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';
import { ABBREVIATIONS } from '../../lexicon';

export const capitalizationRule: Rule = {
  id: 'capitalization',
  description: 'Checks sentence-start caps, pronoun "I", names after titles, ALL CAPS',

  apply(sentence: Sentence): Issue[] {
    const issues: Issue[] = [];
    const words = sentence.tokens.filter(t => t.kind === 'word' || t.kind === 'abbr');
    if (words.length === 0) return issues;

    // First word must be capitalized
    const first = words[0];
    if (first.text[0] !== first.text[0].toUpperCase()) {
      issues.push({
        ruleId: 'cap_sentence_start', message: 'Sentence should start with a capital letter.',
        severity: 'error', start: first.start, end: first.end,
        replacements: [first.text[0].toUpperCase() + first.text.slice(1)],
        confidence: 0.98, category: 'Capitalization', sentenceIndex: 0,
      });
    }

    // "I" always capitalized
    for (const t of words) {
      if (t.norm === 'i' && t.text === 'i') {
        issues.push({
          ruleId: 'cap_i', message: 'The pronoun "I" should always be capitalized.',
          severity: 'error', start: t.start, end: t.end,
          replacements: ['I'], confidence: 0.99, category: 'Capitalization', sentenceIndex: 0,
        });
      }
    }

    // Proper nouns after "Mr./Dr./Mrs." should be capitalized
    for (let i = 0; i < words.length - 1; i++) {
      const norm = words[i].norm.replace(/\./g, '');
      if (ABBREVIATIONS.has(norm) && ['mr', 'mrs', 'ms', 'dr', 'prof'].includes(norm)) {
        const next = words[i + 1];
        if (next.text[0] !== next.text[0].toUpperCase()) {
          issues.push({
            ruleId: 'cap_after_title', message: `Name after "${words[i].text}" should be capitalized.`,
            severity: 'error', start: next.start, end: next.end,
            replacements: [next.text[0].toUpperCase() + next.text.slice(1)],
            confidence: 0.95, category: 'Capitalization', sentenceIndex: 0,
          });
        }
      }
    }

    // ALL CAPS detection (shouting)
    for (let i = 1; i < words.length; i++) {
      const t = words[i];
      if (t.text.length > 3 && t.text === t.text.toUpperCase() && /^[A-Z]+$/.test(t.text) && t.kind === 'word') {
        const lower = t.text[0] + t.text.slice(1).toLowerCase();
        issues.push({
          ruleId: 'cap_shouting', message: `Avoid all-caps: "${t.text}" → "${lower}"`,
          severity: 'style', start: t.start, end: t.end,
          replacements: [lower], confidence: 0.7, category: 'Capitalization', sentenceIndex: 0,
        });
      }
    }

    return issues;
  },
};
