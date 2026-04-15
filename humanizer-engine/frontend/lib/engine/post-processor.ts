/**
 * Post Processor — ported from post_processor.py
 * Final-stage cleanup for ALL humanizer output.
 * 6 phases: filler cleanup → phrase repetition reduction → near-duplicate removal →
 *           connector de-monotony → weak copula chain breaking → surface cleanup
 */

import { sentTokenize } from "./utils";
import { robustSentenceSplit } from "./content-protection";
import { applyAIWordKill, applyPhrasePatterns, applyConnectorNaturalization } from "./shared-dictionaries";

// ── Phase 1: Filler removal ──

const FILLER_REPLACEMENTS: [RegExp, string][] = [
  [/\bit is (?:important|crucial|essential|vital) to (?:understand |recognize |note )?that\s*/gi, ""],
  [/\bit (?:should|must|can) be (?:noted|argued|emphasized|stressed) that\s*/gi, ""],
  [/\bit is worth (?:noting|mentioning|pointing out) that\s*/gi, ""],
  [/\bone could argue that\s*/gi, ""],
  [/\bthere is no denying (?:the fact )?that\s*/gi, ""],
  [/\bneedless to say,?\s*/gi, ""],
  [/\bthe fact (?:of the matter |)is that\s*/gi, ""],
  [/\bas a matter of fact,?\s*/gi, ""],
  [/\bin (?:actual|point of) fact,?\s*/gi, ""],
  [/\ball things considered,?\s*/gi, ""],
  [/\bat the end of the day,?\s*/gi, ""],
  [/\bwhen all is said and done,?\s*/gi, ""],
  [/\bin the grand scheme of things,?\s*/gi, ""],
  [/\bfor all intents and purposes,?\s*/gi, ""],
  [/\bby and large,?\s*/gi, ""],
  [/\bmore often than not,?\s*/gi, ""],
  [/\bin no small (?:measure|part),?\s*/gi, ""],
  [/\bin a very real sense,?\s*/gi, ""],
  [/\bit goes without saying that\s*/gi, ""],
  [/\bto a (?:large|great|significant) (?:extent|degree),?\s*/gi, ""],
  [/\bin the final analysis,?\s*/gi, ""],
  [/\bthe (?:plain|simple) truth is that\s*/gi, ""],
  [/\bwhat this means is that\s*/gi, ""],
  [/\bthe bottom line is that\s*/gi, ""],
  [/\bas has been (?:noted|mentioned|discussed|established),?\s*/gi, ""],
  [/\bas previously (?:mentioned|noted|stated|discussed),?\s*/gi, ""],
  [/\bhaving said that,?\s*/gi, ""],
  [/\bthat being said,?\s*/gi, ""],
  [/\bwith that in mind,?\s*/gi, ""],
  [/\bwith this in mind,?\s*/gi, ""],
  // ── Bureaucratic "the [noun] of" → gerund (from Python) ──
  [/,?\s*among others\b/gi, ""],
  [/\bcan be linked to the fact that\b/gi, "means that"],
  [/\bcan be attributed to the fact that\b/gi, "is because"],
  [/\bis linked to the fact that\b/gi, "means that"],
  [/\bDue to the fact that\b/gi, "Because"],
  [/\bIn spite of the (?:fact|condition|circumstance|situation|reality) that\b/gi, "Although"],
  [/\bRegardless of the (?:fact|condition|circumstance|situation|reality) that\b/gi, "Although"],
  [/\bNotwithstanding the (?:fact|condition|circumstance|situation|reality) that\b/gi, "Although"],
  [/\bThere is no doubt that\b/gi, "Undoubtedly,"],
  [/\ba person can\b/gi, "one can"],
  [/\ba person to\b/gi, "one to"],
  [/\bthe improvement of\b/gi, "improving"],
  [/\bthe development of\b/gi, "developing"],
  [/\bthe establishment of\b/gi, "establishing"],
  [/\bthe implementation of\b/gi, "implementing"],
  [/\bthe creation of\b/gi, "creating"],
  [/\bthe production of\b/gi, "producing"],
  [/\bthe promotion of\b/gi, "promoting"],
  [/\bthe utilization of\b/gi, "using"],
  [/\bthe enhancement of\b/gi, "enhancing"],
  [/\bthe reduction of\b/gi, "reducing"],
  [/,?\s*whereby\b/gi, ", where"],
  [/\bsuch that individuals can\b/gi, "so people can"],
  [/\band also\b/gi, "and"],
];

