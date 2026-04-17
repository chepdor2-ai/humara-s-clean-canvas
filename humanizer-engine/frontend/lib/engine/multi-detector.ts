/**
 * Multi-Detector AI Detection Engine — ported from multi_detector.py
 * 20 statistical signals + 22 detector profiles with logistic scoring.
 */

import { sentTokenize, wordTokenize } from "./utils";
import { robustSentenceSplit } from "./content-protection";

// ── Math helpers ──

function sigmoid(x: number): number { return 1.0 / (1.0 + Math.exp(-x)); }
function clamp(x: number, lo = 0, hi = 100): number { return Math.max(lo, Math.min(hi, x)); }
function mean(arr: number[]): number { return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function variance(arr: number[]): number { const m = mean(arr); return arr.length > 0 ? arr.reduce((a, x) => a + (x - m) ** 2, 0) / arr.length : 0; }
function std(arr: number[]): number { return Math.sqrt(variance(arr)); }
function cv(arr: number[]): number { const m = mean(arr); return m > 0 ? std(arr) / m : 0; }
function sigNorm(x: number, center: number, steepness: number): number { return sigmoid((x - center) * steepness) * 100; }
function plattCalibrate(score: number, a: number, b: number): number { return clamp(sigmoid(a * score + b) * 100); }

function geometricMean(arr: number[]): number {
  if (arr.length === 0) return 0;
  const logSum = arr.reduce((s, v) => s + Math.log(Math.max(v, 1e-12)), 0);
  return Math.exp(logSum / arr.length);
}

function linearRegression(x: number[], y: number[]): { slope: number; intercept: number; rSquared: number } {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };
  const mx = mean(x), my = mean(y);
  let ssxy = 0, ssxx = 0, ssyy = 0;
  for (let i = 0; i < n; i++) {
    ssxy += (x[i] - mx) * (y[i] - my);
    ssxx += (x[i] - mx) ** 2;
    ssyy += (y[i] - my) ** 2;
  }
  const slope = ssxx > 0 ? ssxy / ssxx : 0;
  const intercept = my - slope * mx;
  const rSquared = ssxx > 0 && ssyy > 0 ? (ssxy ** 2) / (ssxx * ssyy) : 0;
  return { slope, intercept, rSquared };
}

function klDivergence(p: number[], q: number[]): number {
  let kl = 0;
  for (let i = 0; i < p.length; i++) {
    if (p[i] > 0 && q[i] > 0) kl += p[i] * Math.log(p[i] / q[i]);
  }
  return kl;
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return na > 0 && nb > 0 ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// ── AI marker data ──

const AI_MARKER_WORDS = new Set([
  // Formal hedging / boosting
  "utilize", "utilise", "leverage", "facilitate", "comprehensive",
  "multifaceted", "paramount", "furthermore", "moreover", "additionally",
  "consequently", "subsequently", "nevertheless", "notwithstanding",
  "aforementioned", "henceforth", "paradigm", "methodology", "methodologies",
  "framework", "trajectory", "discourse", "dichotomy", "conundrum",
  "juxtaposition", "ramification", "underpinning", "synergy",
  // Over-used AI adjectives
  "robust", "nuanced", "salient", "ubiquitous", "pivotal",
  "intricate", "meticulous", "profound", "inherent", "overarching",
  "substantive", "efficacious", "holistic", "transformative", "innovative",
  "groundbreaking", "cutting-edge", "state-of-the-art", "noteworthy",
  // Over-used AI verbs
  "proliferate", "exacerbate", "ameliorate", "engender", "promulgate",
  "delineate", "elucidate", "illuminate", "necessitate", "perpetuate",
  "culminate", "underscore", "exemplify", "encompass", "bolster",
  "catalyze", "streamline", "optimize", "enhance", "mitigate",
  "navigate", "prioritize", "articulate", "substantiate", "corroborate",
  "disseminate", "cultivate", "ascertain", "endeavor",
  "delve", "embark", "foster", "harness", "spearhead",
  "unravel", "unveil",
  // Connector words AI overuses
  "notably", "specifically", "crucially", "importantly", "significantly",
  "essentially", "fundamentally", "arguably", "undeniably", "undoubtedly",
  "interestingly", "remarkably", "evidently",
  // Abstract nouns
  "implication", "implications", "realm", "landscape",
  "tapestry", "cornerstone", "bedrock", "linchpin", "catalyst",
  "nexus", "spectrum", "myriad", "plethora", "multitude",
]);

const AI_PHRASE_PATTERNS: RegExp[] = [
  /\bit is (?:important|crucial|essential|vital) (?:to note )?that\b/i,
  /\bplays? a (?:crucial|vital|key|significant|important|pivotal) role\b/i,
  /\ba (?:wide|broad|vast|diverse) (?:range|array|spectrum|variety) of\b/i,
  /\bin (?:order )?to\b/i,
  /\bin today'?s (?:world|society|landscape|era)\b/i,
  /\bdue to the fact that\b/i,
  /\bit (?:should|must|can) be (?:noted|argued|emphasized) that\b/i,
  /\bfirst and foremost\b/i,
  /\beach and every\b/i,
  /\bnot only .{5,40} but also\b/i,
  /\bas a result\b/i,
  /\bmoving forward\b/i,
  /\bserves? as a (?:testament|reminder|catalyst|cornerstone)\b/i,
  /\bthe (?:importance|significance|impact) of\b/i,
  /\ba (?:plethora|myriad|multitude) of\b/i,
  /\bin the (?:modern|current|contemporary) (?:era|age|world|landscape)\b/i,
  /\bwith (?:respect|regard) to\b/i,
  /\bneedless to say\b/i,
  /\bat the end of the day\b/i,
  /\bon the other hand\b/i,
  /\btaken together\b/i,
  /\ball things considered\b/i,
  /\bhaving said that\b/i,
  /\bthat being said\b/i,
  /\bin light of\b/i,
  /\bin view of\b/i,
  /\bwith that in mind\b/i,
  /\bgiven (?:that|this|these)\b/i,
  /\bfor the purpose of\b/i,
  /\bin the context of\b/i,
];

const AI_SENTENCE_STARTERS = [
  "furthermore,", "moreover,", "additionally,", "consequently,",
  "subsequently,", "nevertheless,", "notwithstanding,", "accordingly,",
  "it is important", "it is crucial", "it is essential", "it is worth noting",
  "it should be noted", "one of the most", "in today's", "in the modern",
  "this essay", "this paper", "this study", "the purpose of",
  "in conclusion,", "in summary,", "to summarize,", "as a result,",
  "for example,", "for instance,", "on the other hand,", "in other words,",
  "there are several", "there are many", "it can be seen", "it is clear",
  "looking at", "when it comes to", "when we look at", "given that",
  "despite", "while", "although", "in recent years,",
];

const FUNCTION_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "shall",
  "should", "may", "might", "must", "can", "could", "and", "but", "or",
  "nor", "for", "yet", "so", "in", "on", "at", "to", "from", "by",
  "with", "of", "as", "if", "then", "than", "that", "this", "these",
  "those", "not", "no", "also", "such", "each", "both", "all", "which",
  "who", "whom", "whose", "what", "where", "when", "how", "why", "it",
  "its", "i", "me", "my", "we", "us", "our", "you", "your", "he",
  "him", "his", "she", "her", "they", "them", "their", "about", "into",
  "through", "during", "before", "after", "above", "below", "between",
  "under", "more", "most", "other", "some", "any", "only", "very",
  "too", "just", "own", "same", "up", "down", "out", "off", "over",
  "there", "here", "now", "then", "still",
]);

const AI_FUNCTION_PROFILE: Record<string, number> = {
  "the": 0.072, "of": 0.038, "and": 0.032, "to": 0.030, "in": 0.025,
  "a": 0.022, "is": 0.020, "that": 0.016, "for": 0.013, "it": 0.012,
  "as": 0.011, "with": 0.011, "this": 0.010, "are": 0.010, "by": 0.008,
  "on": 0.008, "has": 0.008, "have": 0.007, "from": 0.006, "be": 0.006,
  "an": 0.005, "or": 0.005, "can": 0.005, "been": 0.004, "their": 0.004,
  "its": 0.004, "which": 0.004, "more": 0.004, "also": 0.004,
};

