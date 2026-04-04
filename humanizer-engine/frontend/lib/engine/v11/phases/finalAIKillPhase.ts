/**
 * Phase 15 — Final AI Kill (Scorched Earth)
 * ============================================
 * GOAL: Last-pass sweep that replaces EVERY remaining AI-flagged term
 * with natural human alternatives. Nothing survives this phase.
 *
 * Also enforces:
 *   - Zero contractions (final expansion pass)
 *   - Zero first-person unless input had it
 *   - a/an agreement fixes
 *   - Double-preposition cleanup
 *
 * Sentence-by-sentence: no merging, splitting, or inserting.
 */

import type { DocumentState, Phase } from '../types';
import {
  finalAIKill,
  aggressiveRephrase,
  expandContractions,
  guardFirstPerson,
} from '@/lib/humanize-transforms';

const FIRST_PERSON_RE = /\b(?:I|me|my|mine|myself|we|us|our|ours|ourselves)\b/;

export const finalAIKillPhase: Phase = {
  name: 'finalAIKill',
  async process(state: DocumentState): Promise<DocumentState> {
    const inputHadFirstPerson = FIRST_PERSON_RE.test(state.originalText);
    let kills = 0;

    for (const paragraph of state.paragraphs) {
      for (const sentence of paragraph.sentences) {
        const before = sentence.text;

        // Scorched-earth AI term kill
        sentence.text = finalAIKill(sentence.text);

        // Aggressive rephrasing pass (catch remaining AI patterns)
        sentence.text = aggressiveRephrase(sentence.text);

        // Final contraction expansion (catch anything from earlier phases)
        sentence.text = expandContractions(sentence.text);

        // Final first-person guard
        sentence.text = guardFirstPerson(sentence.text, inputHadFirstPerson);

        // Cleanup
        sentence.text = sentence.text.replace(/ {2,}/g, ' ').trim();

        // Fix a/an agreement
        sentence.text = sentence.text.replace(/\b(a|an)\s+(\w+)/gi, (_match, article, word) => {
          const vowelStart = /^[aeiou]/i.test(word) && !/^(uni|one|once|use[ds]?|usu|ura|eur)/i.test(word);
          const hStart = /^(hour|honest|honor|heir|herb)/i.test(word);
          const shouldBeAn = vowelStart || hStart;
          const correct = shouldBeAn ? 'an' : 'a';
          const final = /^A/.test(article) ? correct.charAt(0).toUpperCase() + correct.slice(1) : correct;
          return `${final} ${word}`;
        });

        // Fix double prepositions
        sentence.text = sentence.text.replace(/\b(of|to|in|for|on|at|by|with|from|as|is|the|a|an) \1\b/gi, '$1');

        // Capitalize first letter
        if (sentence.text.length > 0 && /[a-z]/.test(sentence.text[0])) {
          sentence.text = sentence.text[0].toUpperCase() + sentence.text.slice(1);
        }

        if (sentence.text !== before) kills++;
      }
    }

    // Reassemble currentText from paragraphs
    const paragraphTexts: string[] = [];
    for (const paragraph of state.paragraphs) {
      const liveSentences = paragraph.sentences.filter(
        s => s.text.trim().length > 0 && !s.flags.includes('killed')
      );
      const assembled = liveSentences.map(s => s.text).join(' ');
      paragraph.currentText = assembled;
      if (assembled.trim()) paragraphTexts.push(assembled);
    }
    state.currentText = paragraphTexts.join('\n\n').replace(/ {2,}/g, ' ').trim();
    // Fix cross-sentence boundary spacing
    state.currentText = state.currentText.replace(/([.!?])([A-Z])/g, '$1 $2');

    state.logs.push(`[finalAIKill] ${kills} sentences scrubbed of remaining AI markers`);
    return state;
  },
};
