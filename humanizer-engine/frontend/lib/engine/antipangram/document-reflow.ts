/**
 * AntiPangram — Document Reflow Engine
 * ======================================
 * Paragraph-level transformations that break the structural uniformity
 * Pangram-family detectors look for.
 *
 * STRICT NO-SPLIT / NO-MERGE INVARIANT
 * ─────────────────────────────────────
 * After the first LLM rewrite, the document must stay at a fixed
 * sentence count. This module used to inject burstiness by splitting
 * long sentences and merging short ones (`injectBurstiness`) and to
 * reorder sentences across paragraphs (`disruptParagraphStructure`).
 * Both violate the post-LLM invariant and are now disabled.
 *
 * Burstiness is achieved instead by in-sentence clause reordering,
 * voice toggling, and LLM rewrite variance — all of which keep the
 * sentence count at 1:1.
 *
 * Targets (still active, all per-sentence):
 *   - Connector disruption
 *   - Evaluative phrase surgery
 *   - Parallel structure breaking
 *   - Nominalization unpacking
 *   - Vocabulary naturalization
 *   - Starter diversification (via in-sentence restructuring only)
 */

import type { DocumentContext, SentenceProfile, ForensicProfile } from './types';
import { splitToSentences, profileSentence } from './pangram-forensics';
import {
  disruptConnector,
  surgicalEvaluativeRewrite,
  breakParallelStructure,
  unpackNominalizations,
  simplifyCompoundSentence,
  applyRegisterShift,
} from './sentence-surgeon';
import { naturalizeVocabulary } from './vocabulary-naturalizer';
import { guardSingleSentence } from '../intelligence';

// ═══════════════════════════════════════════════════════════════════
// BURSTINESS ENGINE
// Creates human-like sentence length variation across the document.
// Human writing: CV ≥ 0.4, mix of 5-8 word and 25-35 word sentences.
// AI writing: CV ≤ 0.2, all sentences 15-25 words.
// ═══════════════════════════════════════════════════════════════════

function computeLengthCV(sentences: string[]): number {
  const lengths = sentences.map(s => s.split(/\s+/).filter(Boolean).length);
  if (lengths.length <= 1) return 0;
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (avg === 0) return 0;
  const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / (lengths.length - 1);
  return Math.sqrt(variance) / avg;
}

function splitParagraphPreservingLists(paragraph: string): string[] {
  if (!/(?:^|\n)\s*[-•]\s/m.test(paragraph)) {
    return splitToSentences(paragraph);
  }

  const lines = paragraph.split('\n').map(line => line.trim()).filter(Boolean);
  const sentences: string[] = [];
  let proseBuffer: string[] = [];

  const flushBuffer = () => {
    if (!proseBuffer.length) return;
    sentences.push(...splitToSentences(proseBuffer.join(' ').trim()));
    proseBuffer = [];
  };

  for (const line of lines) {
    if (/^[-•]\s/.test(line)) {
      flushBuffer();
      sentences.push(line);
      continue;
    }

    proseBuffer.push(line);
    if (/[:.!?]$/.test(line)) {
      flushBuffer();
    }
  }

  flushBuffer();
  return sentences;
}

/**
 * Strict no-split/no-merge pass-through. The original implementation
 * used splits and merges to drive sentence-length variance (CV) up,
 * but that violates the post-LLM sentence-count invariant. Burstiness
 * is now handled by LLM rewrite variance + in-sentence clause
 * reordering (see `simplifyCompoundSentence`, `breakParallelStructure`).
 */
function injectBurstiness(sentences: string[], _targetCV: number = 0.45): string[] {
  return [...sentences];
}

// ═══════════════════════════════════════════════════════════════════
// STARTER DIVERSIFICATION
// Ensures no single starter word appears more than twice in a paragraph.
// Pangram heavily penalizes repeated "This", "The", "It" starters.
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// STARTER DIVERSIFICATION
// Ensures no single starter word appears more than twice in a paragraph.
// Pangram heavily penalizes repeated "This", "The", "It" starters.
// Strategy: restructure the sentence so a different part comes first.
// ═══════════════════════════════════════════════════════════════

