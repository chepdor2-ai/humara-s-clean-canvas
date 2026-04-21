/**
 * Paper Strategy Selector (Stage 3)
 * ==================================
 * Takes a PaperProfile and decides HOW to humanize it:
 *   • Which phases run and how many iterations
 *   • Per-section intensity multipliers
 *   • Per-paragraph intensity multipliers
 *   • Nuru / AntiPangram / DetectorPolish overrides
 *
 * Hard rules (user-mandated):
 *   • Minimum 10 iterations for every engine
 *   • Undetectability profile → Nuru ≥ 10
 *   • Quality profile         → AntiPangram ≥ 10
 *   • All engines go through post-processing ≥ 10 iterations
 *   • Adaptive math adds on top of the minimums based on profile
 *   • Sentence-by-sentence processing is mandatory
 */

import type {
  PaperProfile,
  ParagraphMetrics,
  SectionKind,
  Register,
  LengthBucket,
} from "./paper-profiler";
import type { Domain } from "./domain-detector";

// ── Types ─────────────────────────────────────────────────────────────

export type PostProcessingProfile = "balanced" | "quality" | "undetectability";
export type HumanizationStrength = "light" | "medium" | "strong";

export interface SectionStrategy {
  kind: SectionKind;
  /** 0–1 intensity multiplier for this section. */
  intensity: number;
  /** If true, preserve the lead sentence of the section (anchor for readers). */
  preserveLead: boolean;
  /** If true, passive → active transformations allowed. */
  allowPassiveToActive: boolean;
  /** If true, starter injection allowed. */
  allowStarterInjection: boolean;
  /** If true, sentence splitting allowed. */
  allowSentenceSplit: boolean;
  /** If true, rule-of-three decomposition allowed. */
  allowRuleOfThreeBreak: boolean;
  /** Target burstiness CV for this section. */
  targetBurstinessCV: number;
}

export interface HumanizationPlan {
  // ── Overall knobs (engine-agnostic) ──
  postProcessingProfile: PostProcessingProfile;
  overallStrength: HumanizationStrength;
  detectorPressure: number;        // 0–1
  readabilityBias: number;         // 0–1, higher = gentler
  humanVariance: number;           // 0–1
  preserveLeadSentences: boolean;
  targetScore: number;             // 0–100 — hard detector-score target

  // ── Iteration counts (hard minimums enforced) ──
  /** Nuru iterations — ≥ 10 always, ≥ 10 enforced for undetectability. */
  nuruIterations: number;
  /** AntiPangram iterations — ≥ 10 always, ≥ 10 enforced for quality. */
  antiPangramIterations: number;
  /** Outer adaptive cycles (Nuru → AntiPangram). */
  maxAdaptiveCycles: number;
  /** Universal cleaning passes — ≥ 10 post-processing mandate. */
  universalCleaningPasses: number;
  /** Detector-polish iterations. */
  polishIterations: number;
  /** Sentence-flow polish iterations. */
  flowPolishIterations: number;

  // ── AntiPangram extras ──
  antiPangramVariance: number;
  leadRewriteThreshold: number;

  // ── Nuru extras ──
  nuruLoops: number;
  targetedSweeps: number;

  // ── Per-section strategies ──
  sectionStrategies: SectionStrategy[];
  /** Per-paragraph intensity multiplier, derived from composite AI score. */
  perParagraphIntensity: number[];

  // ── Protection / domain ──
  protectedTerms: Set<string>;
  conservativeDomain: boolean;     // medical / legal — careful transforms
  aggressiveDomain: boolean;       // humanities / blog — lots of voice

  // ── Diagnostic ──
  reasoning: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function clampInt(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(x)));
}

/**
 * Length multiplier — shorter papers tolerate more aggressive rewriting,
 * longer papers need conservative per-segment targeting to avoid drift.
 */
function lengthMultiplier(bucket: LengthBucket): number {
  switch (bucket) {
    case "short": return 1.15;
    case "medium": return 1.0;
    case "long": return 0.90;
    case "very-long": return 0.82;
  }
}

function isConservativeDomain(domain: Domain): boolean {
  return domain === "medical" || domain === "legal";
}

function isAggressiveDomain(domain: Domain): boolean {
  return domain === "humanities" || domain === "creative";
}

