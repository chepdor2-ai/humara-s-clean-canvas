/**
 * Oxygen 3.0 Humanizer — Fine-tuned T5 model client.
 * Calls the Oxygen 3.0 FastAPI server (Render or self-hosted).
 * 
 * Features:
 *  - Strict sentence-by-sentence inference (server enforces this)
 *  - First-person avoidance (server handles, but we double-check client-side)
 *  - Parallel chunk processing for large texts
 */

const OXYGEN3_API_URL = process.env.OXYGEN3_API_URL || 'http://localhost:7860';

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
): Promise<{ humanized: string; stats: Record<string, unknown> }> {
  // Health check
  try {
    const healthRes = await fetch(`${OXYGEN3_API_URL}/health`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!healthRes.ok) throw new Error(`Health check failed: ${healthRes.status}`);
  } catch (err) {
    throw new Error(
      `Oxygen 3.0 server unavailable: ${err instanceof Error ? err.message : err}`,
    );
  }

  const response = await fetch(`${OXYGEN3_API_URL}/humanize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      mode,
      sentence_by_sentence: true,
    }),
    signal: AbortSignal.timeout(120_000),
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
): Promise<Oxygen3Result> {
  const chunks = splitIntoChunks(text, 3);

  if (chunks.length === 1) {
    const result = await oxygen3Call(text, mode);
    return {
      humanized: result.humanized,
      stats: result.stats as Oxygen3Result['stats'],
    };
  }

  // Process chunks sequentially (single-worker server)
  const results: { humanized: string; stats: Record<string, unknown> }[] = [];
  for (const chunk of chunks) {
    results.push(await oxygen3Call(chunk, mode));
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
