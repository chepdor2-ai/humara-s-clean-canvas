import type { Rule } from './baseRule';

// Grammar rules
import { subjectVerbAgreementRule } from './grammar/subjectVerbAgreement';
import { articleUsageRule } from './grammar/articleUsage';
import { verbFormAfterAuxiliaryRule } from './grammar/verbFormAfterAuxiliary';
import { pronounAgreementRule } from './grammar/pronounAgreement';
import { doubleNegativeRule } from './grammar/doubleNegative';
import { capitalizationRule } from './grammar/capitalization';
import { missingWordsRule } from './grammar/missingWords';
import { wordOrderRule } from './grammar/wordOrder';

// Punctuation rules
import { spacingRule } from './punctuation/spacingRules';
import { repeatedPunctuationRule } from './punctuation/repeatedPunctuation';
import { missingSentenceEndRule } from './punctuation/missingSentenceEnd';
import { commaSpliceRule, missingIntroCommaRule } from './punctuation/commaSplice';

// Style rules
import { repeatedWordsRule } from './style/repeatedWords';
import { passiveVoiceRule } from './style/passiveVoice';
import { sentenceStructureRule } from './style/sentenceStructure';

// Usage rules
import { confusionPairsRule } from './usage/confusionYourYoure';

export type { Rule } from './baseRule';

/**
 * All available rules, ordered by priority.
 */
export const ALL_RULES: Rule[] = [
  // High-priority grammar
  repeatedWordsRule,
  articleUsageRule,
  capitalizationRule,
  spacingRule,
  repeatedPunctuationRule,
  missingSentenceEndRule,
  subjectVerbAgreementRule,
  verbFormAfterAuxiliaryRule,
  confusionPairsRule,
  commaSpliceRule,
  missingIntroCommaRule,
  // Structural
  sentenceStructureRule,
  passiveVoiceRule,
  doubleNegativeRule,
  pronounAgreementRule,
  missingWordsRule,
  wordOrderRule,
];

/**
 * Get rules filtered by category.
 */
export function getRulesByCategory(category: 'grammar' | 'punctuation' | 'style' | 'usage'): Rule[] {
  const map: Record<string, Rule[]> = {
    grammar: [subjectVerbAgreementRule, articleUsageRule, verbFormAfterAuxiliaryRule,
              pronounAgreementRule, doubleNegativeRule, capitalizationRule, missingWordsRule, wordOrderRule],
    punctuation: [spacingRule, repeatedPunctuationRule, missingSentenceEndRule, commaSpliceRule, missingIntroCommaRule],
    style: [repeatedWordsRule, passiveVoiceRule, sentenceStructureRule],
    usage: [confusionPairsRule],
  };
  return map[category] || [];
}