// ── Per-section base strategy ─────────────────────────────────────────

function baseSectionStrategy(kind: SectionKind, domain: Domain, register: Register): SectionStrategy {
  // Defaults (body section, generic paper)
  let intensity = 0.75;
  let preserveLead = true;
  let allowPassiveToActive = true;
  let allowStarterInjection = true;
  let allowSentenceSplit = true;
  let allowRuleOfThreeBreak = true;
  let targetBurstinessCV = 0.45;

  switch (kind) {
    case "title":
      intensity = 0.0; // Never modify titles
      preserveLead = true;
      allowPassiveToActive = false;
      allowStarterInjection = false;
      allowSentenceSplit = false;
      allowRuleOfThreeBreak = false;
      break;

    case "abstract":
      // Abstracts are precision-heavy — conservative intensity, aggressive
      // on burstiness & AI-vocab removal, but don't restructure meaning.
      intensity = 0.62;
      preserveLead = true;
      allowPassiveToActive = domain !== "medical" && domain !== "legal";
      allowStarterInjection = false; // keep abstract crisp
      allowSentenceSplit = true;
      allowRuleOfThreeBreak = true;
      targetBurstinessCV = 0.48;
      break;

    case "introduction":
      intensity = 0.80;
      preserveLead = true;
      allowStarterInjection = true;
      targetBurstinessCV = 0.50;
      break;

    case "background":
      intensity = 0.78;
      targetBurstinessCV = 0.48;
      break;

    case "methods":
      // Methods prefer passive voice & technical precision. Very conservative.
      intensity = 0.45;
      preserveLead = true;
      allowPassiveToActive = false; // passive is standard here
      allowStarterInjection = false;
      allowSentenceSplit = false;
      allowRuleOfThreeBreak = true;
      targetBurstinessCV = 0.35;
      break;

    case "results":
      // Results sections are numeric & factual — light touch only.
      intensity = 0.48;
      preserveLead = true;
      allowPassiveToActive = false;
      allowStarterInjection = false;
      allowSentenceSplit = true;
      allowRuleOfThreeBreak = false;
      targetBurstinessCV = 0.35;
      break;

    case "discussion":
      // Discussion can absorb more voice.
      intensity = 0.85;
      preserveLead = true;
      allowPassiveToActive = true;
      allowStarterInjection = true;
      targetBurstinessCV = 0.55;
      break;

    case "conclusion":
      intensity = 0.80;
      preserveLead = true;
      allowStarterInjection = true;
      targetBurstinessCV = 0.50;
      break;

    case "references":
      // Never touch references.
      intensity = 0.0;
      preserveLead = true;
      allowPassiveToActive = false;
      allowStarterInjection = false;
      allowSentenceSplit = false;
      allowRuleOfThreeBreak = false;
      targetBurstinessCV = 0.0;
      break;

    case "body":
    default:
      intensity = 0.72;
      preserveLead = true;
      targetBurstinessCV = 0.45;
      break;
  }

  // Register nudges
  if (register === "blog" || register === "narrative") {
    intensity = Math.min(0.95, intensity + 0.10);
    targetBurstinessCV = Math.max(targetBurstinessCV, 0.55);
  } else if (register === "journal") {
    intensity = Math.max(0.40, intensity - 0.05);
    allowStarterInjection = false;
  }

  // Domain nudges
  if (isConservativeDomain(domain)) {
    intensity = Math.max(0.30, intensity - 0.15);
    allowPassiveToActive = false;
    allowSentenceSplit = kind === "discussion" || kind === "body";
  } else if (isAggressiveDomain(domain)) {
    intensity = Math.min(1.0, intensity + 0.08);
  }

  return {
    kind,
    intensity: clamp01(intensity),
    preserveLead,
    allowPassiveToActive,
    allowStarterInjection,
    allowSentenceSplit,
    allowRuleOfThreeBreak,
    targetBurstinessCV,
  };
}

// ── Per-paragraph intensity derivation ────────────────────────────────

function deriveParagraphIntensity(
  m: ParagraphMetrics,
  sectionStrategy: SectionStrategy,
  overallTarget: number,
): number {
  // Higher composite AI score → stronger intensity.
  // Map composite AI score (0–100) onto [0.6, 1.15] of section intensity.
  const aboveTarget = Math.max(0, m.compositeAiScore - overallTarget);
  const pressure = clamp01(aboveTarget / 60);
  const base = sectionStrategy.intensity;
  const boosted = base * (0.85 + pressure * 0.35);
  return clamp01(boosted);
}

