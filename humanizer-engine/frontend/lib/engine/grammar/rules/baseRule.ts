import type { Sentence, Issue } from '../core/types';

/**
 * Base rule interface. Every grammar/style/spelling rule must implement this.
 */
export interface Rule {
  id: string;
  description: string;
  apply(sentence: Sentence, fullText: string): Issue[];
}
