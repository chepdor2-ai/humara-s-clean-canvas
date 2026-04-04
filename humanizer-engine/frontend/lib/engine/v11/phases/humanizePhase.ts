/**
 * Phase 14 — Humanization (Pre-1990 Voice + Phrasal Verbs)
 * ==========================================================
 * GOAL: Transform every sentence to sound like it was written by a
 * pre-1990 human author. Injects phrasal verbs, literary voice patterns,
 * and explanatory padding that no AI model produces.
 *
 * Sentence-by-sentence: no merging, splitting, or inserting.
 *
 * Rules enforced:
 *   - Zero contractions
 *   - Zero first-person unless present in input
 *   - Sentence count preserved
 */

import type { DocumentState, Phase } from '../types';
import {
  injectPhrasalVerbs,
  injectPre1990Voice,
  aggressiveRephrase,
  expandContractions,
  guardFirstPerson,
} from '@/lib/humanize-transforms';

const FIRST_PERSON_RE = /\b(?:I|me|my|mine|myself|we|us|our|ours|ourselves)\b/;

export const humanizePhase: Phase = {
  name: 'humanize',
  async process(state: DocumentState): Promise<DocumentState> {
    const inputHadFirstPerson = FIRST_PERSON_RE.test(state.originalText);
    let adjustments = 0;

    for (const paragraph of state.paragraphs) {
      for (const sentence of paragraph.sentences) {
        const before = sentence.text;

        // Layer 1: Phrasal verb injection (keep — adds natural human texture)
        sentence.text = injectPhrasalVerbs(sentence.text);

        // Layer 2: Pre-1990 voice — DISABLED (creates old-fashioned phrasing)
        // sentence.text = injectPre1990Voice(sentence.text);

        // Layer 3: Aggressive rephrasing — DISABLED (over-processes)
        // sentence.text = aggressiveRephrase(sentence.text);

        // Layer 4: Contraction expansion
        sentence.text = expandContractions(sentence.text);

        // Layer 4: First-person guard
        sentence.text = guardFirstPerson(sentence.text, inputHadFirstPerson);

        // Cleanup
        sentence.text = sentence.text.replace(/ {2,}/g, ' ').trim();
        if (sentence.text.length > 0 && /[a-z]/.test(sentence.text[0])) {
          sentence.text = sentence.text[0].toUpperCase() + sentence.text.slice(1);
        }

        if (sentence.text !== before) adjustments++;
      }
    }

    state.logs.push(`[humanize] ${adjustments} sentences humanized with phrasal verbs + pre-1990 voice`);
    return state;
  },
};
