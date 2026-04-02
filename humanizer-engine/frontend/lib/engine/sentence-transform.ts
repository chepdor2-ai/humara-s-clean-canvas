/**
 * Sentence-Locked Transformation Engine
 * ======================================
 *
 * Enforces STRICT constraints across all humanizer engines:
 *   - Sentence count MUST remain identical (no split, no merge)
 *   - No contractions introduced (expand any found)
 *   - No first-person insertion unless already present in input
 *   - Meaning preserved per-sentence
 *
 * Each sentence is assigned a fixed ID and transformed independently.
 * The engine rejects any transformation that would violate constraints.
 */

import { sentTokenize } from "./utils";
import {
  AI_WORD_REPLACEMENTS,
  AI_PHRASE_PATTERNS,
  CONTRACTION_EXPANSIONS,
  CONTRACTION_REGEX,
  FORMAL_CONNECTORS,
  VERB_PHRASE_SWAPS,
  MODIFIER_SWAPS,
  CLAUSE_REPHRASINGS,
  HEDGING_PHRASES,
  TRANSITION_SWAPS,
  QUANTIFIER_SWAPS,
  TEMPORAL_SWAPS,
  CAUSAL_SWAPS,
  EMPHASIS_SWAPS,
  DIVERSITY_SWAPS,
  SYNTACTIC_TEMPLATES,
  AI_STARTER_WORDS,
  NATURAL_REROUTES,
  assignStrategies,
  type SentenceStrategy,
} from "./shared-dictionaries";

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface LockedSentence {
  id: number;
  original: string;
  current: string;
  strategy: SentenceStrategy;
  paragraphIndex: number;
}

export interface InputConstraints {
  hasFirstPerson: boolean;
  hasContractions: boolean;
  sentenceCount: number;
  paragraphCount: number;
}

export interface TransformResult {
  text: string;
  sentenceCount: number;
  paragraphCount: number;
  constraintsVerified: boolean;
}

// ══════════════════════════════════════════════════════════════════════════
// INPUT FEATURE DETECTION
// ══════════════════════════════════════════════════════════════════════════

const FIRST_PERSON_RE = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/;
const CONTRACTION_DETECT_RE = /\b\w+'(?:t|s|re|ve|ll|d|m)\b/i;

