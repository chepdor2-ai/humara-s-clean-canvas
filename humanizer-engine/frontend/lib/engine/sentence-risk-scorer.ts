/**
 * Sentence Risk Scorer
 * Assigns a risk tier to each sentence based on detectable AI signals.
 * Used to drive per-sentence change intensity in adaptive humanization chains.
 *
 * Tiers and their default changeTarget values:
 *   protected  → 0.00  (do not touch — heading / citation / fragment)
 *   low        → 0.30  (light touch only)
 *   medium     → 0.55  (standard restructure)
 *   high       → 0.75  (aggressive rewrite)
 *   critical   → 0.90  (maximum transformation — very strong AI signals)
 */

import type { DomainResult } from './domain-detector';

export type RiskTier = 'protected' | 'low' | 'medium' | 'high' | 'critical';

export interface SentenceRiskResult {
  tier: RiskTier;
  changeTarget: number;   // 0.00 – 1.00
  signals: string[];      // human-readable signal tags that triggered the score
}

// ── Tier → base changeTarget mapping ────────────────────────────────────────
const TIER_CHANGE_TARGET: Record<RiskTier, number> = {
  protected: 0.00,
  low:       0.30,
  medium:    0.55,
  high:      0.75,
  critical:  0.90,
};

// ── AI signal pattern catalogue ─────────────────────────────────────────────

/** Sentences that must not be restructured. */
const PROTECTED_PATTERNS = [
  // Markdown/HTML headings
  /^#{1,6}\s/,
  /^<h[1-6]/i,
  // Reference / citation lines
  /^\[\d+\]/,
  /^https?:\/\//i,
  /^doi:/i,
  // Numbered list items at the sentence level
  /^\d+\.\s/,
  // Very short fragments (< 6 words) that carry little AI signal
];

/** Phrases strongly associated with AI writing (+2 each) */
const HIGH_WEIGHT_AI_PHRASES: RegExp[] = [
  /\bit is (?:important|crucial|essential|worth(?:while)?) to note\b/i,
  /\bit should be noted\b/i,
  /\bit is (?:noteworthy|significant) that\b/i,
  /\bin (?:conclusion|summary|summation)\b/i,
  /\bto (?:summarize|conclude|recap)\b/i,
  /\boverall,?\s/i,
  /\b(?:in this light|in light of|stepping back|looking closely|delving deeper),?\s/i,
  /\bthis (?:paper|study|article|essay|research|discrepancy|shift|evolution) (?:aims|seeks|endeavors|attempts|shows|reveals|reflects|points out)\b/i,
  /\bthe (?:purpose|objective|aim) of this\b/i,
  /\bfurther research (?:is needed|is required|should)\b/i,
  /\bthe (?:findings|results|evidence|views|insights|similarities|differences) (?:suggest|indicate|demonstrate|show|reveal|reflect|highlight)\b/i,
  /\b(?:moreover|furthermore|additionally|meanwhile|likewise|conversely),?\s+although\b/i,
  /\ba (?:fascinating|profound|unique|significant|crucial|vital|pivotal) (?:combination|blend|mix|tension|similarity|divergence)\b/i,
  // Sentence-initial formal connectors are a VERY strong AI signal (+2 each)
  /^(?:furthermore|moreover|additionally|consequently|nevertheless|notwithstanding|subsequently|accordingly|likewise|conversely)[,;]\s/i,
  // "X-century views reveal fascinating" type academic AI prose
  /\b(?:eighteenth|nineteenth|twentieth|seventeenth|sixteenth)-century (?:views|ideas|beliefs|values|notions|perspectives) (?:on|of|about|regarding) .{5,50} (?:reveal|show|highlight|demonstrate|reflect|indicate)/i,
  // "This reflects an ongoing tension between" evaluative meta-commentary
  /\bthis (?:reflects|reveals|shows|demonstrates|highlights) (?:a|an|the) (?:ongoing|lasting|broader|important|fascinating|significant|deep) (?:tension|similarity|difference|pattern|shift|influence|debate)/i,
  // Real-detector tier-1 signals (+2 each)
  /\bplays? a (?:crucial|vital|pivotal|key|significant|important|central|fundamental) role\b/i,
  /\bserves? as (?:a|an) (?:crucial|vital|key|important|essential|critical|central|fundamental) (?:tool|mechanism|framework|foundation|cornerstone|component)\b/i,
  /\b(?:research|studies|evidence|data) (?:has|have) (?:shown|demonstrated|indicated|revealed|suggested) that\b/i,
  /\bit (?:has been|is) (?:widely|generally|commonly) (?:shown|demonstrated|established|recognized|accepted|acknowledged)\b/i,
  /\bit can be argued (?:that)?\b/i,
  /\b(?:navigating|navigate) the (?:complexities|challenges|intricacies|nuances|landscape)\b/i,
  /\bfosters? (?:a|an) (?:sense|culture|environment|atmosphere|deep understanding|appreciation) of\b/i,
  /\bempowers? (?:individuals|people|students|users|learners|communities|professionals) to\b/i,
  /\bcan be attributed to\b/i,
  /\bhas (?:gained|garnered|received|attracted|drawn) (?:significant|considerable|substantial|growing|increasing|widespread) (?:attention|interest|traction|momentum|recognition)\b/i,
  /\bhas emerged as (?:a|an) (?:key|crucial|vital|leading|dominant|primary) \w+\b/i,
  /\brepresents? (?:a|an) (?:significant|major|important|pivotal|fundamental) (?:step|shift|change|departure|milestone|advancement)\b/i,
  /\bthe (?:significance|importance|value|impact) of .{5,40}? cannot be (?:overstated|overlooked|underestimated)\b/i,
  /\bparadigm shift\b/i,
  /\ba (?:growing|increasing|mounting) body of (?:research|evidence|literature)\b/i,
  /\bas (?:previously|earlier) (?:mentioned|noted|discussed|stated)\b/i,
  /\bdemonstrates? (?:a|an) (?:commitment|dedication|focus|drive) to\b/i,
  /\bhas (?:profound|significant|important|far-reaching|major) implications for\b/i,
];

