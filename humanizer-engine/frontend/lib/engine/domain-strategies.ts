/**
 * Domain Strategies — Non-LLM Engine Tuning Parameters
 * =====================================================
 * Provides per-domain knobs for the pure TypeScript engines (Oxygen, Nuru/Stealth)
 * so they adapt their rewriting behaviour to the subject matter WITHOUT any LLM call.
 *
 * Each strategy controls:
 *   - synonymIntensity     (0–1)  How aggressively to replace words via dictionaries
 *   - structuralRate       (0–1)  Probability of clause fronting / reordering / voice swap
 *   - starterInjectionRate (0–1)  Probability of injecting a sentence opener
 *   - phraseReplacementCap (0–1)  Fraction of eligible phrases to replace
 *   - minChangeTarget      (0–1)  Minimum word-level change ratio to aim for
 *   - sentenceSplitRate    (0–1)  Probability of splitting long sentences
 *   - sentenceMergeRate    (0–1)  Probability of merging short adjacent sentences
 *   - preservePrecision    boolean  When true, prefer shorter/more-precise synonyms
 *   - domainStarters       string[] Additional domain-appropriate sentence starters
 */

import type { DomainResult } from './domain-detector';

export interface DomainStrategy {
  synonymIntensity: number;
  structuralRate: number;
  starterInjectionRate: number;
  phraseReplacementCap: number;
  minChangeTarget: number;
  sentenceSplitRate: number;
  sentenceMergeRate: number;
  preservePrecision: boolean;
  domainStarters: string[];
}

const STRATEGIES: Record<string, DomainStrategy> = {
  academic: {
    synonymIntensity: 0.60,
    structuralRate: 0.25,
    starterInjectionRate: 0.05,
    phraseReplacementCap: 0.70,
    minChangeTarget: 0.50,
    sentenceSplitRate: 0.20,
    sentenceMergeRate: 0.25,
    preservePrecision: false,
    domainStarters: [
      'Notably,', 'In broad terms,', 'From a practical standpoint,',
      'On balance,', 'In reality,', 'Against this backdrop,',
    ],
  },
  stem: {
    synonymIntensity: 0.40,       // lower — formulas & variables must stay
    structuralRate: 0.15,          // less restructuring for precision
    starterInjectionRate: 0.03,
    phraseReplacementCap: 0.50,
    minChangeTarget: 0.40,
    sentenceSplitRate: 0.15,
    sentenceMergeRate: 0.10,
    preservePrecision: true,
    domainStarters: [
      'Experimentally,', 'From a computational perspective,',
      'In mathematical terms,', 'Empirically,', 'At a fundamental level,',
    ],
  },
  medical: {
    synonymIntensity: 0.40,       // clinical precision matters
    structuralRate: 0.15,
    starterInjectionRate: 0.03,
    phraseReplacementCap: 0.50,
    minChangeTarget: 0.40,
    sentenceSplitRate: 0.15,
    sentenceMergeRate: 0.10,
    preservePrecision: true,
    domainStarters: [
      'Clinically,', 'From a diagnostic standpoint,', 'In clinical practice,',
      'Therapeutically,', 'In terms of patient outcomes,',
    ],
  },
  legal: {
    synonymIntensity: 0.35,       // legal terms are precise — low replacement
    structuralRate: 0.10,          // legal structures are intentional
    starterInjectionRate: 0.02,
    phraseReplacementCap: 0.40,
    minChangeTarget: 0.35,
    sentenceSplitRate: 0.10,       // legal sentences are often long by design
    sentenceMergeRate: 0.05,
    preservePrecision: true,
    domainStarters: [
      'Under this framework,', 'From a legal standpoint,',
      'In practice,', 'Pursuant to this analysis,', 'On this point,',
    ],
  },
  business: {
    synonymIntensity: 0.60,
    structuralRate: 0.30,
    starterInjectionRate: 0.06,
    phraseReplacementCap: 0.75,
    minChangeTarget: 0.50,
    sentenceSplitRate: 0.25,
    sentenceMergeRate: 0.25,
    preservePrecision: false,
    domainStarters: [
      'In practice,', 'From a market perspective,', 'Strategically,',
      'On the operational side,', 'In competitive terms,',
    ],
  },
  humanities: {
    synonymIntensity: 0.65,
    structuralRate: 0.35,          // more structural variety
    starterInjectionRate: 0.07,
    phraseReplacementCap: 0.80,
    minChangeTarget: 0.55,
    sentenceSplitRate: 0.25,
    sentenceMergeRate: 0.30,
    preservePrecision: false,
    domainStarters: [
      'Historically,', 'In cultural terms,', 'From this lens,',
      'Philosophically,', 'In broader context,', 'Traditionally,',
    ],
  },
  creative: {
    synonymIntensity: 0.50,       // moderate — preserve voice
    structuralRate: 0.40,          // structural variety is welcome
    starterInjectionRate: 0.04,
    phraseReplacementCap: 0.55,
    minChangeTarget: 0.45,
    sentenceSplitRate: 0.20,
    sentenceMergeRate: 0.35,       // creative texts benefit from varied pacing
    preservePrecision: false,
    domainStarters: [
      'In a sense,', 'At its core,', 'Looking closer,',
      'On reflection,', 'In the end,',
    ],
  },
  technical: {
    synonymIntensity: 0.35,       // very conservative — specs/code refs
    structuralRate: 0.10,
    starterInjectionRate: 0.02,
    phraseReplacementCap: 0.40,
    minChangeTarget: 0.35,
    sentenceSplitRate: 0.15,
    sentenceMergeRate: 0.10,
    preservePrecision: true,
    domainStarters: [
      'In implementation terms,', 'Architecturally,', 'At a systems level,',
      'From an engineering perspective,', 'In this configuration,',
    ],
  },
  general: {
    synonymIntensity: 0.55,
    structuralRate: 0.25,
    starterInjectionRate: 0.05,
    phraseReplacementCap: 0.70,
    minChangeTarget: 0.50,
    sentenceSplitRate: 0.20,
    sentenceMergeRate: 0.25,
    preservePrecision: false,
    domainStarters: [
      'Notably,', 'In practice,', 'In broad terms,',
      'On balance,', 'In reality,',
    ],
  },
};