export function detectConstraints(text: string): InputConstraints {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  let totalSentences = 0;
  for (const para of paragraphs) {
    totalSentences += sentTokenize(para.trim()).length;
  }

  return {
    hasFirstPerson: FIRST_PERSON_RE.test(text),
    hasContractions: CONTRACTION_DETECT_RE.test(text),
    sentenceCount: totalSentences,
    paragraphCount: paragraphs.length,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// SENTENCE LOCKING — Parse into locked sentence array
// ══════════════════════════════════════════════════════════════════════════

export function lockSentences(text: string): LockedSentence[] {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const locked: LockedSentence[] = [];
  let globalId = 0;

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const sentences = sentTokenize(paragraphs[pi].trim());
    for (const sent of sentences) {
      const trimmed = sent.trim();
      if (!trimmed) continue;
      locked.push({
        id: globalId++,
        original: trimmed,
        current: trimmed,
        strategy: "light_paraphrase", // default, will be assigned later
        paragraphIndex: pi,
      });
    }
  }

  // Assign strategies
  const lengths = locked.map(s => s.current.split(/\s+/).length);
  const strategies = assignStrategies(locked.length, lengths);
  for (let i = 0; i < locked.length; i++) {
    locked[i].strategy = strategies[i];
  }

  return locked;
}

/**
 * Reassemble locked sentences back into paragraphed text.
 * Preserves the original paragraph structure.
 */
export function unlockSentences(locked: LockedSentence[], paragraphCount: number): string {
  const paragraphs: string[][] = [];
  for (let i = 0; i < paragraphCount; i++) {
    paragraphs.push([]);
  }

  for (const sent of locked) {
    const pi = Math.min(sent.paragraphIndex, paragraphCount - 1);
    paragraphs[pi].push(sent.current);
  }

  return paragraphs
    .map(sents => sents.join(" "))
    .filter(p => p.trim())
    .join("\n\n");
}

// ══════════════════════════════════════════════════════════════════════════
// CONSTRAINT ENFORCEMENT
// ══════════════════════════════════════════════════════════════════════════

/** Expand all contractions in text */
export function enforceNoContractions(text: string): string {
  return text.replace(CONTRACTION_REGEX, (match) => {
    const expanded = CONTRACTION_EXPANSIONS[match.toLowerCase()] ?? match;
    if (match[0] === match[0].toUpperCase() && expanded[0] === expanded[0].toLowerCase()) {
      return expanded[0].toUpperCase() + expanded.slice(1);
    }
    return expanded;
  });
}

/** Remove first-person pronouns that were NOT in the original */
export function enforceNoFirstPerson(text: string, originalHadFirstPerson: boolean): string {
  if (originalHadFirstPerson) return text; // allowed
  // Remove first-person introductions
  let result = text;
  result = result.replace(/\b(We|I)\s+(can see|find|note|observe|should note|notice|argue|believe|think|suggest|conclude|contend)\s+that\s+/gi, "");
  result = result.replace(/\b(In our view|In my view|We believe|I believe|We argue|I argue|We find|I find|We note|I note|We see|I see),?\s*/gi, "");
  result = result.replace(/\b(our|my)\s+(analysis|research|findings?|study|data|results?|work|investigation)\b/gi, "the $2");
  // Don't remove first-person in other contexts (might be quoting)
  // Fix any resulting lowercase starts
  result = result.replace(/^\s*([a-z])/gm, (_, ch) => ch.toUpperCase());
  result = result.replace(/\.\s+([a-z])/g, (_, ch) => ". " + ch.toUpperCase());
  return result;
}

/** Verify sentence count matches exactly */
export function verifySentenceCount(text: string, expectedCount: number): boolean {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  let count = 0;
  for (const para of paragraphs) {
    count += sentTokenize(para.trim()).length;
  }
  return count === expectedCount;
}

/**
 * Force sentence count to match by merging or splitting as needed.
 * This is the LAST RESORT — should rarely be needed if the engine works correctly.
 */
export function forceSentenceCount(text: string, targetCount: number): string {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const allSentences: { sent: string; paraIdx: number }[] = [];

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const sents = sentTokenize(paragraphs[pi].trim());
    for (const s of sents) {
      if (s.trim()) allSentences.push({ sent: s.trim(), paraIdx: pi });
    }
  }

  const currentCount = allSentences.length;
  if (currentCount === targetCount) return text;

  // Too many sentences: merge the shortest adjacent pair using semicolons
  while (allSentences.length > targetCount && allSentences.length > 1) {
    let bestIdx = -1;
    let bestCombinedLen = Infinity;
    for (let i = 0; i < allSentences.length - 1; i++) {
      if (allSentences[i].paraIdx !== allSentences[i + 1].paraIdx) continue;
      const len = allSentences[i].sent.split(/\s+/).length + allSentences[i + 1].sent.split(/\s+/).length;
      if (len < bestCombinedLen) {
        bestCombinedLen = len;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    const s1 = allSentences[bestIdx].sent.replace(/\.\s*$/, "");
    const s2lower = allSentences[bestIdx + 1].sent[0].toLowerCase() + allSentences[bestIdx + 1].sent.slice(1);
    allSentences[bestIdx].sent = s1 + "; " + s2lower;
    allSentences.splice(bestIdx + 1, 1);
  }

  // Too few sentences: split the longest at a natural boundary
  while (allSentences.length < targetCount) {
    let longestIdx = 0;
    let longestLen = 0;
    for (let i = 0; i < allSentences.length; i++) {
      const len = allSentences[i].sent.split(/\s+/).length;
      if (len > longestLen) { longestLen = len; longestIdx = i; }
    }
    if (longestLen < 10) break;

    const sent = allSentences[longestIdx].sent;
    // Try splitting at comma + conjunction
    const splitPatterns = [/,\s+(?:and|but|which|while|although|because|since|so)\s+/i, /;\s+/];
    let didSplit = false;
    for (const sp of splitPatterns) {
      const match = sent.match(sp);
      if (match && match.index) {
        const p1Words = sent.slice(0, match.index).split(/\s+/).length;
        const p2Words = sent.slice(match.index + match[0].length).split(/\s+/).length;
        if (p1Words >= 4 && p2Words >= 4) {
          let p1 = sent.slice(0, match.index).trim();
          let p2 = sent.slice(match.index + match[0].length).trim();
          if (!p1.endsWith(".")) p1 += ".";
          p2 = p2[0].toUpperCase() + p2.slice(1);
          const pi = allSentences[longestIdx].paraIdx;
          allSentences.splice(longestIdx, 1, { sent: p1, paraIdx: pi }, { sent: p2, paraIdx: pi });
          didSplit = true;
          break;
        }
      }
    }
    if (!didSplit) break;
  }

  // Reassemble with paragraph structure
  const paraGroups: string[][] = [];
  for (let i = 0; i < paragraphs.length; i++) paraGroups.push([]);
  for (const item of allSentences) {
    const pi = Math.min(item.paraIdx, paragraphs.length - 1);
    paraGroups[pi].push(item.sent);
  }

  return paraGroups.map(sents => sents.join(" ")).filter(p => p.trim()).join("\n\n");
}

// ══════════════════════════════════════════════════════════════════════════
// PER-SENTENCE TRANSFORMATION (non-LLM, using shared dictionaries)
// ══════════════════════════════════════════════════════════════════════════

/** Apply phrase-level swaps from shared dictionaries to a single sentence */
function applyPhrasePatternsToSentence(sent: string): string {
  let result = sent;
  const allPatterns: Record<string, string[]>[] = [
    VERB_PHRASE_SWAPS, MODIFIER_SWAPS, CLAUSE_REPHRASINGS,
    HEDGING_PHRASES, TRANSITION_SWAPS, QUANTIFIER_SWAPS,
    TEMPORAL_SWAPS, CAUSAL_SWAPS, EMPHASIS_SWAPS,
  ];

  // Only apply 1-2 patterns per sentence to avoid over-transformation
  let applied = 0;
  const maxApply = 2;

  for (const dict of allPatterns) {
    if (applied >= maxApply) break;
    for (const [phrase, replacements] of Object.entries(dict)) {
      if (applied >= maxApply) break;
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "gi");
      const match = result.match(regex);
      if (match) {
        const rep = replacements[Math.floor(Math.random() * replacements.length)];
        result = result.replace(regex, (m) => {
          if (m[0] === m[0].toUpperCase() && rep[0] === rep[0].toLowerCase()) {
            return rep[0].toUpperCase() + rep.slice(1);
          }
          return rep;
        });
        applied++;
      }
    }
  }

  return result;
}

/** Kill AI vocabulary in a single sentence */
function killAIWordsInSentence(sent: string): string {
  let result = sent;

  // Kill AI phrases
  for (const [pattern, replacement] of AI_PHRASE_PATTERNS) {
    result = result.replace(pattern, (match) => {
      if (replacement === "") return "";
      if (match[0] === match[0].toUpperCase() && replacement[0] === replacement[0].toLowerCase()) {
        return replacement[0].toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }

  // Kill AI words
  result = result.replace(/\b[a-zA-Z]+\b/g, (word) => {
    const lower = word.toLowerCase();
    const replacements = AI_WORD_REPLACEMENTS[lower];
    if (!replacements) return word;
    const rep = replacements[Math.floor(Math.random() * replacements.length)];
    if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
      return rep[0].toUpperCase() + rep.slice(1);
    }
    return rep;
  });

  return result.replace(/ {2,}/g, " ").trim();
}

/** Naturalize formal connectors at the start of a sentence */
function naturalizeStartConnector(sent: string): string {
  for (const [formal, replacements] of Object.entries(FORMAL_CONNECTORS)) {
    if (sent.startsWith(formal)) {
      const rep = replacements[Math.floor(Math.random() * replacements.length)];
      return rep + sent.slice(formal.length);
    }
  }
  return sent;
}

/** Apply syntactic template to restructure a sentence internally */
function applyInternalRestructure(sent: string): string {
  // Shuffle templates for randomness
  const shuffled = [...SYNTACTIC_TEMPLATES].sort(() => Math.random() - 0.5);

  for (const template of shuffled) {
    const match = sent.match(template.pattern);
    if (match) {
      const replacement = template.replacements[Math.floor(Math.random() * template.replacements.length)];
      let result = sent.replace(template.pattern, replacement);
      // Fix capitalization
      if (result[0] && result[0] !== result[0].toUpperCase()) {
        result = result[0].toUpperCase() + result.slice(1);
      }
      // Fix ending punctuation
      const trimmed = result.trim();
      if (!/[.!?]$/.test(trimmed)) {
        result = trimmed + ".";
      }
      return result;
    }
  }

  return sent;
}

/** Inject vocabulary diversity into a sentence (replace repeated words) */
function injectDiversity(sent: string, usedWords: Set<string>): string {
  let result = sent;

  for (const [common, alternatives] of Object.entries(DIVERSITY_SWAPS)) {
    const regex = new RegExp(`\\b${common}\\b`, "gi");
    const matches = result.match(regex);
    if (matches && matches.length > 0 && usedWords.has(common)) {
      // Only replace the first occurrence of a repeated word
      let replaced = false;
      result = result.replace(regex, (match) => {
        if (replaced) return match;
        const alt = alternatives[Math.floor(Math.random() * alternatives.length)];
        replaced = true;
        if (match[0] === match[0].toUpperCase()) {
          return alt[0].toUpperCase() + alt.slice(1);
        }
        return alt;
      });
    }
    if (result.match(regex)) {
      usedWords.add(common);
    }
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN TRANSFORMATION PIPELINE
// ══════════════════════════════════════════════════════════════════════════

/**
 * Transform text using sentence-locked constraints.
 * This is the NON-LLM transformation pass used by all engines.
 */
export function sentenceLockedTransform(
  text: string,
  constraints: InputConstraints,
): TransformResult {
  // 1. Lock sentences
  const locked = lockSentences(text);
  const usedStarters = new Set<string>();
  const usedWords = new Set<string>();

  // 2. Transform each sentence according to its strategy
  for (let i = 0; i < locked.length; i++) {
    const sent = locked[i];
    let current = sent.current;

    // Per-strategy transformation
    switch (sent.strategy) {
      case "light_paraphrase":
        current = killAIWordsInSentence(current);
        current = naturalizeStartConnector(current);
        current = applyPhrasePatternsToSentence(current);
        break;

      case "restructure":
        current = killAIWordsInSentence(current);
        current = applyInternalRestructure(current);
        current = naturalizeStartConnector(current);
        break;

      case "voice_transform":
        current = killAIWordsInSentence(current);
        current = naturalizeStartConnector(current);
        // Voice transform is handled by advanced-transforms.ts — we just do phrase patterns here
        current = applyPhrasePatternsToSentence(current);
        break;

      case "phrase_heavy":
        current = killAIWordsInSentence(current);
        current = applyPhrasePatternsToSentence(current);
        current = naturalizeStartConnector(current);
        current = injectDiversity(current, usedWords);
        break;

      case "minimal_change":
        // Only kill the most obvious AI words
        current = killAIWordsInSentence(current);
        break;
    }

    // 3. Diversify starters (no duplicate starting words in a paragraph)
    const firstWord = current.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";

    // Kill AI formal starters
    if (AI_STARTER_WORDS.has(firstWord)) {
      const comma = current.indexOf(",");
      if (comma > 0 && comma < 20) {
        current = current.slice(comma + 1).trim();
        if (current[0]) current = current[0].toUpperCase() + current.slice(1);
      }
    }

    // Handle duplicate starters within same paragraph
    const currentStarter = current.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
    if (i > 0 && locked[i - 1].paragraphIndex === sent.paragraphIndex) {
      if (usedStarters.has(currentStarter) && current.split(/\s+/).length > 6) {
        const reroute = NATURAL_REROUTES[i % NATURAL_REROUTES.length];
        current = reroute + " " + current[0].toLowerCase() + current.slice(1);
      }
    }

    // Reset starters tracking at paragraph boundaries
    if (i > 0 && locked[i - 1].paragraphIndex !== sent.paragraphIndex) {
      usedStarters.clear();
    }
    usedStarters.add(current.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "");

    // 4. Enforce constraints
    if (!constraints.hasContractions) {
      current = enforceNoContractions(current);
    }
    current = enforceNoFirstPerson(current, constraints.hasFirstPerson);

    // 5. Surface polish
    current = current.replace(/ {2,}/g, " ").trim();
    current = current.replace(/,\s*,/g, ",");
    current = current.replace(/\.\s*\./g, ".");

    // Fix a/an
    current = current.replace(/\ba ([aeiouAEIOU])/g, "an $1");
    current = current.replace(/\bA ([aeiouAEIOU])/g, "An $1");
    current = current.replace(/\ban ([bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ])/g, (match, letter) => {
      return ["h"].includes(letter.toLowerCase()) ? match : "a " + letter;
    });

    // Ensure starts with capital
    if (current[0] && current[0] !== current[0].toUpperCase()) {
      current = current[0].toUpperCase() + current.slice(1);
    }

    // Ensure ends with punctuation
    if (!/[.!?]$/.test(current.trim())) {
      current = current.trim() + ".";
    }

    sent.current = current;
  }

  // 6. Reassemble
  let result = unlockSentences(locked, constraints.paragraphCount);

  // 7. Final constraint verification
  const verified = verifySentenceCount(result, constraints.sentenceCount);
  if (!verified) {
    result = forceSentenceCount(result, constraints.sentenceCount);
  }

  return {
    text: result,
    sentenceCount: constraints.sentenceCount,
    paragraphCount: constraints.paragraphCount,
    constraintsVerified: verifySentenceCount(result, constraints.sentenceCount),
  };
}

/**
 * Validate that output meets all constraints.
 * Called as a final check before returning to the user.
 */
export function validateConstraints(
  input: string,
  output: string,
  constraints: InputConstraints,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check sentence count
  const inputParas = input.split(/\n\s*\n/).filter(p => p.trim());
  const outputParas = output.split(/\n\s*\n/).filter(p => p.trim());
  let inputSentCount = 0;
  let outputSentCount = 0;
  for (const p of inputParas) inputSentCount += sentTokenize(p.trim()).length;
  for (const p of outputParas) outputSentCount += sentTokenize(p.trim()).length;

  if (inputSentCount !== outputSentCount) {
    issues.push(`Sentence count mismatch: input=${inputSentCount}, output=${outputSentCount}`);
  }

  // Check contractions
  if (!constraints.hasContractions) {
    const contractionMatch = output.match(CONTRACTION_REGEX);
    if (contractionMatch) {
      issues.push(`Contractions found: ${contractionMatch.slice(0, 3).join(", ")}`);
    }
  }

  // Check first-person injection
  if (!constraints.hasFirstPerson) {
    if (FIRST_PERSON_RE.test(output)) {
      issues.push("First-person pronouns introduced (not in original)");
    }
  }

  return { valid: issues.length === 0, issues };
}
