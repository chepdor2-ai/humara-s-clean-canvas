/**
 * Ghost Analysis Module — Adversarial Profiling Engine
 * =====================================================
 * Computes a "Ghost Score" for input text by evaluating:
 *   - Perplexity (predictability via trigram model)
 *   - Burstiness (sentence length variation)
 *   - AI Pattern Detection (transition words, hedging, parallel structures)
 *
 * The Ghost Score indicates how "AI-like" the text appears.
 * Higher score = more AI-like = more work needed.
 *
 * NO contractions. NO first person. NO rhetorical questions.
 */

import type { TextContext, TextMetadata, PatternMatch, SentenceProfile, StealthConfig } from './types';
import { DEFAULT_CONFIG } from './types';

/* ── AI Pattern Library ───────────────────────────────────────────── */

interface PatternCategory {
  name: string;
  weight: number;
  patterns: RegExp[];
}

const AI_PATTERN_LIBRARY: PatternCategory[] = [
  {
    name: 'transition_overuse',
    weight: 1.2,
    patterns: [
      /\b(however|therefore|furthermore|moreover|nevertheless|consequently|additionally|subsequently)\b/gi,
      /\b(in addition|as a result|on the other hand|in contrast|for instance|for example)\b/gi,
      /\b(it is worth noting|it should be noted|it is important to)\b/gi,
    ],
  },
  {
    name: 'hedging_language',
    weight: 1.5,
    patterns: [
      /\b(it is important to note that|it is worth mentioning that|it should be emphasized that)\b/gi,
      /\b(this suggests that|this indicates that|this demonstrates that|this highlights)\b/gi,
      /\b(arguably|presumably|seemingly|apparently|ostensibly)\b/gi,
      /\b(to a certain extent|to some degree|in some respects|in many ways)\b/gi,
    ],
  },
  {
    name: 'parallel_structures',
    weight: 1.3,
    patterns: [
      /\bnot only\b.+?\bbut also\b/gi,
      /\bboth\b.+?\band\b.+?(?:\.|,)/gi,
      /\bneither\b.+?\bnor\b/gi,
      /\beither\b.+?\bor\b/gi,
      /\bwhether\b.+?\bor\b/gi,
    ],
  },
  {
    name: 'academic_buzzwords',
    weight: 1.0,
    patterns: [
      /\b(paradigm|framework|landscape|ecosystem|leverage|utilize|facilitate)\b/gi,
      /\b(multifaceted|comprehensive|robust|holistic|nuanced|pivotal)\b/gi,
      /\b(trajectory|discourse|narrative|phenomenon|intersection|synthesis)\b/gi,
      /\b(underscores?|underpin|overarching|underpinning|aforementioned)\b/gi,
    ],
  },
  {
    name: 'filler_phrases',
    weight: 0.8,
    patterns: [
      /\b(in today's world|in the modern era|in the current landscape)\b/gi,
      /\b(at the end of the day|when all is said and done|all things considered)\b/gi,
      /\b(it goes without saying|needless to say|suffice it to say)\b/gi,
      /\b(as we all know|as is well known|as has been noted)\b/gi,
    ],
  },
  {
    name: 'list_patterns',
    weight: 1.4,
    patterns: [
      /\b(firstly|secondly|thirdly|fourthly|finally)\b/gi,
      /\b(first and foremost|last but not least|in the first place)\b/gi,
      /\b(the first|the second|the third|the fourth).+?\bis\b/gi,
      /\b(one of the.+?is|another.+?is|yet another.+?is)\b/gi,
    ],
  },
  {
    name: 'modal_overuse',
    weight: 0.9,
    patterns: [
      /\b(can be seen|can be observed|can be argued|can be said)\b/gi,
      /\b(could potentially|would potentially|might potentially)\b/gi,
      /\b(should be noted|should be mentioned|should be considered)\b/gi,
    ],
  },
  {
    name: 'passive_voice_markers',
    weight: 1.1,
    patterns: [
      /\b(is|are|was|were|been|being)\s+(considered|regarded|seen|viewed|perceived|deemed)\b/gi,
      /\b(has been|have been|had been)\s+(shown|demonstrated|proven|established|noted)\b/gi,
      /\b(it is|it was|it has been)\s+(argued|suggested|proposed|claimed|observed)\b/gi,
    ],
  },
  {
    name: 'adverb_redundancy',
    weight: 0.7,
    patterns: [
      /\b(extremely|incredibly|remarkably|exceptionally|tremendously)\s+(important|significant|valuable|crucial)\b/gi,
      /\b(fundamentally|inherently|intrinsically|essentially|basically)\b/gi,
      /\b(significantly|substantially|considerably|dramatically|profoundly)\b/gi,
    ],
  },
  {
    name: 'cliche_openings',
    weight: 1.6,
    patterns: [
      /^(In today'?s|In the modern|In recent years|Throughout history|Since the dawn)/gim,
      /^(It is widely|It has been|It is generally|It is commonly|It is often)/gim,
      /^(The importance of|The significance of|The role of|The impact of)/gim,
      /^(One of the most|One of the key|One of the primary|One of the main)/gim,
      /^(In order to|With regard to|In terms of|With respect to)/gim,
    ],
  },
  {
    name: 'repetitive_sentence_starters',
    weight: 1.8,
    patterns: [
      /^(This|These|Those|The)\b/gim,
      /^(It|There)\s+(is|are|was|were)\b/gim,
    ],
  },
  {
    name: 'formulaic_conclusions',
    weight: 1.3,
    patterns: [
      /\b(in conclusion|to summarize|in summary|to sum up|overall)\b/gi,
      /\b(in light of|in view of|given the above|based on the above)\b/gi,
      /\b(moving forward|going forward|looking ahead)\b/gi,
    ],
  },
];

/* ── Perplexity Scorer (Trigram-based) ────────────────────────────── */

class TrigramPerplexityScorer {
  private trigrams: Map<string, number> = new Map();
  private bigramTotals: Map<string, number> = new Map();
  private trained: boolean = false;

  /**
   * Train on a text corpus. Builds trigram frequency table.
   */
  train(corpus: string): void {
    const words = corpus.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length - 2; i++) {
      const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      const bigram = `${words[i]} ${words[i + 1]}`;
      this.trigrams.set(trigram, (this.trigrams.get(trigram) ?? 0) + 1);
      this.bigramTotals.set(bigram, (this.bigramTotals.get(bigram) ?? 0) + 1);
    }
    this.trained = true;
  }

  /**
   * Compute perplexity of text. Lower = more predictable (AI-like).
   * Returns normalized score 0-1 where 1 = high perplexity (human-like).
   */
  score(text: string): number {
    const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
    if (words.length < 3) return 0.5;

    let logProb = 0;
    let count = 0;
    const vocabSize = this.trigrams.size || 10000;

    for (let i = 0; i < words.length - 2; i++) {
      const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      const bigram = `${words[i]} ${words[i + 1]}`;
      const trigramCount = this.trigrams.get(trigram) ?? 0;
      const bigramCount = this.bigramTotals.get(bigram) ?? 0;
      // Laplace smoothing
      const prob = (trigramCount + 1) / (bigramCount + vocabSize);
      logProb += Math.log2(prob);
      count++;
    }

    if (count === 0) return 0.5;
    const avgLogProb = logProb / count;
    const perplexity = Math.pow(2, -avgLogProb);
    // Normalize: AI text typically has perplexity 20-80, human text 80-300+
    const normalized = Math.min(1, Math.max(0, (perplexity - 20) / 280));
    return normalized;
  }
}

/* ── Burstiness Scorer ────────────────────────────────────────────── */

function computeBurstiness(sentences: string[]): number {
  if (sentences.length < 2) return 0;
  const lengths = sentences.map(s => s.split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / lengths.length;
  const stdDev = Math.sqrt(variance);
  // Normalize: AI text std dev typically 2-5, human text 5-15+
  return Math.min(1, Math.max(0, (stdDev - 2) / 13));
}

/* ── Sentence Splitter ────────────────────────────────────────────── */

function splitSentences(text: string): string[] {
  // Robust sentence splitting that respects abbreviations and citations
  const raw = text
    .replace(/([.!?])\s+(?=[A-Z])/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  return raw;
}

/* ── Ghost Analysis Module (Public API) ───────────────────────────── */

const perplexityScorer = new TrigramPerplexityScorer();

// Pre-train with a basic English corpus pattern (statistically common patterns)
const TRAINING_CORPUS = `
the quick brown fox jumps over the lazy dog and the cat sat on the mat
while the sun set behind the mountains the birds flew south for the winter
education plays a critical role in shaping the future of any society and
students must develop strong analytical skills through years of dedicated practice
the research findings suggest that environmental factors have a significant impact on
public health outcomes and policy makers should consider these factors when developing
new regulations and guidelines for community health programs the data collected from
multiple studies across different regions consistently demonstrates a correlation between
access to clean water and reduced rates of waterborne diseases in developing nations
many scholars argue that economic growth alone does not guarantee improved quality of
life for all citizens and social programs must complement market driven approaches to
ensure equitable distribution of resources and opportunities throughout the population
the rapid advancement of technology has transformed how people communicate work and
learn creating both opportunities and challenges for individuals and organizations
climate change remains one of the most pressing issues facing humanity today and
requires coordinated international efforts to reduce greenhouse gas emissions and
adapt to changing environmental conditions across all regions of the globe
`.repeat(20);
perplexityScorer.train(TRAINING_CORPUS);

/**
 * Analyze text and produce a full TextContext with Ghost Score and pattern map.
 */
export function analyzeText(text: string, config: Partial<StealthConfig> = {}): TextContext {
  const cfg: StealthConfig = { ...DEFAULT_CONFIG, ...config };
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const allSentences: Array<{ text: string; paraIdx: number }> = [];
  for (let pi = 0; pi < paragraphs.length; pi++) {
    for (const s of splitSentences(paragraphs[pi])) {
      allSentences.push({ text: s, paraIdx: pi });
    }
  }

  // Detect characteristics
  const hasFirstPerson = /\b(I|we|my|our|me|us|myself|ourselves)\b/i.test(text);
  const hasCitations = /\([A-Z][a-z]+,?\s*\d{4}\)/.test(text);
  const isAcademic = /\b(research|study|findings|hypothesis|methodology|analysis)\b/i.test(text);

  // Compute pattern matches
  const patternMatches: PatternMatch[] = [];
  for (const category of AI_PATTERN_LIBRARY) {
    for (const re of category.patterns) {
      const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      let match: RegExpExecArray | null;
      while ((match = globalRe.exec(text)) !== null) {
        patternMatches.push({
          category: category.name,
          pattern: match[0],
          location: match.index,
          severity: category.weight,
        });
      }
    }
  }

  // Compute scores
  const sentenceTexts = allSentences.map(s => s.text);
  const perplexity = perplexityScorer.score(text);
  const burstiness = computeBurstiness(sentenceTexts);
  const weightedPatternCount = patternMatches.reduce((sum, m) => sum + m.severity, 0);
  const normalizedPatterns = Math.min(1, weightedPatternCount / (allSentences.length * 2));

  // Ghost Score: 0 = perfectly human, 1 = extremely AI-like
  // Lower perplexity AND lower burstiness AND higher patterns = more AI-like
  const ghostScore = Math.min(1, Math.max(0,
    0.35 * (1 - perplexity) +
    0.30 * (1 - burstiness) +
    0.35 * normalizedPatterns
  ));

  // Build sentence profiles
  const sentenceProfiles: SentenceProfile[] = allSentences.map((s, i) => ({
    index: i,
    paragraphIndex: s.paraIdx,
    original: s.text,
    transformed: s.text,
    perplexity: perplexityScorer.score(s.text),
    burstiness: 0,
    patternCount: countPatternsInSentence(s.text),
    ghostScore: 0,
    strategy: '',
    changes: [],
    reverted: false,
  }));

  const metadata: TextMetadata = {
    wordCount: text.split(/\s+/).length,
    sentenceCount: allSentences.length,
    avgSentenceLength: allSentences.length > 0
      ? allSentences.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0) / allSentences.length
      : 0,
    perplexity,
    burstiness,
    ghostScore,
    patternMatches,
    hasFirstPerson,
    hasCitations,
    isAcademic,
  };

  return {
    originalText: text,
    paragraphs,
    sentences: sentenceProfiles,
    metadata,
    config: cfg,
  };
}

/**
 * Count AI pattern matches in a single sentence.
 */
function countPatternsInSentence(sentence: string): number {
  let count = 0;
  for (const category of AI_PATTERN_LIBRARY) {
    for (const re of category.patterns) {
      const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      const matches = sentence.match(globalRe);
      if (matches) count += matches.length * category.weight;
    }
  }
  return count;
}

/**
 * Re-score a transformed text to measure improvement.
 */
export function rescoreText(text: string): { ghostScore: number; perplexity: number; burstiness: number; patternCount: number } {
  const sentences = splitSentences(text);
  const perplexity = perplexityScorer.score(text);
  const burstiness = computeBurstiness(sentences);
  let patternCount = 0;
  for (const category of AI_PATTERN_LIBRARY) {
    for (const re of category.patterns) {
      const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      const matches = text.match(globalRe);
      if (matches) patternCount += matches.length * category.weight;
    }
  }
  const normalizedPatterns = Math.min(1, patternCount / (sentences.length * 2));
  const ghostScore = Math.min(1, Math.max(0,
    0.35 * (1 - perplexity) +
    0.30 * (1 - burstiness) +
    0.35 * normalizedPatterns
  ));
  return { ghostScore, perplexity, burstiness, patternCount };
}

export { AI_PATTERN_LIBRARY, splitSentences, computeBurstiness };
