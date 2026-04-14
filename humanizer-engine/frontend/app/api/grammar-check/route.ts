import { NextRequest, NextResponse } from 'next/server';

/**
 * Grammar Check API — proxy to the Python grammar backend.
 * Translates the backend response into the shape the frontend expects.
 */

const BACKEND_URL = process.env.GRAMMAR_BACKEND_URL || 'http://127.0.0.1:8000';

interface BackendEdit {
  type: string;
  original: string;
  corrected: string;
  char_offset_start: number;
  char_offset_end: number;
  confidence: number;
  applied: boolean;
  reason?: string | null;
  source: string;
  rule_id?: string | null;
}

interface BackendSentence {
  index: number;
  paragraph_index: number;
  char_offset_start: number;
  char_offset_end: number;
  original: string;
  corrected: string;
  edits: BackendEdit[];
  verdict: string;
  confidence: number;
  scoring_signals?: Record<string, unknown> | null;
}

interface BackendResponse {
  request_id: string;
  engine_version: string;
  corrected_text: string;
  sentences: BackendSentence[];
  total_edits: number;
  applied_edits: number;
  rejected_edit_count: number;
  warnings: string[];
  ml_used: boolean;
  ml_available: boolean;
  processing_time_ms: number;
  timings: Record<string, number>;
  rules_version: string;
  domain: string;
}

function mapSeverity(editType: string): 'error' | 'warning' | 'style' {
  switch (editType) {
    case 'agreement':
    case 'grammar':
    case 'tense':
    case 'preposition':
      return 'error';
    case 'punctuation':
    case 'capitalization':
    case 'article':
      return 'warning';
    case 'spacing':
    case 'style':
      return 'style';
    default:
      return 'warning';
  }
}

function mapCategory(editType: string): string {
  switch (editType) {
    case 'agreement':
    case 'grammar':
    case 'tense':
      return 'Grammar';
    case 'punctuation':
      return 'Punctuation';
    case 'capitalization':
      return 'Capitalization';
    case 'article':
      return 'Articles';
    case 'spacing':
      return 'Spacing';
    case 'preposition':
      return 'Word Choice';
    default:
      return 'Grammar';
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, domain = 'general' } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    let backendRes: Response;
    try {
      backendRes = await fetch(`${BACKEND_URL}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          domain,
          mode: 'standard',
          preserve_citations: true,
          preserve_quotes: true,
        }),
        signal: controller.signal,
      });
    } catch (fetchErr: unknown) {
      const msg = fetchErr instanceof Error ? fetchErr.message : 'Unknown error';
      return NextResponse.json(
        { error: 'Grammar backend unreachable', detail: msg },
        { status: 502 },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!backendRes.ok) {
      const detail = await backendRes.text().catch(() => 'Unknown backend error');
      return NextResponse.json(
        { error: 'Backend error', detail },
        { status: backendRes.status },
      );
    }

    const data: BackendResponse = await backendRes.json();

    // Map backend edits into frontend Issue format
    const issues: Array<{
      ruleId: string;
      message: string;
      severity: string;
      start: number;
      end: number;
      replacements: string[];
      confidence: number;
      category: string;
      sentenceIndex: number;
      source: string;
      verdict: string;
    }> = [];

    for (const sentence of data.sentences) {
      for (const edit of sentence.edits) {
        if (!edit.applied) continue;

        // Convert sentence-local offsets to document-level offsets
        const docStart = sentence.char_offset_start + edit.char_offset_start;
        const docEnd = sentence.char_offset_start + edit.char_offset_end;

        issues.push({
          ruleId: edit.rule_id || `backend_${edit.type}`,
          message: `${edit.type}: "${edit.original}" → "${edit.corrected}"`,
          severity: mapSeverity(edit.type),
          start: docStart,
          end: docEnd,
          replacements: edit.corrected !== edit.original ? [edit.corrected] : [],
          confidence: edit.confidence,
          category: mapCategory(edit.type),
          sentenceIndex: sentence.index,
          source: edit.source,
          verdict: sentence.verdict,
        });
      }
    }

    // Sort by position
    issues.sort((a, b) => a.start - b.start);

    return NextResponse.json({
      issues,
      corrected_text: data.corrected_text,
      stats: {
        total_edits: data.total_edits,
        applied_edits: data.applied_edits,
        rejected: data.rejected_edit_count,
        sentences: data.sentences.length,
      },
      meta: {
        request_id: data.request_id,
        engine_version: data.engine_version,
        ml_used: data.ml_used,
        ml_available: data.ml_available,
        processing_time_ms: data.processing_time_ms,
        rules_version: data.rules_version,
        domain: data.domain,
        timings: data.timings,
      },
      sentences: data.sentences.map(s => ({
        index: s.index,
        original: s.original,
        corrected: s.corrected,
        verdict: s.verdict,
        confidence: s.confidence,
        scoring_signals: s.scoring_signals,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Grammar check failed', detail: message },
      { status: 500 },
    );
  }
}

/** Health check — GET returns backend status */
export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return NextResponse.json({ status: 'unhealthy' }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json({ status: 'ok', backend: data });
  } catch {
    return NextResponse.json(
      { status: 'offline', message: 'Grammar backend not reachable' },
      { status: 502 },
    );
  }
}
