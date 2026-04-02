import { NextResponse } from 'next/server';
import { humanize } from '@/lib/engine/humanizer';
import { ghostProHumanize } from '@/lib/engine/ghost-pro';
import { llmHumanize } from '@/lib/engine/llm-humanizer';
import { getDetector } from '@/lib/engine/multi-detector';
import { isMeaningPreservedSync } from '@/lib/engine/semantic-guard';

export const maxDuration = 120; // LLM engines need more time

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, engine, strength, tone, strict_meaning, no_contractions, enable_post_processing } = body;

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

    if (engine === 'ninja') {
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
    } else if (engine === 'ghost_pro') {
      // Ghost Pro: Deep LLM rewrite + signal-aware post-processing
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

    // Detect output scores
    const outputAnalysis = detector.analyze(humanized);

    // Semantic guard check
    const meaningCheck = isMeaningPreservedSync(text, humanized, 0.88);

    // Word counts
    const inputWords = text.trim().split(/\s+/).length;
    const outputWords = humanized.trim().split(/\s+/).length;

    return NextResponse.json({
      success: true,
      original: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
      humanized,
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
