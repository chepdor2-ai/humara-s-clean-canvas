import { NextResponse } from 'next/server';
import { getDetector } from '@/lib/engine/multi-detector';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    if (text.length > 50000) {
      return NextResponse.json({ error: 'Text too long (max 50,000 characters)' }, { status: 400 });
    }

    const detector = getDetector();
    const analysis = detector.analyze(text);

    return NextResponse.json({
      success: true,
      detectors: analysis.detectors.map((d) => ({
        detector: d.detector,
        ai_score: Math.round(d.ai_score * 10) / 10,
        human_score: Math.round(d.human_score * 10) / 10,
        verdict: d.verdict,
        confidence: d.confidence,
        category: d.category,
        status: 'success',
      })),
      summary: {
        overall_ai_score: Math.round(analysis.summary.overall_ai_score * 10) / 10,
        overall_human_score: Math.round(analysis.summary.overall_human_score * 10) / 10,
        overall_verdict: analysis.summary.overall_verdict,
        total_detectors: analysis.summary.total_detectors,
        detectors_flagged_ai: analysis.summary.detectors_flagged_ai,
        detectors_flagged_human: analysis.summary.detectors_flagged_human,
        word_count: analysis.summary.word_count,
        sentence_count: analysis.summary.sentence_count,
      },
      signals: analysis.signals,
    });
  } catch (error) {
    console.error('Detect API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Detection failed' },
      { status: 500 },
    );
  }
}