function cleanFillers(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs.map((para) => {
    let result = para;
    for (const [pattern, replacement] of FILLER_REPLACEMENTS) {
      result = result.replace(pattern, replacement);
    }
    // Capitalize sentence starts after removal
    result = result.replace(/(?<=[.!?])\s+([a-z])/g, (_, c) => " " + c.toUpperCase());

    // Fragment removal DISABLED — would alter sentence count (1-in=1-out)
    // Sentences must be preserved regardless of length

    return result;
  }).join("\n\n");
}

// ── Phase 2: Phrase repetition reduction ──

function reducePhraseRepetition(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).filter(Boolean);
  const result: string[] = [];

  for (const para of paragraphs) {
    const sentences = robustSentenceSplit(para);
    if (sentences.length < 5) { result.push(para); continue; }

    // Count 3-5 word phrases
    const phraseCounts = new Map<string, number>();
    const phraseToSentences = new Map<string, number[]>();

    for (let i = 0; i < sentences.length; i++) {
      const words = sentences[i].toLowerCase().split(/\s+/);
      for (let n = 3; n <= 5; n++) {
        for (let j = 0; j <= words.length - n; j++) {
          const phrase = words.slice(j, j + n).join(" ");
          phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
          const sentIndices = phraseToSentences.get(phrase) ?? [];
          if (!sentIndices.includes(i)) sentIndices.push(i);
          phraseToSentences.set(phrase, sentIndices);
        }
      }
    }

    // Find phrases appearing 3+ times
    const repeatedPhrases = [...phraseCounts.entries()]
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1]);

    if (repeatedPhrases.length === 0) { result.push(para); continue; }

    // Remove excess sentences (max 15% removal — reduced from 40% to preserve content)
    const maxRemove = Math.max(1, Math.floor(sentences.length * 0.15));
    const toRemove = new Set<number>();

    for (const [phrase] of repeatedPhrases) {
      if (toRemove.size >= maxRemove) break;
      const indices = phraseToSentences.get(phrase) ?? [];
      // Keep first 2 occurrences, mark rest for removal
      for (let k = 2; k < indices.length; k++) {
        if (toRemove.size < maxRemove) {
          toRemove.add(indices[k]);
        }
      }
    }

    result.push(sentences.filter((_, i) => !toRemove.has(i)).join(" ") || sentences[0]);
  }

  return result.join("\n\n");
}

// ── Phase 3: Near-duplicate sentence removal ──

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

function sequenceMatcherRatio(a: string, b: string): number {
  // Simple longest common subsequence ratio
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;

  // Use a simplified approach: word-level matching
  const wordsA = a.toLowerCase().split(/\s+/);
  const wordsB = b.toLowerCase().split(/\s+/);
  let matches = 0;
  const used = new Set<number>();
  for (const wa of wordsA) {
    for (let j = 0; j < wordsB.length; j++) {
      if (!used.has(j) && wa === wordsB[j]) {
        matches++;
        used.add(j);
        break;
      }
    }
  }
  return (2 * matches) / (wordsA.length + wordsB.length);
}

function removeNearDuplicates(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).filter(Boolean);
  const result: string[] = [];
  const globalSentences: string[] = [];

  for (const para of paragraphs) {
    const sentences = robustSentenceSplit(para);
    const kept: string[] = [];

    for (const sent of sentences) {
      const sentWords = new Set(sent.toLowerCase().split(/\s+/));
      let isDuplicate = false;

      for (const existing of globalSentences) {
        const existingWords = new Set(existing.toLowerCase().split(/\s+/));
        const jaccardSim = jaccard(sentWords, existingWords);
        if (jaccardSim >= 0.80) {
          isDuplicate = true;
          break;
        }
        if (sequenceMatcherRatio(sent, existing) >= 0.78) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        kept.push(sent);
        globalSentences.push(sent);
      }
    }

    if (kept.length > 0) {
      result.push(kept.join(" "));
    } else {
      // Always keep at least the first sentence to preserve paragraph count
      result.push(sentences[0]);
      globalSentences.push(sentences[0]);
    }
  }

  return result.join("\n\n");
}

