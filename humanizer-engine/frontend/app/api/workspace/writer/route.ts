import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import {
  reconstructAbstract,
  searchOpenAlex,
  shortAuthorList,
  type OpenAlexWork,
} from '@/lib/workspace/openalex'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type ClientMessage = { role: 'user' | 'assistant' | 'system'; content: string }

type RequestBody = {
  messages: ClientMessage[]
  documentText?: string
  citationStyle?: string
  useSources?: boolean
  searchQuery?: string
}

function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  return new OpenAI({ apiKey: key })
}

function summarizeWorkForContext(w: OpenAlexWork): string {
  const authors = shortAuthorList(w)
  const year = w.publication_year ?? 'n.d.'
  const journal = w.primary_location?.source?.display_name ?? ''
  const abstract = reconstructAbstract(w.abstract_inverted_index ?? undefined).slice(0, 600)
  const doi = w.doi ? `https://doi.org/${w.doi.replace(/^https?:\/\/doi\.org\//, '')}` : ''
  return [
    `TITLE: ${w.title}`,
    `AUTHORS: ${authors}`,
    `YEAR: ${year}`,
    journal ? `JOURNAL: ${journal}` : '',
    doi ? `DOI: ${doi}` : '',
    abstract ? `ABSTRACT: ${abstract}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildSystemPrompt(opts: {
  citationStyle: string
  sources: OpenAlexWork[]
  documentText?: string
}) {
  const { citationStyle, sources, documentText } = opts

  let prompt = `You are Humara Writer, an academic writing assistant. You help students and researchers draft well-structured, evidence-based academic work.

Rules:
- Always aim for a formal, academic register.
- Use clear structure: introduction, body sections with headings, conclusion, and a "References" section when sources are cited.
- Use ${citationStyle.toUpperCase()} citation style for in-text citations (e.g. "(Smith, 2023)") and for the References list.
- Prefer using the SOURCES provided below for factual claims. Never invent citations or DOIs.
- When the user asks for tables, produce a proper Markdown table.
- When the user asks for charts or graphs:
  - If the data is simple (bar, line, pie, scatter with <20 data points), output a fenced JSON block with language "chart" containing: { "type": "bar" | "line" | "pie" | "area", "title": "...", "data": [{"name": "...", "value": 123}, ...], "xKey": "name", "yKey": "value" }. The editor will render it with Recharts.
  - If the data is complex or requires statistical transformations, instead RECOMMEND the user build the chart in Microsoft Excel, Google Sheets, or a statistical tool, and give them step-by-step instructions + the data they need.
- For any image generation request, recommend an external tool (e.g. "generate this diagram in draw.io or Canva") and describe the image precisely instead.
- Respond in clean Markdown. Use #, ##, ### for headings, - for bullets, and **bold** / *italics* as needed. Do not wrap your entire answer in a code block.
`

  if (sources.length > 0) {
    prompt +=
      '\n\n=== SOURCES (real works from OpenAlex — use these for citations) ===\n\n' +
      sources.map((s, i) => `[${i + 1}]\n${summarizeWorkForContext(s)}`).join('\n\n')
  }

  if (documentText && documentText.trim()) {
    prompt +=
      '\n\n=== CURRENT DRAFT (the user is editing this live) ===\n\n' +
      documentText.slice(0, 8000)
  }

  return prompt
}

export async function POST(req: NextRequest) {
  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }

  const messages = body.messages ?? []
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('Missing messages', { status: 400 })
  }

  const openai = getOpenAIClient()
  if (!openai) {
    return new Response(
      'The writer is missing its AI key. Please set OPENAI_API_KEY in your project environment variables.',
      { status: 503 },
    )
  }

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const topic = (body.searchQuery || lastUser?.content || '').slice(0, 300)

  let sources: OpenAlexWork[] = []
  if (body.useSources && topic) {
    try {
      const data = await searchOpenAlex({
        query: topic,
        sort: 'cited_by_count:desc',
        perPage: 5,
      })
      sources = data.results
    } catch {
      /* silently continue without sources */
    }
  }

  const systemPrompt = buildSystemPrompt({
    citationStyle: body.citationStyle || 'APA',
    sources,
    documentText: body.documentText,
  })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Send sources payload first so the client can show them immediately
      if (sources.length > 0) {
        const meta = {
          type: 'sources',
          sources: sources.map((s) => ({
            id: s.id,
            title: s.title,
            year: s.publication_year,
            authors: shortAuthorList(s),
            doi: s.doi
              ? `https://doi.org/${s.doi.replace(/^https?:\/\/doi\.org\//, '')}`
              : null,
            journal: s.primary_location?.source?.display_name ?? null,
          })),
        }
        controller.enqueue(encoder.encode(`\u0000META${JSON.stringify(meta)}\u0000`))
      }

      try {
        const completion = await openai.chat.completions.create({
          model: process.env.OPENAI_WRITER_MODEL || 'gpt-4o-mini',
          stream: true,
          temperature: 0.7,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        })

        for await (const chunk of completion) {
          const token = chunk.choices?.[0]?.delta?.content ?? ''
          if (token) controller.enqueue(encoder.encode(token))
        }
      } catch (err: any) {
        const msg = err?.message || 'The AI request failed.'
        controller.enqueue(encoder.encode(`\n\n> Error: ${msg}`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
