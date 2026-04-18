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

const FORMAL_CONNECTORS_RE = /^(?:Furthermore|Moreover|Additionally|Consequently|Nevertheless|Nonetheless|Subsequently|Accordingly|In contrast|By contrast|As a result|In addition|For example|For instance|On the other hand|In other words|To begin with|In particular|As such|In essence|In summary|In conclusion|Therefore|However|Thus|Hence|Indeed|Notably|Specifically|Importantly|Evidently|Interestingly|Significantly|Crucially|Undeniably|Undoubtedly|Inevitably|Certainly|Clearly|Firstly|Secondly|Thirdly|Finally|Lastly|Above all|In this sense|In this regard|On this note|With this in mind|Building on this|Given this|Taken together|Taken as a whole|First and foremost|Last but not least|It is (?:important|crucial|essential|vital|worth noting|worth emphasizing|worth considering|noteworthy|imperative|critical|fundamental|evident|clear|apparent) (?:to note |to recognize |to understand |to acknowledge |to emphasize |that )?|It should be (?:noted|emphasized|highlighted|recognized|acknowledged|mentioned|stressed|pointed out) that|It must be (?:acknowledged|recognized|noted|understood|emphasized) that|It (?:can|could|may|might) be (?:argued|noted|observed|suggested|concluded|said) that)/i;

const CAUSAL_CONNECTORS = /\b(?:because of this|as a result|consequently|therefore|thus|hence|accordingly|this leads? to|this results? in|this means that|which contributes? to|which leads? to)\b/gi;

const EVALUATIVE_PHRASES = /\b(?:one of the (?:major|most important|key|primary|significant)|a (?:key|major|significant|critical|crucial|fundamental) (?:strength|weakness|factor|aspect|component|element)|plays? a (?:crucial|vital|key|significant|important|pivotal|critical) role)\b/gi;

const COMPOUND_ENUMERATION = /(?:\w+(?:,\s+\w+){2,},?\s+and\s+\w+)/gi;

const ABSTRACT_NOMINALIZATIONS = /\b(?:functioning|regulation|stabilit(?:y|ies)|well-being|effectiveness|implementation|conceptualization|operationalization|utilization|facilitation|optimization|prioritization|establishment|development|enhancement|improvement|management|assessment|evaluation|interpretation|examination|exploration|investigation|consideration|determination|representation|manifestation|transformation|modification|diversification|categorization|identification|characterization|normalization|rationalization|institutionalization|marginalization|globalization|modernization|urbanization|specialization|generalization|formalization|internalization|externalization|commercialization|professionalization|decentralization|democratization|standardization|centralization|liberalization|privatization|socialization|visualization|initialization|communication|collaboration|coordination|integration|documentation|presentation|distribution|organization|administration|configuration|participation|contribution|demonstration|experimentation|accommodation|appreciation|recommendation|achievement|advancement|alignment|allocation|application|articulation|assumption|authorization|calculation|clarification|classification|combination|compensation|confirmation|confrontation|construction|continuation|cooperation|creation|declaration|definition|delegation|description|differentiation|elimination|engagement|estimation|expectation|explanation|expression|formation|foundation|generation|indication|innovation|justification|limitation|motivation|observation|perception|performance|preparation|preservation|production|proliferation|qualification|recognition|reduction|restriction|specification|validation|variation|responsiveness|awareness|consciousness|connectedness|cohesiveness|competitiveness|inclusiveness|comprehensiveness|responsibilit(?:y|ies)|possibilit(?:y|ies)|accessibilit(?:y|ies)|sustainabilit(?:y|ies)|accountabilit(?:y|ies)|availabilit(?:y|ies)|flexibilit(?:y|ies)|complexit(?:y|ies)|diversit(?:y|ies)|capacit(?:y|ies)|vulnerabilit(?:y|ies)|productivit(?:y|ies)|creativit(?:y|ies)|adaptabilit(?:y|ies)|reliabilit(?:y|ies)|scalabilit(?:y|ies)|viabilit(?:y|ies)|necessit(?:y|ies)|priorit(?:y|ies)|continuit(?:y|ies)|ambiguit(?:y|ies)|uncertaint(?:y|ies))\b/gi;

// ═══════════════════════════════════════════════════════════════════
// PASSIVE VOICE DETECTION
// be-verb + past participle — a systematic overuse pattern in AI writing
// ═══════════════════════════════════════════════════════════════════

const PASSIVE_VOICE_RE = /\b(?:is|are|was|were|has been|have been|had been|will be|would be|could be|should be|can be|may be|might be)\s+\w+(?:ed|en)\b/gi;

// ═══════════════════════════════════════════════════════════════════
// HEDGING / EPISTEMIC PHRASE DETECTION
// Metacommentary phrases that appear at much higher rates in AI text.
// Humans write directly; AI wraps statements in epistemic scaffolding.
// ═══════════════════════════════════════════════════════════════════

const HEDGING_PHRASES_RE = /\b(?:it is (?:important|crucial|essential|necessary|vital|worth noting|worth considering|noteworthy|imperative|critical|fundamental|key) (?:to|that)|it should be (?:noted|emphasized|highlighted|recognized|acknowledged|mentioned|stressed)|it (?:can|could|may|might|must) be (?:argued|noted|observed|suggested|concluded|inferred|understood|seen)|one (?:might|could|should|must) (?:argue|consider|note|recognize|acknowledge|observe|suggest)|it is (?:generally|widely|often|commonly|broadly|frequently) (?:accepted|recognized|acknowledged|believed|understood|observed)|it (?:has|have) been (?:shown|demonstrated|established|found|observed|noted|argued|suggested) that|as (?:previously|earlier|already) (?:noted|mentioned|discussed|outlined|highlighted|described))\b/gi;