// ── Protected terms derivation ────────────────────────────────────────

function buildProtectedTerms(profile: PaperProfile): Set<string> {
  const terms = new Set<string>();
  // Always include named entities
  profile.context.namedEntities.forEach((e) => terms.add(e));
  // Include multi-word domain bigrams
  profile.context.domainBigrams.forEach((b) => terms.add(b));
  // High-frequency long words from the input (≥3 occurrences)
  profile.context.protectedTerms.forEach((t) => terms.add(t));
  return terms;
}

// ── Main entry point ──────────────────────────────────────────────────

export function deriveHumanizationPlan(
  profile: PaperProfile,
  postProfile: PostProcessingProfile = "balanced",
  requestedStrength: HumanizationStrength | string = "strong",
): HumanizationPlan {
  const reasoning: string[] = [];
  const domain = profile.domain.primary;
  const register = profile.register;
  const conservative = isConservativeDomain(domain);
  const aggressive = isAggressiveDomain(domain);

  // ── Target detector score (profile-driven) ──
  let targetScore = 5;
  if (conservative) targetScore = 8;          // medical / legal: don't over-edit
  if (postProfile === "undetectability") targetScore = Math.min(targetScore, 4);
  if (postProfile === "quality") targetScore = Math.max(targetScore, 5);
  reasoning.push(`targetScore=${targetScore} (domain=${domain}, profile=${postProfile})`);

  // ── Detector pressure from composite AI score ──
  const composite = profile.overallCompositeAi;
  const detectorPressure = clamp01((Math.max(composite, targetScore) - targetScore) / 70);
  reasoning.push(`detectorPressure=${detectorPressure.toFixed(2)} (composite=${composite})`);

  // ── Readability bias ──
  let readabilityBias = 0.70;
  if (register === "blog" || register === "narrative") readabilityBias = 0.90;
  else if (register === "journal") readabilityBias = 0.72;
  else if (register === "academic-essay") readabilityBias = 0.76;
  if (conservative) readabilityBias = Math.max(readabilityBias, 0.80);
  reasoning.push(`readabilityBias=${readabilityBias.toFixed(2)} (register=${register})`);

  // ── Overall strength resolution ──
  let overallStrength: HumanizationStrength;
  if (conservative) {
    overallStrength = composite > 60 ? "medium" : "light";
  } else if (aggressive) {
    overallStrength = "strong";
  } else {
    overallStrength = requestedStrength === "light" ? "medium" : "strong";
  }
  reasoning.push(`overallStrength=${overallStrength}`);

  // ── Human variance ──
  const humanVariance = clamp01(
    0.04 + detectorPressure * 0.10 +
    (register === "blog" || register === "narrative" ? 0.06 : 0) -
    (conservative ? 0.03 : 0),
  );

  // ── Lead sentence preservation ──
  // For journals/reports we preserve; for blog/narrative we let the lead flow.
  const preserveLeadSentences = register !== "blog" && register !== "narrative";

  // ── Iteration counts with mandated minimums ──
  // Base: 10 minimum for all engines in all profiles.
  const MIN_ITER = 10;
  const lenMult = lengthMultiplier(profile.lengthBucket);

  // Nuru iterations — adaptive base on top of 10.
  let nuruIterationsRaw = MIN_ITER + detectorPressure * 8 + composite * 0.05;
  if (postProfile === "undetectability") {
    // Hard mandate: Nuru ≥ 10 in undetectability + adaptive boost.
    nuruIterationsRaw = MIN_ITER + 4 + detectorPressure * 10;
  }
  nuruIterationsRaw *= lenMult;
  const nuruIterations = clampInt(nuruIterationsRaw, MIN_ITER, 24);
  reasoning.push(`nuruIter=${nuruIterations} (min=${MIN_ITER}, pressure+length applied)`);

  // AntiPangram iterations — adaptive on top of 10.
  let antiPangramRaw = MIN_ITER + detectorPressure * 8 + composite * 0.04;
  if (postProfile === "quality") {
    antiPangramRaw = MIN_ITER + 4 + detectorPressure * 10;
  }
  antiPangramRaw *= lenMult;
  const antiPangramIterations = clampInt(antiPangramRaw, MIN_ITER, 24);
  reasoning.push(`antiPangramIter=${antiPangramIterations} (min=${MIN_ITER})`);

  // Universal cleaning passes — post-processing mandate ≥ 10.
  let universalRaw = MIN_ITER + detectorPressure * 4 + (composite > 30 ? 2 : 0);
  universalRaw *= lenMult;
  const universalCleaningPasses = clampInt(universalRaw, MIN_ITER, 18);
  reasoning.push(`universalPasses=${universalCleaningPasses}`);

  // Detector-polish iterations — 4 base + adaptive.
  const polishIterations = clampInt(4 + detectorPressure * 4, 4, 10);

  // Flow-polish iterations — 2 base + adaptive on length.
  const flowPolishIterations = clampInt(2 + (profile.lengthBucket === "long" || profile.lengthBucket === "very-long" ? 2 : 1), 2, 6);

  // Outer adaptive cycles
  const maxAdaptiveCycles = clampInt(2 + detectorPressure * 3 + (profile.lengthBucket !== "short" ? 1 : 0), 2, 6);

  // Nuru loops & targeted sweeps
  const nuruLoops = clampInt(4 + detectorPressure * 5 + (postProfile !== "quality" ? 1 : 0), 4, 12);
  const targetedSweeps = clampInt(3 + detectorPressure * 4 + (domain === "stem" || domain === "technical" ? 1 : 0), 3, 10);

  // AntiPangram variance
  const antiPangramVariance = clamp01(
    0.04 + detectorPressure * 0.10 + (register === "blog" ? 0.03 : 0),
  );

  // Lead rewrite threshold
  const leadRewriteThreshold = 24 + detectorPressure * 18;

  // ── Section strategies ──
  const seenSections = new Set<SectionKind>();
  const sectionStrategies: SectionStrategy[] = [];
  for (const s of profile.sections) {
    if (seenSections.has(s.kind)) continue;
    seenSections.add(s.kind);
    sectionStrategies.push(baseSectionStrategy(s.kind, domain, register));
  }
  // Ensure "body" always exists as fallback
  if (!seenSections.has("body")) {
    sectionStrategies.push(baseSectionStrategy("body", domain, register));
  }

  // ── Per-paragraph intensity ──
  const strategyByKind = new Map<SectionKind, SectionStrategy>();
  for (const s of sectionStrategies) strategyByKind.set(s.kind, s);
  const fallback = strategyByKind.get("body") ?? baseSectionStrategy("body", domain, register);

  const perParagraphIntensity: number[] = profile.paragraphMetrics.map((m) => {
    const strategy = strategyByKind.get(m.sectionKind) ?? fallback;
    return deriveParagraphIntensity(m, strategy, targetScore);
  });

  // ── Protected terms ──
  const protectedTerms = buildProtectedTerms(profile);

  return {
    postProcessingProfile: postProfile,
    overallStrength,
    detectorPressure,
    readabilityBias,
    humanVariance,
    preserveLeadSentences,
    targetScore,

    nuruIterations,
    antiPangramIterations,
    maxAdaptiveCycles,
    universalCleaningPasses,
    polishIterations,
    flowPolishIterations,

    antiPangramVariance,
    leadRewriteThreshold,

    nuruLoops,
    targetedSweeps,

    sectionStrategies,
    perParagraphIntensity,

    protectedTerms,
    conservativeDomain: conservative,
    aggressiveDomain: aggressive,

    reasoning,
  };
}

// ── Utility: brief plan summary ───────────────────────────────────────

export function summarizePlan(plan: HumanizationPlan): string {
  return [
    `profile=${plan.postProcessingProfile}`,
    `strength=${plan.overallStrength}`,
    `nuru=${plan.nuruIterations}`,
    `antiPangram=${plan.antiPangramIterations}`,
    `universal=${plan.universalCleaningPasses}`,
    `polish=${plan.polishIterations}`,
    `flow=${plan.flowPolishIterations}`,
    `target=${plan.targetScore}%`,
    `pressure=${plan.detectorPressure.toFixed(2)}`,
  ].join(" | ");
}