/** Moderate AI-associated phrases (+1 each) */
const MEDIUM_WEIGHT_AI_PHRASES: RegExp[] = [
  /\bfurthermore[,\s]/i,
  /\bmoreover[,\s]/i,
  /\badditionally[,\s]/i,
  /\bconsequently[,\s]/i,
  /\bnevertheless[,\s]/i,
  /\bnotwithstanding\b/i,
  /\bin terms of\b/i,
  /\bwith regard(?:s?) to\b/i,
  /\bin (?:relation|contrast|comparison) to\b/i,
  /\bplays? a (?:crucial|vital|pivotal|key|significant) role\b/i,
  /\bunderscores? the (?:importance|significance|need)\b/i,
  /\bhighlights? the (?:importance|significance|need)\b/i,
  /\bsignificant(?:ly)?\b/i,
  /\bsubstantial(?:ly)?\b/i,
  /\bcomprehensive(?:ly)?\b/i,
  /\butiliz(?:e|ing|es|ed)\b/i,
  /\bfacilitat(?:e|ing|es|ed)\b/i,
  /\bleverage[sd]?\b/i,
  /\bimplementat(?:ion|ions)\b/i,
  /\boptimiz(?:e|ing|es|ed)\b/i,
  /\bdemonstrat(?:e|ing|es|ed)\b/i,
  /\bcontribut(?:e|ing|es|ed) to\b/i,
  /\baddress(?:es|ing|ed)? the (?:issue|challenge|problem|need)\b/i,
  // Additional medium-weight AI signals
  /\bmoving forward\b/i,
  /\bgoing forward\b/i,
  /\bin recent years\b/i,
  /\bhas become increasingly\b/i,
  /\bbest practices?\b/i,
  /\bat the forefront\b/i,
  /\bcutting[- ]edge\b/i,
  /\bstate[- ]of[- ]the[- ]art\b/i,
  /\bgame[- ]changer?\b/i,
  /\bholistic (?:approach|view|understanding)\b/i,
  /\bmultifaceted\b/i,
  /\bsynergistic\b/i,
  /\bseamless(?:ly)?\b/i,
  /\bgroundbreaking\b/i,
  /\btransformative\b/i,
  /\bpivotal\b/i,
  /\brobust\b/i,
  /\binnovative\b/i,
  /\bparamount\b/i,
  /\bdelve(?:s|d|ing)?\b/i,
  /\bencapsulat(?:e|es|ed|ing)\b/i,
  /\belucidat(?:e|es|ed|ing)\b/i,
  /\bfoster(?:s|ed|ing)?\b/i,
  /\bempower(?:s|ed|ing)?\b/i,
  /\bbolster(?:s|ed|ing)?\b/i,
  /\bexacerbate(?:s|d|ing)?\b/i,
  /\bameliorat(?:e|es|ed|ing)\b/i,
  /\bprolifer(?:ate|ates|ated|ating|ation)\b/i,
  /\btapestry\b/i,
  /\bcornerstoneof\b|cornerstone of\b/i,
  /\blandscape\b/i,
  /\bparadigm\b/i,
  /\btrajectory\b/i,
  /\bever[- ]evolving\b/i,
  /\boverall,?\s/i,
  /\bfirst and foremost\b/i,
  /\bneedless to say\b/i,
  /\bit (?:is|goes) without saying\b/i,
];