const COMMON_200 = new Set([
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
  "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
  "this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
  "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
  "so", "up", "out", "if", "about", "who", "get", "which", "go", "me",
  "when", "make", "can", "like", "time", "no", "just", "him", "know", "take",
  "people", "into", "year", "your", "good", "some", "could", "them", "see",
  "other", "than", "then", "now", "look", "only", "come", "its", "over",
  "think", "also", "back", "after", "use", "two", "how", "our", "work",
  "first", "well", "way", "even", "new", "want", "because", "any", "these",
  "give", "day", "most", "us", "is", "are", "was", "were", "been",
  "has", "had", "did", "does", "may", "might", "must", "shall", "should",
  "need", "such", "each", "more", "very", "much", "still", "own", "same",
  "down", "should", "too", "here", "where", "why", "how", "been", "before",
  "off", "must", "few", "during", "without", "between", "through", "while",
  "under", "never", "always", "sometimes", "already", "both", "another",
  "around", "enough", "again", "next", "last", "long", "great", "old", "right",
  "big", "high", "small", "large", "every", "different", "important", "part",
  "since", "against", "away", "keep", "let", "begin", "seem", "help",
  "show", "hear", "turn", "start", "might", "find", "point", "thing",
  "fact", "many", "place", "hand", "state", "world", "set", "end",
]);

const SUBORDINATORS = new Set([
  "because", "although", "though", "while", "whereas", "since", "unless",
  "if", "whether", "until", "before", "after", "whenever", "wherever",
]);

const RELATIVE_PRONOUNS = new Set(["which", "who", "whom", "whose", "that", "where", "when"]);

const HUMAN_POSITIVE_SIGNALS = new Set([
  "perplexity", "burstiness", "vocabulary_richness",
  "shannon_entropy", "readability_consistency",
  "stylometric_score", "starter_diversity", "word_length_variance",
  "spectral_flatness", "lexical_density_var", "dependency_depth",
]);

const STRICT_AI_SIGNALS = [
  "ai_pattern_score",
  "per_sentence_ai_ratio",
  "token_predictability",
  "ngram_repetition",
  "sentence_uniformity",
  "paragraph_uniformity",
  "function_word_freq",
  "avg_word_commonality",
];

const DETECTOR_VERDICT_THRESHOLDS = {
  aiGenerated: 74,
  likelyAi: 52,
  mixed: 28,
};

function classifyAiScore(aiScore: number): { verdict: string; confidence: string } {
  if (aiScore >= DETECTOR_VERDICT_THRESHOLDS.aiGenerated) {
    return { verdict: "AI-Generated", confidence: "High" };
  }
  if (aiScore >= DETECTOR_VERDICT_THRESHOLDS.likelyAi) {
    return { verdict: "Likely AI", confidence: "Medium" };
  }
  if (aiScore >= DETECTOR_VERDICT_THRESHOLDS.mixed) {
    return { verdict: "Mixed / Uncertain", confidence: "Low" };
  }
  return { verdict: "Human-Written", confidence: aiScore <= 16 ? "High" : "Medium" };
}

// ── Text Signals ──

export class TextSignals {
  text: string;
  words: string[];
  sentences: string[];
  sentWords: string[][];
  wordCount: number;
  sentenceCount: number;
  vocabSize: number;
  wordFreq: Map<string, number>;

