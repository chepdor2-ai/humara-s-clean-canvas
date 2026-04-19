/**
 * POST /api/deep-clean
 * ───────────────────────────────────────────────────────────────────────
 * Iterative full-text AI-signal cleanup — non-LLM, forensic pipeline.
 *
 * Pipeline (per iteration):
 *   1. Detect   — `multi-detector.analyze(text)` → overall AI score +
 *                `perSentenceDetails()` per-sentence flags.
 *   2. Targeted — for every flagged sentence (ai_score ≥ 35), run
 *                 `stealthHumanizeTargeted(sentence, phrases)` which does
 *                 word-level deep replacement plus `deepSignalClean`.
 *   3. Forensic — run `deepSignalClean(text, aggressive=true)` over the
 *                 whole document to sweep any surviving AI phrases.
 *   4. Score    — recompute overall AI score. Stop when below `threshold`
 *                 (default 15%) or `maxIterations` (default 4) reached.
 *
 * Request body:
 *   {
 *     text:          string                  // required
 *     tone?:         string                  // default 'neutral'
 *     strength?:     'medium' | 'strong'     // default 'strong'
 *     threshold?:    number                  // 0–100, default 15
 *     maxIterations?: number                 // 1–8, default 4
 *   }
 *
 * Response:
 *   {
 *     success:    true,
 *     humanized:  string,
 *     initial_score_pct: number,
 *     final_score_pct:   number,
 *     iterations: number,
 *     flagged_sentences_initial: number,
 *     flagged_sentences_final:   number
 *   }
 * ───────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from 'next/server';
import { stealthHumanizeTargeted } from '@/lib/engine/stealth';
import { deepSignalClean } from '@/lib/engine/stealth/forensics';
import { getDetector, TextSignals } from '@/lib/engine/multi-detector';
import { robustSentenceSplit } from '@/lib/engine/content-protection';
import { resolveTone } from '@/lib/engine/ai-signal-dictionary';

const DEFAULT_THRESHOLD_PCT = 15;
const DEFAULT_MAX_ITERATIONS = 4;
const FLAG_SCORE_THRESHOLD = 35;

interface DeepCleanBody {
  text?: string;
  tone?: string;
  strength?: string;
  threshold?: number;
  maxIterations?: number;
}

interface DeepCleanResponse {
  success: true;
  humanized: string;
  initial_score_pct: number;
  final_score_pct: number;
  iterations: number;
  flagged_sentences_initial: number;
  flagged_sentences_final: number;
  tone: string;
  strength: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as DeepCleanBody;
    const text = (body.text ?? '').trim();

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }
    if (text.length > 50000) {
      return NextResponse.json(
        { error: 'Text too long (max 50,000 characters)' },
        { status: 400 },
      );
    }

    const strength = body.strength === 'medium' ? 'medium' : 'strong';
    const toneId = resolveTone(body.tone).id;
    const thresholdPct = Math.max(0, Math.min(100, body.threshold ?? DEFAULT_THRESHOLD_PCT));
    const maxIterations = Math.max(1, Math.min(8, body.maxIterations ?? DEFAULT_MAX_ITERATIONS));

    // Initial analysis
    const detector = getDetector();
    const initialAnalysis = detector.analyze(text);
    const initialScorePct = Math.round(initialAnalysis.summary.overall_ai_score * 10) / 10;
    const initialSignals = new TextSignals(text);
    const initialFlaggedCount = initialSignals
      .perSentenceDetails()
      .filter(d => d.ai_score >= FLAG_SCORE_THRESHOLD).length;

    let current = text;
    let currentScorePct = initialScorePct;
    let iterations = 0;
    let lastFlaggedCount = initialFlaggedCount;

    for (let iter = 0; iter < maxIterations; iter++) {
      iterations++;

      // Score + per-sentence details
      const sigs = new TextSignals(current);
      const perSent = sigs.perSentenceDetails();
      const flagged = perSent.filter(d => d.ai_score >= FLAG_SCORE_THRESHOLD);

      lastFlaggedCount = flagged.length;
      if (flagged.length === 0 && currentScorePct <= thresholdPct) break;

      // Build a map: sentence index (in content-protection splitter) → phrases
      const flagMap = new Map<number, string[]>();
      for (const d of flagged) {
        const phrases = [
          ...(d.flagged_phrases ?? []),
          ...(d.flagged_words ?? []),
        ].filter(Boolean);
        flagMap.set(d.index, phrases);
      }

      // Split document using robust splitter (same as the engine uses)
      const sentences = robustSentenceSplit(current);
      const updated: string[] = [];

      // Track non-heading indices so they line up with perSent indices.
      // `perSentenceDetails` iterates `this.sentences` which comes from
      // `robustSentenceSplit` with headings inline. Since we iterate the
      // same list, indices align naturally.
      for (let i = 0; i < sentences.length; i++) {
        if (flagMap.has(i)) {
          updated.push(stealthHumanizeTargeted(sentences[i], flagMap.get(i) ?? [], strength));
        } else {
          updated.push(sentences[i]);
        }
      }
      current = updated.join(' ');

      // Whole-document forensic sweep
      current = deepSignalClean(current, {
        aggressive: iter > 0,
        skipBurstiness: iter === 0, // run burstiness only on later passes
        skipStarterStrip: false,
      });

      // Re-score
      const newAnalysis = detector.analyze(current);
      currentScorePct = Math.round(newAnalysis.summary.overall_ai_score * 10) / 10;

      if (currentScorePct <= thresholdPct) break;
    }

    // Final flagged count
    const finalSignals = new TextSignals(current);
    const finalFlagged = finalSignals
      .perSentenceDetails()
      .filter(d => d.ai_score >= FLAG_SCORE_THRESHOLD).length;

    const response: DeepCleanResponse = {
      success: true,
      humanized: current,
      initial_score_pct: initialScorePct,
      final_score_pct: currentScorePct,
      iterations,
      flagged_sentences_initial: initialFlaggedCount,
      flagged_sentences_final: Math.min(lastFlaggedCount, finalFlagged),
      tone: toneId,
      strength,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('deep-clean API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Deep clean failed' },
      { status: 500 },
    );
  }
}
