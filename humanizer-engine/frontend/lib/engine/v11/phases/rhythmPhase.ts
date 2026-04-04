/**
 * Phase 6 — Rhythm
 * ==================
 * Target burstiness ≥ 0.7 by varying sentence lengths.
 * Human writing has natural length variation; AI writing is uniform.
 *
 * Strategy:
 *   - Measure current burstiness (std dev / mean of sentence lengths)
 *   - If below target, split long sentences or merge short ones
 *   - Occasional very short sentences for emphasis
 */

import type { DocumentState, Phase } from '../types';

const BURSTINESS_TARGET = 0.85;

/**
 * Calculate burstiness = stddev(lengths) / mean(lengths).
 */
function calcBurstiness(lengths: number[]): number {
  if (lengths.length < 2) return 1;
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (mean === 0) return 1;
  const variance = lengths.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / lengths.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Check if text fragment forms a complete sentence (has a subject-verb structure).
 */
function isCompleteSentence(text: string): boolean {
  const trimmed = text.trim();
  // Reject fragments starting with gerunds (participial phrases)
  if (/^[A-Z]?\w+ing\b/.test(trimmed) && !/^(Being|Bring|King|Ring|Sing|String|Thing|Wing)\b/i.test(trimmed)) {
    // Check if there's a main verb after the gerund phrase
    const hasMainVerb = /,\s+\w+\s+(is|are|was|were|has|have|had|does|do|did|can|could|will|would)\b/i.test(trimmed);
    if (!hasMainVerb) return false;
  }
  // Must contain at least one finite verb
  const hasVerb = /\b(is|are|was|were|has|have|had|does|do|did|can|could|will|would|shall|should|may|might|must|seems?|appears?|remains?|becomes?|proves?|shows?|makes?|takes?|gives?|gets?)\b/i.test(trimmed);
  return hasVerb;
}

/**
 * Try to split a long sentence at a natural point.
 */
function trySplit(text: string): string[] {
  const words = text.split(/\s+/);
  if (words.length < 15) return [text]; // Too short to split

  // Try comma + conjunction
  for (let i = Math.floor(words.length * 0.35); i < Math.floor(words.length * 0.65); i++) {
    const word = words[i].toLowerCase().replace(/[^a-z]/g, '');
    if (['and', 'but', 'while', 'although', 'whereas', 'however', 'yet'].includes(word)) {
      const first = words.slice(0, i).join(' ').replace(/,\s*$/, '.').trim();
      let second = words.slice(i + (word === 'and' || word === 'but' ? 1 : 0)).join(' ').trim();
      if (second.length > 5 && isCompleteSentence(second)) {
        second = second[0].toUpperCase() + second.slice(1);
        if (!/[.!?]$/.test(second)) second += '.';
        return [first, second];
      }
    }
    // Split at comma — only if second half is a complete sentence
    if (words[i].endsWith(',') && i >= 5) {
      const first = words.slice(0, i + 1).join(' ').replace(/,\s*$/, '.').trim();
      let second = words.slice(i + 1).join(' ').trim();
      if (second.length > 10 && isCompleteSentence(second)) {
        second = second[0].toUpperCase() + second.slice(1);
        if (!/[.!?]$/.test(second)) second += '.';
        return [first, second];
      }
    }
  }

  return [text];
}

/**
 * Create emphasis by occasionally making a sentence very short.
 */
function addEmphasis(sentences: string[], burstiness: number): string[] {
  if (burstiness >= BURSTINESS_TARGET || sentences.length < 4) return sentences;

  const result = [...sentences];
  // Add a short emphatic sentence after a long one
  for (let i = 0; i < result.length - 1; i++) {
    const words = result[i].split(/\s+/);
    if (words.length > 25 && Math.random() < 0.3) {
      // Insert a short confirmatory sentence
      const emphatics = [
        'The evidence confirms this.',
        'The data support this.', 'The pattern holds.',
        'The distinction is real.', 'The implication is clear.',
      ];
      result.splice(i + 1, 0, emphatics[Math.floor(Math.random() * emphatics.length)]);
      break; // Max one per paragraph
    }
  }

  return result;
}

export const rhythmPhase: Phase = {
  name: 'rhythm',
  async process(state: DocumentState): Promise<DocumentState> {
    let adjustments = 0;

    for (const paragraph of state.paragraphs) {
      let sentenceTexts = paragraph.sentences.map(s => s.text);
      const lengths = sentenceTexts.map(s => s.split(/\s+/).length);
      let burstiness = calcBurstiness(lengths);

      if (burstiness < BURSTINESS_TARGET) {
        // Try splitting the longest sentences
        const newTexts: string[] = [];
        for (const text of sentenceTexts) {
          const words = text.split(/\s+/);
          if (words.length > 20 && burstiness < BURSTINESS_TARGET) {
            const splits = trySplit(text);
            newTexts.push(...splits);
            if (splits.length > 1) adjustments++;
          } else {
            newTexts.push(text);
          }
        }
        sentenceTexts = newTexts;

        // Recalculate and try emphasis
        const newLengths = sentenceTexts.map(s => s.split(/\s+/).length);
        burstiness = calcBurstiness(newLengths);
        sentenceTexts = addEmphasis(sentenceTexts, burstiness);
      }

      // Rebuild sentences array
      paragraph.sentences = sentenceTexts.map((text, i) => ({
        id: paragraph.sentences[i]?.id ?? (paragraph.id * 1000 + i),
        text,
        originalText: paragraph.sentences[i]?.originalText ?? text,
        flags: paragraph.sentences[i]?.flags ?? [],
        score: paragraph.sentences[i]?.score ?? 0,
      }));
    }

    state.logs.push(`[rhythm] ${adjustments} sentence splits for burstiness`);
    return state;
  },
};
