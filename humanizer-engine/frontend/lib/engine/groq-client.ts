import OpenAI from 'openai';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const DEFAULT_GROQ_CHAT_MODEL = 'llama-3.3-70b-versatile';
export const DEFAULT_GROQ_SMALL_MODEL = 'llama-3.1-8b-instant';

const OPENAI_MODEL_RE = /^(?:gpt-|o\d|text-embedding|whisper-|tts-|dall-e)/i;

let groqClient: OpenAI | null = null;

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function hasGroqApiKey(): boolean {
  return Boolean(readEnv('GROQ_API_KEY'));
}

export function getGroqApiKey(): string {
  const apiKey = readEnv('GROQ_API_KEY');
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not set.');
  }
  return apiKey;
}

export function resolveGroqChatModel(
  preferred?: string | null,
  fallback = DEFAULT_GROQ_CHAT_MODEL,
): string {
  const candidate = preferred?.trim() || readEnv('GROQ_MODEL') || readEnv('LLM_MODEL') || fallback;
  return OPENAI_MODEL_RE.test(candidate) ? fallback : candidate;
}

export function getGroqClient(): OpenAI {
  if (groqClient) {
    return groqClient;
  }

  groqClient = new OpenAI({
    apiKey: getGroqApiKey(),
    baseURL: GROQ_BASE_URL,
  });

  return groqClient;
}