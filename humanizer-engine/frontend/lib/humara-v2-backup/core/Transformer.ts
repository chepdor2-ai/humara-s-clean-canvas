/**
 * Humara Transformer — Phrase-level, word-level, and structural transforms
 * 
 * IMPORTANT:
 * - Phrase-level replacements > word-level (avoids awkward synonym swaps)
 * - No sentence splitting or merging
 * - Structural changes only within a single sentence
 */

import phraseBank from '../data/phraseBank.json';
import patterns from '../data/patterns.json';
import blacklist from '../data/blacklist.json';
import { pickRandom, escapeRegex, hashString } from '../utils/helpers';
import { capitalizeFirst, extractTrailingPunctuation } from '../utils/tokenizer';

type PhraseBankType = Record<string, string[]>;
const typedPhraseBank = phraseBank as PhraseBankType;
const typedBlacklist = blacklist as {
  aiSignatureWords: string[];
  aiSignatureReplacements: Record<string, string[]>;
  crazyPhrases: string[];
};
const typedPatterns = patterns as {
  aiTransitionPatterns: string[];
  aiStarterPatterns: string[];
  naturalTransitions: string[];
  naturalStarters: string[];
  naturalPunctuationPatterns: {
    semicolonPhrases: string[];
    dashPhrases: string[];
  };
};

// ─── PHRASE-LEVEL REPLACEMENT ───────────────────────────────────────────

/**
 * Replace known AI-typical phrases with natural alternatives.
 * Phrase bank is sorted by length (longest first) to avoid partial matches.
 * Uses word boundaries to prevent matching inside larger words.
 */
export function replacePhrases(sentence: string): string {
  let output = sentence;

  // Sort phrase keys by length descending — match longest phrases first
  const sortedKeys = Object.keys(typedPhraseBank).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    // Use regex with word boundaries to avoid matching inside compounds
    const regex = new RegExp(`(?<![a-zA-Z])${escapeRegex(key)}(?![a-zA-Z])`, 'gi');
    const match = regex.exec(output);

    if (match) {
      const variations = typedPhraseBank[key];
      if (variations && variations.length > 0) {
        const replacement = pickRandom(variations);
        // Preserve original casing of first char
        const originalSegment = match[0];
        const startsUpper = originalSegment.charAt(0) === originalSegment.charAt(0).toUpperCase() &&
          originalSegment.charAt(0) !== originalSegment.charAt(0).toLowerCase();
        const finalReplacement = startsUpper ? capitalizeFirst(replacement) : replacement;
        output = output.substring(0, match.index) + finalReplacement + output.substring(match.index + match[0].length);
      }
    }
  }

  return output;
}

// ─── AI SIGNATURE WORD SCRUBBING ────────────────────────────────────────

/**
 * Replace AI-signature words (delve, underscore, pivotal, etc.)
 * with natural alternatives.
 * Uses strict word boundaries to avoid breaking compound words like "implementation".
 */
export function scrubAIWords(sentence: string): string {
  let output = sentence;

  for (const word of typedBlacklist.aiSignatureWords) {
    // Use negative lookahead/lookbehind to ensure we match only standalone words
    // Not "implement" inside "implementation" or "transform" inside "transformative"
    const regex = new RegExp(`(?<![a-zA-Z])${escapeRegex(word)}(?![a-zA-Z])`, 'gi');
    if (regex.test(output)) {
      // Reset lastIndex after test
      regex.lastIndex = 0;
      const replacements = typedBlacklist.aiSignatureReplacements[word];
      if (replacements && replacements.length > 0) {
        const replacement = pickRandom(replacements);
        output = output.replace(regex, (match) => {
          const startsUpper = match.charAt(0) === match.charAt(0).toUpperCase() &&
            match.charAt(0) !== match.charAt(0).toLowerCase();
          return startsUpper ? capitalizeFirst(replacement) : replacement;
        });
      }
    }
  }

  return output;
}

// ─── TRANSITION REPLACEMENT ─────────────────────────────────────────────

/**
 * Replace AI-typical sentence transitions with natural ones.
 */
