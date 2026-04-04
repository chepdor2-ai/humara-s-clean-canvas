/**
 * Phase 2 — Detect
 * ==================
 * Segment text into paragraphs + sentences, score each sentence for AI
 * likelihood, and flag high-scoring sentences for rewriting.
 */

import type { DocumentState, Phase, Paragraph, Sentence } from '../types';
import { splitIntoParagraphs, splitIntoSentences } from '../services/segmentationService';
import { scoreSentence } from '../services/scoringService';

export const detectPhase: Phase = {
  name: 'detect',
  async process(state: DocumentState): Promise<DocumentState> {
    const paragraphTexts = splitIntoParagraphs(state.currentText);
    const paragraphs: Paragraph[] = [];
    let sentenceId = 0;

    for (let pIdx = 0; pIdx < paragraphTexts.length; pIdx++) {
      const pText = paragraphTexts[pIdx];
      const sentTexts = splitIntoSentences(pText);
      const sentences: Sentence[] = sentTexts.map(s => {
        const score = scoreSentence(s);
        const flags: string[] = [];
        if (score >= 0.4) flags.push('high-ai');
        else if (score >= 0.2) flags.push('medium-ai');
        else flags.push('low-ai');

        return {
          id: sentenceId++,
          text: s,
          originalText: s,
          flags,
          score,
        };
      });

      paragraphs.push({
        id: pIdx,
        originalText: pText,
        currentText: pText,
        sentences,
        score: sentences.length > 0
          ? sentences.reduce((sum, s) => sum + s.score, 0) / sentences.length
          : 0,
      });
    }

    state.paragraphs = paragraphs;

    const totalSentences = paragraphs.reduce((sum, p) => sum + p.sentences.length, 0);
    const highCount = paragraphs.reduce(
      (sum, p) => sum + p.sentences.filter(s => s.flags.includes('high-ai')).length, 0
    );
    const medCount = paragraphs.reduce(
      (sum, p) => sum + p.sentences.filter(s => s.flags.includes('medium-ai')).length, 0
    );

    state.logs.push(
      `[detect] ${paragraphs.length} paragraphs, ${totalSentences} sentences ` +
      `(${highCount} high-AI, ${medCount} medium-AI)`
    );

    return state;
  },
};
