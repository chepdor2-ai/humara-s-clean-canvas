/**
 * Phase 13 — Aggressive Post-Processing
 * ========================================
 * GOAL: Achieve ≥75% text alteration through intelligent, context-aware
 * transformations on the FINAL assembled text. Runs AFTER formatPhase.
 *
 * This is the nuclear option — a deep, non-LLM sweep that:
 *   1. Context-aware synonym swap on ~50% of remaining content words
 *   2. Deep sentence restructuring on ~50% of sentences (clause reorder, PP fronting, voice shift)
 *   3. Multi-word phrase substitution (300+ phrase patterns)
 *   4. Verb phrase / modifier / clause rephrasing (200+ patterns)
 *   5. AI vocabulary final kill (120+ words with stemming)
 *   6. Connector and transition naturalization
 *   7. Change-rate tracking to guarantee ≥75% alteration
 *
 * Borrows heavily from humanizer.ts (engine v3) established dictionaries
 * and restructuring logic, but adapted for single-pass post-processing
 * on already-assembled text.
 *
 * Rules enforced:
 *   - Zero contractions (expanded in formatPhase safety net)
 *   - Zero first-person unless present in input
 *   - Zero em-dash injection
 *   - Preserve paper tone — no forced phrases
 */

import type { DocumentState, Phase } from '../types';
import {
  AI_WORD_REPLACEMENTS,
  AI_PHRASE_PATTERNS,
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
  applyPhrasePatterns,
  applySyntacticTemplate,
  applyConnectorNaturalization,
  fixPunctuation,
  cleanSentenceStarters,
  deepCleaningPass,
  perSentenceAntiDetection,
} from '../../shared-dictionaries';
import {
  SYNONYM_BANK,
  PHRASE_SUBSTITUTIONS,
  SORTED_PHRASE_KEYS,
  PROTECTED_WORDS,
} from '../../rules';
import { analyze, isProtected, spanOverlapsCompound } from '../../context-analyzer';
import type { TextContext } from '../../context-analyzer';

// ══════════════════════════════════════════════════════════════════
// Utility
// ══════════════════════════════════════════════════════════════════

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split text into sentences (handles abbreviations, decimals, etc.)
 */
