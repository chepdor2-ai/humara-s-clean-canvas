/**
 * Sentence Surgery — Pre-Humanization Merge/Split + Post-Humanization Validation
 * ================================================================================
 * Shared module used by ALL humanizer engines to:
 *   1. Pre-merge 2-3 adjacent short sentences per 20 (burstiness: creates long sentences)
 *   2. Pre-split 1-2 long sentences per 20 (burstiness: creates short sentences)
 *   3. Validate 40% minimum word-level change per sentence
 *   4. Enforce capitalization (first letter, acronyms, post-period)
 *   5. Enforce strict rules: no contractions, no rhetorical questions, no first-person unless input had them
 *   6. Ensure single-sentence output when single-sentence input
 */

import { robustSentenceSplit } from "./content-protection";

// ── Types ──

export interface SurgeryItem {
  /** Unique ID for tracking through the pipeline */
  id: number;
  /** The sentence text (may be merged or split result) */
  text: string;
  /** Index of the paragraph this sentence belongs to */
  paraIdx: number;
  /** Whether this is a title/heading (skip processing) */
  isTitle: boolean;
  /** Original sentence index within its paragraph */
  sentIdxInPara: number;
  /** 'original' | 'merged' | 'split' — how this item was created */
  origin: "original" | "merged" | "split";
  /** For merged items: the original sentence IDs that were merged */
  mergedFrom?: number[];
  /** For split items: the original sentence ID that was split */
  splitFrom?: number;
}

export interface InputFeatures {
  hasContractions: boolean;
  hasFirstPerson: boolean;
  hasRhetoricalQuestions: boolean;
}

// ── Merge/Split connectors ──

const MERGE_CONNECTORS = [
  ", and ", ", yet ", ", so ",
  ", which ", ", since ", ", while ",
  ", although ", " — and ",
  "; ", ", meaning ",
];

const CLAUSE_SPLIT_PATTERNS: RegExp[] = [
  /,\s+and\s+/i,
  /,\s+but\s+/i,
  /;\s+/,
  /,\s+which\s+/i,
  /,\s+while\s+/i,
  /,\s+although\s+/i,
  /,\s+so\s+/i,
  /\s+—\s+/,
];

// ── Title/Heading Detection (shared) ──

export function isTitleOrHeading(para: string): boolean {
  const trimmed = para.trim();
  if (!trimmed) return false;
  if (/^#{1,6}\s/.test(trimmed)) return true;
  if (/^[IVXLCDM]+\.\s/i.test(trimmed)) return true;
  if (/^(?:Part|Section|Chapter)\s+\d+/i.test(trimmed)) return true;
  if (/^[\d]+[.):]\s/.test(trimmed) || /^[A-Za-z][.):]\s/.test(trimmed)) return true;
  if (/^(?:Introduction|Conclusion|Summary|Abstract|Background|Discussion|Results|Methods|References|Acknowledgments|Appendix)\s*$/i.test(trimmed)) return true;
  const words = trimmed.split(/\s+/);
  if (words.length <= 12 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) return true;
  if (words.length <= 6 && !/[.!?]$/.test(trimmed)) {
    if (/:/.test(trimmed)) return true;
    const capitalizedWords = words.filter(w => /^[A-Z]/.test(w)).length;
    if (capitalizedWords >= Math.ceil(words.length * 0.6)) return true;
  }
  return false;
}

// ══════════════════════════════════════════════════════════════════════
// 1. PRE-HUMANIZATION: Sentence Merge & Split for Burstiness
// ══════════════════════════════════════════════════════════════════════

/**
 * Apply 2-3 merges and 1-2 splits per 20 sentences to inject burstiness
 * BEFORE any humanization. Merged sentences are sent as one unit to the
 * humanizer; split sentences are sent as separate units.
 *
 * Returns the modified SurgeryItem[] list ready for humanization.
 */