  constructor(text: string) {
    this.text = text;
    this.words = text.toLowerCase().match(/[a-z']+/g) ?? [];
    this.sentences = robustSentenceSplit(text);
    this.sentWords = this.sentences.map((s) => s.toLowerCase().match(/[a-z']+/g) ?? []);
    this.wordCount = this.words.length;
    this.sentenceCount = Math.max(this.sentences.length, 1);
    this.wordFreq = new Map();
    for (const w of this.words) this.wordFreq.set(w, (this.wordFreq.get(w) ?? 0) + 1);
    this.vocabSize = this.wordFreq.size;
  }

  perplexity(): number {
    if (this.wordCount < 15) return 42.0;

    const N = this.wordCount;

    // (a) Unigram entropy H₁
    let H1 = 0;
    for (const count of this.wordFreq.values()) {
      const p = count / N;
      if (p > 0) H1 -= p * Math.log2(p);
    }

    // Length-adjusted center (entropy grows with ~log of text length)
    const h1_center = 5.5 + 0.8 * Math.log10(Math.max(N, 30) / 50);
    const h1_score = sigNorm(H1, h1_center, 0.8);

    // (b) Check if bigram model is reliable
    const bigrams: [string, string][] = [];
    for (let i = 0; i < N - 1; i++) {
      bigrams.push([this.words[i], this.words[i + 1]]);
    }
    const bi_freq = new Map<string, number>();
    for (const [w1, w2] of bigrams) {
      const key = w1 + "," + w2;
      bi_freq.set(key, (bi_freq.get(key) ?? 0) + 1);
    }
    const hapax_bi = [...bi_freq.values()].filter((c) => c === 1).length;
    const hapax_bi_ratio = bi_freq.size > 0 ? hapax_bi / bi_freq.size : 1.0;

    if (hapax_bi_ratio > 0.75 || N < 80) {
      // Conditional entropy is degenerate — most bigrams unique.
      // Fall back: blend unigram word entropy + character unigram entropy.
      const char_freq = new Map<string, number>();
      const text_lower = this.text.toLowerCase();
      for (const c of text_lower) {
        char_freq.set(c, (char_freq.get(c) ?? 0) + 1);
      }
      const char_total = text_lower.length;
      let char_h = 0;
      if (char_total > 0) {
        for (const count of char_freq.values()) {
          const p = count / char_total;
          if (p > 0) char_h -= p * Math.log2(p);
        }
      } else {
        char_h = 3.5;
      }
      // char_h: AI formal ≈ 4.0-4.3, Human informal ≈ 3.8-4.2, center ≈ 4.15
      const char_score = sigNorm(char_h, 4.15, 3.0);
      return clamp(h1_score * 0.55 + char_score * 0.45);
    }

    // (c) Full conditional entropy for texts with enough data
    const N_bi = bigrams.length;
    let H2_cond = 0.0;
    for (const [key, count] of bi_freq.entries()) {
      const [w1] = key.split(",");
      const p_joint = count / N_bi;
      const p_cond = count / (this.wordFreq.get(w1) ?? 1);
      H2_cond -= p_joint * (p_cond > 0 ? Math.log2(p_cond) : 0);
    }

    const ratio = H1 > 0.01 ? H2_cond / H1 : 0.5;

    const h2_center = 4.0 + 0.6 * Math.log10(Math.max(N, 50) / 80);
    const h2_score = sigNorm(H2_cond, h2_center, 0.7);
    const ratio_score = sigNorm(ratio, 0.70, 6.0);

    return clamp(h1_score * 0.25 + h2_score * 0.45 + ratio_score * 0.30);
  }

  burstiness(): number {
    if (this.sentenceCount < 4) return 40.0;

    const sent_lengths = this.sentWords.filter((ws) => ws.length > 0).map((ws) => ws.length);
    const sent_avg_wl = this.sentWords.filter((ws) => ws.length > 0).map((ws) => {
      return ws.reduce((sum, w) => sum + w.length, 0) / ws.length;
    });
    const sent_fw_ratio = this.sentWords.filter((ws) => ws.length > 0).map((ws) => {
      const fw_count = ws.filter((w) => FUNCTION_WORDS.has(w)).length;
      return fw_count / Math.max(ws.length, 1);
    });

    if (sent_lengths.length === 0) return 40.0;

    const cv_len = cv(sent_lengths);
    const cv_wl = sent_avg_wl.length > 0 ? cv(sent_avg_wl) : 0.0;
    const cv_fw = sent_fw_ratio.length > 0 ? cv(sent_fw_ratio) : 0.0;

    // Combine CVs — sentence length CV is most important
    // AI CV_len: 0.12-0.30, Human: 0.30-0.80, center: 0.28
    const len_score = sigNorm(cv_len, 0.28, 5.0);
    const wl_score = sigNorm(cv_wl, 0.12, 8.0);
    const fw_score = sigNorm(cv_fw, 0.10, 8.0);

    return clamp(len_score * 0.55 + wl_score * 0.25 + fw_score * 0.20);
  }

  vocabularyRichness(): number {
    if (this.wordCount < 15) return 45.0;

    const N = this.wordCount;
    const V = this.vocabSize;
    const V1 = [...this.wordFreq.values()].filter((c) => c === 1).length; // hapax

    // (a) Guiraud's R = V / √N
    const guiraud = V / Math.sqrt(N);
    // AI: 5.5-7.5, Human: 7.5-12, center: 7.0
    const guiraud_score = sigNorm(guiraud, 7.0, 0.6);

    // (b) Yule's K = 10⁴(M₂ - N) / N²
    const M2 = [...this.wordFreq.values()].reduce((sum, f) => sum + f * f, 0);
    const yule_k = N > 1 ? (10000.0 * (M2 - N)) / (N * N) : 0;
    // Lower K = richer vocabulary = more human
    // AI: K ≈ 80-200, Human: K ≈ 20-100, center: 100
    const yule_score = sigNorm(yule_k, 100.0, -0.015); // inverted: lower is better

    // (c) Hapax ratio
    const hapax_ratio = V > 0 ? V1 / V : 0;
    // AI: 0.45-0.60, Human: 0.60-0.85, center: 0.58
    const hapax_score = sigNorm(hapax_ratio, 0.58, 5.0);

    // (d) Honore's R = 100 * log(N) / (1 - V1/V)
    const v1_over_v = V > 0 ? V1 / V : 0.5;
    let honore: number;
    if (v1_over_v >= 0.9999) {
      honore = 100 * Math.log(N); // all unique
    } else {
      honore = (100 * Math.log(N)) / (1 - v1_over_v);
    }
    // Higher R = richer = more human
    // AI: 500-1100, Human: 1000-2500, center: 1000
    const honore_score = sigNorm(honore, 1000.0, 0.002);

    return clamp(guiraud_score * 0.30 + yule_score * 0.25 + hapax_score * 0.25 + honore_score * 0.20);
  }

  sentenceUniformity(): number {
    if (this.sentenceCount < 4) return 55.0;

    const vectors: number[][] = [];
    for (let i = 0; i < this.sentWords.length; i++) {
      const ws = this.sentWords[i];
      if (ws.length < 3) continue;
      const s_text = this.sentences[i] ?? "";
      const length = ws.length;
      const avg_wl = ws.reduce((sum, w) => sum + w.length, 0) / ws.length;
      const fw_ratio = ws.filter((w) => FUNCTION_WORDS.has(w)).length / length;
      const punct = (s_text.match(/[.,;:!?\-()]/g)?.length ?? 0) / Math.max(length, 1);
      vectors.push([length, avg_wl, fw_ratio, punct]);
    }

    if (vectors.length < 3) return 55.0;

    // Sample-based pairwise cosine similarity (cap at 50 pairs to avoid O(S²))
    let total_sim = 0.0;
    let pair_count = 0;
    const maxPairs = 50;
    if (vectors.length <= 15) {
      // Small enough for full pairwise
      for (let i = 0; i < vectors.length; i++) {
        for (let j = i + 1; j < vectors.length; j++) {
          total_sim += cosineSim(vectors[i], vectors[j]);
          pair_count++;
        }
      }
    } else {
      // Sample random pairs
      for (let p = 0; p < maxPairs; p++) {
        const i = Math.floor(Math.random() * vectors.length);
        let j = Math.floor(Math.random() * (vectors.length - 1));
        if (j >= i) j++;
        total_sim += cosineSim(vectors[i], vectors[j]);
        pair_count++;
      }
    }

    const mean_sim = pair_count > 0 ? total_sim / pair_count : 0.5;

    // AI: mean_sim ≈ 0.92-0.99, Human: 0.80-0.94, center: 0.95
    const uniformity = sigNorm(mean_sim, 0.95, 25.0);
    return clamp(uniformity);
  }

  aiPatternScore(): number {
    if (this.wordCount < 10) return 0.0;

    // A — Marker words (weighted by word_count)
    let markerCount = 0;
    for (const w of this.words) if (AI_MARKER_WORDS.has(w)) markerCount++;
    const markerDensity = markerCount / this.wordCount;

    // B — Phrase patterns (weighted by sentence_count)
    let phraseHits = 0;
    const lower = this.text.toLowerCase();
    for (const pattern of AI_PHRASE_PATTERNS) if (pattern.test(lower)) phraseHits++;
    const phraseDensity = phraseHits / Math.max(this.sentenceCount, 1);

    // C — AI sentence starters
    let starterHits = 0;
    for (const sent of this.sentences) {
      const sl = sent.trim().toLowerCase();
      if (AI_SENTENCE_STARTERS.some((s) => sl.startsWith(s))) {
        starterHits++;
      }
    }
    const starterRatio = starterHits / Math.max(this.sentenceCount, 1);

    // D — Consecutive formal connectors (2+ in a row is very AI)
    let consecutiveBonus = 0;
    for (let i = 0; i < this.sentences.length - 1; i++) {
      const slA = this.sentences[i].trim().toLowerCase();
      const slB = this.sentences[i + 1].trim().toLowerCase();
      const aStarts = AI_SENTENCE_STARTERS.some((s) => slA.startsWith(s));
      const bStarts = AI_SENTENCE_STARTERS.some((s) => slB.startsWith(s));
      if (aStarts && bStarts) {
        consecutiveBonus++;
      }
    }

    // Sigmoid-based component scoring:
    // marker_density: AI ≈ 0.02-0.06, Human ≈ 0.00-0.01, center: 0.012
    const markerS = sigNorm(markerDensity, 0.012, 250.0);
    // phrase_density: AI ≈ 0.3-1.5, Human ≈ 0.0-0.2, center: 0.15
    const phraseS = sigNorm(phraseDensity, 0.15, 10.0);
    // starter_ratio: AI ≈ 0.15-0.60, Human ≈ 0.0-0.10, center: 0.10
    const starterS = sigNorm(starterRatio, 0.10, 20.0);
    // consecutive bonus
    const consecS = Math.min(consecutiveBonus * 15, 30);

    const score = markerS * 0.30 + phraseS * 0.30 + starterS * 0.25 + consecS;
    return clamp(score);
  }

  shannonEntropy(): number {
    const textLower = this.text.toLowerCase();
    if (textLower.length < 50) return 45.0;

    // Character bigram and unigram counts
    const biCounts = new Map<string, number>();
    const uniCounts = new Map<string, number>();
    
    for (let i = 0; i < textLower.length - 1; i++) {
      const bigram = textLower.substring(i, i + 2);
      biCounts.set(bigram, (biCounts.get(bigram) ?? 0) + 1);
      const char = textLower[i];
      uniCounts.set(char, (uniCounts.get(char) ?? 0) + 1);
    }
    // Don't forget the last character
    const lastChar = textLower[textLower.length - 1];
    uniCounts.set(lastChar, (uniCounts.get(lastChar) ?? 0) + 1);

    const nBi = [...biCounts.values()].reduce((a, b) => a + b, 0);

    // Conditional entropy H(C₂|C₁)
    let hCond = 0.0;
    for (const [bigram, count] of biCounts.entries()) {
      const c1 = bigram[0];
      const pJoint = count / nBi;
      const pCond = count / (uniCounts.get(c1) ?? 1);
      if (pCond > 0) {
        hCond -= pJoint * Math.log2(pCond);
      }
    }

    // AI: H ≈ 2.8-3.5, Human: H ≈ 3.2-4.5, center: 3.10
    return clamp(sigNorm(hCond, 3.10, 2.5));
  }

  readabilityConsistency(): number {
    // Fallback: use average sentence length variance as proxy (no textstat in TS)
    if (this.sentenceCount < 4) return 45.0;
    
    const lengths = this.sentWords.filter((ws) => ws.length > 0).map((ws) => ws.length);
    if (lengths.length === 0) return 45.0;
    
    const cvL = cv(lengths);
    
    // AI: CV ≈ 0.03-0.12, Human: CV ≈ 0.10-0.40, center: 0.10
    return clamp(sigNorm(cvL, 0.10, 8.0));
  }

  stylometricScore(): number {
    if (this.wordCount < 15) return 45.0;

    // (a) Punctuation diversity
    const punctChars = this.text.match(/[.,;:!?\-—()[\]"'/]/g) ?? [];
    const punctTypes = new Set(punctChars).size;
    const punctDensity = punctChars.length / Math.max(this.wordCount, 1);

    // (b) Comma-to-period ratio
    const commas = (this.text.match(/,/g) ?? []).length;
    const periods = (this.text.match(/\./g) ?? []).length;
    const commaRatio = commas / Math.max(periods, 1);

    // (c) Question/exclamation marks
    const qe = (this.text.match(/[?!]/g) ?? []).length;
    const qeRatio = qe / Math.max(this.sentenceCount, 1);

    // (d) Parenthetical / dash usage
    const parens = (this.text.match(/[([]/g) ?? []).length;
    const dashes = (this.text.match(/—| - /g) ?? []).length;
    const pdRatio = (parens + dashes) / Math.max(this.sentenceCount, 1);

    // (e) Contractions (n't, 're, 'll, 've, 's, 'd, 'm)
    const contractionCount = (this.text.toLowerCase().match(/\b\w+(?:n't|'re|'ll|'ve|'s|'d|'m)\b/g) ?? []).length;
    const contractionRatio = contractionCount / Math.max(this.wordCount, 1);

    // (f) Personal pronouns (AI avoids them)
    const personal = new Set(["i", "me", "my", "mine", "we", "us", "our", "ours", "you", "your", "yours"]);
    const pronounCount = this.words.filter((w) => personal.has(w)).length;
    const pronounRatio = pronounCount / Math.max(this.wordCount, 1);

    // Scoring components
    // punct_types: AI ≈ 3-4, Human ≈ 5-8, center: 4.5
    const ptS = sigNorm(punctTypes, 4.5, 0.8);
    // comma_ratio: AI ≈ 1.0-2.0, Human ≈ 0.5-3.5 (more varied)
    const crS = sigNorm(Math.abs(commaRatio - 1.5), 0.8, -2.0); // distance from AI mean
    // qe_ratio: AI ≈ 0, Human ≈ 0.05-0.20
    const qeS = sigNorm(qeRatio, 0.03, 15.0);
    // pd_ratio: AI ≈ 0.0-0.02, Human ≈ 0.02-0.15
    const pdS = sigNorm(pdRatio, 0.02, 20.0);
    // contractions: AI ≈ 0, Human varied
    const ctS = sigNorm(contractionRatio, 0.005, 200.0);
    // pronouns: AI ≈ 0.00-0.01, Human ≈ 0.02-0.08
    const prS = sigNorm(pronounRatio, 0.015, 60.0);

    return clamp(ptS * 0.15 + crS * 0.10 + qeS * 0.15 + pdS * 0.15 + ctS * 0.20 + prS * 0.25);
  }

  ngramRepetition(): number {
    if (this.wordCount < 30) return 50;
    const trigrams = new Map<string, number>();
    for (let i = 0; i < this.words.length - 2; i++) {
      const tri = this.words[i] + " " + this.words[i + 1] + " " + this.words[i + 2];
      trigrams.set(tri, (trigrams.get(tri) ?? 0) + 1);
    }
    const repeated = [...trigrams.values()].filter((c) => c >= 2).reduce((s, c) => s + c - 1, 0);
    const density = repeated / Math.max(this.wordCount - 2, 1);
    return clamp(sigNorm(density, 0.02, 150));
  }

  starterDiversity(): number {
    if (this.sentenceCount < 4) return 45;
    const starters = this.sentences.map((s) => s.trim().split(/\s+/)[0]?.toLowerCase() ?? "");
    const unique = new Set(starters).size;
    const ratio = unique / this.sentenceCount;
    return clamp(sigNorm(ratio, 0.65, 5.0));
  }

  wordLengthVariance(): number {
    if (this.wordCount < 20) return 50;
    const lengths = this.words.map((w) => w.length);
    const wlCV = cv(lengths);
    return clamp(sigNorm(wlCV, 0.45, 5.0));
  }

  paragraphUniformity(): number {
    const paras = this.text.split(/\n\s*\n/).filter((p) => p.trim());
    if (paras.length < 3) return 50;
    const lengths = paras.map((p) => p.split(/\s+/).length);
    const cvLen = cv(lengths);
    const paraWords = paras.map((p) => new Set((p.toLowerCase().match(/[a-z']+/g) ?? []).filter((w) => !FUNCTION_WORDS.has(w))));
    const overlaps: number[] = [];
    for (let i = 0; i < paraWords.length - 1; i++) {
      const a = paraWords[i], b = paraWords[i + 1];
      const intersection = new Set([...a].filter((x) => b.has(x)));
      const union = new Set([...a, ...b]);
      overlaps.push(union.size > 0 ? intersection.size / union.size : 0.3);
    }
    const cvScore = 100 - sigNorm(cvLen, 0.30, 4.0);
    const overlapScore = sigNorm(mean(overlaps), 0.18, 8.0);
    return clamp(cvScore * 0.55 + overlapScore * 0.45);
  }

  avgWordCommonality(): number {
    if (this.wordCount < 10) return 50;
    const commonCount = this.words.filter((w) => COMMON_200.has(w)).length;
    return clamp(sigNorm(commonCount / this.wordCount, 0.48, 8.0));
  }

  zipfDeviation(): number {
    if (this.vocabSize < 15) return 50;
    const sorted = [...this.wordFreq.values()].sort((a, b) => b - a);
    const logRanks = sorted.map((_, i) => Math.log(i + 1));
    const logFreqs = sorted.map((f) => f > 0 ? Math.log(f) : 0);
    const { rSquared } = linearRegression(logRanks, logFreqs);
    const raw = sigNorm(rSquared, 0.90, 25.0);
    if (this.wordCount < 150) {
      const factor = Math.max(0, this.wordCount - 40) / 110.0;
      return clamp(raw * factor + 50.0 * (1 - factor));
    }
    return clamp(raw);
  }

  tokenPredictability(): number {
    if (this.wordCount < 30) return 50;
    const biFreq = new Map<string, number>();
    for (let i = 0; i < this.words.length - 1; i++) {
      const bi = this.words[i] + " " + this.words[i + 1];
      biFreq.set(bi, (biFreq.get(bi) ?? 0) + 1);
    }
    const nBi = this.wordCount - 1;
    const uniqueBi = biFreq.size;
    if (uniqueBi < 5) return 50;
    const biTTR = uniqueBi / nBi;
    const ttrScore = 100.0 - sigNorm(biTTR, 0.92, 40.0);
    const repeated = [...biFreq.values()].filter((c) => c >= 2).reduce((s, c) => s + c - 1, 0);
    const rdScore = sigNorm(repeated / nBi, 0.04, 60.0);
    const raw = ttrScore * 0.5 + rdScore * 0.5;
    if (this.wordCount < 100) {
      const factor = (this.wordCount - 30) / 70.0;
      return clamp(raw * factor + 50.0 * (1 - factor));
    }
    return clamp(raw);
  }

  perSentenceAiRatio(): number {
    if (this.sentenceCount < 3) return 50;
    let aiCount = 0, scored = 0;
    const formalLinks = new Set(["however", "therefore", "furthermore", "moreover", "consequently", "additionally", "conversely", "similarly", "specifically", "particularly", "notably", "indeed", "essentially", "fundamentally", "accordingly", "thus"]);
    const personal = new Set(["i", "we", "you", "my", "me", "your", "our", "us"]);

    for (let i = 0; i < this.sentWords.length; i++) {
      const ws = this.sentWords[i];
      if (ws.length < 4) continue;
      scored++;
      let miniScore = 0;
      const sentText = (this.sentences[i] ?? "").trim().toLowerCase();

      // Signal 1: AI sentence starters (+0.20)
      if (AI_SENTENCE_STARTERS.some((s) => sentText.startsWith(s))) miniScore += 0.20;

      // Signal 2: AI marker word density (+0.00-0.20)
      const markerD = ws.filter((w) => AI_MARKER_WORDS.has(w)).length / ws.length;
      miniScore += Math.min(markerD * 5.0, 0.20);

      // Signal 3: Word length CV < 0.35 (+0.12)
      if (cv(ws.map((w) => w.length)) < 0.35) miniScore += 0.12;

      // Signal 4: Sentence in "AI sweet spot" length 13-30 words (+0.10)
      if (ws.length >= 13 && ws.length <= 30) miniScore += 0.10;

      // Signal 5: Function word ratio in AI range 0.35-0.55 (+0.10)
      const fwR = ws.filter((w) => FUNCTION_WORDS.has(w)).length / ws.length;
      if (fwR >= 0.35 && fwR <= 0.55) miniScore += 0.10;

      // Signal 6: AI phrase patterns (+0.12)
      if (AI_PHRASE_PATTERNS.slice(0, 15).some((p) => p.test(sentText))) miniScore += 0.12;

      // Signal 7: No contractions (+0.03)
      if (!ws.some((w) => w.includes("'"))) miniScore += 0.03;

      // Signal 8: Formal link words (+0.10)
      if (ws.some((w) => formalLinks.has(w))) miniScore += 0.10;

      // Signal 9: No personal pronouns (+0.02)
      if (!ws.some((w) => personal.has(w))) miniScore += 0.02;

      // Signal 10: Bigram predictability — repeated bigrams within sentence (+0.08)
      const sentBigrams = new Set<string>();
      let bigramRepeats = 0;
      for (let j = 0; j < ws.length - 1; j++) {
        const bi = ws[j] + " " + ws[j + 1];
        if (sentBigrams.has(bi)) bigramRepeats++;
        sentBigrams.add(bi);
      }
      if (bigramRepeats > 0) miniScore += 0.08;

      // Signal 11: Average word length uniformity — AI tends toward 5-6 char avg (+0.06)
      const avgWL = ws.reduce((s, w) => s + w.length, 0) / ws.length;
      if (avgWL >= 4.5 && avgWL <= 6.0) miniScore += 0.06;

      // Signal 12: Sentence starts with adverb+comma AI pattern (+0.05)
      if (/^[a-z]+ly,/i.test(sentText)) miniScore += 0.05;

      if (miniScore >= 0.28) aiCount++;
    }
    return scored === 0 ? 50 : clamp((aiCount / scored) * 100);
  }

  /** Return per-sentence AI scores + flagged marker phrases (non-LLM detection) */
  perSentenceDetails(): { index: number; ai_score: number; flagged_phrases: string[] }[] {
    const results: { index: number; ai_score: number; flagged_phrases: string[] }[] = [];
    const formalLinks = new Set(["however", "therefore", "furthermore", "moreover", "consequently", "additionally", "conversely", "similarly", "specifically", "particularly", "notably", "indeed", "essentially", "fundamentally", "accordingly", "thus"]);

    for (let i = 0; i < this.sentWords.length; i++) {
      const ws = this.sentWords[i];
      if (ws.length < 4) continue;
      let miniScore = 0;
      const sentText = (this.sentences[i] ?? "").trim().toLowerCase();
      const flagged: string[] = [];

      // Collect AI marker words as flagged phrases
      for (const w of ws) {
        if (AI_MARKER_WORDS.has(w)) flagged.push(w);
      }
      // Collect formal link words
      for (const w of ws) {
        if (formalLinks.has(w)) flagged.push(w);
      }

      // Score signals (same as perSentenceAiRatio)
      if (AI_SENTENCE_STARTERS.some((s) => sentText.startsWith(s))) miniScore += 0.20;
      const markerD = ws.filter((w) => AI_MARKER_WORDS.has(w)).length / ws.length;
      miniScore += Math.min(markerD * 5.0, 0.20);
      if (cv(ws.map((w) => w.length)) < 0.35) miniScore += 0.12;
      if (ws.length >= 13 && ws.length <= 30) miniScore += 0.10;
      const fwR = ws.filter((w) => FUNCTION_WORDS.has(w)).length / ws.length;
      if (fwR >= 0.35 && fwR <= 0.55) miniScore += 0.10;
      if (AI_PHRASE_PATTERNS.slice(0, 15).some((p) => p.test(sentText))) miniScore += 0.12;
      if (!ws.some((w) => w.includes("'"))) miniScore += 0.03;
      if (ws.some((w) => formalLinks.has(w))) miniScore += 0.10;
      if (!ws.some((w) => new Set(["i", "we", "you", "my", "me", "your", "our", "us"]).has(w))) miniScore += 0.02;
      const sentBigrams = new Set<string>();
      let bigramRepeats = 0;
      for (let j = 0; j < ws.length - 1; j++) {
        const bi = ws[j] + " " + ws[j + 1];
        if (sentBigrams.has(bi)) bigramRepeats++;
        sentBigrams.add(bi);
      }
      if (bigramRepeats > 0) miniScore += 0.08;
      const avgWL = ws.reduce((s, w) => s + w.length, 0) / ws.length;
      if (avgWL >= 4.5 && avgWL <= 6.0) miniScore += 0.06;
      if (/^[a-z]+ly,/i.test(sentText)) miniScore += 0.05;

      // Convert miniScore to 0-100
      const aiScore = clamp(miniScore * 100);
      if (aiScore >= 28) {
        // Also collect AI phrase pattern matches as flagged phrases
        for (const p of AI_PHRASE_PATTERNS.slice(0, 15)) {
          const m = sentText.match(p);
          if (m) flagged.push(m[0]);
        }
        results.push({ index: i, ai_score: aiScore, flagged_phrases: [...new Set(flagged)].slice(0, 5) });
      }
    }
    return results;
  }

  spectralFlatness(): number {
    if (this.sentenceCount < 6) return 45;
    const signal = this.sentWords.filter((ws) => ws.length > 0).map((ws) => ws.length);
    const N = signal.length;
    if (N < 6) return 45;
    const mu = mean(signal);
    const centered = signal.map((s) => s - mu);
    // Use only first 16 DFT bins (enough for flatness estimate, avoids O(N²))
    const maxK = Math.min(Math.floor(N / 2), 16);
    const power: number[] = [];
    for (let k = 1; k <= maxK; k++) {
      let re = 0, im = 0;
      for (let n = 0; n < N; n++) {
        const angle = (2 * Math.PI * k * n) / N;
        re += centered[n] * Math.cos(angle);
        im -= centered[n] * Math.sin(angle);
      }
      power.push(Math.max(re ** 2 + im ** 2, 1e-12));
    }
    if (power.length === 0) return 45;
    const geo = geometricMean(power);
    const arith = mean(power);
    const flatness = arith > 1e-12 ? geo / arith : 0;
    return clamp(sigNorm(flatness, 0.35, 5.0));
  }

  lexicalDensityVar(): number {
    if (this.sentenceCount < 4) return 45;
    const densities: number[] = [];
    for (const ws of this.sentWords) {
      if (ws.length < 4) continue;
      const content = ws.filter((w) => !FUNCTION_WORDS.has(w)).length;
      densities.push(content / ws.length);
    }
    if (densities.length < 3) return 45;
    return clamp(sigNorm(cv(densities), 0.10, 12.0));
  }

  functionWordFreq(): number {
    if (this.wordCount < 30) return 50;
    const fwKeys = Object.keys(AI_FUNCTION_PROFILE);
    const totalFw = fwKeys.reduce((s, w) => s + (this.wordFreq.get(w) ?? 0), 0);
    if (totalFw < 5) return 50;
    const alpha = 0.01;
    const textRaw = fwKeys.map((w) => (this.wordFreq.get(w) ?? 0) + alpha);
    const textSum = textRaw.reduce((a, b) => a + b, 0);
    const textDist = textRaw.map((x) => x / textSum);
    const aiRaw = fwKeys.map((w) => AI_FUNCTION_PROFILE[w] + alpha);
    const aiSum = aiRaw.reduce((a, b) => a + b, 0);
    const aiDist = aiRaw.map((x) => x / aiSum);
    const mDist = textDist.map((p, i) => (p + aiDist[i]) / 2.0);
    const jsd = (klDivergence(textDist, mDist) + klDivergence(aiDist, mDist)) / 2.0;
    return clamp(sigNorm(jsd, 0.13, -15.0));
  }

  dependencyDepth(): number {
    if (this.wordCount < 15) return 45;
    const subCount = this.words.filter((w) => SUBORDINATORS.has(w)).length;
    const relCount = this.words.filter((w) => RELATIVE_PRONOUNS.has(w)).length;
    const clauseDensity = (subCount + relCount) / this.sentenceCount;
    const semicolons = (this.text.match(/[;:]/g)?.length ?? 0);
    const scDensity = semicolons / this.sentenceCount;
    const clauseScore = sigNorm(clauseDensity, 0.75, 2.0);
    const scScore = sigNorm(scDensity, 0.05, 12.0);
    return clamp(clauseScore * 0.70 + scScore * 0.30);
  }

  getAllSignals(): Record<string, number> {
    return {
      perplexity: this.perplexity(),
      burstiness: this.burstiness(),
      vocabulary_richness: this.vocabularyRichness(),
      sentence_uniformity: this.sentenceUniformity(),
      ai_pattern_score: this.aiPatternScore(),
      shannon_entropy: this.shannonEntropy(),
      readability_consistency: this.readabilityConsistency(),
      stylometric_score: this.stylometricScore(),
      ngram_repetition: this.ngramRepetition(),
      starter_diversity: this.starterDiversity(),
      word_length_variance: this.wordLengthVariance(),
      paragraph_uniformity: this.paragraphUniformity(),
      avg_word_commonality: this.avgWordCommonality(),
      zipf_deviation: this.zipfDeviation(),
      token_predictability: this.tokenPredictability(),
      per_sentence_ai_ratio: this.perSentenceAiRatio(),
      spectral_flatness: this.spectralFlatness(),
      lexical_density_var: this.lexicalDensityVar(),
      function_word_freq: this.functionWordFreq(),
      dependency_depth: this.dependencyDepth(),
    };
  }

  private _skewness(arr: number[]): number {
    const m = mean(arr);
    const s = std(arr);
    if (s === 0) return 0;
    return arr.reduce((sum, x) => sum + ((x - m) / s) ** 3, 0) / arr.length;
  }

  private _kurtosis(arr: number[]): number {
    const m = mean(arr);
    const s = std(arr);
    if (s === 0) return 0;
    return arr.reduce((sum, x) => sum + ((x - m) / s) ** 4, 0) / arr.length;
  }
}

// ── Detector Profile ──

interface DetectorConfig {
  name: string;
  displayName: string;
  weights: Record<string, number>;
  bias?: number;
  temperature?: number;
  interactions?: [string, string, number][];
  category?: string;
  description?: string;
}

type DetectorScoreOutput = {
  detector: string;
  ai_score: number;
  human_score: number;
  verdict: string;
  confidence: string;
  category: string;
};

class DetectorProfile {
  name: string;
  displayName: string;
  weights: Record<string, number>;
  bias: number;
  temperature: number;
  interactions: [string, string, number][];
  category: string;
  description: string;

  constructor(config: DetectorConfig) {
    this.name = config.name;
    this.displayName = config.displayName;
    this.weights = config.weights;
    this.bias = config.bias ?? 0;
    this.temperature = config.temperature ?? 1.0;
    this.interactions = config.interactions ?? [];
    this.category = config.category ?? "general";
    this.description = config.description ?? "";
  }

  score(signals: Record<string, number>, calibration?: Record<string, { a: number; b: number }>): DetectorScoreOutput {
    const GLOBAL_BIAS = 0.09;
    const GLOBAL_TEMP_MULT = 2.35;

    const normalized: Record<string, number> = {};
    for (const [sigName, sigVal] of Object.entries(signals)) {
      let x = (sigVal - 50.0) / 50.0;
      if (HUMAN_POSITIVE_SIGNALS.has(sigName)) x = -x;
      normalized[sigName] = x;
    }

    let z = this.bias + GLOBAL_BIAS;
    for (const [sigName, weight] of Object.entries(this.weights)) {
      if (normalized[sigName] !== undefined) z += weight * normalized[sigName];
    }
    for (const [sigA, sigB, wInt] of this.interactions) {
      if (normalized[sigA] !== undefined && normalized[sigB] !== undefined) {
        z += wInt * normalized[sigA] * normalized[sigB];
      }
    }

    // Strict AI signature uplift: if multiple high-risk micro-signals align,
    // increase probability aggressively to reduce false negatives on real AI text.
    const strictVector = STRICT_AI_SIGNALS.map((sig) => {
      const raw = ((signals[sig] ?? 50) - 50) / 50;
      return Math.max(raw, 0);
    });
    const strictComposite = strictVector.length > 0 ? mean(strictVector) : 0;
    const strictTriggerCount = strictVector.filter((v) => v >= 0.24).length;

    if (strictComposite > 0.16) z += strictComposite * 1.05;
    if (strictTriggerCount >= 3) z += 0.22;

    if ((signals.ai_pattern_score ?? 0) >= 70 && (signals.per_sentence_ai_ratio ?? 0) >= 42) z += 0.30;
    if ((signals.token_predictability ?? 0) >= 64 && (signals.sentence_uniformity ?? 0) >= 66) z += 0.18;
    if ((signals.function_word_freq ?? 0) >= 62 && (signals.ngram_repetition ?? 0) >= 60) z += 0.14;

    let aiProb = sigmoid(z * this.temperature * GLOBAL_TEMP_MULT) * 100.0;
    if (calibration?.[this.name]) {
      const c = calibration[this.name];
      aiProb = plattCalibrate(aiProb, c.a, c.b);
    }

    // Hard floors when strongest AI signatures co-occur.
    if ((signals.ai_pattern_score ?? 0) >= 82 && (signals.per_sentence_ai_ratio ?? 0) >= 58) {
      aiProb = Math.max(aiProb, 78);
    } else if ((signals.ai_pattern_score ?? 0) >= 70 && (signals.per_sentence_ai_ratio ?? 0) >= 42 && (signals.token_predictability ?? 0) >= 64) {
      aiProb = Math.max(aiProb, 66);
    }

    // Confidence threshold: scores below 3% are within noise margin
    // Real detectors do not distinguish sub-3% from 0% — GPTZero/Turnitin
    // report "Human" for anything below 5%
    let aiScore = Math.round(clamp(aiProb) * 10) / 10;
    if (aiScore < 2.5) aiScore = 0;
    const humanScore = Math.round((100 - aiScore) * 10) / 10;

    const { verdict, confidence } = classifyAiScore(aiScore);

    return { detector: this.displayName, ai_score: aiScore, human_score: humanScore, verdict, confidence, category: this.category };
  }
}

// ── Calibration ──

const DETECTOR_CALIBRATION: Record<string, { a: number; b: number }> = {
  gptzero: { a: 0.10, b: -5.0 },
  turnitin: { a: 0.10, b: -5.0 },
  originality_ai: { a: 0.10, b: -5.0 },
  winston_ai: { a: 0.10, b: -5.0 },
  copyleaks: { a: 0.10, b: -5.0 },
  sapling: { a: 0.10, b: -5.0 },
  content_at_scale: { a: 0.10, b: -5.0 },
  crossplag: { a: 0.10, b: -5.0 },
  writer_ai: { a: 0.10, b: -5.0 },
  smodin: { a: 0.10, b: -5.0 },
  hive_ai: { a: 0.10, b: -5.0 },
  surfer_seo: { a: 0.10, b: -5.0 },
  zerogpt: { a: 0.10, b: -5.0 },
  quillbot: { a: 0.12, b: -5.0 },
  grammarly: { a: 0.10, b: -5.0 },
  scribbr: { a: 0.10, b: -5.0 },
  pangram: { a: 0.10, b: -5.0 },
  roberta: { a: 0.10, b: -5.0 },
  openai_classifier: { a: 0.10, b: -5.0 },
  content_detector_ai: { a: 0.10, b: -5.0 },
  gpt2_detector: { a: 0.10, b: -5.0 },
  stealth_detector: { a: 0.10, b: -5.0 },
};

// ── 22 Detector Profiles ──

const DETECTOR_PROFILES: DetectorProfile[] = [
  // TIER 1: ACADEMIC
  new DetectorProfile({ name: "gptzero", displayName: "GPTZero", category: "academic", bias: 0.22, temperature: 1.35, weights: { perplexity: 1.2, burstiness: 1.0, per_sentence_ai_ratio: 0.9, sentence_uniformity: 0.7, ai_pattern_score: 0.6, starter_diversity: 0.4, vocabulary_richness: 0.4, token_predictability: 0.5, ngram_repetition: 0.3, spectral_flatness: 0.3 }, interactions: [["perplexity", "burstiness", 0.35], ["per_sentence_ai_ratio", "ai_pattern_score", 0.3], ["token_predictability", "sentence_uniformity", 0.2]] }),
  new DetectorProfile({ name: "turnitin", displayName: "Turnitin", category: "academic", bias: 0.25, temperature: 1.40, weights: { perplexity: 1.0, sentence_uniformity: 1.0, ai_pattern_score: 0.8, vocabulary_richness: 0.8, readability_consistency: 0.7, ngram_repetition: 0.6, stylometric_score: 0.6, per_sentence_ai_ratio: 0.7, paragraph_uniformity: 0.5, burstiness: 0.5, token_predictability: 0.4, spectral_flatness: 0.3 }, interactions: [["sentence_uniformity", "readability_consistency", 0.35], ["ngram_repetition", "token_predictability", 0.25], ["per_sentence_ai_ratio", "ai_pattern_score", 0.20], ["perplexity", "burstiness", 0.15]] }),
  new DetectorProfile({ name: "originality_ai", displayName: "Originality.ai", category: "academic", bias: 0.35, temperature: 1.50, weights: { perplexity: 1.0, burstiness: 0.8, ai_pattern_score: 0.9, sentence_uniformity: 0.7, per_sentence_ai_ratio: 0.8, token_predictability: 0.6, vocabulary_richness: 0.5, ngram_repetition: 0.4, zipf_deviation: 0.4, function_word_freq: 0.3, spectral_flatness: 0.3, word_length_variance: 0.2 }, interactions: [["perplexity", "ai_pattern_score", 0.45], ["sentence_uniformity", "burstiness", 0.35], ["token_predictability", "zipf_deviation", 0.25], ["per_sentence_ai_ratio", "ngram_repetition", 0.2]] }),
  new DetectorProfile({ name: "winston_ai", displayName: "Winston AI", category: "academic", bias: 0.15, temperature: 1.25, weights: { sentence_uniformity: 1.0, paragraph_uniformity: 0.9, readability_consistency: 0.7, ai_pattern_score: 0.6, perplexity: 0.6, stylometric_score: 0.5, lexical_density_var: 0.4, spectral_flatness: 0.3 }, interactions: [["paragraph_uniformity", "sentence_uniformity", 0.35], ["readability_consistency", "ai_pattern_score", 0.2]] }),
  new DetectorProfile({ name: "copyleaks", displayName: "Copyleaks", category: "academic", bias: 0.18, temperature: 1.30, weights: { perplexity: 0.9, ai_pattern_score: 0.8, vocabulary_richness: 0.7, shannon_entropy: 0.6, sentence_uniformity: 0.6, burstiness: 0.6, function_word_freq: 0.4, token_predictability: 0.4, per_sentence_ai_ratio: 0.3, ngram_repetition: 0.3 }, interactions: [["perplexity", "shannon_entropy", 0.3], ["ai_pattern_score", "vocabulary_richness", 0.2]] }),
  // TIER 2: MID-TIER
  new DetectorProfile({ name: "sapling", displayName: "Sapling AI", category: "mid-tier", bias: 0.08, temperature: 1.15, weights: { perplexity: 1.2, token_predictability: 0.7, vocabulary_richness: 0.5, burstiness: 0.4, ai_pattern_score: 0.4, shannon_entropy: 0.3 }, interactions: [["perplexity", "token_predictability", 0.3]] }),
  new DetectorProfile({ name: "content_at_scale", displayName: "Content at Scale", category: "mid-tier", bias: 0.0, temperature: 1.10, weights: { readability_consistency: 0.8, perplexity: 0.6, ai_pattern_score: 0.5, sentence_uniformity: 0.5, avg_word_commonality: 0.4, ngram_repetition: 0.3, lexical_density_var: 0.3 } }),
  new DetectorProfile({ name: "crossplag", displayName: "Crossplag", category: "mid-tier", bias: 0.05, temperature: 1.08, weights: { perplexity: 0.8, ai_pattern_score: 0.7, sentence_uniformity: 0.6, vocabulary_richness: 0.5, ngram_repetition: 0.4, paragraph_uniformity: 0.3 } }),
  new DetectorProfile({ name: "writer_ai", displayName: "Writer.com", category: "mid-tier", bias: -0.15, temperature: 1.10, weights: { perplexity: 0.9, burstiness: 0.6, vocabulary_richness: 0.5, stylometric_score: 0.5, shannon_entropy: 0.3, function_word_freq: 0.2 } }),
  new DetectorProfile({ name: "smodin", displayName: "Smodin AI", category: "mid-tier", bias: 0.10, temperature: 1.15, weights: { perplexity: 0.8, ai_pattern_score: 0.7, burstiness: 0.6, sentence_uniformity: 0.5, vocabulary_richness: 0.4, ngram_repetition: 0.3, per_sentence_ai_ratio: 0.3 } }),
  new DetectorProfile({ name: "hive_ai", displayName: "Hive AI", category: "mid-tier", bias: 0.08, temperature: 1.20, weights: { perplexity: 0.7, burstiness: 0.5, sentence_uniformity: 0.6, ai_pattern_score: 0.5, vocabulary_richness: 0.4, readability_consistency: 0.4, word_length_variance: 0.3, spectral_flatness: 0.2 }, interactions: [["perplexity", "sentence_uniformity", 0.2]] }),
  new DetectorProfile({ name: "surfer_seo", displayName: "Surfer SEO", category: "mid-tier", bias: 0.22, temperature: 1.35, weights: { perplexity: 1.0, readability_consistency: 0.9, sentence_uniformity: 0.8, ai_pattern_score: 0.8, vocabulary_richness: 0.7, paragraph_uniformity: 0.6, avg_word_commonality: 0.5, word_length_variance: 0.5, function_word_freq: 0.4, per_sentence_ai_ratio: 0.5, ngram_repetition: 0.4, token_predictability: 0.4, burstiness: 0.4, spectral_flatness: 0.3 }, interactions: [["readability_consistency", "sentence_uniformity", 0.35], ["perplexity", "ai_pattern_score", 0.30], ["per_sentence_ai_ratio", "ngram_repetition", 0.20], ["paragraph_uniformity", "readability_consistency", 0.15]] }),
  // TIER 3: LOWER
  new DetectorProfile({ name: "zerogpt", displayName: "ZeroGPT", category: "lower-tier", bias: -0.10, temperature: 0.95, weights: { perplexity: 1.3, ai_pattern_score: 0.6, burstiness: 0.4, ngram_repetition: 0.4 } }),
  new DetectorProfile({ name: "quillbot", displayName: "QuillBot AI", category: "lower-tier", bias: -0.15, temperature: 0.92, weights: { vocabulary_richness: 0.8, perplexity: 0.7, stylometric_score: 0.5, ai_pattern_score: 0.4, starter_diversity: 0.3 } }),
  new DetectorProfile({ name: "grammarly", displayName: "Grammarly AI", category: "lower-tier", bias: -0.25, temperature: 0.85, weights: { readability_consistency: 0.8, stylometric_score: 0.7, sentence_uniformity: 0.5, vocabulary_richness: 0.4, perplexity: 0.3 } }),
  new DetectorProfile({ name: "scribbr", displayName: "Scribbr AI", category: "lower-tier", bias: -0.12, temperature: 0.90, weights: { ai_pattern_score: 0.8, sentence_uniformity: 0.6, readability_consistency: 0.5, vocabulary_richness: 0.4, perplexity: 0.4, per_sentence_ai_ratio: 0.3 } }),
  // TIER 4: RESEARCH
  new DetectorProfile({ name: "pangram", displayName: "Pangram", category: "research", bias: 0.28, temperature: 1.42, weights: { perplexity: 0.8, burstiness: 0.7, vocabulary_richness: 0.6, sentence_uniformity: 0.6, ai_pattern_score: 0.6, shannon_entropy: 0.5, readability_consistency: 0.5, ngram_repetition: 0.5, zipf_deviation: 0.4, token_predictability: 0.5, spectral_flatness: 0.4, function_word_freq: 0.3, dependency_depth: 0.3, lexical_density_var: 0.3, per_sentence_ai_ratio: 0.4, avg_word_commonality: 0.2, word_length_variance: 0.2 }, interactions: [["perplexity", "zipf_deviation", 0.35], ["burstiness", "spectral_flatness", 0.25], ["sentence_uniformity", "paragraph_uniformity", 0.25], ["ngram_repetition", "token_predictability", 0.2], ["per_sentence_ai_ratio", "ai_pattern_score", 0.2]] }),
  new DetectorProfile({ name: "roberta", displayName: "RoBERTa Detector", category: "research", bias: 0.0, temperature: 1.05, weights: { perplexity: 1.0, vocabulary_richness: 0.7, burstiness: 0.5, ai_pattern_score: 0.4, shannon_entropy: 0.3, token_predictability: 0.3 } }),
  new DetectorProfile({ name: "openai_classifier", displayName: "OpenAI Classifier", category: "research", bias: -0.40, temperature: 0.80, weights: { perplexity: 1.2, burstiness: 0.6, vocabulary_richness: 0.4, shannon_entropy: 0.3 } }),
  new DetectorProfile({ name: "content_detector_ai", displayName: "Content Detector AI", category: "research", bias: -0.05, temperature: 1.00, weights: { perplexity: 0.8, ai_pattern_score: 0.7, sentence_uniformity: 0.5, vocabulary_richness: 0.4, ngram_repetition: 0.3, per_sentence_ai_ratio: 0.3 } }),
  new DetectorProfile({ name: "gpt2_detector", displayName: "GPT-2 Output Detector", category: "research", bias: -0.45, temperature: 0.75, weights: { perplexity: 1.3, burstiness: 0.6, vocabulary_richness: 0.4, shannon_entropy: 0.3 } }),
  new DetectorProfile({ name: "stealth_detector", displayName: "StealthDetector (Ours)", category: "custom", description: "Ultra-aggressive: all 20 signals + interactions, max temperature", bias: 0.35, temperature: 1.50, weights: { perplexity: 0.7, burstiness: 0.6, vocabulary_richness: 0.5, sentence_uniformity: 0.5, ai_pattern_score: 0.6, shannon_entropy: 0.4, readability_consistency: 0.4, stylometric_score: 0.3, ngram_repetition: 0.3, starter_diversity: 0.3, word_length_variance: 0.2, paragraph_uniformity: 0.3, avg_word_commonality: 0.2, zipf_deviation: 0.3, token_predictability: 0.4, per_sentence_ai_ratio: 0.5, spectral_flatness: 0.3, lexical_density_var: 0.2, function_word_freq: 0.2, dependency_depth: 0.2 }, interactions: [["perplexity", "burstiness", 0.35], ["perplexity", "ai_pattern_score", 0.30], ["sentence_uniformity", "paragraph_uniformity", 0.25], ["token_predictability", "zipf_deviation", 0.25], ["per_sentence_ai_ratio", "ai_pattern_score", 0.20], ["burstiness", "spectral_flatness", 0.15]] }),
];

// ── Multi-Detector Orchestrator ──

const TIER_WEIGHTS: Record<string, number> = {
  academic: 3.2, "mid-tier": 1.9, "lower-tier": 0.8, research: 1.5, custom: 3.6,
};

export interface DetectorResult {
  detector: string;
  ai_score: number;
  human_score: number;
  verdict: string;
  confidence: string;
  category: string;
}

export interface AnalysisResult {
  signals: Record<string, number>;
  detectors: DetectorResult[];
  summary: {
    overall_ai_score: number;
    overall_human_score: number;
    overall_verdict: string;
    simple_avg_ai: number;
    length_reliability: number;
    detectors_flagged_ai: number;
    detectors_flagged_human: number;
    detectors_uncertain: number;
    total_detectors: number;
    word_count: number;
    sentence_count: number;
  };
}

export class MultiDetector {
  readonly profiles: DetectorProfile[];
  private calibration: Record<string, { a: number; b: number }>;

  constructor(profiles?: DetectorProfile[], calibration?: Record<string, { a: number; b: number }>) {
    this.profiles = profiles ?? DETECTOR_PROFILES;
    this.calibration = calibration ?? DETECTOR_CALIBRATION;
  }

  analyze(text: string): AnalysisResult {
    if (!text?.trim()) {
      return { signals: {}, detectors: [], summary: { overall_ai_score: 50, overall_human_score: 50, overall_verdict: "Empty text", simple_avg_ai: 50, length_reliability: 0, detectors_flagged_ai: 0, detectors_flagged_human: 0, detectors_uncertain: 0, total_detectors: 0, word_count: 0, sentence_count: 0 } };
    }

    const sigObj = new TextSignals(text);
    const signals = sigObj.getAllSignals();

    const detectorResults: DetectorResult[] = this.profiles.map((p) =>
      p.score(signals, this.calibration) as DetectorResult,
    );

    // Length reliability: still damp short text, but less aggressively than before.
    const lengthFactor = Math.max(0.15, Math.min(1.0, (sigObj.wordCount - 12) / 70.0));
    const shortTextAnchor = 62.0;
    if (lengthFactor < 1.0) {
      for (const d of detectorResults) {
        d.ai_score = Math.round(clamp(d.ai_score * lengthFactor + shortTextAnchor * (1.0 - lengthFactor)) * 10) / 10;
        d.human_score = Math.round((100 - d.ai_score) * 10) / 10;
        const classified = classifyAiScore(d.ai_score);
        d.verdict = classified.verdict;
        d.confidence = classified.confidence;
      }
    }

    const aiScores = detectorResults.map((d) => d.ai_score);
    const simpleAvg = mean(aiScores);

    let weightedSum = 0, weightTotal = 0;
    for (const d of detectorResults) {
      const w = TIER_WEIGHTS[d.category] ?? 1.0;
      weightedSum += d.ai_score * w;
      weightTotal += w;
    }
    let weightedAvg = weightTotal > 0 ? weightedSum / weightTotal : 50;

    // Global strict-signal boost across the document.
    const strictSignalBoost =
      Math.max(0, ((signals.ai_pattern_score ?? 0) - 58) * 0.10) +
      Math.max(0, ((signals.per_sentence_ai_ratio ?? 0) - 42) * 0.08) +
      Math.max(0, ((signals.token_predictability ?? 0) - 58) * 0.05);
    weightedAvg += Math.min(strictSignalBoost, 14);

    // Consensus lift: many detectors firing together should lift final score.
    const highRiskCount = detectorResults.filter((d) => d.ai_score >= 70).length;
    const mediumRiskCount = detectorResults.filter((d) => d.ai_score >= DETECTOR_VERDICT_THRESHOLDS.likelyAi).length;
    weightedAvg += highRiskCount * 0.9 + mediumRiskCount * 0.25;
    weightedAvg = clamp(weightedAvg);

    if (highRiskCount >= Math.ceil(detectorResults.length * 0.45)) {
      weightedAvg = Math.max(weightedAvg, 72);
    }
    if (mediumRiskCount >= Math.ceil(detectorResults.length * 0.55)) {
      weightedAvg = Math.max(weightedAvg, 56);
    }

    // Contrast amplification
    const p = weightedAvg / 100;
    weightedAvg = sigmoid((p - 0.46) * 7.6) * 100;
    weightedAvg = clamp(weightedAvg);

    const aiCount = detectorResults.filter((d) => ["AI-Generated", "Likely AI"].includes(d.verdict)).length;
    const humanCount = detectorResults.filter((d) => d.verdict === "Human-Written").length;

    // Length-adaptive thresholds (strict mode).
    const aiThreshold = 68 + (1 - lengthFactor) * 6;
    const likelyThreshold = 46 + (1 - lengthFactor) * 8;
    const mixedThreshold = 24 + (1 - lengthFactor) * 5;

    let overall: string;
    if (weightedAvg >= aiThreshold) overall = "AI-Generated";
    else if (weightedAvg >= likelyThreshold) overall = "Likely AI";
    else if (weightedAvg >= mixedThreshold) overall = "Mixed / Uncertain";
    else overall = "Human-Written";

    return {
      signals: Object.fromEntries(Object.entries(signals).map(([k, v]) => [k, Math.round(v * 10) / 10])),
      detectors: detectorResults,
      summary: {
        overall_ai_score: Math.round(weightedAvg * 10) / 10,
        overall_human_score: Math.round((100 - weightedAvg) * 10) / 10,
        overall_verdict: overall,
        simple_avg_ai: Math.round(simpleAvg * 10) / 10,
        length_reliability: Math.round(lengthFactor * 100) / 100,
        detectors_flagged_ai: aiCount,
        detectors_flagged_human: humanCount,
        detectors_uncertain: detectorResults.length - aiCount - humanCount,
        total_detectors: detectorResults.length,
        word_count: sigObj.wordCount,
        sentence_count: sigObj.sentenceCount,
      },
    };
  }
}

let _detector: MultiDetector | null = null;

export function getDetector(): MultiDetector {
  if (!_detector) _detector = new MultiDetector();
  return _detector;
}
