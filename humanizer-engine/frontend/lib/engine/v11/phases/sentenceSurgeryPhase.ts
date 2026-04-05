/**
 * Phase 2.5 — Sentence Surgery
 * ==============================
 * Pre-humanization merge/split for burstiness injection.
 * Merges 2-3 adjacent short sentences per 20 and splits 1-2 long ones.
 * This happens BEFORE any humanization transforms.
 */

import type { DocumentState, Phase, Sentence } from '../types';

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

function findClauseBoundary(sent: string): { index: number; matchLength: number } | null {
  const minHalfWords = 8;
  for (const pattern of CLAUSE_SPLIT_PATTERNS) {
    const match = sent.match(pattern);
    if (match && match.index !== undefined) {
      const before = sent.slice(0, match.index);
      const after = sent.slice(match.index + match[0].length);
      if (before.split(/\s+/).length >= minHalfWords && after.split(/\s+/).length >= minHalfWords) {
        return { index: match.index, matchLength: match[0].length };
      }
    }
  }
  return null;
}

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export const sentenceSurgeryPhase: Phase = {
  name: 'sentenceSurgery',
  async process(state: DocumentState): Promise<DocumentState> {
    let totalMerged = 0;
    let totalSplit = 0;

    for (const para of state.paragraphs) {
      const sents = para.sentences;
      if (sents.length < 6) continue;

      const blocks = Math.max(1, Math.floor(sents.length / 20));
      const mergeTarget = Math.min(3, 2 + (blocks > 1 ? 1 : 0));
      const splitTarget = Math.min(2, 1 + (blocks > 1 ? 1 : 0));

      // Find merge candidates: adjacent short sentences
      const mergeCandidates: number[] = [];
      for (let i = 0; i < sents.length - 1; i++) {
        const wc1 = sents[i].text.split(/\s+/).length;
        const wc2 = sents[i + 1].text.split(/\s+/).length;
        if (wc1 >= 4 && wc1 <= 18 && wc2 >= 4 && wc2 <= 18 && (wc1 + wc2) <= 35) {
          mergeCandidates.push(i);
        }
      }

      // Find split candidates: long sentences with clause boundaries
      const splitCandidates: number[] = [];
      for (let i = 0; i < sents.length; i++) {
        const wc = sents[i].text.split(/\s+/).length;
        if (wc > 22 && findClauseBoundary(sents[i].text)) {
          splitCandidates.push(i);
        }
      }

      shuffleArray(mergeCandidates);
      shuffleArray(splitCandidates);

      // Select merges
      const mergeSet = new Set<number>();
      for (const idx of mergeCandidates) {
        if (mergeSet.size >= mergeTarget * blocks) break;
        if (mergeSet.has(idx - 1) || mergeSet.has(idx + 1)) continue;
        mergeSet.add(idx);
      }

      // Select splits
      const splitSet = new Set<number>();
      for (const idx of splitCandidates) {
        if (splitSet.size >= splitTarget * blocks) break;
        if (mergeSet.has(idx) || mergeSet.has(idx - 1)) continue;
        splitSet.add(idx);
      }

      // Build new sentence list
      const newSentences: Sentence[] = [];
      let newId = 0;
      const skipNext = new Set<number>();

      for (let i = 0; i < sents.length; i++) {
        if (skipNext.has(i)) continue;

        if (mergeSet.has(i) && i + 1 < sents.length) {
          // Merge this with next
          const clean1 = sents[i].text.replace(/\.\s*$/, "");
          const lower2 = sents[i + 1].text[0]?.toLowerCase() + sents[i + 1].text.slice(1);
          const conn = MERGE_CONNECTORS[Math.floor(Math.random() * MERGE_CONNECTORS.length)];
          const merged = clean1 + conn + lower2;
          newSentences.push({
            id: newId++,
            text: merged,
            originalText: sents[i].originalText + " " + sents[i + 1].originalText,
            flags: [...sents[i].flags],
            score: Math.max(sents[i].score, sents[i + 1].score),
          });
          skipNext.add(i + 1);
          totalMerged++;
        } else if (splitSet.has(i)) {
          // Split at clause boundary
          const boundary = findClauseBoundary(sents[i].text);
          if (boundary) {
            let part1 = sents[i].text.slice(0, boundary.index).trim();
            let part2 = sents[i].text.slice(boundary.index + boundary.matchLength).trim();
            if (!/[.!?]$/.test(part1)) part1 += ".";
            if (part2 && /^[a-z]/.test(part2)) part2 = part2[0].toUpperCase() + part2.slice(1);
            if (part2 && !/[.!?]$/.test(part2)) part2 += ".";
            newSentences.push({
              id: newId++,
              text: part1,
              originalText: sents[i].originalText,
              flags: [...sents[i].flags],
              score: sents[i].score,
            });
            newSentences.push({
              id: newId++,
              text: part2,
              originalText: sents[i].originalText,
              flags: [...sents[i].flags],
              score: sents[i].score,
            });
            totalSplit++;
          } else {
            newSentences.push({ ...sents[i], id: newId++ });
          }
        } else {
          newSentences.push({ ...sents[i], id: newId++ });
        }
      }

      para.sentences = newSentences;
    }

    state.logs.push(
      `[sentenceSurgery] ${totalMerged} merges, ${totalSplit} splits applied for burstiness`
    );

    return state;
  },
};
