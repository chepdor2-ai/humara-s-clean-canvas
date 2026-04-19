/**
 * POST /api/rehumanize-sentence
 * ───────────────────────────────────────────────────────────────────────
 * Aggressive deep-clean for a single flagged sentence.
 *
 * Pipeline (all non-LLM):
 *   1. `stealthHumanizeTargeted()` — targeted replacement of flagged
 *      words/phrases identified by client or `/api/detect`.
 *   2. `deepSignalClean()` aggressive mode — per-detector forensic passes
 *      for ZeroGPT / Turnitin / Originality / Copyleaks / GPTZero / Pangram
 *      / Surfer / Scribbr / Winston.
 *   3. Iterative retries — up to 4 cycles until the per-sentence deep
 *      score drops below `threshold` (default 0.30).
 *
 * Request body:
 *   {
 *     sentence:        string                  // required
 *     flaggedPhrases?: string[]                // from detect response
 *     flaggedWords?:   string[]                // from detect response
 *     tone?:           string                  // default 'neutral'
 *     strength?:       'medium' | 'strong'     // default 'strong'
 *     threshold?:      number                  // 0–1, default 0.30
 *     maxIterations?:  number                  // default 4
 *   }
 *
 * Response:
 *   {
 *     success:   true,
 *     humanized: string,
 *     initial:   SentenceSignalReport,
 *     final:     SentenceSignalReport,
 *     iterations: number
 *   }
 * ───────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from 'next/server';
import { stealthHumanize, stealthHumanizeTargeted } from '@/lib/engine/stealth';
import { deepSignalClean } from '@/lib/engine/stealth/forensics';
import {
  scoreSentenceDeep,
  resolveTone,
  type SentenceSignalReport,
} from '@/lib/engine/ai-signal-dictionary';

const DEFAULT_THRESHOLD = 0.30;
const DEFAULT_MAX_ITERATIONS = 4;

interface RehumanizeSentenceBody {
  sentence?: string;
  flaggedPhrases?: string[];
  flaggedWords?: string[];
  tone?: string;
  strength?: string;
  threshold?: number;
  maxIterations?: number;
}

interface RehumanizeSentenceSuccess {
  success: true;
  humanized: string;
  initial: SentenceSignalReport;
  final: SentenceSignalReport;
  iterations: number;
  best_score_pct: number;
}

interface RehumanizeSentenceError {
  error: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RehumanizeSentenceBody;
    const sentence = (body.sentence ?? '').trim();

    if (!sentence) {
      return NextResponse.json<RehumanizeSentenceError>(
        { error: 'Sentence is required' },
        { status: 400 },
      );
    }
    if (sentence.length > 2000) {
      return NextResponse.json<RehumanizeSentenceError>(
        { error: 'Sentence too long (max 2000 characters)' },
        { status: 400 },
      );
    }

    const strength = body.strength === 'medium' ? 'medium' : 'strong';
    const tone = resolveTone(body.tone).id;
    const threshold = clamp01(body.threshold ?? DEFAULT_THRESHOLD);
    const maxIterations = Math.max(1, Math.min(10, body.maxIterations ?? DEFAULT_MAX_ITERATIONS));

    const initial = scoreSentenceDeep(sentence);

    // Build the combined flagged-phrase list the targeted pass expects.
    // If the caller didn't provide any, fall back to the deep dictionary
    // output so we still target the real AI signals.
    const flaggedInput: string[] = [
      ...(Array.isArray(body.flaggedPhrases) ? body.flaggedPhrases : []),
      ...(Array.isArray(body.flaggedWords) ? body.flaggedWords : []),
      ...initial.flaggedPhrases,
      ...initial.flaggedWords,
    ].filter(p => typeof p === 'string' && p.trim().length > 0);

    let best = sentence;
    let bestReport = initial;
    let iterations = 0;

    for (let i = 0; i < maxIterations; i++) {
      iterations++;

      // Targeted pass — hits every flagged word/phrase
      let candidate = stealthHumanizeTargeted(best, flaggedInput, strength);

      // Aggressive forensic cleanup — detector-specific passes
      candidate = deepSignalClean(candidate, {
        aggressive: true,
        skipBurstiness: true,
        skipStarterStrip: false,
      });

      // Every 2nd iteration run a full Nuru 2.0 stealth pass on the sentence
      // to restructure rhythm when word swaps alone aren't enough.
      if (i % 2 === 1) {
        candidate = stealthHumanize(candidate, strength, tone, 3);
      }

      const candidateReport = scoreSentenceDeep(candidate);

      // Accept if strictly better than current best
      if (candidateReport.score < bestReport.score) {
        best = candidate;
        bestReport = candidateReport;
      }

      // Early exit if we are below the threshold
      if (bestReport.score <= threshold) break;
    }

    const response: RehumanizeSentenceSuccess = {
      success: true,
      humanized: best,
      initial,
      final: bestReport,
      iterations,
      best_score_pct: bestReport.scorePct,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('rehumanize-sentence API error:', error);
    return NextResponse.json<RehumanizeSentenceError>(
      { error: error instanceof Error ? error.message : 'Sentence rehumanization failed' },
      { status: 500 },
    );
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_THRESHOLD;
  return Math.max(0, Math.min(1, n));
}
