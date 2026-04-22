/**
 * Detector-Signature Adaptive Targeter
 * ──────────────────────────────────────────────────────────────────
 * Reads the per-sentence AI signals from the forensic detectors and
 * produces a per-sentence *attack plan*: which transformation
 * families are most likely to drop the score. The downstream engines
 * (Nuru / AntiPangram / Auto chain) read this plan and allocate
 * iteration budget accordingly.
 *
 * Signals we score per sentence:
 *   - connectorDensity    — "Furthermore,"/"Moreover," style
 *   - evaluativeDensity   — "plays a crucial role", "is essential"
 *   - hedgingDensity      — "it is important to note that"
 *   - connectorUniformity — same connectors across paragraph
 *   - burstinessGap       — sentence length vs paragraph mean
 *   - lexicalRichness     — unique content-word ratio
 *   - aiTellsDensity      — "delve, tapestry, realm, landscape"
 *   - parallelism         — "not only X but also Y", "both A and B"
 *
 * Each signal has a dedicated "attack":
 *   connector → rotate/replace connector openers
 *   evaluative → phrase surgery (delete padding)
 *   hedging → starter stripping
 *   burstinessGap → in-sentence clause reorder (NO split/merge)
 *   lexicalRichness → targeted synonym swaps
 *   aiTells → phrase-kill sweep
 *   parallelism → template-break
 *
 * ──────────────────────────────────────────────────────────────────
 */

export interface SentenceSignalProfile {
  index: number;
  text: string;
  wordCount: number;
  aiScore: number;
  connectorDensity: number;
  evaluativeDensity: number;
  hedgingDensity: number;
  aiTellsDensity: number;
  parallelism: number;
  lexicalRichness: number;
  burstinessGap: number;
  openerIsConnector: boolean;
}

export interface AttackPlan {
  /** Which attacks to run, in order. */
  attacks: AttackKind[];
  /** How aggressive each attack should be (0-1). */
  intensity: Partial<Record<AttackKind, number>>;
  /** Suggested iteration budget for this sentence. */
  iterationBudget: number;
  /** Whether this sentence is already below risk — skip heavy work. */
  alreadyLow: boolean;
}

export type AttackKind =
  | "connector_rotation"
  | "phrase_surgery"
  | "starter_strip"
  | "clause_reorder"
  | "voice_toggle"
  | "synonym_swap"
  | "phrase_kill"
  | "template_break"
  | "sentence_opener_diversify";

/** Connector/transition words that AI loves. */
const CONNECTOR_WORDS = new Set([
  "furthermore",
  "moreover",
  "additionally",
  "consequently",
  "therefore",
  "thus",
  "hence",
  "subsequently",
  "accordingly",
  "nevertheless",
  "nonetheless",
  "notwithstanding",
  "however",
]);

/** Evaluative filler phrases — the "plays a vital role" family. */
const EVALUATIVE_PATTERNS: RegExp[] = [
  /\bplays? an? (?:crucial|vital|pivotal|critical|key|significant|important|instrumental|central|essential|major)\s+role\b/i,
  /\b(?:is|are|remains?)\s+(?:crucial|vital|pivotal|critical|essential|paramount)\b/i,
  /\bone of the (?:key|major|most important|primary|greatest|significant)\s+(?:strengths|advantages|benefits|features)\b/i,
  /\ba (?:wide|broad|vast|diverse|rich) (?:range|array|spectrum|variety)\s+of\b/i,
  /\bplays? a significant role\b/i,
];

/** Hedging starters — the "it is important to note" family. */
const HEDGING_PATTERNS: RegExp[] = [
  /^\s*it is (?:important|crucial|essential|worth) (?:to note|to mention|noting)\b/i,
  /^\s*it (?:should|must|can) be noted that\b/i,
  /^\s*in today'?s (?:world|society|landscape|era|age)\b/i,
  /^\s*it is (?:widely|generally|commonly) (?:known|acknowledged|accepted)\b/i,
  /^\s*there is no doubt that\b/i,
  /^\s*needless to say,?\s*/i,
];

