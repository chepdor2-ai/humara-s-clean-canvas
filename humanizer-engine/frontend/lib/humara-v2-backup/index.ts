/**
 * Humara — Independent Humanizer Engine
 * ======================================
 * Production-ready, detector-beating humanization.
 * 
 * Key principles:
 * - No contractions in output
 * - No first person unless present in input  
 * - No crazy cliché phrases
 * - Phrase-level replacements over word-level
 * - Natural sentence-length variation (burstiness)
 * - Strategy diversity (not every sentence heavily transformed)
 * - Strict sentence count preservation
 */

export { humaraHumanize, type HumaraOptions } from './core/Humanizer';
export { splitSentences, countSentences } from './core/SentenceLock';
export { parseSentence, detectRegister } from './core/Parser';
export { planStrategies, type Strategy, type StrategyDecision } from './core/StrategyEngine';
export {
  replacePhrases,
  scrubAIWords,
  replaceTransitions,
  restructure,
  addEmphasis,
  removeCrazyPhrases,
} from './core/Transformer';
export { enforceConstraints, expandContractions } from './core/ConstraintEngine';
export { measureBurstiness, applyCoherenceFixes } from './core/Coherence';
export {
  protectContent,
  restoreContent,
  extractTopicKeywords,
  protectTopicKeywords,
} from './core/ContentProtection';
