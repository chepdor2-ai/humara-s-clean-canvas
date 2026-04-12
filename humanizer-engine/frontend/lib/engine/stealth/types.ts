/**
 * Stealth Humanizer — Core Type Definitions
 * ==========================================
 * Strict TypeScript types for the self-optimizing humanizer pipeline.
 * NO contractions. NO first person. NO rhetorical questions.
 */

/* ── Text Context ─────────────────────────────────────────────────── */

export interface SentenceProfile {
  index: number;
  paragraphIndex: number;
  original: string;
  transformed: string;
  perplexity: number;
  burstiness: number;
  patternCount: number;
  ghostScore: number;
  strategy: string;
  changes: ChangeRecord[];
  reverted: boolean;
}

export interface ChangeRecord {
  type: 'lexical' | 'syntactic' | 'semantic' | 'polish';
  original: string;
  replacement: string;
  reason: string;
}

export interface TextContext {
  originalText: string;
  paragraphs: string[];
  sentences: SentenceProfile[];
  metadata: TextMetadata;
  config: StealthConfig;
}

export interface TextMetadata {
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  perplexity: number;
  burstiness: number;
  ghostScore: number;
  patternMatches: PatternMatch[];
  hasFirstPerson: boolean;
  hasCitations: boolean;
  isAcademic: boolean;
}

export interface PatternMatch {
  category: string;
  pattern: string;
  location: number;
  severity: number;
}

/* ── Configuration ────────────────────────────────────────────────── */

export interface StealthConfig {
  aggressive: boolean;
  targetGhostScore: number;
  strength: 'light' | 'medium' | 'strong';
  tone: 'neutral' | 'academic' | 'professional' | 'simple';
  strictMeaning: boolean;
  datastorePath: string;
  maxRetries: number;
  minSimilarity: number;
}

export const DEFAULT_CONFIG: StealthConfig = {
  aggressive: false,
  targetGhostScore: 0.75,
  strength: 'medium',
  tone: 'academic',
  strictMeaning: true,
  datastorePath: './data/stealth',
  maxRetries: 3,
  minSimilarity: 0.82,
};

/* ── Transformer Interface ────────────────────────────────────────── */

export interface Transformer {
  name: string;
  priority: number;
  transform(ctx: TextContext): TextContext;
}

/* ── Dictionary Types ─────────────────────────────────────────────── */

export interface DictionaryEntry {
  word: string;
  pos: string;
  synonyms: string[];
  paraphrases: string[];
  definition: string;
  frequency: number;
  examples: string[];
}

export interface PhrasePair {
  source: string;
  target: string;
  score: number;
  pos: string;
}

/* ── Adversarial Types ────────────────────────────────────────────── */

export interface TransformWeights {
  lexical: number;
  syntactic: number;
  semantic: number;
  [key: string]: number;
}

export interface AdversarialResult {
  ghostScore: number;
  detectorScores: Record<string, number>;
  weightsUsed: TransformWeights;
  timestamp: number;
}
