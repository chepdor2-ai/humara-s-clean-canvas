/**
 * Sentence Synonym Processor
 * ==========================
 * Strictly sentence-by-sentence processing.
 * Each sentence is processed independently through heavy synonym,
 * phrase, and adjective swaps, then reconnected.
 *
 *   1. Phrase-level substitution (verb phrases, modifiers, clauses)
 *   2. Multi-dictionary phrase swap (4 dictionaries)
 *   3. Word-level synonym swap (POS-aware + dictionary, ≈50 %)
 *   4. Connector naturalisation
 *
 * Every word, phrase, and adjective is replaced with a same-meaning
 * alternative wherever possible.
 */

import { robustSentenceSplit } from "./content-protection";
import { synonymReplace, phraseSubstitute } from "./utils";
import {
  DIVERSITY_SWAPS,
  VERB_PHRASE_SWAPS,
  MODIFIER_SWAPS,
  CLAUSE_REPHRASINGS,
} from "./shared-dictionaries";
import { getDictionary } from "./dictionary";

/* ── constants ───────────────────────────────────────────────────────── */

/** Light intensity → ≈15% content-word replacement (quality-safe) */
const SYNONYM_INTENSITY = 0.8;
/** Phrase substitution intensity */
const PHRASE_INTENSITY = 0.6;

/* ── rigid connectors to naturalise ──────────────────────────────────── */
const RIGID_CONNECTORS: [RegExp, string[]][] = [
  [/^Furthermore,?\s/i,   ["Also, ", "On top of that, ", ""]],
  [/^Moreover,?\s/i,      ["Besides, ", "What is more, ", ""]],
  [/^Additionally,?\s/i,  ["Also, ", ""]],
  [/^Consequently,?\s/i,  ["So, ", "As a result, ", "Because of this, "]],
  [/^Nevertheless,?\s/i,  ["Still, ", "Even so, ", "That said, "]],
  [/^Subsequently,?\s/i,  ["Then, ", "After that, ", "Later, "]],
  [/^In addition,?\s/i,   ["Also, ", "Beyond that, ", ""]],
  [/^Conversely,?\s/i,    ["On the other hand, ", "Then again, "]],
  [/^Notwithstanding,?\s/i, ["Even so, ", "Still, "]],
  [/^Accordingly,?\s/i,   ["So, ", "Because of this, "]],
  [/^Hence,?\s/i,         ["So, ", "That is why ", ""]],
  [/^Thus,?\s/i,          ["So, ", "This means ", ""]],
  [/^Thereby,?\s/i,       ["This way, ", "In doing so, "]],
  [/^Henceforth,?\s/i,    ["From now on, ", "Going forward, "]],
];

/* ── helpers ─────────────────────────────────────────────────────────── */

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ── phrase-level dictionary swap ────────────────────────────────────── */

/**
 * Apply all phrase-level dictionaries (verb phrases, modifiers, clause
 * rephrasings, diversity swaps) with high replacement rate.
 */
function heavyPhraseSwap(sent: string): string {
  let out = sent;

  const dicts: Record<string, string[]>[] = [
    VERB_PHRASE_SWAPS,
    MODIFIER_SWAPS,
    CLAUSE_REPHRASINGS,
    DIVERSITY_SWAPS,
  ];

  for (const dict of dicts) {
    for (const [phrase, alts] of Object.entries(dict)) {
      if (alts.length === 0) continue;
      const re = new RegExp(`\\b${escapeRe(phrase)}\\b`, "gi");
      if (re.test(out)) {
        out = out.replace(re, () => pick(alts));
      }
    }
  }

  return out;
}

/* ── dictionary-backed word-level synonym swap ───────────────────────── */

/**
 * High-intensity synonym swap using HumanizerDictionary.
 * Targets ≈50 % content-word replacement.
 */
function heavySynonymSwap(sent: string, usedWords: Set<string>): string {
  // Layer 1: POS-aware synonym bank replacement (light intensity)
  const out = synonymReplace(sent, SYNONYM_INTENSITY, usedWords);

  // Layer 2: dictionary contextual replacement — DISABLED
  // The mega_thesaurus produces wrong-sense synonyms ("autonomous"→"sovereign",
  // "diagnostics"→"nosology", "civil"→"polite") that corrupt academic text.

  return out;
}

/* ── connector naturalisation ────────────────────────────────────────── */

function naturaliseConnector(sent: string): string {
  for (const [pattern, alts] of RIGID_CONNECTORS) {
    if (pattern.test(sent)) {
      const replacement = pick(alts);
      const stripped = sent.replace(pattern, "");
      if (replacement === "") return capitalize(stripped);
      return replacement + stripped.charAt(0).toLowerCase() + stripped.slice(1);
    }
  }
  return sent;
}

/* ── heading detection ───────────────────────────────────────────────── */

function isHeadingLike(text: string): boolean {
  if (/^#{1,6}\s/.test(text)) return true;
  const wc = text.split(/\s+/).filter(Boolean).length;
  if (wc <= 10 && !/[.!?]$/.test(text.trim())) return true;
  if (/^[A-Z][A-Z\s]{2,}$/.test(text.trim()) && wc <= 12) return true;
  return false;
}

/* ── main export ─────────────────────────────────────────────────────── */

/**
 * Process text strictly sentence by sentence.
 * Each sentence independently gets heavy synonym swap (words, phrases,
 * adjectives) — all replaced with same-meaning alternatives — then
 * sentences are reconnected per paragraph.
 *
 * Runs AFTER all per-sentence humanization phases and BEFORE
 * final paragraph/sentence count enforcement.
 */
export function slidingWindowProcess(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const usedWords = new Set<string>();

  const processed = paragraphs.map(para => {
    const trimmed = para.trim();
    if (isHeadingLike(trimmed)) return trimmed;

    const sentences = robustSentenceSplit(trimmed);
    if (sentences.length === 0) return trimmed;

    // Process each sentence independently
    const result = sentences.map(sent => {
      // Step 1: Phrase-level substitution (verb phrases, modifiers, etc.)
      let s = phraseSubstitute(sent, PHRASE_INTENSITY);

      // Step 2: Multi-dictionary phrase swap (4 dictionaries)
      s = heavyPhraseSwap(s);

      // Step 3: Heavy word-level synonym swap (POS-aware + dictionary, ≈50 %)
      s = heavySynonymSwap(s, usedWords);

      // Step 4: Naturalise rigid connectors
      s = naturaliseConnector(s);

      return s;
    });

    return result.join(" ");
  });

  return processed.join("\n\n");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