/** High-signal AI "tells" — words detectors over-weight. */
const AI_TELL_WORDS = new Set([
  "delve",
  "tapestry",
  "realm",
  "landscape",
  "cornerstone",
  "leverage",
  "utilize",
  "multifaceted",
  "paradigm",
  "trajectory",
  "robust",
  "pivotal",
  "intricate",
  "transformative",
  "holistic",
  "streamline",
  "optimize",
  "bolster",
  "catalyze",
  "harness",
  "underscore",
  "exemplify",
  "embark",
  "navigate",
  "revolutionize",
  "unprecedented",
  "groundbreaking",
  "seamless",
  "seamlessly",
]);

/** Parallel-structure markers. */
const PARALLEL_PATTERNS: RegExp[] = [
  /\bnot only\b.{3,80}\bbut also\b/i,
  /\bboth\b.{3,60}\band\b/i,
  /\beither\b.{3,60}\bor\b/i,
  /\bneither\b.{3,60}\bnor\b/i,
];

const WORD_RE = /[a-zA-Z][a-zA-Z\-']*/g;

function countMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const p of patterns) {
    if (p.test(text)) count++;
  }
  return count;
}

function extractWords(text: string): string[] {
  return text.match(WORD_RE)?.map((w) => w.toLowerCase()) ?? [];
}

function computeLexicalRichness(words: string[]): number {
  if (words.length === 0) return 1;
  const content = words.filter((w) => w.length >= 4);
  if (content.length === 0) return 1;
  const unique = new Set(content).size;
  return unique / content.length;
}

/**
 * Score a sentence's signal profile. All densities are normalized to
 * [0, 1] per-sentence so they compose cleanly in the attack planner.
 */
export function profileSentenceSignals(
  sentence: string,
  index: number,
  aiScore: number,
  paragraphMeanWords = 0,
): SentenceSignalProfile {
  const words = extractWords(sentence);
  const wordCount = words.length;
  const safe = Math.max(1, wordCount);

  let connectorMatches = 0;
  for (const w of words) if (CONNECTOR_WORDS.has(w)) connectorMatches++;
  const connectorDensity = connectorMatches / safe;

  const firstWord = (words[0] ?? "").toLowerCase();
  const openerIsConnector = CONNECTOR_WORDS.has(firstWord);

  const evaluativeDensity = countMatches(sentence, EVALUATIVE_PATTERNS) / 2;
  const hedgingDensity = countMatches(sentence, HEDGING_PATTERNS);
  let aiTellsCount = 0;
  for (const w of words) if (AI_TELL_WORDS.has(w)) aiTellsCount++;
  const aiTellsDensity = aiTellsCount / safe;
  const parallelism = countMatches(sentence, PARALLEL_PATTERNS) / 2;
  const lexicalRichness = computeLexicalRichness(words);

  const burstinessGap = paragraphMeanWords > 0
    ? Math.abs(wordCount - paragraphMeanWords) / paragraphMeanWords
    : 0;

  return {
    index,
    text: sentence,
    wordCount,
    aiScore: Math.max(0, Math.min(100, aiScore)),
    connectorDensity: Math.min(1, connectorDensity * 4),
    evaluativeDensity: Math.min(1, evaluativeDensity),
    hedgingDensity: Math.min(1, hedgingDensity),
    aiTellsDensity: Math.min(1, aiTellsDensity * 5),
    parallelism: Math.min(1, parallelism),
    lexicalRichness,
    burstinessGap: Math.min(1, burstinessGap),
    openerIsConnector,
  };
}

/**
 * Translate a signal profile into a concrete attack plan.
 * High-signal sentences get more attacks and more iteration budget.
 */
