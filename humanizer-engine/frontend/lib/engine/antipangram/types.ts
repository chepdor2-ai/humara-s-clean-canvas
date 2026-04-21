/**
 * AntiPangram Humanizer — Type Definitions
 * ==========================================
 * Premium AI-to-Human text transformation engine
 * targeting 0% detection on Pangram and similar forensic AI detectors.
 */

export interface AntiPangramConfig {
  strength: 'light' | 'medium' | 'strong';
  tone: 'academic' | 'professional' | 'casual' | 'neutral';
  preserveMeaning: boolean;
  maxIterations: number;
  targetAiScore?: number;
  detectorPressure?: number;
  preserveLeadSentence?: boolean;
  humanVariance?: number;
  readabilityBias?: number;
}

export interface ForensicProfile {
  sentenceLengthVariance: number;      // 0-1: 0 = uniform (AI), 1 = highly varied (human)
  connectorDensity: number;            // 0-1: 1 = lots of formal connectors (AI)
  parallelStructureScore: number;      // 0-1: 1 = very parallel (AI)
  nominalizationDensity: number;       // 0-1: 1 = heavy nominalizations (AI)
  registerConsistency: number;         // 0-1: 1 = uniform register (AI)
  enumerationPatterns: number;         // 0-1: 1 = perfect list parallelism (AI)
  starterRepetition: number;           // 0-1: 1 = repetitive starters (AI)
  perplexityScore: number;             // higher = more human-like word choices
  passiveVoiceDensity: number;         // 0-1: 1 = heavy passive voice usage (AI)
  hedgingPhraseDensity: number;        // 0-1: 1 = heavy epistemic hedging language (AI)
  aiVocabularyDensity: number;         // 0-1: density of known AI-typical vocabulary
  avgSentenceLength: number;
  sentenceLengths: number[];
  totalSentences: number;
  totalWords: number;
  overallAiScore: number;              // 0-100: composite AI likelihood
}

export interface SentenceProfile {
  text: string;
  index: number;
  wordCount: number;
  hasConnector: boolean;
  connectorType: string | null;
  isParallel: boolean;
  hasNominalization: boolean;
  hasEnumeration: boolean;
  starterWord: string;
  complexity: 'simple' | 'compound' | 'complex';
  aiSignals: string[];
  hasPassiveVoice: boolean;
  hasHedging: boolean;
}

export interface TransformResult {
  original: string;
  humanized: string;
  changeRatio: number;
  forensicBefore: ForensicProfile;
  forensicAfter: ForensicProfile;
  transformsApplied: string[];
}

export interface SentenceTransform {
  name: string;
  priority: number;
  apply: (sentence: string, profile: SentenceProfile, docContext: DocumentContext) => string;
}

export interface DocumentContext {
  sentences: SentenceProfile[];
  paragraphs: string[][];
  topic: string;
  protectedTerms: Set<string>;
  originalText: string;
  starterCounts: Map<string, number>;
  connectorCounts: Map<string, number>;
  tone: 'academic' | 'professional' | 'casual' | 'neutral';
}
