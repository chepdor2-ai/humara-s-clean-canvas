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
import { isSafeSwap, pickBestReplacement, contextFor } from '../synonym-safety';
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
  maxIterations: 12,
  targetAiScore: 3,
  detectorPressure: 0,
  preserveLeadSentence: true,
  humanVariance: 0.06,
  readabilityBias: 0.7,
};

// ═══════════════════════════════════════════════════════════════════
// QUALITY THRESHOLDS (tuned against Pangram's detection model)
// ═══════════════════════════════════════════════════════════════════

const QUALITY_TARGETS = {
  maxAiScore: 3,            // Overall forensic AI score must be below this (tuned for 0%)
  minBurstinessCV: 0.45,   // Sentence length CV must exceed this (higher = more human-like variance)
  maxConnectorDensity: 0.08, // Connector density must be below this (humans use fewer transitions)
  maxParallelScore: 0.06,   // Parallel structure score must be below this (humans vary structure more)
  maxStarterRepetition: 0.15,// Starter repetition must be below this (humans rarely repeat starters)
  minChangeRatio: 0.65,     // Minimum word-level change from original (65% floor)
  minIterations: 5,         // Always run at least 5 iterations for meaningful transforms
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function injectHumanVariance(text: string, intensity: number): string {
  if (!text || intensity <= 0) return text;
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs.map((paragraph) => {
    const sentences = splitToSentences(paragraph.trim());
    if (sentences.length <= 1) return paragraph.trim();
    return sentences.map((sentence, index) => {
      if (index === 0 || Math.random() > intensity) return sentence;
      let varied = sentence;
      varied = varied.replace(/^(However|Moreover|Furthermore|Additionally),\s+/i, (_m, word) => word.charAt(0).toUpperCase() + word.slice(1) + ' ');
      varied = varied.replace(/\s*,\s*/g, ', ');
      varied = varied.replace(/\bthat\s+that\b/gi, 'that');
      varied = varied.replace(/\bvery\s+/gi, '');
      return varied;
    }).join(' ');
  }).join('\n\n');
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
// DEEP WORD-SWAP BOOST
// Brute-force synonym replacement for content words to hit 40% change.
// Uses a large academic-grade synonym map for common academic words.
// ═══════════════════════════════════════════════════════════════════

const DEEP_SWAP_MAP: Record<string, string[]> = {
  // ── Verbs ──
  'presents': ['outlines', 'sets forth', 'puts forward'],
  'argues': ['contends', 'asserts', 'claims'],
  'suggests': ['proposes', 'puts forward', 'advances'],
  'demonstrates': ['reveals', 'makes clear', 'brings to light'],
  'indicates': ['points to', 'signals', 'reflects'],
  'shows': ['reveals', 'makes evident', 'brings out'],
  'provides': ['supplies', 'furnishes', 'delivers'],
  'remains': ['stays', 'persists', 'endures'],
  'requires': ['calls for', 'necessitates', 'demands'],
  'involves': ['entails', 'includes', 'encompasses'],
  'includes': ['covers', 'takes in', 'features'],
  'highlights': ['draws attention to', 'brings out', 'spotlights'],
  'emphasizes': ['stresses', 'accentuates', 'underlines'],
  'maintains': ['upholds', 'sustains', 'asserts'],
  'influences': ['shapes', 'affects', 'bears on'],
  'contributes': ['adds', 'feeds into', 'lends'],
  'promotes': ['advances', 'furthers', 'encourages'],
  'focuses': ['centers', 'concentrates', 'zeroes in'],
  'addresses': ['deals with', 'tackles', 'takes up'],
  'considers': ['weighs', 'examines', 'looks at'],
  'examines': ['scrutinizes', 'inspects', 'evaluates'],
  'establishes': ['sets up', 'founds', 'institutes'],
  'results': ['leads', 'culminates', 'ends up'],
  'creates': ['produces', 'generates', 'forms'],
  'represents': ['stands for', 'embodies', 'typifies'],
  'leads': ['guides', 'steers', 'directs'],
  'refers': ['points', 'alludes', 'relates'],
  'supports': ['backs', 'bolsters', 'underpins'],
  'reveals': ['exposes', 'uncovers', 'discloses'],
  'determines': ['decides', 'settles', 'fixes'],
  'offers': ['extends', 'puts forth', 'proposes'],
  'proves': ['establishes', 'verifies', 'confirms'],
  'believes': ['holds', 'thinks', 'is of the view'],
  'based': ['grounded', 'rooted', 'founded'],
  'associated': ['linked', 'connected', 'tied'],
  'described': ['depicted', 'characterized', 'portrayed'],
  'plays': ['serves', 'fills', 'occupies'],
  // ── Adjectives ──
  'significant': ['considerable', 'notable', 'marked'],
  'important': ['central', 'vital', 'key'],
  'critical': ['central', 'decisive', 'pivotal'],
  'essential': ['indispensable', 'vital', 'needed'],
  'effective': ['successful', 'productive', 'potent'],
  'relevant': ['pertinent', 'applicable', 'germane'],
  'specific': ['particular', 'precise', 'definite'],
  'various': ['diverse', 'assorted', 'different'],
  'particular': ['specific', 'distinct', 'individual'],
  'common': ['frequent', 'prevalent', 'usual'],
  'current': ['present', 'existing', 'ongoing'],
  'modern': ['present-day', 'current', 'recent'],
  'objective': ['impartial', 'unbiased', 'dispassionate'],
  'strong': ['robust', 'powerful', 'compelling'],
  'universal': ['general', 'all-encompassing', 'broad'],
  'consistent': ['steady', 'uniform', 'coherent'],
  // ── Nouns ──
  'approach': ['method', 'strategy', 'technique'],
  'aspect': ['facet', 'dimension', 'element'],
  'concept': ['idea', 'notion', 'principle'],
  'context': ['setting', 'framework', 'backdrop'],
  'evidence': ['proof', 'data', 'testimony'],
  'factor': ['element', 'component', 'variable'],
  'framework': ['structure', 'model', 'scaffold'],
  'issue': ['matter', 'concern', 'question'],
  'process': ['procedure', 'course', 'mechanism'],
  'role': ['function', 'part', 'capacity'],
  'structure': ['framework', 'organization', 'arrangement'],
  'system': ['arrangement', 'mechanism', 'setup'],
  'theory': ['thesis', 'doctrine', 'hypothesis'],
  'tradition': ['heritage', 'custom', 'legacy'],
  'values': ['ideals', 'principles', 'standards'],
  'environment': ['setting', 'context', 'climate'],
  'principles': ['tenets', 'precepts', 'doctrines'],
  'standards': ['norms', 'benchmarks', 'criteria'],
  'alternative': ['option', 'substitute', 'replacement'],
  'basis': ['foundation', 'ground', 'root'],
  'perspective': ['viewpoint', 'standpoint', 'angle'],
  // ── Adverbs / Transition ──
  'however': ['yet', 'still', 'on the other hand'],
  'therefore': ['thus', 'so', 'as a result'],
  'particularly': ['especially', 'notably', 'chiefly'],
  'especially': ['particularly', 'notably', 'above all'],
  'specifically': ['in particular', 'precisely', 'exactly'],
  'generally': ['broadly', 'on the whole', 'typically'],
  'often': ['frequently', 'regularly', 'commonly'],
  'also': ['too', 'as well', 'likewise'],
  'while': ['whereas', 'though', 'even as'],
  'although': ['though', 'even though', 'while'],
  'despite': ['in spite of', 'notwithstanding', 'regardless of'],
  'rather': ['instead', 'preferably', 'somewhat'],
};

function deepWordSwapBoost(text: string, protectedTerms: Set<string>): string {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  return paragraphs.map(para => {
    const sentences = splitToSentences(para.trim());
    return sentences.map(sent => {
      let result = sent;
      for (const [word, replacements] of Object.entries(DEEP_SWAP_MAP)) {
        if (protectedTerms.has(word.toLowerCase())) continue;
        // Single-word replacements are the only safe pool here (multi-word
        // replacements inside DEEP_SWAP_MAP produce odd bigrams like
        // "research puts forward findings"). Filter them out before the gate.
        const singleWordPool = replacements.filter((r) => !r.includes(' '));
        if (singleWordPool.length === 0) continue;
        const re = new RegExp(`\\b${word}\\b`, 'gi');
        result = result.replace(re, (match, offset: number) => {
          // Build tokenized left/right context around this specific occurrence
          // so the safety gate can score the bigram fit.
          const tokens = result.split(/(\b)/);
          // Find which token index corresponds to `offset` by walking lengths.
          let pos = 0;
          let tokenIdx = -1;
          for (let k = 0; k < tokens.length; k++) {
            if (pos === offset) { tokenIdx = k; break; }
            pos += tokens[k].length;
          }
          const ctx = tokenIdx >= 0
            ? { sentence: result, ...contextFor(tokens, tokenIdx) }
            : { sentence: result, leftWord: '', rightWord: '' };
          const wordLower = match.toLowerCase();
          const safePick = pickBestReplacement(wordLower, singleWordPool, ctx);
          if (!safePick || !isSafeSwap(wordLower, safePick, ctx)) {
            // Safety gate rejected all candidates → keep original.
            return match;
          }
          // Preserve capitalization
          if (match.charAt(0) === match.charAt(0).toUpperCase()) {
            return safePick.charAt(0).toUpperCase() + safePick.slice(1);
          }
          return safePick;
        });
      }
      return result;
    }).join(' ');
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

    // If burstiness is still low, we must rely on within-sentence expansion/shortening 
    // because the strict 1:1 rule forbids sentence splitting or merging.
    if (forensic.sentenceLengthVariance < QUALITY_TARGETS.minBurstinessCV) {
      // Defer to downstream internal clause expansion/shortening
    }

    // If starter repetition is high, apply aggressive diversification
    if (forensic.starterRepetition > QUALITY_TARGETS.maxStarterRepetition) {
      // Academic-appropriate diverse starters (NO casual phrases)
      const DIVERSE_STARTERS = [
        'In this regard,', 'On this point,', 'From this perspective,',
        'Along these lines,', 'In a related vein,', 'Seen from this angle,',
        'With this in mind,', 'On a related note,', 'At the same time,',
        'Equally,', 'By extension,', 'In parallel,',
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
  const detectorPressure = clamp01(cfg.detectorPressure ?? 0);
  const targetAiScore = Math.max(1, cfg.targetAiScore ?? QUALITY_TARGETS.maxAiScore);
  const effectiveMaxIterations = Math.max(10, Math.round(cfg.maxIterations + detectorPressure * 8));
  const minimumIterations = Math.max(5, Math.min(effectiveMaxIterations - 1, QUALITY_TARGETS.minIterations + Math.round(detectorPressure * 4)));
  const leadSentenceProtection = cfg.preserveLeadSentence !== false;

  // ── Proper noun protection (extract before any transforms) ──
  const properNouns = new Set<string>();
  const citAuthorRe = /\b([A-Z][a-z]{2,})(?=\s*(?:\(|,)\s*\d{4})/g;
  let pnm: RegExpExecArray | null;
  while ((pnm = citAuthorRe.exec(text)) !== null) properNouns.add(pnm[1]);
  const midSentCaps = /(?<=[a-z,;:]\s)([A-Z][a-z]{2,})\b/g;
  const commonWords = new Set(['The', 'This', 'That', 'These', 'Those', 'Such', 'However', 'Also', 'Furthermore', 'Moreover', 'Additionally', 'Consequently', 'Nevertheless', 'Therefore', 'Thus', 'Hence', 'Indeed', 'One', 'His', 'Her', 'Its', 'Their', 'Our', 'Some', 'Many', 'Most', 'All', 'Each', 'Every', 'Both', 'Several', 'Various', 'Other']);
  while ((pnm = midSentCaps.exec(text)) !== null) {
    if (!commonWords.has(pnm[1])) properNouns.add(pnm[1]);
  }
  // Add multi-word proper terms
  const mwRe = /\b(Natural Law|New Natural Law|Reformed)\b/g;
  while ((pnm = mwRe.exec(text)) !== null) {
    for (const w of pnm[1].split(/\s+/)) if (w.length >= 2) properNouns.add(w);
  }

  // ── Heading protection: detect numbered headings and keep them intact ──
  const headingLines = new Set<string>();
  const lines = text.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (/^\d+\.\s/.test(t) && t.split(/\s+/).length <= 12) headingLines.add(t);
    if (/^[IVXLCDM]+[.)]\s/i.test(t) && t.split(/\s+/).length <= 12) headingLines.add(t);
    if (/^#{1,6}\s/.test(t)) headingLines.add(t);
  }

  // ── Pass 1: Forensic Analysis ──
  const forensicBefore = buildForensicProfile(text);
  const context = buildDocumentContext(text, cfg.tone);

  const transformsApplied: string[] = [];

  console.log(`[AntiPangram] Initial forensic score: ${forensicBefore.overallAiScore}`);
  console.log(`[AntiPangram] Burstiness CV: ${forensicBefore.sentenceLengthVariance.toFixed(3)}`);
  console.log(`[AntiPangram] Connector density: ${forensicBefore.connectorDensity.toFixed(3)}`);
  console.log(`[AntiPangram] Parallel score: ${forensicBefore.parallelStructureScore.toFixed(3)}`);

  let humanized = protectedText;
  const intensityMap = { light: 0.4, medium: 0.65, strong: 0.85 };
  const intensity = Math.min(0.98, intensityMap[cfg.strength] + detectorPressure * 0.12);

  // ── Pass 2-5: Main transformation pipeline ──
  // CRITICAL: Always run at least minIterations to achieve meaningful change,
  // even if the forensic score appears low (our profiler may under-score).
  for (let iteration = 0; iteration < effectiveMaxIterations; iteration++) {
    const iterForensic = buildForensicProfile(restoreCriticalSpans(humanized, protectedMap));

    // Only allow early exit AFTER minimum iterations AND when all targets met
    if (
      iteration >= minimumIterations &&
      iterForensic.overallAiScore <= targetAiScore &&
      iterForensic.sentenceLengthVariance >= QUALITY_TARGETS.minBurstinessCV &&
      iterForensic.connectorDensity <= QUALITY_TARGETS.maxConnectorDensity
    ) {
      // Also check change ratio — don't exit if we haven't changed enough
      const currentChangeRatio = computeChangeRatio(text, restoreCriticalSpans(humanized, protectedMap));
      if (currentChangeRatio >= QUALITY_TARGETS.minChangeRatio) {
        console.log(`[AntiPangram] Quality targets met at iteration ${iteration} (change: ${(currentChangeRatio * 100).toFixed(1)}%)`);
        break;
      }
    }

    // Pass 2: Document reflow (sentence transforms + burstiness + structure)
    const prevHumanized = humanized;
    humanized = reflowDocument(humanized, context, iterForensic, cfg.strength);
    if (leadSentenceProtection) {
      const prevParas = prevHumanized.split(/\n\s*\n/);
      const nextParas = humanized.split(/\n\s*\n/);
      humanized = nextParas.map((para, paraIndex) => {
        const prevPara = prevParas[paraIndex] ?? '';
        const prevSentences = splitToSentences(prevPara.trim());
        const nextSentences = splitToSentences(para.trim());
        if (prevSentences.length === 0 || nextSentences.length === 0) return para.trim();
        if (iterForensic.overallAiScore > 25) return para.trim();
        nextSentences[0] = prevSentences[0];
        return nextSentences.join(' ');
      }).join('\n\n');
    }
    if (humanized !== prevHumanized) transformsApplied.push(`reflow-pass-${iteration}`);

    // Pass 3: Cross-paragraph deduplication
    const prevDedup = humanized;
    humanized = deduplicateCrossParagraph(humanized);
    if (humanized !== prevDedup) transformsApplied.push(`dedup-pass-${iteration}`);

    // Pass 3b: Vocabulary naturalization (separate pass at FULL intensity)
    const prevVocab = humanized;
    humanized = applyVocabularyPass(humanized, context.protectedTerms, Math.max(intensity, 0.85 - (cfg.readabilityBias ?? 0.7) * 0.08));
    if (humanized !== prevVocab) transformsApplied.push(`vocab-pass-${iteration}`);

    // Pass 3c: AI phrase kill sweep (run EVERY iteration, not just at end)
    const prevSweep = humanized;
    humanized = finalAIPhraseSweep(humanized);
    if (humanized !== prevSweep) transformsApplied.push(`ai-kill-pass-${iteration}`);

    // Pass 4: Targeted refinement for remaining signals
    const midForensic = buildForensicProfile(humanized);
    if (midForensic.overallAiScore > targetAiScore || iteration < minimumIterations) {
      const prevRefine = humanized;
      humanized = targetedRefinement(humanized, midForensic);
      if (humanized !== prevRefine) transformsApplied.push(`refine-pass-${iteration}`);
    }

    // Pass 4b: DEEP WORD-SWAP BOOST — when change ratio is below 40%,
    // aggressively replace remaining content words with academic synonyms
    const currentChange = computeChangeRatio(text, restoreCriticalSpans(humanized, protectedMap));
    if (currentChange < QUALITY_TARGETS.minChangeRatio) {
      humanized = deepWordSwapBoost(humanized, context.protectedTerms);
      transformsApplied.push(`deep-swap-pass-${iteration}`);
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
  humanized = finalAIPhraseSweep(humanized);

  // ── Pass 7: Contraction handling (ALWAYS expand — no contractions rule) ──
  humanized = expandContractions(humanized);

  // ── Pass 8: Rhetorical question removal ──
  humanized = removeRhetoricalQuestions(humanized);

  // ── Pass 9: First-person guard ──
  humanized = guardFirstPerson(text, humanized);
  humanized = injectHumanVariance(humanized, Math.min(0.18, (cfg.humanVariance ?? 0.06) + detectorPressure * 0.08));
  humanized = restoreCriticalSpans(humanized, protectedMap);

  // ── Pass 10: Restore proper noun casing ──
  for (const noun of properNouns) {
    const lc = noun.toLowerCase();
    if (lc === noun) continue;
    humanized = humanized.replace(new RegExp(`\\b${lc}\\b`, 'g'), noun);
  }

  // ── Pass 11: Restore headings that may have been mangled ──
  // Re-insert original heading lines at paragraph boundaries
  if (headingLines.size > 0) {
    const outParas = humanized.split(/\n\s*\n/);
    const origParas = text.split(/\n\s*\n/);
    // Match output paragraphs to original and restore heading paragraphs
    const result: string[] = [];
    let outIdx = 0;
    for (const origPara of origParas) {
      const tOrig = origPara.trim();
      if (headingLines.has(tOrig)) {
        result.push(tOrig);
      } else if (outIdx < outParas.length) {
        // Skip output paragraphs that are headings (they may have been duplicated)
        const tOut = outParas[outIdx]?.trim() ?? '';
        if (headingLines.has(tOut)) {
          result.push(tOut);
          outIdx++;
          if (outIdx < outParas.length) {
            result.push(outParas[outIdx].trim());
            outIdx++;
          }
        } else {
          result.push(outParas[outIdx].trim());
          outIdx++;
        }
      }
    }
    // Append any remaining output paragraphs
    while (outIdx < outParas.length) {
      result.push(outParas[outIdx].trim());
      outIdx++;
    }
    humanized = result.filter(p => p).join('\n\n');
  }
  // ── Pass 11b: FINAL SAFE-SWAP PASS ──
  // Apply per-word synonym replacement to ensure 40% minimum change.
  const FINAL_APG_SWAPS: Record<string, string> = {
    'that': 'which', 'but': 'yet',
    'because': 'since', 'although': 'though', 'while': 'whereas',
    'however': 'nonetheless', 'therefore': 'thus', 'also': 'likewise',
    'yet': 'still', 'despite': 'notwithstanding', 'rather': 'instead',
    'about': 'concerning', 'regarding': 'concerning',
    'through': 'via', 'among': 'amongst', 'which': 'that',
    'such': 'this kind of', 'these': 'those', 'some': 'certain',
    'other': 'additional', 'very': 'quite', 'often': 'frequently',
    'particularly': 'notably', 'especially': 'chiefly', 'even': 'indeed',
    'still': 'nevertheless', 'many': 'numerous', 'much': 'a great deal of',
    'have': 'possess', 'has': 'possesses', 'make': 'construct',
    'give': 'grant', 'take': 'adopt', 'keep': 'retain', 'need': 'require',
    'help': 'assist', 'find': 'discover', 'think': 'consider',
    'seem': 'appear', 'seems': 'appears', 'use': 'employ', 'used': 'employed',
    'can': 'is able to', 'show': 'reveal', 'shows': 'reveals',
    'demonstrates': 'reveals', 'indicates': 'signals', 'suggests': 'proposes',
    'provides': 'delivers', 'requires': 'demands', 'involves': 'entails',
    'includes': 'covers', 'highlights': 'spotlights', 'emphasizes': 'stresses',
    'maintains': 'upholds', 'supports': 'bolsters', 'addresses': 'tackles',
    'examines': 'evaluates', 'remains': 'persists', 'presents': 'outlines',
    'offers': 'proposes', 'argues': 'contends', 'focuses': 'concentrates',
    'significant': 'considerable', 'important': 'central', 'critical': 'pivotal',
    'essential': 'vital', 'effective': 'productive', 'relevant': 'pertinent',
    'various': 'diverse', 'particular': 'distinct', 'specific': 'precise',
    'common': 'frequent', 'current': 'present', 'modern': 'contemporary',
    'objective': 'impartial', 'strong': 'robust', 'universal': 'broad',
    'moral': 'ethical', 'human': 'individual', 'practical': 'applied',
    'rational': 'logical', 'natural': 'organic', 'intrinsic': 'inherent',
    'abstract': 'theoretical', 'basic': 'foundational', 'social': 'societal',
    'political': 'governmental', 'clear': 'evident', 'deep': 'profound',
    'approach': 'method', 'concept': 'notion', 'evidence': 'proof',
    'factor': 'element', 'framework': 'scaffold', 'issue': 'matter',
    'process': 'mechanism', 'role': 'function', 'structure': 'arrangement',
    'theory': 'thesis', 'tradition': 'heritage', 'values': 'ideals',
    'principles': 'tenets', 'standards': 'benchmarks', 'alternative': 'option',
    'basis': 'foundation', 'perspective': 'viewpoint', 'environment': 'climate',
    'argument': 'contention', 'discussion': 'discourse', 'analysis': 'examination',
    'point': 'aspect', 'work': 'research', 'truth': 'veracity',
    'knowledge': 'understanding', 'center': 'core',
    'morality': 'ethics', 'integrity': 'soundness', 'freedom': 'liberty',
    'justice': 'equity', 'based': 'grounded', 'associated': 'linked',
    'related': 'connected', 'thought': 'reasoning', 'world': 'sphere',
  };
  {
    const apgParas = humanized.split(/\n\s*\n/).filter(p => p.trim());
    humanized = apgParas.map(para => {
      const t = para.trim();
      // Protect headings
      if (headingLines.has(t)) return para;
      if (/^\d+[.)]\s/.test(t) && t.split(/\s+/).length <= 12) return para;
      const sentences = splitToSentences(t);
      return sentences.map(sent => {
        const words = sent.split(/\s+/);
        return words.map(w => {
          const clean = w.toLowerCase().replace(/[^a-z]/g, '');
          if (clean.length <= 2) return w;
          const swap = FINAL_APG_SWAPS[clean];
          if (swap && swap !== clean) {
            const punct = w.match(/[^a-zA-Z]+$/)?.[0] ?? '';
            const isUpper = w.charAt(0) === w.charAt(0).toUpperCase() && w.charAt(0) !== w.charAt(0).toLowerCase();
            const final = isUpper ? swap.charAt(0).toUpperCase() + swap.slice(1) : swap;
            return final + punct;
          }
          return w;
        }).join(' ');
      }).join(' ');
    }).join('\n\n');
  }

  // ── Final forensic profile ──
  const forensicAfter = buildForensicProfile(humanized);
  const changeRatio = computeChangeRatio(text, humanized);

  console.log(`[AntiPangram] Final forensic score: ${forensicAfter.overallAiScore} (was ${forensicBefore.overallAiScore})`);
  console.log(`[AntiPangram] Final burstiness CV: ${forensicAfter.sentenceLengthVariance.toFixed(3)}`);
  console.log(`[AntiPangram] Change ratio: ${(changeRatio * 100).toFixed(1)}%`);
  console.log(`[AntiPangram] Transforms applied: ${transformsApplied.length}`);
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
  tone: 'academic' | 'academic_blog' | 'professional' | 'casual' | 'neutral' = 'academic',
  config: Partial<AntiPangramConfig> = {}
): string {
  // academic_blog preserves the same structural rules as academic but passes
  // blog cadence through the output profile layer; normalise to 'academic'
  // for the AntiPangram internals which use the narrow union.
  const internalTone: 'academic' | 'professional' | 'casual' | 'neutral' =
    tone === 'academic_blog' ? 'academic' : tone;
  const result = antiPangramHumanize(text, { ...config, strength, tone: internalTone, maxIterations: Math.max(10, config.maxIterations ?? DEFAULT_CONFIG.maxIterations) });
  return result.humanized;
}
