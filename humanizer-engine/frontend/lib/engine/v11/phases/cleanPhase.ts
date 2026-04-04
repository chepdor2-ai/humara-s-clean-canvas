/**
 * Phase 1 — Clean
 * ==================
 * Normalize whitespace, fix encoding artifacts, standardize punctuation.
 */

import type { DocumentState, Phase } from '../types';

export const cleanPhase: Phase = {
  name: 'clean',
  async process(state: DocumentState): Promise<DocumentState> {
    let text = state.currentText;

    // Fix common encoding artifacts
    text = text
      .replace(/\u2018|\u2019/g, "'")   // Smart single quotes → straight
      .replace(/\u201C|\u201D/g, '"')   // Smart double quotes → straight
      .replace(/\u2013/g, '-')          // En-dash → hyphen
      .replace(/\u2014/g, ' - ')        // Em-dash → spaced hyphen
      .replace(/\u2026/g, '...')        // Ellipsis char → three dots
      .replace(/\u00A0/g, ' ')          // Non-breaking space → regular
      .replace(/\u200B/g, '');           // Zero-width space → remove

    // Normalize whitespace
    text = text
      .replace(/[ \t]+/g, ' ')           // Collapse horizontal whitespace
      .replace(/\n{3,}/g, '\n\n')        // Max two newlines (paragraph break)
      .replace(/^ +| +$/gm, '')          // Trim line-level whitespace
      .trim();

    // Fix double punctuation
    text = text
      .replace(/([.!?])\1+/g, '$1')     // Remove duplicate sentence-ending punct
      .replace(/,,+/g, ',')              // Remove duplicate commas
      .replace(/\s+([.,;:!?])/g, '$1');  // Remove space before punctuation

    // Ensure sentences start with uppercase after period
    text = text.replace(/([.!?])\s+([a-z])/g, (_m, punct, letter) =>
      `${punct} ${letter.toUpperCase()}`
    );

    state.currentText = text;
    state.logs.push(`[clean] Normalized text (${text.length} chars)`);
    return state;
  },
};
