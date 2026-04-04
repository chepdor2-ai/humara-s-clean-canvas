/**
 * Humara ConstraintEngine — Hard constraint enforcement
 * 
 * RULES (non-negotiable):
 * 1. NO contractions in output
 * 2. NO first person (I, we, my, our) unless present in the input
 * 3. NO rogue punctuation or sentence splits
 * 4. Remove AI-giveaway patterns
 */

import blacklist from '../data/blacklist.json';
import { escapeRegex } from '../utils/helpers';

const typedBlacklist = blacklist as {
  contractions: string[];
  contractionExpansions: Record<string, string>;
  firstPersonWords: string[];
};

// ─── CONTRACTION EXPANSION ──────────────────────────────────────────────

/**
 * Expand ALL contractions to their full forms.
 * Handles case preservation.
 */
export function expandContractions(sentence: string): string {
  let output = sentence;

  // Sort by length descending to match longest contractions first
  const contractions = Object.keys(typedBlacklist.contractionExpansions)
    .sort((a, b) => b.length - a.length);

  for (const contraction of contractions) {
    const expansion = typedBlacklist.contractionExpansions[contraction];
    if (!expansion) continue;

    // Build regex with word boundary that handles apostrophes
    const pattern = new RegExp(
      `\\b${escapeRegex(contraction)}\\b`,
      'gi'
    );

    output = output.replace(pattern, (match) => {
      // Preserve case: if match starts uppercase, capitalize expansion
      if (match.charAt(0) === match.charAt(0).toUpperCase() &&
        match.charAt(0) !== match.charAt(0).toLowerCase()) {
        return expansion.charAt(0).toUpperCase() + expansion.slice(1);
      }
      return expansion;
    });
  }

  return output;
}

// ─── FIRST PERSON GUARD ─────────────────────────────────────────────────

/**
 * Check whether the sentence introduces first-person pronouns that
 * were NOT in the original input.
 */
export function hasNewFirstPerson(sentence: string, inputHadFirstPerson: boolean): boolean {
  if (inputHadFirstPerson) return false; // Input already had first person, so it is OK

  const firstPersonRegex = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/;
  return firstPersonRegex.test(sentence);
}

/**
 * Remove injected first-person pronouns from a sentence.
 * Only call this when the original input did NOT have first person.
 */
export function removeFirstPerson(sentence: string): string {
  let output = sentence;

  // Replace common first-person constructions with third-person alternatives
  const replacements: [RegExp, string][] = [
    [/\bI believe\b/gi, 'it appears'],
    [/\bI think\b/gi, 'it seems'],
    [/\bI feel\b/gi, 'one might feel'],
    [/\bI argue\b/gi, 'one could argue'],
    [/\bI suggest\b/gi, 'the suggestion here is'],
    [/\bI contend\b/gi, 'it may be contended'],
    [/\bI would argue\b/gi, 'a reasonable argument would be'],
    [/\bwe can see\b/gi, 'one can see'],
    [/\bwe need to\b/gi, 'there is a need to'],
    [/\bwe must\b/gi, 'it is necessary to'],
    [/\bwe should\b/gi, 'it would be advisable to'],
    [/\bwe have to\b/gi, 'it becomes necessary to'],
    [/\bour\b/gi, 'the'],
    [/\bwe\b/gi, 'one'],
    [/\bI\b/g, 'one'],
    [/\bme\b/gi, 'one'],
    [/\bmy\b/gi, 'the'],
    [/\bmyself\b/gi, 'oneself'],
  ];

  for (const [pattern, replacement] of replacements) {
    output = output.replace(pattern, replacement);
  }

  return output;
}

// ─── FULL CONSTRAINT ENFORCEMENT ────────────────────────────────────────

/**
 * Run all constraints on a sentence. This is the final pass.
 */
export function enforceConstraints(
  sentence: string,
  inputHadFirstPerson: boolean
): string {
  let output = sentence;

  // 1. Expand all contractions
  output = expandContractions(output);

  // 2. Remove injected first person
  if (!inputHadFirstPerson && hasNewFirstPerson(output, inputHadFirstPerson)) {
    output = removeFirstPerson(output);
  }

  // 3. Clean up double spaces and formatting artifacts
  output = output.replace(/\s{2,}/g, ' ').trim();
  // Fix double/misplaced punctuation: ",." → "." and ",," → ","
  output = output.replace(/,\s*\./g, '.').replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.').replace(/;\s*\./g, '.');
  // Remove trailing comma before sentence-ending punctuation
  output = output.replace(/,\s*([.!?])$/g, '$1');

  // 4. Ensure sentence starts with uppercase
  if (output.length > 0) {
    output = output.charAt(0).toUpperCase() + output.slice(1);
  }

  // 5. Ensure sentence ends with punctuation
  if (output.length > 0 && !/[.!?]$/.test(output)) {
    output += '.';
  }

  return output;
}
