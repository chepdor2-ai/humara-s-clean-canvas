/**
 * Humarin Humanizer Engine — ChatGPT-trained T5-base paraphraser.
 * Calls the HF Space running humarin/chatgpt_paraphraser_on_T5_base (222M params).
 * Same API shape as t5-humanizer.ts — Bearer auth, /humanize POST, JSON response.
 * Falls back to Cloud Run backup if primary HF Space is down.
 */

const HUMARIN_API_URL = process.env.HUMARIN_API_URL || 'https://maguna956-humarin-paraphraser.hf.space';
const HUMARIN_BACKUP_URL = process.env.HUMARIN_API_URL_BACKUP || '';
const HUMARIN_BACKUP_KEY = process.env.HUMARIN_API_KEY_BACKUP || '';

export interface HumarinResult {
  humanized: string;
  stats: {
    mode: string;
    total_sentences: number;
    avg_change_ratio: number;
    met_threshold: number;
    threshold_ratio: number;
  };
}

/**
 * Send a single chunk to the Humarin API.
 */
async function humarinCall(
  text: string,
  mode: string,
  sentenceBySentence: boolean,
  apiKey: string,
  url: string,
): Promise<{ humanized: string; stats: Record<string, unknown> }> {
  // Pre-flight: verify the Space is awake and not stuck processing
  try {
    const healthRes = await fetch(`${url}/health`, { signal: AbortSignal.timeout(10_000) });
    if (!healthRes.ok) throw new Error(`Health check failed: ${healthRes.status}`);
  } catch (err) {
    throw new Error(`Humarin Space unavailable (health check failed): ${err instanceof Error ? err.message : err}`);
  }

  const response = await fetch(`${url}/humanize`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      mode,
      sentence_by_sentence: sentenceBySentence,
      min_change_ratio: 0.40,
      max_retries: mode === 'turbo' ? 1 : mode === 'fast' ? 2 : 5,
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ detail: response.statusText }));
    const errMsg = errBody?.detail || errBody?.error || `HTTP ${response.status}`;
    throw new Error(`Humarin API error: ${errMsg}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(`Humarin API error: ${data.detail || 'Unknown error'}`);
  }
  return { humanized: data.humanized, stats: data.stats ?? {} };
}

/**
 * Split text into paragraph-based chunks for parallel processing.
 */
function splitIntoChunks(text: string, maxChunks: number = 3): string[] {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
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
 * Run a full Humarin pass against a single endpoint.
 */
async function runHumarinPass(
  text: string,
  mode: string,
  sentenceBySentence: boolean,
  apiKey: string,
  url: string,
): Promise<HumarinResult> {
  const chunks = splitIntoChunks(text, 3);

  if (chunks.length === 1) {
    const result = await humarinCall(text, mode, sentenceBySentence, apiKey, url);
    return { humanized: result.humanized, stats: result.stats as HumarinResult['stats'] };
  }

  // Process chunks sequentially — free-tier HF Spaces have a single worker
  // and reject concurrent requests with "Already borrowed" errors.
  const results: { humanized: string; stats: Record<string, unknown> }[] = [];
  for (const chunk of chunks) {
    results.push(await humarinCall(chunk, mode, sentenceBySentence, apiKey, url));
  }

  const humanized = results.map(r => r.humanized).join('\n\n');
  const totalSentences = results.reduce((acc, r) => acc + ((r.stats as Record<string, number>).total_sentences || 0), 0);
  const avgChange = results.reduce((acc, r) => acc + ((r.stats as Record<string, number>).avg_change_ratio || 0), 0) / results.length;
  const metThreshold = results.reduce((acc, r) => acc + ((r.stats as Record<string, number>).met_threshold || 0), 0);

  return {
    humanized,
    stats: {
      mode,
      total_sentences: totalSentences,
      avg_change_ratio: Math.round(avgChange * 1000) / 1000,
      met_threshold: metThreshold,
      threshold_ratio: Math.round((metThreshold / Math.max(totalSentences, 1)) * 1000) / 1000,
    },
  };
}

/**
 * Call the Humarin humanizer API with parallel chunk processing.
 * Automatically falls back to Cloud Run backup if primary HF Space is down.
 * @param text Full text to humanize
 * @param mode 'quality' | 'fast' | 'aggressive' | 'turbo'
 * @param sentenceBySentence Server processes each sentence independently (default true)
 */
export async function humarinHumanize(
  text: string,
  mode: string = 'quality',
  sentenceBySentence: boolean = true,
): Promise<HumarinResult> {
  const apiKey = process.env.HUMARIN_API_KEY;
  if (!apiKey) {
    throw new Error('HUMARIN_API_KEY environment variable is not set');
  }

  const primaryUrl = HUMARIN_API_URL.replace(/\/$/, '');

  // If backup is configured, race primary against 20s timeout and failover    
  if (HUMARIN_BACKUP_URL) {
    const FAILOVER_TIMEOUT_MS = 20_000;
    try {
      const result = await Promise.race([
        runHumarinPass(text, mode, sentenceBySentence, apiKey, primaryUrl),    
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Humarin primary timed out after 20s')), FAILOVER_TIMEOUT_MS)
        ),
      ]);
      return result;
    } catch (primaryErr) {
      console.warn(`[Humarin] Primary failed/timed out, switching to backup: ${primaryErr instanceof Error ? primaryErr.message : primaryErr}`);
      const backupUrl = HUMARIN_BACKUP_URL.replace(/\/$/, '');
      const backupKey = HUMARIN_BACKUP_KEY || apiKey;
      console.log(`[Humarin] Falling back to backup: ${backupUrl}`);
      return await runHumarinPass(text, mode, sentenceBySentence, backupKey, backupUrl);
    }
  }

  // No backup configured — run primary normally (no timeout race)
  return await runHumarinPass(text, mode, sentenceBySentence, apiKey, primaryUrl);
}
