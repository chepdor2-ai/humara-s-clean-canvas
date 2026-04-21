/**
 * Sentence-Flow Polisher
 * ======================
 * Post-processing pass that guarantees smooth sentence-to-sentence flow
 * while keeping detector scores as low as possible.
 *
 * Strictly sentence-by-sentence. Never merges or splits sentences here
 * (that is the burstiness/sentence-surgeon's job). This pass only edits
 * inside a sentence and adjusts its opening / closing to flow with its
 * neighbors.
 *
 * Techniques:
 *   1. Connector rotation — never repeat the same formal connector
 *      ("Furthermore", "Moreover", "Additionally", "Consequently") in
 *      adjacent sentences. Rotate through a natural-human pool.
 *   2. Starter de-duplication — adjacent sentences must not share the
 *      same opening lemma/pronoun when there is a natural alternative.
 *   3. Pronoun anchoring — replace ambiguous "this"/"that" at sentence
 *      start when the antecedent is unclear, using a noun from the
 *      previous sentence's subject slot.
 *   4. Paragraph-lead diversification — the first sentence of each
 *      paragraph must use a different structural pattern than the
 *      first sentence of the previous paragraph.
 *   5. Abrupt transition smoothing — between two short declaratives
 *      with no connector, insert a light "and/yet/still" bridge
 *      when the semantic link is weak.
 *   6. Trailing-ing cleanup — remove ", contributing to X" style
 *      participial tails that survive earlier phases.
 */

import type { HumanizationPlan, SectionStrategy } from "./paper-strategy-selector";
import type { PaperProfile } from "./paper-profiler";
import { robustSentenceSplit } from "./content-protection";
import { looksLikeHeadingLine } from "./structure-preserver";

// ── Constants ─────────────────────────────────────────────────────────

const FORMAL_CONNECTOR_RE = /^(Furthermore|Moreover|Additionally|Consequently|Subsequently|Nevertheless|Notwithstanding|Accordingly|Thus|Hence|Therefore|Indeed|Specifically|Notably)\b/i;

const NATURAL_CONNECTOR_POOL = [
  "Beyond that",
  "On top of that",
  "What is more",
  "Building on this",
  "By extension",
  "Still",
  "That said",
  "Even so",
  "In practice",
  "In turn",
  "As a result",
  "Because of this",
  "At the same time",
  "Looked at another way",
  "From that angle",
];

const OPENER_FAMILIES: Array<{ family: string; pattern: RegExp; alternatives: string[] }> = [
  {
    family: "this",
    pattern: /^(This|These|Those|That)\s+/i,
    alternatives: ["Such", "The aforementioned", "The described", "That particular"],
  },
  {
    family: "the",
    pattern: /^The\s+/i,
    alternatives: ["A single", "One", "Each"], // sparingly used
  },
  {
    family: "it",
    pattern: /^(It\s+is|It\s+has|It\s+was)\b/i,
    alternatives: ["The situation involves", "The case shows", "The record suggests"],
  },
  {
    family: "however",
    pattern: /^However,\s+/i,
    alternatives: ["Still,", "Even so,", "Yet,", "That said,"],
  },
];

const TRAILING_ING_RE = /,\s+(\w+ing\b[^,.!?]{0,80})([.!?])\s*$/;

// ── Helpers ───────────────────────────────────────────────────────────

function firstWord(sentence: string): string {
  const m = sentence.trim().match(/^(\w+)/);
  return m ? m[1].toLowerCase() : "";
}

function stripLeadingConnector(sentence: string): { connector: string | null; rest: string } {
  const m = sentence.match(/^([A-Z][A-Za-z]+)(,?)\s+/);
  if (m && FORMAL_CONNECTOR_RE.test(m[1])) {
    return { connector: m[1], rest: sentence.slice(m[0].length).trim() };
  }
  return { connector: null, rest: sentence };
}

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lowercaseFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function pickAlt<T>(pool: T[], rng: () => number): T {
  return pool[Math.floor(rng() * pool.length)];
}

function deterministicRng(seed: number): () => number {
  // xorshift32 — deterministic so polish results are stable per input
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    // convert to positive [0, 1)
    return ((state >>> 0) & 0xFFFFFFFF) / 0x100000000;
  };
}

// ── Technique 1: connector rotation ───────────────────────────────────

