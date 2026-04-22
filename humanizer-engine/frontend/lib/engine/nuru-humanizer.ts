/**
 * Nuru Humanizer Engine v3 â€” Pure Non-LLM Per-Sentence Independent Processing
 * =============================================================================
 *
 * ARCHITECTURE (mirrors Omega but zero LLM calls):
 *   Phase 1 â€” PRE-ANALYSIS
 *     â€¢ Detect first-person usage in input (preserve only if present)
 *     â€¢ Extract paragraphs â†’ identify titles/headings â†’ extract sentences
 *     â€¢ Classify each sentence: protected, needs-error, needs-starter, strategy assignment
 *     â€¢ 10 transformation strategies assigned RANDOMLY (not cycling)
 *
 *   Phase 2 â€” INDEPENDENT PROCESSING
 *     â€¢ Each sentence processed independently through its randomly assigned strategy
 *     â€¢ Each strategy applies different combinations of transforms
 *     â€¢ 60% word-change enforcement with escalating transform passes
 *
 *   Phase 3 â€” REASSEMBLY + POST-PROCESSING
 *     â€¢ Reassemble sentences into paragraphs
 *     â€¢ Apply error injection + starter variation to marked sentences
 *     â€¢ 7-phase post-processing: AI word kill, AI phrase kill, starter kill,
 *       contraction kill, uniformity break, final cleanup, second AI word sweep
 *
 *   STRICT OUTPUT RULES:
 *     â€¢ NO contractions â€” ever
 *     â€¢ NO first person unless the input contained first person
 *     â€¢ NO colloquial, humorous, or informal phrases
 *     â€¢ Target: 0% AI detection score
 */

import { validateAndRepairOutput } from "./validation-post-process";
import {
  applyAIWordKill,
  applyPhrasePatterns,
  applySyntacticTemplate,
  applyConnectorNaturalization,
  expandAllContractions,
  diversifyStarters,
  fixCapitalization,
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
  perSentenceAntiDetection,
  deepCleaningPass,
  cleanSentenceStarters,
  fixPunctuation,
} from './shared-dictionaries';
import {
  voiceShift,
  deepRestructure,
  tenseVariation,
} from './advanced-transforms';
import { robustSentenceSplit, humanizeTitle } from './content-protection';
import { enforceSingleSentence } from './sentence-surgery';

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PHASE 0: PROPER NOUN & CITATION AUTHOR PROTECTION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Extract proper nouns from source text so we can restore their casing
 * after all transforms. Covers:
 *   - Citation authors: Crowe (2019), Finnis (2011), Murphy (2001)
 *   - Capitalized words NOT at sentence start (Hill, Calvin, Luther)
 *   - Multi-word proper names (John Lawrence Hill, Natural Law)
 */
function extractProperNouns(text: string): Set<string> {
  const properNouns = new Set<string>();

  // 1. Citation authors: "Author (Year)" or "Author, Year" patterns
  const citAuthorRe = /\b([A-Z][a-z]{2,})(?=\s*(?:\(|,)\s*\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = citAuthorRe.exec(text)) !== null) {
    properNouns.add(m[1]);
  }

  // 2. "Author and Author" / "Author & Author" before year
  const multiAuthorRe = /\b([A-Z][a-z]{2,})\s+(?:and|&)\s+([A-Z][a-z]{2,})(?=\s*(?:\(|,)\s*\d{4})/g;
  while ((m = multiAuthorRe.exec(text)) !== null) {
    properNouns.add(m[1]);
    properNouns.add(m[2]);
  }

  // 3. Capitalized words mid-sentence (not after period+space or start of text)
  //    These are likely proper nouns: Hill, Calvin, Luther, Reformed
  const midSentCaps = /(?<=[a-z,;:]\s)([A-Z][a-z]{2,})\b/g;
  while ((m = midSentCaps.exec(text)) !== null) {
    const word = m[1];
    // Skip common sentence-start words that might appear after semicolons
    const commonWords = new Set(['The', 'This', 'That', 'These', 'Those', 'Such', 'However', 'Also', 'Furthermore', 'Moreover', 'Additionally', 'Consequently', 'Nevertheless', 'Nonetheless', 'Therefore', 'Thus', 'Hence', 'Indeed', 'Notably', 'Specifically', 'One', 'His', 'Her', 'Its', 'Their', 'Our', 'Some', 'Many', 'Most', 'All', 'Each', 'Every', 'Both', 'Several', 'Various', 'Other']);
    if (!commonWords.has(word)) {
      properNouns.add(word);
    }
  }

  // 4. Known multi-word proper terms that must stay capitalized
  const multiWordProper = /\b(Natural Law|New Natural Law|Reformed)\b/g;
  while ((m = multiWordProper.exec(text)) !== null) {
    // Add each word individually
    for (const w of m[1].split(/\s+/)) {
      if (w.length >= 2) properNouns.add(w);
    }
  }

  return properNouns;
}

/**
 * Restore proper noun casing in processed text.
 * For each known proper noun, find its lowercased version and restore it.
 */
function restoreProperNounCasing(text: string, properNouns: Set<string>): string {
  let result = text;
  for (const noun of properNouns) {
    // Replace lowercase version with proper-cased version
    const lc = noun.toLowerCase();
    if (lc === noun) continue; // already lowercase (shouldn't happen)
    // Use word-boundary matching to avoid partial replacements
    const re = new RegExp(`\\b${lc}\\b`, 'g');
    result = result.replace(re, noun);
  }
  return result;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PHASE 1: PRE-ANALYSIS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/** Detect whether the input text contains first-person pronouns. */
function detectFirstPerson(text: string): boolean {
  return /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/i.test(text);
}

/** Split text into paragraphs, ensuring headings are separated from body text. */
function extractParagraphs(text: string): string[] {
  // First split on double newlines
  const rawParagraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const result: string[] = [];

  for (const para of rawParagraphs) {
    // If a paragraph contains single newlines, check if any line is a heading
    // that should be separated from the body text below it
    const lines = para.split('\n');
    if (lines.length <= 1) {
      result.push(para);
      continue;
    }

    // Walk through lines: split off heading lines as separate paragraphs
    let bodyLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (isProtectedLine(trimmed) && bodyLines.length === 0) {
        // Heading at the start â€” push as its own paragraph
        result.push(trimmed);
      } else if (isProtectedLine(trimmed) && bodyLines.length > 0) {
        // Heading after body lines â€” flush body, then push heading
        result.push(bodyLines.join(' '));
        bodyLines = [];
        result.push(trimmed);
      } else {
        bodyLines.push(trimmed);
      }
    }
    if (bodyLines.length > 0) {
      result.push(bodyLines.join(' '));
    }
  }

  return result;
}

/** Check if a line is a heading, title, or structural marker. */
function isProtectedLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  // Markdown headings
  if (/^#{1,6}\s/.test(t)) return true;
  // Roman numeral headings: I. II. III. etc.
  if (/^[IVXLCDM]+[.)]\s/i.test(t)) return true;
  // Section keyword headings (standalone only, not followed by body text)
  if (/^(?:Part|Section|Chapter|Abstract|Introduction|Conclusion|References|Bibliography|Appendix)\s*$/i.test(t)) return true;
  // Numbered/lettered headings: "1." "2)" "A." etc.
  // Also match headings ending with period like "3. Evaluation of the Book Critically."
  if (/^[\d]+[.):\-]\s/.test(t) || /^[A-Za-z][.)]\s/.test(t)) {
    const words = t.split(/\s+/);
    // Treat as heading if short (<=12 words)
    if (words.length <= 12) return true;
  }
  const words = t.split(/\s+/);
  // ALL-CAPS lines (4+ chars) that are short
  if (words.length <= 12 && t === t.toUpperCase() && /[A-Z]/.test(t) && t.length >= 4) return true;
  // Short lines (<=3 words) without ending punctuation â€” likely headings
  if (words.length <= 3 && !/[.!?]$/.test(t)) return true;
  return false;
}

/** Extract sentences from a paragraph using robust splitting (handles abbreviations, decimals, URLs). */
function extractSentences(paragraph: string): string[] {
  return robustSentenceSplit(paragraph);
}

/** Deterministic hash for sentence-specific randomness. */
function hashSentence(s: string, salt: number = 0): number {
  let h = salt;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Classification for each sentence. */
interface SentenceClassification {
  text: string;
  index: number;
  paragraphIndex: number;
  localIndex: number;
  isProtected: boolean;
  assignedStrategy: number;
  shouldInjectError: boolean;
  shouldVaryStarter: boolean;
  seed: number;
}

/**
 * Classify every sentence: protected? error injection? starter variance?
 * Strategy assignment is RANDOM (hash-based), not cycling.
 */
function classifySentences(paragraphs: string[]): {
  classifications: SentenceClassification[];
  paragraphMap: Map<number, number[]>;
  protectedParagraphs: Map<number, string>;
} {
  const classifications: SentenceClassification[] = [];
  const paragraphMap = new Map<number, number[]>();
  const protectedParagraphs = new Map<number, string>();
  let globalIndex = 0;

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx];
    if (!para) {
      protectedParagraphs.set(pIdx, '');
      continue;
    }
    if (isProtectedLine(para)) {
      protectedParagraphs.set(pIdx, para);
      continue;
    }

    const sentences = extractSentences(para);
    const indices: number[] = [];

    for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
      const sent = sentences[sIdx];
      const gIdx = globalIndex++;
      const seed = hashSentence(sent, gIdx);
      const wordCount = sent.split(/\s+/).length;
      const isShort = wordCount < 4;

      // Randomly assign one of 10 strategies using hash
      const assignedStrategy = seed % 10;

      // ~40% get error injection
      const shouldInjectError = !isShort && ((seed * 11 + gIdx * 7 + gIdx * gIdx) % 100) < 40;

      // ~30% get starter variation
      const shouldVaryStarter = !isShort && ((seed * 13 + gIdx * 3) % 100) < 12;

      classifications.push({
        text: sent,
        index: gIdx,
        paragraphIndex: pIdx,
        localIndex: sIdx,
        isProtected: isShort,
        assignedStrategy,
        shouldInjectError,
        shouldVaryStarter,
        seed,
      });
      indices.push(classifications.length - 1);
    }
    paragraphMap.set(pIdx, indices);
  }

  return { classifications, paragraphMap, protectedParagraphs };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// DICTIONARY-BASED REPLACEMENTS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function applySwapDict(sentence: string, dict: Record<string, string[]>, seed: number): string {
  let result = sentence;
  for (const [phrase, replacements] of Object.entries(dict)) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (re.test(result)) {
      const pick = replacements[(seed + phrase.length) % replacements.length];
      result = result.replace(re, (match) => {
        if (match[0] === match[0].toUpperCase()) {
          return pick.charAt(0).toUpperCase() + pick.slice(1);
        }
        return pick;
      });
    }
  }
  return result;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 10 TRANSFORMATION STRATEGIES â€” each applies different transform combos
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

