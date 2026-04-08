import { NextResponse } from 'next/server';
import { humanize } from '@/lib/engine/humanizer';
import { ghostProHumanize } from '@/lib/engine/ghost-pro';
import { llmHumanize } from '@/lib/engine/llm-humanizer';
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
import { omegaHumanize } from '@/lib/engine/omega-humanizer';
import { easyHumanize } from '@/lib/engine/easy-humanizer';
import { robustSentenceSplit } from '@/lib/engine/content-protection';
// deepRestructure, voiceShift, tenseVariation disabled — they garble sentence structure
// import { deepRestructure, voiceShift, tenseVariation } from '@/lib/engine/advanced-transforms';
import { synonymReplace } from '@/lib/engine/utils';
import { applyAIWordKill } from '@/lib/engine/shared-dictionaries';

export const maxDuration = 120; // LLM engines need more time

// ── 60% Sentence Restructuring Enforcement ──────────────────────────
// Ensures at least 60% of sentences are meaningfully restructured.
// Compares output sentences against original, applies additional
// transforms to under-changed sentences until the 60% threshold is met.

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
      let positionalOrig = origSentences[Math.min(i, origSentences.length - 1)];
      let positionalOverlap = contentWordOverlap(positionalOrig, humanizedSentences[i]);
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

export async function POST(req: Request) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid or empty request body' }, { status: 400 });
    }
    const { text, engine, strength, tone, strict_meaning, no_contractions, enable_post_processing, premium } = body;

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

    let humanized: string;

    if (engine === 'easy') {
      // Easy: EssayWritingSupport external API — instant processing, no LLM
      const easyResult = await easyHumanize(
        normalizedText,
        strength ?? 'medium',
        tone ?? 'academic',
      );
      humanized = easyResult.humanized;
      // Easy flows through all post-processing below
    } else if (engine === 'oxygen') {
      // Oxygen v2: T5 model + multi-phase pipeline + full TS post-processing
      const oxygenUrl = process.env.OXYGEN_SERVER_URL || 'http://127.0.0.1:5001';
      
      // Map strength to mode presets
      const oxygenMode = strength === 'light' ? 'fast'
        : strength === 'strong' ? 'aggressive'
        : 'quality';
      
      const oxygenParams = {
        text: normalizedText,
        strength: strength ?? 'medium',
        mode: body.oxygen_mode || oxygenMode,
        min_change_ratio: body.oxygen_min_change_ratio || 0.40,
        max_retries: body.oxygen_max_retries || 3,
        sentence_by_sentence: body.oxygen_sentence_by_sentence !== false,
      };
      
      const resp = await fetch(`${oxygenUrl}/humanize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(oxygenParams),
        signal: AbortSignal.timeout(300000), // 5 min — T5 on CPU is slow
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        return NextResponse.json({ error: `Oxygen model error: ${errBody}` }, { status: 502 });
      }
      const oxygenResult = await resp.json();
      humanized = oxygenResult.humanized;
      // Oxygen now flows through ALL post-processing below (no longer skipped)
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
    } else if (engine === 'humara') {
      // Humara: Independent humanizer engine — phrase-level, strategy-diverse
      humanized = humaraHumanize(normalizedText, {
        strength: strength === 'high' ? 'heavy' : strength === 'low' ? 'light' : (strength ?? 'medium'),
        tone: tone ?? 'neutral',
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
        strength: strength ?? 'medium',
        tone: tone ?? 'neutral',
        strictMeaning: strict_meaning ?? false,
      });
      humanized = v11Result.humanized;
    } else if (engine === 'ghost_mini_v1_2') {
      // Ghost Min v1.2: Academic Prose optimized
      const { ghostMiniV1_2 } = await import('@/lib/engine/ghost-mini-v1-2');
      humanized = ghostMiniV1_2(normalizedText);
    } else if (engine === 'ghost_pro') {
      // Ghost Pro: Single LLM rewrite + signal-aware post-processing
      humanized = await ghostProHumanize(normalizedText, {
        strength: strength ?? 'medium',
        tone: tone ?? 'neutral',
        strictMeaning: strict_meaning ?? false,
        enablePostProcessing: enable_post_processing !== false,
      });
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
    if (engine !== 'humara' && engine !== 'humara_v1_3' && engine !== 'nuru' && engine !== 'omega' && engine !== 'oxygen') {
      humanized = unifiedSentenceProcess(humanized, earlyFirstPerson, inputAiScore);
    }

    // ── 60% Restructuring Enforcement ──────────────────────────────
    // Ensures at least 60% of sentences show meaningful word-level changes.
    // Applies additional transforms to under-changed sentences.
    if (engine !== 'oxygen') {
      humanized = enforceRestructuringThreshold(text, humanized, 0.60);
    }

    // Post-capitalization formatting — fix sentence casing for all engine outputs
    // Skip for humara/nuru/omega: they have their own capitalization handling
    // Pass original text so proper nouns from the input are preserved
    if (engine !== 'humara' && engine !== 'humara_v1_3' && engine !== 'nuru' && engine !== 'omega' && engine !== 'oxygen') {
      humanized = fixCapitalization(humanized, text);
    }

    // Fix AI/ai capitalization that fixCapitalization may lowercase
    humanized = humanized
      .replace(/\bai-(\w)/gi, (_m: string, c: string) => `AI-${c}`)
      .replace(/\baI\b/g, 'AI')
      .replace(/\bai\b/g, 'AI');

    // Cross-sentence repetition cleanup — deduplicates phrases repeated across sentences
    // Skip for humara engine: it has its own coherence layer
    if (engine !== 'humara' && engine !== 'humara_v1_3' && engine !== 'nuru' && engine !== 'omega' && engine !== 'oxygen') {
      humanized = deduplicateRepeatedPhrases(humanized);
    }

    // Structural post-processing — attacks document-level statistical signals
    // (spectral_flatness, burstiness, sentence_uniformity, readability_consistency, vocabulary_richness)
    // Skip for humara engine: it has its own structural diversity layer
    if (engine !== 'humara' && engine !== 'humara_v1_3' && engine !== 'nuru' && engine !== 'omega' && engine !== 'ninja' && engine !== 'undetectable' && engine !== 'oxygen') {
      humanized = structuralPostProcess(humanized);
    }

    // Restore the original title/paragraph layout for every engine output.
    // Skip for humara/nuru/omega: they have their own structure-preserving pipeline
    // Skip for ghost_pro: it preserves headings internally via LLM prompt — re-applying
    // preserveInputStructure causes double headings and sentence redistribution artifacts
    if (engine !== 'humara' && engine !== 'humara_v1_3' && engine !== 'nuru' && engine !== 'omega' && engine !== 'ghost_pro' && engine !== 'oxygen') {
      humanized = preserveInputStructure(text, humanized);
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
    humanized = humanized.replace(/\bweighes\b/g, 'weighs');
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
    // Remove any body line that starts with a heading text (exact or fuzzy match)
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
        if (hWords.length >= 4) {
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

    // ── LAST-MILE MEANING VALIDATOR ─────────────────────────────
    // Applies to ALL humanizers. Compares each output sentence against
    // the original to ensure the content still communicates the same idea.
    // If any sentence has drifted too far, it gets reprocessed with
    // lighter transforms that preserve meaning.
    // Skip for Oxygen: it has its own Python-side validation/repair
    if (engine !== 'oxygen') {
      humanized = lastMileMeaningValidator(text, humanized, 0.35);
    }

    // Fix sentence-initial lowercase after all processing
    humanized = humanized.replace(/(^|[.!?]\s+)([a-z])/g, (_m, pre, ch) => pre + ch.toUpperCase());

    // ── FINAL CAPITALIZATION FIX ──────────────────────────────
    // Runs AFTER all post-processing to catch mid-sentence capitals
    // re-introduced by enforceRestructuringThreshold, fixCapitalization,
    // preserveInputStructure, unifiedSentenceProcess, etc.
    humanized = fixMidSentenceCapitalization(humanized, text);

    // Generate per-sentence alternatives (3 candidates each, best already picked by engines)
    const FIRST_PERSON_RE = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/i;
    const inputHadFirstPerson = FIRST_PERSON_RE.test(text);
    const sentenceAlternativesMap: Record<string, ScoredCandidate[]> = {};
    // Split final humanized text into sentences and generate 2 extra candidates per sentence
    const finalSentences = humanized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
    for (const sent of finalSentences) {
      const trimmed = sent.trim();
      if (!trimmed || trimmed.length < 15) continue;
      const { alternatives } = generateCandidates(trimmed, inputHadFirstPerson, 3);
      if (alternatives.length > 0) {
        sentenceAlternativesMap[trimmed] = alternatives;
      }
    }

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
