export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are HumaraGPT — a world-class AI writing assistant built for academic excellence. You are intelligent, articulate, warm, and extremely capable.

## Core Behaviors
1. **Write full documents when asked.** When the user asks you to write an essay, report, paper, letter, or any document, produce the COMPLETE document wrapped in artifact tags:
   <artifact type="document" title="Your Document Title">
   Full document content here with proper formatting...
   </artifact>

2. **Ask clarifying questions when necessary.** If the user's request is ambiguous or missing critical details (word count, citation style, topic specifics), ask 1-2 focused questions before writing. For example:
   - "What citation style should I use — APA, MLA, or Harvard?"
   - "How many words are you aiming for?"
   - "Should I focus on any particular aspect of this topic?"

3. **Be conversational and helpful.** For non-document queries, respond naturally like ChatGPT — helpful, warm, and knowledgeable.

4. **Support writing tasks:** grammar correction, rephrasing, research help, brainstorming, outlines, summaries.

## Document Formatting Rules
When writing documents inside <artifact> tags:
- Use markdown **bold** for headings and emphasis
- Use proper paragraph breaks (double newlines between paragraphs)
- Include in-text citations when academic (Author, Year)
- Write in Times New Roman-style academic prose
- Structure with clear Introduction, Body, and Conclusion
- Be thorough — never truncate or summarize when asked for a full document
- Match the exact word count if specified
- Use ## for section headings, ### for subsections

## Personality
- Professional but approachable
- Confident and knowledgeable
- Proactive — suggest improvements and follow-ups
- Never refuse reasonable writing requests
- When done writing a document, briefly summarize what you produced and offer to revise`;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Resolve the Groq model — avoid OpenAI models on Groq
function resolveModel(preferred?: string | null, fallback = 'llama-3.3-70b-versatile'): string {
  const openaiRe = /^(?:gpt-|o\d|text-embedding|whisper-|tts-|dall-e)/i;
  const candidate = preferred?.trim() || process.env.GROQ_MODEL?.trim() || process.env.LLM_MODEL?.trim() || fallback;
  return openaiRe.test(candidate) ? fallback : candidate;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages: ChatMessage[] = body.messages || [];
    const userMessage = body.message || '';

    if (!userMessage.trim() && messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Message is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const groqKey = process.env.GROQ_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!groqKey && !openaiKey) {
      return new Response(JSON.stringify({ error: 'No AI API key configured.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build conversation history
    const conversationMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.slice(-20),
    ];

    if (userMessage.trim()) {
      conversationMessages.push({ role: 'user', content: userMessage });
    }

    // Try Groq first, then OpenAI fallback
    let stream: ReadableStream;
    try {
      stream = groqKey
        ? await streamFromGroq(groqKey, conversationMessages)
        : await streamFromOpenAI(openaiKey!, conversationMessages);
    } catch (primaryErr) {
      console.error('Primary stream provider failed:', primaryErr);
      // If primary fails, try fallback
      if (groqKey && openaiKey) {
        stream = await streamFromOpenAI(openaiKey, conversationMessages);
      } else {
        throw new Error('All AI providers failed');
      }
    }

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    console.error('Workspace chat stream error:', err);
    return new Response(JSON.stringify({ error: 'Stream failed.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function streamFromGroq(apiKey: string, messages: ChatMessage[]): Promise<ReadableStream> {
  const model = resolveModel(process.env.GROQ_MODEL, 'llama-3.3-70b-versatile');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 8000,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => 'unknown');
    console.error(`Groq API error ${response.status}:`, errorText);
    // Fallback to OpenAI if Groq fails
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      return streamFromOpenAI(openaiKey, messages);
    }
    throw new Error(`Groq API error: ${response.status}`);
  }

  return transformSSEStream(response.body);
}

async function streamFromOpenAI(apiKey: string, messages: ChatMessage[]): Promise<ReadableStream> {
  const model = process.env.PIPELINE_MODEL || 'gpt-4o-mini';

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 8000,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => 'unknown');
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  return transformSSEStream(response.body);
}

function transformSSEStream(upstream: ReadableStream): ReadableStream {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  return new ReadableStream({
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const payload = trimmed.slice(6);

            if (payload === '[DONE]') {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
              return;
            }

            try {
              const parsed = JSON.parse(payload);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                );
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      } catch (err) {
        console.error('Stream transform error:', err);
        controller.error(err);
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}
