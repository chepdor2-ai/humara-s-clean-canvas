/**
 * Phase 5 — Sentence Polish (Non-LLM)
 * ======================================
 * Fine-grained cleanup after rewriting:
 *   - Remove filler phrases / redundancies
 *   - Fix grammar artifacts from transformations
 *   - Clean repeated words at sentence boundaries
 *   - Ensure proper capitalization and punctuation
 */

import type { DocumentState, Phase } from '../types';

// Filler phrases that can be removed entirely
const FILLER_PATTERNS: [RegExp, string][] = [
  [/\b(very|really|truly|quite|extremely|incredibly) (unique|important|significant|essential)\b/gi, '$2'],
  [/\bit is worth mentioning that\b/gi, ''],
  [/\bit should be pointed out that\b/gi, ''],
  [/\bin a manner of speaking\b/gi, ''],
  [/\bfor all intents and purposes\b/gi, ''],
  [/\bas a matter of fact,?\s*/gi, ''],
  [/\bthe fact of the matter is(?: that)?\b/gi, ''],
  [/\bneedless to say,?\s*/gi, ''],
  [/\bit goes without saying that\b/gi, ''],
  [/\bwithout a shadow of a doubt\b/gi, 'clearly'],
  [/\beach and every\b/gi, 'every'],
  [/\bfirst and foremost\b/gi, 'first'],
  [/\blast but not least\b/gi, 'finally'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bin spite of the fact that\b/gi, 'although'],
  [/\bregardless of the fact that\b/gi, 'although'],
  [/\bgiven the fact that\b/gi, 'since'],
  [/\bowing to the fact that\b/gi, 'because'],
  [/\bin the event that\b/gi, 'if'],
  [/\bprior to\b/gi, 'before'],
  [/\bsubsequent to\b/gi, 'after'],
  [/\bin close proximity to\b/gi, 'near'],
  [/\bat this point in time\b/gi, 'now'],
  [/\bduring the course of\b/gi, 'during'],
  [/\bhas the ability to\b/gi, 'can'],
  [/\bis able to\b/gi, 'can'],
  [/\bin order to\b/gi, 'to'],
  [/\bfor the purpose of\b/gi, 'to'],
  [/\bwith the exception of\b/gi, 'except'],
  [/\bon a regular basis\b/gi, 'regularly'],
  [/\bon a daily basis\b/gi, 'daily'],
  [/\ba large number of\b/gi, 'many'],
  [/\ba significant number of\b/gi, 'many'],
  [/\bthe vast majority of\b/gi, 'most'],
  [/\bin the near future\b/gi, 'soon'],
  [/\bat the present time\b/gi, 'now'],
  [/\bin the process of\b/gi, ''],
  [/\btake into account\b/gi, 'consider'],
  [/\bmake use of\b/gi, 'use'],
  [/\bcome to the conclusion\b/gi, 'conclude'],
  [/\bgive consideration to\b/gi, 'consider'],
  [/\bthe reason why is that\b/gi, 'because'],
  [/\bthere is no doubt that\b/gi, ''],
];

/**
 * Fix grammar issues from transformations.
 */
function fixGrammarArtifacts(text: string): string {
  let result = text;

  // Double spaces
  result = result.replace(/ {2,}/g, ' ');

  // Space before punctuation
  result = result.replace(/\s+([.,;:!?])/g, '$1');

  // Missing space after punctuation (but not decimals)
  result = result.replace(/([.!?])([A-Z])/g, '$1 $2');

  // Double periods
  result = result.replace(/\.{2}(?!\.)/g, '.');

  // Capitalize after sentence end
  result = result.replace(/([.!?])\s+([a-z])/g, (_m, p, l) => `${p} ${l.toUpperCase()}`);

  // Capitalize first character
  if (result.length > 0 && /[a-z]/.test(result[0])) {
    result = result[0].toUpperCase() + result.slice(1);
  }

  // Ensure sentence ends with punctuation
  if (result.length > 0 && !/[.!?]$/.test(result.trim())) {
    result = result.trim() + '.';
  }

  return result;
}

/**
 * Remove repeated words at sentence boundaries.
 * E.g., "...the problem. The problem is..." → "...the problem. It is..."
 */
function cleanBoundaryRepetitions(sentences: string[]): string[] {
  if (sentences.length < 2) return sentences;
  const result = [sentences[0]];

  for (let i = 1; i < sentences.length; i++) {
    const prevWords = sentences[i - 1].toLowerCase().split(/\s+/);
    const currWords = sentences[i].split(/\s+/);

    // Check if first 2-3 words of current match last 2-3 words of previous
    if (currWords.length >= 3 && prevWords.length >= 3) {
      const prevEnd = prevWords.slice(-3).join(' ').replace(/[.!?]/g, '');
      const currStart = currWords.slice(0, 3).join(' ').toLowerCase().replace(/[.!?]/g, '');
      if (prevEnd === currStart) {
        // Replace start with pronoun
        currWords.splice(0, 3, 'This');
        result.push(currWords.join(' '));
        continue;
      }
    }

    result.push(sentences[i]);
  }

  return result;
}

export const sentencePolishPhase: Phase = {
  name: 'sentencePolish',
  async process(state: DocumentState): Promise<DocumentState> {
    let polishCount = 0;

    for (const paragraph of state.paragraphs) {
      for (const sentence of paragraph.sentences) {
        let text = sentence.text;
        const originalText = text;

        // Apply filler removals
        for (const [pattern, replacement] of FILLER_PATTERNS) {
          text = text.replace(pattern, replacement);
        }

        // Fix grammar artifacts
        text = fixGrammarArtifacts(text);

        // Kill sentences that became empty or too short after filler removal
        // (less than 3 real words means filler removal ate the whole sentence)
        const realWords = text.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/).filter(w => w.length > 1);
        if (realWords.length < 3) {
          // Mark for removal — too short to be meaningful
          sentence.text = '';
          sentence.flags.push('killed');
          polishCount++;
          continue;
        }

        if (text !== originalText) {
          sentence.text = text;
          polishCount++;
        }
      }

      // Clean boundary repetitions within each paragraph
      const texts = paragraph.sentences.map(s => s.text);
      const cleaned = cleanBoundaryRepetitions(texts);
      for (let i = 0; i < paragraph.sentences.length; i++) {
        if (paragraph.sentences[i].text !== cleaned[i]) {
          paragraph.sentences[i].text = cleaned[i];
          polishCount++;
        }
      }
    }

    state.logs.push(`[sentencePolish] Polished ${polishCount} sentences`);
    return state;
  },
};