export function planAttack(
  profile: SentenceSignalProfile,
  options: { detectorPressure?: number; baseBudget?: number } = {},
): AttackPlan {
  const pressure = Math.max(0, Math.min(1, options.detectorPressure ?? 0.6));
  const baseBudget = options.baseBudget ?? 4;

  const attacks: AttackKind[] = [];
  const intensity: Partial<Record<AttackKind, number>> = {};

  // Hedging is the cheapest win — run it first.
  if (profile.hedgingDensity > 0) {
    attacks.push("starter_strip");
    intensity.starter_strip = 0.95;
  }

  // Evaluative padding — phrase surgery is extremely high ROI.
  if (profile.evaluativeDensity > 0) {
    attacks.push("phrase_surgery");
    intensity.phrase_surgery = Math.min(1, 0.6 + pressure * 0.4);
  }

  // Connector openers dominate AI detectors — always rotate/replace.
  if (profile.openerIsConnector || profile.connectorDensity > 0.05) {
    attacks.push("connector_rotation");
    intensity.connector_rotation = Math.min(1, 0.7 + pressure * 0.3);
  }

  // Parallel structures — template break.
  if (profile.parallelism > 0) {
    attacks.push("template_break");
    intensity.template_break = 0.7;
  }

  // AI-tell words — phrase kill.
  if (profile.aiTellsDensity > 0) {
    attacks.push("phrase_kill");
    intensity.phrase_kill = Math.min(1, 0.7 + pressure * 0.3);
  }

  // Always do synonym swaps; intensity scales with risk.
  attacks.push("synonym_swap");
  intensity.synonym_swap = Math.min(
    0.95,
    0.45 + profile.aiScore / 200 + pressure * 0.25,
  );

  // Structural change when risk is high AND sentence is long enough.
  if (profile.wordCount >= 14 && profile.aiScore >= 25) {
    attacks.push("clause_reorder");
    intensity.clause_reorder = Math.min(1, 0.4 + pressure * 0.4);
  }
  if (profile.wordCount >= 14 && (profile.aiScore >= 35 || pressure >= 0.6)) {
    attacks.push("voice_toggle");
    intensity.voice_toggle = Math.min(1, 0.35 + pressure * 0.4);
  }

  // Sentence opener diversification when the opener is generic.
  if (profile.index > 0 && /^(the|this|that|these|those|it|a|an)\b/i.test(profile.text.trim())) {
    attacks.push("sentence_opener_diversify");
    intensity.sentence_opener_diversify = 0.35 + pressure * 0.25;
  }

  const alreadyLow = profile.aiScore < 10 && profile.hedgingDensity === 0
    && profile.evaluativeDensity === 0 && profile.aiTellsDensity === 0;

  const iterationBudget = alreadyLow
    ? Math.max(2, Math.floor(baseBudget * 0.5))
    : Math.min(
        20,
        Math.round(baseBudget + profile.aiScore / 10 + pressure * 6 + attacks.length * 0.5),
      );

  return { attacks, intensity, iterationBudget, alreadyLow };
}

/**
 * Score the overall aggressiveness signal for a document — used by
 * the Super Auto to decide how many engines to chain.
 */
export function scoreDocumentSignals(profiles: SentenceSignalProfile[]): {
  avgAiScore: number;
  connectorDensity: number;
  evaluativeDensity: number;
  hedgingDensity: number;
  aiTellsDensity: number;
  parallelism: number;
  openerConnectorRate: number;
  burstinessStdDev: number;
  highRiskRatio: number;
} {
  if (profiles.length === 0) {
    return {
      avgAiScore: 0,
      connectorDensity: 0,
      evaluativeDensity: 0,
      hedgingDensity: 0,
      aiTellsDensity: 0,
      parallelism: 0,
      openerConnectorRate: 0,
      burstinessStdDev: 0,
      highRiskRatio: 0,
    };
  }

  const n = profiles.length;
  const avg = (sel: (p: SentenceSignalProfile) => number): number =>
    profiles.reduce((s, p) => s + sel(p), 0) / n;

  const meanWords = avg((p) => p.wordCount);
  let varWords = 0;
  for (const p of profiles) varWords += (p.wordCount - meanWords) ** 2;
  varWords = varWords / n;

  const highRisk = profiles.filter((p) => p.aiScore >= 35).length;

  return {
    avgAiScore: avg((p) => p.aiScore),
    connectorDensity: avg((p) => p.connectorDensity),
    evaluativeDensity: avg((p) => p.evaluativeDensity),
    hedgingDensity: avg((p) => p.hedgingDensity),
    aiTellsDensity: avg((p) => p.aiTellsDensity),
    parallelism: avg((p) => p.parallelism),
    openerConnectorRate: profiles.filter((p) => p.openerIsConnector).length / n,
    burstinessStdDev: Math.sqrt(varWords),
    highRiskRatio: highRisk / n,
  };
}
