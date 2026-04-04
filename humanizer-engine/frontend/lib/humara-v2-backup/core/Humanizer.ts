/**
 * Humara Humanizer — Main Orchestrator
 * =====================================
 * Production-ready humanization engine.
 * 
 * Pipeline:
 * 1. Detect input features (contractions, first person, etc.)
 * 2. Split into sentences (with count lock)
 * 3. Parse each sentence
 * 4. Plan strategies (varying per sentence)
 * 5. Transform each sentence according to strategy
 * 6. Enforce hard constraints (no contractions, no rogue first person)
 * 7. Apply coherence fixes (dedup, burstiness, flow)
 * 8. Enforce sentence count lock
 * 9. Final cleanup and return
 */

import { splitSentences, enforceSentenceCount, isSentenceSafe } from './SentenceLock';
import { parseSentence, type ParsedSentence } from './Parser';
import { planStrategies, type Strategy, type StrategyDecision } from './StrategyEngine';
import {
  replacePhrases,
  scrubAIWords,
  replaceTransitions,
  restructure,
  addEmphasis,
  minimalTransform,
  removeCrazyPhrases,
  repairGrammar,
} from './Transformer';
import { enforceConstraints } from './ConstraintEngine';
import { applyCoherenceFixes, findAwkwardSentences } from './Coherence';
import { splitParagraphs, joinParagraphs } from '../utils/helpers';
import {
  protectContent,
  restoreContent,
  extractTopicKeywords,
  protectTopicKeywords,
  type ProtectionMap,
} from './ContentProtection';

// ─── INPUT FEATURE DETECTION ────────────────────────────────────────────

interface InputFeatures {
  hasContractions: boolean;
  hasFirstPerson: boolean;
  hasRhetoricalQuestions: boolean;
  paragraphCount: number;
  sentenceCount: number;
}

