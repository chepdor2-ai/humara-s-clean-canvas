export type TokenKind = 'word' | 'punct' | 'number' | 'space' | 'symbol' | 'abbr';

export type POS =
  | 'PRON' | 'VERB' | 'NOUN' | 'ADV' | 'ADJ'
  | 'DET'  | 'PREP' | 'CONJ' | 'AUX' | 'PUNCT'
  | 'NUM'  | 'ABBR' | 'UNKNOWN';

export interface Token {
  text: string;
  norm: string;
  start: number;
  end: number;
  kind: TokenKind;
  pos: POS;
  lemma: string;
  features?: Record<string, string | boolean | number>;
}

export interface Sentence {
  text: string;
  start: number;
  end: number;
  tokens: Token[];
  subject: Token | null;
  mainVerb: Token | null;
  tense: 'past' | 'present' | 'future' | 'unknown';
  isPassive: boolean;
}

export type Severity = 'error' | 'warning' | 'style';

export interface Issue {
  ruleId: string;
  message: string;
  severity: Severity;
  start: number;
  end: number;
  replacements: string[];
  confidence: number;
  category: string;
  sentenceIndex: number;
  aiDetected?: boolean;
  explanation?: string;
}

export interface SentenceAnalysis {
  text: string;
  start: number;
  end: number;
  issues: Issue[];
  score: number;
  tense: string;
  isPassive: boolean;
  isFragment: boolean;
  isRunOn: boolean;
  wordCount: number;
}

export interface ScoreBreakdown {
  grammar: number;
  naturalness: number;
  clarity: number;
  flow: number;
  overall: number;
}

export interface CorrectionResult {
  input: string;
  output: string;
  issues: Issue[];
  sentences: SentenceAnalysis[];
  scores: ScoreBreakdown;
  stats: { errors: number; warnings: number; style: number };
}

export interface AnalysisContext {
  originalText: string;
  normalizedText: string;
  sentences: Sentence[];
  issues: Issue[];
  metadata?: Record<string, unknown>;
}
