/**
 * Text Analyzer — ported from text_analyzer.py
 * Computes statistical fingerprint of text for gap analysis.
 */

const HEDGE_WORDS = new Set([
  "suggests", "indicates", "appears", "seems", "likely", "unlikely",
  "perhaps", "possibly", "probably", "might", "could", "may",
  "arguably", "conceivably", "presumably", "roughly", "approximately",
  "tend", "tends", "tended", "somewhat", "relatively", "generally",
  "largely", "partially", "primarily", "mainly", "mostly",
]);

const HEDGE_PHRASES = [
  "to some extent", "in many cases", "it is possible that",
  "it appears that", "it seems that", "it is likely that",
  "one might argue", "it could be argued", "there is evidence",
  "the data suggest", "the results indicate", "in some instances",
  "to a certain degree", "it is worth noting", "it should be noted",
];

const PASSIVE_RE = /\b(is|are|was|were|been|being|be)\s+(\w+ly\s+)?(\w+ed|written|shown|seen|known|given|taken|made|done|found|said|told|thought|built|sent)\b/i;

const CLAUSE_MARKERS = /\b(which|that|because|although|while|whereas|since|unless|however|moreover|furthermore|nevertheless|consequently|therefore|if|when|where|after|before|until|though)\b/gi;

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

function tokenizeWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-zA-Z']+/g) ?? []);
}

export interface TextProfile {
  sentence_count: number;
  word_count: number;
  paragraph_count: number;
  avg_sentence_length: number;
  sentence_length_std: number;
  hedging_rate: number;
  clause_density: number;
  passive_voice_rate: number;
  lexical_diversity: number;
  avg_paragraph_length: number;
  punctuation_rates: {
    semicolons_per_1k: number;
    colons_per_1k: number;
    dashes_per_1k: number;
  };
  sentence_lengths: number[];
}

function emptyProfile(): TextProfile {
  return {
    sentence_count: 0, word_count: 0, paragraph_count: 0,
    avg_sentence_length: 0, sentence_length_std: 0,
    hedging_rate: 0, clause_density: 1.0,
    passive_voice_rate: 0, lexical_diversity: 0,
    avg_paragraph_length: 0,
    punctuation_rates: { semicolons_per_1k: 0, colons_per_1k: 0, dashes_per_1k: 0 },
    sentence_lengths: [],
  };
}

export function analyzeText(text: string): TextProfile {
  if (!text?.trim()) return emptyProfile();

  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const sentences = splitSentences(text);
  const words = tokenizeWords(text);
  const wordCount = words.length;
  const sentCount = Math.max(sentences.length, 1);

  // Sentence lengths
  const sentLengths = sentences.map((s) => tokenizeWords(s).length);
  const avgSl = sentLengths.reduce((a, b) => a + b, 0) / Math.max(sentLengths.length, 1);
  const stdSl = sentLengths.length > 0
    ? Math.sqrt(sentLengths.reduce((a, l) => a + (l - avgSl) ** 2, 0) / sentLengths.length)
    : 0;

  // Hedging rate
  let hedgeCount = 0;
  for (const sent of sentences) {
    const sentLower = sent.toLowerCase();
    const sentWords = tokenizeWords(sentLower);
    let hasHedge = sentWords.some((w) => HEDGE_WORDS.has(w));
    if (!hasHedge) {
      hasHedge = HEDGE_PHRASES.some((p) => sentLower.includes(p));
    }
    if (hasHedge) hedgeCount++;
  }

  // Clause density
  let totalClauses = 0;
  for (const sent of sentences) {
    const matches = sent.match(CLAUSE_MARKERS);
    totalClauses += matches?.length ?? 0;
  }
  const clauseDensity = 1.0 + totalClauses / sentCount;

  // Passive voice rate
  let passiveCount = 0;
  for (const sent of sentences) {
    if (PASSIVE_RE.test(sent)) passiveCount++;
  }

  // Lexical diversity (TTR on first 500 words)
  const sample = words.slice(0, 500);
  const lexicalDiversity = new Set(sample).size / Math.max(sample.length, 1);

  // Paragraph length
  const paraSentCounts = paragraphs.map((p) => splitSentences(p).length);
  const avgParaLen = paraSentCounts.length > 0
    ? paraSentCounts.reduce((a, b) => a + b, 0) / paraSentCounts.length
    : 4.0;

  // Punctuation rates per 1000 words
  const k = Math.max(wordCount, 1) / 1000;
  const semicolons = (text.match(/;/g)?.length ?? 0) / k;
  const colons = (text.match(/:/g)?.length ?? 0) / k;
  const dashes = ((text.match(/—/g)?.length ?? 0) + (text.match(/ - /g)?.length ?? 0)) / k;

  return {
    sentence_count: sentCount,
    word_count: wordCount,
    paragraph_count: paragraphs.length,
    avg_sentence_length: Math.round(avgSl * 10) / 10,
    sentence_length_std: Math.round(stdSl * 10) / 10,
    hedging_rate: Math.round((hedgeCount / sentCount) * 1000) / 1000,
    clause_density: Math.round(clauseDensity * 100) / 100,
    passive_voice_rate: Math.round((passiveCount / sentCount) * 1000) / 1000,
    lexical_diversity: Math.round(lexicalDiversity * 1000) / 1000,
    avg_paragraph_length: Math.round(avgParaLen * 10) / 10,
    punctuation_rates: {
      semicolons_per_1k: Math.round(semicolons * 10) / 10,
      colons_per_1k: Math.round(colons * 10) / 10,
      dashes_per_1k: Math.round(dashes * 10) / 10,
    },
    sentence_lengths: sentLengths,
  };
}

