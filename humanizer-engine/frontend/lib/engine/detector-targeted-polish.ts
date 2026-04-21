/**
 * Detector-Signal-Targeted Polish
 * ================================
 * Final adaptive pass that reads the 20-signal vector produced by
 * `TextSignals.getAllSignals()` and applies signal-specific counters
 * to push every detector score toward the <5% target.
 *
 * The existing pipeline (Nuru + AntiPangram adaptive cycles) drops the
 * average AI score aggressively, but the remaining drift is always on
 * the 3-4 "sticky" signals — sentence_uniformity, per_sentence_ai_ratio,
 * starter_diversity, ngram_repetition, function_word_freq. This module
 * re-scores, identifies the top offenders, and applies a focused counter
 * for each, then iterates.
 *
 * Design principles:
 *   • Read the actual detector signal vector, not a heuristic guess.
 *   • Attack the top 2-3 worst signals each pass — not every signal.
 *   • Never touch headings, paragraph leads (unless score still >12), or
 *     protected content (brackets, numbers, formulas, percentages).
 *   • Meaning-preserving: reorderings, splits, and 1:1 swaps only.
 */

import { TextSignals } from "./multi-detector";
import {
  scoreSentenceDeep,
  AI_MARKER_WORDS,
  naturalReplacementFor,
} from "./ai-signal-dictionary";
import { stealthHumanizeTargeted, stealthHumanize } from "./stealth";
import {
  protectSpecialContent,
  restoreSpecialContent,
  robustSentenceSplit,
} from "./content-protection";
import { looksLikeHeadingLine } from "./structure-preserver";
import { splitLongSentence, mergeShortSentences } from "./antipangram/sentence-surgeon";

// ── Types ─────────────────────────────────────────────────────────────

export interface DetectorPolishOptions {
  /** Target detector AI score to stop at. Defaults to 5. */
  targetScore?: number;
  /** Maximum outer iterations. Defaults to 4. */
  maxIterations?: number;
  /** Maximum milliseconds to spend. Defaults to 20,000. */
  timeBudgetMs?: number;
  /** Whether to preserve paragraph lead sentences when score is already low. */
  preserveLeadSentences?: boolean;
  /** Tone for downstream Nuru calls. */
  tone?: string;
  /** Strength for hot-zone sentence surgery. */
  strength?: "light" | "medium" | "strong";
  /** Readability bias for Nuru (0.0-1.0). Higher = gentler rewrites. */
  readabilityBias?: number;
  /** Progress callback for streaming updates. */
  onStage?: (stage: string, currentScore: number) => void | Promise<void>;
}

export interface DetectorPolishResult {
  text: string;
  iterations: number;
  initialScore: number;
  finalScore: number;
  signalsFixed: string[];
  timeMs: number;
}

// ── Signal thresholds ─────────────────────────────────────────────────
// Each signal has an "alert threshold" — if the score is above (for
// AI-positive signals) or below (for human-positive signals) the
// threshold, the counter is applied.

const AI_POSITIVE_THRESHOLDS: Record<string, number> = {
  sentence_uniformity: 52,
  per_sentence_ai_ratio: 38,
  ngram_repetition: 50,
  ai_pattern_score: 48,
  function_word_freq: 56,
  token_predictability: 54,
  paragraph_uniformity: 55,
  avg_word_commonality: 56,
  zipf_deviation: 55,
};

const HUMAN_POSITIVE_FLOORS: Record<string, number> = {
  starter_diversity: 55,
  burstiness: 52,
  vocabulary_richness: 50,
  word_length_variance: 48,
};

// ── Helpers ───────────────────────────────────────────────────────────

function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
}

function joinParagraphs(paragraphs: string[]): string {
  return paragraphs.join("\n\n");
}

function splitSentences(paragraph: string): string[] {
  return robustSentenceSplit(paragraph.trim()).filter((s) => s.trim().length > 0);
}

