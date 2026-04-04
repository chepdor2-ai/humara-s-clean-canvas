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

    let humanized: string;

    if (engine === 'humara_v1_3') {
      // Humara v1.3: Stealth Humanizer Engine v5 from coursework-champ
      const { pipeline } = await import('@/lib/engine/humara-v1-3');
      humanized = pipeline(text, tone ?? 'academic', strength === 'strong' ? 10 : strength === 'light' ? 4 : 7);
    } else if (engine === 'humara') {
      // Humara: Independent humanizer engine — phrase-level, strategy-diverse
      humanized = humaraHumanize(text, {
        strength: strength === 'high' ? 'heavy' : strength === 'low' ? 'light' : (strength ?? 'medium'),
        tone: tone ?? 'neutral',
        strictMeaning: strict_meaning ?? false,
      });
    } else if (premium) {
      // Premium: Purely AI-driven per-sentence pipeline
      humanized = await premiumHumanize(
        text,
        engine ?? 'ghost_pro',
        strength ?? 'medium',
        tone ?? 'neutral',
        strict_meaning ?? true,
      );
    } else if (engine === 'undetectable') {
      // Undetectable: Ninja (Stealth) only — second Ghost Mini pass removed
      // The double pass was over-processing and creating unnaturally uniform text
      humanized = await llmHumanize(
        text,
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
        text,
        strength ?? 'medium',
        true,  // preserveSentences
        strict_meaning ?? true,
        tone ?? 'academic',
        no_contractions !== false,
        enable_post_processing !== false,
      );
    } else if (engine === 'fast_v11') {
      // Fast V1.1: 7-phase pipeline (non-LLM primary, LLM optional for chunk rewrite)
      const v11Result = await humanizeV11(text, {
        strength: strength ?? 'medium',
        tone: tone ?? 'neutral',
        strictMeaning: strict_meaning ?? false,
      });
      humanized = v11Result.humanized;
    } else if (engine === 'ghost_mini_v1_2') {
      // Ghost Min v1.2: Academic Prose optimized
      const { ghostMiniV1_2 } = await import('@/lib/engine/ghost-mini-v1-2');
      humanized = ghostMiniV1_2(text);
    } else if (engine === 'ghost_pro') {
      // Ghost Pro: Single LLM rewrite + signal-aware post-processing
      humanized = await ghostProHumanize(text, {
        strength: strength ?? 'medium',
        tone: tone ?? 'neutral',
        strictMeaning: strict_meaning ?? false,
        enablePostProcessing: enable_post_processing !== false,
      });
    } else {
      // Ghost Mini: Statistical-only pipeline (no LLM)
      humanized = humanize(text, {
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
    const FIRST_PERSON_RE_EARLY = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/i;
    const earlyFirstPerson = FIRST_PERSON_RE_EARLY.test(text);
    const inputAiScore = inputAnalysis.summary.overall_ai_score;
    humanized = unifiedSentenceProcess(humanized, earlyFirstPerson, inputAiScore);

    // Post-capitalization formatting — fix sentence casing for all engine outputs
    // Skip for humara engine: it has its own ContentProtection + grammar repair
    if (engine !== 'humara' && engine !== 'humara_v1_3') {
      humanized = fixCapitalization(humanized);
    }

    // Fix AI/ai capitalization that fixCapitalization may lowercase
    humanized = humanized
      .replace(/\bai-(\w)/gi, (_m: string, c: string) => `AI-${c}`)
      .replace(/\bai\b/g, 'AI');

    // Cross-sentence repetition cleanup — deduplicates phrases repeated across sentences
    // Skip for humara engine: it has its own coherence layer
    if (engine !== 'humara' && engine !== 'humara_v1_3') {
      humanized = deduplicateRepeatedPhrases(humanized);
    }

    // Structural post-processing — attacks document-level statistical signals
    // (spectral_flatness, burstiness, sentence_uniformity, readability_consistency, vocabulary_richness)
    // Skip for humara engine: it has its own structural diversity layer
    if (engine !== 'humara' && engine !== 'humara_v1_3') {
      humanized = structuralPostProcess(humanized);
    }

    // Restore the original title/paragraph layout for every engine output.
    // Skip for humara engine: it has its own structure-preserving pipeline
    if (engine !== 'humara' && engine !== 'humara_v1_3') {
      humanized = preserveInputStructure(text, humanized);
    }

    // ── FINAL SAFETY NET: Zero-contraction enforcement ──────────
    // Expand any contractions that may have slipped through ANY engine
    // or post-processing phase. This is the absolute last line of defense.
    humanized = expandContractions(humanized);

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