function restructureToNewStarter(sent: string): string {
  // Try to move an adverbial/prepositional phrase from the end to the front
  const ppEndMatch = sent.match(/^(.{15,}?)\s+((?:by|through|via|across|within|among|between|under|over|during|since|before|after|at|on|for)\s+[^,]{5,30})\.?\s*$/i);
  if (ppEndMatch) {
    const [, main, pp] = ppEndMatch;
    const mainClean = main.trim().replace(/[,.]$/, '');
    const ppCap = pp.charAt(0).toUpperCase() + pp.slice(1);
    const candidate = `${ppCap}, ${mainClean.charAt(0).toLowerCase() + mainClean.slice(1)}.`;
    // GARBLE CHECK: reject if the inversion produces broken grammar
    if (!isGarbledRestructure(candidate, sent)) return candidate;
  }

  // Try to flip a sentence starting with "The X is" or "The X are"
  const theXIsMatch = sent.match(/^The\s+(\w+(?:\s+\w+)?)\s+(is|are|was|were|has been)\s+(.+)\.?$/i);
  if (theXIsMatch) {
    const [, subject, verb, predicate] = theXIsMatch;
    const pred = predicate.replace(/[.]$/, '').trim();
    const candidate = `As for the ${subject.trim()}, it ${verb.trim()} ${pred}.`;
    if (!isGarbledRestructure(candidate, sent)) return candidate;
  }

  // Try extracting a trailing "which/that" clause
  const whichMatch = sent.match(/^(.{20,}?),\s*(which|who)\s+(.+)\.?$/);
  if (whichMatch) {
    const [, main, , clause] = whichMatch;
    const clauseCap = clause.charAt(0).toUpperCase() + clause.replace(/[.]$/, '').slice(1);
    const candidate = `${clauseCap}. ${main.trim()}.`;
    if (!isGarbledRestructure(candidate, sent)) return candidate;
  }

  // Fallback: return unchanged
  return sent;
}

/**
 * Check if a restructured sentence is garbled.
 * Catches broken inversions, dangling phrases, and subject-verb mismatches.
 */
function isGarbledRestructure(candidate: string, original: string): boolean {
  const words = candidate.split(/\s+/);
  // Too short or too long relative to original = likely broken
  if (words.length < 4) return true;
  if (words.length > original.split(/\s+/).length * 1.5) return true;

  // Starts with preposition + long phrase + comma + very short stub
  const commaPos = candidate.indexOf(',');
  if (commaPos > 0) {
    const before = candidate.slice(0, commaPos).trim();
    const after = candidate.slice(commaPos + 1).trim();
    // If before-comma is >3x longer than after-comma, it's a dangling inversion
    if (before.length > after.length * 3 && after.split(/\s+/).length < 5) return true;
  }

  // Broken passive: "is X by Y, he Z"
  if (/\b(?:is|are|was|were)\s+\w+ed\s+by\s+\w+\s*,\s*(?:he|she|it|they)\b/i.test(candidate)) return true;

  // Double periods
  if (/\.\./.test(candidate)) return true;

  // Sentence ending with ", SUBJECT." (dangling fragment)
  if (/,\s*(?:he|she|it|they|this)\s+\w{2,}\s*\.\s*$/.test(candidate)) {
    const lastComma = candidate.lastIndexOf(',');
    const tail = candidate.slice(lastComma + 1).trim();
    if (tail.split(/\s+/).length <= 3) return true;
  }

  // Contains "., " (double punctuation from broken join)
  if (/\.,\s/.test(candidate) && !/\bet\s+al\.,/i.test(candidate)) return true;

  return false;
}

