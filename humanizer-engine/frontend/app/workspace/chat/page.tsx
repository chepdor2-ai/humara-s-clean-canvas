'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu,
  Sparkles,
  ArrowUp,
  PanelRightOpen,
  PanelRightClose,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChatMessage } from '@/components/workspace/ChatMessage'
import { ChatHistory, type ChatConversation } from '@/components/workspace/ChatHistory'
import { DocumentArtifact } from '@/components/workspace/DocumentArtifact'
import { TypingIndicator } from '@/components/workspace/TypingIndicator'

/* ── localStorage helpers ── */
const STORAGE_KEY = 'humara_chat_conversations'

function loadConversations(): ChatConversation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveConversations(convs: ChatConversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convs))
  } catch { /* quota exceeded — silently skip */ }
}

function makeId() {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function generateTitle(message: string): string {
  const cleaned = message.trim().replace(/\n/g, ' ')
  if (cleaned.length <= 40) return cleaned
  return cleaned.slice(0, 40) + '…'
}

/* ── Artifact parser ── */
function parseArtifact(text: string): { title: string; content: string } | null {
  const match = text.match(/<artifact[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/artifact>/i)
  if (match) {
    return { title: match[1], content: match[2].trim() }
  }
  // Also try without quotes
  const match2 = text.match(/<artifact[^>]*title=([^\s>]*)[^>]*>([\s\S]*?)<\/artifact>/i)
  if (match2) {
    return { title: match2[1], content: match2[2].trim() }
  }
  return null
}

/* ── Quick prompts ── */
const QUICK_PROMPTS = [
  { icon: '📝', label: 'Write an essay', prompt: 'Write me a 1000-word essay on a topic of your choice. Use Harvard referencing style and include in-text citations.' },
  { icon: '📊', label: 'Research report', prompt: 'Write a research report on the impact of artificial intelligence on modern education. Include at least 5 sections with proper citations.' },
  { icon: '✉️', label: 'Professional letter', prompt: 'Write a professional letter for a job application as a software developer. Make it compelling and well-structured.' },
  { icon: '📖', label: 'Literature review', prompt: 'Write a literature review on climate change mitigation strategies. Include scholarly sources and critical analysis.' },
]

export default function WorkspaceChatPage() {
  /* ── State ── */
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)

  // Document artifact
  const [artifact, setArtifact] = useState<{ title: string; content: string } | null>(null)
  const [docFullScreen, setDocFullScreen] = useState(false)
  const [showDocPane, setShowDocPane] = useState(true)

  // Refs
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  /* ── Load conversations from localStorage ── */
  useEffect(() => {
    const loaded = loadConversations()
    setConversations(loaded)
    if (loaded.length > 0) {
      setActiveConvId(loaded[0].id)
    }
  }, [])

  /* ── Active conversation ── */
  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeConvId) ?? null,
    [conversations, activeConvId],
  )

  /* ── Persist conversations ── */
  useEffect(() => {
    if (conversations.length > 0) {
      saveConversations(conversations)
    }
  }, [conversations])

  /* ── Scroll to bottom ── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConv?.messages.length, streamingContent])

  /* ── Check for artifacts whenever active conversation changes ── */
  useEffect(() => {
    if (!activeConv) {
      setArtifact(null)
      return
    }
    // Find latest artifact in messages
    for (let i = activeConv.messages.length - 1; i >= 0; i--) {
      const msg = activeConv.messages[i]
      if (msg.role === 'assistant') {
        const parsed = parseArtifact(msg.content)
        if (parsed) {
          setArtifact(parsed)
          return
        }
      }
    }
    setArtifact(null)
  }, [activeConv])

  /* ── Create new conversation ── */
  const createNewChat = useCallback(() => {
    const newConv: ChatConversation = {
      id: makeId(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setConversations((prev) => [newConv, ...prev])
    setActiveConvId(newConv.id)
    setArtifact(null)
    setMessage('')
    setHistoryOpen(false)
    inputRef.current?.focus()
  }, [])

  /* ── Delete conversation ── */
  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id)
        saveConversations(next)
        return next
      })
      if (activeConvId === id) {
        setActiveConvId(null)
        setArtifact(null)
      }
    },
    [activeConvId],
  )

  /* ── Send message → stream response ── */
  const sendMessage = useCallback(
    async (text?: string) => {
      const userMsg = (text || message).trim()
      if (!userMsg || isStreaming) return

      // Ensure we have an active conversation
      let convId = activeConvId
      let convs = conversations

      if (!convId) {
        const newConv: ChatConversation = {
          id: makeId(),
          title: generateTitle(userMsg),
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        convs = [newConv, ...conversations]
        convId = newConv.id
        setConversations(convs)
        setActiveConvId(convId)
      }

      // Add user message
      const now = new Date().toISOString()
      const userMessage = { role: 'user' as const, content: userMsg, timestamp: now }

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== convId) return c
          const updated = {
            ...c,
            title: c.messages.length === 0 ? generateTitle(userMsg) : c.title,
            messages: [...c.messages, userMessage],
            updatedAt: now,
          }
          return updated
        }),
      )

      setMessage('')
      setIsStreaming(true)
      setStreamingContent('')

      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = 'auto'
      }

      try {
        // Get current messages for context
        const currentConv = convs.find((c) => c.id === convId)
        const history = (currentConv?.messages || []).map((m) => ({
          role: m.role,
          content: m.content,
        }))

        const abortController = new AbortController()
        abortRef.current = abortController

        const response = await fetch('/api/workspace/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMsg,
            messages: history,
          }),
          signal: abortController.signal,
        })

        if (!response.ok || !response.body) {
          throw new Error('Stream failed')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let fullResponse = ''
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data: ')) continue
            const payload = trimmed.slice(6)

            if (payload === '[DONE]') break

            try {
              const parsed = JSON.parse(payload)
              if (parsed.content) {
                fullResponse += parsed.content
                setStreamingContent(fullResponse)

                // Check for artifact during streaming to show it live
                const liveArtifact = parseArtifact(fullResponse)
                if (liveArtifact) {
                  setArtifact(liveArtifact)
                }
              }
            } catch { /* skip malformed */ }
          }
        }

        // Finalize — add assistant message to conversation
        const assistantMsg = {
          role: 'assistant' as const,
          content: fullResponse,
          timestamp: new Date().toISOString(),
        }

        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c
            return {
              ...c,
              messages: [...c.messages, assistantMsg],
              updatedAt: new Date().toISOString(),
            }
          }),
        )

        // Check for artifact in final response
        const parsedArtifact = parseArtifact(fullResponse)
        if (parsedArtifact) {
          setArtifact(parsedArtifact)
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          // User cancelled
        } else {
          // Add error message
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== convId) return c
              return {
                ...c,
                messages: [
                  ...c.messages,
                  {
                    role: 'assistant' as const,
                    content: 'I encountered an error processing your request. Please try again.',
                    timestamp: new Date().toISOString(),
                  },
                ],
              }
            }),
          )
        }
      } finally {
        setIsStreaming(false)
        setStreamingContent('')
        abortRef.current = null
      }
    },
    [message, isStreaming, activeConvId, conversations],
  )

  /* ── Key handler ── */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void sendMessage()
      }
    },
    [sendMessage],
  )

  /* ── Auto-resize textarea ── */
  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget
    t.style.height = 'auto'
    t.style.height = `${Math.min(t.scrollHeight, 200)}px`
  }, [])

  /* ── Stop streaming ── */
  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      setIsStreaming(false)
      setStreamingContent('')
    }
  }, [])

  const hasArtifact = artifact !== null

  /* ── Render ── */
  return (
    <div className="chat-workspace-root flex h-[calc(100vh-64px)] w-full overflow-hidden">
      {/* ─── Chat History Sidebar ─── */}
      <ChatHistory
        conversations={conversations}
        activeId={activeConvId}
        onSelect={(id) => {
          setActiveConvId(id)
          setHistoryOpen(false)
        }}
        onNew={createNewChat}
        onDelete={deleteConversation}
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />

      {/* ─── Main Chat Area ─── */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="chat-topbar flex items-center gap-3 border-b border-slate-200/60 bg-white/80 px-4 py-2.5 backdrop-blur-md dark:border-white/5 dark:bg-[#0d0f18]/80">
          <button
            onClick={() => setHistoryOpen(true)}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 md:hidden dark:text-zinc-400 dark:hover:bg-white/5"
            id="chat-menu-toggle"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 shadow-sm shadow-cyan-500/20">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-800 dark:text-white">
                Humara<span className="text-cyan-500">GPT</span>
              </h1>
              <p className="text-[10px] text-slate-400 dark:text-zinc-600">
                {isStreaming ? (
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500" />
                    Generating...
                  </span>
                ) : (
                  'AI Writing Assistant'
                )}
              </p>
            </div>
          </div>
          {activeConv && (
            <span className="ml-auto truncate text-xs text-slate-400 dark:text-zinc-600 max-w-[200px]">
              {activeConv.title}
            </span>
          )}

          {/* Toggle document pane button */}
          {hasArtifact && (
            <button
              onClick={() => setShowDocPane((p) => !p)}
              className="ml-2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-zinc-500 dark:hover:bg-white/5 dark:hover:text-zinc-300 hidden md:flex items-center gap-1 text-xs"
              title={showDocPane ? 'Hide document' : 'Show document'}
            >
              {showDocPane ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto premium-scroll">
          <div className={cn('mx-auto transition-all duration-300', hasArtifact && showDocPane ? 'max-w-2xl' : 'max-w-3xl')}>
            {/* Empty state / welcome */}
            {(!activeConv || activeConv.messages.length === 0) && !isStreaming ? (
              <div className="flex flex-col items-center justify-center px-4 py-20">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-2xl shadow-cyan-500/25"
                >
                  <Sparkles className="h-10 w-10 text-white" />
                </motion.div>

                <motion.h2
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className="text-2xl font-bold text-slate-800 dark:text-white"
                >
                  How can I help you today?
                </motion.h2>

                <motion.p
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.25 }}
                  className="mt-2 max-w-md text-center text-sm text-slate-500 dark:text-zinc-400"
                >
                  I can write essays, reports, letters, and any document you need. Just ask me and
                  I&apos;ll create it in a Word-like editor for you to edit and download.
                </motion.p>

                {/* Quick prompts */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.35 }}
                  className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2"
                >
                  {QUICK_PROMPTS.map((qp) => (
                    <button
                      key={qp.label}
                      onClick={() => {
                        setMessage(qp.prompt)
                        setTimeout(() => {
                          void sendMessage(qp.prompt)
                        }, 50)
                      }}
                      className="quick-prompt-card group flex items-start gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 text-left transition-all hover:border-cyan-300 hover:bg-white hover:shadow-md dark:border-white/5 dark:bg-white/3 dark:hover:border-cyan-500/30 dark:hover:bg-white/5"
                    >
                      <span className="text-xl">{qp.icon}</span>
                      <div>
                        <div className="text-sm font-semibold text-slate-800 group-hover:text-cyan-700 dark:text-zinc-200 dark:group-hover:text-cyan-400">
                          {qp.label}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-400 dark:text-zinc-600 line-clamp-2">
                          {qp.prompt}
                        </div>
                      </div>
                    </button>
                  ))}
                </motion.div>
              </div>
            ) : (
              <div className="py-4">
                {/* Render messages */}
                {activeConv?.messages.map((msg, i) => (
                  <ChatMessage
                    key={`${activeConv.id}-${i}`}
                    role={msg.role}
                    content={msg.content}
                    timestamp={new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  />
                ))}

                {/* Streaming message */}
                {isStreaming && streamingContent && (
                  <ChatMessage
                    role="assistant"
                    content={streamingContent}
                    isStreaming
                  />
                )}

                {/* Typing indicator */}
                {isStreaming && !streamingContent && (
                  <div className="px-4">
                    <TypingIndicator />
                  </div>
                )}

                <div ref={bottomRef} className="h-4" />
              </div>
            )}
          </div>
        </div>

        {/* ── Input Bar ── */}
        <div className="chat-input-area border-t border-slate-200/60 bg-white/95 px-4 py-3 backdrop-blur-md dark:border-white/5 dark:bg-[#0d0f18]/95">
          <div className={cn('mx-auto transition-all duration-300', hasArtifact && showDocPane ? 'max-w-2xl' : 'max-w-3xl')}>
            <div className="chat-input-container relative flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-1.5 shadow-sm transition-all focus-within:border-cyan-400 focus-within:shadow-lg focus-within:shadow-cyan-500/5 dark:border-white/10 dark:bg-white/3 dark:focus-within:border-cyan-500/40">
              <textarea
                ref={inputRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                onInput={handleInput}
                placeholder="Ask HumaraGPT to write, edit, or improve anything..."
                rows={1}
                className="flex-1 resize-none bg-transparent px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none dark:text-white dark:placeholder-zinc-500"
                style={{ minHeight: 40, maxHeight: 200 }}
                disabled={isStreaming}
                id="chat-input"
              />
              {isStreaming ? (
                <button
                  onClick={stopStreaming}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white shadow-lg shadow-red-500/25 transition-all hover:bg-red-600 hover:shadow-xl"
                  title="Stop generating"
                  id="chat-stop-btn"
                >
                  <div className="h-3 w-3 rounded-sm bg-white" />
                </button>
              ) : (
                <button
                  onClick={() => void sendMessage()}
                  disabled={!message.trim()}
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all',
                    message.trim()
                      ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 hover:shadow-xl hover:shadow-cyan-500/30'
                      : 'bg-slate-200 text-slate-400 dark:bg-zinc-800 dark:text-zinc-600',
                  )}
                  id="chat-send-btn"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="mt-1.5 text-center text-[10px] text-slate-400 dark:text-zinc-600">
              HumaraGPT can make mistakes. Please double-check responses.
            </p>
          </div>
        </div>
      </main>

      {/* ─── Document Artifact Pane (right side) ─── */}
      <AnimatePresence mode="wait">
        {artifact && showDocPane && (
          <motion.div
            key="document-artifact"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: docFullScreen ? '100%' : '50%', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="hidden md:block min-w-0 overflow-hidden"
          >
            <DocumentArtifact
              title={artifact.title}
              content={artifact.content}
              onContentChange={(newContent) =>
                setArtifact((prev) => (prev ? { ...prev, content: newContent } : null))
              }
              onClose={() => setArtifact(null)}
              isFullScreen={docFullScreen}
              onToggleFullScreen={() => setDocFullScreen((f) => !f)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile document pane overlay */}
      <AnimatePresence>
        {artifact && showDocPane && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="md:hidden fixed inset-0 z-50"
          >
            <DocumentArtifact
              title={artifact.title}
              content={artifact.content}
              onContentChange={(newContent) =>
                setArtifact((prev) => (prev ? { ...prev, content: newContent } : null))
              }
              onClose={() => setShowDocPane(false)}
              isFullScreen
              onToggleFullScreen={() => setShowDocPane(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
