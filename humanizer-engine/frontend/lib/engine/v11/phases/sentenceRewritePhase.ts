/**
 * Phase 3 — Sentence Rewrite (Non-LLM)
 * =======================================
 * Per-sentence rule-based transformation:
 *   - AI kill word/phrase replacement
 *   - Synonym swaps for formal vocabulary
 *   - Connector naturalization
 *   - Contraction insertion
 *   - Sentence starter variation
 */

import type { DocumentState, Phase } from '../types';
import {
  getSynonyms, getAIKillAlternatives, getAllAIKillPhrases,
  getAllConnectors, getConnectorAlternative, getRandomStarter,
} from '../services/dictionaryService';

// Contraction insertion DISABLED — no contractions policy
// All contractions are expanded in formatPhase as a safety net.

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// applyContractions DISABLED — no contractions policy

/**
 * Replace AI kill phrases in text.
 */
async function killAIPhrases(text: string): Promise<string> {
  let result = text;
  const phrases = await getAllAIKillPhrases();

  for (const phrase of phrases) {
    const regex = new RegExp(escapeRegex(phrase), 'gi');
    if (regex.test(result)) {
      const alts = await getAIKillAlternatives(phrase);
      if (alts.length > 0) {
        result = result.replace(regex, () => pickRandom(alts));
      }
    }
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Words that can be both verbs and nouns — skip to avoid POS mismatch
const SYNONYM_SKIP: Set<string> = new Set([
  'process', 'impact', 'approach', 'address', 'study', 'practice',
  'function', 'model', 'state', 'present', 'subject', 'object',
  'figure', 'support', 'experience', 'challenge', 'result',
  'influence', 'benefit', 'increase', 'decrease', 'set',
  'produce', 'cause', 'make', 'take', 'give', 'generate',
  'potential', 'natural', 'deep', 'machine', 'computer',
  'making', 'leading', 'enabling', 'resulting', 'allowing',
]);

/**
 * Replace formal/AI vocabulary with natural synonyms.
 * Rate: ~65% of matches are replaced (to avoid over-transformation).
 */
async function applySynonyms(text: string): Promise<string> {
  const words = text.split(/(\s+)/); // preserve whitespace
  const result: string[] = [];

  for (const token of words) {
    if (/^\s+$/.test(token)) {
      result.push(token);
      continue;
    }

    const cleanWord = token.replace(/[^a-zA-Z]/g, '');
    if (!cleanWord) {
      result.push(token);
      continue;
    }

    const syns = await getSynonyms(cleanWord);
    if (syns.length > 0 && Math.random() < 0.20 && !SYNONYM_SKIP.has(cleanWord.toLowerCase())) {
      let replacement = pickRandom(syns);
      // Preserve surrounding punctuation
      const prefix = token.match(/^[^a-zA-Z]*/)?.[0] ?? '';
      const suffix = token.match(/[^a-zA-Z]*$/)?.[0] ?? '';
      // Preserve case
      if (cleanWord[0] === cleanWord[0].toUpperCase()) {
        replacement = replacement[0].toUpperCase() + replacement.slice(1);
      }
      result.push(prefix + replacement + suffix);
    } else {
      result.push(token);
    }
  }

  return result.join('');
}

/**
 * Naturalize sentence connectors (formal → casual).
 */
async function naturalizeConnectors(text: string): Promise<string> {
  let result = text;
  const connectors = await getAllConnectors();

  for (const connector of connectors) {
    const regex = new RegExp(`^${escapeRegex(connector)}\\b`, 'i');
    if (regex.test(result)) {
      const alts = await getConnectorAlternative(connector);
      if (alts.length > 0 && Math.random() < 0.7) {
        result = result.replace(regex, pickRandom(alts));
      }
    }
  }

  return result;
}

export const sentenceRewritePhase: Phase = {
  name: 'sentenceRewrite',
  async process(state: DocumentState): Promise<DocumentState> {
    let rewriteCount = 0;

    for (const paragraph of state.paragraphs) {
      for (const sentence of paragraph.sentences) {
        // Process ALL sentences — even low-ai ones can carry detector fingerprints
        let text = sentence.text;

        // 1. Kill AI phrases
        text = await killAIPhrases(text);

        // If AI phrase replacement produced a starter-like pattern, mark struct-mod
        if (/^(keep in mind|worth noting|one thing to note|note that|notably|what matters|the point is|the key point|it bears mention|importantly)/i.test(text)) {
          sentence.flags.push('struct-mod');
        }

        // 2. Synonym swaps
        text = await applySynonyms(text);

        // 3. Connector naturalization
        text = await naturalizeConnectors(text);

        // 4. Contractions DISABLED — no contractions policy
        // text = applyContractions(text);

        // 5. Sentence starter variation for medium-AI and high-AI sentences
        if ((sentence.flags.includes('high-ai') || sentence.flags.includes('medium-ai'))
            && Math.random() < 0.12
            && !sentence.flags.includes('struct-mod')) {
          const starter = await getRandomStarter();
          // Only prepend if sentence doesn't already start with a similar transition
          if (!/^(but|so|well|in fact|notably|look)/i.test(text)) {
            text = `${starter} ${text[0].toLowerCase()}${text.slice(1)}`;
            sentence.flags.push('struct-mod');
          }
        }

        if (text !== sentence.text) {
          sentence.text = text;
          rewriteCount++;
        }
      }
    }

    state.logs.push(`[sentenceRewrite] Rule-based rewrite: ${rewriteCount} sentences modified`);
    return state;
  },
};