export function replaceTransitions(sentence: string): string {
  const trimmed = sentence.trimStart();

  for (const aiTransition of typedPatterns.aiTransitionPatterns) {
    if (trimmed.toLowerCase().startsWith(aiTransition.toLowerCase())) {
      const replacement = pickRandom(typedPatterns.naturalTransitions);
      return replacement + ' ' + trimmed.substring(aiTransition.length).trimStart();
    }
  }

  for (const aiStarter of typedPatterns.aiStarterPatterns) {
    if (trimmed.toLowerCase().startsWith(aiStarter.toLowerCase())) {
      const replacement = pickRandom(typedPatterns.naturalStarters);
      // Replace the starter phrase, continuing with the rest
      const rest = trimmed.substring(aiStarter.length).trimStart();
      return capitalizeFirst(replacement) + ' ' + rest;
    }
  }

  return sentence;
}

// ─── RESTRUCTURING (NO SPLIT) ───────────────────────────────────────────

/**
 * Restructure a sentence by moving clauses, without creating new sentences.
 * Only applies safe clause-movement patterns.
 * Improved: more patterns, safer grammar preservation.
 */
export function restructure(sentence: string): string {
  const { text, punctuation } = extractTrailingPunctuation(sentence);
  const finalPunct = punctuation || '.';

  // Skip very short sentences — restructuring will degrade them
  if (text.split(/\s+/).length < 6) return sentence;

  // Skip sentences with protected placeholders
  if (text.includes('⟦PROT_')) return sentence;

  // Pattern 1: "X because Y" → "Because Y, X"
  const becauseMatch = text.match(/^(.+?)\s+because\s+(.+)$/i);
  if (becauseMatch && becauseMatch[1].length > 10 && becauseMatch[2].length > 5) {
    return `Because ${becauseMatch[2].trim()}, ${becauseMatch[1].trim().replace(/^\w/, c => c.toLowerCase())}${finalPunct}`;
  }

  // Pattern 2: "X while Y" → "While Y, X"
  const whileMatch = text.match(/^(.+?)\s+while\s+(.+)$/i);
  if (whileMatch && whileMatch[1].length > 10 && whileMatch[2].length > 5) {
    return `While ${whileMatch[2].trim()}, ${whileMatch[1].trim().replace(/^\w/, c => c.toLowerCase())}${finalPunct}`;
  }

  // Pattern 3: "X although Y" → "Although Y, X"
  const althoughMatch = text.match(/^(.+?)\s+although\s+(.+)$/i);
  if (althoughMatch && althoughMatch[1].length > 10 && althoughMatch[2].length > 5) {
    return `Although ${althoughMatch[2].trim()}, ${althoughMatch[1].trim().replace(/^\w/, c => c.toLowerCase())}${finalPunct}`;
  }

  // Pattern 4: "When X, Y" → "Y when X" (reverse fronting)
  const whenFrontMatch = text.match(/^When\s+(.+?),\s+(.+)$/i);
  if (whenFrontMatch) {
    return `${capitalizeFirst(whenFrontMatch[2].trim())} when ${whenFrontMatch[1].trim().replace(/^\w/, c => c.toLowerCase())}${finalPunct}`;
  }

  // Pattern 5: "If X, then Y" → "Y if X"
  const ifThenMatch = text.match(/^If\s+(.+?),\s+then\s+(.+)$/i);
  if (ifThenMatch) {
    return `${capitalizeFirst(ifThenMatch[2].trim())} if ${ifThenMatch[1].trim().replace(/^\w/, c => c.toLowerCase())}${finalPunct}`;
  }

  // Pattern 6: "Since X, Y" → "Y since X"
  const sinceFrontMatch = text.match(/^Since\s+(.+?),\s+(.+)$/i);
  if (sinceFrontMatch && sinceFrontMatch[1].length > 5 && sinceFrontMatch[2].length > 5) {
    return `${capitalizeFirst(sinceFrontMatch[2].trim())} since ${sinceFrontMatch[1].trim().replace(/^\w/, c => c.toLowerCase())}${finalPunct}`;
  }

  // Pattern 7: "As X, Y" → "Y, as X"
  const asFrontMatch = text.match(/^As\s+(.+?),\s+(.+)$/i);
  if (asFrontMatch && asFrontMatch[1].length > 5 && asFrontMatch[2].length > 5) {
    return `${capitalizeFirst(asFrontMatch[2].trim())}, as ${asFrontMatch[1].trim().replace(/^\w/, c => c.toLowerCase())}${finalPunct}`;
  }

  // Pattern 8: "X, however, Y" → "Y; however, X"
  const howeverMidMatch = text.match(/^(.+?),\s+however,\s+(.+)$/i);
  if (howeverMidMatch && howeverMidMatch[1].length > 10 && howeverMidMatch[2].length > 5) {
    if (hashString(sentence) % 3 < 1) {
      return `${capitalizeFirst(howeverMidMatch[2].trim())}; that said, ${howeverMidMatch[1].trim().replace(/^\w/, c => c.toLowerCase())}${finalPunct}`;
    }
  }

  // Pattern 9: "X; therefore, Y" → "Y because X" (only sometimes)
  const thereforeMatch = text.match(/^(.+?);\s*therefore,?\s+(.+)$/i);
  if (thereforeMatch && hashString(sentence) % 3 < 1) {
    return `${capitalizeFirst(thereforeMatch[2].trim())} because ${thereforeMatch[1].trim().replace(/^\w/, c => c.toLowerCase())}${finalPunct}`;
  }

  // Pattern 10: Safe comma clause swap — "A, B" → "B, and A" (only if both parts are substantial)
  const commaIdx = text.indexOf(', ');
  if (commaIdx > 15 && commaIdx < text.length - 15) {
    const partA = text.substring(0, commaIdx);
    const partB = text.substring(commaIdx + 2);
    // Only swap if neither part has parentheses or brackets
    if (!partA.includes('(') && !partB.includes(')') && !partA.includes('[') && !partB.includes(']') && partB.length > 10) {
      // Low probability: only 30% of the time
      if (hashString(sentence) % 10 < 3) {
        return `${capitalizeFirst(partB.trim())}, ${partA.trim().replace(/^\w/, c => c.toLowerCase())}${finalPunct}`;
      }
    }
  }

  // No restructuring applied, return original
  return sentence;
}

