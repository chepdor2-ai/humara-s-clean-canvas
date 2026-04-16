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
import { tenseRule } from './grammar/tenseConsistencyRule';

// Punctuation rules
import { spacingRule } from './punctuation/spacingRules';
import { repeatedPunctuationRule } from './punctuation/repeatedPunctuation';
import { missingSentenceEndRule } from './punctuation/missingSentenceEnd';
import { commaSpliceRule, missingIntroCommaRule } from './punctuation/commaSplice';
import { advancedPunctuationRule } from './punctuation/advancedPunctuation';

// Style rules
import { repeatedWordsRule } from './style/repeatedWords';
import { passiveVoiceRule } from './style/passiveVoice';
import { sentenceStructureRule } from './style/sentenceStructure';
import { wordyPhraseRule } from './style/wordyPhrases';

// Spelling rules
import { extendedSpellingRule } from './spelling/extendedSpelling';

// Usage rules
import { confusionPairsRule } from './usage/confusionYourYoure';

// Extended rules (ported from Python backend)
import { commonErrorsRule } from './grammar/commonErrors';
import { punctuationFixesRule } from './punctuation/punctuationFixes';

export type { Rule } from './baseRule';
export { createDomainRule, allDomainRules, type Domain } from './domain/domainRules';

/**
 * All available rules, ordered by priority.
 */
export const ALL_RULES: Rule[] = [
  // High-priority grammar
  repeatedWordsRule,
  articleUsageRule,
  capitalizationRule,
  extendedSpellingRule,
  spacingRule,
  repeatedPunctuationRule,
  missingSentenceEndRule,
  advancedPunctuationRule,
  subjectVerbAgreementRule,
  verbFormAfterAuxiliaryRule,
  tenseRule,
  confusionPairsRule,
  commaSpliceRule,
  missingIntroCommaRule,
  // Extended rules (ported)
  commonErrorsRule,
  punctuationFixesRule,
  // Structural
  sentenceStructureRule,
  passiveVoiceRule,
  wordyPhraseRule,
  doubleNegativeRule,
  pronounAgreementRule,
  missingWordsRule,
  wordOrderRule,
];

/**
 * Get rules filtered by category.
 */
export function getRulesByCategory(category: 'grammar' | 'punctuation' | 'style' | 'usage' | 'spelling'): Rule[] {
  const map: Record<string, Rule[]> = {
    grammar: [subjectVerbAgreementRule, articleUsageRule, verbFormAfterAuxiliaryRule,
              pronounAgreementRule, doubleNegativeRule, capitalizationRule, missingWordsRule, wordOrderRule, tenseRule],
    punctuation: [spacingRule, repeatedPunctuationRule, missingSentenceEndRule, commaSpliceRule, missingIntroCommaRule, advancedPunctuationRule],
    style: [repeatedWordsRule, passiveVoiceRule, sentenceStructureRule, wordyPhraseRule],
    spelling: [extendedSpellingRule, confusionPairsRule],
    usage: [confusionPairsRule],
  };
  return map[category] || [];
}