const CONTRACTION_PATTERN = /\b(don't|can't|won't|wouldn't|shouldn't|couldn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|doesn't|didn't|I'm|I've|I'll|I'd|you're|you've|you'll|you'd|he's|she's|it's|we're|we've|we'll|we'd|they're|they've|they'll|they'd|that's|who's|what's|where's|let's)\b/i;
const FIRST_PERSON_PATTERN = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/;

function detectInputFeatures(text: string): InputFeatures {
  return {
    hasContractions: CONTRACTION_PATTERN.test(text),
    hasFirstPerson: FIRST_PERSON_PATTERN.test(text),
    hasRhetoricalQuestions: /\?\s/.test(text) || text.trimEnd().endsWith('?'),
    paragraphCount: splitParagraphs(text).length,
    sentenceCount: splitSentences(text).length,
  };
}

// ─── HUMANIZE OPTIONS ───────────────────────────────────────────────────

export interface HumaraOptions {
  /** Transformation strength */
  strength?: 'light' | 'medium' | 'heavy';
  /** Output tone */
  tone?: 'academic' | 'neutral' | 'casual';
  /** Whether to strictly preserve meaning (limits restructuring) */
  strictMeaning?: boolean;
}

// ─── SINGLE SENTENCE TRANSFORM ──────────────────────────────────────────

function transformSentence(
  sentence: string,
  parsed: ParsedSentence,
  strategy: StrategyDecision,
  features: InputFeatures,
  options: HumaraOptions
): string {
  let result = sentence;

  // Always remove crazy phrases regardless of strategy
  result = removeCrazyPhrases(result);

  switch (strategy.strategy) {
    case 'unchanged':
      // Only scrub AI words, no other changes
      result = scrubAIWords(result);
      break;

    case 'minimal':
      result = minimalTransform(result);
      break;

    case 'lexical':
      result = scrubAIWords(result);
      result = replacePhrases(result);
      result = replaceTransitions(result);
      break;

    case 'restructure':
      result = scrubAIWords(result);
      result = replacePhrases(result);
      if (!options.strictMeaning) {
        result = restructure(result);
      }
      break;

    case 'emphasis':
      result = scrubAIWords(result);
      result = replacePhrases(result);
      result = addEmphasis(result);
      break;

    case 'ai_scrub':
      result = scrubAIWords(result);
      result = replacePhrases(result);
      result = replaceTransitions(result);
      break;
  }

  // Safety check: ensure we did not accidentally split the sentence
  if (!isSentenceSafe(sentence, result)) {
    // Revert to just AI scrubbing if the transform broke the sentence
    result = scrubAIWords(sentence);
    result = replacePhrases(result);
  }

  return result;
}

// ─── MULTI-PASS QUALITY CHECK ───────────────────────────────────────────

function qualityCheck(
  sentences: string[],
  originalSentences: string[]
): string[] {
  const result = [...sentences];

  // Find awkward sentences and revert them to originals with minimal transform
  const awkwardIndices = findAwkwardSentences(result);
  for (const idx of awkwardIndices) {
    if (idx < originalSentences.length) {
      // Revert to original with just AI scrubbing
      result[idx] = scrubAIWords(originalSentences[idx]);
      result[idx] = replacePhrases(result[idx]);
    }
  }

  return result;
}

// ─── MAIN HUMANIZE FUNCTION ─────────────────────────────────────────────

/**
 * Humanize text using the Humara engine.
 * 
 * This is the primary entry point. It processes text paragraph by paragraph,
 * sentence by sentence, applying varied strategies to defeat AI detectors
 * while maintaining meaning and natural readability.
 */
export function humaraHumanize(text: string, options: HumaraOptions = {}): string {
  if (!text || !text.trim()) return text;

  const opts: Required<HumaraOptions> = {
    strength: options.strength ?? 'medium',
    tone: options.tone ?? 'neutral',
    strictMeaning: options.strictMeaning ?? false,
  };

  // Step 0: Extract topic keywords from the ORIGINAL text
  const topicKeywords = extractTopicKeywords(text);

  // Step 0b: Protect sensitive content (figures, citations, brackets, etc.)
  const { sanitized: protectedText, map: contentMap } = protectContent(text);

  // Step 0c: Protect topic keywords
  const { sanitized: fullyProtected, map: keywordMap } = protectTopicKeywords(protectedText, topicKeywords);

  // Combined protection map (for restoration later)
  const allProtections: ProtectionMap[] = [...contentMap, ...keywordMap];

  // Step 1: Detect input features on ORIGINAL text
  const features = detectInputFeatures(text);

  // Step 2: Process paragraph by paragraph to preserve structure
  const paragraphs = splitParagraphs(fullyProtected);
  const humanizedParagraphs: string[] = [];

  for (const paragraph of paragraphs) {
    // Step 3: Split into sentences with count lock
    const originalSentences = splitSentences(paragraph);
    const originalCount = originalSentences.length;

    if (originalCount === 0) {
      humanizedParagraphs.push(paragraph);
      continue;
    }

    // Step 4: Parse each sentence
    const parsed: ParsedSentence[] = originalSentences.map(s => parseSentence(s));

    // Step 5: Plan strategies
    const strategyPlan = planStrategies(parsed, features.hasFirstPerson);

    // Adjust strategy aggressiveness based on strength setting
    const adjustedPlan = strategyPlan.map(decision => {
      if (opts.strength === 'light') {
        // Downgrade heavy strategies
        if (decision.strategy === 'restructure' || decision.strategy === 'emphasis') {
          return { ...decision, strategy: 'minimal' as Strategy };
        }
      } else if (opts.strength === 'heavy') {
        // Upgrade unchanged to minimal
        if (decision.strategy === 'unchanged') {
          return { ...decision, strategy: 'lexical' as Strategy };
        }
      }
      return decision;
    });

    // Step 6: Transform each sentence
    let transformed = originalSentences.map((sentence, i) =>
      transformSentence(sentence, parsed[i], adjustedPlan[i], features, opts)
    );

    // Step 6b: Grammar repair — fix broken patterns from phrase replacements
    transformed = transformed.map(s => repairGrammar(s));

    // Step 7: Enforce hard constraints on every sentence
    transformed = transformed.map(s =>
      enforceConstraints(s, features.hasFirstPerson)
    );

    // Step 8: Apply coherence fixes across sentences
    transformed = applyCoherenceFixes(transformed);

    // Step 9: Quality check — revert broken sentences
    transformed = qualityCheck(transformed, originalSentences);

    // Step 10: Re-enforce constraints after coherence fixes
    transformed = transformed.map(s =>
      enforceConstraints(s, features.hasFirstPerson)
    );

    // Step 11: Lock sentence count
    transformed = enforceSentenceCount(transformed, originalCount, originalSentences);

    humanizedParagraphs.push(transformed.join(' '));
  }

  // Step 12: Rejoin paragraphs
  let result = joinParagraphs(humanizedParagraphs);

  // Step 13: Restore ALL protected content (topic keywords + figures/citations/etc.)
  result = restoreContent(result, allProtections);

  return result;
}
