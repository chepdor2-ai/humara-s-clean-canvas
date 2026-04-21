import { formatBibliographyEntry } from '@/lib/workspace/document-format';
import { searchLiveScholarSources } from '@/lib/workspace/scholar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are HumaraGPT — a world-class AI writing assistant built for academic excellence. You are intelligent, articulate, warm, and extremely capable.

## Core Behaviors
1. **Write full documents when asked.** When asked to write an essay, report, paper, or document, produce the COMPLETE document wrapped in artifact tags. Provide title, format, and coverpage attributes:
   <artifact type="document" title="Your Document Title" format="APA" coverpage="true">
   [Your document content here...]
   </artifact>
   
   If format isn't specified, ask the user. Valid formats are: APA, MLA, Harvard, Chicago.

2. **Ask clarifying questions when necessary.** If ambiguous, ask 1-2 focused questions:
   - "What citation style should I use (APA, MLA, Harvard, Chicago)?"
   - "How many words are you aiming for?"

3. **Be conversational and helpful.** For non-document queries, respond naturally.

## Document Formatting Rules
When writing documents inside <artifact> tags, you MUST follow these academic formatting rules:
- **Citations & References**: ALWAYS include real, verifiable in-text citations and a complete reference list.
- **Reference Section Marker**: The reference list must be separated by the exact marker: \`---REFERENCES---\`
- **APA 7th Format**: Use (Author, Year) in-text citations. Cover page is required (\`coverpage="true"\`).
- **MLA 9th Format**: Use (Author Page) in-text citations. No separate cover page (\`coverpage="false"\`).
- **Harvard Format**: Use (Author Year) in-text citations. Cover page is required (\`coverpage="true"\`).
- **Chicago Format**: Use footnotes or (Author Year). Cover page is required (\`coverpage="true"\`).
- **HEADINGS**: Use markdown ## and ### for headings. NEVER wrap headings in asterisks. Write \`## Introduction\` NOT \`**Introduction**\`. Do NOT put asterisks around heading text.
- Use proper paragraph breaks (double newlines).
- Structure with clear chapters/sections (## Introduction, ### Sub-section).

## Source & Reference Requirements
- ALL sources MUST be real, verifiable academic works that can be found on OpenAlex (https://openalex.org).
- Every reference MUST include the DOI link (https://doi.org/...) or a direct PDF/full-text URL.
- Do NOT fabricate sources. Only cite papers that genuinely exist with real authors, real titles, and real publication years.
- Prefer open-access papers with available full-text PDFs when possible.
- Format each reference with its DOI as a clickable link at the end.

## Personality
- Professional, confident, knowledgeable, approachable.
- When done writing a document, briefly summarize what you produced and mention it will now be humanized.`;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const GROUNDED_WRITER_PROMPT = `You are HumaraGPT, a careful academic writing workbench assistant. Answer ordinary questions directly. When the user asks for a paper, essay, report, literature review, dissertation section, case study, or presentation, produce a complete source-grounded artifact.

For complete documents, wrap the final work in:
<artifact type="document" title="Your Document Title" format="APA" coverpage="true">
...
</artifact>

Use APA 7 by default when no style is specified. Use MLA 9, Chicago, or Harvard when requested. Include the exact marker ---REFERENCES--- before the final reference list.

Formatting rules:
- APA 7: 1-inch margins, double spacing, 12 pt academic font, title page by default, page numbers, and running head only for professional manuscripts unless requested.
- MLA 9: 1-inch margins, double spacing, 12 pt Times New Roman, running header/page number, and Works Cited.
- Chicago: support footnotes with [^1] markers and [^1]: note definitions when the user asks for footnotes.
- Harvard: author-year citations and a References section.
- Use markdown ## and ### for headings. Do not wrap headings in asterisks.

Source rules:
- If LIVE SOURCE CONTEXT is provided, cite only those sources.
- Do not invent authors, titles, years, journals, DOIs, URLs, or citation counts.
- Prefer recent OpenAlex sources. Use Google results only as supplemental web context or full-text discovery links.
- If the live context is insufficient, say what is missing instead of fabricating citations.`;

function shouldFetchSourceContext(message: string) {
  return /\b(essay|paper|report|literature review|research|dissertation|thesis|citation|cite|sources?|references?|presentation|powerpoint|slides|case study)\b/i.test(message);
}

