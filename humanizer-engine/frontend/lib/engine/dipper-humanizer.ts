/**
 * DIPPER Humanizer Engine — HuggingFace Space API Proxy
 * Calls our deployed DIPPER 1B paraphraser (SamSJackson/paraphrase-dipper-no-ctx).
 * Controls: lexical diversity (word changes) and order diversity (structural changes).
 * Supports sentence-by-sentence processing with paragraph/title preservation.
 */

const DIPPER_SPACE_URL = 'https://maguna956-dipper-paraphraser.hf.space';
const GRADIO_API = `${DIPPER_SPACE_URL}/gradio_api/call/paraphrase`;

export interface DipperResult {
  humanized: string;
  inputWords: number;
  outputWords: number;
  latencyMs: number;
}

/** Map strength to DIPPER lexical/order diversity values (0-100, multiples of 20) */
function mapStrengthToDiversity(strength: string): { lex: number; order: number } {
  switch (strength) {
    case 'light':  return { lex: 40, order: 0 };
    case 'strong': return { lex: 80, order: 40 };
    case 'medium':
    default:       return { lex: 60, order: 20 };
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
      if (seg.type === 'title') {
        parts.push(seg.text);
      } else if (seg.type === 'sentence') {
        parts.push(seg.text);
      }
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

/**
 * Call the DIPPER Gradio API for a single piece of text.
 * Uses the standard Gradio submit → SSE polling pattern.
 */
async function callDipperAPI(text: string, lex: number, order: number): Promise<string> {
  // Step 1: Submit the job
  const submitResp = await fetch(GRADIO_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [text, lex, order] }),
    signal: AbortSignal.timeout(30000),
  });

  if (!submitResp.ok) {
    throw new Error(`DIPPER API submit error: HTTP ${submitResp.status}`);
  }

  const { event_id } = await submitResp.json();
  if (!event_id) {
    throw new Error('DIPPER API: No event_id returned');
  }

  // Step 2: Poll for result via SSE
  const resultResp = await fetch(`${GRADIO_API}/${event_id}`, {
    signal: AbortSignal.timeout(180000), // 3 min timeout for CPU inference
  });

  if (!resultResp.ok) {
    throw new Error(`DIPPER API result error: HTTP ${resultResp.status}`);
  }

  const sseText = await resultResp.text();

  // Parse SSE response — look for "event: complete" followed by data
  const lines = sseText.split('\n');
  let foundComplete = false;
  for (const line of lines) {
    if (line.startsWith('event: complete')) {
      foundComplete = true;
      continue;
    }
    if (foundComplete && line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      // Gradio returns [output_text] array
      if (Array.isArray(data) && data.length > 0) {
        return data[0];
      }
    }
    if (line.startsWith('event: error')) {
      throw new Error('DIPPER API: GPU processing error (model may be loading, retry in 60s)');
    }
  }

  throw new Error('DIPPER API: No valid result in SSE response');
}

/**
 * Main entry: humanize text via DIPPER paraphraser.
 * @param sentenceBySentence If true, processes each sentence independently.
 */
export async function dipperHumanize(
  text: string,
  strength: string = 'medium',
  sentenceBySentence: boolean = false,
): Promise<DipperResult> {
  const { lex, order } = mapStrengthToDiversity(strength);
  const startTime = Date.now();
  const inputWords = text.trim().split(/\s+/).length;

  if (!sentenceBySentence) {
    // Whole-text mode
    const result = await callDipperAPI(text, lex, order);
    return {
      humanized: result,
      inputWords,
      outputWords: result.trim().split(/\s+/).length,
      latencyMs: Date.now() - startTime,
    };
  }

  // Sentence-by-sentence mode
  const segments = segmentText(text);
  const sentenceSegments = segments.filter(seg => seg.type === 'sentence');

  // Process in batches of 5 (CPU inference is slow, don't overwhelm)
  const BATCH_SIZE = 5;
  for (let batchStart = 0; batchStart < sentenceSegments.length; batchStart += BATCH_SIZE) {
    const batch = sentenceSegments.slice(batchStart, batchStart + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((seg, i) =>
        callDipperAPI(seg.text, lex, order).then(result => ({ index: batchStart + i, result }))
      )
    );
    for (const r of batchResults) {
      if (r.status === 'fulfilled' && r.value.result) {
        sentenceSegments[r.value.index].text = r.value.result;
      }
    }
  }

  const humanized = reassembleSegments(segments);

  return {
    humanized,
    inputWords,
    outputWords: humanized.trim().split(/\s+/).length,
    latencyMs: Date.now() - startTime,
  };
}
