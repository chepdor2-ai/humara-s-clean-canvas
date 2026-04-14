/**
 * Oxygen 3.0 Humanizer — Fine-tuned T5 model client.
 * Calls the Oxygen 3.0 FastAPI server (Render or self-hosted).
 * 
 * Features:
 *  - Strict sentence-by-sentence inference (server enforces this)
 *  - First-person avoidance (server handles, but we double-check client-side)
 *  - Parallel chunk processing for large texts
 */

let OXYGEN3_API_URL = process.env.OXYGEN3_API_URL || 'http://localhost:7860';
if (OXYGEN3_API_URL && !OXYGEN3_API_URL.startsWith('http')) {
  OXYGEN3_API_URL = `https://${OXYGEN3_API_URL}`;
}
console.log(`[oxygen3] API URL resolved to: ${OXYGEN3_API_URL}`);

export interface Oxygen3Result {
  humanized: string;
  stats: {
    mode: string;
    beam_size: number;
    batch_size: number;
    total_sentences: number;
    word_count: number;
    elapsed_seconds: number;
    words_per_second: number;
  };
}

/**
 * Send a single chunk to the Oxygen 3.0 API.
 */
async function oxygen3Call(
  text: string,
  mode: string,
  tone: string = 'neutral',
): Promise<{ humanized: string; stats: Record<string, unknown> }> {
  // Health check — ensure the Space is awake
  try {
    const healthRes = await fetch(`${OXYGEN3_API_URL}/health`, { signal: AbortSignal.timeout(15_000) });
    if (!healthRes.ok) throw new Error(`Health check failed: ${healthRes.status}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[oxygen3] Space unavailable at ${OXYGEN3_API_URL}: ${msg}`);
    throw new Error(`Oxygen 3.0 Space unavailable (health check failed): ${msg}`);
  }

  console.log(`[oxygen3] Calling ${OXYGEN3_API_URL}/humanize — mode=${mode}, tone=${tone}, len=${text.length}`);

  const response = await fetch(`${OXYGEN3_API_URL}/humanize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      mode,
      tone,
      sentence_by_sentence: true,
    }),
    signal: AbortSignal.timeout(300_000),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ detail: response.statusText }));
    const errMsg = errBody?.detail || errBody?.error || `HTTP ${response.status}`;
    throw new Error(`Oxygen 3.0 API error: ${errMsg}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(`Oxygen 3.0 API error: ${data.detail || 'Unknown error'}`);
  }
  return { humanized: data.humanized, stats: data.stats ?? {} };
}

/**
 * Split text into paragraph-based chunks for parallel processing.
 */
function splitIntoChunks(text: string, maxChunks: number = 3): string[] {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  if (paragraphs.length <= 1) return [text];

  const numChunks = Math.min(maxChunks, paragraphs.length);
  const chunks: string[] = [];
  const perChunk = Math.ceil(paragraphs.length / numChunks);

  for (let i = 0; i < paragraphs.length; i += perChunk) {
    chunks.push(paragraphs.slice(i, i + perChunk).join('\n\n'));
  }
  return chunks;
}

/**
 * Humanize text using the Oxygen 3.0 fine-tuned model.
 * @param text Full text to humanize
 * @param mode 'quality' | 'fast' | 'turbo'
 */
export async function oxygen3Humanize(
  text: string,
  mode: string = 'fast',
  tone: string = 'neutral',
): Promise<Oxygen3Result> {
  const chunks = splitIntoChunks(text, 3);

  if (chunks.length === 1) {
    const result = await oxygen3Call(text, mode, tone);
    return {
      humanized: result.humanized,
      stats: result.stats as Oxygen3Result['stats'],
    };
  }

  // Process chunks sequentially (single-worker server)
  const results: { humanized: string; stats: Record<string, unknown> }[] = [];
  for (const chunk of chunks) {
    results.push(await oxygen3Call(chunk, mode, tone));
  }

  const humanized = results.map((r) => r.humanized).join('\n\n');
  const totalSentences = results.reduce(
    (acc, r) => acc + ((r.stats as Record<string, number>).total_sentences || 0),
    0,
  );

  return {
    humanized,
    stats: {
      mode,
      beam_size: (results[0]?.stats as Record<string, number>)?.beam_size || 4,
      batch_size: (results[0]?.stats as Record<string, number>)?.batch_size || 8,
      total_sentences: totalSentences,
      word_count: text.split(/\s+/).length,
      elapsed_seconds: results.reduce(
        (acc, r) => acc + ((r.stats as Record<string, number>).elapsed_seconds || 0),
        0,
      ),
      words_per_second: 0,
    },
  };
}