// ── Gap analysis ──

export interface GapEntry {
  current: number;
  target: number;
  delta: number;
  action: string;
}

export function computeGap(
  current: TextProfile,
  targetProfile: Record<string, any>,
): Record<string, GapEntry> {
  const dimensions = [
    "avg_sentence_length", "sentence_length_std", "hedging_rate",
    "clause_density", "passive_voice_rate", "lexical_diversity",
    "avg_paragraph_length",
  ] as const;

  const gap: Record<string, GapEntry> = {};

  for (const dim of dimensions) {
    const cur = (current as any)[dim] ?? 0;
    const tgt = targetProfile[dim] ?? 0;
    const delta = tgt - cur;
    let action = "keep";
    if (Math.abs(delta) >= 0.05 * Math.max(Math.abs(tgt), 1)) {
      action = delta > 0 ? "increase" : "decrease";
    }
    gap[dim] = {
      current: Math.round(cur * 1000) / 1000,
      target: Math.round(tgt * 1000) / 1000,
      delta: Math.round(delta * 1000) / 1000,
      action,
    };
  }

  // Punctuation sub-dimensions
  const curPunct = current.punctuation_rates ?? {};
  const tgtPunct = targetProfile.punctuation_rates ?? {};
  for (const key of ["semicolons_per_1k", "colons_per_1k", "dashes_per_1k"] as const) {
    const curVal = (curPunct as any)[key] ?? 0;
    const tgtVal = tgtPunct[key] ?? 0;
    const delta = tgtVal - curVal;
    const action = Math.abs(delta) < 0.3 ? "keep" : delta > 0 ? "increase" : "decrease";
    gap[`punct_${key}`] = {
      current: Math.round(curVal * 10) / 10,
      target: Math.round(tgtVal * 10) / 10,
      delta: Math.round(delta * 10) / 10,
      action,
    };
  }

  return gap;
}

export function gapToInstructions(gap: Record<string, GapEntry>): string {
  const dimLabels: Record<string, string> = {
    avg_sentence_length: "average sentence length (words)",
    sentence_length_std: "sentence-length variation",
    hedging_rate: "hedging language frequency",
    clause_density: "subordinate clause density",
    passive_voice_rate: "passive voice usage",
    lexical_diversity: "vocabulary diversity (TTR)",
    avg_paragraph_length: "paragraph length (sentences)",
    punct_semicolons_per_1k: "semicolon usage",
    punct_colons_per_1k: "colon usage",
    punct_dashes_per_1k: "dash usage",
  };

  const lines: string[] = [];
  for (const [dim, entry] of Object.entries(gap)) {
    if (entry.action === "keep") continue;
    const label = dimLabels[dim] ?? dim;
    const direction = entry.action === "increase" ? "Increase" : "Decrease";
    lines.push(`- ${direction} ${label} (currently ${entry.current}, target ${entry.target})`);
  }

  return lines.length > 0
    ? "Style adjustments needed:\n" + lines.join("\n")
    : "No significant style adjustments needed.";
}