export function applySentenceSurgery(items: SurgeryItem[]): SurgeryItem[] {
  // Only operate on non-title items
  const processable = items.filter(it => !it.isTitle);
  const totalSentences = processable.length;
  if (totalSentences < 6) return items; // too few sentences to operate on

  // Calculate how many merges and splits to do
  const blocks = Math.max(1, Math.floor(totalSentences / 20));
  const mergeTarget = Math.min(3, 2 + (blocks > 1 ? 1 : 0)); // 2-3 merges per 20
  const splitTarget = Math.min(2, 1 + (blocks > 1 ? 1 : 0));  // 1-2 splits per 20

  const totalMerges = mergeTarget * blocks;
  const totalSplits = splitTarget * blocks;

  // Find merge candidates: adjacent short sentences (each < 18 words, combined < 35 words)
  const mergeCandidates: number[] = []; // indices into processable[]
  for (let i = 0; i < processable.length - 1; i++) {
    const wc1 = processable[i].text.split(/\s+/).length;
    const wc2 = processable[i + 1].text.split(/\s+/).length;
    if (wc1 >= 4 && wc1 <= 18 && wc2 >= 4 && wc2 <= 18 && (wc1 + wc2) <= 35) {
      // Don't merge if they're in different paragraphs
      if (processable[i].paraIdx === processable[i + 1].paraIdx) {
        mergeCandidates.push(i);
      }
    }
  }

  // Find split candidates: long sentences (> 22 words) with clause boundaries
  const splitCandidates: number[] = [];
  for (let i = 0; i < processable.length; i++) {
    const wc = processable[i].text.split(/\s+/).length;
    if (wc > 22) {
      // Check if there's a clause boundary to split at
      const splitPoint = findClauseBoundary(processable[i].text);
      if (splitPoint !== null) {
        splitCandidates.push(i);
      }
    }
  }

  // Shuffle candidates to avoid always picking the first ones
  shuffleArray(mergeCandidates);
  shuffleArray(splitCandidates);

  // Select which to merge and split (capped at targets)
  const mergeSet = new Set<number>();
  for (const idx of mergeCandidates) {
    if (mergeSet.size >= totalMerges) break;
    // Don't merge if the next item is also being merged (no triple-merge)
    if (mergeSet.has(idx - 1) || mergeSet.has(idx + 1)) continue;
    mergeSet.add(idx);
  }

  const splitSet = new Set<number>();
  for (const idx of splitCandidates) {
    if (splitSet.size >= totalSplits) break;
    // Don't split an item that's being merged
    if (mergeSet.has(idx) || mergeSet.has(idx - 1)) continue;
    splitSet.add(idx);
  }

  // Build the new items list
  const result: SurgeryItem[] = [];
  let newId = 0;
  const processableSet = new Set(processable.map(it => it.id));
  const processableMap = new Map(processable.map((it, idx) => [it.id, idx]));
  const skipNext = new Set<number>(); // processable indices to skip (merged into previous)

  // Re-iterate original items to preserve titles in correct positions
  const procIdx = 0;
  for (const item of items) {
    if (item.isTitle) {
      result.push({ ...item, id: newId++ });
      continue;
    }

    // Find this item's index in processable
    const pIdx = processableMap.get(item.id);
    if (pIdx === undefined || skipNext.has(pIdx)) continue;

    if (mergeSet.has(pIdx)) {
      // MERGE this sentence with the next one
      const next = processable[pIdx + 1];
      if (next) {
        const clean1 = item.text.replace(/\.\s*$/, "");
        const lower2 = next.text[0]?.toLowerCase() + next.text.slice(1);
        const conn = MERGE_CONNECTORS[Math.floor(Math.random() * MERGE_CONNECTORS.length)];
        const merged = clean1 + conn + lower2;
        result.push({
          id: newId++,
          text: merged,
          paraIdx: item.paraIdx,
          isTitle: false,
          sentIdxInPara: item.sentIdxInPara,
          origin: "merged",
          mergedFrom: [item.id, next.id],
        });
        skipNext.add(pIdx + 1);
      } else {
        result.push({ ...item, id: newId++ });
      }
    } else if (splitSet.has(pIdx)) {
      // SPLIT this sentence at a clause boundary
      const splitPoint = findClauseBoundary(item.text);
      if (splitPoint !== null) {
        const { part1, part2 } = splitAtBoundary(item.text, splitPoint);
        result.push({
          id: newId++,
          text: part1,
          paraIdx: item.paraIdx,
          isTitle: false,
          sentIdxInPara: item.sentIdxInPara,
          origin: "split",
          splitFrom: item.id,
        });
        result.push({
          id: newId++,
          text: part2,
          paraIdx: item.paraIdx,
          isTitle: false,
          sentIdxInPara: item.sentIdxInPara + 0.5, // interleaved index
          origin: "split",
          splitFrom: item.id,
        });
      } else {
        result.push({ ...item, id: newId++ });
      }
    } else {
      result.push({ ...item, id: newId++ });
    }
  }

  return result;
}

