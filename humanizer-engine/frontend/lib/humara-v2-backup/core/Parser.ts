/**
 * Humara Parser — Lightweight NLP parsing (no external dependency)
 * 
 * Uses regex-based POS tagging to identify sentence structure
 * without requiring compromise or wink-nlp.
 */

export interface ParsedSentence {
  text: string;
  words: string[];
  wordCount: number;
  hasFirstPerson: boolean;
  hasPassiveVoice: boolean;
  startsWithTransition: boolean;
  endsWithQuestion: boolean;
  complexity: 'simple' | 'medium' | 'complex';
  clauses: string[];
}

const FIRST_PERSON_PATTERN = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/i;
const PASSIVE_PATTERN = /\b(is|are|was|were|been|being|be)\s+(being\s+)?\w+(ed|en|t)\b/i;
const TRANSITION_WORDS = [
  'moreover', 'furthermore', 'additionally', 'however', 'nevertheless',
  'consequently', 'therefore', 'thus', 'hence', 'subsequently',
  'in addition', 'as a result', 'on the other hand', 'in contrast',
  'for example', 'for instance', 'specifically', 'notably',
  'meanwhile', 'accordingly', 'similarly', 'likewise',
  'nonetheless', 'still', 'yet', 'besides', 'alternatively',
  'conversely', 'otherwise', 'indeed', 'certainly', 'undoubtedly',
  'essentially', 'fundamentally', 'importantly',
];

/** Parse a sentence into structured data */
export function parseSentence(sentence: string): ParsedSentence {
  const text = sentence.trim();
  const words = text.match(/\b\w+\b/g) || [];
  const wordCount = words.length;
  const hasFirstPerson = FIRST_PERSON_PATTERN.test(text);
  const hasPassiveVoice = PASSIVE_PATTERN.test(text);
  const lowerText = text.toLowerCase();
  const startsWithTransition = TRANSITION_WORDS.some(tw =>
    lowerText.startsWith(tw.toLowerCase() + ',') ||
    lowerText.startsWith(tw.toLowerCase() + ' ')
  );
  const endsWithQuestion = text.trimEnd().endsWith('?');

  // Estimate complexity based on clause indicators
  const clauseMarkers = (text.match(/[,;:—–]/g) || []).length;
  const subordinators = (text.match(/\b(which|that|because|although|while|whereas|since|unless|if|when|where|who|whom)\b/gi) || []).length;
  const complexityScore = clauseMarkers + subordinators;

  let complexity: 'simple' | 'medium' | 'complex';
  if (wordCount <= 10 && complexityScore <= 1) {
    complexity = 'simple';
  } else if (wordCount > 25 || complexityScore >= 3) {
    complexity = 'complex';
  } else {
    complexity = 'medium';
  }

  // Split into clauses at commas, semicolons, dashes
  const clauses = text.split(/[,;—–]\s*/).filter(c => c.trim().length > 0);

  return {
    text,
    words,
    wordCount,
    hasFirstPerson,
    hasPassiveVoice,
    startsWithTransition,
    endsWithQuestion,
    complexity,
    clauses,
  };
}

/** Detect the overall register of the input text */
export function detectRegister(sentences: ParsedSentence[]): 'formal' | 'neutral' | 'informal' {
  let formalSignals = 0;
  let informalSignals = 0;

  for (const s of sentences) {
    if (s.hasPassiveVoice) formalSignals++;
    if (s.startsWithTransition) formalSignals++;
    if (s.complexity === 'complex') formalSignals++;
    if (s.hasFirstPerson) informalSignals++;
    if (s.endsWithQuestion) informalSignals++;
    if (s.wordCount < 8) informalSignals++;
  }

  const ratio = formalSignals / (formalSignals + informalSignals + 1);
  if (ratio > 0.6) return 'formal';
  if (ratio < 0.3) return 'informal';
  return 'neutral';
}
