'use client'

import { useEffect, useRef } from 'react'
import { ArrowUp, BookOpen, Bot, Copy, FileDown, Loader2, Sparkles, User2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ChatRole = 'user' | 'assistant' | 'system'

export type SourceChip = {
  id: string
  title: string
  year?: number | null
  authors?: string
  journal?: string | null
  doi?: string | null
}

export type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  sources?: SourceChip[]
  streaming?: boolean
}

type Props = {
  messages: ChatMessage[]
  input: string
  onInputChange: (v: string) => void
  onSubmit: () => void
  loading: boolean
  useSources: boolean
  onUseSourcesChange: (v: boolean) => void
  citationStyle: string
  onCitationStyleChange: (v: string) => void
  onInsertIntoDoc: (m: ChatMessage) => void
  onCopy: (m: ChatMessage) => void
  copiedId: string | null
  suggestions: string[]
  onSuggestion: (s: string) => void
}

const CITATION_STYLES = [
  { value: 'APA', label: 'APA' },
  { value: 'MLA', label: 'MLA' },
  { value: 'Chicago', label: 'Chicago' },
  { value: 'Harvard', label: 'Harvard' },
  { value: 'IEEE', label: 'IEEE' },
  { value: 'Vancouver', label: 'Vancouver' },
]

export function ChatPanel(props: Props) {
  const {
    messages,
    input,
    onInputChange,
    onSubmit,
    loading,
    useSources,
    onUseSourcesChange,
    citationStyle,
    onCitationStyleChange,
    onInsertIntoDoc,
    onCopy,
    copiedId,
    suggestions,
    onSuggestion,
  } = props

  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(200, ta.scrollHeight) + 'px'
  }, [input])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!loading && input.trim()) onSubmit()
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-600 text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-semibold">Writer</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={useSources}
              onChange={(e) => onUseSourcesChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
            />
            <span className="text-slate-600 dark:text-zinc-400">Use real sources</span>
          </label>
          <select
            value={citationStyle}
            onChange={(e) => onCitationStyleChange(e.target.value)}
            className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-900"
            aria-label="Citation style"
          >
            {CITATION_STYLES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <EmptyChat suggestions={suggestions} onSuggestion={onSuggestion} />
        ) : (
          <ul className="space-y-4">
            {messages.map((m) => (
              <li
                key={m.id}
                className={cn(
                  'flex gap-2.5',
                  m.role === 'user' ? 'flex-row-reverse' : 'flex-row',
                )}
              >
                <div
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs',
                    m.role === 'user'
                      ? 'bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-200'
                      : 'bg-cyan-600 text-white',
                  )}
                >
                  {m.role === 'user' ? <User2 className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'inline-block max-w-full whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed',
                      m.role === 'user'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-100 text-slate-800 dark:bg-zinc-900 dark:text-zinc-200',
                    )}
                  >
                    {m.content}
                    {m.streaming && (
                      <span className="ml-1 inline-block h-3 w-[2px] animate-pulse bg-current align-middle" />
                    )}
                  </div>

                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.sources.map((s, i) => (
                        <a
                          key={s.id}
                          href={s.doi || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          title={s.title}
                        >
                          <BookOpen className="h-3 w-3 text-cyan-600" />
                          <span className="font-semibold">[{i + 1}]</span>
                          <span className="max-w-[200px] truncate">
                            {s.authors?.split(',')[0] || 'Source'} {s.year ? `· ${s.year}` : ''}
                          </span>
                        </a>
                      ))}
                    </div>
                  )}

                  {m.role === 'assistant' && !m.streaming && m.content.trim() && (
                    <div className="mt-1.5 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onCopy(m)}
                        className="inline-flex h-6 items-center gap-1 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        <Copy className="h-3 w-3" />
                        {copiedId === m.id ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onInsertIntoDoc(m)}
                        className="inline-flex h-6 items-center gap-1 rounded bg-cyan-600 px-2 text-[11px] font-medium text-white hover:bg-cyan-700"
                      >
                        <FileDown className="h-3 w-3" />
                        Insert into document
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!loading && input.trim()) onSubmit()
        }}
        className="border-t border-slate-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="relative flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/20 dark:border-zinc-800 dark:bg-zinc-900">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Draft an introduction on climate adaptation in coastal cities…"
            rows={1}
            className="max-h-[200px] min-h-[32px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan-600 text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-zinc-500">
          Enter to send · Shift+Enter for newline
        </p>
      </form>
    </div>
  )
}

function EmptyChat({
  suggestions,
  onSuggestion,
}: {
  suggestions: string[]
  onSuggestion: (s: string) => void
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center py-8 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-400">
        <Sparkles className="h-5 w-5" />
      </div>
      <h2 className="text-sm font-semibold">How would you like to start?</h2>
      <p className="mt-1 max-w-xs text-xs text-slate-600 dark:text-zinc-400">
        Describe your assignment, paste a prompt, or ask for a section. Enable <em>Use real
        sources</em> to cite real works from OpenAlex.
      </p>
      <div className="mt-4 flex w-full max-w-sm flex-col gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSuggestion(s)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-700 hover:border-cyan-300 hover:bg-cyan-50/50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/20"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