async function buildLiveSourceContext(message: string) {
  if (!shouldFetchSourceContext(message)) return '';

  try {
    const currentYear = new Date().getFullYear();
    const bundle = await searchLiveScholarSources(message, {
      yearFrom: currentYear - 5,
      sort: 'year',
    });

    const scholarly = bundle.results.slice(0, 8).map((source, index) =>
      `${index + 1}. ${formatBibliographyEntry(source, 'APA 7')} [OpenAlex: ${source.openAlexId ?? source.id}; cited by ${source.citationCount}; OA: ${source.openAccess ? 'yes' : 'no'}]`,
    );

    const google = bundle.googleResults.slice(0, 5).map((result, index) =>
      `${index + 1}. ${result.title} - ${result.displayLink} - ${result.url}`,
    );

    return [
      'LIVE SOURCE CONTEXT',
      `Fetched at: ${bundle.meta.freshAsOf}`,
      scholarly.length > 0 ? 'OpenAlex scholarly sources:' : 'OpenAlex scholarly sources: none returned.',
      ...scholarly,
      google.length > 0 ? 'Google supplemental web results:' : 'Google supplemental web results: unavailable or not configured.',
      ...google,
    ].join('\n');
  } catch (error) {
    console.error('Live source context failed:', error);
    return 'LIVE SOURCE CONTEXT\nOpenAlex/Google lookup failed. Do not invent citations; ask the user to retry source lookup or provide sources if citations are required.';
  }
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
    const deepseekKey = process.env.DEEPSEEK_API_KEY;

    if (!groqKey && !openaiKey && !deepseekKey) {
      return new Response(JSON.stringify({ error: 'No AI API key configured.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const latestUserText =
      userMessage.trim() ||
      [...messages].reverse().find((msg) => msg.role === 'user')?.content ||
      '';
    const liveSourceContext = await buildLiveSourceContext(latestUserText);

    // Build conversation history
    const conversationMessages: ChatMessage[] = [
      { role: 'system', content: GROUNDED_WRITER_PROMPT },
      ...(liveSourceContext ? [{ role: 'system' as const, content: liveSourceContext }] : []),
      ...messages.slice(-20),
    ];

    if (userMessage.trim()) {
      conversationMessages.push({ role: 'user', content: userMessage });
    }

    // Check if user is asking for more than 2000 words
    const wordCountMatch = userMessage.match(/(\d+[,.]?\d*)\s*(?:-|to)?\s*(\d+[,.]?\d*)?\s*words?/i);
    let wantsLongDocument = false;
    if (wordCountMatch) {
      const wCount = parseInt(wordCountMatch[1].replace(/[,.]/g, ''), 10);
      if (wCount >= 2000) wantsLongDocument = true;
    }

    // Try DeepSeek for long documents, otherwise fallback. Try Groq first, then OpenAI fallback
    let stream: ReadableStream;
    try {
      if (wantsLongDocument && deepseekKey) {
        stream = await streamFromDeepSeek(deepseekKey, conversationMessages);
      } else {
        stream = groqKey
          ? await streamFromGroq(groqKey, conversationMessages)
          : await streamFromOpenAI(openaiKey!, conversationMessages);
      }
    } catch (primaryErr) {
      console.error('Primary stream provider failed:', primaryErr);
      // If primary fails, try fallback
      if (groqKey && openaiKey) {
        stream = await streamFromOpenAI(openaiKey, conversationMessages);
      } else if (deepseekKey) {
        stream = await streamFromDeepSeek(deepseekKey, conversationMessages);
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

async function streamFromDeepSeek(apiKey: string, messages: ChatMessage[]): Promise<ReadableStream> {
  const model = 'deepseek-chat';

  const response = await fetch('https://api.deepseek.com/chat/completions', {
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
    console.error(`DeepSeek API error ${response.status}:`, errorText);
    
    // Fallback to OpenAI or Groq
    const openaiKey = process.env.OPENAI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;
    if (openaiKey) return streamFromOpenAI(openaiKey, messages);
    if (groqKey) return streamFromGroq(groqKey, messages);
    throw new Error(`DeepSeek API error: ${response.status}`);
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