/**
 * Build initial SurgeryItem[] from paragraph-split text.
 */
export function buildSentenceItems(text: string): SurgeryItem[] {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const items: SurgeryItem[] = [];
  let id = 0;

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const trimmedPara = paragraphs[pi].trim();
    if (isTitleOrHeading(trimmedPara)) {
      items.push({ id: id++, text: trimmedPara, paraIdx: pi, isTitle: true, sentIdxInPara: 0, origin: "original" });
      continue;
    }
    const sents = robustSentenceSplit(trimmedPara);
    let si = 0;
    for (const s of sents) {
      const t = s.trim();
      if (t) {
        items.push({ id: id++, text: t, paraIdx: pi, isTitle: false, sentIdxInPara: si, origin: "original" });
        si++;
      }
    }
  }

  return items;
}

/**
 * Reassemble SurgeryItem[] back into paragraph text.
 */
export function reassembleFromItems(items: SurgeryItem[]): string {
  const paraMap = new Map<number, string[]>();
  const paraIsTitle = new Map<number, boolean>();

  for (const item of items) {
    if (!paraMap.has(item.paraIdx)) {
      paraMap.set(item.paraIdx, []);
      paraIsTitle.set(item.paraIdx, item.isTitle);
    }
    paraMap.get(item.paraIdx)!.push(item.text);
    if (!item.isTitle) paraIsTitle.set(item.paraIdx, false);
  }

  const sortedKeys = [...paraMap.keys()].sort((a, b) => a - b);
  const paragraphs: string[] = [];

  for (const key of sortedKeys) {
    const sents = paraMap.get(key)!;
    if (paraIsTitle.get(key)) {
      paragraphs.push(sents[0]);
    } else {
      paragraphs.push(sents.join(" "));
    }
  }

  return paragraphs.join("\n\n");
}

// ── Helpers for merge/split ──

function findClauseBoundary(sent: string): { index: number; matchLength: number; pattern: RegExp } | null {
  const minHalfWords = 8;
  for (const pattern of CLAUSE_SPLIT_PATTERNS) {
    const match = sent.match(pattern);
    if (match && match.index !== undefined) {
      const before = sent.slice(0, match.index);
      const after = sent.slice(match.index + match[0].length);
      if (before.split(/\s+/).length >= minHalfWords && after.split(/\s+/).length >= minHalfWords) {
        return { index: match.index, matchLength: match[0].length, pattern };
      }
    }
  }
  return null;
}

function splitAtBoundary(sent: string, boundary: { index: number; matchLength: number }): { part1: string; part2: string } {
  let part1 = sent.slice(0, boundary.index).trim();
  let part2 = sent.slice(boundary.index + boundary.matchLength).trim();

  // Ensure part1 ends with period
  if (!/[.!?]$/.test(part1)) part1 += ".";

  // Capitalize part2 first letter
  if (part2 && /^[a-z]/.test(part2)) {
    part2 = part2[0].toUpperCase() + part2.slice(1);
  }

  // Ensure part2 ends with period
  if (part2 && !/[.!?]$/.test(part2)) part2 += ".";

  return { part1, part2 };
}

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ══════════════════════════════════════════════════════════════════════
// 2. POST-HUMANIZATION: 40% Minimum Change Validation
// ══════════════════════════════════════════════════════════════════════

