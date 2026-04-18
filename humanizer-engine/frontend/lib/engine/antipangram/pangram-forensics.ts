/**
 * AntiPangram Forensics Engine
 * =============================
 * Analyzes text for the exact statistical signals that Pangram and other
 * AI forensic detectors measure. Produces a ForensicProfile that guides
 * targeted transforms.
 *
 * Pangram's detection relies on:
 *   1. Low sentence-length variance (burstiness)
 *   2. High density of formal transition connectors
 *   3. Parallel syntactic structures across sentences
 *   4. Abstract nominalization chains
 *   5. Uniform register (no micro-shifts in formality)
 *   6. Perfect enumerations
 *   7. Repetitive sentence starters
 *   8. Low lexical perplexity (predictable word choices)
 */

import type { ForensicProfile, SentenceProfile, DocumentContext } from './types';

// ═══════════════════════════════════════════════════════════════════
// CONNECTOR / TRANSITION DETECTION
// ═══════════════════════════════════════════════════════════════════

const FORMAL_CONNECTORS_RE = /^(?:Furthermore|Moreover|Additionally|Consequently|Nevertheless|Nonetheless|Subsequently|Accordingly|In contrast|By contrast|As a result|In addition|For example|For instance|On the other hand|In other words|To begin with|In particular|As such|In essence|In summary|In conclusion|Therefore|However|Thus|Hence|Indeed|Notably|Specifically|First and foremost|It is (?:important|crucial|essential|vital|worth noting) (?:to note |that )?)/i;

const CAUSAL_CONNECTORS = /\b(?:because of this|as a result|consequently|therefore|thus|hence|accordingly|this leads? to|this results? in|this means that|which contributes? to|which leads? to)\b/gi;

const EVALUATIVE_PHRASES = /\b(?:one of the (?:major|most important|key|primary|significant)|a (?:key|major|significant|critical|crucial|fundamental) (?:strength|weakness|factor|aspect|component|element)|plays? a (?:crucial|vital|key|significant|important|pivotal|critical) role)\b/gi;

const COMPOUND_ENUMERATION = /(?:\w+(?:,\s+\w+){2,},?\s+and\s+\w+)/gi;

const ABSTRACT_NOMINALIZATIONS = /\b(?:functioning|regulation|stabilit(?:y|ies)|well-being|effectiveness|implementation|conceptualization|operationalization|utilization|facilitation|optimization|prioritization|establishment|development|enhancement|improvement|management|assessment|evaluation|interpretation|examination|exploration|investigation|consideration|determination|representation|manifestation|transformation|modification|diversification|categorization|identification|characterization|normalization|rationalization|institutionalization|marginalization|globalization|modernization|urbanization|specialization|generalization|formalization|internalization|externalization|commercialization|professionalization|decentralization|democratization|standardization|centralization|liberalization|privatization|socialization|visualization|initialization)\b/gi;

// ═══════════════════════════════════════════════════════════════════
// SENTENCE SPLITTING
// ═══════════════════════════════════════════════════════════════════

