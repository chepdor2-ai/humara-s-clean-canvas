import { NextResponse } from 'next/server';
import { humanize } from '@/lib/engine/humanizer';
import { ghostProHumanize } from '@/lib/engine/ghost-pro';
import { llmHumanize, restructureSentence } from '@/lib/engine/llm-humanizer';
import { premiumHumanize } from '@/lib/engine/premium-humanizer';
import { humanizeV11 } from '@/lib/engine/v11';
import { humaraHumanize } from '@/lib/humara';
import { getDetector } from '@/lib/engine/multi-detector';
import { isMeaningPreserved, semanticSimilaritySync } from '@/lib/engine/semantic-guard';
import { fixCapitalization } from '@/lib/engine/shared-dictionaries';
import { fixMidSentenceCapitalization } from '@/lib/engine/validation-post-process';
import { deduplicateRepeatedPhrases } from '@/lib/engine/premium-deep-clean';
import { preserveInputStructure } from '@/lib/engine/structure-preserver';
import { structuralPostProcess } from '@/lib/engine/structural-post-processor';
import { generateCandidates, type ScoredCandidate } from '@/lib/candidate-generator';
import { unifiedSentenceProcess } from '@/lib/sentence-processor';
import { expandContractions } from '@/lib/humanize-transforms';
import { removeEmDashes } from '@/lib/engine/v13-shared-techniques';
import { nuruHumanize } from '@/lib/engine/nuru-humanizer';
import { stealthHumanize, stealthHumanizeTargeted } from '@/lib/engine/stealth';
import OpenAI from 'openai';
import { omegaHumanize } from '@/lib/engine/omega-humanizer';
import { easyHumanize } from '@/lib/engine/easy-humanizer';
import { ozoneHumanize } from '@/lib/engine/ozone-humanizer';
import { oxygenHumanize } from '@/lib/engine/oxygen-humanizer';
import { humarinHumanize } from '@/lib/engine/humarin-humanizer';
import { oxygen3Humanize } from '@/lib/engine/oxygen3-humanizer';
import { robustSentenceSplit } from '@/lib/engine/content-protection';
// deepRestructure, voiceShift, tenseVariation disabled — they garble sentence structure
// import { deepRestructure, voiceShift, tenseVariation } from '@/lib/engine/advanced-transforms';
import { synonymReplace } from '@/lib/engine/utils';
import { applyAIWordKill } from '@/lib/engine/shared-dictionaries';
import { postCleanGrammar } from '@/lib/engine/grammar-cleaner';
import { apexHumanize } from '@/lib/engine/apex-humanizer';
import { kingHumanize } from '@/lib/engine/king-humanizer';

export const maxDuration = 120; // LLM engines need more time

// ── Template-Breaking Pass for Wiki Mode ──────────────────────────
// Detects repetitive sentence starters and evaluation phrases across
// paragraphs, then varies them to break the AI template pattern that
// detectors (GPTZero, Pangram, Originality.ai) flag.
function breakRepetitiveTemplates(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

  // Track sentence starters across ALL paragraphs to detect repetition
  const allSentences: string[] = [];
  const sentencesByPara = paragraphs.map(p => robustSentenceSplit(p.trim()));
  for (const sents of sentencesByPara) {
    allSentences.push(...sents);
  }

  // Count how many times each template pattern appears in the whole document
  type TemplateRule = { pattern: RegExp; variations: string[] };
  const templateRules: TemplateRule[] = [
    {
      // "This source is [particularly/highly/etc] relevant because ..."
      pattern: /^This source is (?:particularly |especially |highly |directly )?relevant because\b/i,
      variations: [
        'The relevance of this work lies in the fact that',
        'What makes this study pertinent is that',
        'From a research standpoint, this source matters because',
        'This work bears directly on the topic since',
        'A key strength of this source is that',
        'For the purposes of this research, this work is useful since',
        'The contribution this source makes is evident in how',
      ],
    },
    {
      // "This source is [particularly/highly/etc] relevant [without because]"
      pattern: /^This source is (?:particularly |especially |highly |directly )?relevant\b(?! because)/i,
      variations: [
        'The pertinence of this work stems from the way',
        'What lends this study its value is that',
        'This source carries weight in the present analysis since',
        'The applicability of this work is clear, as',
      ],
    },
    {
      // "This makes it a [valuable/important/critical/...] ..."
      pattern: /^This makes it (?:a |an )?(?:valuable|important|critical|essential|useful|key|significant)\b/i,
      variations: [
        'As such, it serves as a key',
        'Its value lies in its role as a noteworthy',
        'Consequently, researchers can draw on this',
        'It therefore stands as a significant',
        'For these reasons, it functions as a central',
        'This positions it as an instructive',
      ],
    },
    {
      // "This source is foundational/essential because ..."
      pattern: /^This source is (?:foundational|essential) because\b/i,
      variations: [
        'As a foundational text, this work matters because',
        'The baseline significance of this source stems from the fact that',
        'Its foundational character is clear in that',
        'Serving as an anchor for subsequent research, this work is notable since',
      ],
    },
    {
      // "This source is foundational/essential [without because]"
      pattern: /^This source is (?:foundational|essential)\b(?! because)/i,
      variations: [
        'As a foundational text, this work',
        'The baseline significance of this source is clear since it',
        'Anchoring subsequent research, this work',
      ],
    },
    {
      // "The findings suggest/indicate/highlight/show/reveal/emphasize/reinforce ..."
      pattern: /^The findings (?:suggest|indicate|highlight|show|reveal|emphasize|reinforce)\b/i,
      variations: [
        'What emerges from the data is',
        'Evidence from the study suggests',
        'On the basis of these results, one can observe',
        'The data make clear',
        'Taken together, the results indicate',
      ],
    },
    {
      // "It highlights/emphasizes/underscores/also highlights ..."  
      pattern: /^It (?:also )?(?:highlights|emphasizes|underscores)\b/i,
      variations: [
        'Attention is drawn to',
        'One noteworthy dimension involves',
        'The analysis brings into focus',
        'A further point concerns',
        'The discussion underlines',
        'The argument centers on',
        'An important aspect involves',
        'The work calls attention to',
      ],
    },
    {
      // "Additionally/Furthermore/Moreover, ..."
      pattern: /^(?:Additionally|Furthermore|Moreover),?\s/i,
      variations: [
        'Beyond this, ',
        'On a related note, ',
        'Alongside these findings, ',
        'In parallel, ',
        'Equally, ',
        'At the same time, ',
      ],
    },
    {
      // "The study/report/research/authors also highlights/emphasizes ..."
      pattern: /^The (?:study|report|research|analysis|authors?)\s+(?:also\s+)?(?:highlights?|emphasizes?|underscores?|reinforces?|supports?)\b/i,
      variations: [
        'An additional insight from this work involves',
        'One further dimension that emerges concerns',
        'The work also draws attention to',
        'A related observation concerns',
        'What stands out in the analysis involves',
        'The report turns the focus to',
        'A notable finding concerns',
        'Equally relevant here involves',
      ],
    },
    {
      // "It supports/reinforces/complements the ..."
      pattern: /^It (?:supports|reinforces|complements) the\b/i,
      variations: [
        'This line of evidence strengthens the',
        'Corroborating this view is the',
        'Further support comes from the',
        'Reinforcing this point is the',
      ],
    },
    {
      // Catch variations that were introduced by our own template-breaking but repeat
      // "Of particular note is ..."
      pattern: /^Of particular note is\b/i,
      variations: [
        'A noteworthy element here involves',
        'An important element here involves',
        'What stands out involves',
        'Attention should be given to',
        'One prominent aspect concerns',
      ],
    },
    {
      // "Worth noting in this context is ..."
      pattern: /^Worth noting in this context is\b/i,
      variations: [
        'Relevant to the current discussion involves',
        'What merits attention here concerns',
        'A salient point in the analysis concerns',
        'What bears emphasis involves',
      ],
    },
  ];

  // Count pattern occurrences across all sentences
  const patternCounts: number[] = templateRules.map(rule =>
    allSentences.filter(s => rule.pattern.test(s.trim())).length
  );

  // Track which variation index was used for each rule to avoid repeats
  const usedVariationIndices: Set<number>[] = templateRules.map(() => new Set());

  const result = sentencesByPara.map(sents => {
    return sents.map(sent => {
      const trimmed = sent.trim();
      if (!trimmed) return sent;

      for (let rIdx = 0; rIdx < templateRules.length; rIdx++) {
        const rule = templateRules[rIdx];
        // Only vary patterns that appear 2+ times in the document
        if (patternCounts[rIdx] < 2) continue;

        const match = trimmed.match(rule.pattern);
        if (!match) continue;

        // Pick an unused variation
        const used = usedVariationIndices[rIdx];
        let varIdx = Math.floor(Math.random() * rule.variations.length);
        let attempts = 0;
        while (used.has(varIdx) && attempts < rule.variations.length) {
          varIdx = (varIdx + 1) % rule.variations.length;
          attempts++;
        }
        used.add(varIdx);

        const replacement = rule.variations[varIdx];
        const afterMatch = trimmed.slice(match[0].length).trim();

        if (!afterMatch) return replacement;

        // Skip replacement if remainder has a dangling coordinate verb
        // e.g. "highlights X and identifies Y" → afterMatch = "X and identifies Y"
        // Replacing the subject+verb would leave "and identifies" without a subject
        const coordinateVerbPattern = /\band\s+(?:also\s+)?(?:identifies|highlights|emphasizes|underscores|argues|suggests|demonstrates|provides|shows|reveals|examines|explores|finds|notes|discusses|presents|reports|concludes|recommends|calls|proposes|offers|advocates|supports|reinforces)\b/i;
        if (coordinateVerbPattern.test(afterMatch)) {
          continue;
        }

        // Join replacement with remainder, handling capitalization
        if (replacement.endsWith(' ')) {
          return replacement + afterMatch.charAt(0).toLowerCase() + afterMatch.slice(1);
        }
        return replacement + ' ' + afterMatch.charAt(0).toLowerCase() + afterMatch.slice(1);
      }
      return sent;
    }).join(' ');
  }).join('\n\n');

  return result;
}

/**
 * Fix hyphenated compound words where the LLM inserts spaces around hyphens.
 * "cross - national" → "cross-national", "evidence - based" → "evidence-based"
 */
function fixHyphenSpacing(text: string): string {
  // Fix "word - word" patterns (spaces around hyphen between lowercase words)
  return text.replace(/\b([a-z]+)\s+-\s+([a-z]+)\b/gi, '$1-$2');
}

// ── 60% Sentence Restructuring Enforcement ──────────────────────────
// Ensures at least 60% of sentences are meaningfully restructured.
// Compares output sentences against original, applies additional
// transforms to under-changed sentences until the 60% threshold is met.

