/**
 * Phase 2 — Detect
 * ==================
 * Segment text into paragraphs + sentences, score each sentence for AI
 * likelihood, and flag high-scoring sentences for rewriting.
 * Also detects and protects title/heading lines.
 */

import type { DocumentState, Phase, Paragraph, Sentence } from '../types';
import { splitIntoParagraphs, splitIntoSentences } from '../services/segmentationService';
import { scoreSentence } from '../services/scoringService';

/**
 * Detect if a sentence is likely a title/heading.
 */
function isTitleSentence(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 100) return false;
  if (/[.!?]$/.test(trimmed)) return false; // Has ending punctuation

  const words = trimmed.split(/\s+/);
  if (words.length > 12) return false; // Too long
  
  const capitalWords = words.filter(w => w.length > 0 && /^[A-Z]/.test(w)).length;
  const titleRatio = capitalWords / Math.max(words.length, 1);
  
  return titleRatio >= 0.6; // At least 60% words capitalized
}

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
        const flags: string[] = [];
        
        // Check if this is a title
        const isTitle = isTitleSentence(s);
        if (isTitle) {
          flags.push('title'); // Mark as title - phases should skip it
          return {
            id: sentenceId++,
            text: s,
            originalText: s,
            flags,
            score: 0, // Titles get 0 score since they won't be processed
          };
        }
        
        // Score normal sentences
        const score = scoreSentence(s);
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
    const titleCount = paragraphs.reduce(
      (sum, p) => sum + p.sentences.filter(s => s.flags.includes('title')).length, 0
    );
    const highCount = paragraphs.reduce(
      (sum, p) => sum + p.sentences.filter(s => s.flags.includes('high-ai')).length, 0
    );
    const medCount = paragraphs.reduce(
      (sum, p) => sum + p.sentences.filter(s => s.flags.includes('medium-ai')).length, 0
    );

    state.logs.push(
      `[detect] ${paragraphs.length} paragraphs, ${totalSentences} sentences ` +
      `(${titleCount} titles, ${highCount} high-AI, ${medCount} medium-AI)`
    );

    return state;
  },
};