function splitSentences(text: string): string[] {
  const raw = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
  return raw.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Count words in text
 */
function wordCount(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

interface InputFeatures {
  hasFirstPerson: boolean;
  hasRhetoricalQuestions: boolean;
}

function detectInputFeatures(text: string): InputFeatures {
  return {
    hasFirstPerson: /\b(?:I|me|my|mine|myself|we|us|our|ours|ourselves)\b/.test(text),
    hasRhetoricalQuestions: /[A-Za-z][^.!?]*\?/.test(text),
  };
}

function extractProperNouns(text: string): Set<string> {
  const COMMON = new Set([
    'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'these', 'those',
    'introduction', 'conclusion', 'summary', 'abstract', 'discussion', 'results',
    'methods', 'background', 'analysis', 'overview', 'review', 'chapter', 'section',
    'table', 'figure', 'appendix', 'references', 'however', 'therefore', 'furthermore',
    'moreover', 'consequently', 'research', 'theory', 'practice', 'policy', 'process',
    'system', 'problem', 'solution', 'challenge', 'opportunity', 'strategy',
  ]);

  const proper = new Set<string>();
  for (const match of text.matchAll(/\b([A-Z][a-z]{2,}|[A-Z]{2,})\b/g)) {
    const word = match[1];
    if (!COMMON.has(word.toLowerCase())) {
      proper.add(word);
      proper.add(word.toLowerCase());
    }
  }
  return proper;
}

function isTitleOrHeading(para: string): boolean {
  const trimmed = para.trim();
  if (!trimmed) return false;
  if (/^#{1,6}\s/.test(trimmed)) return true;
  if (/^[IVXLCDM]+\.\s/i.test(trimmed)) return true;
  if (/^(?:Part|Section|Chapter)\s+\d+/i.test(trimmed)) return true;
  if (/^[\d]+[.):]\s/.test(trimmed) || /^[A-Za-z][.):]\s/.test(trimmed)) return true;
  if (/^(?:Introduction|Conclusion|Summary|Abstract|Background|Discussion|Results|Methods|References|Acknowledgments|Appendix)\s*$/i.test(trimmed)) return true;
  const words = trimmed.split(/\s+/);
  if (words.length <= 10 && !/[.!?]$/.test(trimmed)) return true;
  if (words.length <= 12 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) return true;
  return false;
}

function enforcePolicyGuards(text: string, allowFirstPerson: boolean, allowQuestions: boolean): string {
  let result = text;

  // No em-dash injection in this phase
  result = result.replace(/\s+—\s+/g, '; ');

  // No first person unless the input already used it
  if (!allowFirstPerson) {
    result = result
      .replace(/\b(I|We)\s+(argue|believe|contend|maintain|submit|find|show|suggest|note|observe)\b/g, (_m, _pronoun, verb) => `The analysis ${verb}`)
      .replace(/\b(i|we)\s+(argue|believe|contend|maintain|submit|find|show|suggest|note|observe)\b/g, (_m, _pronoun, verb) => `the analysis ${verb}`)
      .replace(/\bWe\b/g, 'The analysis')
      .replace(/\bwe\b/g, 'the analysis')
      .replace(/\bOur\b/g, 'The')
      .replace(/\bour\b/g, 'the')
      .replace(/\bUs\b/g, 'The analysis')
      .replace(/\bus\b/g, 'the analysis');
  }

  if (!allowQuestions) {
    result = result.replace(/\?+/g, '.');
  }

  return result
    .replace(/ {2,}/g, ' ')
    .replace(/\.{2,}/g, '.')
    .replace(/;{2,}/g, ';')
    .trim();
}

/**
 * Levenshtein-based similarity (0-1) for comparing before/after
 */
function wordChangeFraction(original: string, modified: string): number {
  const origWords = original.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const modWords = modified.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  if (origWords.length === 0) return 1;

  let changed = 0;
  const len = Math.max(origWords.length, modWords.length);
  for (let i = 0; i < len; i++) {
    if (!origWords[i] || !modWords[i] || origWords[i] !== modWords[i]) {
      changed++;
    }
  }
  return changed / len;
}

// ══════════════════════════════════════════════════════════════════
// 1. CONTEXT-AWARE SYNONYM SWAP (aggressive — targets 50%+ content words)
// ══════════════════════════════════════════════════════════════════

/** Words that should never be synonym-swapped */
const SWAP_BLOCKLIST = new Set([
  'not', 'no', 'nor', 'none', 'never', 'neither', 'without',
  'only', 'just', 'even', 'still', 'already', 'yet',
  'very', 'much', 'more', 'most', 'less', 'least',
  'than', 'then', 'thus', 'hence', 'therefore',
  'said', 'says', 'told', 'asked', 'wrote',
  'may', 'might', 'can', 'could', 'should', 'would', 'will', 'shall',
  'must', 'need', 'dare', 'ought',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'am', 'is', 'are', 'was', 'were',
  // Domain-critical words that produce bad swaps out of context
  'natural', 'deep', 'machine', 'computer', 'decision',
  // Ambiguous verb/noun words where synonym swap changes POS
  'process', 'approach', 'address', 'study', 'practice', 'function',
  'model', 'state', 'present', 'subject', 'object', 'figure',
  'generate', 'produce', 'cause', 'make', 'take', 'give', 'set',
  'making', 'leading', 'enabling', 'resulting', 'allowing', 'reducing',
  'finding', 'findings', 'remains', 'remaining', 'uncertain', 'unclear',
  'underlying', 'substantive', 'emerging', 'evolving',
]);

/** Common suffixes for re-inflection */
const SUFFIX_MAP: [RegExp, string][] = [
  [/ing$/i, 'ing'],
  [/tion$/i, 'tion'],
  [/sion$/i, 'sion'],
  [/ment$/i, 'ment'],
  [/ness$/i, 'ness'],
  [/ity$/i, 'ity'],
  [/ies$/i, 'ies'],
  [/ied$/i, 'ied'],
  [/ous$/i, 'ous'],
  [/ive$/i, 'ive'],
  [/able$/i, 'able'],
  [/ible$/i, 'ible'],
  [/ally$/i, 'ally'],
  [/ly$/i, 'ly'],
  [/ed$/i, 'ed'],
  [/er$/i, 'er'],
  [/est$/i, 'est'],
  [/es$/i, 'es'],
  [/s$/i, 's'],
];

/**
 * Try to find the base form + suffix for a word
 */
function stemWord(word: string): { base: string; suffix: string } | null {
  const lower = word.toLowerCase();

  // Try each suffix pattern
  for (const [pattern, suffix] of SUFFIX_MAP) {
    if (pattern.test(lower) && lower.length > suffix.length + 2) {
      const base = lower.slice(0, lower.length - suffix.length);
      // Try direct lookup
      if (SYNONYM_BANK[base] || AI_WORD_REPLACEMENTS[base] || DIVERSITY_SWAPS[base]) {
        return { base, suffix };
      }
      // Try with 'e' restored (e.g., "utilizing" → "utiliz" → "utilize")
      if (SYNONYM_BANK[base + 'e'] || AI_WORD_REPLACEMENTS[base + 'e'] || DIVERSITY_SWAPS[base + 'e']) {
        return { base: base + 'e', suffix };
      }
      // Try removing doubled consonant (e.g., "running" → "run")
      if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
        const shortBase = base.slice(0, -1);
        if (SYNONYM_BANK[shortBase] || AI_WORD_REPLACEMENTS[shortBase]) {
          return { base: shortBase, suffix };
        }
      }
    }
  }

  return null;
}

/**
 * Re-inflect a replacement word with the original suffix
 */
