// Shared utilities for OpenAI API proxy endpoints

const OPENAI_BASE = 'https://api.openai.com/v1';

export function getOpenAIKey() {
  return process.env.OPENAI_API_KEY || '';
}

export async function openaiChat(messages, options = {}) {
  const key = getOpenAIKey();

  if (!key) {
    return {
      ok: false,
      status: 500,
      payload: { error: 'OpenAI API key is not configured on the server.' },
    };
  }

  const model = options.model || 'gpt-4o';
  const fallbackModel = options.fallbackModel || 'gpt-4o-mini';
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.max_tokens ?? 2048;

  // Try primary model first
  let result = await callChatCompletion(key, {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  });

  // Fallback to cheaper model on rate-limit or model unavailability
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
    const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
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