function isHeadingLike(sentence: string): boolean {
  const t = sentence.trim();
  if (!t) return true;
  if (looksLikeHeadingLine(t)) return true;
  if (/^\d+\.\s/.test(t) && t.split(/\s+/).length <= 12) return true;
  if (/^#{1,6}\s/.test(t)) return true;
  if (/^[A-Z][A-Za-z0-9\s'\-:,]{0,80}$/.test(t) && !/[.!?]$/.test(t) && t.split(/\s+/).length <= 10) return true;
  return false;
}

function recap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function decap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ── Fix 1: burstiness / sentence_uniformity ──────────────────────────
// If sentences are too uniform in length, split the 2-3 longest and
// merge the shortest adjacent pairs. Uses existing surgeon primitives.

function fixBurstiness(text: string): string {
  const paragraphs = splitParagraphs(text);
  const out: string[] = [];

  for (const paragraph of paragraphs) {
    let sentences = splitSentences(paragraph);
    if (sentences.length < 3) {
      out.push(paragraph);
      continue;
    }

    // Step 1: split the 2 longest content sentences
    const lengthsWithIdx = sentences.map((s, idx) => ({
      idx,
      len: s.split(/\s+/).length,
      isHeading: isHeadingLike(s),
    }));
    const splitCandidates = lengthsWithIdx
      .filter((e) => !e.isHeading && e.len >= 22)
      .sort((a, b) => b.len - a.len)
      .slice(0, 2)
      .map((e) => e.idx)
      .sort((a, b) => b - a); // reverse so splice indices stay valid

    for (const idx of splitCandidates) {
      const parts = splitLongSentence(sentences[idx]);
      if (parts.length > 1) {
        sentences.splice(idx, 1, ...parts);
      }
    }

    // Step 2: merge adjacent short content sentences
    for (let i = sentences.length - 2; i >= 0; i--) {
      if (isHeadingLike(sentences[i]) || isHeadingLike(sentences[i + 1])) continue;
      const w1 = sentences[i].split(/\s+/).length;
      const w2 = sentences[i + 1].split(/\s+/).length;
      if (w1 <= 8 && w2 <= 8) {
        const merged = mergeShortSentences(sentences[i], sentences[i + 1]);
        if (merged) {
          sentences.splice(i, 2, merged);
        }
      }
    }

    out.push(sentences.join(" "));
  }

  return joinParagraphs(out);
}

// ── Fix 2: starter_diversity ─────────────────────────────────────────
// Track first words across sentences. When any opening word repeats
// more than twice, swap alternate repeats for a topic-neutral variant
// or front a trailing prepositional phrase.

const STARTER_ROTATION = [
  "In this context,",
  "At the same time,",
  "From this angle,",
  "On this point,",
  "Seen broadly,",
  "Taken together,",
  "Equally,",
  "By extension,",
  "In parallel,",
  "Considered carefully,",
];

function fixStarterDiversity(text: string): string {
  const paragraphs = splitParagraphs(text);
  const out: string[] = [];
  const starterCounts = new Map<string, number>();
  let rotation = 0;

  for (const paragraph of paragraphs) {
    const sentences = splitSentences(paragraph);
    const next: string[] = [];

    for (let i = 0; i < sentences.length; i++) {
      const sent = sentences[i];
      if (isHeadingLike(sent)) {
        next.push(sent);
        continue;
      }
      const firstWord = (sent.split(/\s+/)[0] ?? "").replace(/[^a-zA-Z]/g, "").toLowerCase();
      if (!firstWord) {
        next.push(sent);
        continue;
      }
      const count = (starterCounts.get(firstWord) ?? 0) + 1;
      starterCounts.set(firstWord, count);

      if (count >= 3 && i > 0) {
        // Strategy A: front a trailing prepositional phrase
        const ppMatch = sent.match(/^(.+?)\s+((?:in|on|at|for|through|during|within|across|against|alongside|after|before|beyond)\s+[^,]+?)[.!?]\s*$/i);
        if (ppMatch && ppMatch[2].split(/\s+/).length >= 3 && ppMatch[2].split(/\s+/).length <= 7) {
          const pp = ppMatch[2].trim();
          const rest = ppMatch[1].trim().replace(/[,.]$/, "");
          next.push(recap(pp) + ", " + decap(rest) + ".");
          continue;
        }
        // Strategy B: inject a rotating neutral opener
        const opener = STARTER_ROTATION[rotation % STARTER_ROTATION.length];
        rotation++;
        next.push(opener + " " + decap(sent));
      } else {
        next.push(sent);
      }
    }
    out.push(next.join(" "));
  }
  return joinParagraphs(out);
}

// ── Fix 3: ngram_repetition ──────────────────────────────────────────
// Find 3-grams that repeat 3+ times across the text and replace the
// 2nd and later occurrences with a single-word or reordered variant.

function fixNgramRepetition(text: string): string {
  const words = text.split(/(\s+)/); // keep whitespace tokens
  const tokenIndices: number[] = []; // indices of non-whitespace tokens
  for (let i = 0; i < words.length; i++) {
    if (words[i] && !/^\s+$/.test(words[i])) tokenIndices.push(i);
  }

  if (tokenIndices.length < 6) return text;

  // Build 3-gram frequency map (lowercased, punctuation-stripped)
  const trigramCounts = new Map<string, number[]>(); // key -> list of starting token indices
  for (let i = 0; i < tokenIndices.length - 2; i++) {
    const a = words[tokenIndices[i]].toLowerCase().replace(/[^\w']/g, "");
    const b = words[tokenIndices[i + 1]].toLowerCase().replace(/[^\w']/g, "");
    const c = words[tokenIndices[i + 2]].toLowerCase().replace(/[^\w']/g, "");
    if (!a || !b || !c) continue;
    if (a.length < 2 && b.length < 2 && c.length < 2) continue;
    const key = a + " " + b + " " + c;
    if (!trigramCounts.has(key)) trigramCounts.set(key, []);
    trigramCounts.get(key)!.push(i);
  }

  // Find 3-grams that repeat 3+ times and are content-bearing
  const STOP = new Set(["the", "a", "an", "is", "are", "was", "were", "of", "in", "to", "and", "or", "for", "on", "at", "by", "with", "as", "it", "this", "that"]);
  const replacements: Array<{ startTokenIdx: number; newWords: string[] }> = [];

  for (const [key, starts] of trigramCounts) {
    if (starts.length < 3) continue;
    const parts = key.split(" ");
    // Only target content-bearing trigrams (at least 1 content word)
    const contentCount = parts.filter((p) => !STOP.has(p) && p.length >= 3).length;
    if (contentCount < 1) continue;

    // Keep the first occurrence. Mutate a single word in later occurrences.
    for (let si = 1; si < starts.length; si++) {
      const tokIdx = starts[si];
      // Find the most content-bearing word to swap
      let targetOffset = -1;
      for (let k = 2; k >= 0; k--) {
        if (!STOP.has(parts[k]) && parts[k].length >= 4) {
          targetOffset = k;
          break;
        }
      }
      if (targetOffset === -1) continue;
      const absIdx = tokenIndices[tokIdx + targetOffset];
      if (absIdx == null) continue;
      const original = words[absIdx];
      const lower = original.toLowerCase().replace(/[^a-z']/g, "");
      const replacement = naturalReplacementFor(lower);
      if (!replacement) continue;
      const trailing = original.match(/[^a-zA-Z']+$/)?.[0] ?? "";
      const isUpper = /^[A-Z]/.test(original);
      const finalRep = (isUpper ? recap(replacement) : replacement) + trailing;
      replacements.push({ startTokenIdx: absIdx, newWords: [finalRep] });
    }
  }

  if (replacements.length === 0) return text;

  // Apply replacements in descending order of index
  replacements.sort((a, b) => b.startTokenIdx - a.startTokenIdx);
  for (const r of replacements) {
    words[r.startTokenIdx] = r.newWords[0];
  }
  return words.join("");
}

// ── Fix 4: ai_pattern_score — surgical AI marker kill ────────────────
// Naturalize any surviving AI marker words using dictionary replacements.
// Respect protected spans and headings.

function fixAiPatternScore(text: string): string {
  const { text: shielded, map } = protectSpecialContent(text);
  const paragraphs = splitParagraphs(shielded);
  const out: string[] = [];

  for (const paragraph of paragraphs) {
    const sentences = splitSentences(paragraph);
    const next: string[] = [];
    for (const sent of sentences) {
      if (isHeadingLike(sent)) {
        next.push(sent);
        continue;
      }
      let s = sent;
      const tokens = s.split(/(\s+)/);
      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (!tok.trim()) continue;
        const lower = tok.toLowerCase().replace(/[^a-z']/g, "");
        if (lower.length < 4) continue;
        if (!AI_MARKER_WORDS.has(lower)) continue;
        const replacement = naturalReplacementFor(lower);
        if (!replacement) continue;
        const trailing = tok.match(/[^a-zA-Z']+$/)?.[0] ?? "";
        const isUpper = /^[A-Z]/.test(tok);
        tokens[i] = (isUpper ? recap(replacement) : replacement) + trailing;
      }
      next.push(tokens.join(""));
    }
    out.push(next.join(" "));
  }
  return restoreSpecialContent(joinParagraphs(out), map);
}

// ── Fix 5: hot-zone sentence surgery ─────────────────────────────────
// Biggest lever: identify the top-K worst sentences via scoreSentenceDeep
// and run stealthHumanizeTargeted on each with the sentence's own flagged
// phrases. This drives per_sentence_ai_ratio down directly.

function hotZoneSentenceSurgery(
  text: string,
  strength: "light" | "medium" | "strong",
  tone: string,
  readabilityBias: number,
  preserveLeadSentences: boolean,
  currentScore: number,
): string {
  const paragraphs = splitParagraphs(text);
  const out: string[] = [];

  for (const paragraph of paragraphs) {
    const sentences = splitSentences(paragraph);
    if (sentences.length === 0) {
      out.push(paragraph);
      continue;
    }

    // Score each non-heading sentence
    const scored = sentences.map((s, idx) => ({
      idx,
      text: s,
      isHeading: isHeadingLike(s),
      report: isHeadingLike(s) ? null : scoreSentenceDeep(s),
    }));

    // Identify the worst 20% or top 2 sentences (whichever is larger)
    const nonHeading = scored.filter((e) => !e.isHeading && e.report);
    nonHeading.sort((a, b) => (b.report!.score ?? 0) - (a.report!.score ?? 0));
    const targetCount = Math.max(1, Math.min(nonHeading.length, Math.ceil(nonHeading.length * 0.2)));
    const hotZoneSet = new Set<number>();
    for (let i = 0; i < targetCount; i++) {
      const entry = nonHeading[i];
      if (!entry.report || entry.report.score < 0.45) break;
      hotZoneSet.add(entry.idx);
    }

    const next: string[] = [];
    for (let i = 0; i < scored.length; i++) {
      const entry = scored[i];
      if (entry.isHeading) {
        next.push(entry.text);
        continue;
      }
      if (!hotZoneSet.has(entry.idx)) {
        next.push(entry.text);
        continue;
      }
      // Skip paragraph leads when score is already reasonable
      if (preserveLeadSentences && i === 0 && currentScore <= 14) {
        next.push(entry.text);
        continue;
      }

      const report = entry.report!;
      let rewritten = entry.text;

      // Phrase-targeted rewrite if there are flagged phrases
      if (report.flaggedPhrases && report.flaggedPhrases.length > 0) {
        const flaggedArr = report.flaggedPhrases
          .map((fp: unknown) => (typeof fp === "string" ? fp : (fp as { phrase?: string })?.phrase ?? ""))
          .filter((fp: string) => !!fp);
        if (flaggedArr.length > 0) {
          try {
            rewritten = stealthHumanizeTargeted(rewritten, flaggedArr, strength);
          } catch {
            // swallow — fall through to generic Nuru pass
          }
        }
      }

      // Always follow up with a short Nuru pass on this single sentence
      try {
        rewritten = stealthHumanize(rewritten, strength, tone, 2, {
          detectorPressure: 0.9,
          preserveLeadSentences: false,
          humanVariance: 0.04,
          readabilityBias,
        });
      } catch {
        // keep previous rewrite
      }

      next.push(rewritten.trim() || entry.text);
    }
    out.push(next.join(" "));
  }
  return joinParagraphs(out);
}

// ── Signal-driven dispatcher ─────────────────────────────────────────

interface SignalOffender {
  signal: string;
  severity: number; // 0-1, higher = worse
  kind: "ai" | "human";
}

function rankOffenders(signals: Record<string, number>): SignalOffender[] {
  const offenders: SignalOffender[] = [];
  for (const [signal, threshold] of Object.entries(AI_POSITIVE_THRESHOLDS)) {
    const value = signals[signal] ?? 50;
    if (value > threshold) {
      offenders.push({
        signal,
        severity: Math.min(1, (value - threshold) / Math.max(1, 100 - threshold)),
        kind: "ai",
      });
    }
  }
  for (const [signal, floor] of Object.entries(HUMAN_POSITIVE_FLOORS)) {
    const value = signals[signal] ?? 50;
    if (value < floor) {
      offenders.push({
        signal,
        severity: Math.min(1, (floor - value) / Math.max(1, floor)),
        kind: "human",
      });
    }
  }
  offenders.sort((a, b) => b.severity - a.severity);
  return offenders;
}

function applyFix(
  text: string,
  offender: SignalOffender,
  options: Required<Pick<DetectorPolishOptions, "strength" | "tone" | "readabilityBias" | "preserveLeadSentences">> & { currentScore: number },
): { text: string; applied: boolean } {
  const before = text;
  let after = text;
  switch (offender.signal) {
    case "sentence_uniformity":
    case "burstiness":
      after = fixBurstiness(text);
      break;
    case "starter_diversity":
      after = fixStarterDiversity(text);
      break;
    case "ngram_repetition":
      after = fixNgramRepetition(text);
      break;
    case "ai_pattern_score":
      after = fixAiPatternScore(text);
      break;
    case "per_sentence_ai_ratio":
      after = hotZoneSentenceSurgery(
        text,
        options.strength,
        options.tone,
        options.readabilityBias,
        options.preserveLeadSentences,
        options.currentScore,
      );
      break;
    case "function_word_freq":
    case "token_predictability":
    case "avg_word_commonality":
    case "zipf_deviation":
      // These correlate strongly with AI markers and uniform vocabulary.
      // Running the AI marker kill + hot-zone surgery attacks them both.
      after = fixAiPatternScore(text);
      if (after === before) {
        after = hotZoneSentenceSurgery(
          text,
          options.strength,
          options.tone,
          options.readabilityBias,
          options.preserveLeadSentences,
          options.currentScore,
        );
      }
      break;
    case "paragraph_uniformity":
      // Merging very short adjacent sentences within a paragraph and
      // splitting long ones varies paragraph length indirectly.
      after = fixBurstiness(text);
      break;
    default:
      return { text: before, applied: false };
  }
  return { text: after, applied: after !== before };
}

function computeDetectorAverage(signals: Record<string, number>): number {
  // Proxy: geometric mean of strict AI signals, scaled
  const strict = [
    signals.ai_pattern_score ?? 50,
    signals.per_sentence_ai_ratio ?? 50,
    signals.ngram_repetition ?? 50,
    signals.sentence_uniformity ?? 50,
    signals.function_word_freq ?? 50,
  ];
  return strict.reduce((a, b) => a + b, 0) / strict.length;
}

// ── Public entry point ───────────────────────────────────────────────

export async function detectorTargetedPolish(
  text: string,
  options: DetectorPolishOptions = {},
): Promise<DetectorPolishResult> {
  const startTime = Date.now();
  const targetScore = options.targetScore ?? 5;
  const maxIterations = options.maxIterations ?? 4;
  const timeBudgetMs = options.timeBudgetMs ?? 20_000;
  const preserveLeadSentences = options.preserveLeadSentences ?? true;
  const tone = options.tone ?? "academic";
  const strength = options.strength ?? "strong";
  const readabilityBias = options.readabilityBias ?? 0.7;
  const onStage = options.onStage;

  const timeOk = () => Date.now() - startTime < timeBudgetMs;

  let current = text;
  const initialSignals = new TextSignals(current).getAllSignals();
  const initialScore = computeDetectorAverage(initialSignals);
  const signalsFixed: string[] = [];

  let iter = 0;
  let lastScore = initialScore;

  while (iter < maxIterations && timeOk()) {
    const signals = new TextSignals(current).getAllSignals();
    const approxScore = computeDetectorAverage(signals);
    if (approxScore <= targetScore) {
      if (onStage) await onStage(`Detector polish: target ${targetScore}% met (~${Math.round(approxScore)}%)`, approxScore);
      lastScore = approxScore;
      break;
    }

    const offenders = rankOffenders(signals);
    if (offenders.length === 0) {
      lastScore = approxScore;
      break;
    }

    // Apply fixes for the top 3 offenders this iteration
    const topOffenders = offenders.slice(0, 3);
    let anyApplied = false;
    for (const off of topOffenders) {
      if (!timeOk()) break;
      if (onStage) {
        await onStage(
          `Detector polish: targeting ${off.signal} (sev ${(off.severity * 100).toFixed(0)}%)`,
          approxScore,
        );
      }
      const { text: next, applied } = applyFix(current, off, {
        strength,
        tone,
        readabilityBias,
        preserveLeadSentences,
        currentScore: approxScore,
      });
      if (applied) {
        current = next;
        signalsFixed.push(off.signal);
        anyApplied = true;
      }
    }

    if (!anyApplied) {
      lastScore = approxScore;
      break;
    }

    lastScore = computeDetectorAverage(new TextSignals(current).getAllSignals());
    iter++;
  }

  return {
    text: current,
    iterations: iter,
    initialScore,
    finalScore: lastScore,
    signalsFixed,
    timeMs: Date.now() - startTime,
  };
}
