export interface VendorDetectorConfig {
  gptzeroApiKey?: string;
  originalityApiKey?: string;
  timeoutMs?: number;
}

export interface VendorDetectorScores {
  gptzero?: number;
  originality_ai?: number;
}

function timeoutSignal(timeoutMs: number): AbortSignal | undefined {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }
  return undefined;
}

async function readJson<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T | null> {
  try {
    const response = await fetch(url, { ...init, signal: timeoutSignal(timeoutMs) });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

export async function fetchVendorDetectorScores(
  text: string,
  config: VendorDetectorConfig,
): Promise<VendorDetectorScores> {
  const timeoutMs = config.timeoutMs ?? 4500;
  const scores: VendorDetectorScores = {};

  if (config.gptzeroApiKey) {
    const data = await readJson<{ documents?: Array<{ completely_generated_prob?: number }> }>(
      "https://api.gptzero.me/v2/predict/text",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.gptzeroApiKey,
        },
        body: JSON.stringify({ document: text }),
      },
      timeoutMs,
    );
    const score = data?.documents?.[0]?.completely_generated_prob;
    if (typeof score === "number") {
      scores.gptzero = Math.max(0, Math.min(100, score * 100));
    }
  }

  if (config.originalityApiKey) {
    const data = await readJson<{ score?: { ai?: number } }>(
      "https://api.originality.ai/api/v1/scan/ai",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.originalityApiKey}`,
        },
        body: JSON.stringify({ content: text }),
      },
      timeoutMs,
    );
    const score = data?.score?.ai;
    if (typeof score === "number") {
      scores.originality_ai = Math.max(0, Math.min(100, score * 100));
    }
  }

  return scores;
}