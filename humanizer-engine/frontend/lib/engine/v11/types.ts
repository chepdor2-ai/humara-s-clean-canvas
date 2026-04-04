/**
 * V1.1 Pipeline — Core Types
 * ===========================
 * Shared document model used by all 7 phases.
 */

export interface Sentence {
  id: number;
  text: string;
  originalText: string;
  flags: string[];
  score: number;
}

export interface Paragraph {
  id: number;
  originalText: string;
  currentText: string;
  sentences: Sentence[];
  score: number;
}

export interface DocumentState {
  originalText: string;
  currentText: string;
  paragraphs: Paragraph[];
  protectedSpans: Record<string, string>;
  logs: string[];
  metadata?: Record<string, unknown>;
}

export interface Phase {
  name: string;
  process(state: DocumentState): Promise<DocumentState> | DocumentState;
}

export interface V11Options {
  strength?: 'light' | 'medium' | 'strong';
  tone?: string;
  strictMeaning?: boolean;
}