type Strategy = (sentence: string, seed: number) => string;

/** Safe wrapper for applySyntacticTemplate â€” reverts if output is garbled */
function safeSyntacticTemplate(sentence: string): string {
  const result = applySyntacticTemplate(sentence);
  return isGarbledSentence(result) ? sentence : result;
}

/** Safe wrapper for deepRestructure â€” reverts if output is garbled */
function safeDeepRestructure(sentence: string, intensity: number): string {
  const result = deepRestructure(sentence, intensity);
  return isGarbledSentence(result) ? sentence : result;
}

/** Strategy 0: Analytical rewriter â€” clause rephrasings + verb swaps + restructure */
function strategyAnalytical(sentence: string, seed: number): string {
  let s = applyAIWordKill(sentence);
  s = applySwapDict(s, CLAUSE_REPHRASINGS, seed);
  s = applySwapDict(s, VERB_PHRASE_SWAPS, seed + 1);
  s = safeDeepRestructure(s, 0.6);
  if (seed % 10 < 5) s = safeSyntacticTemplate(s);
  return s;
}

/** Strategy 1: Formal academic â€” phrase patterns + causal + temporal */
function strategyFormalAcademic(sentence: string, seed: number): string {
  let s = applyAIWordKill(sentence);
  s = applyPhrasePatterns(s);
  s = applySwapDict(s, CAUSAL_SWAPS, seed);
  s = applySwapDict(s, TEMPORAL_SWAPS, seed + 1);
  s = applySwapDict(s, TRANSITION_SWAPS, seed + 2);
  if (seed % 10 < 6) s = safeSyntacticTemplate(s);
  return s;
}

/** Strategy 2: Simplification â€” hedging removal + modifier simplification */
function strategySimplification(sentence: string, seed: number): string {
  let s = applyAIWordKill(sentence);
  s = applySwapDict(s, HEDGING_PHRASES, seed);
  s = applySwapDict(s, MODIFIER_SWAPS, seed + 1);
  s = applySwapDict(s, QUANTIFIER_SWAPS, seed + 2);
  s = applySwapDict(s, EMPHASIS_SWAPS, seed + 3);
  s = s.replace(/\b(in order to)\b/gi, 'to');
  s = s.replace(/\b(due to the fact that)\b/gi, 'because');
  s = s.replace(/\b(for the purpose of)\b/gi, 'to');
  s = s.replace(/\b(with regard to)\b/gi, 'about');
  s = s.replace(/\b(in the event that)\b/gi, 'if');
  s = s.replace(/\b(it is important to note that)\b/gi, '');
  s = applyConnectorNaturalization(s);
  return s;
}

/** Strategy 3: Voice shift heavy â€” passive voice + restructure */
function strategyVoiceShift(sentence: string, seed: number): string {
  let s = applyAIWordKill(sentence);
  const shifted = voiceShift(s, 0.5);
  // Revert voice shift if it produced garbled output
  s = isGarbledSentence(shifted) ? s : shifted;
  const restructured = safeDeepRestructure(s, 0.35);
  // Extra garble check after deep restructure
  s = isGarbledSentence(restructured) ? s : restructured;
  s = applyPhrasePatterns(s);
  s = applySwapDict(s, CAUSAL_SWAPS, seed);
  if (seed % 10 < 7) s = safeSyntacticTemplate(s);
  return s;
}

/** Strategy 4: Traditional scholarly â€” semicolons + measured phrasing */
function strategyTraditional(sentence: string, seed: number): string {
  let s = applyAIWordKill(sentence);
  s = applyPhrasePatterns(s);
  s = applySwapDict(s, CLAUSE_REPHRASINGS, seed);
  s = applySwapDict(s, VERB_PHRASE_SWAPS, seed + 1);
  if (s.length > 60 && seed % 5 < 2) {
    s = s.replace(/,\s*(and|but)\s+/i, (_, conj) => {
      if (conj.toLowerCase() === 'and') return '; in addition, ';
      return '; yet, ';
    });
  }
  s = applySwapDict(s, TEMPORAL_SWAPS, seed + 2);
  s = safeDeepRestructure(s, 0.4);
  return s;
}

/** Strategy 5: Direct academic â€” connector naturalization + diversity */
function strategyDirect(sentence: string, seed: number): string {
  let s = applyAIWordKill(sentence);
  s = applyConnectorNaturalization(s);
  s = applySwapDict(s, MODIFIER_SWAPS, seed);
  s = applySwapDict(s, DIVERSITY_SWAPS, seed + 1);
  s = applySwapDict(s, EMPHASIS_SWAPS, seed + 2);
  if (seed % 10 < 4) s = safeSyntacticTemplate(s);
  return s;
}

/** Strategy 6: Deep restructure â€” maximum structural change */
function strategyDeepRestructure(sentence: string, seed: number): string {
  let s = applyAIWordKill(sentence);
  s = safeDeepRestructure(s, 0.45);
  s = voiceShift(s, 0.3);
  s = applySwapDict(s, VERB_PHRASE_SWAPS, seed);
  s = applySwapDict(s, CLAUSE_REPHRASINGS, seed + 1);
  s = applySwapDict(s, TRANSITION_SWAPS, seed + 2);
  s = safeSyntacticTemplate(s);
  return s;
}

/** Strategy 7: Precision rewrite â€” causal + quantifier + temporal */
function strategyPrecision(sentence: string, seed: number): string {
  let s = applyAIWordKill(sentence);
  s = applyPhrasePatterns(s);
  s = applySwapDict(s, CAUSAL_SWAPS, seed);
  s = applySwapDict(s, QUANTIFIER_SWAPS, seed + 1);
  s = applySwapDict(s, TEMPORAL_SWAPS, seed + 2);
  s = applySwapDict(s, MODIFIER_SWAPS, seed + 3);
  if (seed % 10 < 5) s = safeDeepRestructure(s, 0.5);
  return s;
}

/** Strategy 8: Full sweep â€” all dictionaries */
function strategyFullSweep(sentence: string, seed: number): string {
  let s = applyAIWordKill(sentence);
  s = applyPhrasePatterns(s);
  s = applySwapDict(s, VERB_PHRASE_SWAPS, seed);
  s = applySwapDict(s, MODIFIER_SWAPS, seed + 1);
  s = applySwapDict(s, CLAUSE_REPHRASINGS, seed + 2);
  s = applySwapDict(s, HEDGING_PHRASES, seed + 3);
  s = applySwapDict(s, TRANSITION_SWAPS, seed + 4);
  s = applySwapDict(s, DIVERSITY_SWAPS, seed + 5);
  s = applyConnectorNaturalization(s);
  if (seed % 10 < 6) s = safeSyntacticTemplate(s);
  return s;
}

/** Strategy 9: Measured scholarly â€” emphasis + hedging + voice */
function strategyMeasured(sentence: string, seed: number): string {
  let s = applyAIWordKill(sentence);
  s = applySwapDict(s, EMPHASIS_SWAPS, seed);
  s = applySwapDict(s, HEDGING_PHRASES, seed + 1);
  s = voiceShift(s, 0.4);
  s = applySwapDict(s, CAUSAL_SWAPS, seed + 2);
  s = applySwapDict(s, TEMPORAL_SWAPS, seed + 3);
  s = safeDeepRestructure(s, 0.5);
  return s;
}

const STRATEGIES: Strategy[] = [
  strategyAnalytical,
  strategyFormalAcademic,
  strategySimplification,
  strategyVoiceShift,
  strategyTraditional,
  strategyDirect,
  strategyDeepRestructure,
  strategyPrecision,
  strategyFullSweep,
  strategyMeasured,
];

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 60% WORD CHANGE ENFORCEMENT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function calculateWordChangePercent(original: string, rewritten: string): number {
  const normalize = (t: string) => t.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const origWords = normalize(original);
  const newWords = normalize(rewritten);
  if (origWords.length === 0) return 100;

  // POSITIONAL comparison: count how many word positions are different
  const maxLen = Math.max(origWords.length, newWords.length);
  let changed = 0;
  for (let i = 0; i < maxLen; i++) {
    if (i >= origWords.length || i >= newWords.length || origWords[i] !== newWords[i]) {
      changed++;
    }
  }
  return Math.round((changed / maxLen) * 100);
}

/**
 * Check if a sentence looks garbled after transformation.
 * Returns true if the sentence appears ungrammatical.
 * CRITICAL: This must catch ALL broken voice-shift and clause-reordering outputs.
 */