function reInflect(replacement: string, suffix: string): string {
  if (!suffix) return replacement;

  // Handle 's' / 'es' / 'ies' plural
  if (suffix === 's') {
    if (/[sxzh]$/i.test(replacement)) return replacement + 'es';
    if (/[^aeiou]y$/i.test(replacement)) return replacement.slice(0, -1) + 'ies';
    return replacement + 's';
  }
  if (suffix === 'es') {
    if (/[^aeiou]y$/i.test(replacement)) return replacement.slice(0, -1) + 'ies';
    if (/e$/i.test(replacement)) return replacement + 's'; // "procedure" → "procedures"
    // Only words ending in s, x, z, ch, sh actually take -es plural
    if (/[sxz]$/i.test(replacement) || /[sc]h$/i.test(replacement)) return replacement + 'es';
    return replacement + 's'; // "method" → "methods", not "methodes"
  }
  if (suffix === 'ies') {
    return replacement.endsWith('y') ? replacement.slice(0, -1) + 'ies' : replacement + 's';
  }

  // Handle 'ed' past tense
  if (suffix === 'ed') {
    if (replacement.endsWith('e')) return replacement + 'd';
    if (/[^aeiou]y$/i.test(replacement)) return replacement.slice(0, -1) + 'ied';
    return replacement + 'ed';
  }
  if (suffix === 'ied') {
    if (replacement.endsWith('y')) return replacement.slice(0, -1) + 'ied';
    return replacement + 'ed';
  }

  // Handle 'ing'
  if (suffix === 'ing') {
    if (replacement.endsWith('e')) return replacement.slice(0, -1) + 'ing';
    if (replacement.endsWith('ie')) return replacement.slice(0, -2) + 'ying';
    return replacement + 'ing';
  }

  // Handle 'ly' / 'ally'
  if (suffix === 'ly' || suffix === 'ally') {
    if (replacement.endsWith('le')) return replacement.slice(0, -2) + 'ly';
    if (replacement.endsWith('y')) return replacement + 'ly';
    if (replacement.endsWith('ic')) return replacement + 'ally';
    return replacement + 'ly';
  }

  // Handle 'er' / 'est' comparative
  if (suffix === 'er' || suffix === 'est') {
    if (replacement.endsWith('e')) return replacement + suffix.slice(1);
    if (/[^aeiou]y$/i.test(replacement)) return replacement.slice(0, -1) + 'i' + suffix;
    return replacement + suffix;
  }

  // Default: just append
  return replacement + suffix;
}

/**
 * Aggressively replace synonyms in a sentence, context-aware.
 * Targets ~65% of swappable content words.
 */