function diversifyStarters(sentences: string[]): string[] {
  const result = [...sentences];
  const starterCounts = new Map<string, number>();

  for (let i = 0; i < result.length; i++) {
    const words = result[i].split(/\s+/);
    const starter = words[0]?.replace(/[^a-zA-Z]/g, '').toLowerCase() ?? '';
    const count = (starterCounts.get(starter) ?? 0) + 1;
    starterCounts.set(starter, count);

    // If this starter appears more than twice, restructure — then
    // collapse to a single sentence so we preserve the input count.
    if (count > 2 && words.length >= 7) {
      const raw = restructureToNewStarter(result[i]);
      const restructured = guardSingleSentence(result[i], raw);
      if (restructured !== result[i]) {
        const newStarter = restructured.split(/\s+/)[0]?.replace(/[^a-zA-Z]/g, '').toLowerCase() ?? '';
        result[i] = restructured;
        starterCounts.set(newStarter, (starterCounts.get(newStarter) ?? 0) + 1);
        continue;
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// PARAGRAPH STRUCTURE DISRUPTOR
// AI paragraphs always follow: topic sentence → support → conclusion.
// Human paragraphs vary: sometimes start with example, sometimes
// with a question, sometimes jump into evidence first.
// ═══════════════════════════════════════════════════════════════════

/**
 * STRICT NO-REORDER: sentence order within a paragraph must stay
 * identical to the input order after the first LLM rewrite. We keep
 * the function shape for back-compat but always return the input
 * unchanged. AntiPangram relies on in-sentence restructuring for
 * structural variance now.
 */
function disruptParagraphStructure(sentences: string[]): string[] {
  return sentences;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN DOCUMENT REFLOW
// Orchestrates all paragraph-level and document-level transforms.
// ═══════════════════════════════════════════════════════════════════

export function reflowDocument(
  text: string,
  context: DocumentContext,
  forensic: ForensicProfile,
  strength: 'light' | 'medium' | 'strong' = 'medium'
): string {
  const intensityMap = { light: 0.4, medium: 0.65, strong: 0.85 };
  const intensity = intensityMap[strength];

  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const reflowedParagraphs: string[] = [];

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx].trim();
    const hasBulletList = /(?:^|\n)\s*[-•]\s/m.test(para);
    let sentences = splitParagraphPreservingLists(para);

    // ── Phase 1: Sentence-level transforms ──
    sentences = sentences.map((sent, sIdx) => {
      const profile = profileSentence(sent, pIdx * 100 + sIdx);
      let transformed = sent;

      // 1a. Connector disruption (highest priority signal) — always apply, not random
      if (profile.hasConnector) {
        transformed = disruptConnector(transformed, profile);
      }

      // 1b. Evaluative phrase surgery — always apply when signals detected
      if (profile.aiSignals.includes('evaluative-phrase') || profile.aiSignals.includes('hedging')) {
        transformed = surgicalEvaluativeRewrite(transformed);
      }

      // 1c. Parallel structure breaking — apply at medium+ intensity
      if (profile.isParallel && intensity >= 0.5) {
        transformed = breakParallelStructure(transformed);
      }

      // 1d. Nominalization unpacking — apply at medium+ intensity
      if (profile.hasNominalization && intensity >= 0.5) {
        transformed = unpackNominalizations(transformed);
      }

      // 1e. Compound sentence simplification
      //     `simplifyCompoundSentence` can emit multiple sentences when
      //     breaking long compounds — we collapse back to one to preserve
      //     the post-LLM sentence-count invariant.
      if (profile.wordCount > 22 && profile.complexity === 'complex') {
        const before = transformed;
        const after = simplifyCompoundSentence(transformed);
        transformed = guardSingleSentence(before, after);
      }

      // 1f. Vocabulary naturalization — ALWAYS apply at FULL intensity for maximum change
    transformed = naturalizeVocabulary(transformed, context.protectedTerms, Math.max(intensity, 0.85));

    // 1g. Register micro-shifts (deterministic, alternating by index)
    // ACADEMIC TONE: Never apply casual shifts — only formal/scholarly variations
    // Casual shifts inject phrases like "deal with", "boost" which break academic register.
    if (context.tone === 'casual') {
      // Only apply casual shifts for explicitly casual tone
      if (sIdx % 4 === 0) {
        transformed = applyRegisterShift(transformed, 'casual');
      } else if (sIdx % 4 === 2) {
        transformed = applyRegisterShift(transformed, 'formal');
      }
    } else {
      // Academic/professional/neutral: ONLY formal shifts
      if (sIdx % 3 === 0) {
        transformed = applyRegisterShift(transformed, 'formal');
      }
    }

    // Ensure sentence starts with uppercase
    if (transformed.length > 0 && /^[a-z]/.test(transformed)) {
      transformed = transformed.charAt(0).toUpperCase() + transformed.slice(1);
    }

    return transformed;
  });

    // ── Phase 2: Paragraph-level transforms ──

    // 2a. Burstiness injection — target higher CV for more human-like variation
    if (!hasBulletList && forensic.sentenceLengthVariance < 0.45) {
      sentences = injectBurstiness(sentences, 0.45 + intensity * 0.10);
    }

    // 2b. Starter diversification
    sentences = diversifyStarters(sentences);

    // 2c. Paragraph structure disruption (deterministic by paragraph index)
    if (!hasBulletList && intensity >= 0.65 && pIdx % 3 === 1) {
      sentences = disruptParagraphStructure(sentences);
    }

    reflowedParagraphs.push(sentences.join(' '));
  }

  return reflowedParagraphs.join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════
// CROSS-PARAGRAPH DEDUPLICATION
// AI text often starts multiple paragraphs with similar patterns.
// This catches and varies them.
// ═══════════════════════════════════════════════════════════════════

export function deduplicateCrossParagraph(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  if (paragraphs.length < 2) return text;

  // Extract first sentence of each paragraph
  const firstSentences = paragraphs.map(p => {
    const sents = splitToSentences(p.trim());
    return sents[0] ?? '';
  });

  // Check for repeated structural patterns
  const patterns: string[] = firstSentences.map(s => {
    // Extract structural pattern: first 3 words
    const words = s.split(/\s+/).slice(0, 3).map(w => w.toLowerCase().replace(/[^a-z]/g, ''));
    return words.join(' ');
  });

  const seenPatterns = new Map<string, number>();
  for (let i = 0; i < patterns.length; i++) {
    const pat = patterns[i];
    if (seenPatterns.has(pat) && paragraphs[i]) {
      // This paragraph starts with a repeated pattern — vary it
      const sents = splitToSentences(paragraphs[i].trim());
      if (sents.length >= 2) {
        // Swap first two sentences
        [sents[0], sents[1]] = [sents[1], sents[0]];
        paragraphs[i] = sents.join(' ');
      }
    }
    seenPatterns.set(pat, i);
  }

  return paragraphs.join('\n\n');
}
