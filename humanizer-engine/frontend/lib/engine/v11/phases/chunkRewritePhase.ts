/**
 * Phase 4 — Sentence Rewrite (LLM optional)
 * ============================================
 * Processes each flagged sentence INDIVIDUALLY:
 *   - LLM rewrite for high-AI sentences (score > 0.4) if available
 *   - Rule-based rewrite for medium-AI sentences (0.2–0.4) or LLM fallback
 *   - Skip low-AI sentences
 *
 * Strict sentence-by-sentence: no chunking, no merging, no splitting.
 * Each sentence is rewritten in isolation and placed back at its index.
 *
 * Golden Rule: LLM only for context, flow, and realism.
 */

import type { DocumentState, Phase } from '../types';
import { isLLMAvailable, rewriteChunk } from '../services/llmService';
import { placeholdersToLLMFormat, llmFormatToPlaceholders } from '../services/protectionService';
import { checkMeaning } from '../services/validatorService';


function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Rule-based rewrite for a single sentence.
 * Varies sentence structure without splitting or merging.
 */
async function ruleBasedSentenceRewrite(sentence: string): Promise<string> {
  let s = sentence;
  const words = s.split(/\s+/);

  // For long sentences (>30 words): internally restructure by reordering clauses
  if (words.length > 30) {
    const midPoint = Math.floor(words.length / 2);
    let splitAt = -1;
    for (let j = midPoint - 5; j <= midPoint + 5 && j < words.length; j++) {
      if (j < 0) continue;
      const w = words[j].toLowerCase().replace(/[^a-z]/g, '');
      if (['and', 'but', 'which', 'while', 'although', 'however'].includes(w) || words[j].endsWith(',')) {
        splitAt = j;
        break;
      }
    }
    // Restructure within the sentence using semicolon instead of splitting
    if (splitAt > 0 && splitAt < words.length - 3) {
      const firstHalf = words.slice(0, splitAt + 1).join(' ').replace(/,\s*$/, '');
      const secondHalf = words.slice(splitAt + 1).join(' ');
      if (secondHalf.length > 10) {
        // Use semicolon to restructure, keeping as one sentence
        s = `${firstHalf}; ${secondHalf.replace(/[.!?]\s*$/, '')}.`;
      }
    }
  }

  // Vary sentence starters for short sentences
  if (words.length >= 4 && words.length < 10 && Math.random() < 0.10) {
    const starters = ['In fact, ', 'Indeed, ', 'Notably, ', 'In particular, '];
    const starter = pickRandom(starters);
    // Only add if sentence doesn't already start with a connector
    if (!/^(In|Indeed|Notably|However|Furthermore|Moreover|Additionally|Nevertheless)/i.test(s)) {
      s = starter + s[0].toLowerCase() + s.slice(1);
    }
  }

  return s;
}

export const chunkRewritePhase: Phase = {
  name: 'chunkRewrite',
  async process(state: DocumentState): Promise<DocumentState> {
    const useLLM = isLLMAvailable();
    let llmRewrites = 0;
    let ruleRewrites = 0;

    // Collect all sentences that need rewriting
    const toRewrite: { sentence: typeof state.paragraphs[0]['sentences'][0]; originalText: string }[] = [];

    for (const paragraph of state.paragraphs) {
      for (const sentence of paragraph.sentences) {
        const isHighAI = sentence.flags.includes('high-ai');
        const isMedAI = sentence.flags.includes('medium-ai');
        if (!isHighAI && !isMedAI) continue;
        toRewrite.push({ sentence, originalText: sentence.text });
      }
    }

    // Process in parallel batches of 5
    const BATCH_SIZE = 5;
    for (let i = 0; i < toRewrite.length; i += BATCH_SIZE) {
      const batch = toRewrite.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async ({ sentence, originalText }) => {
          if (sentence.score > 0.4 && useLLM) {
            const llmInput = placeholdersToLLMFormat(originalText);
            const llmOutput = await rewriteChunk(llmInput);
            let rewritten = llmFormatToPlaceholders(llmOutput);

            const meaning = checkMeaning(originalText, rewritten, 0.30);
            if (!meaning.isSafe) {
              rewritten = await ruleBasedSentenceRewrite(originalText);
              return { sentence, rewritten, type: 'rule' as const };
            }
            return { sentence, rewritten, type: 'llm' as const };
          } else {
            const rewritten = await ruleBasedSentenceRewrite(originalText);
            return { sentence, rewritten, type: 'rule' as const };
          }
        })
      );

      for (const { sentence, rewritten, type } of results) {
        sentence.text = rewritten;
        if (type === 'llm') llmRewrites++;
        else ruleRewrites++;
      }
    }

    state.logs.push(
      `[chunkRewrite] LLM rewrites: ${llmRewrites}, Rule-based rewrites: ${ruleRewrites}` +
      (useLLM ? '' : ' (LLM unavailable, all rule-based)')
    );
    return state;
  },
};
