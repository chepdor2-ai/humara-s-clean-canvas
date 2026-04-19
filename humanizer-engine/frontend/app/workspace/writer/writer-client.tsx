'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChatPanel, type ChatMessage, type SourceChip } from './chat-panel'
import { DocumentEditor, type DocumentEditorHandle } from './document-editor'
import { markdownToHtml } from '@/lib/workspace/markdown'

const CHAT_STORAGE = 'humara-writer-chat'
const PREFS_STORAGE = 'humara-writer-prefs'

const DEFAULT_SUGGESTIONS = [
  'Draft a 400-word introduction on generative AI in higher education. Cite real sources.',
  'Write a literature review section on climate adaptation in coastal cities (APA, with citations).',
  'Create a comparison table of RNN, LSTM, and Transformer architectures.',
  'Give me an outline for a 2,000-word essay on the ethics of CRISPR in germline editing.',
]

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function parseStreamedMeta(
  chunk: string,
): { meta: { sources: SourceChip[] } | null; rest: string } {
  const startToken = '\u0000META'
  const endToken = '\u0000'
  const start = chunk.indexOf(startToken)
  if (start === -1) return { meta: null, rest: chunk }
  const afterStart = start + startToken.length
  const end = chunk.indexOf(endToken, afterStart)
  if (end === -1) return { meta: null, rest: chunk }
  try {
    const json = chunk.slice(afterStart, end)
    const parsed = JSON.parse(json) as { type: string; sources: SourceChip[] }
    if (parsed.type === 'sources') {
      return {
        meta: { sources: parsed.sources },
        rest: chunk.slice(0, start) + chunk.slice(end + endToken.length),
      }
    }
  } catch {
    /* ignore */
  }
  return { meta: null, rest: chunk }
}

