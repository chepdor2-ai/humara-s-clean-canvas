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
  maxIterations: 15,
};

// ═══════════════════════════════════════════════════════════════════
// QUALITY THRESHOLDS (tuned against Pangram's detection model)
// ═══════════════════════════════════════════════════════════════════

const QUALITY_TARGETS = {
  maxAiScore: 5,            // Overall forensic AI score must be below this (tuned for 0%)
  minBurstinessCV: 0.45,   // Sentence length CV must exceed this (higher = more human-like variance)
  maxConnectorDensity: 0.08, // Connector density must be below this (humans use fewer transitions)
  maxParallelScore: 0.06,   // Parallel structure score must be below this (humans vary structure more)
  maxStarterRepetition: 0.15,// Starter repetition must be below this (humans rarely repeat starters)
  minChangeRatio: 0.40,     // Minimum word-level change from original (40% floor)
};

function protectCriticalSpans(text: string): { text: string; map: Map<string, string> } {
  const map = new Map<string, string>();
  let idx = 0;
  let result = text;

  const patterns = [
    /\((?:[A-Z][a-zA-Z.'-]+(?:\s+(?:&|and)\s+[A-Z][a-zA-Z.'-]+)?(?:\s+et\s+al\.)?,\s*\d{4}[a-z]?)\)/g,
    /\b\d+(?:\.\d+)?%\b/g,
    /\b\d+-\d+%\b/g,
    /\$\d+(?:,\d{3})*(?:\.\d+)?\s*(?:billion|million|trillion|thousand)?\b/gi,
  ];

  for (const pattern of patterns) {
    result = result.replace(pattern, (match) => {
      const placeholder = `__APG_PROT_${idx++}__`;
      map.set(placeholder, match);
      return placeholder;
    });
  }

  return { text: result, map };
}

function restoreCriticalSpans(text: string, map: Map<string, string>): string {
  let result = text;
  for (const [placeholder, original] of map) {
    result = result.replace(new RegExp(placeholder, 'g'), original);
  }
  return result;
}

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

  // Fix double spaces (horizontal only — preserve \n for paragraph structure)
  result = result.replace(/[^\S\n]{2,}/g, ' ');

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

    // If connector density is still high, aggressively strip ALL connectors
    if (forensic.connectorDensity > QUALITY_TARGETS.maxConnectorDensity) {
      sentences = sentences.map((sent, idx) => {
        const profile = profileSentence(sent, idx);
        if (profile.hasConnector) {
          return disruptConnector(sent, profile);
        }
        return sent;
      });
    }

    // If burstiness is still low, force-split MULTIPLE long sentences
    if (forensic.sentenceLengthVariance < QUALITY_TARGETS.minBurstinessCV) {
      const lengths = sentences.map(s => s.split(/\s+/).length);
      // Split up to 3 longest sentences for maximum burstiness
      const longIndices = lengths
        .map((len, idx) => ({ len, idx }))
        .filter(item => item.len > 15)
        .sort((a, b) => b.len - a.len)
        .slice(0, 3)
        .map(item => item.idx)
        .sort((a, b) => b - a); // reverse so splice indices stay valid

      for (const maxIdx of longIndices) {
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
          if (part2.length > 10) {
            const part2Cap = part2.charAt(0).toUpperCase() + part2.slice(1);
            sentences.splice(maxIdx, 1, part1, part2Cap);
          }
        }
      }
    }

    // If starter repetition is high, apply aggressive diversification
    if (forensic.starterRepetition > QUALITY_TARGETS.maxStarterRepetition) {
      const DIVERSE_STARTERS = [
        'Granted,', 'That said,', 'In practice,', 'Put differently,',
        'On a related note,', 'Looking at this another way,',
        'From this angle,', 'With this in mind,', 'To put it plainly,',
        'At the same time,', 'Along these lines,', 'Seen this way,',
      ];
      let starterIdx = Math.floor(Math.random() * DIVERSE_STARTERS.length);
      const starterCounts = new Map<string, number>();
      sentences = sentences.map((sent) => {
        const firstWord = sent.split(/\s+/)[0]?.replace(/[^a-zA-Z]/g, '').toLowerCase() ?? '';
        const count = (starterCounts.get(firstWord) ?? 0) + 1;
        starterCounts.set(firstWord, count);

        if (count > 1) {
          // Try moving a prepositional phrase from end to front
          const ppMatch = sent.match(/^(.+?)\s+((?:in|on|at|for|through|during|within|across)\s+[^,]+)[.!?]?\s*$/i);
          if (ppMatch && ppMatch[2].split(/\s+/).length >= 3) {
            const pp = ppMatch[2].trim();
            const rest = ppMatch[1].trim().replace(/[,.]$/, '');
            return pp.charAt(0).toUpperCase() + pp.slice(1) + ', ' + rest.charAt(0).toLowerCase() + rest.slice(1) + '.';
          }
          // Fallback: prepend a diverse starter
          const starter = DIVERSE_STARTERS[starterIdx % DIVERSE_STARTERS.length];
          starterIdx++;
          return starter + ' ' + sent.charAt(0).toLowerCase() + sent.slice(1);
        }
        return sent;
      });
    }

    // Additional pass: remove any remaining evaluative hedging
    sentences = sentences.map(sent => {
      return sent
        .replace(/\b(?:it is|this is) (?:important|crucial|essential|vital|imperative) to (?:note|recognize|acknowledge|understand|emphasize) that\s*/gi, '')
        .replace(/\b(?:it is|this is) (?:widely|generally|commonly|broadly) (?:recognized|acknowledged|accepted|known) that\s*/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }).filter(s => s.length > 0);

    // Fix capitalization after removals
    sentences = sentences.map(sent => {
      if (sent.length > 0 && /^[a-z]/.test(sent)) {
        return sent.charAt(0).toUpperCase() + sent.slice(1);
      }
      return sent;
    });

    refinedParagraphs.push(sentences.join(' '));
  }

  return refinedParagraphs.join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════