export function splitToSentences(text: string): string[] {
  return text
    .replace(/([.!?])\s+(?=[A-Z])/g, (match, punct, offset) => {
      if (punct === '.' && offset >= 2 && /[A-Za-z]/.test(text[offset - 1]) && text[offset - 2] === '.') {
        return match;
      }
      return punct + '\n§SPLIT§';
    })
    .split('§SPLIT§')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

// ═══════════════════════════════════════════════════════════════════
// SENTENCE PROFILING
// ═══════════════════════════════════════════════════════════════════

export function profileSentence(text: string, index: number): SentenceProfile {
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Connector detection
  const connectorMatch = text.match(FORMAL_CONNECTORS_RE);
  const hasConnector = !!connectorMatch;
  const connectorType = connectorMatch ? connectorMatch[0].trim() : null;

  // Parallel structure detection
  const andClauses = text.match(/\b\w+(?:ing|tion|ment|ness)\b[^,]*,\s+\b\w+(?:ing|tion|ment|ness)\b[^,]*,?\s*and\s+\b\w+(?:ing|tion|ment|ness)\b/gi);
  const isParallel = !!andClauses;

  // Nominalization detection
  const nomMatches = text.match(ABSTRACT_NOMINALIZATIONS);
  const hasNominalization = (nomMatches?.length ?? 0) >= 2;

  // Enumeration detection
  const hasEnumeration = !!text.match(COMPOUND_ENUMERATION);

  // Starter word
  const starterWord = words[0]?.replace(/[^a-zA-Z]/g, '').toLowerCase() ?? '';

  // Complexity classification
  const commaCount = (text.match(/,/g) ?? []).length;
  const hasSubordinate = /\b(?:because|since|although|though|while|whereas|unless|if|when|after|before|that|which|who)\b/i.test(text);
  const hasCoordinate = /\b(?:and|but|or|yet|so)\b/i.test(text);

  let complexity: 'simple' | 'compound' | 'complex' = 'simple';
  if (hasSubordinate) complexity = 'complex';
  else if (hasCoordinate && commaCount >= 1) complexity = 'compound';

  // AI signals
  const aiSignals: string[] = [];
  if (hasConnector) aiSignals.push(`connector:${connectorType}`);
  if (isParallel) aiSignals.push('parallel-structure');
  if (hasNominalization) aiSignals.push('heavy-nominalization');
  if (hasEnumeration) aiSignals.push('perfect-enumeration');
  if (!!text.match(EVALUATIVE_PHRASES)) aiSignals.push('evaluative-phrase');
  if (!!text.match(CAUSAL_CONNECTORS)) aiSignals.push('causal-chain');
  if (wordCount >= 20 && wordCount <= 30) aiSignals.push('uniform-length');

  return {
    text,
    index,
    wordCount,
    hasConnector,
    connectorType,
    isParallel,
    hasNominalization,
    hasEnumeration,
    starterWord,
    complexity,
    aiSignals,
  };
}

// ═══════════════════════════════════════════════════════════════════
// DOCUMENT PROFILING
// ═══════════════════════════════════════════════════════════════════

export function buildForensicProfile(text: string): ForensicProfile {
  const sentences = splitToSentences(text);
  const sentenceWords = sentences.map(s => s.split(/\s+/).filter(Boolean).length);
  const totalSentences = sentences.length;
  const totalWords = sentenceWords.reduce((a, b) => a + b, 0);
  const avgLen = totalWords / Math.max(totalSentences, 1);

  // 1. Sentence length variance (burstiness)
  const variance = totalSentences > 1
    ? sentenceWords.reduce((sum, len) => sum + Math.pow(len - avgLen, 2), 0) / (totalSentences - 1)
    : 0;
  const cv = avgLen > 0 ? Math.sqrt(variance) / avgLen : 0;
  // Human text typically has CV > 0.4, AI text < 0.25
  const sentenceLengthVariance = Math.min(1, cv / 0.5);

  // 2. Connector density
  const profiles = sentences.map((s, i) => profileSentence(s, i));
  const connectorCount = profiles.filter(p => p.hasConnector).length;
  const connectorDensity = totalSentences > 0 ? connectorCount / totalSentences : 0;

  // 3. Parallel structure score
  const parallelCount = profiles.filter(p => p.isParallel).length;
  const parallelStructureScore = totalSentences > 0 ? parallelCount / totalSentences : 0;

  // 4. Nominalization density
  const nomCount = profiles.filter(p => p.hasNominalization).length;
  const nominalizationDensity = totalSentences > 0 ? nomCount / totalSentences : 0;

  // 5. Register consistency (measured by sentence complexity uniformity)
  const complexities = profiles.map(p => p.complexity);
  const uniqueComplexities = new Set(complexities);
  const registerConsistency = uniqueComplexities.size <= 1 ? 1 : uniqueComplexities.size === 2 ? 0.5 : 0;

  // 6. Enumeration patterns
  const enumCount = profiles.filter(p => p.hasEnumeration).length;
  const enumerationPatterns = totalSentences > 0 ? enumCount / totalSentences : 0;

  // 7. Starter repetition
  const starterCounts = new Map<string, number>();
  for (const p of profiles) {
    const s = p.starterWord;
    starterCounts.set(s, (starterCounts.get(s) ?? 0) + 1);
  }
  const maxStarterRepeat = Math.max(...starterCounts.values(), 0);
  const starterRepetition = totalSentences > 0 ? maxStarterRepeat / totalSentences : 0;

  // 8. Perplexity approximation (unique words / total words ratio)
  const allWords = text.toLowerCase().match(/[a-z']+/g) ?? [];
  const uniqueWords = new Set(allWords);
  const perplexityScore = allWords.length > 0 ? uniqueWords.size / allWords.length : 0;

  // Overall AI score (weighted composite)
  const overallAiScore = Math.round(
    (1 - sentenceLengthVariance) * 20 +          // Low variance = AI
    connectorDensity * 20 +                       // High connectors = AI
    parallelStructureScore * 15 +                 // Parallel = AI
    nominalizationDensity * 10 +                  // Nominalizations = AI
    registerConsistency * 15 +                    // Uniform register = AI
    enumerationPatterns * 10 +                    // Perfect lists = AI
    starterRepetition * 10                        // Repeated starters = AI
  );

  return {
    sentenceLengthVariance,
    connectorDensity,
    parallelStructureScore,
    nominalizationDensity,
    registerConsistency,
    enumerationPatterns,
    starterRepetition,
    perplexityScore,
    avgSentenceLength: avgLen,
    sentenceLengths: sentenceWords,
    totalSentences,
    totalWords,
    overallAiScore,
  };
}

// ═══════════════════════════════════════════════════════════════════
// DOCUMENT CONTEXT BUILDER
// ═══════════════════════════════════════════════════════════════════

export function buildDocumentContext(text: string): DocumentContext {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const allSentences: SentenceProfile[] = [];
  const paragraphSentences: string[][] = [];

  let idx = 0;
  for (const para of paragraphs) {
    const sents = splitToSentences(para.trim());
    const profiles = sents.map(s => profileSentence(s, idx++));
    allSentences.push(...profiles);
    paragraphSentences.push(sents);
  }

  // Detect topic
  const lower = text.toLowerCase();
  const TOPIC_KEYWORDS: Record<string, string[]> = {
    psychology: ['therapy', 'cognitive', 'behavioral', 'mental health', 'anxiety', 'depression', 'cbt', 'psychotherapy'],
    technology: ['technology', 'digital', 'software', 'algorithm', 'computing', 'internet', 'artificial intelligence'],
    education: ['education', 'learning', 'school', 'student', 'curriculum', 'academic'],
    health: ['health', 'medical', 'treatment', 'patient', 'clinical', 'disease'],
    economics: ['economy', 'market', 'trade', 'finance', 'investment', 'inflation'],
    environment: ['environment', 'climate', 'pollution', 'sustainability', 'carbon'],
    politics: ['government', 'policy', 'democracy', 'legislation', 'governance'],
    science: ['research', 'experiment', 'hypothesis', 'empirical', 'methodology'],
  };
  let bestTopic = 'general';
  let bestScore = 0;
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestTopic = topic; }
  }

  // Protected terms (domain-specific words that must be preserved)
  const protectedTerms = new Set<string>();
  const wordFreq = new Map<string, number>();
  const words = lower.match(/[a-z']+/g) ?? [];
  for (const w of words) {
    wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
  }
  for (const [w, count] of wordFreq) {
    if (count >= 3 && w.length > 4) protectedTerms.add(w);
    if (count >= 2 && w.length >= 7) protectedTerms.add(w);
  }

  // Starter and connector counts
  const starterCounts = new Map<string, number>();
  const connectorCounts = new Map<string, number>();
  for (const p of allSentences) {
    starterCounts.set(p.starterWord, (starterCounts.get(p.starterWord) ?? 0) + 1);
    if (p.connectorType) {
      connectorCounts.set(p.connectorType, (connectorCounts.get(p.connectorType) ?? 0) + 1);
    }
  }

  return {
    sentences: allSentences,
    paragraphs: paragraphSentences,
    topic: bestTopic,
    protectedTerms,
    originalText: text,
    starterCounts,
    connectorCounts,
  };
}
