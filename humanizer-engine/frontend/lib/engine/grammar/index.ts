/**
 * Grammar Engine — Modular Architecture
 *
 * Usage:
 *   import { GrammarChecker } from '@/lib/engine/grammar';
 *   const checker = new GrammarChecker();
 *   const result = checker.check("Your text here.");
 */

// Core
export { GrammarChecker } from './core/engine';
export type {
  Token, Sentence, Issue, SentenceAnalysis,
  ScoreBreakdown, CorrectionResult, AnalysisContext,
  POS, TokenKind, Severity,
} from './core/types';
export { DEFAULT_CONFIG, type EngineConfig } from './core/config';

// Rules
export { ALL_RULES, getRulesByCategory, type Rule, createDomainRule, allDomainRules, type Domain } from './rules';

// Output
export { applyFixes, applySingleFix, formatIssues, type FormattedIssue } from './output';

// Ranking
export { rankIssues, scoreSuggestion } from './ranking';