// ─── EMPHASIS VARIATION ─────────────────────────────────────────────────

/**
 * Add subtle emphasis or hedging to a sentence.
 * Makes it sound more like natural human academic writing.
 */
export function addEmphasis(sentence: string): string {
  const { text, punctuation } = extractTrailingPunctuation(sentence);
  const finalPunct = punctuation || '.';
  const hash = hashString(sentence);

  // Pool of hedges and emphasis markers
  const hedges = [
    'In a sense, ',
    'To a degree, ',
    'Arguably, ',
    'In practice, ',
    'Broadly speaking, ',
    'On balance, ',
    'In many cases, ',
    'Looking at the evidence, ',
    'From a practical standpoint, ',
    'In the broader picture, ',
  ];

  const midInserts = [
    ', at least in part,',
    ', to some degree,',
    ', in practical terms,',
    ', broadly speaking,',
    ', as it stands,',
  ];

  const tailEmphasis = [
    ', and this point deserves attention',
    ', which carries real weight',
    ', a factor that should not be dismissed',
    ' — and this merits reflection',
  ];

  const choice = hash % 10;

  if (choice < 4) {
    // Add a hedge at the start
    const hedge = hedges[hash % hedges.length];
    return hedge + text.replace(/^\w/, c => c.toLowerCase()) + finalPunct;
  } else if (choice < 7) {
    // Insert mid-sentence qualifier after first comma
    const commaIdx = text.indexOf(', ');
    if (commaIdx > 5 && commaIdx < text.length - 10) {
      const insert = midInserts[hash % midInserts.length];
      return text.substring(0, commaIdx) + insert + ' ' + text.substring(commaIdx + 2) + finalPunct;
    }
    // Fallback: add hedge at start
    const hedge = hedges[(hash + 3) % hedges.length];
    return hedge + text.replace(/^\w/, c => c.toLowerCase()) + finalPunct;
  } else {
    // Add tail emphasis
    const tail = tailEmphasis[hash % tailEmphasis.length];
    return text + tail + finalPunct;
  }
}

