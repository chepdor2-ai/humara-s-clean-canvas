import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';
import { MODALS } from '../../lexicon';
import { IRREGULAR_VERBS, FORM_TO_BASE } from '../../lexicon/irregularVerbs';

export const verbFormAfterAuxiliaryRule: Rule = {
  id: 'verb_form_after_auxiliary',
  description: 'Checks verb form after auxiliaries: have+pp, did+base, modal+base',

  apply(sentence: Sentence): Issue[] {
    const issues: Issue[] = [];
    const words = sentence.tokens.filter(t => t.kind === 'word');

    for (let i = 0; i < words.length - 1; i++) {
      const aux = words[i].norm;
      const verb = words[i + 1];
      if (verb.kind !== 'word') continue;
      const vn = verb.norm;

      // have/has/had + past (not past participle)
      if ((aux === 'have' || aux === 'has' || aux === 'had') && FORM_TO_BASE.has(vn)) {
        const base = FORM_TO_BASE.get(vn)!;
        const entry = IRREGULAR_VERBS[base];
        if (entry && vn === entry.past && vn !== entry.pp) {
          issues.push({
            ruleId: 'aux_verb', message: `After "${words[i].text}", use "${entry.pp}" (past participle).`,
            severity: 'error', start: verb.start, end: verb.end,
            replacements: [entry.pp], confidence: 0.92, category: 'Verb Form', sentenceIndex: 0,
          });
        }
      }

      // did + past → base
      if (aux === 'did' && FORM_TO_BASE.has(vn)) {
        const base = FORM_TO_BASE.get(vn)!;
        const entry = IRREGULAR_VERBS[base];
        if (entry && (vn === entry.past || vn === entry.pp) && vn !== base) {
          issues.push({
            ruleId: 'aux_verb', message: `After "did", use base form "${base}".`,
            severity: 'error', start: verb.start, end: verb.end,
            replacements: [base], confidence: 0.93, category: 'Verb Form', sentenceIndex: 0,
          });
        }
      }

      // modal + non-base
      if (MODALS.has(aux) && FORM_TO_BASE.has(vn)) {
        const base = FORM_TO_BASE.get(vn)!;
        const entry = IRREGULAR_VERBS[base];
        if (entry && (vn === entry.past || vn === entry.third) && vn !== base) {
          issues.push({
            ruleId: 'modal_verb', message: `After "${words[i].text}", use base form "${base}".`,
            severity: 'error', start: verb.start, end: verb.end,
            replacements: [base], confidence: 0.88, category: 'Verb Form', sentenceIndex: 0,
          });
        }
      }
    }

    return issues;
  },
};
