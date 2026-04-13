/**
 * grammar-corrector.ts - Backward-compatible shim
 *
 * All logic now lives in the modular grammar/ directory.
 * This file re-exports the public API so existing imports continue to work.
 */

export {
  GrammarChecker,
  type Issue,
  type Severity,
  type CorrectionResult,
  type SentenceAnalysis,
  type ScoreBreakdown,
  type Token,
  type Sentence,
  type POS,
  type TokenKind,
  type AnalysisContext,
} from './grammar';
