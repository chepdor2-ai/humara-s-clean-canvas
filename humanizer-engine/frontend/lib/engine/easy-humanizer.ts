/**
 * Easy Humanizer Engine — EssayWritingSupport API Proxy
 * Calls the external EssayWritingSupport humanizer API.
 * Instant processing (<50ms), no LLM dependency.
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

export interface EasyResult {
  humanized: string;
  inputWords: number;
  outputWords: number;
  processingTimeMs: number;
  plan: string;
  quotaUsed: number;
  quotaLimit: number;
}

export async function easyHumanize(
  text: string,
  strength: string,
  tone: string,
): Promise<EasyResult> {
  const apiKey = process.env.EASY_API_KEY;
  if (!apiKey) {
    throw new Error('EASY_API_KEY environment variable is not set');
  }

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