// ── Phase 4: Connector de-monotony ──

function dedupConnectors(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).filter(Boolean);
  const connectorCounts = new Map<string, number>();
  const CONNECTORS = [
    "However, ", "Therefore, ", "Furthermore, ", "Moreover, ",
    "Additionally, ", "Consequently, ", "Nevertheless, ", "Meanwhile, ",
    "Similarly, ", "Specifically, ", "Notably, ", "Indeed, ",
  ];

  const CONNECTOR_ALTS: Record<string, string[]> = {
    "However, ": ["That said, ", "Still, ", "Even so, "],
    "Therefore, ": ["As such, ", "For this reason, ", "Hence, "],
    "Furthermore, ": ["Beyond this, ", "Also, ", "In addition, "],
    "Moreover, ": ["What is more, ", "Besides, ", "On top of this, "],
    "Additionally, ": ["Also, ", "Besides, ", "In addition, "],
    "Consequently, ": ["As a result, ", "Because of this, ", "Thus, "],
    "Nevertheless, ": ["Even so, ", "Despite this, ", "All the same, "],
    "Meanwhile, ": ["At the same time, ", "Simultaneously, ", "In parallel, "],
  };

  return paragraphs.map((para) => {
    const sentences = robustSentenceSplit(para);
    const result: string[] = [];
    for (const sent of sentences) {
      let modified = sent;
      for (const conn of CONNECTORS) {
        if (sent.startsWith(conn)) {
          const count = connectorCounts.get(conn) ?? 0;
          connectorCounts.set(conn, count + 1);
          if (count >= 2) {
            const alts = CONNECTOR_ALTS[conn];
            if (alts) {
              const alt = alts[Math.floor(Math.random() * alts.length)];
              modified = alt + sent.slice(conn.length);
            }
          }
          break;
        }
      }
      result.push(modified);
    }
    return result.join(" ");
  }).join("\n\n");
}

// ── Phase 5: Break copula chains ──

function breakCopulaChains(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).filter(Boolean);

  return paragraphs.map((para) => {
    const sentences = robustSentenceSplit(para);
    const copulaPatterns = [
      /\bis important\b/i, /\bis crucial\b/i, /\bis essential\b/i,
      /\bis significant\b/i, /\bis vital\b/i, /\bis critical\b/i,
    ];
    const copulaAlts = [
      "matters", "carries weight", "holds significance",
      "remains central", "stands out", "deserves attention",
    ];

    let copulaCount = 0;
    const result: string[] = [];

    for (const sent of sentences) {
      let modified = sent;
      for (const pattern of copulaPatterns) {
        if (pattern.test(sent)) {
          copulaCount++;
          if (copulaCount > 2) {
            const alt = copulaAlts[Math.floor(Math.random() * copulaAlts.length)];
            modified = sent.replace(pattern, alt);
          }
          break;
        }
      }
      result.push(modified);
    }

    return result.join(" ");
  }).join("\n\n");
}

// ── Phase 6: Surface cleanup ──

function finalSurfaceCleanup(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).filter(Boolean);
  return paragraphs.map((para) => {
    let result = para;
    // Double spaces
    result = result.replace(/ {2,}/g, " ");
    // Double periods
    result = result.replace(/\.{2,}/g, ".");
    // Space before punctuation
    result = result.replace(/\s+([.,;:!?])/g, "$1");
    // Double commas
    result = result.replace(/,{2,}/g, ",");
    // Double semicolons
    result = result.replace(/;{2,}/g, ";");
    // Repeated words (e.g., "the the")
    result = result.replace(/\b(\w+)\s+\1\b/gi, "$1");
    // Capitalize sentence starts
    const sentences = robustSentenceSplit(result);
    const cleaned: string[] = [];
    for (const s of sentences) {
      const trimmed = s.trim();
      if (trimmed) {
        cleaned.push(trimmed[0].toUpperCase() + trimmed.slice(1));
      }
    }
    return cleaned.join(" ");
  }).join("\n\n");
}