// ─── MINIMAL TRANSFORM ─────────────────────────────────────────────────

/**
 * Apply only light changes: scrub AI words and do phrase replacements,
 * but avoid structural changes.
 */
export function minimalTransform(sentence: string): string {
  let result = scrubAIWords(sentence);
  result = replacePhrases(result);
  return result;
}

// ─── CRAZY PHRASE REMOVAL ───────────────────────────────────────────────

/**
 * Remove or replace cliché / "crazy" phrases that sound unnatural.
 */
export function removeCrazyPhrases(sentence: string): string {
  let output = sentence;

  for (const phrase of typedBlacklist.crazyPhrases) {
    const regex = new RegExp(`(?<![a-zA-Z])${escapeRegex(phrase)}(?![a-zA-Z])`, 'gi');
    if (regex.test(output)) {
      regex.lastIndex = 0;
      // Remove the crazy phrase, clean up punctuation
      output = output.replace(regex, '').replace(/\s{2,}/g, ' ').trim();
    }
  }

  return output;
}

// ─── GRAMMAR REPAIR ─────────────────────────────────────────────────────

/**
 * Fix common grammar issues introduced by phrase replacements.
 * This runs AFTER all transforms to catch broken patterns.
 */
export function repairGrammar(sentence: string): string {
  let output = sentence;

  // Fix "a [adjective]" where noun was lost (e.g., "requires a complete that encompasses")
  output = output.replace(/\ba\s+(complete|thorough|broad|overall|whole|full|strong|solid|reliable|detailed)\s+that\b/gi, (_, adj) => {
    return `a ${adj} approach that`;
  });

  // Fix "[preposition] [bare-verb]" → "[preposition] [verb-ing]"
  output = output.replace(/\b(should be on|needs to be on|focus on|emphasis on|aimed at|dedicated to)\s+([a-z]+)\b/gi, (match, prep, verb) => {
    if (verb.endsWith('ing')) return match;
    if (/^(the|a|an|this|that|these|those|each|every|some|any|all)\b/i.test(verb)) return match;
    if (verb.endsWith('e') && !verb.endsWith('ee')) return `${prep} ${verb.slice(0, -1)}ing`;
    if (/[^aeiou][aeiou][bcdfghlmnprst]$/i.test(verb) && verb.length <= 5) return `${prep} ${verb}${verb.slice(-1)}ing`;
    return `${prep} ${verb}ing`;
  });

  // Fix "first of its kind [noun]" → "remarkable [noun]"
  output = output.replace(/\bfirst of its kind\s+(rate|level|pace|speed|scale|degree|growth|volume)/gi, (_, noun) => `remarkable ${noun}`);
  output = output.replace(/\bnever before seen\s+(rate|level|pace|speed|scale|degree|growth|volume)/gi, (_, noun) => `extraordinary ${noun}`);
  output = output.replace(/\bwithout prior example\s+(rate|level|pace|speed|scale|degree|growth|volume)/gi, (_, noun) => `exceptional ${noun}`);
  output = output.replace(/\bunmatched in history\s+(rate|level|pace|speed|scale|degree|growth|volume)/gi, (_, noun) => `record-setting ${noun}`);

  // Fix "evidence points to [subject] [verb]" → "evidence suggests that [subject] [verb]"
  output = output.replace(/\bpoints to\s+([A-Za-z]+)\s+(are|is|was|were|can|could|will|would|have|has|had|do|does|did)\b/gi, (_, subject, verb) => {
    return `suggests that ${subject} ${verb}`;
  });

  // Fix "evidence points to that" → "evidence indicates that"
  output = output.replace(/\bpoints to that\b/gi, 'indicates that');

  // Fix double articles: "a a", "the the", "an an"
  output = output.replace(/\b(a|an|the)\s+\1\b/gi, '$1');

  // Fix "to to" doubling
  output = output.replace(/\bto\s+to\b/gi, 'to');

  // Fix orphaned commas at sentence start
  output = output.replace(/^,\s*/g, '');

  // Fix double spaces
  output = output.replace(/\s{2,}/g, ' ');

  // Fix space before punctuation 
  output = output.replace(/\s+([.,;:!?])/g, '$1');

  return output.trim();
}
