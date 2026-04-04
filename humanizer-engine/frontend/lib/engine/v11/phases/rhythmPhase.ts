/**
 * Phase 11 — Rhythm (Sentence-by-Sentence)
 * ==========================================
 * Achieve natural burstiness by varying sentence structure WITHIN each sentence.
 * No splitting sentences into multiple. No inserting new sentences. No merging.
 *
 * Strategy per sentence:
 *   - Reorder clauses within a sentence to vary its length/structure
 *   - Front prepositional/adverbial phrases for variety
 *   - Insert parenthetical asides within long sentences
 *   - Measure and log burstiness for diagnostics
 */

import type { DocumentState, Phase } from '../types';

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
 * Apply rhythm variation to a single sentence without changing sentence count.
 * - Long sentences: internal restructuring (clause reorder, parenthetical insertion)
 * - Medium sentences: occasional adverbial fronting
 * - Short sentences: left as-is (they contribute to burstiness naturally)
 */
function applyRhythmToSentence(text: string): string {
  const words = text.split(/\s+/);
  const wordCount = words.length;

  // Long sentences (>22 words): try to restructure internally
  if (wordCount > 22) {
    // Try fronting a trailing prepositional/adverbial phrase
    const match = text.match(
      /^(.{20,}?)\s+((?:during|throughout|within|across|despite|beyond|following|concerning|regarding|given)\s+[\w\s]{4,30})[.!?]$/i
    );
    if (match) {
      const [, main, adv] = match;
      const cleanMain = main.replace(/,\s*$/, '').trim();
      const result = `${adv[0].toUpperCase()}${adv.slice(1)}, ${cleanMain[0].toLowerCase()}${cleanMain.slice(1)}.`;
      return result;
    }

    // Try inserting a parenthetical aside after the first clause
    const commaIdx = text.indexOf(',');
    if (commaIdx > 15 && commaIdx < text.length * 0.6 && Math.random() < 0.25) {
      const asides = [
        ' — in practical terms —',
        ' — from a broader perspective —',
        ' — to be precise —',
        ' — it should be noted —',
      ];
      const aside = asides[Math.floor(Math.random() * asides.length)];
      return text.slice(0, commaIdx + 1) + aside + text.slice(commaIdx + 1);
    }
  }

  // Medium sentences (12–22 words): occasional clause reorder
  if (wordCount >= 12 && wordCount <= 22 && Math.random() < 0.20) {
    // Try moving a "because/since/as" clause to the front
    const clauseMatch = text.match(
      /^(.+?)\s+(because|since|as|given that|considering that)\s+(.+?)[.!?]$/i
    );
    if (clauseMatch) {
      const [, mainClause, connector, reason] = clauseMatch;
      const cleanMain = mainClause.replace(/,\s*$/, '').trim();
      return `${connector[0].toUpperCase()}${connector.slice(1)} ${reason.replace(/[.!?]\s*$/, '')}, ${cleanMain[0].toLowerCase()}${cleanMain.slice(1)}.`;
    }
  }

  return text;
}

export const rhythmPhase: Phase = {
  name: 'rhythm',
  async process(state: DocumentState): Promise<DocumentState> {
    let adjustments = 0;

    for (const paragraph of state.paragraphs) {
      // Process each sentence individually — no merging, splitting, or inserting
      for (const sentence of paragraph.sentences) {
        const original = sentence.text;
        sentence.text = applyRhythmToSentence(sentence.text);
        if (sentence.text !== original) adjustments++;
      }
    }

    // Log burstiness for diagnostics (measurement only, not used to change structure)
    const allLengths = state.paragraphs.flatMap(p =>
      p.sentences.map(s => s.text.split(/\s+/).length)
    );
    const burstiness = calcBurstiness(allLengths);

    state.logs.push(`[rhythm] ${adjustments} sentence-level rhythm adjustments, burstiness: ${burstiness.toFixed(2)}`);
    return state;
  },
};