/** Passive voice marker — adds to score but at lower weight */
const PASSIVE_VOICE_RE = /\b(?:is|are|was|were|be|been|being)\s+\w+ed\b/i;

// ── Main scorer ──────────────────────────────────────────────────────────────

/**
 * Score a single sentence for AI risk.
 *
 * @param sentence   - The sentence to analyse (already trimmed).
 * @param domainResult - DomainResult from detectDomain() for the full document.
 *                       Pass null if not available — score uses neutral defaults.
 * @returns SentenceRiskResult with tier, changeTarget, and signal tags.
 */
export function scoreSentenceRisk(
  sentence: string,
  domainResult: DomainResult | null,
): SentenceRiskResult {
  const signals: string[] = [];
  const trimmed = sentence.trim();

  // ── 1. Protected tier checks ─────────────────────────────────────────────
  const wordCount = trimmed.split(/\s+/).length;

  if (wordCount < 5) {
    signals.push('fragment');
    return { tier: 'protected', changeTarget: 0, signals };
  }

  for (const re of PROTECTED_PATTERNS) {
    if (re.test(trimmed)) {
      signals.push('protected-pattern');
      return { tier: 'protected', changeTarget: 0, signals };
    }
  }

  // ── 2. Signal weighting ──────────────────────────────────────────────────
  let score = 0;

  for (const re of HIGH_WEIGHT_AI_PHRASES) {
    if (re.test(trimmed)) {
      score += 2;
      signals.push(re.source.slice(0, 40));
    }
  }

  for (const re of MEDIUM_WEIGHT_AI_PHRASES) {
    if (re.test(trimmed)) {
      score += 1;
      signals.push(re.source.slice(0, 40));
    }
  }

  if (PASSIVE_VOICE_RE.test(trimmed)) {
    score += 0.5;
    signals.push('passive-voice');
  }

  // Long, very uniform sentences trend AI  (> 35 words with no comma = likely enumeration)
  if (wordCount > 35 && !trimmed.includes(',')) {
    score += 1;
    signals.push('long-uniform');
  }

  // ── 3. Domain adjustments ────────────────────────────────────────────────
  // Creative / humanities domains can carry naturally formal diction — raise bar slightly
  const domain = domainResult?.primary ?? 'general';
  let domainAdj = 0;
  if (domain === 'creative' || domain === 'humanities') domainAdj = -0.5;
  if (domain === 'legal') domainAdj = -0.5;    // legal register is inherently formal
  if (domain === 'medical' || domain === 'stem') domainAdj = 0.5; // extra scrutiny

  const finalScore = score + domainAdj;

  // ── 4. Tier resolution ────────────────────────────────────────────────────
  // Thresholds deliberately lowered so more sentences receive aggressive treatment.
  let tier: RiskTier;
  if (finalScore >= 4) {
    tier = 'critical';
  } else if (finalScore >= 2.5) {
    tier = 'high';
  } else if (finalScore >= 1) {
    tier = 'medium';
  } else {
    tier = 'low'; // even clean sentences get a small change target
  }

  return {
    tier,
    changeTarget: TIER_CHANGE_TARGET[tier],
    signals,
  };
}