export function WriterClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [useSources, setUseSources] = useState(true)
  const [citationStyle, setCitationStyle] = useState('APA')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [chatWidth, setChatWidth] = useState(42) // percent

  const editorRef = useRef<DocumentEditorHandle | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const dragRef = useRef<{ dragging: boolean; startX: number; startWidth: number }>({
    dragging: false,
    startX: 0,
    startWidth: 42,
  })

  // Load persisted state
  useEffect(() => {
    try {
      const rawMsgs = localStorage.getItem(CHAT_STORAGE)
      if (rawMsgs) setMessages(JSON.parse(rawMsgs))
      const rawPrefs = localStorage.getItem(PREFS_STORAGE)
      if (rawPrefs) {
        const prefs = JSON.parse(rawPrefs)
        if (typeof prefs.useSources === 'boolean') setUseSources(prefs.useSources)
        if (typeof prefs.citationStyle === 'string') setCitationStyle(prefs.citationStyle)
        if (typeof prefs.chatWidth === 'number') setChatWidth(prefs.chatWidth)
      }
    } catch {
      /* ignore */
    }
  }, [])

  // Persist messages (trim to 80)
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE, JSON.stringify(messages.slice(-80)))
    } catch {
      /* ignore quota */
    }
  }, [messages])

  useEffect(() => {
    try {
      localStorage.setItem(
        PREFS_STORAGE,
        JSON.stringify({ useSources, citationStyle, chatWidth }),
      )
    } catch {
      /* ignore */
    }
  }, [useSources, citationStyle, chatWidth])

  const suggestions = useMemo(() => DEFAULT_SUGGESTIONS, [])

  const send = useCallback(
    async (userContent: string) => {
      if (!userContent.trim() || loading) return
      const userMsg: ChatMessage = { id: uid(), role: 'user', content: userContent.trim() }
      const assistantId = uid()
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        streaming: true,
      }
      setMessages((m) => [...m, userMsg, assistantMsg])
      setInput('')
      setLoading(true)

      const ac = new AbortController()
      abortRef.current = ac

      try {
        const documentText = editorRef.current?.getText?.() || ''
        const res = await fetch('/api/workspace/writer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              ...messages
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .slice(-10)
                .map((m) => ({ role: m.role, content: m.content })),
              { role: 'user', content: userMsg.content },
            ],
            documentText: documentText.slice(0, 8000),
            citationStyle,
            useSources,
            searchQuery: userMsg.content,
          }),
          signal: ac.signal,
        })

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => '')
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId
                ? {
                    ...msg,
                    streaming: false,
                    content:
                      msg.content +
                      (msg.content ? '\n\n' : '') +
                      `⚠️ ${errText || `Request failed (${res.status})`}`,
                  }
                : msg,
            ),
          )
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          // Try to extract META from the buffer once
          const { meta, rest } = parseStreamedMeta(buffer)
          if (meta) {
            buffer = rest
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId ? { ...msg, sources: meta.sources } : msg,
              ),
            )
          }

          // Push the visible text we have so far
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId ? { ...msg, content: buffer, streaming: true } : msg,
            ),
          )
        }

        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId ? { ...msg, streaming: false, content: buffer } : msg,
          ),
        )
      } catch (err: unknown) {
        const aborted = err instanceof Error && err.name === 'AbortError'
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  streaming: false,
                  content:
                    msg.content +
                    (aborted
                      ? '\n\n*(stopped)*'
                      : `\n\n⚠️ ${err instanceof Error ? err.message : 'Request failed.'}`),
                }
              : msg,
          ),
        )
      } finally {
        setLoading(false)
        abortRef.current = null
      }
    },
    [messages, loading, citationStyle, useSources],
  )

  const handleSubmit = () => send(input)

  const handleSuggestion = (s: string) => {
    setInput(s)
  }

  const handleCopy = async (m: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(m.content)
      setCopiedId(m.id)
      setTimeout(() => setCopiedId((v) => (v === m.id ? null : v)), 1500)
    } catch {
      /* ignore */
    }
  }

  const handleInsertIntoDoc = (m: ChatMessage) => {
    const html = markdownToHtml(m.content)
    let full = html
    if (m.sources && m.sources.length > 0) {
      const refs = m.sources
        .map(
          (s, i) =>
            `<li>[${i + 1}] ${s.authors ? `${s.authors}. ` : ''}${s.year ? `(${s.year}). ` : ''}${
              s.title
            }.${s.journal ? ` <em>${s.journal}</em>.` : ''}${
              s.doi ? ` <a href="${s.doi}">${s.doi}</a>` : ''
            }</li>`,
        )
        .join('')
      full += `<h3>References</h3><ol>${refs}</ol>`
    }
    editorRef.current?.appendHtml(full)
  }

  // Resizable split handle
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragRef.current = { dragging: true, startX: e.clientX, startWidth: chatWidth }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return
    const parent = (e.currentTarget.parentElement as HTMLElement | null)?.parentElement
    const width = parent?.getBoundingClientRect().width ?? window.innerWidth
    const deltaPct = ((e.clientX - dragRef.current.startX) / width) * 100
    const next = Math.max(24, Math.min(70, dragRef.current.startWidth + deltaPct))
    setChatWidth(next)
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current.dragging = false
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
  }

  const handleClearChat = () => {
    if (!window.confirm('Clear the chat history?')) return
    setMessages([])
  }

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-1.5 text-xs dark:border-zinc-800 dark:bg-zinc-950">
        <span className="text-slate-600 dark:text-zinc-400">
          Chat on the left · document on the right · both persist in this browser
        </span>
        <div className="flex items-center gap-2">
          {loading && abortRef.current && (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="rounded border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Stop
            </button>
          )}
          <button
            type="button"
            onClick={handleClearChat}
            className="rounded border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Clear chat
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Chat */}
        <div style={{ width: `${chatWidth}%` }} className="min-h-0">
          <ChatPanel
            messages={messages}
            input={input}
            onInputChange={setInput}
            onSubmit={handleSubmit}
            loading={loading}
            useSources={useSources}
            onUseSourcesChange={setUseSources}
            citationStyle={citationStyle}
            onCitationStyleChange={setCitationStyle}
            onInsertIntoDoc={handleInsertIntoDoc}
            onCopy={handleCopy}
            copiedId={copiedId}
            suggestions={suggestions}
            onSuggestion={handleSuggestion}
          />
        </div>

        {/* Resize handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="group relative w-1 shrink-0 cursor-col-resize bg-slate-200 hover:bg-cyan-500 dark:bg-zinc-800"
          title="Drag to resize"
        >
          <span className="absolute inset-y-0 -left-1 -right-1" />
        </div>

        {/* Editor */}
        <div style={{ width: `${100 - chatWidth}%` }} className="min-h-0">
          <DocumentEditor
            ref={editorRef}
            placeholder="Start writing or use the chat on the left to draft a section…"
            filename="humara-paper.docx"
          />
        </div>
      </div>
    </div>
  )
}