// ── Adaptive Oxygen Iteration Chain ──────────────────────────────────
// Runs oxygenHumanize iteratively on phaseOneOutput.
//   • Minimum 5 total passes (phase 1 + 4 iterations)
//   • Maximum 10 total passes (phase 1 + 9 iterations)
//   • After pass 5, checks if ≥40% word-level change per sentence vs
//     originalText. If threshold met → stop. Otherwise → escalate.
// Speed design: passes 2-5 use fast/light, 6-8 use quality/medium,
// 9-10 use aggressive/strong.  All passes are pure TS (no LLM).
function adaptiveOxygenChain(
  phaseOneOutput: string,
  _originalText: string,   // kept for API compat; gate compares vs phase-1 output
): string {
  const MIN_TOTAL = 3;           // minimum passes before gate check
  const MAX_ITERATIONS = 3;      // reduced cap (was 6 — too many passes compound errors)
  const TARGET_CHANGE = 0.25;    // 25% word-level change from phase-1 per sentence
  const SENT_PASS_RATE = 0.60;   // permissive for faster exits

  let current = phaseOneOutput;
  // Gate compares against phase-1 output — how much the oxygen chain added on top of the LLM
  const phase1Sentences = robustSentenceSplit(phaseOneOutput);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const totalPasses = iter + 2; // phase 1 = pass 1, first iter here = pass 2

    // Progressive escalation: fast for mandatory passes, escalate only when gate fails
    let passMode: string, passStrength: string;
    if (totalPasses <= 5) {
      // Passes 2-5: always run at maximum speed (no LLM, sync — <10ms each)
      passMode = 'fast'; passStrength = 'light';
    } else if (totalPasses <= 7) {
      // Passes 6-7: medium quality if gate not met yet
      passMode = 'quality'; passStrength = 'medium';
    } else {
      // Passes 8-10: aggressive escalation as last resort
      passMode = 'aggressive'; passStrength = 'strong';
    }

    const passResult = oxygenHumanize(current, passStrength, passMode, false);
    if (passResult && passResult.trim().length > 0) current = passResult;

    // Gate: only check after minimum passes are complete
    if (totalPasses >= MIN_TOTAL) {
      const curSentences = robustSentenceSplit(current);
      let metCount = 0;
      for (const curSent of curSentences) {
        // Find closest phase-1 sentence and measure how much oxygen chain changed it
        let bestChange = 0;
        for (const p1Sent of phase1Sentences) {
          const c = measureSentenceChange(p1Sent, curSent);
          if (c > bestChange) bestChange = c;
        }
        if (bestChange >= TARGET_CHANGE) metCount++;
      }
      const total = curSentences.length;
      if (total > 0 && metCount / total >= SENT_PASS_RATE) {
        console.log(`[AdaptiveChain] Gate passed at pass ${totalPasses}: ${metCount}/${total} sentences ≥40% from phase-1`);
        break;
      }
      console.log(`[AdaptiveChain] Pass ${totalPasses}: ${metCount}/${total} ≥40% from phase-1 — escalating`);
    }
  }

  return current;
}

function measureSentenceChange(original: string, modified: string): number {
  const origWords = original.toLowerCase().split(/\s+/).filter(Boolean);
  const modWords = modified.toLowerCase().split(/\s+/).filter(Boolean);
  const len = Math.max(origWords.length, modWords.length);
  if (len === 0) return 1;
  let changed = 0;
  for (let i = 0; i < len; i++) {
    if (!origWords[i] || !modWords[i] || origWords[i] !== modWords[i]) changed++;
  }
  return changed / len;
}

// Detect whether a paragraph looks like a title or heading.
function isHeadingParagraph(para: string): boolean {
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
  // Standalone citation references: "Author, A. B. (2012)." or "Author & Author (2012)."
  if (/^[A-Z][a-zA-Z]+[,.].*\(\d{4}\)\s*\.?\s*$/.test(trimmed) && words.length <= 20) return true;
  return false;
}

function enforceRestructuringThreshold(
  originalText: string,
  humanizedText: string,
  threshold: number = 0.60,
): string {
  // Split by paragraph boundaries first to avoid merging titles into body sentences
  const origParas = originalText.split(/\n\s*\n/).filter(p => p.trim());
  const humanParas = humanizedText.split(/\n\s*\n/).filter(p => p.trim());

  // Collect sentences per-paragraph (skip headings entirely)
  const origSentences: string[] = [];
  const humanizedSentences: string[] = [];
  // Track which indices in the flat sentence list are heading lines
  const headingIndicesOrig = new Set<number>();
  const headingIndicesHuman = new Set<number>();

  for (const para of origParas) {
    const trimmed = para.trim();
    if (isHeadingParagraph(trimmed)) {
      headingIndicesOrig.add(origSentences.length);
      origSentences.push(trimmed);
    } else {
      origSentences.push(...robustSentenceSplit(trimmed));
    }
  }
  for (const para of humanParas) {
    const trimmed = para.trim();
    if (isHeadingParagraph(trimmed)) {
      headingIndicesHuman.add(humanizedSentences.length);
      humanizedSentences.push(trimmed);
    } else {
      humanizedSentences.push(...robustSentenceSplit(trimmed));
    }
  }

  if (humanizedSentences.length < 2 || origSentences.length < 2) return humanizedText;

  // Match each humanized sentence to closest original sentence (skip headings)
  const changes: { idx: number; ratio: number; origIdx: number }[] = [];
  for (let i = 0; i < humanizedSentences.length; i++) {
    if (headingIndicesHuman.has(i)) {
      changes.push({ idx: i, ratio: 1, origIdx: -1 }); // headings always "changed enough"
      continue;
    }
    let bestRatio = 1;
    let bestOrigIdx = 0;
    for (let j = 0; j < origSentences.length; j++) {
      if (headingIndicesOrig.has(j)) continue;
      const ratio = measureSentenceChange(origSentences[j], humanizedSentences[i]);
      if (ratio < bestRatio) { bestRatio = ratio; bestOrigIdx = j; }
    }
    changes.push({ idx: i, ratio: bestRatio, origIdx: bestOrigIdx });
  }

  // Count sufficiently restructured sentences (≥25% word change)
  const RESTRUCTURE_MIN = 0.25;
  const restructuredCount = changes.filter(c => c.ratio >= RESTRUCTURE_MIN).length;
  const totalCount = humanizedSentences.length;
  const currentPercent = restructuredCount / totalCount;

  if (currentPercent >= threshold) return humanizedText;

  // Sort by change ratio ascending — fix the least changed first (skip headings)
  const weak = changes
    .filter(c => c.ratio < RESTRUCTURE_MIN && !headingIndicesHuman.has(c.idx))
    .sort((a, b) => a.ratio - b.ratio);

  const usedWords = new Set<string>();
  const neededMore = Math.ceil(totalCount * threshold) - restructuredCount;
  let fixed = 0;

  for (const w of weak) {
    if (fixed >= neededMore) break;
    let s = humanizedSentences[w.idx];
    const before = s;

    // Apply safe word-level transforms only (no clause swap / voice shift / restructuring
    // — those produce garbled output like "is led by ." and "is stronglyed by")
    s = applyAIWordKill(s);
    s = synonymReplace(s, 0.5, usedWords);

    if (s !== before && measureSentenceChange(origSentences[w.origIdx], s) >= RESTRUCTURE_MIN) {
      humanizedSentences[w.idx] = s;
      fixed++;
    }
  }

  // Reconstruct text preserving paragraph structure — headings stay as-is
  const rebuilt: string[] = [];
  let sentIdx = 0;
  for (const para of humanParas) {
    const trimmed = para.trim();
    if (isHeadingParagraph(trimmed)) {
      rebuilt.push(trimmed);
      sentIdx++; // skip the heading entry in humanizedSentences
    } else {
      const paraSents = robustSentenceSplit(trimmed);
      const replacedSents: string[] = [];
      for (let j = 0; j < paraSents.length; j++) {
        if (sentIdx < humanizedSentences.length) {
          replacedSents.push(humanizedSentences[sentIdx]);
          sentIdx++;
        }
      }
      rebuilt.push(replacedSents.join(' '));
    }
  }
  return rebuilt.join('\n\n');
}

// ── Last-Mile Meaning Validator ─────────────────────────────────────
// Compares each output sentence against the original sentence it maps to.
// If the meaning has drifted too far (content words diverged), replaces
// the output sentence with a lightly-transformed version of the original.
// This applies to ALL humanizers as a universal safety net.

function contentWordOverlap(original: string, modified: string): number {
  const STOPWORDS = new Set([
    'the','a','an','is','are','was','were','be','been','being','have','has','had',
    'do','does','did','will','would','could','should','may','might','can','shall',
    'to','of','in','for','on','with','at','by','from','as','into','through','during',
    'before','after','above','below','between','out','off','over','under','again',
    'further','then','once','here','there','when','where','why','how','all','each',
    'every','both','few','more','most','other','some','such','no','nor','not','only',
    'own','same','so','than','too','very','just','because','but','and','or','if',
    'while','that','this','these','those','it','its','they','them','their','we',
    'our','he','she','his','her','which','what','who','whom','about','also',
  ]);

  const getContentWords = (text: string) => {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !STOPWORDS.has(w));
  };

  const origWords = new Set(getContentWords(original));
  const modWords = new Set(getContentWords(modified));

  if (origWords.size === 0) return 1.0;

  // Count how many original content words (or close variants) appear in output
  let matches = 0;
  for (const w of origWords) {
    if (modWords.has(w)) {
      matches++;
    } else {
      // Check stem overlap (simple: first 5 chars match)
      for (const m of modWords) {
        if (w.length >= 5 && m.length >= 5 && w.slice(0, 5) === m.slice(0, 5)) {
          matches += 0.7;
          break;
        }
      }
    }
  }
  return matches / origWords.size;
}

