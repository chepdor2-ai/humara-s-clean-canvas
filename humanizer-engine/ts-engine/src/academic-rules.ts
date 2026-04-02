// Academic & Essay-Optimized Rules — ported from academic_rules.py

export const BURSTINESS_TARGET = 0.70;
export const CONTRACTION_RATE = 0.28;
export const TRANSITION_RATE = 0.30;
export const SHORTEN_RATE = 0.45;

export const ACADEMIC_TRANSITIONS: string[] = [
  "What's critical is", "The key insight here is", "This matters because",
  "In essence,", "The upshot is", "Put simply,", "At its core,",
  "The thing is,", "Look,", "Here's the reality:", "Honestly,",
  "In my analysis,", "The evidence suggests", "It turns out",
  "Notably,", "Interestingly,", "Crucially,", "Fundamentally,",
  "In other words,", "More precisely,", "That said,", "Still,",
  "What emerges is", "The challenge becomes", "This raises the question",
  "Consider this:", "Bear in mind,", "Keep in mind,", "Don't forget that",
  "One could argue", "From this perspective", "Building on this,",
  "It's worth noting", "The research indicates", "Empirically speaking,",
];

export const TRANSITIONS = ACADEMIC_TRANSITIONS;

export const AI_TRANSITIONS_TO_AVOID: string[] = [
  "furthermore,", "moreover,", "additionally,",
  "consequently,", "inevitably,", "accordingly,",
  "in conclusion,", "in summary,", "to summarize,",
  "it is important to note that", "it is crucial that",
  "the author argues", "the scholar maintains",
  "it could be argued", "one may observe",
];

export const AI_PHRASE_PATTERNS: RegExp[] = [
  /\bin fact,\b/i,
  /\bbroadly speaking,\b/i,
  /\bas previously mentioned,\b/i,
  /\bwithout question,\b/i,
  /\bthis cannot be overstated,\b/i,
];

export const CONTRACTIONS: string[] = [
  "it's", "isn't", "don't", "can't", "won't",
  "you're", "they're", "there's", "that's",
  "doesn't", "hasn't", "haven't", "wasn't",
  "weren't", "couldn't", "wouldn't", "shouldn't",
];

export const ACADEMIC_CONTRACTIONS: Record<string, string> = {
  "it is not": "it's not",
  "there is": "there's",
  "that is": "that's",
  "does not": "doesn't",
  "has not": "hasn't",
  "we have": "we've",
  "you have": "you've",
};

export const TARGET_FLESCH_MIN = 45;
export const TARGET_FLESCH_MAX = 60;

export const PROTECTED_PATTERNS: RegExp[] = [
  /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/,       // Names (John Smith)
  /\b[A-Z]{2,}\b/,                          // Acronyms
  /\b\d+%\b/,                               // Percentages
  /\b\d{4}\b/,                              // Years
  /\b[A-Za-z]+\([A-Za-z]+\)\b/,            // Technical terms with acronyms
];

export const MIN_BIGRAM_REPEAT_THRESHOLD = 3;

export const PHRASE_SUBSTITUTIONS: Record<string, string[]> = {
  "research shows": ["studies indicate", "evidence reveals", "analysis demonstrates"],
  "the study finds": ["the research indicates", "findings suggest", "results reveal"],
  "it is clear": ["it becomes apparent", "it emerges", "evidence points to"],
  "in the field": ["in academia", "among scholars", "in the discipline"],
};

// ── Additional constants (parity with Python) ──

export const SENTENCE_REORDERINGS: string[] = [
  "active_to_passive",      // Add passive voice strategically
  "subordinate_reorder",    // Reorder clauses
  "split_conjunction",      // Break compound sentences
];

export const RANDOM_SEED_VARIATION = 0.85;    // 0-1: how much variation to inject
export const USE_DETERMINISTIC_MODE = false;   // Set true for consistent results during eval

export const DISCIPLINE_KEYWORDS: Record<string, string[]> = {
  humanities: ["argues", "suggests", "contends", "demonstrates", "problematizes"],
  social_sciences: ["data shows", "correlation suggests", "regression indicates", "statistically"],
  stem: ["demonstrates", "illustrates", "validates", "empirically", "mathematical"],
};

export const MIN_VOCABULARY_DIVERSITY = 0.50;   // Type-token ratio floor
export const MAX_AI_TRANSITION_RATIO = 1.5;     // % of text that can be AI transitions
export const MAX_REPETITION_DENSITY = 5.0;      // % of repeated bigrams acceptable
export const MIN_SENTENCE_VARIETY = 0.40;       // Starting word diversity score