function isGarbledSentence(sentence: string): boolean {
  const s = sentence.trim();
  if (!s) return true;
  const words = s.split(/\s+/);
  // Sentence fragment: very short and ends with period
  if (words.length <= 3 && /[.!?]$/.test(s)) return true;
  // "is alsoed by" or any nonsense "-ed" passive form
  if (/\bis\s+alsoed\b/i.test(s)) return true;
  // Broken irregular past participles created by naive voice shift
  if (/\b(?:chosed|choosed|runned|comed|goed|taked|takened|gived|writed|speaked|leaved|finded|knowed|thinked|sayed|tolded|keeped|bringed|buyed|felted|cutted|putted|setted|digged|stronglyed|becomed|choosened|arised|losed|wined|growed|drived|hited|falled|holded|rised|maked|standed|telled|spended|builded|dealed|feeled|payed|successed|succeeded\s+by\s+\w+\s+natural|doed|hased|willed)\b/i.test(s)) return true;
  // SPECIFIC broken -ed on adverbs/adjectives/non-verbs: "philosophicallyed", "stronglyed", "positivelyed"
  // NOTE: Do NOT use a broad regex like /\w+(ly|al|ive)ed/ â€” it matches legitimate words
  // like "presented", "revealed", "represented", "implemented", "prevented", etc.
  // Instead, match ONLY the specific patterns that are NEVER valid English:
  if (/\b\w+(?:lyed|ouslyed|ivelyed|fullyed|ticlyed|callyed|entlyed|antlyed)\b/i.test(s)) return true;
  // Specific broken adverb+ed forms: "philosophicallyed", "practicallyed", "essentiallyed"
  if (/\b(?:philosophical|practical|essential|substantial|fundamental|additional|traditional|rational|universal|critical|political|empirical|historical|theoretical|statistical|analytical|conditional|professional|exceptional|operational|functional|structural|conceptual|environmental|consequential|psychological|methodological|international)lyed\b/i.test(s)) return true;
  // "doed", "hased", "alsoed" and other common broken -ed forms
  if (/\b(?:doed|hased|alsoed|willed|shalled|musted|mayed|caned|mighted|coulded|shoulded|woulded)\b/i.test(s)) return true;
  // GENERAL: any "is Xed by" where X is clearly not a verb (e.g., "is tended by relativism")
  // Catch "is [word]ed by [non-article-noun]" where the by-phrase has no determiner
  if (/\b(?:is|was|are|were)\s+\w+ed\s+by\s+(?!the\b|a\b|an\b|this\b|that\b|these\b|those\b|some\b|many\b|most\b|its\b|his\b|her\b|their\b|our\b|my\b|your\b)\w+\s+\w+\s+\w+\s+\w+/i.test(s)) {
    // Only flag if the by-phrase is suspiciously long (>4 words without a verb)
    const byMatch = s.match(/\b(?:is|was|are|were)\s+\w+ed\s+by\s+(.+)/i);
    if (byMatch && byMatch[1]) {
      const byPhrase = byMatch[1].trim();
      const byWords = byPhrase.split(/\s+/);
      // If the by-phrase has >4 words and looks like a noun salad
      if (byWords.length > 4 && !/\b(?:is|are|was|were|has|have|had|and|or|but|which|that|who)\b/i.test(byPhrase)) {
        return true;
      }
    }
  }
  // Broken passive with dangling agent: "is X by Y, subject"
  if (/\b(?:is|was|are|were)\s+\w+(?:ed|en)\s+by\s+\w+(?:\s+\w+)?\s*,\s*(?:I|he|she|it|we|they|you)\b/i.test(s)) return true;
  // Repeated adjacent words (excluding intentional)
  if (/\b(\w{4,})\s+\1\b/i.test(s)) return true;
  // Sentence starts with a conjunction followed by fragment
  if (/^(?:And|But|Or)\s+[^.!?]{1,15}[.!?]$/i.test(s)) return true;
  // Dangling "such" at end
  if (/\bsuch[.!?]$/i.test(s)) return true;
  // Double prepositions or broken patterns
  if (/\b(?:by|of|in|on|at|for|to)\s+(?:by|of|in|on|at|for|to)\s+/i.test(s)) return true;
  // "are expanded by transformation organizations" â€” passive + random noun mash
  if (/\bare\s+\w+ed\s+by\s+\w+\s+organizations?\b/i.test(s) && !/\bare\s+(?:used|employed|adopted|managed|operated|owned|run|funded|supported)\s+by\b/i.test(s)) return true;
  // Sentence starts with "are" or "is" + past participle (broken subject)
  if (/^(?:are|is)\s+\w+ed\b/i.test(s)) return true;
  // "by measures risk" â€” preposition followed by noun then unrelated noun  
  if (/\bby\s+measures?\s+risk\b/i.test(s)) return true;
  // Garbled clause reordering: verb before subject at sentence start
  if (/^(?:do|does|did)\s+\w+\s+(?:from|in|at|by|of)\b/i.test(s) && !/^(?:do|does|did)\s+(?:not|n't)\b/i.test(s)) return true;
  // "is [verb]ed by [noun], [pronoun] [noun]" â€” dangling passive reordering
  if (/\bis\s+\w+ed\s+by\s+\w+\s*,\s*\w+\s+\w+\s*\./i.test(s)) return true;
  // Subject-less sentences starting with preposition + verb (broken reordering)
  if (/^(?:By|From|In|At|On)\s+\w+(?:\s+\w+)?\s*,\s*(?:is|are|was|were)\b/i.test(s)) return true;
  // Broken passive ending: "is/are + past_part + by + bare_noun bare_noun." (no determiner)
  if (/\b(?:is|are|was|were)\s+\w+(?:ed|en|wn|ne|ght)\s+by\s+\w+\s+\w+[.,]\s*$/i.test(s)) {
    const m = s.match(/by\s+(\w+\s+\w+)[.,]\s*$/i);
    if (m && !/^(?:the|a|an|this|that|these|those|some|many|most|its|his|her|their|our|my|your)\b/i.test(m[1])) return true;
  }
  // "Because for" â€” double conjunction/preposition at start
  if (/^Because\s+for\b/i.test(s)) return true;
  // Dangling prepositional phrase as sentence start + modal (no subject): "Before bedtime might..."
  if (/^(?:Before|After|During|At|In)\s+\w+\s+(?:might|could|can|would|should|will)\b/i.test(s)) return true;
  // Sentence ending with fragment after comma: ", cheese consumption." or ", relationship chart."
  if (/,\s+\w+\s+\w+\.\s*$/.test(s) && s.split(/,/).length >= 3) {
    const tail = s.match(/,\s+(\w+\s+\w+)\.\s*$/);
    if (tail && !/\b(?:is|are|was|were|has|have|had|do|does|did|can|could|will|would)\b/i.test(tail[1])) return true;
  }

  // â”€â”€ NEW GARBLE CHECKS (catch broken voice-shift & clause reordering) â”€â”€

  // Inverted sentence ending with ", SUBJECT verb" pattern from broken fronting:
  // e.g. "In the creation of..., he maintains" â†’ catches bad inversions like
  // "In the creation of an ethical environment..., he maintains that" which LOSE the main clause
  // ONLY flag if the main clause before comma has no subject (starts with prep phrase only)
  if (/^(?:In|On|At|By|From|Through|With|For|During)\s+[^,]{20,},\s*(?:he|she|it|they|we|this|the)\s+\w+(?:s|ed|es)?\s+that\b/i.test(s)) {
    // Check if the sentence is just a fronted prepositional phrase + stub
    const commaPos = s.indexOf(',');
    const afterComma = s.slice(commaPos + 1).trim();
    const beforeComma = s.slice(0, commaPos).trim();
    // If before-comma part is MUCH longer than after-comma, it's a garbled inversion
    if (beforeComma.length > afterComma.length * 2.5 && afterComma.split(/\s+/).length < 8) {
      return true;
    }
  }

  // Sentence ending with ", SUBJECT." â€” dangling subject fragment (broken clause split)
  if (/,\s*(?:he|she|it|they|this)\s+\w{2,}\s*\.\s*$/i.test(s)) {
    const lastComma = s.lastIndexOf(',');
    const tail = s.slice(lastComma + 1).trim();
    if (tail.split(/\s+/).length <= 3) return true;
  }

  // "is succeeded by X natural law" â€” garbled passive (voice shift broke it)
  if (/\bis\s+succeeded\s+by\s+\w+\s+(?:natural|law|theory)\b/i.test(s)) return true;

  // Sentence contains "., " (double punctuation from broken join)
  if (/\.,\s/.test(s) && !/\bet\s+al\.,/i.test(s) && !/\betc\.,/i.test(s)) return true;

  // "is thoughted by" â€” broken past participle of irregular verbs
  if (/\b(?:is|was|are|were)\s+(?:thoughted|thinked|knowed|leaved|speaked|writed|finded|goed|comed|runned|sayed|maked)\b/i.test(s)) return true;

  // Sentence starts with bare third-person verb (no subject):
  // "Has maintained that Hill" / "Testifies to the..." / "Offers Natural Law"
  // Valid verb-first sentences only: imperatives, questions, or after conjunctions
  if (/^(?:Has|Have|Had|Does|Is|Are|Was|Were|Testifies|Offers|Maintains|Presents|Highlights|Emphasizes|Associates|Insists|Proves|Argues|Keeps|Shows|Makes|Gives|Gets|Holds|Provides|Remains|Requires|Includes|Involves)\s+/i.test(s)) {
    // Only flag if NOT a question and NOT an imperative
    if (!/\?$/.test(s)) {
      // Check if the first word is a verb in third-person singular (ends in -s/-es)
      const firstWord = words[0]?.toLowerCase() ?? '';
      // These are verbs that should have a subject before them
      if (/^(?:has|have|had|testifies|offers|maintains|presents|highlights|emphasizes|associates|insists|proves|argues|keeps|shows|provides|remains|requires|includes|involves)$/i.test(firstWord)) {
        return true;
      }
    }
  }

  // Passive ending with ", SUBJECT." pattern from broken clause reordering:
  // "is offered by synthesis, Hill." â€” dangling proper noun after comma
  if (/,\s+[A-Z][a-z]+\.\s*$/.test(s) && words.length > 5) {
    const lastComma = s.lastIndexOf(',');
    const tail = s.slice(lastComma + 1).trim();
    // If the tail is just a single proper noun + period, it's likely garbled
    if (tail.split(/\s+/).length <= 2 && /^[A-Z]/.test(tail)) return true;
  }

  // Sentence starts with a prepositional phrase containing "is/are/was/were" (broken passive):
  // "A strong alternative for basing morality...are presented by Natural Law principles."
  // This catches passives where the subject got moved to end and the sentence now starts with the object
  if (/^(?:A|An|The)\s+\w+(?:\s+\w+)?\s+(?:alternative|approach|method|way|means|framework)\s+(?:for|to|of|in)\b/i.test(s)) {
    // Check if the sentence has a passive construction late: "are presented by" / "is offered by"
    if (/\b(?:is|are|was|were)\s+\w+(?:ed|en)\s+by\b/i.test(s)) {
      // This is a broken passive where the object replaced the subject
      const verbMatch = s.match(/\b(?:is|are|was|were)\s+\w+(?:ed|en)\s+by\s+(.+?)\./i);
      if (verbMatch && verbMatch[1]) {
        // If "by X" is very short (1-3 words), it's likely the real subject got displaced
        if (verbMatch[1].trim().split(/\s+/).length <= 3) return true;
      }
    }
  }

  // Sentence starts with lowercase after being split/reassembled
  // (but NOT if it's a continuation from a semicolon/colon)
  // This is checked elsewhere, so skip.

  // Sentence contains BOTH the original subject AND a reordered version
  // e.g., "X is Y is Z" â€” double "is" with no conjunction
  const isCount = (s.match(/\b(?:is|are|was|were)\b/gi) || []).length;
  if (isCount >= 3 && words.length < 30) return true;

  // Extremely long sentence (>60 words) likely from failed merge
  if (words.length > 60) return true;

  // Sentence lacks a verb entirely (for sentences > 5 words)
  if (words.length > 5) {
    const commonVerbs = /\b(?:is|are|was|were|has|have|had|do|does|did|can|could|will|would|shall|should|may|might|must|need|help|make|take|give|get|go|come|see|know|think|find|include|includes|involve|involves|require|requires|ensure|ensures|provide|provides|play|plays|remain|remains|allow|allows|address|manage|protect|identify|implement|assess|mitigate|chose|show|shows|suggest|suggests|indicate|indicates|highlight|highlights|raise|raises|cause|causes|connect|connects|imply|implies|trend|trends|happen|happens|recognize|recognizes|avoid|avoids|consider|considers|present|presents|offer|offers|base|bases|maintain|maintains|insist|insists|argue|argues|defend|defends|revive|revives|prove|proves|emphasize|emphasizes|associate|associates|undermine|undermines|deprive|deprives|govern|governs|testify|testifies|succeed|succeeds|fit|fits|resemble|resembles|shape|shapes|lay|lays|deliberate|deliberates)\b/i;
    if (!commonVerbs.test(s)) return true;
  }
  return false;
}

function enforceMinimumChange(original: string, current: string, seed: number): string {
  // Per-iteration floor: 25% must change each pass; overall target: 85%
  const ITERATION_MIN = 25;
  const TARGET_CHANGE = 85;
  let result = current;
  let changePercent = calculateWordChangePercent(original, result);

  // Fast-exit: if already at target, skip all expensive passes
  if (changePercent >= TARGET_CHANGE) return result;

  // Pass 1: Apply additional swap dicts (fire at <40%)
  if (changePercent < 40) {
    result = applySwapDict(result, VERB_PHRASE_SWAPS, seed + 20);
    result = applySwapDict(result, CLAUSE_REPHRASINGS, seed + 21);
    result = applySwapDict(result, TRANSITION_SWAPS, seed + 22);
    result = applySwapDict(result, CAUSAL_SWAPS, seed + 23);
    changePercent = calculateWordChangePercent(original, result);
  }

  // Pass 2: Voice shift + deep restructure (fire at <50%)
  if (changePercent < 50) {
    let pass2 = voiceShift(result, 0.5);
    if (isGarbledSentence(pass2)) pass2 = result;
    let pass2b = deepRestructure(pass2, 0.35);
    if (isGarbledSentence(pass2b)) pass2b = pass2;
    if (isGarbledSentence(pass2b)) pass2b = result;
    result = pass2b;
    changePercent = calculateWordChangePercent(original, result);
  }

  // Pass 3: All remaining dicts + syntactic template (fire at <55%)
  if (changePercent < 55) {
    result = applySwapDict(result, MODIFIER_SWAPS, seed + 30);
    result = applySwapDict(result, HEDGING_PHRASES, seed + 31);
    result = applySwapDict(result, QUANTIFIER_SWAPS, seed + 32);
    result = applySwapDict(result, EMPHASIS_SWAPS, seed + 33);
    result = applySwapDict(result, TEMPORAL_SWAPS, seed + 34);
    result = applySwapDict(result, DIVERSITY_SWAPS, seed + 35);
    const templated = applySyntacticTemplate(result);
    if (!isGarbledSentence(templated)) result = templated;
    changePercent = calculateWordChangePercent(original, result);
  }

  // Pass 4: DEEP academic synonym replacement (fire at <TARGET_CHANGE)
  // Per-word synonym swap for common academic words that the dict passes missed
  if (changePercent < TARGET_CHANGE) {
    const ACADEMIC_SYNONYMS: Record<string, string[]> = {
      'presents': ['outlines', 'sets forth', 'puts forward'],
      'argues': ['contends', 'asserts', 'claims'],
      'suggests': ['proposes', 'puts forward', 'advances'],
      'demonstrates': ['reveals', 'makes clear', 'brings to light'],
      'indicates': ['points to', 'signals', 'reflects'],
      'shows': ['reveals', 'makes evident', 'brings out'],
      'provides': ['supplies', 'furnishes', 'delivers'],
      'remains': ['stays', 'persists', 'endures'],
      'requires': ['calls for', 'necessitates', 'demands'],
      'involves': ['entails', 'features', 'encompasses'],
      'includes': ['covers', 'takes in', 'features'],
      'highlights': ['draws attention to', 'brings out', 'spotlights'],
      'emphasizes': ['stresses', 'accentuates', 'underlines'],
      'maintains': ['upholds', 'sustains', 'asserts'],
      'influences': ['shapes', 'affects', 'bears on'],
      'contributes': ['adds', 'feeds into', 'lends'],
      'supports': ['backs', 'bolsters', 'underpins'],
      'addresses': ['deals with', 'tackles', 'takes up'],
      'examines': ['scrutinizes', 'inspects', 'evaluates'],
      'offers': ['extends', 'puts forth', 'proposes'],
      'based': ['grounded', 'rooted', 'founded'],
      'associated': ['linked', 'connected', 'tied'],
      'significant': ['considerable', 'notable', 'marked'],
      'important': ['central', 'vital', 'key'],
      'critical': ['decisive', 'central'],
      'essential': ['indispensable', 'vital', 'needed'],
      'objective': ['impartial', 'unbiased', 'dispassionate'],
      'also': ['too', 'likewise', 'as well'],
      'however': ['yet', 'still', 'nonetheless'],
      'therefore': ['thus', 'hence', 'as a result'],
      'various': ['diverse', 'assorted', 'different'],
      'modern': ['present-day', 'contemporary', 'recent'],
      'approach': ['method', 'strategy', 'technique'],
      'values': ['ideals', 'principles', 'standards'],
      'principles': ['tenets', 'precepts', 'doctrines'],
      'tradition': ['heritage', 'custom', 'legacy'],
      'alternative': ['option', 'substitute', 'replacement'],
      'perspective': ['viewpoint', 'standpoint', 'angle'],
      'basis': ['foundation', 'ground', 'root'],
      'often': ['frequently', 'regularly', 'commonly'],
      'while': ['whereas', 'though', 'even as'],
      'despite': ['in spite of', 'notwithstanding', 'regardless of'],
      'rather': ['instead', 'preferably', 'somewhat'],
      'particularly': ['especially', 'notably', 'chiefly'],
      'structure': ['framework', 'arrangement', 'organization'],
      'process': ['procedure', 'course', 'mechanism'],
      'role': ['function', 'part', 'capacity'],
      'factor': ['element', 'component', 'variable'],
      'issue': ['matter', 'concern', 'question'],
      'evidence': ['proof', 'data', 'testimony'],
      'theory': ['thesis', 'doctrine', 'hypothesis'],
      'context': ['setting', 'backdrop', 'framework'],
      'concept': ['idea', 'notion', 'principle'],
      'the': ['this', 'that'],
    };
    for (const [word, replacements] of Object.entries(ACADEMIC_SYNONYMS)) {
      const re = new RegExp(`\\b${word}\\b`, 'gi');
      if (re.test(result)) {
        re.lastIndex = 0;
        const repl = replacements[seed % replacements.length];
        let replaced = false;
        result = result.replace(re, (match) => {
          if (replaced && word !== 'the') return match; // Only replace first occurrence (except 'the')
          replaced = true;
          if (match.charAt(0) === match.charAt(0).toUpperCase()) {
            return repl.charAt(0).toUpperCase() + repl.slice(1);
          }
          return repl;
        });
      }
    }
    changePercent = calculateWordChangePercent(original, result);
  }

  // Pass 5: BRUTE FORCE per-word replacement (fire at <TARGET_CHANGE)
  // For every original word still present, try to replace with a close synonym
  if (changePercent < TARGET_CHANGE) {
    const origWords = original.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    const origSet = new Set(origWords);
    const BRUTE_SWAPS: Record<string, string> = {
      // Intentionally left empty or extremely minimal.
      // Replacing simple words with formal ones triggers AI detectors.
      'very': 'quite', 'some': 'certain', 'many': 'numerous'
    };
    const words = result.split(/\s+/);
    const newWords = words.map((w, i) => {
      const clean = w.toLowerCase().replace(/[^a-z]/g, '');
      if (clean.length <= 3) return w;
      if (origSet.has(clean) && BRUTE_SWAPS[clean]) {
        // Only swap ~60% of remaining original words (randomized by position)
        if ((seed + i) % 5 !== 0) {
          const repl = BRUTE_SWAPS[clean];
          // Preserve capitalization and punctuation
          const punct = w.match(/[^a-zA-Z]+$/)?.[0] ?? '';
          const isUpper = w.charAt(0) === w.charAt(0).toUpperCase() && w.charAt(0) !== w.charAt(0).toLowerCase();
          const final = isUpper ? repl.charAt(0).toUpperCase() + repl.slice(1) : repl;
          return final + punct;
        }
      }
      return w;
    });
    result = newWords.join(' ');
  }

  // Final safety: if result is garbled after all passes, revert to input
  if (isGarbledSentence(result)) return current;

  return result;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ERROR INJECTION â€” applied post-transform to statistically marked sentences
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function injectAcademicError(sentence: string, sentIdx: number): string {
  const errors = [
    // 0: Missing comma before conjunction
    (s: string) => s.replace(/,\s*(and|but|so|yet)\s+/i, (_, conj) => ` ${conj} `),
    // 1: Oxford comma insertion
    (s: string) => {
      const andIdx = s.lastIndexOf(' and ');
      if (andIdx > 15 && s.indexOf(',') > 0 && s.indexOf(',') < andIdx) {
        return s.slice(0, andIdx) + ', and' + s.slice(andIdx + 4);
      }
      return s;
    },
    // 2: Slightly wordy qualifier
    (s: string) => s
      .replace(/\b(shows)\b/i, 'appears to show')
      .replace(/\b(suggests)\b/i, 'seems to suggest')
      .replace(/\b(indicates)\b/i, 'appears to indicate'),
    // 3: Run-on tendency
    (s: string) => {
      const periodIdx = s.indexOf('. ');
      if (periodIdx > 15 && periodIdx < s.length - 15) {
        return s.slice(0, periodIdx) + ', ' + s.slice(periodIdx + 2, periodIdx + 3).toLowerCase() + s.slice(periodIdx + 3);
      }
      return s;
    },
    // 4: Hedging qualifier insertion
    (s: string) => s
      .replace(/\b(is evident)\b/i, 'is somewhat evident')
      .replace(/\b(is clear)\b/i, 'is relatively clear')
      .replace(/\b(is significant)\b/i, 'appears to be significant'),
    // 5: Subject-verb distance insertion
    (s: string) => s.replace(/\b(the study|the research|this analysis|the findings|the results)\b/i, (match) => {
      const insertions = [', as noted earlier,', ', in this particular case,', ', to some degree,'];
      return match + insertions[s.length % insertions.length];
    }),
    // 6: Unnecessary wordiness
    (s: string) => s
      .replace(/\b(because)\b/i, 'because of the fact that')
      .replace(/\b(although)\b/i, 'despite the fact that'),
    // 7: Slightly awkward passive recast
    (s: string) => s
      .replace(/\b(shows? that)\b/i, 'has shown that')
      .replace(/\b(leads? to)\b/i, 'has led to')
      .replace(/\b(suggests? that)\b/i, 'would suggest that'),
    // 8: Minor hedging insertion
    (s: string) => s
      .replace(/\b(is)\b/i, 'appears to be')
      .replace(/\b(are clearly)\b/i, 'are seemingly')
      .replace(/\b(will)\b/i, 'may well'),
    // 9: Wrong article
    (s: string) => s
      .replace(/\ba important\b/gi, 'an important')
      .replace(/\ban significant\b/gi, 'a significant')
      .replace(/\bthe one\b/i, 'one'),
  ];

  const primaryIdx = (sentIdx * 3 + sentence.charCodeAt(0)) % errors.length;
  let result = errors[primaryIdx](sentence);

  // 15% chance of stacking a second error
  if ((sentIdx * 17 + sentence.length) % 100 < 15) {
    const secondIdx = (primaryIdx + 4) % errors.length;
    result = errors[secondIdx](result);
  }

  if (result !== sentence && result.length < sentence.length * 1.6 && result.length > sentence.length * 0.5) {
    return result;
  }
  return sentence;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// STARTER VARIATION â€” applied to statistically marked sentences
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const ACADEMIC_STARTERS = [
  'In this regard, ', 'On this point, ', 'Notably, ', 'To that end, ',
  'By extension, ', 'In particular, ', 'Along these lines, ', 'Accordingly, ',
  'From this standpoint, ', 'With this in mind, ', 'At the same time, ',
  'In a broader sense, ', 'On closer inspection, ', 'As a result, ',
];

// Phrases that already mark a sentence as having a transition â€” don't stack another on top
const ALREADY_TRANSITIONED_RE = /^(?:In this regard|On this point|Notably|To that end|By extension|In particular|Along these lines|Accordingly|From this standpoint|With this in mind|At the same time|In a broader sense|On closer inspection|As a result|In addition|Furthermore|Moreover|Additionally|Consequently|Nevertheless|Nonetheless|However|Therefore|Thus|Hence|Indeed|That said|Meanwhile|By contrast|In contrast|On the other hand|In other words|In essence|Specifically|For example|For instance|As such|Beyond this|Building on this|Alongside this|What is more|On a related note|Even so|Regardless|To conclude|In summary|On balance|For this reason|Put differently|Especially|Given this|With this aim|On the contrary|Fundamentally|Equally,|Also,|Still,|In response|Correspondingly|Of particular note|Significantly|To illustrate|Conversely|From another perspective),?\s/i;

function applyStarterVariation(sentence: string, sentIdx: number, usedStarters: Set<string>): string {
  if (sentence.length < 20) return sentence;
  // Guard: don't stack a second transition phrase onto a sentence that already begins with one
  if (ALREADY_TRANSITIONED_RE.test(sentence)) return sentence;
  const starter = ACADEMIC_STARTERS[(sentIdx + sentence.charCodeAt(0)) % ACADEMIC_STARTERS.length];
  if (usedStarters.has(starter)) return sentence;
  usedStarters.add(starter);
  if (/^[A-Z]/.test(sentence)) {
    // Only lowercase if first word is a common word, not a proper noun
    const firstWord = sentence.split(/\s/)[0].replace(/[^a-zA-Z]/g, '');
    const commonStarts = new Set(['the','this','that','these','those','it','its','a','an','she','he','they','we','our','his','her','their','my','your','one','some','many','most','all','each','every','both','few','such','no','any','other','which','what','when','where','how','as','if','so','but','and','or','yet','for','nor','by','in','on','at','to','of','with','from','into','through','during','before','after','between','about','against','above','below','over','under','while','since','until','because','although','however','therefore','furthermore','moreover','additionally','consequently','meanwhile','nevertheless','nonetheless','regardless','otherwise','instead','also','then']);
    if (commonStarts.has(firstWord.toLowerCase())) {
      return starter + sentence[0].toLowerCase() + sentence.slice(1);
    }
    // Proper noun â€” keep capitalization
    return starter + sentence;
  }
  return starter + sentence;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ADDITIONAL AI PHRASE KILLS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const EXTRA_AI_PHRASES: [RegExp, string][] = [
  [/\bit is (?:important|crucial|essential|vital) to (?:note|mention|recognize) that\b/gi, ''],
  [/\bplays? a (?:crucial|vital|key|significant|important|pivotal) role\b/gi, 'matters'],
  [/\bin today'?s (?:world|society|landscape|era)\b/gi, 'at present'],
  [/\bserves? as a (?:testament|reminder|catalyst|cornerstone)\b/gi, 'demonstrates'],
  [/\bcannot be overstated\b/gi, 'is significant'],
  [/\bneedless to say\b/gi, ''],
  [/\bfirst and foremost\b/gi, 'first'],
  [/\beach and every\b/gi, 'every'],
  [/\bwhen it comes to\b/gi, 'regarding'],
  [/\bat the end of the day\b/gi, 'in practice'],
  [/\bin the context of\b/gi, 'within'],
  [/\ba wide (?:range|array|spectrum) of\b/gi, 'many types of'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bin the realm of\b/gi, 'in'],
  [/\bin order to\b/gi, 'to'],
];

function extraAIPhraseKill(text: string): string {
  return text.split(/\n\s*\n/).map(para => {
    let result = para;
    for (const [pattern, replacement] of EXTRA_AI_PHRASES) {
      result = result.replace(pattern, replacement);
    }
    result = result.replace(/ {2,}/g, ' ').trim();
    if (result[0] && result[0] !== result[0].toUpperCase()) {
      result = result[0].toUpperCase() + result.slice(1);
    }
    return result;
  }).join('\n\n');
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// POST-PROCESSING PIPELINE â€” 7 phases
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const PP_AI_WORDS_RE = /\b(utilize|utilise|facilitate|leverage|comprehensive|multifaceted|paramount|delve|foster|harness|tapestry|cornerstone|myriad|plethora|landscape|realm|pivotal|intricate|meticulous|profound|overarching|transformative|noteworthy|elucidate|embark|robust|innovative|groundbreaking|streamline|optimize|bolster|catalyze|spearhead|unravel|unveil|nexus|holistic|substantive|salient|ubiquitous|enhance|crucial|vital|essential|imperative|underscores?d?|discourse|trajectory|paradigm|nuanced|culminate)\b/gi;

const PP_AI_REPLACEMENTS: Record<string, string[]> = {
  utilize: ['use', 'apply', 'work with'], utilise: ['use', 'apply', 'work with'],
  facilitate: ['help', 'support', 'make possible'], leverage: ['use', 'draw on', 'rely on'],
  comprehensive: ['thorough', 'complete', 'full'], multifaceted: ['complex', 'varied', 'layered'],
  paramount: ['critical', 'key', 'top priority'], delve: ['examine', 'explore', 'look into'],
  foster: ['encourage', 'promote', 'build'], harness: ['use', 'channel', 'put to use'],
  tapestry: ['mix', 'combination', 'blend'], cornerstone: ['foundation', 'basis', 'core part'],
  myriad: ['many', 'numerous', 'a large number of'], plethora: ['many', 'plenty of', 'a large number of'],
  landscape: ['field', 'area', 'setting'], realm: ['area', 'field', 'domain'],
  pivotal: ['key', 'central', 'major'], intricate: ['complex', 'detailed', 'involved'],
  meticulous: ['careful', 'detailed', 'thorough'], profound: ['deep', 'significant', 'strong'],
  overarching: ['main', 'broad', 'overall'], transformative: ['major', 'significant', 'far-reaching'],
  noteworthy: ['notable', 'worth mentioning'], elucidate: ['explain', 'clarify', 'spell out'],
  embark: ['begin', 'start', 'take on'], robust: ['strong', 'solid', 'reliable'],
  innovative: ['new', 'creative', 'fresh'], groundbreaking: ['new', 'original', 'pioneering'],
  streamline: ['simplify', 'speed up'], optimize: ['improve', 'fine-tune', 'make better'],
  bolster: ['support', 'strengthen', 'back up'], catalyze: ['trigger', 'spark', 'prompt'],
  spearhead: ['lead', 'drive', 'head up'], unravel: ['untangle', 'figure out', 'sort out'],
  unveil: ['reveal', 'show', 'present'], nexus: ['connection', 'link', 'center'],
  holistic: ['whole', 'complete', 'overall'], substantive: ['real', 'meaningful', 'solid'],
  salient: ['key', 'main', 'notable'], ubiquitous: ['common', 'widespread', 'present everywhere'],
  enhance: ['improve', 'boost', 'strengthen'], crucial: ['key', 'critical', 'needed'],
  vital: ['key', 'needed', 'critical'], essential: ['needed', 'key', 'necessary'],
  imperative: ['necessary', 'urgent', 'needed'], underscore: ['highlight', 'show', 'point to'],
  underscored: ['highlighted', 'showed', 'pointed to'], underscores: ['highlights', 'shows', 'points to'],
  discourse: ['discussion', 'conversation', 'debate'], trajectory: ['path', 'direction', 'course'],
  paradigm: ['model', 'approach', 'pattern'], nuanced: ['subtle', 'detailed', 'layered'],
  culminate: ['end', 'result', 'lead to'],
};

function ppAIWordKill(text: string): string {
  return text.replace(PP_AI_WORDS_RE, (match) => {
    const key = match.toLowerCase().replace(/d$/, '').replace(/s$/, '');
    const alts = PP_AI_REPLACEMENTS[key] || PP_AI_REPLACEMENTS[match.toLowerCase()];
    if (!alts) return match;
    const pick = alts[(match.charCodeAt(0) + text.length) % alts.length];
    if (match[0] === match[0].toUpperCase()) return pick.charAt(0).toUpperCase() + pick.slice(1);
    return pick;
  });
}

const PP_AI_PHRASE_PATTERNS: [RegExp, string][] = [
  [/\bit is (?:important|crucial|essential|vital|imperative|worth noting) (?:to note |to mention |to recognize )?that\b/gi, ''],
  [/\bplays? a (?:crucial|vital|key|significant|important|pivotal|critical) role(?: in)?\b/gi, 'is central to'],
  [/\bin today'?s (?:world|society|landscape|era|age)\b/gi, 'at present'],
  [/\bserves? as a (?:testament|reminder|catalyst|cornerstone|foundation)\b/gi, 'shows'],
  [/\bcannot be overstated\b/gi, 'is real'],
  [/\bneedless to say\b/gi, ''],
  [/\bfirst and foremost\b/gi, 'first'],
  [/\beach and every\b/gi, 'every'],
  [/\bwhen it comes to\b/gi, 'regarding'],
  [/\bat the end of the day\b/gi, 'in practice'],
  [/\bin the context of\b/gi, 'within'],
  [/\ba (?:wide|broad|vast) (?:range|array|spectrum) of\b/gi, 'many types of'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bin the realm of\b/gi, 'in'],
  [/\bin order to\b/gi, 'to'],
  [/\bit goes without saying\b/gi, ''],
  [/\bnavigate the complexities?\b/gi, 'address the challenges'],
  [/\bnot only\b(.{5,40})\bbut also\b/gi, '$1 and also'],
  [/\bin light of\b/gi, 'given'],
  [/\bwith respect to\b/gi, 'regarding'],
  [/\bfor the purpose of\b/gi, 'to'],
  [/\bin the event that\b/gi, 'if'],
  [/\bby virtue of\b/gi, 'through'],
  // Only strip the most egregious AI-tell adverbs â€” keep natural transitions
  [/\bundeniably,?\s*/gi, ''], [/\bundoubtedly,?\s*/gi, ''],
  [/\bcrucially,?\s*/gi, ''],
  [/\barguably,?\s*/gi, ''],
  [/\badditionally,?\s*/gi, ''],
  [/\bmoreover,?\s*/gi, ''],
  [/\bfurthermore,?\s*/gi, ''],
  [/\bconsequently,?\s*/gi, ''],
];

function ppAIPhrasesKill(text: string): string {
  return text.split(/\n\s*\n/).map(para => {
    let result = para;
    for (const [pattern, replacement] of PP_AI_PHRASE_PATTERNS) {
      result = result.replace(pattern, replacement);
    }
    result = result.replace(/ {2,}/g, ' ').trim();
    const sents = robustSentenceSplit(result);
    return sents.map(s => {
      if (s[0] && s[0] !== s[0].toUpperCase()) return s[0].toUpperCase() + s.slice(1);
      return s;
    }).join(' ');
  }).join('\n\n');
}

const PP_AI_STARTERS = new Set([
  // Only strip truly overused AI starters â€” leave natural transitions alone
  'notwithstanding', 'crucially',
  'importantly', 'arguably',
  'undeniably', 'undoubtedly', 'remarkably', 'evidently',
  'additionally', 'moreover', 'furthermore', 'consequently',
]);

function ppStarterKill(text: string): string {
  return text.split(/\n\s*\n/).map(para => {
    const sentences = robustSentenceSplit(para);
    return sentences.map(sent => {
      const firstWord = sent.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
      if (PP_AI_STARTERS.has(firstWord)) {
        const comma = sent.indexOf(',');
        if (comma > 0 && comma < 25) {
          let rest = sent.slice(comma + 1).trim();
          if (rest[0]) rest = rest[0].toUpperCase() + rest.slice(1);
          return rest;
        }
      }
      return sent;
    }).join(' ');
  }).join('\n\n');
}

function ppExpandContractions(text: string): string {
  const map: Record<string, string> = {
    "can't": "cannot", "won't": "will not", "don't": "do not",
    "doesn't": "does not", "didn't": "did not", "isn't": "is not",
    "aren't": "are not", "wasn't": "was not", "weren't": "were not",
    "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
    "wouldn't": "would not", "shouldn't": "should not", "couldn't": "could not",
    "mustn't": "must not", "it's": "it is", "that's": "that is",
    "there's": "there is", "here's": "here is", "he's": "he is",
    "she's": "she is", "they're": "they are", "we're": "we are",
    "you're": "you are", "I'm": "I am", "they've": "they have",
    "we've": "we have", "you've": "you have", "I've": "I have",
    "they'll": "they will", "we'll": "we will", "you'll": "you will",
    "I'll": "I will", "he'll": "he will", "she'll": "she will",
    "it'll": "it will", "let's": "let us", "who's": "who is",
    "what's": "what is", "where's": "where is", "when's": "when is",
    "how's": "how is", "ain't": "is not",
  };
  let result = text;
  for (const [c, e] of Object.entries(map)) {
    const re = new RegExp(c.replace("'", "[''']"), 'gi');
    result = result.replace(re, (m) => m[0] === m[0].toUpperCase() ? e.charAt(0).toUpperCase() + e.slice(1) : e);
  }
  return result;
}

function ppBreakUniformity(text: string): string {
  return text.split(/\n\s*\n/).map(para => {
    const sentences = robustSentenceSplit(para);
    if (sentences.length < 3) return para;

    const result: string[] = [];
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      const words = s.split(/\s+/);
      if (i >= 2) {
        const prevLen = sentences[i - 1].split(/\s+/).length;
        const prevPrevLen = sentences[i - 2].split(/\s+/).length;
        if (Math.abs(words.length - prevLen) < 5 && Math.abs(prevLen - prevPrevLen) < 5 && words.length > 12) {
          const midComma = s.indexOf(', ', Math.floor(s.length * 0.4));
          if (midComma > 10 && midComma < s.length - 10) {
            const first = s.slice(0, midComma) + '.';
            let second = s.slice(midComma + 2).trim();
            if (second[0]) second = second[0].toUpperCase() + second.slice(1);
            result.push(first, second);
            continue;
          }
        }
      }
      result.push(s);
    }
    return result.join(' ');
  }).join('\n\n');
}

function ppFinalCleanup(text: string): string {
  return text.split(/\n\s*\n/).map(para => {
    let r = para;
    r = r.replace(/ {2,}/g, ' ');
    r = r.replace(/\s+([.!?,;:])/g, '$1');
    r = r.replace(/([.!?])([A-Z])/g, '$1 $2');
    r = r.replace(/(?<=[.!?]\s)([a-z])/g, (_, c) => c.toUpperCase());
    return r.trim();
  }).join('\n\n');
}

/** Kill first person if not in input. */
function ppKillFirstPerson(text: string): string {
  let r = text;
  r = r.replace(/\bI believe that\b/gi, 'The evidence suggests that');
  r = r.replace(/\bI think that\b/gi, 'The data indicates that');
  r = r.replace(/\bI argue that\b/gi, 'The argument is that');
  r = r.replace(/\bI suggest that\b/gi, 'The analysis suggests that');
  r = r.replace(/\bwe can see that\b/gi, 'the data shows that');
  r = r.replace(/\bwe observe that\b/gi, 'the observation is that');
  r = r.replace(/\bwe find that\b/gi, 'the findings indicate that');
  r = r.replace(/\bwe argue\b/gi, 'the argument holds');
  r = r.replace(/\bIn my view\b/gi, 'From this perspective');
  r = r.replace(/\bIn our view\b/gi, 'From this perspective');
  r = r.replace(/\bOur findings\b/gi, 'The findings');
  r = r.replace(/\bour results\b/gi, 'the results');
  r = r.replace(/\bour analysis\b/gi, 'the analysis');
  r = r.replace(/\bour research\b/gi, 'the research');
  r = r.replace(/\bour study\b/gi, 'the study');
  return r;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MAIN ENGINE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export function nuruHumanize(
  text: string,
  strength: string = 'medium',
  tone: string = 'academic',
): string {
  if (!text || !text.trim()) return text;

  // â”€â”€ PROPER NOUN EXTRACTION â”€â”€
  // Extract proper nouns BEFORE any transformation so we can restore casing later
  const properNouns = extractProperNouns(text);

  // â”€â”€ CITATION + STAT PROTECTION â”€â”€
  // Protect citations (Author, Year) and numeric statistics from modification
  const citationMap = new Map<string, string>();
  let citIdx = 0;
  const protected_text = text
    // Protect citations: (Topol, 2019), (Esteva et al., 2017)
    .replace(/\(([A-Z][a-zA-Z&.\s]+,?\s*\d{4}[a-z]?(?:;\s*[A-Z][a-zA-Z&.\s]+,?\s*\d{4}[a-z]?)*)\)/g, (match) => {
      const placeholder = `__CITE_${citIdx++}__`;
      citationMap.set(placeholder, match);
      return placeholder;
    })
    // Protect numeric stats with decimals/ranges: 38.5%, $187.9 billion, 25-30%, 12.8 days
    .replace(/\$[\d,.]+\s*(?:billion|million|trillion|thousand)?|\d+(?:[.,]\d+)+%?|\d+-\d+%/g, (match) => {
      const placeholder = `__STAT_${citIdx++}__`;
      citationMap.set(placeholder, match);
      return placeholder;
    });
  const textWithPlaceholders = protected_text;

  // â”€â”€ PHASE 1: PRE-ANALYSIS â”€â”€
  const inputHasFirstPerson = detectFirstPerson(textWithPlaceholders);
  const intensity = strength === 'strong' ? 1.0 : strength === 'light' ? 0.4 : 0.7;
  // Tone drives contraction expansion: always expand for academic/professional
  const expandContractions = tone === 'academic' || tone === 'professional' || tone === 'neutral';
  const paragraphs = extractParagraphs(textWithPlaceholders);
  const { classifications, paragraphMap, protectedParagraphs } = classifySentences(paragraphs);

  // â”€â”€ PHASE 2: INDEPENDENT PROCESSING â”€â”€
  // Each sentence processed independently through its randomly assigned strategy
  const results: Map<number, string> = new Map();

  for (const cls of classifications) {
    if (cls.isProtected) {
      results.set(cls.index, cls.text);
      continue;
    }

    // Apply the randomly assigned strategy
    const strategy = STRATEGIES[cls.assignedStrategy];
    let processed = strategy(cls.text, cls.seed);

    // Revert if strategy produced garbled output
    if (isGarbledSentence(processed)) {
      processed = cls.text;
    }

    // Extra AI phrase kill
    processed = extraAIPhraseKill(processed);

    // Additional diversity swaps based on intensity
    if (intensity > 0.5 && cls.seed % 10 < Math.floor(intensity * 10)) {
      processed = applySwapDict(processed, DIVERSITY_SWAPS, cls.seed + 10);
    }

    // Enforce 60% minimum word change
    const preEnforce = processed;
    processed = enforceMinimumChange(cls.text, processed, cls.seed);

    // CRITICAL: Re-check garble AFTER enforceMinimumChange â€” it re-applies
    // aggressive voice shifts that can break sentence structure
    if (isGarbledSentence(processed)) {
      // Fall back to the pre-enforcement version
      processed = preEnforce;
      // If even that is garbled, use the original text
      if (isGarbledSentence(processed)) {
        processed = cls.text;
      }
    }

    // GARBLE-SAFE WORD SWAP: Runs AFTER all garble checks.
    // If the sentence was reverted to original (low change), apply safe 1-to-1
    // word replacements that can NEVER produce garbled output.
    const postGarbleChange = calculateWordChangePercent(cls.text, processed);
    if (postGarbleChange < 70) {
      const SAFE_SWAPS: Record<string, string> = {
        'significant': 'considerable', 'important': 'central',
        'essential': 'vital', 'comprehensive': 'thorough', 'fundamental': 'core',
        'effective': 'productive', 'relevant': 'pertinent', 'various': 'diverse',
        'particular': 'distinct', 'specific': 'precise', 'common': 'frequent',
        'current': 'present', 'modern': 'contemporary', 'objective': 'impartial',
        'demonstrates': 'reveals', 'indicates': 'signals', 'suggests': 'proposes',
        'provides': 'delivers', 'requires': 'demands', 'involves': 'entails',
        'includes': 'covers', 'highlights': 'spotlights', 'emphasizes': 'stresses',
        'maintains': 'upholds', 'influences': 'shapes', 'contributes': 'lends',
        'supports': 'bolsters', 'addresses': 'tackles', 'examines': 'evaluates',
        'remains': 'persists', 'presents': 'outlines', 'offers': 'proposes',
        'argues': 'contends', 'shows': 'reveals', 'focuses': 'concentrates',
        'however': 'nonetheless', 'therefore': 'thus', 'also': 'likewise',
        'often': 'frequently', 'particularly': 'notably', 'especially': 'chiefly',
        'approach': 'method', 'aspect': 'facet', 'concept': 'notion',
        'context': 'setting', 'evidence': 'proof', 'factor': 'element',
        'framework': 'scaffold', 'issue': 'matter', 'process': 'mechanism',
        'role': 'function', 'structure': 'arrangement', 'system': 'setup',
        'theory': 'thesis', 'tradition': 'heritage', 'values': 'ideals',
        'principles': 'tenets', 'standards': 'benchmarks', 'alternative': 'option',
        'basis': 'foundation', 'perspective': 'viewpoint', 'environment': 'climate',
        'the': (cls.seed % 3 === 0 ? 'this' : cls.seed % 3 === 1 ? 'that' : 'the'),
        'with': (cls.seed % 2 === 0 ? 'alongside' : 'with'),
        'about': (cls.seed % 2 === 0 ? 'concerning' : 'regarding'),
        'based': 'grounded', 'associated': 'linked', 'related': 'connected',
        'while': 'whereas', 'although': 'though', 'despite': 'notwithstanding',
        'rather': 'instead', 'regarding': 'concerning', 'concerning': 'about',
        'universal': 'broad', 'consistent': 'steady',
      };
      const words = processed.split(/\s+/);
      const newWords = words.map((w, i) => {
        const clean = w.toLowerCase().replace(/[^a-z]/g, '');
        if (clean.length <= 2) return w;
        // Check if this word matches a safe swap AND hasn't already been swapped
        const swap = SAFE_SWAPS[clean];
        if (swap && swap !== clean) {
          // Apply with ~80% probability (seeded)
          if ((cls.seed + i * 7) % 5 !== 0) {
            const punct = w.match(/[^a-zA-Z]+$/)?.[0] ?? '';
            const isUpper = w.charAt(0) === w.charAt(0).toUpperCase() && w.charAt(0) !== w.charAt(0).toLowerCase();
            const final = isUpper ? swap.charAt(0).toUpperCase() + swap.slice(1) : swap;
            return final + punct;
          }
        }
        return w;
      });
      processed = newWords.join(' ');
    }

    results.set(cls.index, processed);
  }

  // â”€â”€ PHASE 3: REASSEMBLY + POST-PROCESSING â”€â”€
  const usedStarters = new Set<string>();
  const reassembledParagraphs: string[] = [];

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    if (protectedParagraphs.has(pIdx)) {
      // Humanize titles with >6 words; pass short titles through unchanged
      const heading = protectedParagraphs.get(pIdx)!;
      reassembledParagraphs.push(humanizeTitle(heading));
      continue;
    }

    const sentenceIndices = paragraphMap.get(pIdx);
    if (!sentenceIndices || sentenceIndices.length === 0) {
      reassembledParagraphs.push(paragraphs[pIdx]);
      continue;
    }

    const processedSentences: string[] = [];
    for (const clsIdx of sentenceIndices) {
      const cls = classifications[clsIdx];
      let sent = results.get(cls.index) ?? cls.text;

      // CRITICAL: Strategy may produce multiple sentences (e.g., voice-shift splits)
      // Check EACH sub-sentence for garble and remove garbled parts
      const subSents = robustSentenceSplit(sent);
      if (subSents.length > 1) {
        const validSubs = subSents.filter(sub => !isGarbledSentence(sub));
        if (validSubs.length === 0) {
          // All sub-sentences garbled â€” use the results version (which has safe swaps)
          sent = results.get(cls.index) ?? cls.text;
          // If that's also garbled as a whole, keep it anyway (safe swaps are safe)
        } else {
          sent = validSubs.join(' ');
        }
      } else if (isGarbledSentence(sent)) {
        // Single sentence that is garbled â€” use results version
        sent = results.get(cls.index) ?? cls.text;
      }

      // Apply error injection to statistically marked sentences
      // DISABLED: Error injection adds AI-sounding phrases back into text
      // (e.g. "because of the fact that", "appears to show", "seems to suggest")
      // which defeats the purpose of humanization.
      // if (cls.shouldInjectError) {
      //   sent = injectAcademicError(sent, cls.index);
      // }

      // Fix capitalization
      if (sent[0] && sent[0] !== sent[0].toUpperCase()) {
        sent = sent[0].toUpperCase() + sent.slice(1);
      }

      // Ensure sentence-ending punctuation
      const trimmed = sent.trim();
      if (trimmed && !/[.!?]$/.test(trimmed)) {
        sent = trimmed + '.';
      }

      processedSentences.push(sent);
    }

    // Anti-detection passes
    let antiDetected = perSentenceAntiDetection(processedSentences, false);
    antiDetected = deepCleaningPass(antiDetected);
    antiDetected = cleanSentenceStarters(antiDetected);

    // GARBLE SAFETY NET: check each anti-detected sentence, revert if broken
    antiDetected = antiDetected.map((sent, sIdx) => {
      if (isGarbledSentence(sent)) {
        // Revert to the version before anti-detection
        return processedSentences[sIdx] ?? sent;
      }
      return sent;
    });

    reassembledParagraphs.push(antiDetected.join(' '));
  }

  // â”€â”€ FINAL SAFE-SWAP PASS â”€â”€
  // After ALL structural transforms and garble checks, apply safe 1-to-1 word
  // swaps to every sentence that hasn't reached the 70% change target.
  // This is garble-safe because it only does word-level replacement.
  const origSentencesFlat = paragraphs.flatMap(p => robustSentenceSplit(p));
  const FINAL_SAFE_SWAPS: Record<string, string> = {
    // â”€â”€ Conjunctions / Connectives (safe, natural flow) â”€â”€
    'but': 'yet', 'because': 'since', 'although': 'though',
    'while': 'whereas', 'however': 'nonetheless', 'therefore': 'thus',
    'also': 'likewise', 'yet': 'still', 'hence': 'as a result',
    'despite': 'notwithstanding', 'rather': 'instead', 'thus': 'hence',
    // â”€â”€ Prepositions â”€â”€
    'about': 'concerning', 'regarding': 'concerning',
    'upon': 'on', 'within': 'inside', 'through': 'via', 'toward': 'towards',
    'among': 'amongst', 'between': 'amid', 'beyond': 'past',
    // â”€â”€ Pronouns / Reference â”€â”€
    'which': 'that', 'such': 'this kind of', 'these': 'those',
    'some': 'certain', 'other': 'additional',
    // â”€â”€ High-frequency compensating swaps â”€â”€
    'each': 'every',
    'own': 'respective', 'goal': 'aim', 'main': 'primary',
    'well': 'effectively', 'able': 'capable',
    'set': 'established', 'given': 'provided',
  };
  for (let pIdx = 0; pIdx < reassembledParagraphs.length; pIdx++) {
    const para = reassembledParagraphs[pIdx];
    if (!para.trim() || isProtectedLine(para.trim())) continue;
    const sents = robustSentenceSplit(para);
    const newSents = sents.map((sent) => {
      // Apply safe swaps to ALL sentences for maximum change ratio
      const words = sent.split(/\s+/);
      return words.map((w) => {
        const clean = w.toLowerCase().replace(/[^a-z]/g, '');
        if (clean.length <= 2) return w;
        const swap = FINAL_SAFE_SWAPS[clean];
        if (swap && swap !== clean) {
          const punct = w.match(/[^a-zA-Z]+$/)?.[0] ?? '';
          const isUpper = w.charAt(0) === w.charAt(0).toUpperCase() && w.charAt(0) !== w.charAt(0).toLowerCase();
          const final = isUpper ? swap.charAt(0).toUpperCase() + swap.slice(1) : swap;
          return final + punct;
        }
        return w;
      }).join(' ');
    });
    reassembledParagraphs[pIdx] = newSents.join(' ');
  }

  // â”€â”€ PROTECT HEADINGS DURING POST-PROCESSING â”€â”€
  // Replace protected paragraphs with placeholders so post-processing won't mangle them
  const headingPlaceholders = new Map<string, string>();
  let hIdx = 0;
  const outputParagraphs = reassembledParagraphs.map(para => {
    const trimmed = para.trim();
    if (protectedParagraphs.has(hIdx) || (!trimmed) || isProtectedLine(trimmed)) {
      const placeholder = `__HEADING_${hIdx}__`;
      headingPlaceholders.set(placeholder, para);
      hIdx++;
      return placeholder;
    }
    hIdx++;
    return para;
  });
  let output = outputParagraphs.join('\n\n');

  // â”€â”€ POST-PROCESSING PIPELINE (per-sentence) â”€â”€
  // All transforms applied independently to each sentence to prevent bulk processing
  {
    const ppParas = output.split(/\n\s*\n/).filter(p => p.trim());
    output = ppParas.map(para => {
      // Skip heading placeholders
      if (para.trim().startsWith('__HEADING_')) return para;
      const sents = robustSentenceSplit(para.trim());
      return sents.map(s => {
        let fixed = s;
        fixed = ppAIWordKill(fixed);          // Phase 1: Kill AI words
        fixed = ppAIPhrasesKill(fixed);       // Phase 2: Kill AI phrases
        fixed = ppStarterKill(fixed);         // Phase 3: Kill AI starters
        if (expandContractions) {
          fixed = ppExpandContractions(fixed); // Phase 4: Kill ALL contractions
        }
        fixed = ppFinalCleanup(fixed);        // Phase 6: Final cleanup
        fixed = ppAIWordKill(fixed);          // Phase 7: Second AI word sweep
        fixed = applyAIWordKill(fixed);
        fixed = expandAllContractions(fixed);
        fixed = fixPunctuation(fixed);
        if (!inputHasFirstPerson) {
          fixed = ppKillFirstPerson(fixed);
        }
        fixed = ppExpandContractions(fixed);
        fixed = enforceSingleSentence(fixed);

        // FINAL GARBLE CHECK: if post-processing broke this sentence, revert
        if (isGarbledSentence(fixed)) {
          fixed = s; // Revert to pre-post-processing version
        }

        return fixed;
      }).join(' ');
    }).join('\n\n');
  }

  // Phase 5: ppBreakUniformity â€” DISABLED: splits sentences, violates 1-in=1-out

  // Restore protected headings
  for (const [placeholder, heading] of headingPlaceholders) {
    output = output.replace(new RegExp(placeholder, 'g'), heading);
  }

  // Restore protected citations (case-insensitive since transforms may lowercase placeholders)
  for (const [placeholder, citation] of citationMap) {
    output = output.replace(new RegExp(placeholder, 'gi'), citation);
  }

  // Fix citation capitalization â€” capitalize author names in (Author, Year) patterns
  output = output.replace(/\(([a-z][a-zA-Z&.\s]+,?\s*\d{4}[a-z]?(?:;\s*[a-z][a-zA-Z&.\s]+,?\s*\d{4}[a-z]?)*)\)/g, (match) => {
    return match.replace(/([(\s;])([a-z])/g, (_, pre, letter) => pre + letter.toUpperCase());
  });

  // â”€â”€ RESTORE PROPER NOUN CASING â”€â”€
  // Transforms may have lowercased author names and proper nouns.
  // Restore them from the set we built before processing.
  output = restoreProperNounCasing(output, properNouns);

  // â”€â”€ DUPLICATE SENTENCE REMOVAL â”€â”€
  // Voice shifts and strategy retries can duplicate sentences.
  // Remove any sentence that has >85% word overlap with the previous sentence.
  output = output.split(/\n\s*\n/).map(para => {
    const sents = robustSentenceSplit(para);
    if (sents.length <= 1) return para;
    const deduped: string[] = [sents[0]];
    for (let i = 1; i < sents.length; i++) {
      const prevWords = new Set(sents[i - 1].toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2));
      const currWords = sents[i].toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2);
      if (prevWords.size === 0 || currWords.length === 0) { deduped.push(sents[i]); continue; }
      let overlap = 0;
      for (const w of currWords) { if (prevWords.has(w)) overlap++; }
      const overlapRatio = overlap / Math.max(currWords.length, 1);
      if (overlapRatio < 0.85) {
        deduped.push(sents[i]);
      }
    }
    return deduped.join(' ');
  }).join('\n\n');

  // Final cleanup
  output = output.replace(/  +/g, ' ').replace(/ +\n/g, '\n').trim();

  // Final validation: fix capitalization + sentence formatting
  const validated = validateAndRepairOutput(text.trim(), output);
  output = validated.text;

  // One more pass to ensure proper nouns survived validation
  output = restoreProperNounCasing(output, properNouns);

  return output;
}
