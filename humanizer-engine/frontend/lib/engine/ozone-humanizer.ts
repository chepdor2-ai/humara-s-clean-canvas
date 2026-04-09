/**
 * Ozone Humanizer Engine — Ozone API Proxy
 * Calls the external Ozone humanizer API.
 * Always uses "undetectable" mode for maximum bypass.
 * Supports sentence-by-sentence processing with paragraph/title preservation.
 */

const OZONE_API_URL = 'https://www.ozone3.site/api/humanize';

export interface OzoneResult {
  humanized: string;
  inputWords: number;
  outputWords: number;
  latencyMs: number;
  quotaUsed: number;
  quotaLimit: number;
  quotaRemaining: number;
}

/**
 * Split text into paragraphs, detect titles/headings, and split body
 * paragraphs into sentences — preserving structure for reassembly.
 */
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

      // Detect titles/headings: markdown headings, short lines without ending
      // punctuation, all-caps lines, numbered headings
      const isTitle =
        /^#{1,6}\s/.test(trimmed) ||
        /^[IVXLCDM]+\.\s/.test(trimmed) ||
        /^(?:Part|Section|Chapter|Abstract|Introduction|Conclusion|References|Bibliography|Appendix)\b/i.test(trimmed) ||
        (trimmed.length < 80 && !/[.!?:;]$/.test(trimmed) && /^[A-Z]/.test(trimmed) && !/[a-z]{3,}\s[a-z]{3,}\s[a-z]{3,}\s[a-z]{3,}\s[a-z]{3,}/.test(trimmed));

      if (isTitle) {
        segments.push({ type: 'title', text: trimmed, paragraphIndex: pIdx });
      } else {
        // Split into sentences
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

/**
 * Reassemble segments back into properly formatted text.
 */
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
      if (seg.type === 'title') {
        parts.push(seg.text);
      } else if (seg.type === 'sentence') {
        parts.push(seg.text);
      }
    }

    if (parts.length > 0) {
      // If first segment is a title, put it on its own line
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

/**
 * Call the Ozone API for a single piece of text.
 */
async function callOzoneAPI(text: string, apiKey: string): Promise<{ text: string; input_words: number; output_words: number; latency_ms: number; quota: { used: number; limit: number; remaining: number } }> {
  const response = await fetch(OZONE_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      mode: 'undetectable',
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: response.statusText }));
    const errMsg = errBody?.error || `HTTP ${response.status}`;
    throw new Error(`Ozone API error: ${errMsg}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(`Ozone API error: ${data.error || 'Unknown error'}`);
  }

  return data;
}

/**
 * Main entry: humanize text via Ozone API.
 * @param sentenceBySentence If true, processes each sentence independently while preserving titles and paragraph structure.
 */
export async function ozoneHumanize(
  text: string,
  sentenceBySentence: boolean = false,
): Promise<OzoneResult> {
  const apiKey = process.env.OZONE_API_KEY;
  if (!apiKey) {
    throw new Error('OZONE_API_KEY environment variable is not set');
  }

  if (!sentenceBySentence) {
    // Whole-paper mode: send entire text in one API call
    const data = await callOzoneAPI(text, apiKey);

    return {
      humanized: data.text,
      inputWords: data.input_words,
      outputWords: data.output_words,
      latencyMs: data.latency_ms,
      quotaUsed: data.quota?.used ?? 0,
      quotaLimit: data.quota?.limit ?? 0,
      quotaRemaining: data.quota?.remaining ?? 0,
    };
  }

  // Sentence-by-sentence mode: preserve titles and paragraph structure
  // Process all sentences CONCURRENTLY for speed
  const segments = segmentText(text);
  const sentenceSegments = segments.filter(seg => seg.type === 'sentence');

  // Fire all sentence API calls in parallel (batches of 10 to avoid rate limits)
  const BATCH_SIZE = 10;
  const results: { index: number; data: Awaited<ReturnType<typeof callOzoneAPI>> | null }[] = [];

  for (let batchStart = 0; batchStart < sentenceSegments.length; batchStart += BATCH_SIZE) {
    const batch = sentenceSegments.slice(batchStart, batchStart + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((seg, i) =>
        callOzoneAPI(seg.text, apiKey).then(data => ({ index: batchStart + i, data }))
      )
    );
    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        results.push(r.value);
      }
    }
  }

  // Apply results back to segments
  let totalInputWords = 0;
  let totalOutputWords = 0;
  let totalLatency = 0;
  let lastQuota = { used: 0, limit: 0, remaining: 0 };

  for (const r of results) {
    if (r.data) {
      sentenceSegments[r.index].text = r.data.text;
      totalInputWords += r.data.input_words;
      totalOutputWords += r.data.output_words;
      totalLatency += r.data.latency_ms;
      lastQuota = r.data.quota ?? lastQuota;
    }
  }

  const humanized = reassembleSegments(segments);

  return {
    humanized,
    inputWords: totalInputWords,
    outputWords: totalOutputWords,
    latencyMs: totalLatency,
    quotaUsed: lastQuota.used,
    quotaLimit: lastQuota.limit,
    quotaRemaining: lastQuota.remaining,
  };
}