function rotateConnectors(sentences: string[], rng: () => number): string[] {
  const usedRecent: string[] = [];
  const result: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    let s = sentences[i];
    const { connector, rest } = stripLeadingConnector(s);

    if (connector) {
      const lcConn = connector.toLowerCase();
      const recentCount = usedRecent.slice(-3).filter((c) => c === lcConn).length;

      if (recentCount >= 1) {
        // Already used this connector in recent sentences → rotate
        const alt = pickAlt(NATURAL_CONNECTOR_POOL, rng);
        s = `${alt}, ${lowercaseFirst(rest)}`;
        usedRecent.push(alt.toLowerCase());
      } else if (i > 0 && Math.floor(rng() * 3) === 0) {
        // 33% of the time, swap even first-use for natural pool variety
        const alt = pickAlt(NATURAL_CONNECTOR_POOL, rng);
        s = `${alt}, ${lowercaseFirst(rest)}`;
        usedRecent.push(alt.toLowerCase());
      } else {
        usedRecent.push(lcConn);
      }
    } else {
      usedRecent.push(firstWord(s));
    }

    if (usedRecent.length > 6) usedRecent.shift();
    result.push(s);
  }
  return result;
}

// ── Technique 2: starter de-duplication ───────────────────────────────

function deduplicateStarters(sentences: string[], rng: () => number): string[] {
  const starterRunCount = new Map<string, number>();
  const result: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    let s = sentences[i];
    const fw = firstWord(s);
    const prevFw = i > 0 ? firstWord(result[i - 1]) : "";
    const count = (starterRunCount.get(fw) ?? 0) + 1;
    starterRunCount.set(fw, count);

    const repeats = fw === prevFw || count > 2;
    if (repeats && fw.length > 1) {
      for (const fam of OPENER_FAMILIES) {
        if (fam.pattern.test(s)) {
          const alt = pickAlt(fam.alternatives, rng);
          // Preserve the rest of the sentence, just swap the opener token.
          s = s.replace(fam.pattern, (_m) => alt + " ");
          // Reset count on rewrite
          starterRunCount.set(fw, 0);
          break;
        }
      }
    }

    result.push(s);
  }
  return result;
}

// ── Technique 3: pronoun anchoring ────────────────────────────────────

function anchorAmbiguousPronouns(sentences: string[]): string[] {
  const result: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    let s = sentences[i];
    if (i === 0) { result.push(s); continue; }

    // Detect ambiguous "This shows/suggests/implies/means" at start.
    const ambiguous = /^(This|That)\s+(shows|suggests|implies|means|indicates|demonstrates|reflects|highlights|underscores|explains)\b/i;
    if (!ambiguous.test(s)) { result.push(s); continue; }

    // Pull a candidate noun from the previous sentence's subject slot.
    const prev = result[i - 1];
    const subjMatch = prev.match(/\b(?:The\s+|A\s+|An\s+)?([A-Z][a-z]+(?:\s+[a-z]+){0,2})\s+(?:is|are|was|were|has|have|had|shows|suggests|indicates|demonstrates)\b/);
    const noun = subjMatch ? subjMatch[1].toLowerCase() : null;

    if (noun && noun.length > 2 && !/\b(?:this|that|these|those)\b/.test(noun)) {
      s = s.replace(ambiguous, (_m, _leading, verb) => `The ${noun} ${verb.toLowerCase()}`);
    }
    result.push(s);
  }
  return result;
}

// ── Technique 4: paragraph-lead diversification ───────────────────────

function diversifyParagraphLeads(
  paragraphs: string[],
  rng: () => number,
): string[] {
  const usedLeadPatterns: string[] = [];
  const out: string[] = [];

  for (const para of paragraphs) {
    const sents = robustSentenceSplit(para.trim());
    if (sents.length === 0) { out.push(para); continue; }

    let lead = sents[0];
    const leadPattern = classifyLeadPattern(lead);

    if (usedLeadPatterns.includes(leadPattern) && leadPattern !== "unknown") {
      // Try to transform lead onto a different pattern.
      lead = transformLeadPattern(lead, leadPattern, rng);
    }
    usedLeadPatterns.push(classifyLeadPattern(lead));
    if (usedLeadPatterns.length > 3) usedLeadPatterns.shift();

    sents[0] = lead;
    out.push(sents.join(" "));
  }
  return out;
}

function classifyLeadPattern(sentence: string): string {
  if (/^(This|These|Those|That)\s+/i.test(sentence)) return "this-demonstrative";
  if (/^The\s+/i.test(sentence)) return "the-noun";
  if (/^(In|On|At|During|After|Before|Within|Beyond)\s+/i.test(sentence)) return "prep-phrase";
  if (/^(It\s+is|It\s+has|There\s+is|There\s+are)\b/i.test(sentence)) return "it-there";
  if (/^(Although|While|Whereas|Despite|Though|Because|Since)\s+/i.test(sentence)) return "subordinate";
  if (/^(Researchers?|Scholars?|Scientists?|Authors?|Studies?)\s+/i.test(sentence)) return "actor";
  return "unknown";
}