// ═══════════════════════════════════════════════════════════════════
// AI VOCABULARY DENSITY
// Words that appear at significantly higher rates in AI-generated text
// vs human-written corpora. High density = strong AI signal.
// ═══════════════════════════════════════════════════════════════════

const AI_VOCABULARY_SET = new Set([
  'utilize', 'utilizes', 'utilized', 'utilization',
  'facilitate', 'facilitates', 'facilitated', 'facilitation',
  'leverage', 'leverages', 'leveraged', 'leveraging',
  'paramount', 'pivotal', 'multifaceted', 'nuanced', 'holistic',
  'synergy', 'synergies', 'stakeholder', 'stakeholders',
  'framework', 'paradigm', 'ecosystem', 'trajectory', 'landscape',
  'transformative', 'unprecedented', 'comprehensive', 'robust',
  'innovative', 'furthermore', 'moreover', 'additionally',
  'consequently', 'subsequently', 'underpins', 'encompasses',
  'delineates', 'elucidates', 'substantiates', 'corroborates',
  'imperative', 'streamline', 'actionable', 'scalable',
  'empower', 'empowers', 'empowering', 'inclusive', 'inclusivity',
  'mitigate', 'mitigates', 'mitigated', 'optimal', 'optimize',
  'overarching', 'multifarious', 'heterogeneous', 'juxtaposition',
  'ameliorate', 'elucidate', 'promulgate', 'propagate',
  'underscore', 'underscores', 'underscored',
]);

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

  // Passive voice detection (strong AI over-use signal)
  const hasPassiveVoice = !!text.match(PASSIVE_VOICE_RE);
  if (hasPassiveVoice) aiSignals.push('passive-voice');

  // Hedging / epistemic phrase detection
  const hasHedging = !!text.match(HEDGING_PHRASES_RE);
  if (hasHedging) aiSignals.push('hedging-phrase');

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
    hasPassiveVoice,
    hasHedging,
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

  // 5. Register consistency — improved: measures uniformity of sentence-level
  //    formality instead of just counting 3 complexity types. AI text has
  //    very uniform formality across sentences; human text varies it.
  const formalityScores = profiles.map(p => {
    let score = 0;
    if (p.hasConnector)       score += 2;
    if (p.hasNominalization)  score += 2;
    if (p.hasPassiveVoice)    score += 1;
    if (p.hasHedging)         score += 2;
    if (p.hasEnumeration)     score += 1;
    return score;
  });
  let registerConsistency: number;
  if (formalityScores.length <= 1) {
    registerConsistency = 0.5;
  } else {
    const fAvg = formalityScores.reduce((a, b) => a + b, 0) / formalityScores.length;
    const fVariance = formalityScores.reduce((sum, f) => sum + Math.pow(f - fAvg, 2), 0) / formalityScores.length;
    const fCV = fAvg > 0 ? Math.sqrt(fVariance) / fAvg : 0;
    // Low CV = uniform formality = AI. Scale: CV 0 → score 1, CV ≥ 0.8 → score 0.
    registerConsistency = Math.max(0, 1 - fCV / 0.8);
  }

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

  // 8. Perplexity approximation (type-token ratio; higher = more lexical variety = human)
  const allWords = text.toLowerCase().match(/[a-z']+/g) ?? [];
  const uniqueWords = new Set(allWords);
  const perplexityScore = allWords.length > 0 ? uniqueWords.size / allWords.length : 0;

  // 9. Passive voice density
  const passiveCount = profiles.filter(p => p.hasPassiveVoice).length;
  const passiveVoiceDensity = totalSentences > 0 ? passiveCount / totalSentences : 0;

  // 10. Hedging phrase density
  const hedgingCount = profiles.filter(p => p.hasHedging).length;
  const hedgingPhraseDensity = totalSentences > 0 ? hedgingCount / totalSentences : 0;

  // 11. AI vocabulary density
  //     Ratio of known AI-typical words to total words.
  //     Calibrated so ~8% AI-word density = score 1.0.
  const aiWordCount = allWords.filter(w => AI_VOCABULARY_SET.has(w)).length;
  const aiVocabularyDensity = allWords.length > 0 ? Math.min(1, aiWordCount / (allWords.length * 0.08)) : 0;

  // Overall AI score — weighted composite, max ≈ 100.
  // Weights are tuned against Pangram's internal signal model.
  const overallAiScore = Math.round(
    (1 - sentenceLengthVariance) * 20 +   // Low length variance   = AI
    connectorDensity            * 20 +   // High formal connectors = AI
    parallelStructureScore      * 14 +   // Parallel structures    = AI
    nominalizationDensity       * 10 +   // Heavy nominalizations  = AI
    registerConsistency         * 13 +   // Uniform formality      = AI
    enumerationPatterns         *  8 +   // Perfect enumerations   = AI
    starterRepetition           *  8 +   // Repeated starters      = AI
    passiveVoiceDensity         *  4 +   // Passive overuse        = AI
    hedgingPhraseDensity        *  3     // Epistemic hedging      = AI
    // aiVocabularyDensity available in profile for display/future use
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
    passiveVoiceDensity,
    hedgingPhraseDensity,
    aiVocabularyDensity,
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
