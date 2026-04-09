/**
 * Easy Humanizer Engine — EssayWritingSupport API Proxy
 * Calls the external EssayWritingSupport humanizer API.
 * Instant processing (<50ms), no LLM dependency.
 * Supports sentence-by-sentence concurrent processing.
 */

const EASY_API_BASE = 'https://www.essaywritingsupport.com/api/v1';

// Map internal strength to API aggressiveness (1–10)
function mapAggressiveness(strength: string): number {
  switch (strength) {
    case 'light': return 3;
    case 'strong': return 8;
    case 'medium':
    default: return 5;
  }
}

// Map internal tone to API style
function mapStyle(tone: string): 'academic' | 'professional' | 'casual' {
  switch (tone) {
    case 'academic': return 'academic';
    case 'professional': return 'professional';
    case 'simple':
    case 'neutral':
    case 'casual': return 'casual';
    default: return 'academic';
  }
}

interface TextSegment {
  type: 'title' | 'sentence' | 'blank';
  text: string;
  paragraphIndex: number;
}

function segmentText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const paragraphs = text.split(/\n\n+/);

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx];
    if (!para.trim()) {
      segments.push({ type: 'blank', text: '', paragraphIndex: pIdx });
      continue;
    }

    const lines = para.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const isTitle =
        /^#{1,6}\s/.test(trimmed) ||
        /^[IVXLCDM]+\.\s/.test(trimmed) ||
        /^(?:Part|Section|Chapter|Abstract|Introduction|Conclusion|References|Bibliography|Appendix)\b/i.test(trimmed) ||
        (trimmed.length < 80 && !/[.!?:;]$/.test(trimmed) && /^[A-Z]/.test(trimmed) && !/[a-z]{3,}\s[a-z]{3,}\s[a-z]{3,}\s[a-z]{3,}\s[a-z]{3,}/.test(trimmed));

      if (isTitle) {
        segments.push({ type: 'title', text: trimmed, paragraphIndex: pIdx });
      } else {
        const sentences = trimmed.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [trimmed];
        for (const sent of sentences) {
          const s = sent.trim();
          if (s) segments.push({ type: 'sentence', text: s, paragraphIndex: pIdx });
        }
      }
    }
  }

  return segments;
}

function reassembleSegments(segments: TextSegment[]): string {
  const paragraphGroups: Map<number, TextSegment[]> = new Map();
  for (const seg of segments) {
    if (!paragraphGroups.has(seg.paragraphIndex)) {
      paragraphGroups.set(seg.paragraphIndex, []);
    }
    paragraphGroups.get(seg.paragraphIndex)!.push(seg);
  }

  const paragraphs: string[] = [];
  const sortedKeys = [...paragraphGroups.keys()].sort((a, b) => a - b);

  for (const key of sortedKeys) {
    const segs = paragraphGroups.get(key)!;
    const parts: string[] = [];
    for (const seg of segs) {
      if (seg.type === 'title' || seg.type === 'sentence') parts.push(seg.text);
    }
    if (parts.length > 0) {
      if (segs[0].type === 'title' && segs.length > 1) {
        paragraphs.push(parts[0] + '\n' + parts.slice(1).join(' '));
      } else if (segs[0].type === 'title') {
        paragraphs.push(parts[0]);
      } else {
        paragraphs.push(parts.join(' '));
      }
    }
  }

  return paragraphs.join('\n\n');
}

export interface EasyResult {
  humanized: string;
  inputWords: number;
  outputWords: number;
  processingTimeMs: number;
  plan: string;
  quotaUsed: number;
  quotaLimit: number;
}

/**
 * Call the Easy API for a single piece of text.
 */
async function callEasyAPI(text: string, apiKey: string, strength: string, tone: string) {
  const response = await fetch(`${EASY_API_BASE}/humanize`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      style: mapStyle(tone),
      aggressiveness: mapAggressiveness(strength),
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: { message: response.statusText } }));
    const errMsg = errBody?.error?.message || `HTTP ${response.status}`;
    const errCode = errBody?.error?.code || 'UNKNOWN';
    throw new Error(`Easy API error [${errCode}]: ${errMsg}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(`Easy API error: ${data.error?.message || 'Unknown error'}`);
  }

  return data;
}

export async function easyHumanize(
  text: string,
  strength: string,
  tone: string,
  sentenceBySentence: boolean = false,
): Promise<EasyResult> {
  const apiKey = process.env.EASY_API_KEY;
  if (!apiKey) {
    throw new Error('EASY_API_KEY environment variable is not set');
  }

  if (!sentenceBySentence) {
    // Whole-paper mode: single API call
    const data = await callEasyAPI(text, apiKey, strength, tone);

    return {
      humanized: data.data.output,
      inputWords: data.data.input_words,
      outputWords: data.data.output_words,
      processingTimeMs: data.meta?.processing_time_ms ?? 0,
      plan: data.meta?.plan ?? 'unknown',
      quotaUsed: data.meta?.quota_used ?? 0,
      quotaLimit: data.meta?.quota_limit ?? 0,
    };
  }

  // Sentence-by-sentence mode: concurrent processing, preserving titles/paragraphs
  const segments = segmentText(text);
  const sentenceSegments = segments.filter(seg => seg.type === 'sentence');

  const BATCH_SIZE = 10;
  const results: { index: number; data: { data: { output: string; input_words: number; output_words: number }; meta?: { processing_time_ms?: number; plan?: string; quota_used?: number; quota_limit?: number } } | null }[] = [];

  for (let batchStart = 0; batchStart < sentenceSegments.length; batchStart += BATCH_SIZE) {
    const batch = sentenceSegments.slice(batchStart, batchStart + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((seg, i) =>
        callEasyAPI(seg.text, apiKey, strength, tone).then(data => ({ index: batchStart + i, data }))
      )
    );
    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        results.push(r.value);
      }
    }
  }

  let totalInputWords = 0;
  let totalOutputWords = 0;
  let totalProcessingTime = 0;

  for (const r of results) {
    if (r.data) {
      sentenceSegments[r.index].text = r.data.data.output;
      totalInputWords += r.data.data.input_words;
      totalOutputWords += r.data.data.output_words;
      totalProcessingTime += r.data.meta?.processing_time_ms ?? 0;
    }
  }

  const humanized = reassembleSegments(segments);

  return {
    humanized,
    inputWords: totalInputWords,
    outputWords: totalOutputWords,
    processingTimeMs: totalProcessingTime,
    plan: 'unknown',
    quotaUsed: 0,
    quotaLimit: 0,
  };
}
