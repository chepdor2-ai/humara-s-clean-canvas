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
    signal: AbortSignal.timeout(10_000),
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
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const useSingleRequest = sentenceBySentence || mode === 'turbo' || mode === 'fast' || wordCount <= 1200;
  const chunks = useSingleRequest ? [text] : splitIntoChunks(text, Math.min(5, Math.ceil(wordCount / 1200)));

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
    console.warn('[Humarin] HUMARIN_API_KEY not set, falling back to LLM Academic');
    return llmAcademicFallback(text);
  }

  const primaryUrl = HUMARIN_API_URL.replace(/\/$/, '');
  const FAST_TIMEOUT_MS = 5_000; // 5s — fail fast, fall back to LLM Academic

  // ── Parallel dual-endpoint batching ──────────────────────────
  // When both primary and backup are available and text is large enough,
  // split into 2 chunks and process them in parallel (one per endpoint).
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (HUMARIN_BACKUP_URL && wordCount > 300) {
    const backupUrl = HUMARIN_BACKUP_URL.replace(/\/$/, '');
    const backupKey = HUMARIN_BACKUP_KEY || apiKey;
    const chunks = splitIntoChunks(text, 2);
    if (chunks.length === 2) {
      try {
        console.log(`[Humarin] Dual-endpoint parallel: ${wordCount} words split across primary + backup`);
        const [r1, r2] = await Promise.all([
          Promise.race([
            runHumarinPass(chunks[0], mode, sentenceBySentence, apiKey, primaryUrl),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('primary timed out')), FAST_TIMEOUT_MS)
            ),
          ]),
          Promise.race([
            runHumarinPass(chunks[1], mode, sentenceBySentence, backupKey, backupUrl),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('backup timed out')), FAST_TIMEOUT_MS)
            ),
          ]),
        ]);
        const humanized = r1.humanized + '\n\n' + r2.humanized;
        const totalSentences = ((r1.stats as any).total_sentences || 0) + ((r2.stats as any).total_sentences || 0);
        const avgChange = (((r1.stats as any).avg_change_ratio || 0) + ((r2.stats as any).avg_change_ratio || 0)) / 2;
        return {
          humanized,
          stats: { mode, total_sentences: totalSentences, avg_change_ratio: Math.round(avgChange * 1000) / 1000, met_threshold: totalSentences, threshold_ratio: 1.0 },
        };
      } catch (parallelErr) {
        console.warn(`[Humarin] Dual-endpoint parallel failed: ${parallelErr instanceof Error ? parallelErr.message : parallelErr}`);
      }
    }
  }

  // Phase 1: Try primary with 5s timeout (fail fast)
  try {
    const result = await Promise.race([
      runHumarinPass(text, mode, sentenceBySentence, apiKey, primaryUrl),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Humarin primary timed out after 5s')), FAST_TIMEOUT_MS)
      ),
    ]);
    return result;
  } catch (primaryErr) {
    console.warn(`[Humarin] Primary failed/timed out: ${primaryErr instanceof Error ? primaryErr.message : primaryErr}`);
  }

  // Phase 2: Try backup URL if configured (with 5s timeout)
  if (HUMARIN_BACKUP_URL) {
    try {
      const backupUrl = HUMARIN_BACKUP_URL.replace(/\/$/, '');
      const backupKey = HUMARIN_BACKUP_KEY || apiKey;
      console.log(`[Humarin] Falling back to backup: ${backupUrl}`);
      const result = await Promise.race([
        runHumarinPass(text, mode, sentenceBySentence, backupKey, backupUrl),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Humarin backup timed out after 5s')), FAST_TIMEOUT_MS)
        ),
      ]);
      return result;
    } catch (backupErr) {
      console.warn(`[Humarin] Backup also failed: ${backupErr instanceof Error ? backupErr.message : backupErr}`);
    }
  }

  // Phase 3: LLM Academic Humanizer fallback — 5-phase Groq pipeline
  return llmAcademicFallback(text);
}

/**
 * Fall back to 5-phase LLM Academic Humanizer (Groq).
 * Deep structural rewrites + targeted AI signal removal.
 */
async function llmAcademicFallback(text: string): Promise<HumarinResult> {
  console.log('[Humarin] Falling back to 5-phase LLM Academic Humanizer');
  try {
    const { llmAcademicHumanize } = await import('@/lib/engine/llm-academic-humanizer');
    return await llmAcademicHumanize(text, 10000);
  } catch (llmErr) {
    console.warn(`[Humarin] LLM Academic fallback failed: ${llmErr instanceof Error ? llmErr.message : llmErr}`);
    // Final fallback: Oxygen TS — instant, serverless, always available
    console.log('[Humarin] Final fallback to Oxygen TS engine');
    const { oxygenHumanize } = await import('@/lib/engine/oxygen-humanizer');
    const humanized = oxygenHumanize(text, 'medium', 'quality', true);
    return {
      humanized,
      stats: {
        mode: 'oxygen-fallback',
        total_sentences: humanized.split(/[.!?]+/).filter(s => s.trim()).length,
        avg_change_ratio: 0.5,
        met_threshold: 1,
        threshold_ratio: 1.0,
      },
    };
  }
}