/**
 * Calculate how much the text changed at the word level (Jaccard distance).
 * Returns a percentage (0-100) of how different the words are.
 */
export function getWordChangePercent(original: string, humanized: string): number {
  const normalize = (text: string) => {
    return text.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);
  };

  const origWords = normalize(original);
  const humWords = normalize(humanized);

  if (origWords.length === 0 && humWords.length === 0) return 0;
  if (origWords.length === 0 || humWords.length === 0) return 100;

  const origSet = new Set(origWords);
  const humSet = new Set(humWords);

  let intersection = 0;
  for (const word of humSet) {
    if (origSet.has(word)) intersection++;
  }

  const union = new Set([...origSet, ...humSet]).size;
  const similarity = intersection / (union || 1);

  return Math.round((1 - similarity) * 100);
}

/**
 * Check if the humanized version meets the 40% minimum change threshold.
 */
export function meetsMinimumChange(original: string, humanized: string, threshold = 40): boolean {
  return getWordChangePercent(original, humanized) >= threshold;
}

// ══════════════════════════════════════════════════════════════════════
// 3. POST-HUMANIZATION: Capitalization Enforcement
// ══════════════════════════════════════════════════════════════════════

/**
 * Fix capitalization issues:
 *   - First letter of every sentence must be uppercase
 *   - Preserve acronyms from the original (e.g. SEO, AI, IBM)
 *   - Fix lowercase after period+space
 *   - Preserve protected placeholders
 */
