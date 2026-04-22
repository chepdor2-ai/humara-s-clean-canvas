export type HumanizationDepth = "light" | "medium" | "strong";

export interface ChangeTargets {
  strength: HumanizationDepth;
  minDocumentChange: number;
  minSentenceChange: number;
  maxEngineRetries: number;
  maxWordLevelPasses: number;
  minChangedSentenceShare: number;
  planIterationBias: number;
}

export interface SentenceChangeEntry {
  candidateIndex: number;
  originalIndex: number;
  ratio: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function normalizeHumanizationDepth(value?: string | null): HumanizationDepth {
  const normalized = (value ?? "").toLowerCase();
  if (normalized === "light" || normalized === "low") return "light";
  if (normalized === "medium" || normalized === "balanced" || normalized === "normal") return "medium";
  return "strong";
}

export function resolveChangeTargets(
  strength?: string | null,
  humanizationRate?: number | null,
): ChangeTargets {
  const depth = normalizeHumanizationDepth(strength);

  const baseByDepth: Record<HumanizationDepth, Omit<ChangeTargets, "strength">> = {
    light: {
      minDocumentChange: 0.55,
      minSentenceChange: 0.40,
      maxEngineRetries: 2,
      maxWordLevelPasses: 3,
      minChangedSentenceShare: 0.78,
      planIterationBias: 1,
    },
    medium: {
      minDocumentChange: 0.75,
      minSentenceChange: 0.50,
      maxEngineRetries: 3,
      maxWordLevelPasses: 4,
      minChangedSentenceShare: 0.88,
      planIterationBias: 2,
    },
    strong: {
      minDocumentChange: 0.85,
      minSentenceChange: 0.65,
      maxEngineRetries: 5,
      maxWordLevelPasses: 6,
      minChangedSentenceShare: 0.94,
      planIterationBias: 4,
    },
  };

  const base = baseByDepth[depth];
  const rate = clamp(Math.round(humanizationRate ?? 0), 0, 10);
  const ratePressure = rate > 0 ? rate / 10 : 0;
  const maxDocCap = depth === "light" ? 0.68 : depth === "medium" ? 0.84 : 0.92;
  const maxSentCap = depth === "light" ? 0.48 : depth === "medium" ? 0.58 : 0.72;
  const bonusPressure = Math.max(0, ratePressure - (depth === "light" ? 0.5 : depth === "medium" ? 0.6 : 0.7));

  return {
    strength: depth,
    minDocumentChange: clamp(base.minDocumentChange + bonusPressure * 0.08, base.minDocumentChange, maxDocCap),
    minSentenceChange: clamp(base.minSentenceChange + bonusPressure * 0.05, base.minSentenceChange, maxSentCap),
    maxEngineRetries: base.maxEngineRetries + Math.round(bonusPressure * 2),
    maxWordLevelPasses: base.maxWordLevelPasses + Math.round(bonusPressure * 2),
    minChangedSentenceShare: clamp(base.minChangedSentenceShare + bonusPressure * 0.04, base.minChangedSentenceShare, 0.98),
    planIterationBias: base.planIterationBias + Math.round(bonusPressure * 2),
  };
}

export function measureLexicalChangeRatio(original: string, modified: string): number {
  const origWords = original.toLowerCase().split(/\s+/).filter(Boolean);
  const modWords = modified.toLowerCase().split(/\s+/).filter(Boolean);
  const len = Math.max(origWords.length, modWords.length);
  if (len === 0) return 1;

  let changed = 0;
  for (let i = 0; i < len; i++) {
    if (!origWords[i] || !modWords[i] || origWords[i] !== modWords[i]) changed++;
  }
  return changed / len;
}

export function mapSentenceChangeRatios(
  originalSentences: string[],
  candidateSentences: string[],
  isSkippable?: (sentence: string) => boolean,
): SentenceChangeEntry[] {
  const originalPool = originalSentences
    .map((sentence, index) => ({ sentence, index }))
    .filter(({ sentence }) => !isSkippable?.(sentence));

  return candidateSentences.map((sentence, candidateIndex) => {
    if (isSkippable?.(sentence) || originalPool.length === 0) {
      return { candidateIndex, originalIndex: -1, ratio: 1 };
    }

    let best = { originalIndex: originalPool[0].index, ratio: 1 };
    for (const original of originalPool) {
      const ratio = measureLexicalChangeRatio(original.sentence, sentence);
      if (ratio < best.ratio) best = { originalIndex: original.index, ratio };
    }

    return {
      candidateIndex,
      originalIndex: best.originalIndex,
      ratio: best.ratio,
    };
  });
}