function transformLeadPattern(sentence: string, pattern: string, rng: () => number): string {
  switch (pattern) {
    case "this-demonstrative": {
      const alts = ["Such", "The aforementioned", "That particular"];
      return sentence.replace(/^(This|These|Those|That)\s+/i, pickAlt(alts, rng) + " ");
    }
    case "the-noun": {
      // Front-load a prepositional opener.
      const alts = ["In this case,", "In practice,", "On balance,", "At this stage,"];
      return pickAlt(alts, rng) + " " + lowercaseFirst(sentence);
    }
    case "it-there": {
      // Rewrite "It is X that Y" → "X suggests Y" when possible.
      const m = sentence.match(/^(It\s+is|There\s+is|There\s+are)\s+(.+)$/i);
      if (m) {
        return capitalizeFirst(m[2]);
      }
      return sentence;
    }
    default:
      return sentence;
  }
}

// ── Technique 5: abrupt transition smoothing ─────────────────────────

function smoothAbruptTransitions(sentences: string[], rng: () => number): string[] {
  if (sentences.length < 2) return sentences;

  const result: string[] = [sentences[0]];
  for (let i = 1; i < sentences.length; i++) {
    const prev = result[i - 1];
    const cur = sentences[i];
    const prevLen = prev.split(/\s+/).length;
    const curLen = cur.split(/\s+/).length;

    // Trigger: two short declaratives in a row with no connector, and the
    // second starts with a bare subject. Add a light bridging word 30% of
    // the time to soften the abrupt cadence (natural human pattern).
    if (prevLen <= 14 && curLen <= 18 && !FORMAL_CONNECTOR_RE.test(cur) && /^[A-Z][a-z]+/.test(cur)) {
      if (rng() < 0.30) {
        const bridges = ["Still,", "Yet,", "And", "Even so,", "Then again,"];
        const bridge = pickAlt(bridges, rng);
        result.push(`${bridge} ${lowercaseFirst(cur)}`);
        continue;
      }
    }
    result.push(cur);
  }
  return result;
}

// ── Technique 6: trailing -ing cleanup ───────────────────────────────

function cleanTrailingParticiples(sentences: string[]): string[] {
  return sentences.map((s) => {
    const m = s.match(TRAILING_ING_RE);
    if (!m) return s;
    // Drop the participial tail if it is short (<= 6 words).
    const tail = m[1].trim();
    if (tail.split(/\s+/).length <= 6) {
      return s.replace(TRAILING_ING_RE, m[2]);
    }
    return s;
  });
}

// ── Main entry point ──────────────────────────────────────────────────

export interface FlowPolishOptions {
  profile?: PaperProfile;
  plan?: HumanizationPlan;
  /** Max iterations (outer). Defaults to plan.flowPolishIterations or 2. */
  iterations?: number;
  /** Deterministic seed — stable output per input. */
  seed?: number;
  /** Callback for per-iteration progress. */
  onStage?: (stage: string) => void | Promise<void>;
}

export interface FlowPolishResult {
  text: string;
  iterationsRun: number;
  techniquesApplied: string[];
}

export function sentenceFlowPolish(
  text: string,
  options: FlowPolishOptions = {},
): FlowPolishResult {
  if (!text || text.trim().length === 0) {
    return { text, iterationsRun: 0, techniquesApplied: [] };
  }

  const iterations = Math.max(1, Math.min(6, options.iterations ?? options.plan?.flowPolishIterations ?? 2));
  const seed = options.seed ?? (text.length + text.charCodeAt(0));
  const rng = deterministicRng(seed);

  const techniquesApplied: string[] = [];
  let current = text;

  for (let iter = 0; iter < iterations; iter++) {
    // Split by paragraph, process each, recombine
    const paragraphs = current.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);

    const processedParas: string[] = [];
    for (const para of paragraphs) {
      // Skip heading-only paragraphs
      if (para.split("\n").every((line) => looksLikeHeadingLine(line.trim()))) {
        processedParas.push(para);
        continue;
      }

      let sents = robustSentenceSplit(para);
      if (sents.length === 0) { processedParas.push(para); continue; }

      // 1. Connector rotation
      sents = rotateConnectors(sents, rng);
      // 2. Starter de-dup
      sents = deduplicateStarters(sents, rng);
      // 3. Pronoun anchoring
      sents = anchorAmbiguousPronouns(sents);
      // 5. Abrupt transition smoothing
      sents = smoothAbruptTransitions(sents, rng);
      // 6. Trailing -ing cleanup
      sents = cleanTrailingParticiples(sents);

      processedParas.push(sents.join(" "));
    }

    // 4. Paragraph-lead diversification (cross-paragraph)
    const diversified = diversifyParagraphLeads(processedParas, rng);
    current = diversified.join("\n\n");

    if (iter === 0) {
      techniquesApplied.push(
        "connector-rotation",
        "starter-dedup",
        "pronoun-anchor",
        "transition-smoothing",
        "participial-cleanup",
        "lead-diversification",
      );
    }

    options.onStage?.(`Flow polish ${iter + 1}/${iterations}`);
  }

  return {
    text: current,
    iterationsRun: iterations,
    techniquesApplied,
  };
}
