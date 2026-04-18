/**
 * V1.1 LLM Service
 * ==================
 * Optional LLM wrapper for chunk rewriting.
 * Only called in Phase 4 for sentences scoring > 0.4.
 * Falls back to rule-based rewrite when Groq is unavailable.
 */

import {
  DEFAULT_GROQ_SMALL_MODEL,
  getGroqClient,
  hasGroqApiKey,
  resolveGroqChatModel,
} from '../../groq-client';

const LLM_MODEL = resolveGroqChatModel(process.env.LLM_MODEL, DEFAULT_GROQ_SMALL_MODEL);

/**
 * Check whether LLM is available (API key present).
 */
export function isLLMAvailable(): boolean {
  return hasGroqApiKey();
}

/**
 * Call the LLM with a system + user prompt.
 */
async function llmCall(system: string, user: string, temperature: number, maxTokens?: number): Promise<string> {
  if (!hasGroqApiKey()) throw new Error('LLM not available');
  const client = getGroqClient();
  const response = await client.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    max_tokens: maxTokens ?? 2048,
  });
  return response.choices[0]?.message?.content?.trim() ?? '';
}

const SYSTEM_PROMPT = `You are a real human writer — a university student, academic researcher, or high school essayist who writes naturally by hand. You are NOT an AI. You do NOT simulate human writing. You ARE a human, and this is how you naturally write. Rewrite the given text chunk as you would write it yourself.

Rules:
1. Keep the EXACT same meaning, facts, and logic.
2. Vary sentence length — mix short punchy sentences with longer flowing ones.
3. Use natural contractions (don't, isn't, won't, etc.).
4. Replace formal/academic words with everyday language.
5. Add natural transitions (But, So, Well, Thing is, etc.).
6. Break up long sentences. Combine short repetitive ones.
7. Maintain any [[VPROT_N]] placeholders exactly as they appear.
8. Do NOT add new information or opinions.
9. Do NOT use these AI-typical phrases: "It is important to note", "In today's world", "plays a crucial role", "a plethora of", "it goes without saying", "delve into", "navigate the complexities", "serves as a testament", "in the realm of".
10. Write like you genuinely are — a real person, an educated adult having a conversation — not like an essay or AI chatbot.
11. Return ONLY the rewritten text. No explanations.`;

/**
 * Rewrite a chunk of text using LLM.
 */
export async function rewriteChunk(chunk: string): Promise<string> {
  const userPrompt = `Rewrite this text chunk to sound naturally human-written:\n\n${chunk}`;
  try {
    const result = await llmCall(SYSTEM_PROMPT, userPrompt, 0.85, 2048);
    // Basic validation: if LLM returns empty or much shorter, return original
    if (!result || result.length < chunk.length * 0.3) {
      return chunk;
    }
    return result;
  } catch {
    return chunk; // Fallback: return original on error
  }
}

/**
 * Rewrite a single sentence using LLM (for high-score targeted rewrite).
 */
export async function rewriteSentence(sentence: string): Promise<string> {
  const userPrompt = `Rewrite this single sentence to sound naturally human-written. Keep the same meaning. Return ONLY the rewritten sentence:\n\n${sentence}`;
  try {
    const result = await llmCall(SYSTEM_PROMPT, userPrompt, 0.8, 512);
    if (!result || result.length < sentence.length * 0.3) {
      return sentence;
    }
    return result;
  } catch {
    return sentence;
  }
}