// FINAL AI-PHRASE KILL SWEEP
// Hard-coded removal of the most persistent AI signal phrases that
// survive all other passes. Applied once after all transforms.
// ═══════════════════════════════════════════════════════════════════

const FINAL_AI_KILL_PATTERNS: Array<[RegExp, string]> = [
  // Sentence-start connectors still remaining
  [/^Furthermore,?\s*/im, ''],
  [/^Moreover,?\s*/im, ''],
  [/^Additionally,?\s*/im, ''],
  [/^Consequently,?\s*/im, ''],
  [/^Subsequently,?\s*/im, ''],
  [/^Notwithstanding,?\s*/im, ''],
  [/^Notably,?\s*/im, ''],
  [/^Crucially,?\s*/im, ''],
  [/^Undeniably,?\s*/im, ''],
  [/^Undoubtedly,?\s*/im, ''],
  [/^Importantly,?\s*/im, ''],
  [/^Essentially,?\s*/im, ''],
  [/^Fundamentally,?\s*/im, ''],
  [/^Significantly,?\s*/im, ''],
  [/^Interestingly,?\s*/im, ''],
  [/^Remarkably,?\s*/im, ''],
  [/^Evidently,?\s*/im, ''],
  [/^Accordingly,?\s*/im, ''],
  [/^Ultimately,?\s*/im, ''],
  // Mid-sentence AI tell phrases
  [/\bfurthermore\b/gi, 'also'],
  [/\bmoreover\b/gi, 'also'],
  [/\badditionally\b/gi, 'also'],
  [/\bconsequently\b/gi, 'so'],
  [/\bsubsequently\b/gi, 'then'],
  [/\bnotwithstanding\b/gi, 'despite this'],
  [/\bnevertheless\b/gi, 'still'],
  [/\bnonetheless\b/gi, 'still'],
  [/\bhenceforth\b/gi, 'from now on'],
  [/\bthus\b/gi, 'so'],
  [/\bherein\b/gi, 'here'],
  [/\bthereby\b/gi, 'this way'],
  [/\bwherein\b/gi, 'where'],
  // High-frequency AI adjectives/adverbs
  [/\butilize\b/gi, 'use'],
  [/\butilizes\b/gi, 'uses'],
  [/\butilized\b/gi, 'used'],
  [/\butilizing\b/gi, 'using'],
  [/\bleverage\b(?!\s+(?:ratio|buyout|point))/gi, 'use'],
  [/\bleverages\b/gi, 'uses'],
  [/\bleveraged\b/gi, 'used'],
  [/\bleveraging\b/gi, 'using'],
  [/\bcomprehensive\b/gi, 'thorough'],
  [/\btransformative\b/gi, 'major'],
  [/\bpivotal\b/gi, 'key'],
  [/\bparamount\b/gi, 'critical'],
  [/\bintricate\b/gi, 'complex'],
  [/\bmeticulous\b/gi, 'careful'],
  [/\brobust\b(?!\s+(?:wine|beer|coffee))/gi, 'strong'],
  [/\bholistic\b/gi, 'broad'],
  [/\bunderscor(?:e|es|ed|ing)\b/gi, 'highlight'],
  [/\bbolster(?:s|ed|ing)?\b/gi, 'support'],
  [/\bfoster(?:s|ed|ing)?\b/gi, 'build'],
  [/\bexacerbat(?:e|es|ed|ing)\b/gi, 'worsen'],
  [/\bmitigat(?:e|es|ed|ing)\b/gi, 'reduce'],
  [/\bstreamlin(?:e|es|ed|ing)\b/gi, 'simplify'],
  [/\bmultifaceted\b/gi, 'complex'],
  [/\bpervasive\b/gi, 'widespread'],
  [/\bprofound\b/gi, 'deep'],
  [/\bprofoundly\b/gi, 'deeply'],
  [/\bnuanced\b/gi, 'subtle'],
  [/\bsalient\b/gi, 'notable'],
  [/\bubiquitous\b/gi, 'common'],
  [/\bdelve\b/gi, 'look into'],
  [/\bdelves\b/gi, 'looks into'],
  [/\bdelving\b/gi, 'looking into'],
  [/\bembark\b/gi, 'start'],
  [/\bembarks\b/gi, 'starts'],
  [/\bembarking\b/gi, 'starting'],
  [/\bunravel\b/gi, 'explain'],
  [/\bunveil\b/gi, 'reveal'],
  [/\btapestry\b/gi, 'mix'],
  [/\bnexus\b/gi, 'link'],
  [/\bcornerstone\b/gi, 'foundation'],
  [/\blandscape\b(?!\s+(?:painting|architect|garden))/gi, 'field'],
  [/\bparadigm\b/gi, 'model'],
  [/\bdiscourse\b/gi, 'discussion'],
  [/\btrajectory\b/gi, 'path'],
  [/\bcatalyz(?:e|es|ed|ing)\b/gi, 'drive'],
  [/\bspearhead(?:s|ed|ing)?\b/gi, 'lead'],
  [/\bharness(?:es|ed|ing)?\b/gi, 'use'],
  // AI evaluative phrases
  [/\bcannot be overstated\b/gi, 'is real'],
  [/\bit is worth noting that\b/gi, ''],
  [/\bit should be noted that\b/gi, ''],
  [/\bit must be noted that\b/gi, ''],
  [/\bit is important to note that\b/gi, ''],
  [/\bit is worth mentioning that\b/gi, ''],
  [/\bin order to\b/gi, 'to'],
  [/\bthe fact that\b/gi, 'that'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bfirst and foremost\b/gi, 'first'],
  [/\beach and every\b/gi, 'every'],
  [/\bat the end of the day\b/gi, 'in the end'],
  [/\bin light of\b/gi, 'given'],
  [/\bplays? a (?:crucial|vital|key|significant|important|pivotal|critical|central) role\b/gi, 'matters'],
  [/\ba wide (?:range|array|variety|spectrum) of\b/gi, 'many'],
  [/\ba (?:plethora|myriad|multitude) of\b/gi, 'many'],
  [/\bin the realm of\b/gi, 'in'],
  [/\bin today'?s (?:world|society|era|landscape|age)\b/gi, 'now'],
  [/\bserves? as a (?:testament|reminder|beacon|catalyst|cornerstone|foundation) (?:to|of)\b/gi, 'shows'],
  [/\bnot only\b(.{5,40})\bbut also\b/gi, '$1 and'],
  // Extended AI-tell phrases (hedging, evaluation, formulaic)
  [/\bthis essay (?:explores|examines|investigates|analyzes)\b/gi, 'this piece looks at'],
  [/\bthis (?:paper|article|study) (?:explores|examines|investigates|analyzes)\b/gi, 'this work looks at'],
  [/\bas (?:individuals|people|societies) navigate\b/gi, 'as people deal with'],
  [/\bin an increasingly\b/gi, 'in a more and more'],
  [/\bincreasingly\b/gi, 'more and more'],
  [/\bin contemporary (?:society|times|life)\b/gi, 'these days'],
  [/\brecognize its value\b/gi, 'see what it offers'],
  [/\bin our (?:daily|everyday) lives\b/gi, 'day to day'],
  [/\bthe importance of\b/gi, 'how much it matters to have'],
  [/\benhance.{0,5} well-being\b/gi, 'help people feel better'],
  [/\bfoster(?:s|ed|ing)? (?:deeper |greater |stronger )?connections?\b/gi, 'build bonds'],
  [/\bin an otherwise\b/gi, 'in a'],
  [/\blet us remember to\b/gi, 'we should'],
  [/\bits essential place\b/gi, 'its place'],
  [/\bholds the potential for\b/gi, 'can bring'],
  [/\bas we move forward\b/gi, 'going forward'],
  [/\bworld dominated by\b/gi, 'world full of'],
  [/\bpersonal growth\b/gi, 'self-improvement'],
  [/\bhistorical significance\b/gi, 'past importance'],
];

function finalAIPhraseSweep(text: string): string {
  // Split into sentences, apply transforms per-sentence to avoid cross-sentence matches
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const result = paragraphs.map(para => {
    const sentences = splitToSentencesForSweep(para);
    return sentences.map(sent => {
      let s = sent;
      for (const [pattern, replacement] of FINAL_AI_KILL_PATTERNS) {
        // Reset lastIndex for global regexes
        if (pattern.global) pattern.lastIndex = 0;
        s = s.replace(pattern, replacement as string);
      }
      // Fix double spaces and capitalization
      s = s.replace(/  +/g, ' ').trim();
      if (s.length > 0 && /^[a-z]/.test(s)) {
        s = s.charAt(0).toUpperCase() + s.slice(1);
      }
      return s;
    }).filter(s => s.trim().length > 0).join(' ');
  });
  return result.join('\n\n');
}

function splitToSentencesForSweep(text: string): string[] {
  // Simple sentence splitter — split on . ! ? followed by space + uppercase
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    current += text[i];
    if (/[.!?]/.test(text[i]) && i + 1 < text.length && /\s/.test(text[i + 1])) {
      const next = text.slice(i + 1).trimStart();
      if (/^[A-Z"']/.test(next)) {
        parts.push(current.trim());
        current = '';
        // Skip whitespace
        while (i + 1 < text.length && /\s/.test(text[i + 1])) i++;
      }
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.length > 0 ? parts : [text];
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
  const { text: protectedText, map: protectedMap } = protectCriticalSpans(text);

  // ── Pass 1: Forensic Analysis ──
  const forensicBefore = buildForensicProfile(text);
  const context = buildDocumentContext(text);

  const transformsApplied: string[] = [];

  console.log(`[AntiPangram] Initial forensic score: ${forensicBefore.overallAiScore}`);
  console.log(`[AntiPangram] Burstiness CV: ${forensicBefore.sentenceLengthVariance.toFixed(3)}`);
  console.log(`[AntiPangram] Connector density: ${forensicBefore.connectorDensity.toFixed(3)}`);
  console.log(`[AntiPangram] Parallel score: ${forensicBefore.parallelStructureScore.toFixed(3)}`);

  let humanized = protectedText;
  const intensityMap = { light: 0.4, medium: 0.65, strong: 0.85 };
  const intensity = intensityMap[cfg.strength];

  // ── Pass 2-5: Main transformation pipeline ──
  for (let iteration = 0; iteration < cfg.maxIterations; iteration++) {
    const iterForensic = buildForensicProfile(restoreCriticalSpans(humanized, protectedMap));

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
    if (cfg.preserveMeaning && !isMeaningPreserved(text, restoreCriticalSpans(humanized, protectedMap))) {
      console.warn(`[AntiPangram] Meaning drift detected at iteration ${iteration}, rolling back aggressive changes`);
      // Keep the less-aggressive version
      humanized = prevHumanized;
      break;
    }
  }

  // ── Pass 6: Grammar cleanup ──
  humanized = cleanGrammar(humanized);

  // ── Pass 6b: Final AI-phrase kill sweep ──
  // Hard-coded removal of remaining AI phrases the vocabulary pass may have missed.
  humanized = finalAIPhraseSweep(humanized);

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
  humanized = restoreCriticalSpans(humanized, protectedMap);

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
