import { NextResponse } from 'next/server';
import { humanize } from '@/lib/engine/humanizer';
import { ghostProHumanize } from '@/lib/engine/ghost-pro';
import { llmHumanize } from '@/lib/engine/llm-humanizer';
import { premiumHumanize } from '@/lib/engine/premium-humanizer';
import { humanizeV11 } from '@/lib/engine/v11';
import { humaraHumanize } from '@/lib/humara';
import { getDetector } from '@/lib/engine/multi-detector';
import { isMeaningPreserved } from '@/lib/engine/semantic-guard';
import { fixCapitalization } from '@/lib/engine/shared-dictionaries';
import { deduplicateRepeatedPhrases } from '@/lib/engine/premium-deep-clean';
import { preserveInputStructure } from '@/lib/engine/structure-preserver';
import { structuralPostProcess } from '@/lib/engine/structural-post-processor';
import { generateCandidates, type ScoredCandidate } from '@/lib/candidate-generator';
import { unifiedSentenceProcess } from '@/lib/sentence-processor';
import { expandContractions } from '@/lib/humanize-transforms';
import { removeEmDashes } from '@/lib/engine/v13-shared-techniques';
import { nuruHumanize } from '@/lib/engine/nuru-humanizer';
import { omegaHumanize } from '@/lib/engine/omega-humanizer';

export const maxDuration = 120; // LLM engines need more time

export async function POST(req: Request) {
  try {
    const body = await req.json();
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

    if (engine === 'humara_v1_3') {
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
    if (engine !== 'humara' && engine !== 'humara_v1_3' && engine !== 'nuru' && engine !== 'omega') {
      humanized = unifiedSentenceProcess(humanized, earlyFirstPerson, inputAiScore);
    }

    // Post-capitalization formatting — fix sentence casing for all engine outputs
    // Skip for humara/nuru/omega: they have their own capitalization handling
    // Pass original text so proper nouns from the input are preserved
    if (engine !== 'humara' && engine !== 'humara_v1_3' && engine !== 'nuru' && engine !== 'omega') {
      humanized = fixCapitalization(humanized, text);
    }

    // Fix AI/ai capitalization that fixCapitalization may lowercase
    humanized = humanized
      .replace(/\bai-(\w)/gi, (_m: string, c: string) => `AI-${c}`)
      .replace(/\bai\b/g, 'AI');

    // Cross-sentence repetition cleanup — deduplicates phrases repeated across sentences
    // Skip for humara engine: it has its own coherence layer
    if (engine !== 'humara' && engine !== 'humara_v1_3' && engine !== 'nuru' && engine !== 'omega') {
      humanized = deduplicateRepeatedPhrases(humanized);
    }

    // Structural post-processing — attacks document-level statistical signals
    // (spectral_flatness, burstiness, sentence_uniformity, readability_consistency, vocabulary_richness)
    // Skip for humara engine: it has its own structural diversity layer
    if (engine !== 'humara' && engine !== 'humara_v1_3' && engine !== 'nuru' && engine !== 'omega') {
      humanized = structuralPostProcess(humanized);
    }

    // Restore the original title/paragraph layout for every engine output.
    // Skip for humara engine: it has its own structure-preserving pipeline
    if (engine !== 'humara' && engine !== 'humara_v1_3' && engine !== 'nuru' && engine !== 'omega') {
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
