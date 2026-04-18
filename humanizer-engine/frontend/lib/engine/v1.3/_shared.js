// Shared utilities for OpenAI API proxy endpoints

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.LLM_MODEL ?? 'gpt-4o-mini';
const OPENAI_FALLBACK_MODEL = 'gpt-4.1-nano';

export function getOpenAIKey() {
  return process.env.OPENAI_API_KEY || '';
}

export async function openaiChat(messages, options = {}) {
  const key = getOpenAIKey();

  if (!key) {
    return {
      ok: false,
      status: 500,
      payload: { error: 'OPENAI_API_KEY is not configured on the server.' },
    };
  }

  const primaryModel = options.model ?? OPENAI_MODEL;
  const fallbackModel = options.fallbackModel ?? OPENAI_FALLBACK_MODEL;
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.max_tokens ?? 2048;

  // Try primary model first
  let result = await callChatCompletion(key, {
    model: primaryModel,
    messages,
    temperature,
    max_tokens: maxTokens,
  });

  // Fallback to gpt-4.1-nano on rate-limit or model unavailability
  if (!result.ok && (result.status === 429 || result.status === 404 || result.status === 503)) {
    result = await callChatCompletion(key, {
      model: fallbackModel,
      messages,
      temperature,
      max_tokens: maxTokens,
    });
  }

  return result;
}

async function callChatCompletion(key, body) {
  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({
      error: 'Invalid OpenAI response.',
    }));

    return {
      ok: response.ok,
      status: response.status,
      payload,
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      payload: { error: err.message || 'Network error calling OpenAI.' },
    };
  }
}

export function rejectMethod(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  return res.status(405).json({ error: `Method not allowed. Use ${allowed.join(', ')}.` });
}

export function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