// ── Phase 7a: Remove orphan anaphora ──

const ORPHAN_ANAPHORA_RE = /^(?:This|That|These|Those|Such)\s+(?:is|are|was|were|has|have|had|can|could|would|should|may|might|will|shall|shows?|demonstrates?|indicates?|highlights?|suggests?|reveals?|means?|implies?|illustrates?|provides?|represents?|serves?|plays?|offers?|creates?|makes?|becomes?|remains?|brings?|gives?|takes?|leads?|builds?|forms?)\b/i;
const PURE_PADDING_RE = /^(?:This is (?:a |an )?(?:important|crucial|vital|essential|significant|key) (?:point|aspect|factor|element|consideration)\.?|Indeed,? this (?:is|has been|remains) (?:a |an )?(?:important|crucial) (?:area|topic|subject)\.?)$/i;

function removeOrphanAnaphora(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).filter(Boolean);
  const result: string[] = [];
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const sents = robustSentenceSplit(trimmed);
    const kept: string[] = [];
    for (let i = 0; i < sents.length; i++) {
      const stripped = sents[i].trim();
      if (PURE_PADDING_RE.test(stripped)) continue;
      if (ORPHAN_ANAPHORA_RE.test(stripped)) {
        if (kept.length === 0) continue;
        if (kept[kept.length - 1].split(/\s+/).length < 5) continue;
      }
      kept.push(sents[i]);
    }
    if (kept.length === 0 && sents.length > 0) {
      kept.push(sents[0]);
    }
    result.push(kept.join(" "));
  }
  return result.join("\n\n");
}

// ── Phase 7b: Flag circular conclusion ──

function sentenceSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

function flagCircularConclusion(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length < 3) return text;

  const firstPara = paragraphs[0];
  const lastPara = paragraphs[paragraphs.length - 1];

  const sim = sentenceSimilarity(firstPara, lastPara);
  if (sim < 0.50) return text;

  // Trim duplicate sentences from conclusion
  const introSents = robustSentenceSplit(firstPara);
  const conclSents = robustSentenceSplit(lastPara);
  const keptConcl: string[] = [];
  for (const cs of conclSents) {
    let isDup = false;
    for (const is of introSents) {
      if (sentenceSimilarity(cs, is) >= 0.60) { isDup = true; break; }
    }
    if (!isDup) keptConcl.push(cs);
  }
  if (keptConcl.length > 0) {
    paragraphs[paragraphs.length - 1] = keptConcl.join(" ");
  }
  // If ALL conclusion sentences duplicated, keep original

  return paragraphs.join("\n\n");
}

// ── Public API ──

export function postProcess(text: string): string {
  if (!text?.trim()) return text;

  let result = text;

  // Phase 1: Filler cleanup
  result = cleanFillers(result);

  // Phase 2: Phrase repetition reduction
  result = reducePhraseRepetition(result);

  // Phase 3: Near-duplicate sentence removal — DISABLED
  // Removing sentences violates 1-in-1-out rule.
  // Duplicates are prevented by independent per-sentence processing.
  // result = removeNearDuplicates(result);

  // Phase 4: Connector de-monotony
  result = dedupConnectors(result);

  // Phase 5: Break copula chains
  result = breakCopulaChains(result);

  // Phase 6: Surface cleanup
  result = finalSurfaceCleanup(result);

  // Phase 7: Remove orphan anaphora + flag circular conclusions
  result = removeOrphanAnaphora(result);
  result = flagCircularConclusion(result);

  // Phase 8: AI vocabulary killing — DISABLED
  // Re-running applyAIWordKill at this stage undoes careful word choices from
  // earlier phases and re-introduces grammar bugs (e.g. matchForm "alsoly").
  // AI word killing already runs in the main pipeline.
  // {
  //   ...
  // }

  return result;
}