function lastMileMeaningValidator(
  originalText: string,
  humanizedText: string,
  minOverlap: number = 0.35,
): string {
  const origSentences = robustSentenceSplit(originalText);
  const humanizedSentences = robustSentenceSplit(humanizedText);

  if (humanizedSentences.length < 1 || origSentences.length < 1) return humanizedText;

  // Step 1: Build best-match mapping from output → original
  const matches: { origIdx: number; overlap: number }[] = [];
  for (let i = 0; i < humanizedSentences.length; i++) {
    let bestOrigIdx = 0;
    let bestOverlap = 0;
    for (let j = 0; j < origSentences.length; j++) {
      const overlap = contentWordOverlap(origSentences[j], humanizedSentences[i]);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestOrigIdx = j;
      }
    }
    matches.push({ origIdx: bestOrigIdx, overlap: bestOverlap });
  }

  // Step 2: Track which original sentences are already well-covered
  const coveredOriginals = new Set<number>();
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].overlap >= minOverlap) {
      coveredOriginals.add(matches[i].origIdx);
    }
  }

  // Step 3: Fix or remove bad sentences
  let anyFixed = false;
  const fixedSentences: string[] = [];

  for (let i = 0; i < humanizedSentences.length; i++) {
    const { origIdx, overlap } = matches[i];

    if (overlap >= minOverlap) {
      // Sentence preserves meaning — keep it
      fixedSentences.push(humanizedSentences[i]);
    } else if (coveredOriginals.has(origIdx)) {
      // Original already covered — check if there's a different uncovered original
      // that this sentence might actually correspond to (positional fallback)
      const positionalOrig = origSentences[Math.min(i, origSentences.length - 1)];
      const positionalOverlap = contentWordOverlap(positionalOrig, humanizedSentences[i]);
      if (positionalOverlap >= minOverlap) {
        fixedSentences.push(humanizedSentences[i]);
      } else {
        // Keep a lightly-transformed version of the positional original instead of dropping
        let fixed = applyAIWordKill(positionalOrig);
        const usedWords = new Set<string>();
        fixed = synonymReplace(fixed, 0.35, usedWords);
        fixedSentences.push(fixed);
        anyFixed = true;
      }
    } else {
      // Original sentence not yet covered — reprocess with light transforms
      const origSent = origSentences[origIdx];
      let fixed = applyAIWordKill(origSent);
      const usedWords = new Set<string>();
      fixed = synonymReplace(fixed, 0.35, usedWords);

      // Verify fix preserves meaning
      const fixOverlap = contentWordOverlap(origSent, fixed);
      if (fixOverlap >= minOverlap) {
        fixedSentences.push(fixed);
      } else {
        // Minimal change fallback
        fixedSentences.push(applyAIWordKill(origSent));
      }
      coveredOriginals.add(origIdx);
      anyFixed = true;
    }
  }

  if (!anyFixed) return humanizedText;

  // Reconstruct preserving paragraph structure
  const paragraphs = humanizedText.split(/\n\s*\n/);
  let sentIdx = 0;
  const rebuilt = paragraphs.map(para => {
    const paraSents = robustSentenceSplit(para);
    const replacedSents: string[] = [];
    // Distribute fixed sentences proportionally to paragraph size
    const count = Math.min(paraSents.length, fixedSentences.length - sentIdx);
    for (let j = 0; j < count; j++) {
      if (sentIdx < fixedSentences.length) {
        replacedSents.push(fixedSentences[sentIdx]);
        sentIdx++;
      }
    }
    return replacedSents.join(' ');
  });

  // If there are remaining sentences, append to last paragraph
  if (sentIdx < fixedSentences.length) {
    const remaining = fixedSentences.slice(sentIdx).join(' ');
    if (rebuilt.length > 0) {
      rebuilt[rebuilt.length - 1] += ' ' + remaining;
    } else {
      rebuilt.push(remaining);
    }
  }

  return rebuilt.filter(p => p.trim()).join('\n\n');
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch((err) => reject(err))
      .finally(() => clearTimeout(timer));
  });
}

