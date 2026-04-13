import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';
import { SINGULAR_PRONOUNS, PLURAL_PRONOUNS, FIRST_PERSON_SINGULAR, UNCOUNTABLE_NOUNS } from '../../lexicon';

export const subjectVerbAgreementRule: Rule = {
  id: 'subject_verb_agreement',
  description: 'Checks pronoun-verb and noun-verb agreement',

  apply(sentence: Sentence): Issue[] {
    const issues: Issue[] = [];
    const words = sentence.tokens.filter(t => t.kind === 'word');

    // Direct pronoun + verb adjacency checks
    for (let i = 0; i < words.length - 1; i++) {
      const subj = words[i].norm;
      const verb = words[i + 1].norm;

      if (SINGULAR_PRONOUNS.has(subj)) {
        if (verb === 'have' && subj !== 'i') {
          issues.push({
            ruleId: 'sv_agree', message: `"${words[i].text} ${words[i + 1].text}" → "${words[i].text} has"`,
            severity: 'error', start: words[i + 1].start, end: words[i + 1].end,
            replacements: ['has'], confidence: 0.95, category: 'Agreement', sentenceIndex: 0,
          });
        }
        if (verb === 'are') {
          issues.push({
            ruleId: 'sv_agree', message: `"${words[i].text} ${words[i + 1].text}" → "${words[i].text} is"`,
            severity: 'error', start: words[i + 1].start, end: words[i + 1].end,
            replacements: ['is'], confidence: 0.95, category: 'Agreement', sentenceIndex: 0,
          });
        }
        if (verb === "don't") {
          issues.push({
            ruleId: 'sv_agree', message: `"${words[i].text} don't" → "${words[i].text} doesn't"`,
            severity: 'error', start: words[i + 1].start, end: words[i + 1].end,
            replacements: ["doesn't"], confidence: 0.9, category: 'Agreement', sentenceIndex: 0,
          });
        }
      }

      if (PLURAL_PRONOUNS.has(subj) || FIRST_PERSON_SINGULAR.has(subj)) {
        if (verb === 'has' && !SINGULAR_PRONOUNS.has(subj)) {
          issues.push({
            ruleId: 'sv_agree', message: `"${words[i].text} ${words[i + 1].text}" → "${words[i].text} have"`,
            severity: 'error', start: words[i + 1].start, end: words[i + 1].end,
            replacements: ['have'], confidence: 0.95, category: 'Agreement', sentenceIndex: 0,
          });
        }
        if (verb === 'is' && !SINGULAR_PRONOUNS.has(subj)) {
          const fix = FIRST_PERSON_SINGULAR.has(subj) ? 'am' : 'are';
          issues.push({
            ruleId: 'sv_agree', message: `"${words[i].text} ${words[i + 1].text}" → "${words[i].text} ${fix}"`,
            severity: 'error', start: words[i + 1].start, end: words[i + 1].end,
            replacements: [fix], confidence: 0.95, category: 'Agreement', sentenceIndex: 0,
          });
        }
        if (verb === "doesn't" && !SINGULAR_PRONOUNS.has(subj)) {
          issues.push({
            ruleId: 'sv_agree', message: `"${words[i].text} doesn't" → "${words[i].text} don't"`,
            severity: 'error', start: words[i + 1].start, end: words[i + 1].end,
            replacements: ["don't"], confidence: 0.9, category: 'Agreement', sentenceIndex: 0,
          });
        }
      }
    }

    // Deep: head noun through prepositions
    if (sentence.subject && sentence.mainVerb) {
      const subjNorm = sentence.subject.norm;
      const verbNorm = sentence.mainVerb.norm;
      const subjIsPlural = subjNorm.endsWith('s') && !UNCOUNTABLE_NOUNS.has(subjNorm) && !SINGULAR_PRONOUNS.has(subjNorm);

      if (subjIsPlural && verbNorm === 'is') {
        issues.push({
          ruleId: 'sv_agree_deep', message: `Subject "${sentence.subject.text}" is plural but verb is singular. Use "are".`,
          severity: 'error', start: sentence.mainVerb.start, end: sentence.mainVerb.end,
          replacements: ['are'], confidence: 0.88, category: 'Agreement', sentenceIndex: 0,
        });
      }
      if (subjIsPlural && verbNorm === 'was') {
        issues.push({
          ruleId: 'sv_agree_deep', message: `Subject "${sentence.subject.text}" is plural but verb is singular. Use "were".`,
          severity: 'error', start: sentence.mainVerb.start, end: sentence.mainVerb.end,
          replacements: ['were'], confidence: 0.85, category: 'Agreement', sentenceIndex: 0,
        });
      }
      if (subjIsPlural && verbNorm === 'has') {
        issues.push({
          ruleId: 'sv_agree_deep', message: `Subject "${sentence.subject.text}" is plural. Use "have".`,
          severity: 'error', start: sentence.mainVerb.start, end: sentence.mainVerb.end,
          replacements: ['have'], confidence: 0.85, category: 'Agreement', sentenceIndex: 0,
        });
      }
    }

    return issues;
  },
};