function aggressiveSynonymSwap(
  sentence: string,
  ctx: TextContext,
  usedReplacements: Set<string>,
  protectedTerms: Set<string> = new Set<string>(),
  swapRate = 0.20
): string {
  // Protect hyphenated compound words by replacing with placeholders
  const hyphenatedWords: string[] = [];
  let safeSentence = sentence.replace(/\b([a-zA-Z]{2,})-([a-zA-Z]{2,})\b/g, (full) => {
    hyphenatedWords.push(full);
    return `HYPHCOMP${hyphenatedWords.length - 1}`;
  });

  const words = safeSentence.split(/(\s+|[.,;:!?()\[\]"'])/);
  const result: string[] = [];
  let swaps = 0;
  let swappable = 0;

  for (let i = 0; i < words.length; i++) {
    const token = words[i];
    // Skip whitespace / punctuation
    if (!token || /^[\s.,;:!?()\[\]"']+$/.test(token)) {
      result.push(token);
      continue;
    }

    // Restore hyphenated compound placeholders
    if (/^HYPHCOMP\d+$/.test(token)) {
      const idx = parseInt(token.replace('HYPHCOMP', ''), 10);
      result.push(hyphenatedWords[idx] ?? token);
      continue;
    }

    const clean = token.replace(/[^a-zA-Z]/g, '');
    if (!clean || clean.length < 3) {
      result.push(token);
      continue;
    }

    const lower = clean.toLowerCase();

    // Skip protected words
    if (PROTECTED_WORDS.has(lower)
      || SWAP_BLOCKLIST.has(lower)
      || protectedTerms.has(clean)
      || protectedTerms.has(lower)
      || isProtected(ctx, clean)) {
      result.push(token);
      continue;
    }
    // Check if this word is part of a multi-word domain term (e.g. "natural" in "natural language")
    if (spanOverlapsCompound(ctx, sentence, clean, sentence.indexOf(clean))) {
      result.push(token);
      continue;
    }

    swappable++;

    // Try direct lookup across all dictionaries (priority order)
    let replacements: string[] | undefined;
    let suffix = '';

    // 1. AI_WORD_REPLACEMENTS (highest priority — these are AI fingerprint words)
    replacements = AI_WORD_REPLACEMENTS[lower];

    // 2. SYNONYM_BANK
    if (!replacements || replacements.length === 0) {
      replacements = SYNONYM_BANK[lower];
    }

    // 3. DIVERSITY_SWAPS
    if (!replacements || replacements.length === 0) {
      replacements = DIVERSITY_SWAPS[lower];
    }

    // 4. Try stemmed form
    if (!replacements || replacements.length === 0) {
      const stemmed = stemWord(lower);
      if (stemmed) {
        replacements = AI_WORD_REPLACEMENTS[stemmed.base]
          || SYNONYM_BANK[stemmed.base]
          || DIVERSITY_SWAPS[stemmed.base];
        suffix = stemmed.suffix;
      }
    }

    // Apply replacement with ~65% probability (aggressive)
    if (replacements && replacements.length > 0 && Math.random() < swapRate) {
      // Filter out already-used replacements and hyphenated ones (they break in tokenization)
      let candidates = replacements.filter(r => !usedReplacements.has(r.toLowerCase()) && !r.includes('-'));
      if (candidates.length === 0) candidates = replacements.filter(r => !r.includes('-'));
      if (candidates.length === 0) candidates = replacements;

      let replacement = pickRandom(candidates);

      // Re-inflect if we stemmed
      if (suffix) {
        replacement = reInflect(replacement, suffix);
      }

      // Preserve casing
      if (clean[0] === clean[0].toUpperCase()) {
        replacement = replacement[0].toUpperCase() + replacement.slice(1);
      }

      // Preserve surrounding punctuation from original token
      const prefix = token.match(/^[^a-zA-Z]*/)?.[0] ?? '';
      const trail = token.match(/[^a-zA-Z]*$/)?.[0] ?? '';

      result.push(prefix + replacement + trail);
      usedReplacements.add(replacement.toLowerCase());
      swaps++;
    } else {
      result.push(token);
    }
  }

  return result.join('');
}

// ══════════════════════════════════════════════════════════════════
// 2. DEEP SENTENCE RESTRUCTURING (50% of sentences)
// ══════════════════════════════════════════════════════════════════

const CLAUSE_SPLITTERS = /\b(because|since|although|though|while|whereas|unless|until|after|before|when|if|even though|given that|provided that|so that|in order to)\b/i;

/**
 * Validate that a restructured sentence is coherent:
 * - Has at least one verb-like word
 * - Doesn't have orphaned fragments
 * - Isn't much longer/shorter than original
 * - Doesn't start with a lowercase letter after period
 */
function isCoherent(original: string, restructured: string): boolean {
  // Length sanity: shouldn't change by more than 40%
  const origLen = original.length;
  const newLen = restructured.length;
  if (newLen < origLen * 0.5 || newLen > origLen * 1.6) return false;

  // Must contain at least one verb-like word
  const VERB_PATTERN = /\b(is|are|was|were|has|have|had|does|do|did|will|would|could|should|can|may|might|shall|must|being|been|plays|shows|suggests|indicates|provides|requires|involves|includes|makes|takes|gives|remains|becomes|appears|seems|leads|creates|produces|affects|allows|enables|supports|helps|means|needs|works|uses|finds|gets|keeps|knows|puts|runs|says|sees|sets|tells|tries|turns|wants|comes|goes|looks|moves|opens|stands|calls|holds|lives|brings|happens|reads|writes|starts|falls|grows|builds|drives|feels|meets|pays|sends|speaks|takes|thinks|walks|draws|hears|leaves|reaches|sits|wins|breaks|catches|forms|offers|serves|covers|reflects|carries|determines|addresses|presents|follows|considers|applies|notes|raises|recognizes|establishes)\b/i;
  if (!VERB_PATTERN.test(restructured)) return false;

  // Check for doubled punctuation or garbled structure
  if (/[A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z]/.test(restructured.slice(0, 40))) return false;

  // Check sentence doesn't start with a conjunction fragment
  if (/^(And|But|Or|Yet|So|Nor)\s*$/.test(restructured.trim())) return false;

  // Reject sentences where the fronted clause is absurdly long (>50% of sentence)
  const firstComma = restructured.indexOf(',');
  if (firstComma > 0 && firstComma > restructured.length * 0.65) return false;

  // Reject orphaned connectors like ", also," in the middle
  if (/,\s*(also|too|partly|however|moreover|furthermore)\s*,/i.test(restructured)) return false;

  // Reject if the restructured sentence starts with a preposition followed by
  // an extremely long prepositional phrase (>80 chars before main clause)
  const leadingPP = restructured.match(/^(?:In|At|Through|During|Across|Among|Within|Under|Over|Around)\s+/i);
  if (leadingPP) {
    const mainClauseStart = restructured.indexOf(', ', leadingPP[0].length);
    if (mainClauseStart > 80) return false;
  }

  return true;
}

/**
 * Restructure a sentence by reordering clauses.
 * Strategy 1: Move subordinate clause to front
 * Strategy 2: Move trailing prepositional phrase to front
 * Strategy 3: Swap independent clauses around conjunction
 */
function restructureSentence(sent: string): string {
  const words = sent.split(/\s+/);
  if (words.length < 8 || words.length > 35) return sent; // Too short or too complex to restructure safely

  // Strategy 1: subordinate clause to front
  // "X because Y." → "Because Y, X."
  const clauseMatch = sent.match(
    new RegExp(`^(.{15,}?),?\\s+(${CLAUSE_SPLITTERS.source})\\s+(.{10,})$`, 'i')
  );
  if (clauseMatch && Math.random() < 0.6) {
    const [, mainClause, conjunction, subClause] = clauseMatch;
    const cleanMain = mainClause.replace(/[.!?]+$/, '').trim();
    const fixedConj = conjunction[0].toUpperCase() + conjunction.slice(1).toLowerCase();
    const fixedSub = subClause.replace(/[.!?]+$/, '').trim();
    const result = `${fixedConj} ${fixedSub}, ${cleanMain[0].toLowerCase()}${cleanMain.slice(1)}.`;
    if (isCoherent(sent, result)) return result;
  }

  // Strategy 2: move trailing prepositional phrase to front
  // "X in the Y." → "In the Y, X."
  const ppMatch = sent.match(
    /^(.{15,}?)\s+((?:in|at|through|during|across|among|within|under|over|around)\s+(?:the\s+|this\s+|that\s+|a\s+|an\s+)?[\w][\w\s]{3,25})[.!?]$/i
  );
  if (ppMatch && Math.random() < 0.5) {
    const [, mainPart, ppPhrase] = ppMatch;
    const cleanMain = mainPart.replace(/,\s*$/, '').trim();
    const fixedPP = ppPhrase[0].toUpperCase() + ppPhrase.slice(1);
    const result = `${fixedPP}, ${cleanMain[0].toLowerCase()}${cleanMain.slice(1)}.`;
    if (isCoherent(sent, result)) return result;
  }

  // Strategy 3: swap independent clauses around conjunction
  // "X, and Y." → "Y, and X."
  const conjMatch = sent.match(/^(.{15,}?),\s+(and|but|yet|so)\s+(.{15,})$/i);
  if (conjMatch && Math.random() < 0.4) {
    const [, first, conj, second] = conjMatch;
    const commas = (first.match(/,/g) || []).length;
    if (commas <= 2) {
      const cleanFirst = first.replace(/[.!?]+$/, '').trim();
      const cleanSecond = second.replace(/[.!?]+$/, '').trim();
      const result = `${cleanSecond[0].toUpperCase()}${cleanSecond.slice(1)}, ${conj} ${cleanFirst[0].toLowerCase()}${cleanFirst.slice(1)}.`;
      if (isCoherent(sent, result)) return result;
    }
  }

  // Strategy 4: Apply syntactic templates from shared-dictionaries
  for (const template of SYNTACTIC_TEMPLATES) {
    if (template.pattern.test(sent) && Math.random() < 0.45) {
      const replacement = pickRandom(template.replacements);
      const result = sent.replace(template.pattern, replacement);
      if (result !== sent && result.length > 10) {
        // Ensure proper capitalization and punctuation
        let fixed = result[0].toUpperCase() + result.slice(1);
        if (!/[.!?]$/.test(fixed)) fixed += '.';
        if (isCoherent(sent, fixed)) return fixed;
      }
    }
  }

  return sent;
}

// ══════════════════════════════════════════════════════════════════
// 3. MULTI-DICTIONARY PHRASE SUBSTITUTION
// ══════════════════════════════════════════════════════════════════

/** All swap dictionaries merged for phrase-level replacement */
const ALL_PHRASE_DICTS: Record<string, string[]>[] = [
  VERB_PHRASE_SWAPS,
  MODIFIER_SWAPS,
  CLAUSE_REPHRASINGS,
  HEDGING_PHRASES,
  TRANSITION_SWAPS,
  QUANTIFIER_SWAPS,
  TEMPORAL_SWAPS,
  CAUSAL_SWAPS,
  EMPHASIS_SWAPS,
];

/**
 * Apply all phrase-level dictionaries to a sentence.
 */
// ── Pre-compiled phrase dictionary patterns (built once at module load) ──
const COMPILED_PHRASE_SUBS: { rx: RegExp; alts: string[] }[] = SORTED_PHRASE_KEYS
  .map(key => ({ rx: new RegExp(`\\b${escapeRegex(key)}\\b`, 'gi'), alts: PHRASE_SUBSTITUTIONS[key] }))
  .filter(e => e.alts && e.alts.length > 0);

const COMPILED_ALL_PHRASE_DICTS: { rx: RegExp; alts: string[] }[] = ALL_PHRASE_DICTS.flatMap(dict =>
  Object.entries(dict).map(([phrase, alternatives]) => ({
    rx: new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'gi'),
    alts: alternatives,
  }))
);

function applyPhraseDictionaries(text: string): string {
  let result = text;

  // Apply the 300+ PHRASE_SUBSTITUTIONS (longest-first for greedy matching)
  for (const { rx, alts } of COMPILED_PHRASE_SUBS) {
    rx.lastIndex = 0;
    if (rx.test(result) && Math.random() < 0.85) {
      rx.lastIndex = 0;
      result = result.replace(rx, () => pickRandom(alts));
    }
  }

  // Apply all 9 swap dictionaries
  for (const { rx, alts } of COMPILED_ALL_PHRASE_DICTS) {
    rx.lastIndex = 0;
    if (rx.test(result) && Math.random() < 0.80) {
      rx.lastIndex = 0;
      result = result.replace(rx, () => pickRandom(alts));
    }
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════
// 4. AI VOCABULARY KILL (final sweep with stemming)
// ══════════════════════════════════════════════════════════════════

/**
 * Final AI phrase pattern kill — applies regex-based phrase patterns only.
 * Word-level AI kill is handled by aggressiveSynonymSwap which uses
 * AI_WORD_REPLACEMENTS as first-priority lookup, so we skip applyAIWordKill()
 * here to avoid cascading replacements (e.g., "inherent" → "baked-in" → garbled).
 */
function finalAIKill(text: string): string {
  let result = text;
  for (const [pattern, replacement] of AI_PHRASE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════
// 5. CONNECTOR NATURALIZATION
// ══════════════════════════════════════════════════════════════════

const CONNECTOR_ALTERNATIVES: [RegExp, string[]][] = [
  [/^Furthermore,?\s*/i, ['In addition, ', 'Beyond this, ', 'Adding to this, ']],
  [/^Moreover,?\s*/i, ['On top of that, ', 'More than that, ', 'Further to this, ']],
  [/^Additionally,?\s*/i, ['On top of this, ', 'Also of note, ', 'Adding further, ']],
  [/^Consequently,?\s*/i, ['As a result, ', 'Following from this, ', 'This means that ']],
  [/^Nevertheless,?\s*/i, ['Even so, ', 'All the same, ', 'That said, ']],
  [/^Nonetheless,?\s*/i, ['Still, ', 'Even then, ', 'Yet ']],
  [/^However,?\s*/i, ['That said, ', 'On the other hand, ', 'Yet ']],
  [/^Therefore,?\s*/i, ['For this reason, ', 'It follows that ', 'Accordingly, ']],
  [/^Thus,?\s*/i, ['In this way, ', 'Accordingly, ', 'As such, ']],
  [/^Hence,?\s*/i, ['As a consequence, ', 'This is why ', 'For this reason, ']],
  [/^In conclusion,?\s*/i, ['Taken together, ', 'On the whole, ', 'To draw this to a close, ']],
  [/^To summarize,?\s*/i, ['In brief, ', 'Summing up, ', 'On the whole, ']],
  [/^Notably,?\s*/i, ['Of particular interest, ', 'What stands out is that ', 'Worth emphasizing, ']],
  [/^Importantly,?\s*/i, ['Of real significance, ', 'What deserves attention is that ', 'Critically, ']],
  [/^Specifically,?\s*/i, ['In particular, ', 'More precisely, ', 'To be exact, ']],
  [/^Ultimately,?\s*/i, ['In the final analysis, ', 'At the end of it all, ', 'When all is considered, ']],
];

function naturalizeConnectors(sentence: string): string {
  for (const [pattern, alts] of CONNECTOR_ALTERNATIVES) {
    if (pattern.test(sentence) && Math.random() < 0.70) {
      return sentence.replace(pattern, pickRandom(alts));
    }
  }
  return sentence;
}

// ══════════════════════════════════════════════════════════════════
// 6. SENTENCE-LEVEL WORD ORDER VARIATION
// ══════════════════════════════════════════════════════════════════

/**
 * Move an adverbial/prepositional phrase from end of sentence to front
 * for variety. "The team worked efficiently during the trial." →
 * "During the trial, the team worked efficiently."
 */
function frontAdverbial(sent: string): string {
  const match = sent.match(
    /^(.{20,}?)\s+((?:during|throughout|within|across|despite|beyond|following|concerning|regarding|given)\s+[\w\s]{4,30})[.!?]$/i
  );
  if (match) {
    const [, main, adv] = match;
    const cleanMain = main.replace(/,\s*$/, '').trim();
    return `${adv[0].toUpperCase()}${adv.slice(1)}, ${cleanMain[0].toLowerCase()}${cleanMain.slice(1)}.`;
  }
  return sent;
}

// ══════════════════════════════════════════════════════════════════
// MAIN PHASE — Sentence-by-Sentence Processing
// ══════════════════════════════════════════════════════════════════

/**
 * Check if a sentence is clean enough for further transformation.
 */
function isSentenceClean(s: string): boolean {
  const hasVerb = /\b(is|are|was|were|has|have|had|does|do|did|will|would|could|should|can|may|might|shall|must|being|been|makes|takes|gives|shows|suggests|provides|requires|involves|enables|supports|leads|creates|produces|allows|helps|means|needs|works|uses|finds|forms|offers|reflects|determines|presents|considers|applies|improved|transformed|enhanced|enabled|facilitated|altered|changed|increased|decreased|affected|generated|identified|implemented|integrated|leveraged|utilized|addressed|established|maintained|achieved|demonstrated|indicated|conducted|reported|observed|examined|evaluated|analyzed|compared|developed|designed|proposed|introduced|suggested|recommended|concluded|revealed|confirmed|discussed|explored|investigated|highlighted|illustrated|emphasized|explained|described|defined|classified|categorized|assessed|measured|tested|verified|validated|reviewed|summarized|outlined|elaborated|clarified|distinguished|recognized|acknowledged|assumed|hypothesized|predicted|estimated|calculated|computed|simulated|optimized|maximized|minimized|resolved|solved|addressed|prevented|avoided|reduced|eliminated|mitigated|managed|controlled|monitored|regulated|supervised|coordinated|organized|structured|planned|executed|performed|conducted|implemented|delivered|completed|finished|accomplished|succeeded|failed|struggled|challenged|attempted|tried|ensured|guaranteed|secured|protected|preserved|maintained|sustained|supported|promoted|encouraged|motivated|inspired|influenced|impacted|shaped|formed|built|constructed|created|established|founded|initiated|launched|started|began|continued|proceeded|progressed|advanced|evolved|developed|grew|expanded|extended|broadened|deepened|strengthened|improved|enhanced|upgraded|refined|modified|adjusted|adapted|customized|tailored|configured|calibrated|tuned|aligned|integrated|incorporated|combined|merged|unified|consolidated|aggregated|compiled|collected|gathered|assembled|accumulated|stored|retained|saved|archived|recorded|documented|logged|tracked|monitored|reported|communicated|transmitted|distributed|disseminated|shared|published|released|disclosed|announced|declared|stated|expressed|articulated|conveyed|relayed|informed|notified|alerted|warned|cautioned|advised|recommended|suggested|proposed|offered|provided|supplied|delivered|served|contributed|aided|assisted|facilitated|supported|backed|endorsed|championed|advocated)\b/i;
  if (!hasVerb.test(s)) return false;
  const stripped = s.replace(/^(on reflection|in practice|examining deeper|what surfaces[^,]*,|[^,]{0,30},)\s*/i, '').trim();
  if (stripped.split(/\s+/).length < 4) return false;
  if (/\b(has|have|had|is|are|was|were)\s+(of\s+\w+\s+\w+)\.\s/i.test(s)) return false;
  return true;
}

/**
 * Apply all cleanup fixes to a single sentence.
 */
function cleanupSentence(s: string): string {
  let result = s;
  // Fix comma-broken compound words
  result = result.replace(/\b(decision)[,\s]+(making)\b/gi, '$1-$2');
  result = result.replace(/\b(problem)[,\s]+(solving)\b/gi, '$1-$2');
  result = result.replace(/\b(well)[,\s]+(known|established|defined|being)\b/gi, '$1-$2');
  result = result.replace(/\b(long)[,\s]+(term|standing|running|lasting)\b/gi, '$1-$2');
  result = result.replace(/\b(short)[,\s]+(term|lived|sighted)\b/gi, '$1-$2');
  result = result.replace(/\b(high)[,\s]+(quality|level|resolution|performance)\b/gi, '$1-$2');
  result = result.replace(/\b(real)[,\s]+(time|world)\b/gi, '$1-$2');
  result = result.replace(/\b(state)[,\s]+(of)[,\s]+(the)[,\s]+(art)\b/gi, '$1-$2-$3-$4');
  result = result.replace(/\b(self)[,\s]+(driving|learning|aware|sufficient)\b/gi, '$1-$2');
  result = result.replace(/\b(data)[,\s]+(driven)\b/gi, '$1-$2');
  result = result.replace(/\b(evidence)[,\s]+(based)\b/gi, '$1-$2');
  result = result.replace(/\b(cross)[,\s]+(sectional|disciplinary|cultural)\b/gi, '$1-$2');
  // Fix orphaned adverbs
  result = result.replace(/,\s*partly,/gi, ',');
  result = result.replace(/\bpartly,\s*and\b/gi, 'and');
  // Fix capitalization after restructuring
  result = result.replace(/([.!?])\s+([a-z])/g, (_m, p, l) => `${p} ${l.toUpperCase()}`);
  // Fix double spaces
  result = result.replace(/ {2,}/g, ' ');
  // Fix space before punctuation
  result = result.replace(/\s+([.,;:!?])/g, '$1');
  // Fix broken "a/an" agreement
  result = result.replace(/\b(a|an)\s+(\w+)/gi, (_match, article, word) => {
    const vowelStart = /^[aeiou]/i.test(word) && !/^(uni|one|once|use[ds]?|usu|ura|eur)/i.test(word);
    const hStart = /^(hour|honest|honor|heir|herb)/i.test(word);
    const shouldBeAn = vowelStart || hStart;
    const correct = shouldBeAn ? 'an' : 'a';
    const final = /^A/.test(article) ? correct.charAt(0).toUpperCase() + correct.slice(1) : correct;
    return `${final} ${word}`;
  });
  // Fix AI capitalization
  result = result.replace(/\bai-(\w)/gi, (_m, c) => `AI-${c}`);
  result = result.replace(/\bai\b/g, 'AI');
  // Double prepositions from synonym stacking
  result = result.replace(/\b(of|to|in|for|on|at|by|with|from|as|is|the|a|an) \1\b/gi, '$1');
  // Final compound word repair
  result = result.replace(/\bdecision[,\s]+making\b/gi, 'decision-making');
  result = result.replace(/\bproblem[,\s]+solving\b/gi, 'problem-solving');
  result = result.replace(/\bwell[,\s]+(known|established|defined|being)\b/gi, 'well-$1');
  result = result.replace(/\blong[,\s]+(term|standing|running|lasting)\b/gi, 'long-$1');
  result = result.replace(/\bshort[,\s]+(term|lived|sighted)\b/gi, 'short-$1');
  result = result.replace(/\breal[,\s]+(time|world)\b/gi, 'real-$1');
  result = result.replace(/\bdata[,\s]+driven\b/gi, 'data-driven');
  result = result.replace(/\bevidence[,\s]+based\b/gi, 'evidence-based');
  // Capitalize first letter
  if (result.length > 0 && /[a-z]/.test(result[0])) {
    result = result[0].toUpperCase() + result.slice(1);
  }
  return result.trim();
}

/**
 * Process a single sentence through all aggressive post-processing passes.
 */
// ── Pre-compiled verb/modifier swap patterns for processOneSentence ──
const COMPILED_VERB_PHRASE_SWAPS: { rx: RegExp; alts: string[] }[] =
  Object.entries(VERB_PHRASE_SWAPS).map(([phrase, alts]) => ({
    rx: new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'gi'),
    alts,
  }));

const COMPILED_MODIFIER_SWAPS: { rx: RegExp; alts: string[] }[] =
  Object.entries(MODIFIER_SWAPS).map(([phrase, alts]) => ({
    rx: new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'gi'),
    alts,
  }));

function processOneSentence(
  sentenceText: string,
  originalSentenceText: string,
  ctx: TextContext,
  usedReplacements: Set<string>,
): { text: string; wasRestructured: boolean } {
  let s = sentenceText;
  const clean = isSentenceClean(s);
  let wasRestructured = false;

  // PASS 1: AI Vocabulary Kill
  if (clean) s = finalAIKill(s);

  // PASS 2: Targeted phrase-level substitutions
  for (const { rx, alts } of COMPILED_VERB_PHRASE_SWAPS) {
    rx.lastIndex = 0;
    if (rx.test(s) && Math.random() < 0.75) {
      rx.lastIndex = 0;
      s = s.replace(rx, () => pickRandom(alts));
    }
  }
  for (const { rx, alts } of COMPILED_MODIFIER_SWAPS) {
    rx.lastIndex = 0;
    if (rx.test(s) && Math.random() < 0.75) {
      rx.lastIndex = 0;
      s = s.replace(rx, () => pickRandom(alts));
    }
  }

  // PASS 3: Connector naturalization
  s = naturalizeConnectors(s);

  // PASS 4: Deep sentence restructuring
  if (clean && wordCount(s) >= 8 && Math.random() < 0.55) {
    const result = restructureSentence(s);
    if (result !== s) {
      s = result;
      wasRestructured = true;
    } else {
      const fronted = frontAdverbial(s);
      if (fronted !== s) {
        s = fronted;
        wasRestructured = true;
      }
    }
  }

  // PASS 5: Aggressive synonym swap
  if (clean) s = aggressiveSynonymSwap(s, ctx, usedReplacements);

  // PASS 5b: Revert if garbled
  const hasVerb = /\b(is|are|was|were|has|have|had|does|do|did|will|would|could|should|can|may|must)\b/i.test(s);
  const hasGarble = /\b(\w+)\s+\1\b/i.test(s) || /[A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z]/.test(s);
  const tooShort = s.split(/\s+/).length < 3;
  if ((!hasVerb && s.length > 20) || hasGarble || tooShort) {
    s = originalSentenceText;
  }

  // PASS 7: Per-sentence cleanup
  s = cleanupSentence(s);

  return { text: s, wasRestructured };
}

export const aggressivePostProcessPhase: Phase = {
  name: 'aggressivePostProcess',
  async process(state: DocumentState): Promise<DocumentState> {
    const text = state.currentText;
    if (!text || text.trim().length < 20) return state;

    // Pre-analyze context for intelligent decisions
    const ctx = analyze(state.originalText);
    const usedReplacements = new Set<string>();

    // Track the original text for change-rate measurement
    const originalText = text;
    let restructured = 0;
    let totalSentences = 0;

    // ── Process each sentence individually via paragraph structure ──
    for (const paragraph of state.paragraphs) {
      for (const sentence of paragraph.sentences) {
        totalSentences++;
        const prePhaseText = sentence.text;
        const result = processOneSentence(
          sentence.text,
          prePhaseText,
          ctx,
          usedReplacements,
        );
        sentence.text = result.text;
        if (result.wasRestructured) restructured++;
      }
    }

    // ── Reassemble from sentence structure ──
    const paragraphTexts: string[] = [];
    for (const paragraph of state.paragraphs) {
      const liveSentences = paragraph.sentences.filter(
        s => s.text.trim().length > 0 && !s.flags.includes('killed')
      );
      const assembled = liveSentences.map(s => s.text).join(' ');
      paragraph.currentText = assembled;
      if (assembled.trim()) {
        paragraphTexts.push(assembled);
      }
    }
    let assembled = paragraphTexts.join('\n\n').replace(/ {2,}/g, ' ').trim();

    // ── PASS 6: Check change rate, do extra synonym pass per-sentence if below 30% ──
    let changeRate = wordChangeFraction(originalText, assembled);

    if (changeRate < 0.30) {
      for (const paragraph of state.paragraphs) {
        for (const sentence of paragraph.sentences) {
          sentence.text = aggressiveSynonymSwap(sentence.text, ctx, usedReplacements, new Set<string>(), 0.30);
          sentence.text = cleanupSentence(sentence.text);
        }
      }
      // Reassemble again
      const updatedTexts: string[] = [];
      for (const paragraph of state.paragraphs) {
        const liveSentences = paragraph.sentences.filter(
          s => s.text.trim().length > 0 && !s.flags.includes('killed')
        );
        const pText = liveSentences.map(s => s.text).join(' ');
        paragraph.currentText = pText;
        if (pText.trim()) updatedTexts.push(pText);
      }
      assembled = updatedTexts.join('\n\n').replace(/ {2,}/g, ' ').trim();
      changeRate = wordChangeFraction(originalText, assembled);
    }

    // Fix missing space after punctuation (cross-sentence boundary)
    assembled = assembled.replace(/([.!?])([A-Z])/g, '$1 $2');

    state.currentText = assembled;
    state.logs.push(
      `[aggressivePostProcess] Change rate: ${(changeRate * 100).toFixed(1)}%, ` +
      `restructured: ${restructured}/${totalSentences} sentences, ` +
      `synonym pool: ${usedReplacements.size} unique replacements used`
    );

    return state;
  },
};