export async function POST(req: Request) {
  try {
    let body: {
      text?: string;
      engine?: string;
      strength?: string;
      tone?: string;
      strict_meaning?: boolean;
      no_contractions?: boolean;
      enable_post_processing?: boolean;
      premium?: boolean;
      [key: string]: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid or empty request body' }, { status: 400 });
    }
    const { text, engine = 'oxygen', strength, tone, strict_meaning, no_contractions, enable_post_processing, premium } = body;

    // 30% aggressiveness boost: when "Keep Meaning" is unchecked, bump strength one level
    const effectiveStrength = (!strict_meaning && strength === 'light') ? 'medium'
      : (!strict_meaning && (strength ?? 'medium') === 'medium') ? 'strong'
      : (strength ?? 'medium');

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    if (text.length > 50000) {
      return NextResponse.json({ error: 'Text too long (max 50,000 characters)' }, { status: 400 });
    }

    // Detect input scores
    const detector = getDetector();
    const inputAnalysis = detector.analyze(text);

    // ── Heading normalization (shared preprocessing) ───────────
    // Ensures headings separated by single \n from body text get
    // double-newline separation so engines treat them as separate blocks.
    // Without this, engines flatten "I. Introduction\nSuzanne..." into one paragraph.
    let normalizedText = text;
    // Step 1: Known heading patterns (Roman numerals, Part/Section/Chapter, markdown #)
    normalizedText = normalizedText.replace(
      /^((?:#{1,6}\s.+|[IVXLCDM]+\.\s.+|(?:Part|Section|Chapter)\s+\d+.*))\n(?!\n)/gim,
      "$1\n\n"
    );
    // Step 2: Short non-punctuated lines followed by a line starting with uppercase
    // (likely titles/headings) — ensure double-newline separation
    normalizedText = normalizedText.replace(
      /^([^\n]{1,80}[^.!?\n])\n(?!\n)(?=[A-Z])/gm,
      "$1\n\n"
    );

    const runHumara22 = async (input: string): Promise<string> => {
      // Humara 2.2: easy + 1 oxygen polish + final Nuru refinement
      // (Reduced from 4 oxygen passes — multiple passes compound errors)
      const easySBS = body.easy_sentence_by_sentence !== false;
      const easyResult = await easyHumanize(
        input,
        effectiveStrength,
        tone ?? 'academic',
        easySBS,
      );
      let output = easyResult.humanized;
      // Single quality-mode polish pass
      const passResult = oxygenHumanize(output, 'medium', 'quality', false);
      if (passResult && passResult.trim().length > 0) output = passResult;
      const nuruFinal = stealthHumanize(output, strength ?? 'medium', tone ?? 'academic');
      if (nuruFinal && nuruFinal.trim().length > 0) output = nuruFinal;
      return output;
    };

    const runHumara21 = async (input: string): Promise<string> => {
      const ozoneSentenceBySentence = body.ozone_sentence_by_sentence === true;
      const ozoneResult = await ozoneHumanize(input, ozoneSentenceBySentence);
      return ozoneResult.humanized;
    };

    const runHumara20 = (input: string): string => {
      const oxygenMode = (body.oxygen_mode as string) || (effectiveStrength === 'light' ? 'fast' : effectiveStrength === 'strong' ? 'aggressive' : 'quality');
      let output = oxygenHumanize(input, effectiveStrength, oxygenMode, body.oxygen_sentence_by_sentence === true);
      output = adaptiveOxygenChain(output, input);
      return output;
    };

    const runHumara24 = async (input: string): Promise<string> => {
      const inputWordCount = input.split(/\s+/).filter(Boolean).length;
      const humarinMode = strength === 'strong' ? 'quality' : strength === 'light' ? 'turbo' : 'fast';
      const humarinResult = await humarinHumanize(input, humarinMode, inputWordCount <= 220);
      let output = humarinResult.humanized;
      output = adaptiveOxygenChain(output, input);
      return output;
    };

    // Detect standalone citation-reference paragraphs (e.g. "Htun, M., & Weldon, S. L. (2012).")
    // These must pass through unchanged — LLMs mangle them.
    const CITATION_PARA_RE = /^[A-Z][a-zA-Z]+[,.].*\(\d{4}\)\s*\.?\s*$/;
    const splitProtectedParas = (input: string): { paragraphs: string[]; protectedIdx: Set<number> } => {
      const paragraphs = input.split(/\n\s*\n/);
      const protectedIdx = new Set<number>();
      for (let i = 0; i < paragraphs.length; i++) {
        const t = paragraphs[i].trim();
        if (CITATION_PARA_RE.test(t) && t.split(/\s+/).length <= 20) protectedIdx.add(i);
      }
      return { paragraphs, protectedIdx };
    };

    const runWikipedia = async (input: string): Promise<string> => {
      // Wikipedia: Ghost Pro → Restructuring → Oxygen → 10× Nuru 2.0
      const { paragraphs, protectedIdx } = splitProtectedParas(input);
      const processableParas = paragraphs.filter((_, i) => !protectedIdx.has(i)).join('\n\n');
      let output = processableParas.trim()
        ? await ghostProHumanize(processableParas, {
            strength: strength ?? 'medium',
            tone: 'wikipedia',
            strictMeaning: strict_meaning ?? false,
            enablePostProcessing: enable_post_processing !== false,
            turbo: true,
          })
        : '';
      output = breakRepetitiveTemplates(output);
      output = fixHyphenSpacing(output);
      // Restructure each sentence for deep structural rewriting
      const wikiSents = robustSentenceSplit(output);
      for (let i = 0; i < wikiSents.length; i++) {
        try {
          wikiSents[i] = await restructureSentence(wikiSents[i]);
        } catch { /* keep original on failure */ }
      }
      output = wikiSents.join(' ');
      // Single oxygen polish
      output = runHumara20(output);
      // 10× Nuru 2.0 passes
      output = chainSync(runNuruSinglePass, output, CHAIN_TS);
      // Re-insert protected citation paragraphs in original positions
      if (protectedIdx.size > 0) {
        const outParas = output.split(/\n\s*\n/);
        const merged: string[] = [];
        let outIdx = 0;
        for (let i = 0; i < paragraphs.length; i++) {
          if (protectedIdx.has(i)) {
            merged.push(paragraphs[i].trim());
          } else if (outIdx < outParas.length) {
            merged.push(outParas[outIdx++].trim());
          }
        }
        while (outIdx < outParas.length) merged.push(outParas[outIdx++].trim());
        output = merged.filter(p => p).join('\n\n');
      }
      return output;
    };

    // Clean helpers for Deep Kill — NO Nuru tail (Nuru runs once at the very end)
    const runWikipediaClean = async (input: string): Promise<string> => {
      const { paragraphs, protectedIdx } = splitProtectedParas(input);
      const processableParas = paragraphs.filter((_, i) => !protectedIdx.has(i)).join('\n\n');
      let output = processableParas.trim()
        ? await ghostProHumanize(processableParas, {
            strength: strength ?? 'medium',
            tone: 'wikipedia',
            strictMeaning: strict_meaning ?? false,
            enablePostProcessing: enable_post_processing !== false,
            turbo: true,
          })
        : '';
      output = breakRepetitiveTemplates(output);
      output = fixHyphenSpacing(output);
      if (protectedIdx.size > 0) {
        const outParas = output.split(/\n\s*\n/);
        const merged: string[] = [];
        let outIdx = 0;
        for (let i = 0; i < paragraphs.length; i++) {
          if (protectedIdx.has(i)) {
            merged.push(paragraphs[i].trim());
          } else if (outIdx < outParas.length) {
            merged.push(outParas[outIdx++].trim());
          }
        }
        while (outIdx < outParas.length) merged.push(outParas[outIdx++].trim());
        output = merged.filter(p => p).join('\n\n');
      }
      return output;
    };

    const runHumara22Clean = async (input: string): Promise<string> => {
      const easySBS = body.easy_sentence_by_sentence !== false;
      const easyResult = await easyHumanize(input, effectiveStrength, tone ?? 'academic', easySBS);
      return easyResult.humanized;
    };

    const runNuru = (input: string): string => {
      const output = stealthHumanize(input, strength ?? 'medium', tone ?? 'academic');
      return output && output.trim().length > 0 ? output : input;
    };

    const runNuruSinglePass = (input: string): string => {
      const output = stealthHumanize(input, strength ?? 'medium', tone ?? 'academic', 1);
      return output && output.trim().length > 0 ? output : input;
    };

    const CHAIN_TS = 10;
    const chainSync = (fn: (s: string) => string, input: string, n: number): string => {
      let out = input;
      for (let i = 0; i < n; i++) out = fn(out);
      return out;
    };

    // Deep Kill engine set — used to skip destructive post-processors
    const DEEP_KILL_ENGINES = new Set([
      'ninja_2', 'ninja_3', 'ninja_4', 'ninja_5',
      'ghost_trial_2', 'ghost_trial_2_alt',
      'conscusion_1', 'conscusion_12',
    ]);
    const isDeepKill = DEEP_KILL_ENGINES.has(engine);

    const runGuarded = async (
      label: string,
      task: () => Promise<string>,
      fallback: string,
      timeoutMs = 10_000,
    ): Promise<string> => {
      try {
        return await withTimeout(task(), timeoutMs, label);
      } catch (err) {
        console.warn(`[Humanize] ${label} failed or timed out:`, err);
        return fallback;
      }
    };

    let humanized: string;

    if (engine === 'easy') {
      humanized = await runHumara22(normalizedText);
    } else if (engine === 'ozone') {
      humanized = await runHumara21(normalizedText);
    } else if (engine === 'oxygen') {
      humanized = runHumara20(normalizedText);
    } else if (engine === 'humara_v3_3') {
      humanized = await runHumara24(normalizedText);
    } else if (engine === 'ninja_3') {
      // Ninja 3: Oxygen → Wikipedia (clean, no Nuru tail)
      const stage1 = runHumara20(normalizedText);
      humanized = await runGuarded('ninja_3_stage_2', () => runWikipediaClean(stage1), stage1);
    } else if (engine === 'ninja_2') {
      // Ninja 2: Oxygen → 10× Nuru
      const stage1 = runHumara20(normalizedText);
      humanized = chainSync(runNuruSinglePass, stage1, CHAIN_TS);
    } else if (engine === 'ninja_4') {
      // Ninja 4: Humara 2.4 → Wikipedia (clean)
      const stage1 = await runGuarded('ninja_4_stage_1', () => runHumara24(normalizedText), normalizedText);
      humanized = await runGuarded('ninja_4_stage_2', () => runWikipediaClean(stage1), stage1);
    } else if (engine === 'ninja_5') {
      // Ninja 5: Humara 2.4 → 10× Nuru
      const stage1 = await runGuarded('ninja_5_stage_1', () => runHumara24(normalizedText), normalizedText);
      humanized = chainSync(runNuruSinglePass, stage1, CHAIN_TS);
    } else if (engine === 'ghost_trial_2') {
      // Ghost Trial 2: Wikipedia (clean) → Humara 2.4 → 10× Nuru
      const stage1 = await runGuarded('ghost_trial_2_stage_1', () => runWikipediaClean(normalizedText), normalizedText);
      const stage2 = await runGuarded('ghost_trial_2_stage_2', () => runHumara24(stage1), stage1);
      humanized = chainSync(runNuruSinglePass, stage2, CHAIN_TS);
    } else if (engine === 'ghost_trial_2_alt') {
      // Ghost Trial 2 Alt: Wikipedia (clean) → Oxygen → 10× Nuru
      const stage1 = await runGuarded('ghost_trial_2_alt_stage_1', () => runWikipediaClean(normalizedText), normalizedText);
      const stage2 = runHumara20(stage1);
      humanized = chainSync(runNuruSinglePass, stage2, CHAIN_TS);
    } else if (engine === 'conscusion_1') {
      // Conscusion 1: Easy (clean) → Wikipedia (clean) → 10× Nuru
      const stage1 = await runGuarded('conscusion_1_stage_1', () => runHumara22Clean(normalizedText), normalizedText, 10_000);
      const stage2 = await runGuarded('conscusion_1_stage_2', () => runWikipediaClean(stage1), stage1);
      humanized = chainSync(runNuruSinglePass, stage2, CHAIN_TS);
    } else if (engine === 'conscusion_12') {
      // Conscusion 12: Ozone → Humara 2.4 → Wikipedia (clean) → 10× Nuru
      const stage1 = await runGuarded('conscusion_12_stage_1', () => runHumara21(normalizedText), normalizedText, 10_000);
      const stage2 = await runGuarded('conscusion_12_stage_2', () => runHumara24(stage1), stage1);
      const stage3 = await runGuarded('conscusion_12_stage_3', () => runWikipediaClean(stage2), stage2);
      humanized = chainSync(runNuruSinglePass, stage3, CHAIN_TS);
    } else if (engine === 'humara_v1_3') {
      // Humara v1.3: Stealth Humanizer Engine v5 from coursework-champ
      const { pipeline } = await import('@/lib/engine/humara-v1-3');
      humanized = await pipeline(normalizedText, tone ?? 'academic', strength === 'strong' ? 10 : strength === 'light' ? 4 : 7);
    } else if (engine === 'omega') {
      // Omega: Pure LLM per-sentence independent processing — each sentence gets its own API call
      humanized = await omegaHumanize(
        normalizedText,
        strength ?? 'medium',
        tone ?? 'academic',
      );
    } else if (engine === 'nuru') {
      // Nuru: Pure non-LLM per-sentence independent processing with random strategy assignment
      humanized = nuruHumanize(
        normalizedText,
        strength ?? 'medium',
        tone ?? 'academic',
      );
    } else if (engine === 'nuru_v2') {
      // Nuru 2.0: 10-pass stealth humanizer with deep non-LLM cleaning
      humanized = chainSync(runNuruSinglePass, normalizedText, CHAIN_TS);
    } else if (engine === 'king') {
      // King: Pure LLM multi-phase sentence-by-sentence humanizer (GPT-4o-mini)
      // Phase 1: Deep rewrite (29 Wikipedia AI Cleanup rules)
      // Phase 2: Self-audit ("what makes this AI?")
      // Phase 3: Targeted revision (fix Phase 2 findings)
      const kingResult = await kingHumanize(normalizedText);
      humanized = chainSync(runNuruSinglePass, kingResult.humanized, CHAIN_TS);
    } else if (engine === 'humara') {
      // Humara: Independent humanizer engine — phrase-level, strategy-diverse
      const humaraStrength: 'light' | 'medium' | 'heavy' =
        strength === 'high' || strength === 'strong' ? 'heavy'
          : strength === 'low' || strength === 'light' ? 'light'
            : 'medium';
      const humaraTone: 'neutral' | 'academic' | 'professional' | 'casual' =
        tone === 'academic' || tone === 'professional' || tone === 'casual' ? tone : 'neutral';
      humanized = humaraHumanize(normalizedText, {
        strength: humaraStrength,
        tone: humaraTone,
        strictMeaning: strict_meaning ?? false,
      });
    } else if (premium) {
      // Premium: Purely AI-driven per-sentence pipeline
      humanized = await premiumHumanize(
        normalizedText,
        engine ?? 'ghost_pro',
        strength ?? 'medium',
        tone ?? 'neutral',
        strict_meaning ?? true,
      );
    } else if (engine === 'ninja_1') {
      // Ninja 1: Ninja LLM → Humara 2.0 (oxygen) → Nuru 2.0 (single pass) → [10× Nuru 2.0 via outer loop]
      const stage1 = await runGuarded('ninja1_stage_1', () => llmHumanize(normalizedText, strength ?? 'medium', true, strict_meaning ?? true, tone ?? 'academic', no_contractions !== false, enable_post_processing !== false), normalizedText);
      const stage2 = runHumara20(stage1);
      const stage3 = runNuruSinglePass(stage2);
      humanized = chainSync(runNuru, stage3, CHAIN_TS);
    } else if (engine === 'undetectable') {
      // Undetectable: Ninja (Stealth) only — second Ghost Mini pass removed
      // The double pass was over-processing and creating unnaturally uniform text
      humanized = await llmHumanize(
        normalizedText,
        strength ?? 'strong',
        true,
        strict_meaning ?? true,
        tone ?? 'academic',
        no_contractions !== false,
        enable_post_processing !== false,
      );
    } else if (engine === 'ninja') {
      // Ninja: 3 LLM phases + rule-based + post-processing + detector feedback loop
      humanized = await llmHumanize(
        normalizedText,
        strength ?? 'medium',
        true,  // preserveSentences
        strict_meaning ?? true,
        tone ?? 'academic',
        no_contractions !== false,
        enable_post_processing !== false,
      );
    } else if (engine === 'fast_v11') {
      // Fast V1.1: 7-phase pipeline (non-LLM primary, LLM optional for chunk rewrite)
      const v11Result = await humanizeV11(normalizedText, {
        strength: (strength ?? 'medium') as 'light' | 'medium' | 'strong',
        tone: tone ?? 'neutral',
        strictMeaning: strict_meaning ?? false,
      });
      humanized = v11Result.humanized;
    } else if (engine === 'ghost_mini_v1_2') {
      // Ghost Min v1.2: Academic Prose optimized
      const { ghostMiniV1_2 } = await import('@/lib/engine/ghost-mini-v1-2');
      humanized = ghostMiniV1_2(normalizedText);
    } else if (engine === 'apex') {
      // Apex: 6-phase GPT-4o-mini + multi-phase post-processing pipeline
      // Phase 1: LLM sentence-by-sentence rewrite (50%+ change)
      // Phase 2: Aggressive PP (40%) | Phase 3: Cleaning PP (30%)
      // Phase 4: Paragraph restructuring (20%) | Phase 5: AI signal kill
      // Phase 6: Grammar/punctuation cleanup
      const apexResult = await apexHumanize(normalizedText);
      humanized = apexResult.humanized;
    } else if (engine === 'ghost_pro') {
      // Ghost Pro: Single LLM rewrite + signal-aware post-processing
      humanized = await ghostProHumanize(normalizedText, {
        strength: strength ?? 'medium',
        tone: tone ?? 'neutral',
        strictMeaning: strict_meaning ?? false,
        enablePostProcessing: enable_post_processing !== false,
      });
    } else if (engine === 'ghost_pro_wiki') {
      humanized = await runWikipedia(normalizedText);
    } else if (engine === 'oxygen3') {
      // Oxygen 3.0: Fine-tuned T5 model via HF Space
      const o3Mode = effectiveStrength === 'light' ? 'fast' : effectiveStrength === 'strong' ? 'quality' : 'fast';
      const o3Result = await oxygen3Humanize(normalizedText, o3Mode, tone ?? 'neutral');
      humanized = o3Result.humanized;
    } else {
      // Ghost Mini: Statistical-only pipeline (no LLM)
      humanized = humanize(normalizedText, {
        mode: 'ghost_mini',
        strength: strength ?? 'medium',
        tone: tone ?? 'neutral',
        strictMeaning: strict_meaning ?? false,
        enablePostProcessing: enable_post_processing !== false,
        stealth: true,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // UNIVERSAL NURU POST-PROCESSING: 10 passes → GPT detect → Nuru cleanup
    // → fast flagged-only re-detect/re-clean loop until <5 AI score
    // Applies to ALL engines EXCEPT ozone (Humara 2.1). 10s budget.
    // ═══════════════════════════════════════════════════════════════
    if (engine !== 'ozone') {
      const nuruPostStart = Date.now();
      const NURU_POST_DEADLINE_MS = 55_000;
      const nuruTimeOk = () => Date.now() - nuruPostStart < NURU_POST_DEADLINE_MS;
      const FAST_RECHECK_PASSES = 5;
      const TARGET_AI_SCORE = 5;
      const MAX_FAST_LOOPS = 5;

      const postSents = robustSentenceSplit(humanized);
      const isHeadingSentPost = (s: string) => s.trim().length < 120 && !/[.!?]$/.test(s.trim()) && s.trim().split(/\s+/).length <= 15;

      // Step 1: 10 baseline Nuru passes
      for (let pass = 0; pass < 10 && nuruTimeOk(); pass++) {
        for (let i = 0; i < postSents.length; i++) {
          if (!isHeadingSentPost(postSents[i])) {
            postSents[i] = runNuruSinglePass(postSents[i]);
          }
        }
      }

      // Step 2: GPT-4o-mini forensic detection
      interface PostFlagged { index: number; ai_score: number; flagged_phrases: string[]; }
      let postFlagged: PostFlagged[] = [];
      if (nuruTimeOk()) {
        try {
          const gptApiKey = process.env.OPENAI_API_KEY?.trim();
          if (gptApiKey) {
            const oai = new OpenAI({ apiKey: gptApiKey });
            const sentList = postSents
              .map((s, i) => isHeadingSentPost(s) ? null : `[${i}] ${s}`)
              .filter(Boolean)
              .join('\n');

            const gptResp = await Promise.race([
              oai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                  {
                    role: 'system',
                    content: 'You are a forensic AI text analyzer. Analyze EACH sentence for AI signals. For each: assign AI likelihood (0-100%), identify ALL suspicious words and phrases (up to 5). Respond with ONLY valid JSON: { "flagged": [{ "index": <int>, "ai_score": <0-100>, "phrases": ["phrase1", "word1"] }] }. Only include sentences with ai_score >= 55.',
                  },
                  { role: 'user', content: sentList.slice(0, 4000) },
                ],
                temperature: 0,
                max_tokens: 1500,
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('GPT timed out')), 4000)
              ),
            ]);
            const raw = gptResp.choices[0]?.message?.content?.trim() ?? '';
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed.flagged)) {
                postFlagged = parsed.flagged
                  .filter((f: any) => typeof f.index === 'number' && f.index >= 0 && f.index < postSents.length)
                  .map((f: any) => ({
                    index: f.index,
                    ai_score: typeof f.ai_score === 'number' ? f.ai_score : 80,
                    flagged_phrases: Array.isArray(f.phrases) ? f.phrases.filter((p: any) => typeof p === 'string') : [],
                  }));
              }
            } catch { /* ignore parse errors */ }
            console.log(`[Nuru Post GPT] Flagged ${postFlagged.length}/${postSents.length} sentences`);
          }
        } catch (e: any) {
          console.warn(`[Nuru Post GPT] Detection failed: ${e.message}`);
        }
      }

      // Step 3: 5 final Nuru 2.0 cleanup passes
      for (let pass = 0; pass < 5 && nuruTimeOk(); pass++) {
        for (let i = 0; i < postSents.length; i++) {
          if (!isHeadingSentPost(postSents[i])) {
            postSents[i] = runNuruSinglePass(postSents[i]);
          }
        }
      }

      // Step 4: extra flagged-sentence Nuru cleanup
      if (postFlagged.length > 0 && nuruTimeOk()) {
        for (let pass = 0; pass < 3 && nuruTimeOk(); pass++) {
          for (const flagged of postFlagged) {
            if (isHeadingSentPost(postSents[flagged.index])) continue;
            const phraseCount = Math.max(1, flagged.flagged_phrases.length);
            for (let phrasePass = 0; phrasePass < Math.min(3, phraseCount); phrasePass++) {
              postSents[flagged.index] = runNuruSinglePass(postSents[flagged.index]);
            }
          }
        }
      }

      // Step 5: fast flagged-only re-detect/re-clean loop until <5 AI score
      let activePostFlagged = [...postFlagged];
      let fastLoop = 0;
      while (activePostFlagged.length > 0 && fastLoop < MAX_FAST_LOOPS && nuruTimeOk()) {
        fastLoop++;
        try {
          const gptApiKey = process.env.OPENAI_API_KEY?.trim();
          if (!gptApiKey) break;
          const oai = new OpenAI({ apiKey: gptApiKey });
          const flaggedSubset = activePostFlagged
            .filter((f: any) => !isHeadingSentPost(postSents[f.index]))
            .map((f: any) => ({ index: f.index, sentence: postSents[f.index] }));
          if (flaggedSubset.length === 0) break;

          const recheckResp = await Promise.race([
            oai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: `You are a forensic AI text analyzer. Re-check ONLY these already-flagged sentences.

For each sentence:
- Assign AI likelihood (0-100%)
- List the exact remaining suspicious words/phrases

Respond with ONLY valid JSON:
{ "flagged": [{ "index": <original_index>, "ai_score": <0-100>, "phrases": ["phrase1", "word1"] }] }

Include EVERY sentence with ai_score >= 5.
If all sentences are below 5, return { "flagged": [] }.`,
                },
                { role: 'user', content: JSON.stringify(flaggedSubset).slice(0, 3000) },
              ],
              temperature: 0,
              max_tokens: 900,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('GPT recheck timed out')), 2000)
            ),
          ]);

          const recheckRaw = recheckResp.choices[0]?.message?.content?.trim() ?? '';
          let reflagged: PostFlagged[] = [];
          try {
            const parsed = JSON.parse(recheckRaw);
            if (Array.isArray(parsed.flagged)) {
              reflagged = parsed.flagged
                .filter((f: any) => typeof f.index === 'number' && f.index >= 0 && f.index < postSents.length)
                .map((f: any) => ({
                  index: f.index,
                  ai_score: typeof f.ai_score === 'number' ? f.ai_score : 0,
                  flagged_phrases: Array.isArray(f.phrases) ? f.phrases.filter((p: any) => typeof p === 'string') : [],
                }))
                .filter((f: any) => f.ai_score >= TARGET_AI_SCORE);
            }
          } catch { /* ignore parse errors */ }

          if (reflagged.length === 0) {
            activePostFlagged = [];
            break;
          }

          // GPT strict replacement of flagged phrases before Nuru cleanup
          try {
            const flaggedInput = reflagged
              .filter((f: any) => !isHeadingSentPost(postSents[f.index]))
              .map((f: any) => ({
                index: f.index,
                sentence: postSents[f.index],
                replace_these: f.flagged_phrases,
              }));
            if (flaggedInput.length > 0) {
              const fixResp = await Promise.race([
                oai.chat.completions.create({
                  model: 'gpt-4o-mini',
                  messages: [
                    {
                      role: 'system',
                      content: `You are a word/phrase replacement specialist. Replace ONLY the flagged words/phrases with natural human alternatives.\nSTRICT RULES:\n1. ONLY replace the exact flagged words/phrases\n2. DO NOT rewrite or restructure the sentence\n3. DO NOT add or remove words\n4. Keep everything else IDENTICAL\nRespond with ONLY a JSON array: [{ "index": <int>, "fixed": "sentence with only flagged words replaced" }]`,
                    },
                    { role: 'user', content: JSON.stringify(flaggedInput).slice(0, 3000) },
                  ],
                  temperature: 0.2,
                  max_tokens: 1200,
                }),
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error('GPT loop fix timed out')), 2000)
                ),
              ]);
              const fixRaw = fixResp.choices[0]?.message?.content?.trim() ?? '';
              try {
                const cleaned = fixRaw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
                const fixes = JSON.parse(cleaned);
                if (Array.isArray(fixes)) {
                  for (const fix of fixes) {
                    if (typeof fix.index === 'number' && typeof fix.fixed === 'string' && fix.index >= 0 && fix.index < postSents.length) {
                      postSents[fix.index] = fix.fixed;
                    }
                  }
                }
              } catch { /* ignore parse errors */ }
            }
          } catch (fixErr: any) {
            console.warn(`[Nuru Post GPT Loop] Fix step failed: ${fixErr.message}`);
          }

          for (let pass = 0; pass < FAST_RECHECK_PASSES && nuruTimeOk(); pass++) {
            for (const flagged of reflagged) {
              if (isHeadingSentPost(postSents[flagged.index])) continue;
              const phraseCount = Math.max(1, flagged.flagged_phrases.length);
              for (let phrasePass = 0; phrasePass < Math.min(3, phraseCount); phrasePass++) {
                postSents[flagged.index] = runNuruSinglePass(postSents[flagged.index]);
              }
            }
          }

          activePostFlagged = reflagged;
        } catch (e: any) {
          console.warn(`[Nuru Post GPT Loop] Fast recheck failed: ${e.message}`);
          break;
        }
      }

      humanized = postSents.join(' ');
      console.log(`[Nuru Post] Complete in ${Date.now() - nuruPostStart}ms`);
    }

    // ── Unified Sentence Processor ──────────────────────────────
    // Every engine's output flows through per-sentence protection,
    // humanization, 60%-change enforcement, and post-assembly AI
    // flow cleaning.  Uses the input AI score for aggressiveness.
    // Skip for humara_v1_3: it has its own cleaned pipeline that
    // produces academic prose — running unifiedSentenceProcess on
    // top corrupts it (double restructuring, hedging injection, etc.)
    const FIRST_PERSON_RE_EARLY = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/i;
    const earlyFirstPerson = FIRST_PERSON_RE_EARLY.test(text);
    const inputAiScore = inputAnalysis.summary.overall_ai_score;
    if (engine !== 'humara' && engine !== 'humara_v1_3' && engine !== 'humara_v3_3' && engine !== 'nuru' && engine !== 'nuru_v2' && engine !== 'omega' && engine !== 'oxygen' && engine !== 'ozone' && engine !== 'apex' && engine !== 'king' && engine !== 'ghost_pro_wiki' && !isDeepKill) {
      humanized = unifiedSentenceProcess(humanized, earlyFirstPerson, inputAiScore);
    }

    // ── 60% Restructuring Enforcement ──────────────────────────────
    // Ensures at least 60% of sentences show meaningful word-level changes.
    // Applies additional transforms to under-changed sentences.
    if (engine !== 'oxygen' && engine !== 'ozone' && engine !== 'apex' && engine !== 'king' && engine !== 'nuru_v2' && engine !== 'humara_v3_3' && !isDeepKill) {
      humanized = enforceRestructuringThreshold(text, humanized, 0.35);
    }

    // Post-capitalization formatting — fix sentence casing for all engine outputs
    // Skip for humara/nuru/omega: they have their own capitalization handling
    // Pass original text so proper nouns from the input are preserved
    if (engine !== 'humara' && engine !== 'humara_v1_3' && engine !== 'nuru' && engine !== 'nuru_v2' && engine !== 'omega' && engine !== 'oxygen' && engine !== 'ozone' && engine !== 'apex' && engine !== 'king' && !isDeepKill) {
      humanized = fixCapitalization(humanized, text);
    }

    // Fix AI/ai capitalization that fixCapitalization may lowercase
    humanized = humanized
      .replace(/\bai-(\w)/gi, (_m: string, c: string) => `AI-${c}`)
      .replace(/\baI\b/g, 'AI')
      .replace(/\bai\b/g, 'AI');

    // Cross-sentence repetition cleanup — deduplicates phrases repeated across sentences
    // Skip for humara engine: it has its own coherence layer
    if (engine !== 'humara' && engine !== 'humara_v1_3' && engine !== 'nuru' && engine !== 'nuru_v2' && engine !== 'omega' && engine !== 'oxygen' && engine !== 'ozone' && engine !== 'king' && !isDeepKill) {
      humanized = deduplicateRepeatedPhrases(humanized);
    }

    // Structural post-processing — attacks document-level statistical signals
    // (spectral_flatness, burstiness, sentence_uniformity, readability_consistency, vocabulary_richness)
    // Skip for humara engine: it has its own structural diversity layer
    if (engine !== 'humara' && engine !== 'humara_v1_3' && engine !== 'nuru' && engine !== 'nuru_v2' && engine !== 'omega' && engine !== 'ninja' && engine !== 'undetectable' && engine !== 'oxygen' && engine !== 'ozone' && engine !== 'king' && engine !== 'ghost_pro_wiki' && !isDeepKill) {
      humanized = structuralPostProcess(humanized);
    }

    // Restore the original title/paragraph layout for EVERY engine output.
    // Skip for nuru_v2: it preserves paragraph structure internally.
    // Skip for Deep Kill: Nuru V2 already preserves structure and this causes duplication.
    if (engine !== 'nuru_v2' && !isDeepKill) {
      humanized = preserveInputStructure(normalizedText, humanized);
    }

    // ── FINAL SAFETY NET: Zero-contraction enforcement ──────────
    // Expand any contractions that may have slipped through ANY engine
    // or post-processing phase. This is the absolute last line of defense.
    humanized = expandContractions(humanized);

    // ── FINAL SAFETY NET: Zero em-dash enforcement ──────────
    // Remove any em-dashes that may have been reintroduced by post-processors
    humanized = removeEmDashes(humanized);
    // ── GRAMMAR SANITIZER ──────────────────────────────────────
    // Fix common grammar errors introduced by synonym replacement
    // 1. "an more" → "a more" (article before consonant multi-word replacement)
    humanized = humanized.replace(/\ban (more|less|much|most|very|quite|rather|fairly|too|so)\b/gi,
      (m, w) => (m[0] === 'A' ? 'A ' : 'a ') + w);
    // 2. "a increasingly" → "an increasingly" (shouldn't happen but safety)
    humanized = humanized.replace(/\ba (increasingly|ever|each|every|eight|eleven|eighteen|important|interesting|independent|innovative|intelligent|upper)\b/gi,
      (m, w) => (m[0] === 'A' ? 'An ' : 'an ') + w);
    // 2b. Comprehensive article agreement: "a" before vowel → "an", "an" before consonant → "a"
    // Skip words that start with vowel letters but sound like consonants
    const CONSONANT_SOUND_VOWELS = new Set(['uni', 'use', 'usa', 'usu', 'uti', 'ure', 'uro', 'one', 'once']);
    const VOWEL_SOUND_CONSONANTS = new Set(['hour', 'honest', 'honor', 'honour', 'heir', 'herb']);
    humanized = humanized.replace(/\b(a|an)\s+(\w+)/gi, (full, art, word) => {
      const lower = word.toLowerCase();
      const firstChar = lower[0];
      const first3 = lower.slice(0, 3);
      const isVowelSound = 'aeiou'.includes(firstChar)
        ? !CONSONANT_SOUND_VOWELS.has(first3)
        : VOWEL_SOUND_CONSONANTS.has(lower);
      const correctArt = isVowelSound ? 'an' : 'a';
      const actualArt = art.toLowerCase();
      if (actualArt === correctArt) return full;
      const fixed = art[0] === art[0].toUpperCase()
        ? (correctArt === 'an' ? 'An' : 'A')
        : correctArt;
      return fixed + ' ' + word;
    });
    // 3. Fix broken possessives/contractions: "reflect ons" → "reflects on"
    humanized = humanized.replace(/\b(\w+)\s+ons\b/g, '$1s on');
    // 4. Fix double articles: "the the", "a a", "an an"
    humanized = humanized.replace(/\b(the|a|an)\s+\1\b/gi, '$1');
    // 5. Fix ", And " mid-sentence (should be ", and ")
    humanized = humanized.replace(/,\s+And\s+/g, ', and ');
    // 6. Fix ". And" sentence fragments in lists — "AI. And global" → "AI and global"
    humanized = humanized.replace(/([a-z,])\.\s+And\s+/g, '$1 and ');
    // 7. Fix "it has besides" → "it has also" (broken adverb placement)
    humanized = humanized.replace(/\b(has|have|had)\s+(besides|on top of that|what is more)\s+/gi, '$1 also ');
    // 8. Fix "It on top of that" → "It also"
    humanized = humanized.replace(/\b(It|it)\s+(on top of that|besides this|besides|what is more)\s+/gi, '$1 also ');
    // 9. Fix misplaced "too" used as "also" ("it has too raised" → "it has also raised")
    humanized = humanized.replace(/\b(It|it)\s+too\s+/g, '$1 also ');
    humanized = humanized.replace(/\b(has|have|had|was|were|is|are)\s+too\s+/g, '$1 also ');
    // 9b. Fix irregular past tense errors from phrase synonyms
    humanized = humanized.replace(/\bputed\b/g, 'put');
    humanized = humanized.replace(/\bcutted\b/g, 'cut');
    humanized = humanized.replace(/\bsetted\b/g, 'set');
    humanized = humanized.replace(/\bseting\b/g, 'setting');
    humanized = humanized.replace(/\bweighes\b/g, 'weighs');
    // 9c. Fix noun/verb POS mismatches from synonym replacement
    // "the require for" → "the need for" (require used as noun)
    humanized = humanized.replace(/\bthe require for\b/gi, 'the need for');
    humanized = humanized.replace(/\bthe require of\b/gi, 'the need of');
    // "for grasp" → "for grasping" (bare infinitive after "for")
    humanized = humanized.replace(/\bfor grasp\b/gi, 'for grasping');
    // "widespread referred" → "commonly referred" (adjective used as adverb)
    humanized = humanized.replace(/\bwidespread referred\b/gi, 'commonly referred');
    humanized = humanized.replace(/\bprevalent referred\b/gi, 'commonly referred');
    // "setting up / sets up / set up X as" → "establishing / establishes / established X as"
    humanized = humanized.replace(/\bsetting up\b/gi, 'establishing');
    humanized = humanized.replace(/\bsets up\b/gi, 'establishes');
    humanized = humanized.replace(/\bset up\b/gi, 'established');
    // "facilitate to X" → "help to X" (facilitate doesn't take infinitive)
    humanized = humanized.replace(/\bfacilitate to\b/gi, 'help to');
    humanized = humanized.replace(/\bfacilitates to\b/gi, 'helps to');
    // 9d. Fix capitalized verb after citation mid-sentence: "et al. (2022) Provide" → "provide"
    humanized = humanized.replace(/(\(\d{4}\))\s+([A-Z])([a-z]+)\b/g, 
      (m, cite, first, rest) => {
        const word = first.toLowerCase() + rest;
        // Only lowercase if it looks like a common verb
        const verbs = new Set(['provide', 'provides', 'provided', 'analyze', 'analyzes', 'analyzed',
          'examine', 'examines', 'examined', 'argue', 'argues', 'argued', 'suggest',
          'suggests', 'suggested', 'demonstrate', 'demonstrates', 'demonstrated',
          'highlight', 'highlights', 'highlighted', 'use', 'uses', 'used',
          'show', 'shows', 'showed', 'report', 'reports', 'reported',
          'discuss', 'discusses', 'discussed', 'find', 'finds', 'found',
          'note', 'notes', 'noted', 'offer', 'offers', 'offered',
          'present', 'presents', 'presented', 'explore', 'explores', 'explored',
          'identify', 'identifies', 'identified', 'reveal', 'reveals', 'revealed',
          'describe', 'describes', 'described', 'assess', 'assesses', 'assessed',
          'conclude', 'concludes', 'concluded', 'investigate', 'investigates', 'investigated',
          'employ', 'employs', 'employed']);
        if (verbs.has(word)) return cite + ' ' + word;
        return m;
      });
    humanized = humanized.replace(/\bcarrys\b/g, 'carries');
    humanized = humanized.replace(/\bdealed\b/g, 'dealt');
    // 10. Fix superlative grammar: "most strong" → "strongest", "most large" → "largest"
    const SUPERLATIVE_MAP: Record<string, string> = {
      'strong': 'strongest', 'large': 'largest', 'small': 'smallest',
      'big': 'biggest', 'fast': 'fastest', 'old': 'oldest', 'young': 'youngest',
      'weak': 'weakest', 'hard': 'hardest', 'soft': 'softest', 'long': 'longest',
      'short': 'shortest', 'tall': 'tallest', 'wide': 'widest', 'deep': 'deepest',
      'quick': 'quickest', 'slow': 'slowest', 'bright': 'brightest', 'dark': 'darkest',
    };
    humanized = humanized.replace(/\bmost\s+(strong|large|small|big|fast|old|young|weak|hard|soft|long|short|tall|wide|deep|quick|slow|bright|dark)\b/gi,
      (m, adj) => SUPERLATIVE_MAP[adj.toLowerCase()] || m);
    // 11. Remove heading text duplicated as first sentence of body paragraphs
    // Uses fuzzy matching to catch synonym-swapped duplicates (e.g. "Role" → "function")
    const hdLines = humanized.split('\n');
    // Collect all heading lines (short, no period, title-like)
    const headingTexts: string[] = [];
    for (const line of hdLines) {
      const t = line.trim();
      if (t.length >= 10 && t.length <= 80 && !/[.!?]$/.test(t) && t.split(/\s+/).length <= 12) {
        headingTexts.push(t);
      }
    }
    // Helper: normalize text for fuzzy comparison
    const normWords = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    // First pass: deduplicate near-duplicate heading lines
    {
      const seenNorm = new Set<string>();
      for (let i = 0; i < hdLines.length; i++) {
        const t = hdLines[i].trim();
        if (!t || t.split(/\s+/).length > 12 || /[.!?]$/.test(t)) continue;
        if (t.length < 8) continue;
        const nw = normWords(t);
        const key = nw.join(' ');
        let isDup = false;
        for (const seen of seenNorm) {
          const sWords = seen.split(' ');
          const overlap = nw.filter(w => sWords.includes(w)).length;
          if (overlap >= Math.min(nw.length, sWords.length) * 0.6) { isDup = true; break; }
        }
        if (isDup) { hdLines[i] = ''; } else { seenNorm.add(key); }
      }
    }
    // Second pass: remove any body line that starts with a heading text (exact or fuzzy match)
    for (let i = 0; i < hdLines.length; i++) {
      const t = hdLines[i].trim();
      if (!t) continue;
      for (const heading of headingTexts) {
        // Exact match
        if (t.startsWith(heading + '.') || (t.startsWith(heading + ' ') && t.length > heading.length + 5)) {
          const rest = t.slice(heading.length).replace(/^[.\s]+/, '').trim();
          if (rest.length > 0) {
            hdLines[i] = rest[0].toUpperCase() + rest.slice(1);
          } else {
            hdLines[i] = '';
          }
          break;
        }
        // Fuzzy match: check if first N words of body line overlap 70%+ with heading words
        const hWords = normWords(heading);
        if (hWords.length >= 2) {
          // Extract first sentence from body line (up to first period)
          const dotIdx = t.indexOf('.');
          if (dotIdx > 10) {
            const firstSent = t.slice(0, dotIdx);
            const fWords = normWords(firstSent);
            const overlap = hWords.filter(w => fWords.includes(w)).length;
            if (overlap >= hWords.length * 0.6 && fWords.length <= hWords.length + 3) {
              const rest = t.slice(dotIdx + 1).trim();
              if (rest.length > 0) {
                hdLines[i] = rest[0].toUpperCase() + rest.slice(1);
              } else {
                hdLines[i] = '';
              }
              break;
            }
          }
        }
      }
    }
    humanized = hdLines.filter(l => l !== '' || true).join('\n');
    // 12. Fix stray semicolons/colons in list structures: "X; and Y" → "X, and Y"
    humanized = humanized.replace(/;\s+(and|or|but)\s+/gi, ', $1 ');
    // 13. Fix colons before list continuations: "AI: and global" → "AI, and global"
    humanized = humanized.replace(/:\s+(and|or|but)\s+/gi, ', $1 ');

    // ── POST-CLEAN GRAMMAR CHECK ────────────────────────────────
    // Universal grammar cleaner: irregular verbs, subject-verb agreement,
    // collocation errors, structural fixes, tense consistency.
    humanized = postCleanGrammar(humanized);

    // ── ABSOLUTE FINAL SAFETY NET ──────────────────────────────
    // Runs after ALL engine processing AND all post-processors.
    // Catches patterns that any step may have (re-)introduced.
    // 1. Doubled subordinate conjunctions: "When when" → "When"
    humanized = humanized.replace(/\b(when|since|though|although|because|while|if|unless|after|before|until|once)\s+\1\b/gi, "$1");
    // 1b. Doubled prepositions/small words: "on on" → "on"
    humanized = humanized.replace(/\b(on|in|at|to|of|by|or|and|for|nor|the|with|from|into|onto|upon|over|that|this|than)\s+\1\b/gi, "$1");
    // 2. LLM garbled accessibility phrases
    humanized = humanized.replace(/\b(eas(?:y|ier))\s+(?:for\s+\w+\s+)?to\s+(entry|availability)\b/gi, "$1 to access");
    humanized = humanized.replace(/\bto entry\b/gi, "to access");
    humanized = humanized.replace(/\bto availability\b/gi, "to access");
    // 3. LLM garbled "cause" phrasing
    humanized = humanized.replace(/\bcan cause (a more|Efficiency|social|better|stronger)/gi, "can bring about $1");
    humanized = humanized.replace(/\bcould cause (a more|Efficiency|social|better|stronger)/gi, "could bring about $1");
    // 4. Redundancy fixes
    humanized = humanized.replace(/\bHealthcare care\b/g, "Healthcare");
    // 5. Offensive/archaic words
    humanized = humanized.replace(/\bquislingism\b/gi, "collaboration");
    humanized = humanized.replace(/\bquisling\b/gi, "collaborator");

    // ── DEEP KILL ABBREVIATION & CAPS CLEANUP ──────────────────
    // LLMs sometimes mangle abbreviations like D.C., U.S., U.K. by
    // replacing periods with commas/semicolons or inserting conjunctions.
    // Also fix ALL-CAPS words leaked by the Wikipedia engine in body text.
    if (isDeepKill) {
      // Fix D.C. abbreviation corruption variants
      humanized = humanized.replace(/\bD[,;]\s*c\b\.?/gi, 'D.C.');
      humanized = humanized.replace(/\bD[,;]\s*and\s*c\b\.?/gi, 'D.C.');
      humanized = humanized.replace(/\bD\.\s+C\./g, 'D.C.');
      // Fix U.S. abbreviation corruption variants
      humanized = humanized.replace(/\bU[,;]\s*s\b[,;.]?/gi, 'U.S.');
      humanized = humanized.replace(/\bU\.\s+S\./g, 'U.S.');
      // Fix U.K. abbreviation corruption variants
      humanized = humanized.replace(/\bU[,;]\s*k\b\.?/gi, 'U.K.');
      humanized = humanized.replace(/\bU\.\s+K\./g, 'U.K.');
      // Fix ALL-CAPS words in body text (not in heading lines)
      // Heading lines: start with Roman numeral or are all-caps short lines
      const lines = humanized.split('\n');
      humanized = lines.map(line => {
        const trimmed = line.trim();
        // Skip heading lines (start with roman numeral, or short all-caps lines)
        if (/^[IVX]+\.\s/.test(trimmed)) return line;
        if (trimmed.length < 120 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) return line;
        // Replace ALL-CAPS words (4+ letters) with title case in body text
        return line.replace(/\b([A-Z]{4,})\b/g, (m) => {
          // Keep known acronyms
          if (['HOPE', 'ACS'].includes(m)) return m;
          return m.charAt(0) + m.slice(1).toLowerCase();
        });
      }).join('\n');
      // Fix heading-adjacent case corruption: "cONCENTRATED" → "CONCENTRATED"
      humanized = humanized.replace(/\b([a-z])([A-Z]{3,})\b/g, (_m, first, rest) => first.toUpperCase() + rest);
    }

    // ── LAST-MILE MEANING VALIDATOR (2 iterations) ─────────────────
    // Applies to ALL humanizers. Compares each output sentence against
    // the original to ensure the content still communicates the same idea.
    // If any sentence has drifted too far, it gets reprocessed with
    // lighter transforms that preserve meaning. Runs up to 2 iterations
    // to catch sentences that still drift after the first pass.
    // Skip for nuru_v2: its iterative rewrite loop manages its own meaning check.
    // Skip for Deep Kill: Nuru V2 at end of pipeline handles meaning internally.
    if (engine !== 'nuru_v2' && !isDeepKill) {
      for (let meaningIter = 0; meaningIter < 2; meaningIter++) {
        const beforeFix = humanized;
        humanized = lastMileMeaningValidator(text, humanized, 0.25);
        if (humanized === beforeFix) break; // no changes needed, stop iterating
      }
    }

    // ── COHERENCE SAFETY NET ─────────────────────────────────
    // Catch any garbled sentences that slipped through engine-level checks.
    // Replace them with the best-matching original sentence (natural > garbled).
    // Skip for nuru_v2: its own quality gate handles garbled output.
    // Skip for Deep Kill: Nuru V2 at end of pipeline handles quality internally.
    if (engine !== 'nuru_v2' && !isDeepKill) {
      const isLikelyGarbled = (s: string): boolean => {
        const st = s.trim().replace(/^["'\u201C\u201D\u2018\u2019\s]+/, '').replace(/["'\u201C\u201D\u2018\u2019\s]+$/, '');
        const w = st.split(/\s+/);
        if (w.length <= 3) return false;
        if (/^(?:do|does|did|is|are|was|were|has|have|had)\s+\w+\s+(?:from|in|at|by|of|to)\b/i.test(st) && !/^(?:do|does|did)\s+(?:not|n't)\b/i.test(st)) return true;
        if (/\b(?:that|which|this|the|a|an)\.\s*$/i.test(st)) return true;
        if (/\b(?:chosed|choosed|runned|comed|goed|taked|takened|gived|writed|speaked|leaved|thinked|sayed|tolded|keeped|bringed|buyed|felted|cutted|putted|setted|becomed|choosened)\b/i.test(st)) return true;
        if (/\b(?:by|of|in|on|at|for|to)\s+(?:by|of|in|on|at|for|to)\s+/i.test(st)) return true;
        if (/\b(\w{4,})\s+\1\b/i.test(st)) return true;
        // Broken passive ending with bare noun agent (no determiner)
        if (/\b(?:is|are|was|were)\s+\w+(?:ed|en|wn|ne|ght)\s+by\s+\w+\s+\w+[.,]\s*$/i.test(st)) {
          const pm = st.match(/by\s+(\w+\s+\w+)[.,]\s*$/i);
          if (pm && !/^(?:the|a|an|this|that|these|those|some|many|most|its|his|her|their|our|my|your)\b/i.test(pm[1])) return true;
        }
        // "Because for" double conjunction
        if (/^Because\s+for\b/i.test(st)) return true;
        // Dangling PP + modal: "Before bedtime might..."
        if (/^(?:Before|After|During|At)\s+\w+\s+(?:might|could|can|would|should|will)\b/i.test(st)) return true;
        // "What Recognizing" / "What [Verb]ing" — broken fragment
        if (/^What\s+[A-Z][a-z]+ing\b/.test(st)) return true;
        // Ending with broken parenthetical: "(such." or ", such."
        if (/[,(]\s*such\.\s*$/i.test(st)) return true;
        // Dangling "such" at end
        if (/\bsuch[.!?]\s*$/i.test(st)) return true;
        if (w.length > 6 && !/\b(?:is|are|was|were|has|have|had|do|does|did|can|could|will|would|shall|should|may|might|must|seems?|appears?|shows?|suggests?|indicates?|involves?|requires?|provides?|leads?|makes?|plays?|helps?|causes?|includes?|implies?|highlights?|considers?|happens?|chose|know|think|find|get|go|come|see|said|told|give|take|remain|allow|ensure|represent|describe|explain|illustrate|demonstrate|affect|increase|decrease|relate|connect|compare|examine|analyze|identify|define|affect|create|develop|establish|maintain|occur|produce|result|change|reflect|support|present)\b/i.test(st)) return true;
        return false;
      };
      const origSents = text.match(/[^.!?]+[.!?]+/g) || [];
      const paragraphs = humanized.split(/\n\s*\n/);
      humanized = paragraphs.map(para => {
        const sents = para.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
        return sents.map(sent => {
          const t = sent.trim();
          if (!t || !isLikelyGarbled(t)) return sent;
          // Find best-matching original sentence by word overlap
          const sentWords = new Set(t.toLowerCase().split(/\s+/).filter(x => x.length > 3));
          let bestMatch = sent;
          let bestOverlap = 0;
          for (const orig of origSents) {
            const oWords = new Set(orig.trim().toLowerCase().split(/\s+/).filter(x => x.length > 3));
            let overlap = 0;
            for (const ww of sentWords) if (oWords.has(ww)) overlap++;
            if (overlap > bestOverlap) { bestOverlap = overlap; bestMatch = orig; }
          }
          return bestOverlap > 0 ? bestMatch : sent;
        }).join(' ');
      }).join('\n\n');
    }

    // Fix sentence-initial lowercase after all processing
    // Avoid capitalizing after abbreviation periods (D.C., U.S.)
    // First: capitalize start of string
    humanized = humanized.replace(/^([a-z])/, (_m, ch) => ch.toUpperCase());
    // Then: capitalize after sentence-ending punctuation
    humanized = humanized.replace(/([.!?])\s+([a-z])/g, (m, punct, ch, offset) => {
      // Check if the period follows a single uppercase letter (abbreviation pattern)
      if (punct === '.' && offset > 0) {
        const charBefore = humanized[offset - 1];
        // If the char before the period is an uppercase letter, likely an abbreviation
        if (charBefore && /[A-Z]/.test(charBefore)) return m; // Don't capitalize
      }
      return punct + ' ' + ch.toUpperCase();
    });


    // ── FINAL CAPITALIZATION FIX ──────────────────────────────
    // Runs AFTER all post-processing to catch mid-sentence capitals
    // re-introduced by enforceRestructuringThreshold, fixCapitalization,
    // preserveInputStructure, unifiedSentenceProcess, etc.
    humanized = fixMidSentenceCapitalization(humanized, text);

    // ── FINAL HYPHEN SPACING FIX ──────────────────────────────
    // Fix spaced hyphens that may have been re-introduced by post-processing
    // "cross - national" → "cross-national", "evidence - based" → "evidence-based"
    humanized = fixHyphenSpacing(humanized);

    // ── FINAL CITATION VERB FIX ───────────────────────────────
    // Must run AFTER fixMidSentenceCapitalization because "et al." causes
    // the sentence splitter to treat "(2022) Provide" as sentence-initial
    // and re-capitalize "Provide". This pass has the final say.
    humanized = humanized.replace(/(\(\d{4}\))\s+([A-Z])([a-z]+)\b/g, 
      (m, cite, first, rest) => {
        const word = first.toLowerCase() + rest;
        const verbs = new Set(['provide', 'provides', 'provided', 'analyze', 'analyzes', 'analyzed',
          'examine', 'examines', 'examined', 'argue', 'argues', 'argued', 'suggest',
          'suggests', 'suggested', 'demonstrate', 'demonstrates', 'demonstrated',
          'highlight', 'highlights', 'highlighted', 'use', 'uses', 'used',
          'show', 'shows', 'showed', 'report', 'reports', 'reported',
          'discuss', 'discusses', 'discussed', 'find', 'finds', 'found',
          'note', 'notes', 'noted', 'offer', 'offers', 'offered',
          'present', 'presents', 'presented', 'explore', 'explores', 'explored',
          'identify', 'identifies', 'identified', 'reveal', 'reveals', 'revealed',
          'describe', 'describes', 'described', 'assess', 'assesses', 'assessed',
          'conclude', 'concludes', 'concluded', 'investigate', 'investigates', 'investigated',
          'employ', 'employs', 'employed']);
        if (verbs.has(word)) return cite + ' ' + word;
        return m;
      });

    // ── DETECTOR FEEDBACK LOOP ────────────────────────────────
    // After ALL post-processing, check AI score. If still above 5%,
    // run progressively stronger Oxygen passes to drive it to 0%.
    // Max 3 iterations to avoid infinite loops. Each pass uses
    // increasing strength to break remaining AI patterns.
    // Skip for Wikipedia: Oxygen passes destroy encyclopedic vocabulary
    // and introduce grammar errors ("boosts", "opportunitied", "pitch in").
    // Skip for nuru_v2: it handles its own sentence-by-sentence quality.
    if (engine !== 'ghost_pro_wiki' && engine !== 'nuru_v2') {
      const FEEDBACK_MAX_ITERS = 1; // reduced from 2 — saves 10-20s latency on Vercel
      const FEEDBACK_AI_THRESHOLD = 50.0; // raised from 30 — only re-run if heavily AI
      const FEEDBACK_STRENGTHS = ['light', 'medium', 'strong'] as const;

      for (let fbIter = 0; fbIter < FEEDBACK_MAX_ITERS; fbIter++) {
        const midAnalysis = detector.analyze(humanized);
        const midScore = midAnalysis.summary.overall_ai_score;
        console.log(`[Feedback Loop] Iteration ${fbIter + 1}: AI score = ${midScore.toFixed(1)}%`);

        if (midScore <= FEEDBACK_AI_THRESHOLD) break; // target reached

        try {
          const fbStrength = FEEDBACK_STRENGTHS[Math.min(fbIter, FEEDBACK_STRENGTHS.length - 1)];
          const fbMode = fbStrength === 'light' ? 'fast' : fbStrength === 'strong' ? 'aggressive' : 'quality';
          const polished = oxygenHumanize(humanized, fbStrength, fbMode, true);
          if (polished && polished.trim().length > 0) {
            // Verify meaning not destroyed
            const fbOverlap = contentWordOverlap(text, polished);
            if (fbOverlap >= 0.30) {
              humanized = polished;
              // Re-apply critical safety nets after polish
              humanized = expandContractions(humanized);
              humanized = removeEmDashes(humanized);
              humanized = humanized.replace(/(^|[.!?]\s+)([a-z])/g, (_m, pre, ch) => pre + ch.toUpperCase());
            }
          }
        } catch {
          break; // Oxygen error — stop feedback loop
        }
      }
    }

    // Generate per-sentence alternatives (3 candidates each, best already picked by engines)
    const FIRST_PERSON_RE = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/i;
    const inputHadFirstPerson = FIRST_PERSON_RE.test(text);
    const sentenceAlternativesMap: Record<string, ScoredCandidate[]> = {};
    // Split final humanized text into sentences and generate lightweight extras.
    // Skip for very long outputs to reduce latency.
    const finalSentences = humanized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
    if (finalSentences.length <= 40) {
      for (const sent of finalSentences) {
        const trimmed = sent.trim();
        if (!trimmed || trimmed.length < 15) continue;
        const { alternatives } = generateCandidates(trimmed, inputHadFirstPerson, 2);
        if (alternatives.length > 0) {
          sentenceAlternativesMap[trimmed] = alternatives;
        }
      }
    }

    // ── FINAL AI CAPITALIZATION ──────────────────────────────
    // Must run after ALL post-processing since many phases re-lowercase "AI"
    humanized = humanized
      .replace(/\bAi\b/g, 'AI')
      .replace(/\bai\b/g, 'AI')
      .replace(/\bai-(\w)/gi, (_m: string, c: string) => `AI-${c}`);

    // Run output detection + semantic guard check in parallel
    const [outputAnalysis, meaningCheck] = await Promise.all([
      Promise.resolve(detector.analyze(humanized)),
      isMeaningPreserved(text, humanized, 0.88),
    ]);

    // Word counts
    const inputWords = text.trim().split(/\s+/).length;
    const outputWords = humanized.trim().split(/\s+/).length;

    return NextResponse.json({
      success: true,
      original: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
      humanized,
      sentence_alternatives: sentenceAlternativesMap,
      word_count: outputWords,
      input_word_count: inputWords,
      engine_used: engine ?? 'ghost_mini',
      meaning_preserved: meaningCheck.isSafe,
      meaning_similarity: Math.round(meaningCheck.similarity * 100) / 100,
      input_detector_results: {
        overall: Math.round(inputAnalysis.summary.overall_ai_score * 10) / 10,
        detectors: inputAnalysis.detectors.map((d) => ({
          detector: d.detector,
          ai_score: Math.round(d.ai_score * 10) / 10,
          human_score: Math.round(d.human_score * 10) / 10,
        })),
      },
      output_detector_results: {
        overall: Math.round(outputAnalysis.summary.overall_ai_score * 10) / 10,
        signals: outputAnalysis.signals,
        detectors: outputAnalysis.detectors.map((d) => ({
          detector: d.detector,
          ai_score: Math.round(d.ai_score * 10) / 10,
          human_score: Math.round(d.human_score * 10) / 10,
        })),
      },
    });
  } catch (error) {
    console.error('Humanize API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Humanization failed' },
      { status: 500 },
    );
  }
}
