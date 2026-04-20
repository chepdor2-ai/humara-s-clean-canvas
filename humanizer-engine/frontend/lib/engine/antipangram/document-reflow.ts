/**
 * AntiPangram — Document Reflow Engine
 * ======================================
 * Paragraph-level and document-level transformations that break
 * the structural uniformity that Pangram detects.
 *
 * Targets:
 *   - Paragraph structure uniformity (topic-support-conclusion)
 *   - Cross-paragraph connector patterns
 *   - Sentence length burstiness across the whole document
 *   - Starter word distribution across paragraphs
 */

import type { DocumentContext, SentenceProfile, ForensicProfile } from './types';
import { splitToSentences, profileSentence } from './pangram-forensics';
import {
  disruptConnector,
  surgicalEvaluativeRewrite,
  breakParallelStructure,
  unpackNominalizations,
  splitLongSentence,
  mergeShortSentences,
  simplifyCompoundSentence,
  applyRegisterShift,
} from './sentence-surgeon';
import { naturalizeVocabulary } from './vocabulary-naturalizer';

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

function injectBurstiness(sentences: string[], targetCV: number = 0.45): string[] {
  const result = [...sentences];
  let iterations = 0;
  const maxIterations = Math.min(sentences.length * 2, 30); // Cap at 30 to prevent slow processing on large texts
  const triedIndices = new Set<number>();

  while (computeLengthCV(result) < targetCV && iterations < maxIterations) {
    iterations++;
    const lengths = result.map(s => s.split(/\s+/).filter(Boolean).length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;

    // Find the sentence closest to average length — it's the most "uniform"
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < lengths.length; i++) {
      if (triedIndices.has(i)) continue;
      const dist = Math.abs(lengths[i] - avg);
      if (dist < bestDist && lengths[i] >= 15) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;
    triedIndices.add(bestIdx);

    // Strategy A: Try standard split
    const parts = splitLongSentence(result[bestIdx]);
    if (parts.length > 1) {
      result.splice(bestIdx, 1, ...parts);
      triedIndices.clear(); // Reset since indices shifted
      continue;
    }

    // Strategy B: Force-split at comma nearest to middle
    // But NOT if the second part starts with a participle (-ing word) or is a dependent clause
    const sent = result[bestIdx];
    const mid = Math.floor(sent.length / 2);
    const commaPositions: number[] = [];
    for (let i = 10; i < sent.length - 10; i++) {
      if (sent[i] === ',') commaPositions.push(i);
    }
    if (commaPositions.length > 0) {
      // Filter out commas that lead to fragments (participles, prepositions, relative pronouns)
      const fragmentStart = /^\s*(?:creating|making|leading|causing|driving|resulting|including|involving|allowing|enabling|providing|ensuring|which|that|where|who|whose|whom|driven|based|followed|given)\b/i;
      const validCommas = commaPositions.filter(pos => !fragmentStart.test(sent.slice(pos + 1)));

      if (validCommas.length > 0) {
        const splitPos = validCommas.reduce((best, pos) =>
          Math.abs(pos - mid) < Math.abs(best - mid) ? pos : best
        );
        const part1 = sent.slice(0, splitPos).trim() + '.';
        const part2 = sent.slice(splitPos + 1).trim();
        const p1Words = part1.split(/\s+/).length;
        const p2Words = part2.split(/\s+/).length;
        // Only force-split if both halves are substantial
        if (p1Words >= 6 && p2Words >= 6) {
          const part2Cap = part2.charAt(0).toUpperCase() + part2.slice(1);
          result.splice(bestIdx, 1, part1, part2Cap);
          triedIndices.clear();
          continue;
        }
      }
    }

    // Strategy C: Try merging two adjacent short sentences
    let merged = false;
    for (let i = 0; i < result.length - 1; i++) {
      const l1 = result[i].split(/\s+/).length;
      const l2 = result[i + 1].split(/\s+/).length;
      if (l1 <= 10 && l2 <= 10) {
        const m = mergeShortSentences(result[i], result[i + 1]);
        if (m) {
          result.splice(i, 2, m);
          merged = true;
          break;
        }
      }
    }
    // If nothing worked for this sentence, continue trying others
    if (!merged) continue;
  }

  return result;
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
    return `${ppCap}, ${mainClean.charAt(0).toLowerCase() + mainClean.slice(1)}.`;
  }

  // Try to flip a sentence starting with "The X is" or "The X are"
  const theXIsMatch = sent.match(/^The\s+(\w+(?:\s+\w+)?)\s+(is|are|was|were|has been)\s+(.+)\.?$/i);
  if (theXIsMatch) {
    const [, subject, verb, predicate] = theXIsMatch;
    // Turn "The X is Y" into "Y is what the X achieves" or "As for the X, it is Y"
    const pred = predicate.replace(/[.]$/, '').trim();
    return `As for the ${subject.trim()}, it ${verb.trim()} ${pred}.`;
  }

  // Try extracting a trailing "which/that" clause
  const whichMatch = sent.match(/^(.{20,}?),\s*(which|who)\s+(.+)\.?$/);
  if (whichMatch) {
    const [, main, rel, clause] = whichMatch;
    const clauseCap = clause.charAt(0).toUpperCase() + clause.replace(/[.]$/, '').slice(1);
    return `${clauseCap}. ${main.trim()}.`;
  }

  // Fallback: return unchanged
  return sent;
}

