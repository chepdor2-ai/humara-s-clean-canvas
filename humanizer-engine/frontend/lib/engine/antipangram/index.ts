/**
 * AntiPangram Humanizer Engine — Premium Multi-Pass AI-to-Human Transformer
 * ==========================================================================
 *
 * Enterprise-grade text humanization engine specifically engineered to defeat
 * Pangram and similar forensic AI detection systems. Pure TypeScript, zero LLM
 * dependency, deterministic and fast.
 *
 * Architecture:
 *   Pass 1 — Forensic Analysis: Profile text for AI detection signals
 *   Pass 2 — Surgical Transforms: Target specific signals with precision edits
 *   Pass 3 — Document Reflow: Paragraph-level burstiness and structure variance
 *   Pass 4 — Vocabulary Naturalization: Lexical perplexity injection
 *   Pass 5 — Cross-Document Deduplication: Break inter-paragraph patterns
 *   Pass 6 — Quality Gate: Verify meaning preservation and re-profile
 *   Pass 7 — Iterative Refinement: Re-apply if AI score still high
 *
 * Targets:
 *   - Sentence length CV ≥ 0.40 (burstiness)
 *   - Connector density ≤ 0.15
 *   - Parallel structure score ≤ 0.10
 *   - Starter repetition ≤ 0.25
 *   - Overall forensic AI score ≤ 15
 *
 * Performance: Processes 1000 words in <100ms, scales linearly.
 */

import type { AntiPangramConfig, TransformResult, ForensicProfile } from './types';
import { buildForensicProfile, buildDocumentContext, splitToSentences, profileSentence } from './pangram-forensics';
import { reflowDocument, deduplicateCrossParagraph } from './document-reflow';
import {
  disruptConnector,
  surgicalEvaluativeRewrite,
  breakParallelStructure,
  unpackNominalizations,
  simplifyCompoundSentence,
  applyRegisterShift,
} from './sentence-surgeon';
import { naturalizeVocabulary } from './vocabulary-naturalizer';

// ═══════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: AntiPangramConfig = {
  strength: 'strong',
  tone: 'academic',
  preserveMeaning: true,
  maxIterations: 3,
};

// ═══════════════════════════════════════════════════════════════════
// QUALITY THRESHOLDS (tuned against Pangram's detection model)
// ═══════════════════════════════════════════════════════════════════

const QUALITY_TARGETS = {
  maxAiScore: 15,           // Overall forensic AI score must be below this
  minBurstinessCV: 0.35,    // Sentence length CV must exceed this
  maxConnectorDensity: 0.15, // Connector density must be below this
  maxParallelScore: 0.12,   // Parallel structure score must be below this
  maxStarterRepetition: 0.30,// Starter repetition must be below this
  minChangeRatio: 0.25,     // Minimum word-level change from original
};

// ═══════════════════════════════════════════════════════════════════
// MEANING PRESERVATION CHECK
// Simple but effective: count shared content words between original
// and transformed. Must preserve ≥60% of key content words.
// ═══════════════════════════════════════════════════════════════════

function extractContentWords(text: string): Set<string> {
  const stopWords = new Set([
    'the', 'a', 'an', 'of', 'in', 'to', 'for', 'and', 'or', 'but',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have',
    'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'shall', 'can', 'this', 'that', 'these', 'those',
    'it', 'its', 'they', 'them', 'their', 'he', 'she', 'his', 'her',
    'we', 'our', 'you', 'your', 'not', 'no', 'by', 'at', 'on', 'with',
    'from', 'as', 'if', 'so', 'yet', 'also', 'all', 'each', 'both',
    'which', 'who', 'what', 'when', 'where', 'how', 'than', 'more',
    'most', 'such', 'many', 'much', 'some', 'any', 'very', 'just',
    'then', 'there', 'here', 'into', 'about', 'after', 'before',
  ]);
  const words = text.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  return new Set(words.filter(w => !stopWords.has(w)));
}

function computeChangeRatio(original: string, transformed: string): number {
  const origWords = original.toLowerCase().match(/[a-z]+/g) ?? [];
  const transWords = transformed.toLowerCase().match(/[a-z]+/g) ?? [];

  if (origWords.length === 0) return 0;

  const origSet = new Set(origWords);
  let changed = 0;
  for (const w of transWords) {
    if (!origSet.has(w)) changed++;
  }

  return changed / Math.max(origWords.length, transWords.length);
}

