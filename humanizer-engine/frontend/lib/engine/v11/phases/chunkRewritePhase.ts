/**
 * Phase 4 — Chunk Rewrite (LLM optional)
 * =========================================
 * Groups flagged sentences into chunks and applies:
 *   - LLM rewrite for high-AI chunks (score > 0.4) if available
 *   - Rule-based extended rewrite for medium-AI chunks (0.2–0.4) or LLM fallback
 *   - Skip low-AI chunks
 *
 * Golden Rule: LLM only for context, flow, and realism.
 */

import type { DocumentState, Phase } from '../types';
import { createChunks } from '../services/segmentationService';
import { isLLMAvailable, rewriteChunk } from '../services/llmService';
import { placeholdersToLLMFormat, llmFormatToPlaceholders } from '../services/protectionService';
import { checkMeaning } from '../services/validatorService';


function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Rule-based advanced rewrite for when LLM is unavailable or for medium-AI.
 * Restructures sentences: splits long ones, merges short ones, varies structure.
 */
async function ruleBasedChunkRewrite(chunk: string): Promise<string> {
  const sentences = chunk.split(/(?<=[.!?])\s+/).filter(Boolean);
  const result: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    let s = sentences[i];
    const words = s.split(/\s+/);

    // Split very long sentences (>30 words) at a comma or conjunction
    if (words.length > 30) {
      const midPoint = Math.floor(words.length / 2);
      // Look for a natural split point (comma, and, but, which, that)
      let splitAt = -1;
      for (let j = midPoint - 5; j <= midPoint + 5 && j < words.length; j++) {
        if (j < 0) continue;
        const w = words[j].toLowerCase().replace(/[^a-z]/g, '');
        if (['and', 'but', 'which', 'while', 'although', 'however'].includes(w) || words[j].endsWith(',')) {
          splitAt = j;
          break;
        }
      }
      if (splitAt > 0) {
        const firstHalf = words.slice(0, splitAt + 1).join(' ').replace(/,\s*$/, '.');
        const secondHalf = words.slice(splitAt + 1).join(' ');
        // Only split if second half forms a complete sentence:
        // Must start with a subject-like word (determiner, pronoun, proper noun, or capitalized word)
        // Must NOT start with a gerund (-ing), preposition fragment, or lowercase continuation
        const secondTrimmed = secondHalf.trim();
        const firstWord = secondTrimmed.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
        const startsWithFragment = /^(enabling|making|leading|resulting|causing|allowing|providing|ensuring|using|including|involving|requiring|following|considering|regarding|given|being|having|doing|getting|turning|running|taking|giving|setting|putting|keeping|bringing|holding|showing|serving|offering|creating|building|forming|producing|generating|driving|pushing|pulling|supporting|maintaining|establishing|developing|improving|achieving|addressing)/i.test(secondTrimmed);
        const hasVerb = /\b(is|are|was|were|has|have|had|does|do|did|can|could|will|would|shall|should|may|might|must|need|seems?|appears?|remains?|becomes?|proves?|shows?|finds?|makes?|takes?|gives?|gets?|goes?|comes?|says?|means?|keeps?|lets?|begins?|starts?|turns?|runs?|holds?|leads?|reads?|grows?|plays?|moves?|lives?|falls?|stands?|speaks?|brings?|writes?|provides?|sets?|allows?|requires?|includes?|suggests?)\b/i.test(secondTrimmed);
        if (secondHalf.length > 10 && !startsWithFragment && hasVerb) {
          // Capitalize second half
          const capitalized = secondHalf[0].toUpperCase() + secondHalf.slice(1);
          s = `${firstHalf} ${capitalized}`;
        }
      }
    }

    // Merge very short consecutive sentences (<6 words each)
    if (words.length < 6 && i + 1 < sentences.length) {
      const nextWords = sentences[i + 1].split(/\s+/);
      if (nextWords.length < 6) {
        // Join with a connector
        const connectors = [', and ', '; ', ', while ', ', yet '];
        const connector = pickRandom(connectors);
        s = s.replace(/[.!?]\s*$/, '') + connector +
            sentences[i + 1][0].toLowerCase() + sentences[i + 1].slice(1);
        i++; // Skip next since we merged it
      }
    }

    result.push(s);
  }

  return result.join(' ');
}

export const chunkRewritePhase: Phase = {
  name: 'chunkRewrite',
  async process(state: DocumentState): Promise<DocumentState> {
    const useLLM = isLLMAvailable();
    let llmRewrites = 0;
    let ruleRewrites = 0;

    for (const paragraph of state.paragraphs) {
      const sentences = paragraph.sentences;
      if (sentences.length === 0) continue;

      // Determine which sentences need chunk rewrite
      const highIds = sentences
        .filter(s => s.flags.includes('high-ai'))
        .map(s => s.id);
      const medIds = sentences
        .filter(s => s.flags.includes('medium-ai'))
        .map(s => s.id);

      // Group only flagged sentences into chunks
      const allFlaggedIds = [...highIds, ...medIds].sort((a, b) => a - b);
      if (allFlaggedIds.length === 0) continue;

      const chunks = createChunks(allFlaggedIds.map((_, i) => i), 3);

      for (const chunkIndices of chunks) {
        const chunkSentences = chunkIndices.map(ci => sentences.find(s => s.id === allFlaggedIds[ci])!).filter(Boolean);
        if (chunkSentences.length === 0) continue;

        const chunkText = chunkSentences.map(s => s.text).join(' ');
        const avgScore = chunkSentences.reduce((sum, s) => sum + s.score, 0) / chunkSentences.length;

        let rewrittenChunk: string;

        if (avgScore > 0.4 && useLLM) {
          // LLM rewrite for high-AI chunks
          const llmInput = placeholdersToLLMFormat(chunkText);
          const llmOutput = await rewriteChunk(llmInput);
          rewrittenChunk = llmFormatToPlaceholders(llmOutput);

          // Validate meaning preservation
          const meaning = checkMeaning(chunkText, rewrittenChunk, 0.30);
          if (!meaning.isSafe) {
            // LLM drifted too far, fall back to rule-based
            rewrittenChunk = await ruleBasedChunkRewrite(chunkText);
            ruleRewrites++;
          } else {
            llmRewrites++;
          }
        } else {
          // Rule-based rewrite
          rewrittenChunk = await ruleBasedChunkRewrite(chunkText);
          ruleRewrites++;
        }

        // Distribute rewritten text back to sentences
        const rewrittenSentences = rewrittenChunk.split(/(?<=[.!?])\s+/).filter(Boolean);
        for (let i = 0; i < chunkSentences.length; i++) {
          if (i < rewrittenSentences.length) {
            chunkSentences[i].text = rewrittenSentences[i];
          }
        }
        // If rewrite produced more sentences, append extras to last sentence
        if (rewrittenSentences.length > chunkSentences.length && chunkSentences.length > 0) {
          const extras = rewrittenSentences.slice(chunkSentences.length).join(' ');
          chunkSentences[chunkSentences.length - 1].text += ' ' + extras;
        }
      }
    }

    state.logs.push(
      `[chunkRewrite] LLM rewrites: ${llmRewrites}, Rule-based rewrites: ${ruleRewrites}` +
      (useLLM ? '' : ' (LLM unavailable, all rule-based)')
    );
    return state;
  },
};