/**
 * Get the rewriting strategy for a detected domain.
 * Falls back to 'general' for unknown domains.
 */
export function getStrategy(domain: DomainResult): DomainStrategy {
  return STRATEGIES[domain.primary] || STRATEGIES.general;
}

/**
 * Blend two strategies by weight (for texts with a strong secondary domain).
 * weight = 0 → pure primary, weight = 1 → pure secondary.
 */
export function blendStrategies(primary: DomainStrategy, secondary: DomainStrategy, weight: number): DomainStrategy {
  const w = Math.max(0, Math.min(1, weight));
  const mix = (a: number, b: number) => a * (1 - w) + b * w;
  return {
    synonymIntensity: mix(primary.synonymIntensity, secondary.synonymIntensity),
    structuralRate: mix(primary.structuralRate, secondary.structuralRate),
    starterInjectionRate: mix(primary.starterInjectionRate, secondary.starterInjectionRate),
    phraseReplacementCap: mix(primary.phraseReplacementCap, secondary.phraseReplacementCap),
    minChangeTarget: mix(primary.minChangeTarget, secondary.minChangeTarget),
    sentenceSplitRate: mix(primary.sentenceSplitRate, secondary.sentenceSplitRate),
    sentenceMergeRate: mix(primary.sentenceMergeRate, secondary.sentenceMergeRate),
    preservePrecision: primary.preservePrecision || secondary.preservePrecision,
    domainStarters: [...new Set([...primary.domainStarters, ...secondary.domainStarters])],
  };
}

/**
 * Resolve the final strategy for a domain result, blending secondary if present.
 */
export function resolveStrategy(domain: DomainResult): DomainStrategy {
  const primary = STRATEGIES[domain.primary] || STRATEGIES.general;
  if (domain.secondary && STRATEGIES[domain.secondary]) {
    return blendStrategies(primary, STRATEGIES[domain.secondary], 0.3);
  }
  return primary;
}
