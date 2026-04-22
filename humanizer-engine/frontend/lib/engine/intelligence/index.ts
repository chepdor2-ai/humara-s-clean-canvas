/**
 * Intelligence Foundation — shared utilities used by every engine.
 *
 *   variation-rng      — per-call RNG guaranteeing different output each invocation
 *   split-merge-guard  — strict 1:1 sentence correspondence enforcement
 *   detector-signature — per-sentence signal profiling + attack plans
 *   purity-rules       — no-contractions / no-first-person / no-funny-phrases gate
 */

export {
  createVariationRNG,
  createSeededRNG,
  weightedPick,
  type VariationRNG,
} from "./variation-rng";

export {
  collapseToSingleSentence,
  guardSingleSentence,
  guardSentenceCount,
  mapSentencesGuarded,
  mapSentencesParallelGuarded,
  type GuardedResult,
} from "./split-merge-guard";

export {
  profileSentenceSignals,
  planAttack,
  scoreDocumentSignals,
  type SentenceSignalProfile,
  type AttackPlan,
  type AttackKind,
} from "./detector-signature";

export {
  detectInputShape,
  applyPurityRules,
  expandContractions,
  removeFirstPerson,
  removeFunnyPhrases,
  removeRhetoricalQuestions,
  violatesPurity,
  type InputShape,
} from "./purity-rules";
