import { NextResponse } from 'next/server';
import {
  classifyAiScore,
  getDetector,
  summarizeDetectorResults,
  type DetectorResult,
} from '@/lib/engine/multi-detector';
import {
  fetchVendorDetectorScores,
  type VendorDetectorScores,
} from '@/lib/engine/vendor-detectors';

const VENDOR_DETECTOR_BY_DISPLAY: Partial<Record<string, keyof VendorDetectorScores>> = {
  GPTZero: 'gptzero',
  'Originality.ai': 'originality_ai',
};

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
    const vendorScores = await fetchVendorDetectorScores(text, {
      gptzeroApiKey: process.env.GPTZERO_API_KEY,
      originalityApiKey: process.env.ORIGINALITY_API_KEY,
    });

    const vendorDetectorsUsed = new Set<keyof VendorDetectorScores>();
    let detectorResults: DetectorResult[] = analysis.detectors;

    if (Object.keys(vendorScores).length > 0) {
      detectorResults = analysis.detectors.map((detectorResult) => {
        const vendorKey = VENDOR_DETECTOR_BY_DISPLAY[detectorResult.detector];
        if (!vendorKey) return detectorResult;
        const vendorScore = vendorScores[vendorKey];
        if (typeof vendorScore !== 'number') return detectorResult;
        vendorDetectorsUsed.add(vendorKey);
        const aiScore = Math.round(Math.max(0, Math.min(100, vendorScore)) * 10) / 10;
        const classified = classifyAiScore(aiScore);
        return {
          ...detectorResult,
          ai_score: aiScore,
          human_score: Math.round((100 - aiScore) * 10) / 10,
          verdict: classified.verdict,
          confidence: classified.confidence,
        };
      });
    }

    const summary = vendorDetectorsUsed.size > 0
      ? summarizeDetectorResults(
          analysis.signals,
          detectorResults,
          analysis.summary.word_count,
          analysis.summary.sentence_count,
        )
      : analysis.summary;

    return NextResponse.json({
      success: true,
      detectors: detectorResults.map((d) => ({
        detector: d.detector,
        ai_score: Math.round(d.ai_score * 10) / 10,
        human_score: Math.round(d.human_score * 10) / 10,
        verdict: d.verdict,
        confidence: d.confidence,
        category: d.category,
        source: (() => {
          const vendorKey = VENDOR_DETECTOR_BY_DISPLAY[d.detector];
          return vendorKey && vendorDetectorsUsed.has(vendorKey) ? 'vendor-api' : 'local-mirror';
        })(),
        status: 'success',
      })),
      summary: {
        overall_ai_score: Math.round(summary.overall_ai_score * 10) / 10,
        overall_human_score: Math.round(summary.overall_human_score * 10) / 10,
        overall_verdict: summary.overall_verdict,
        total_detectors: summary.total_detectors,
        detectors_flagged_ai: summary.detectors_flagged_ai,
        detectors_flagged_human: summary.detectors_flagged_human,
        word_count: summary.word_count,
        sentence_count: summary.sentence_count,
        vendor_detectors_used: [...vendorDetectorsUsed],
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
