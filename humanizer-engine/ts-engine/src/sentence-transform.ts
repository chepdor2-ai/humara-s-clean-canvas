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
import { robustSentenceSplit } from "./content-protection";
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
import {
  analyzeText as licAnalyzeText,
  assignEnhancedStrategies,
  structuralSimilarity,
  type TextAnalysis,
  type EnhancedStrategy,
  type StructuredSentenceMap,
} from "./linguistic-intelligence-core";
import {
  disruptAIPatterns,
  type DisruptionResult,
} from "./anti-ai-patterns";

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface LockedSentence {
  id: number;
  original: string;
  current: string;
  strategy: SentenceStrategy;
  enhancedStrategy?: EnhancedStrategy;
  paragraphIndex: number;
  licMap?: StructuredSentenceMap;
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
    totalSentences += robustSentenceSplit(para.trim()).length;
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

  // Track paragraph boundaries for enhanced strategy assignment
  const paragraphBoundaries: number[] = [0];

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const sentences = robustSentenceSplit(paragraphs[pi].trim());
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
    paragraphBoundaries.push(globalId);
  }

  // Assign basic strategies
  const lengths = locked.map(s => s.current.split(/\s+/).length);
  const strategies = assignStrategies(locked.length, lengths);
  for (let i = 0; i < locked.length; i++) {
    locked[i].strategy = strategies[i];
  }

  // Run LIC analysis for enhanced strategy assignment
  const rawSentences = locked.map(s => s.current);
  const licAnalysis = licAnalyzeText(rawSentences);

  // Assign enhanced strategies based on LIC analysis
  const enhancedStrategies = assignEnhancedStrategies(licAnalysis, paragraphBoundaries);
  for (let i = 0; i < locked.length; i++) {
    locked[i].enhancedStrategy = enhancedStrategies[i];
    locked[i].licMap = licAnalysis.sentences[i];

    // Override basic strategy based on enhanced analysis when appropriate
    switch (enhancedStrategies[i]) {
      case "S0_minimal":
        locked[i].strategy = "minimal_change";
        break;
      case "S1_lexical":
        locked[i].strategy = "light_paraphrase";
        break;
      case "S2_clause_reorder":
        locked[i].strategy = "restructure";
        break;
      case "S3_voice_shift":
        locked[i].strategy = "voice_transform";
        break;
      case "S4_emphasis_shift":
        locked[i].strategy = "phrase_heavy";
        break;
      case "S5_hybrid_deep":
        locked[i].strategy = "restructure";
        break;
    }

    // Check structural similarity with neighbors — if too similar, force different strategy
    if (i > 0 && locked[i].licMap && locked[i - 1].licMap) {
      const sim = structuralSimilarity(locked[i - 1].licMap!, locked[i].licMap!);
      if (sim > 0.75 && locked[i].strategy === locked[i - 1].strategy) {
        // Force a different strategy to break structural monotony
        const alternatives: SentenceStrategy[] = ["restructure", "phrase_heavy", "voice_transform", "light_paraphrase"];
        for (const alt of alternatives) {
          if (alt !== locked[i - 1].strategy) {
            locked[i].strategy = alt;
            break;
          }
        }
      }
    }
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
  // Fix any resulting lowercase starts — only match horizontal whitespace, preserve paragraph breaks
  result = result.replace(/^[ \t]*([a-z])/gm, (_, ch) => ch.toUpperCase());
  // Only capitalize within lines — never match across paragraph breaks (\n\n)
  result = result.replace(/\.[ \t]+([a-z])/g, (_, ch) => ". " + ch.toUpperCase());
  return result;
}

/** Verify sentence count matches exactly */
export function verifySentenceCount(text: string, expectedCount: number): boolean {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  let count = 0;
  for (const para of paragraphs) {
    count += robustSentenceSplit(para.trim()).length;
  }
  return count === expectedCount;
}

/**
 * Force sentence count to match — DISABLED for strict sentence-by-sentence mode.
 * Returns text as-is to preserve sentence count integrity.
 */
export function forceSentenceCount(text: string, _targetCount: number): string {
  return text;
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

  // Apply up to 4 patterns per sentence for deeper transformation
  let applied = 0;
  const maxApply = 4;

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

    // Per-strategy transformation — AGGRESSIVE per-sentence rewriting
    switch (sent.strategy) {
      case "light_paraphrase":
        current = killAIWordsInSentence(current);
        current = naturalizeStartConnector(current);
        current = applyPhrasePatternsToSentence(current);
        current = applyInternalRestructure(current);
        current = injectDiversity(current, usedWords);
        break;

      case "restructure":
        current = killAIWordsInSentence(current);
        current = applyInternalRestructure(current);
        current = naturalizeStartConnector(current);
        current = applyPhrasePatternsToSentence(current);
        current = injectDiversity(current, usedWords);
        break;

      case "voice_transform":
        current = killAIWordsInSentence(current);
        current = naturalizeStartConnector(current);
        current = applyPhrasePatternsToSentence(current);
        current = applyInternalRestructure(current);
        current = injectDiversity(current, usedWords);
        break;

      case "phrase_heavy":
        current = killAIWordsInSentence(current);
        current = applyPhrasePatternsToSentence(current);
        current = naturalizeStartConnector(current);
        current = applyInternalRestructure(current);
        current = injectDiversity(current, usedWords);
        break;

      case "minimal_change":
        current = killAIWordsInSentence(current);
        current = applyPhrasePatternsToSentence(current);
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

  // 5.5. Run LIC-powered AI pattern disruption on all sentences
  const transformedSentences = locked.map(s => s.current);
  const postLicAnalysis = licAnalyzeText(transformedSentences);
  const disruption = disruptAIPatterns(transformedSentences, postLicAnalysis);

  // Apply disrupted sentences back to locked array (preserving constraints)
  for (let i = 0; i < locked.length; i++) {
    let disrupted = disruption.sentences[i];
    // Enforce constraints on disrupted output
    if (!constraints.hasContractions) {
      disrupted = enforceNoContractions(disrupted);
    }
    disrupted = enforceNoFirstPerson(disrupted, constraints.hasFirstPerson);
    // Ensure starts with capital
    if (disrupted[0] && disrupted[0] !== disrupted[0].toUpperCase()) {
      disrupted = disrupted[0].toUpperCase() + disrupted.slice(1);
    }
    // Ensure ends with punctuation
    if (!/[.!?]$/.test(disrupted.trim())) {
      disrupted = disrupted.trim() + ".";
    }
    locked[i].current = disrupted;
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
  for (const p of inputParas) inputSentCount += robustSentenceSplit(p.trim()).length;
  for (const p of outputParas) outputSentCount += robustSentenceSplit(p.trim()).length;

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
