/**
 * V1.1 Scoring Service
 * =====================
 * Per-sentence AI scoring using statistical signals.
 * Lightweight version of multi-detector signals for pipeline use.
 */

// Common AI marker words (high-frequency in AI-generated text)
const AI_MARKER_WORDS = new Set([
  'utilize', 'leverage', 'facilitate', 'comprehensive', 'innovative',
  'cutting-edge', 'enhance', 'optimize', 'streamline', 'paradigm',
  'furthermore', 'moreover', 'consequently', 'nevertheless', 'subsequently',
  'paramount', 'pivotal', 'integral', 'holistic', 'robust',
  'multifaceted', 'nuanced', 'overarching', 'synergy', 'dynamic',
  'meticulous', 'encompass', 'underscore', 'foster', 'delve',
  'navigate', 'landscape', 'trajectory', 'realm', 'discourse',
  'elucidate', 'exemplify', 'substantiate', 'articulate', 'cultivate',
  'tapestry', 'cornerstone', 'embark', 'endeavor', 'profound',
  'noteworthy', 'commendable', 'remarkable', 'imperative', 'crucial',
  'essential', 'significant', 'demonstrate', 'implement', 'generate',
  'transform', 'intrinsically', 'inherently', 'predominantly', 'fundamentally',
  'methodology', 'framework', 'mechanism', 'component', 'dimension',
  'perspective', 'initiative', 'phenomenon', 'implication', 'rationale',
  'scrutiny', 'empirical', 'coherent', 'tangible', 'viable',
  'conducive', 'detrimental', 'ubiquitous', 'permeate', 'propagate',
  'catalyze', 'exacerbate', 'amalgamate', 'delineate', 'juxtapose',
  'mitigate', 'perpetuate', 'alleviate', 'augment', 'proliferate',
  'dichotomy', 'ascertain', 'expedite', 'culminate', 'epitomize',
]);

// AI sentence starters
const AI_STARTERS: string[] = [
  'it is important to note',
  'it is worth noting',
  'it should be noted',
  'in today\'s world',
  'in today\'s digital',
  'in the realm of',
  'when it comes to',
  'it goes without saying',
  'it is essential to',
  'this serves as a',
  'this highlights the',
  'this underscores the',
  'this demonstrates the',
  'one cannot overstate',
  'it is crucial to',
  'in this day and age',
  'plays a crucial role',
  'plays a pivotal role',
  'plays an important role',
  'in conclusion,',
  'to summarize,',
  'in summary,',
  'as we navigate',
  'as we delve',
  'as we explore',
  'it\'s worth mentioning',
  'at the end of the day',
  'first and foremost',
  'needless to say',
  'the importance of',
  'this is particularly',
  'this is especially',
  'serves as a testament',
  'comes to the forefront',
  'raises the question',
];

// AI phrase patterns (regex)
const AI_PATTERNS: RegExp[] = [
  /\b(?:it is|it's) (?:important|crucial|essential|vital|imperative) to (?:note|understand|recognize)\b/i,
  /\bplays a (?:crucial|pivotal|vital|key|important|significant) role\b/i,
  /\bin today's (?:world|society|digital|fast-paced|ever-changing|rapidly)\b/i,
  /\b(?:serves|serve) as a (?:testament|reminder|beacon|catalyst|foundation|cornerstone)\b/i,
  /\b(?:the|this) (?:underscores|highlights|demonstrates|exemplifies|illustrates)\b/i,
  /\b(?:navigate|navigating) the (?:complexities|landscape|challenges|intricacies)\b/i,
  /\b(?:a|the) (?:myriad|plethora|multitude|wealth|tapestry) of\b/i,
  /\b(?:delve|delving|delves) (?:into|deeper)\b/i,
  /\b(?:foster|fostering|fosters) (?:a |an )?(?:sense|environment|culture|community)\b/i,
  /\bin (?:the realm|the context|terms|light) of\b/i,
  /\b(?:it can be|could be) argued that\b/i,
  /\bthe (?:fact|notion|idea|concept) that\b/i,
  /\b(?:embark|embarking|embarks) on (?:a |this |the )?(?:journey|quest|path|endeavor)\b/i,
  /\bthat being said\b/i,
  /\b(?:at the end of the day|when all is said and done)\b/i,
  /\bstands as a (?:testament|beacon|shining example)\b/i,
];

/**
 * Score a single sentence for AI likelihood (0..1).
 * Higher score = more likely AI-generated.
 */
export function scoreSentence(text: string): number {
  const lower = text.toLowerCase().trim();
  const words = lower.split(/\s+/);
  const wordCount = words.length;

  if (wordCount < 3) return 0;

  let score = 0;

  // 1. AI marker word density (max contribution 0.35)
  const markerCount = words.filter(w => AI_MARKER_WORDS.has(w.replace(/[^a-z]/g, ''))).length;
  const markerDensity = markerCount / wordCount;
  score += Math.min(markerDensity * 3, 0.35);

  // 2. AI starter match (contribution 0.25)
  for (const starter of AI_STARTERS) {
    if (lower.startsWith(starter)) {
      score += 0.25;
      break;
    }
  }

  // 3. AI pattern match (contribution 0.2 per match, max 0.3)
  let patternHits = 0;
  for (const pattern of AI_PATTERNS) {
    if (pattern.test(lower)) {
      patternHits++;
    }
  }
  score += Math.min(patternHits * 0.2, 0.3);

  // 4. Sentence length penalty — very long sentences are AI-typical (max 0.1)
  if (wordCount > 35) {
    score += Math.min((wordCount - 35) * 0.005, 0.1);
  }

  // 5. Comma density — AI tends to use many commas (max 0.1)
  const commaCount = (text.match(/,/g) || []).length;
  const commaDensity = commaCount / wordCount;
  if (commaDensity > 0.15) {
    score += Math.min((commaDensity - 0.15) * 2, 0.1);
  }

  return Math.min(score, 1);
}

/**
 * Compute an overall document AI score (average of sentence scores).
 */
export function scoreDocument(sentences: string[]): number {
  if (sentences.length === 0) return 0;
  const total = sentences.reduce((sum, s) => sum + scoreSentence(s), 0);
  return total / sentences.length;
}

/**
 * Determine which sentences need rewriting based on threshold.
 * Returns indices of sentences that score above the threshold.
 */
export function flagHighScoreSentences(
  sentences: string[],
  threshold = 0.2
): { index: number; score: number }[] {
  return sentences
    .map((s, i) => ({ index: i, score: scoreSentence(s) }))
    .filter(({ score }) => score >= threshold);
}