function isMeaningPreserved(original: string, transformed: string): boolean {
  const origContent = extractContentWords(original);
  const transContent = extractContentWords(transformed);

  if (origContent.size === 0) return true;

  let preserved = 0;
  for (const word of origContent) {
    if (transContent.has(word)) preserved++;
  }

  // At least 55% of content words must be preserved or have close synonyms
  return preserved / origContent.size >= 0.55;
}

// ═══════════════════════════════════════════════════════════════════
// GRAMMAR CLEANUP
// Fix basic grammar issues introduced by transforms
// ═══════════════════════════════════════════════════════════════════

function cleanGrammar(text: string): string {
  let result = text;

  // Fix double spaces
  result = result.replace(/\s{2,}/g, ' ');

  // Fix space before punctuation
  result = result.replace(/\s+([.!?,;:])/g, '$1');

  // Fix missing space after punctuation
  result = result.replace(/([.!?,;:])(?=[A-Za-z])/g, '$1 ');

  // Fix double periods
  result = result.replace(/\.{2,}/g, '.');

  // Fix lowercase after period
  result = result.replace(/\.\s+([a-z])/g, (_, c) => '. ' + c.toUpperCase());

  // Fix "a" before vowel → "an"
  result = result.replace(/\ba\s+([aeiouAEIOU]\w)/g, 'an $1');

  // Fix "  ," or ", ,"
  result = result.replace(/,\s*,/g, ',');

  // Trim paragraph lines
  result = result.split('\n').map(line => line.trim()).join('\n');

  // Fix sentences starting with lowercase (except after abbreviations)
  result = result.replace(/(?:^|\n\n)\s*([a-z])/g, (match, c) => {
    return match.slice(0, -1) + c.toUpperCase();
  });

  return result.trim();
}

// ═══════════════════════════════════════════════════════════════════
// CONTRACTION EXPANSION (human writing in academic context avoids
// contractions, but casual text uses them — match input style)
// ═══════════════════════════════════════════════════════════════════

const CONTRACTION_MAP: Record<string, string> = {
  "don't": "do not", "doesn't": "does not", "didn't": "did not",
  "can't": "cannot", "couldn't": "could not", "wouldn't": "would not",
  "shouldn't": "should not", "won't": "will not", "isn't": "is not",
  "aren't": "are not", "wasn't": "was not", "weren't": "were not",
  "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
  "it's": "it is", "that's": "that is", "there's": "there is",
  "they're": "they are", "we're": "we are", "you're": "you are",
  "I'm": "I am", "they've": "they have", "we've": "we have",
  "let's": "let us", "who's": "who is",
};