function diversifyStarters(sentences: string[]): string[] {
  const result = [...sentences];
  const starterCounts = new Map<string, number>();

  for (let i = 0; i < result.length; i++) {
    const words = result[i].split(/\s+/);
    const starter = words[0]?.replace(/[^a-zA-Z]/g, '').toLowerCase() ?? '';
    const count = (starterCounts.get(starter) ?? 0) + 1;
    starterCounts.set(starter, count);

    // If this starter appears more than twice, restructure
    if (count > 2 && words.length >= 7) {
      const restructured = restructureToNewStarter(result[i]);
      if (restructured !== result[i]) {
        // Update starter count for new first word
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

function disruptParagraphStructure(sentences: string[]): string[] {
  if (sentences.length < 3) return sentences;

  // Detect if first sentence is a topic sentence (definitional pattern)
  const first = sentences[0];
  const isTopicSentence = /^[A-Z][\w\s]+ (?:is|are|was|were|refers? to|can be defined as|is defined as|is a|is an)\b/i.test(first);

  if (!isTopicSentence) return sentences;

  // Strategy: Move the second or third sentence to the front occasionally
  if (sentences.length >= 4 && Math.random() < 0.4) {
    // Move a supporting detail to the front
    const result = [...sentences];
    const moveIdx = Math.random() < 0.5 ? 1 : 2;
    const moved = result.splice(moveIdx, 1)[0];
    result.unshift(moved);
    return result;
  }

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
    let sentences = splitToSentences(para);

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
      if (profile.wordCount > 22 && profile.complexity === 'complex') {
        transformed = simplifyCompoundSentence(transformed);
      }

      // 1f. Vocabulary naturalization — always apply
      transformed = naturalizeVocabulary(transformed, context.protectedTerms, intensity);

      // 1g. Register micro-shifts (deterministic, alternating by index)
      if (sIdx % 4 === 0) {
        transformed = applyRegisterShift(transformed, 'casual');
      } else if (sIdx % 4 === 2) {
        transformed = applyRegisterShift(transformed, 'formal');
      }

      // Ensure sentence starts with uppercase
      if (transformed.length > 0 && /^[a-z]/.test(transformed)) {
        transformed = transformed.charAt(0).toUpperCase() + transformed.slice(1);
      }

      return transformed;
    });

    // ── Phase 2: Paragraph-level transforms ──

    // 2a. Burstiness injection — target higher CV for more human-like variation
    if (forensic.sentenceLengthVariance < 0.45) {
      sentences = injectBurstiness(sentences, 0.45 + intensity * 0.10);
    }

    // 2b. Starter diversification
    sentences = diversifyStarters(sentences);

    // 2c. Paragraph structure disruption (deterministic by paragraph index)
    if (intensity >= 0.65 && pIdx % 3 === 1) {
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