export function enforceCapitalization(original: string, humanized: string): string {
  let fixed = humanized;

  // 1. Capitalize the very first alphabetical character of the text
  fixed = fixed.replace(/^([^a-zA-Z]*)([a-zA-Z])/, (_match, prefix, firstLetter) => {
    return prefix + firstLetter.toUpperCase();
  });

  // 2. Fix lowercase after sentence-ending punctuation
  fixed = fixed.replace(/([.!?])\s+([a-z])/g, (_match, punct, letter) => {
    return punct + " " + letter.toUpperCase();
  });

  // 3. Preserve all-caps acronyms from the original
  const acronyms = original.match(/\b[A-Z]{2,}\b/g) || [];
  const uniqueAcronyms = [...new Set(acronyms)];
  for (const acronym of uniqueAcronyms) {
    const regex = new RegExp(`\\b${acronym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    fixed = fixed.replace(regex, (match) => {
      // Only fix if the match is the same word but wrong case
      if (match.toUpperCase() === acronym) return acronym;
      return match;
    });
  }

  // 4. Fix each paragraph individually
  const paragraphs = fixed.split(/\n\s*\n/);
  fixed = paragraphs.map(para => {
    const trimmed = para.trim();
    if (!trimmed) return para;
    // Capitalize first letter of each paragraph
    return trimmed.replace(/^([^a-zA-Z]*)([a-zA-Z])/, (_m, prefix, letter) => {
      return prefix + letter.toUpperCase();
    });
  }).join("\n\n");

  return fixed;
}

// ══════════════════════════════════════════════════════════════════════
// 4. POST-HUMANIZATION: Strict Rule Enforcement
// ══════════════════════════════════════════════════════════════════════

const CONTRACTION_RE = /\b(can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|wouldn't|shouldn't|couldn't|mustn't|it's|that's|there's|here's|he's|she's|they're|we're|you're|I'm|they've|we've|you've|I've|they'll|we'll|you'll|I'll|he'll|she'll|it'll|let's|who's|what's)\b/gi;

const CONTRACTION_EXPANSIONS: Record<string, string> = {
  "can't": "cannot", "won't": "will not", "don't": "do not",
  "doesn't": "does not", "didn't": "did not", "isn't": "is not",
  "aren't": "are not", "wasn't": "was not", "weren't": "were not",
  "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
  "wouldn't": "would not", "shouldn't": "should not", "couldn't": "could not",
  "mustn't": "must not", "it's": "it is", "that's": "that is",
  "there's": "there is", "here's": "here is", "he's": "he is",
  "she's": "she is", "they're": "they are", "we're": "we are",
  "you're": "you are", "i'm": "I am", "they've": "they have",
  "we've": "we have", "you've": "you have", "i've": "I have",
  "they'll": "they will", "we'll": "we will", "you'll": "you will",
  "i'll": "I will", "he'll": "he will", "she'll": "she will",
  "it'll": "it will", "let's": "let us", "who's": "who is",
  "what's": "what is",
};

const FIRST_PERSON_RE = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/g;

/**
 * Enforce all strict output rules on a single sentence.
 * Returns { text, passed, issues } — text is the corrected version.
 */
export function enforceStrictRules(
  original: string,
  humanized: string,
  features: InputFeatures,
): { text: string; passed: boolean; issues: string[] } {
  let text = humanized;
  const issues: string[] = [];

  // 1. No contractions (unless input had them)
  if (!features.hasContractions) {
    text = text.replace(CONTRACTION_RE, (match) => {
      const key = match.toLowerCase();
      const expanded = CONTRACTION_EXPANSIONS[key];
      if (expanded) {
        // Preserve capitalization
        if (match[0] === match[0].toUpperCase() && expanded[0] === expanded[0].toLowerCase()) {
          return expanded[0].toUpperCase() + expanded.slice(1);
        }
        return expanded;
      }
      return match;
    });
    // Check if any remain
    if (CONTRACTION_RE.test(text)) {
      issues.push("CONTRACTION_REMAINING");
    }
  }

  // 2. No rhetorical questions (unless input had them)
  if (!features.hasRhetoricalQuestions && text.trim().endsWith("?")) {
    // Convert question to statement
    text = text.trim().replace(/\?$/, ".");
    issues.push("RHETORICAL_QUESTION_CONVERTED");
  }

  // 3. No first-person (unless input had them)
  if (!features.hasFirstPerson) {
    if (FIRST_PERSON_RE.test(text)) {
      issues.push("FIRST_PERSON_DETECTED");
      // Simple removal: replace common first-person patterns
      text = text.replace(/\bI believe\b/gi, "it appears");
      text = text.replace(/\bI think\b/gi, "it seems");
      text = text.replace(/\bwe can see\b/gi, "one can see");
      text = text.replace(/\bwe find\b/gi, "one finds");
      text = text.replace(/\bwe need\b/gi, "there is a need");
      text = text.replace(/\bour\b/gi, "the");
      text = text.replace(/\bus\b/gi, "people");
    }
  }

  return { text, passed: issues.length === 0, issues };
}

// ══════════════════════════════════════════════════════════════════════
// 5. SINGLE-SENTENCE OUTPUT ENFORCEMENT
// ══════════════════════════════════════════════════════════════════════

/**
 * If a humanizer returns 2+ sentences from a single input sentence,
 * forcefully collapse them back into one sentence.
 */
export function enforceSingleSentence(text: string): string {
  const sentences = robustSentenceSplit(text.trim());
  if (sentences.length <= 1) return text.trim();

  // Strategy: join all sentences into one by replacing period+space with comma
  // For the last sentence, keep its ending punctuation
  const parts: string[] = [];
  for (let i = 0; i < sentences.length; i++) {
    let s = sentences[i].trim();
    if (i < sentences.length - 1) {
      // Remove trailing punctuation and lowercase the next sentence start
      s = s.replace(/[.!?]+$/, "");
    }
    if (i > 0 && s.length > 0) {
      // Lowercase first letter of continuation
      s = s[0].toLowerCase() + s.slice(1);
    }
    parts.push(s);
  }

  let result = parts.join(", ");

  // Ensure it ends with a period
  if (!/[.!?]$/.test(result)) result += ".";

  return result;
}