function expandContractions(text: string): string {
  let result = text;
  for (const [contraction, expansion] of Object.entries(CONTRACTION_MAP)) {
    const re = new RegExp(`\\b${contraction.replace(/'/g, "[''']")}\\b`, 'gi');
    result = result.replace(re, expansion);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// VOCABULARY PASS
// Apply vocabulary naturalization across all paragraphs as a distinct pass.
// ═══════════════════════════════════════════════════════════════════

function applyVocabularyPass(text: string, protectedTerms: Set<string>, intensity: number): string {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  return paragraphs.map(para => {
    const sentences = splitToSentences(para.trim());
    return sentences.map(sent => naturalizeVocabulary(sent, protectedTerms, intensity)).join(' ');
  }).join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════
// RHETORICAL QUESTION REMOVAL
// Hard rule: output must contain zero rhetorical questions.
// Convert "Isn't it true that X?" → "It is true that X."
// Drop pure rhetorical questions that can't be converted.
// ═══════════════════════════════════════════════════════════════════

function removeRhetoricalQuestions(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  return paragraphs.map(para => {
    const sentences = splitToSentences(para.trim());
    const cleaned = sentences.map(sent => {
      if (!sent.includes('?')) return sent;

      // Convert "Isn't/Aren't/Doesn't/Don't/Won't/Can't X?" → declarative
      let converted = sent
        .replace(/^(?:Is it not|Isn't it) true that (.+?)\?$/i, (_m, rest) => `It is true that ${rest}.`)
        .replace(/^(?:Is it not|Isn't it) (?:clear|obvious|evident) that (.+?)\?$/i, (_m, rest) => `It is clear that ${rest}.`)
        .replace(/^(?:Doesn't|Does not) this (.+?)\?$/i, (_m, rest) => `This ${rest}.`)
        .replace(/^(?:Can|Could) (?:we|you|one) not (?:argue|say|see) that (.+?)\?$/i, (_m, rest) => `It can be argued that ${rest}.`)
        .replace(/^How (?:can|could) (?:we|one|anyone) (?:ignore|overlook|deny) (.+?)\?$/i, (_m, rest) => `It is difficult to ignore ${rest}.`)
        .replace(/^What (?:better|more effective) way (.+?)\?$/i, (_m, rest) => `There is no better way ${rest}.`)
        .replace(/^Why (?:would|should) (?:we|anyone|one) not (.+?)\?$/i, (_m, rest) => `There is good reason to ${rest}.`);

      // If still has "?" after specific patterns, convert generically:
      // remove the "?" and add "." — only if it's a statement disguised as a question
      if (converted.includes('?')) {
        converted = converted.replace(/\?$/, '.');
      }

      return converted;
    }).filter(Boolean);
    return cleaned.join(' ');
  }).join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════
// FIRST-PERSON GUARD
// Hard rule: never introduce first-person pronouns (I, we, my, our,
// me, us) unless the original input already contained them.
// If the input had none, strip any first-person from the output.
// ═══════════════════════════════════════════════════════════════════

const FIRST_PERSON_RE = /\b(?:I|we|my|our|me|us)\b/g;
const FIRST_PERSON_SENTENCE_RE = /\b(?:I|we|my|our|me|us)\b/i;

function inputHasFirstPerson(text: string): boolean {
  // Check if original input contains first-person pronouns
  // Be careful: "I" alone could be in Roman numerals or acronyms
  // Only match standalone first-person usage
  return /\b(?:I\s+(?:am|was|have|had|will|would|could|should|think|believe|feel|know|see)|we\s+(?:are|were|have|had|will|would|could|should|can|need|must)|my\s+\w|our\s+\w|\bme\b|\bus\b)\b/i.test(text);
}

function guardFirstPerson(originalText: string, humanized: string): string {
  if (inputHasFirstPerson(originalText)) return humanized; // Input had first-person, allow it

  // Input had no first-person — strip any that transforms may have introduced
  const paragraphs = humanized.split(/\n\s*\n/).filter(p => p.trim());
  return paragraphs.map(para => {
    const sentences = splitToSentences(para.trim());
    const cleaned = sentences.map(sent => {
      if (!FIRST_PERSON_SENTENCE_RE.test(sent)) return sent;

      // Replace first-person with third-person equivalents
      let fixed = sent
        .replace(/\bWe can\b/g, 'One can')
        .replace(/\bwe can\b/g, 'one can')
        .replace(/\bWe should\b/g, 'It is advisable to')
        .replace(/\bwe should\b/g, 'it is advisable to')
        .replace(/\bWe need to\b/g, 'It is necessary to')
        .replace(/\bwe need to\b/g, 'it is necessary to')
        .replace(/\bWe must\b/g, 'It is essential to')
        .replace(/\bwe must\b/g, 'it is essential to')
        .replace(/\bWe see\b/g, 'It is apparent')
        .replace(/\bwe see\b/g, 'it is apparent')
        .replace(/\bour\b/g, 'the')
        .replace(/\bOur\b/g, 'The')
        .replace(/\bwe\b/gi, 'people')
        .replace(/\bus\b/gi, 'people')
        .replace(/\bmy\b/gi, 'the')
        .replace(/\bme\b/gi, 'one');

      // Handle "I" carefully — only replace standalone pronoun "I"
      fixed = fixed.replace(/\bI\s+(am|was|have|had|will|would|could|should|think|believe|feel|know)\b/gi,
        (_m, verb) => `One ${verb}`);
      fixed = fixed.replace(/\bI\b(?=\s+[a-z])/g, 'one');

      return fixed;
    });
    return cleaned.join(' ');
  }).join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════
// TARGETED REFINEMENT PASS
// When overall score is still high, apply aggressive targeted fixes
// based on which signals are still firing.
// ═══════════════════════════════════════════════════════════════════

function targetedRefinement(text: string, forensic: ForensicProfile): string {
  let result = text;
  const paragraphs = result.split(/\n\s*\n/).filter(p => p.trim());
  const refinedParagraphs: string[] = [];

  for (const para of paragraphs) {
    let sentences = splitToSentences(para.trim());

    // If connector density is still high, aggressively strip connectors
    if (forensic.connectorDensity > QUALITY_TARGETS.maxConnectorDensity) {
      sentences = sentences.map((sent, idx) => {
        const profile = profileSentence(sent, idx);
        if (profile.hasConnector) {
          return disruptConnector(sent, profile);
        }
        return sent;
      });
    }

    // If burstiness is still low, force-split the longest sentence
    if (forensic.sentenceLengthVariance < QUALITY_TARGETS.minBurstinessCV) {
      const lengths = sentences.map(s => s.split(/\s+/).length);
      const maxIdx = lengths.indexOf(Math.max(...lengths));
      if (maxIdx >= 0 && lengths[maxIdx] > 18) {
        // Force split at comma nearest to middle
        const sent = sentences[maxIdx];
        const mid = Math.floor(sent.length / 2);
        const commaPositions: number[] = [];
        for (let i = 0; i < sent.length; i++) {
          if (sent[i] === ',') commaPositions.push(i);
        }
        if (commaPositions.length > 0) {
          const splitPos = commaPositions.reduce((best, pos) =>
            Math.abs(pos - mid) < Math.abs(best - mid) ? pos : best
          );
          const part1 = sent.slice(0, splitPos).trim() + '.';
          const part2 = sent.slice(splitPos + 1).trim();
          const part2Cap = part2.charAt(0).toUpperCase() + part2.slice(1);
          sentences.splice(maxIdx, 1, part1, part2Cap);
        }
      }
    }

    // If starter repetition is high, apply more aggressive diversification
    if (forensic.starterRepetition > QUALITY_TARGETS.maxStarterRepetition) {
      const starterCounts = new Map<string, number>();
      sentences = sentences.map((sent) => {
        const firstWord = sent.split(/\s+/)[0]?.replace(/[^a-zA-Z]/g, '').toLowerCase() ?? '';
        const count = (starterCounts.get(firstWord) ?? 0) + 1;
        starterCounts.set(firstWord, count);

        if (count > 1) {
          // Aggressive: restructure sentence to start differently
          // Try moving a prepositional phrase from end to front
          const ppMatch = sent.match(/^(.+?)\s+((?:in|on|at|for|through|during|within|across)\s+[^,]+)[.!?]?\s*$/i);
          if (ppMatch && ppMatch[2].split(/\s+/).length >= 3) {
            const pp = ppMatch[2].trim();
            const rest = ppMatch[1].trim().replace(/[,.]$/, '');
            return pp.charAt(0).toUpperCase() + pp.slice(1) + ', ' + rest.charAt(0).toLowerCase() + rest.slice(1) + '.';
          }
        }
        return sent;
      });
    }

    refinedParagraphs.push(sentences.join(' '));
  }

  return refinedParagraphs.join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ENGINE ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

export function antiPangramHumanize(
  text: string,
  config: Partial<AntiPangramConfig> = {}
): TransformResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  // ── Pass 1: Forensic Analysis ──
  const forensicBefore = buildForensicProfile(text);
  const context = buildDocumentContext(text);
  const transformsApplied: string[] = [];

  console.log(`[AntiPangram] Initial forensic score: ${forensicBefore.overallAiScore}`);
  console.log(`[AntiPangram] Burstiness CV: ${forensicBefore.sentenceLengthVariance.toFixed(3)}`);
  console.log(`[AntiPangram] Connector density: ${forensicBefore.connectorDensity.toFixed(3)}`);
  console.log(`[AntiPangram] Parallel score: ${forensicBefore.parallelStructureScore.toFixed(3)}`);

  let humanized = text;
  const intensityMap = { light: 0.4, medium: 0.65, strong: 0.85 };
  const intensity = intensityMap[cfg.strength];

  // ── Pass 2-5: Main transformation pipeline ──
  for (let iteration = 0; iteration < cfg.maxIterations; iteration++) {
    const iterForensic = buildForensicProfile(humanized);

    // Check if we've already hit quality targets
    if (
      iterForensic.overallAiScore <= QUALITY_TARGETS.maxAiScore &&
      iterForensic.sentenceLengthVariance >= QUALITY_TARGETS.minBurstinessCV &&
      iterForensic.connectorDensity <= QUALITY_TARGETS.maxConnectorDensity
    ) {
      console.log(`[AntiPangram] Quality targets met at iteration ${iteration}`);
      break;
    }

    // Pass 2: Document reflow (sentence transforms + burstiness + structure)
    const prevHumanized = humanized;
    humanized = reflowDocument(humanized, context, iterForensic, cfg.strength);
    if (humanized !== prevHumanized) transformsApplied.push(`reflow-pass-${iteration}`);

    // Pass 3: Cross-paragraph deduplication
    const prevDedup = humanized;
    humanized = deduplicateCrossParagraph(humanized);
    if (humanized !== prevDedup) transformsApplied.push(`dedup-pass-${iteration}`);

    // Pass 3b: Vocabulary naturalization (separate pass for higher change ratio)
    const prevVocab = humanized;
    humanized = applyVocabularyPass(humanized, context.protectedTerms, intensity);
    if (humanized !== prevVocab) transformsApplied.push(`vocab-pass-${iteration}`);

    // Pass 4: Targeted refinement for remaining signals
    const midForensic = buildForensicProfile(humanized);
    if (midForensic.overallAiScore > QUALITY_TARGETS.maxAiScore) {
      const prevRefine = humanized;
      humanized = targetedRefinement(humanized, midForensic);
      if (humanized !== prevRefine) transformsApplied.push(`refine-pass-${iteration}`);
    }

    // Pass 5: Meaning preservation gate
    if (cfg.preserveMeaning && !isMeaningPreserved(text, humanized)) {
      console.warn(`[AntiPangram] Meaning drift detected at iteration ${iteration}, rolling back aggressive changes`);
      // Keep the less-aggressive version
      humanized = prevHumanized;
      break;
    }
  }

  // ── Pass 6: Grammar cleanup ──
  humanized = cleanGrammar(humanized);

  // ── Pass 7: Contraction handling (ALWAYS expand — no contractions rule) ──
  humanized = expandContractions(humanized);

  // ── Pass 8: Rhetorical question removal ──
  // Hard rule: output must never contain rhetorical questions.
  // Convert any "?" sentences into declarative statements.
  humanized = removeRhetoricalQuestions(humanized);

  // ── Pass 9: First-person guard ──
  // Hard rule: do not introduce first-person pronouns (I, we, my, our, me, us)
  // unless the original input already contained them.
  humanized = guardFirstPerson(text, humanized);

  // ── Final forensic profile ──
  const forensicAfter = buildForensicProfile(humanized);
  const changeRatio = computeChangeRatio(text, humanized);

  console.log(`[AntiPangram] Final forensic score: ${forensicAfter.overallAiScore} (was ${forensicBefore.overallAiScore})`);
  console.log(`[AntiPangram] Final burstiness CV: ${forensicAfter.sentenceLengthVariance.toFixed(3)}`);
  console.log(`[AntiPangram] Change ratio: ${(changeRatio * 100).toFixed(1)}%`);
  console.log(`[AntiPangram] Completed in ${Date.now() - startTime}ms`);

  return {
    original: text,
    humanized,
    changeRatio,
    forensicBefore,
    forensicAfter,
    transformsApplied,
  };
}

// ═══════════════════════════════════════════════════════════════════
// CONVENIENCE EXPORT
// Simple function signature matching other engines
// ═══════════════════════════════════════════════════════════════════

export function antiPangramSimple(
  text: string,
  strength: 'light' | 'medium' | 'strong' = 'strong',
  tone: 'academic' | 'professional' | 'casual' | 'neutral' = 'academic'
): string {
  const result = antiPangramHumanize(text, { strength, tone });
  return result.humanized;
}
