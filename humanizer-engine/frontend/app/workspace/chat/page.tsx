'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Bot, FileDown, FileText, Loader2, MessageSquare, Plus, RefreshCcw, Send, Trash2, WandSparkles } from 'lucide-react'
import { useAuth } from '@/app/AuthProvider'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { downloadBlob, getLatestScore, workspaceFetch } from '@/lib/workspace/client'
import type { WorkspaceProject } from '@/lib/workspace/types'

export default function WorkspaceChatPage() {
  const { session } = useAuth()
  const [projects, setProjects] = useState<WorkspaceProject[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState(false)
  const [busyAction, setBusyAction] = useState<'regrade' | 'revise' | 'export' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const token = session?.access_token

  /* ── load projects ── */
  useEffect(() => {
    if (!token) return
    setLoading(true)
    workspaceFetch<{ projects: WorkspaceProject[] }>(token, '/api/workspace/projects')
      .then((d) => {
        setProjects(d.projects)
        setActiveProjectId((c) => c ?? d.projects[0]?.id ?? null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load projects.'))
      .finally(() => setLoading(false))
  }, [token])

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null,
    [activeProjectId, projects],
  )

  const score = getLatestScore(activeProject)

  const updateProject = useCallback((p: WorkspaceProject) => {
    setProjects((cur) => cur.map((x) => (x.id === p.id ? p : x)))
  }, [])

  /* ── scroll to bottom on new messages ── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeProject?.messages.length])

  /* ── actions ── */
  const createProject = async () => {
    if (!token) return
    setCreating(true)
    setError(null)
    try {
      const d = await workspaceFetch<{ project: WorkspaceProject }>(token, '/api/workspace/projects', {
        method: 'POST',
        body: JSON.stringify({
          title: 'New Project',
          instructions: 'Create a structured academic draft with clear sections, scholarly evidence, and a grading target of 90 or above.',
          rubric: 'Reward analytical depth, structure, evidence quality, and clean academic formatting.',
          citationStyle: 'APA 7',
          targetWordCount: 1500,
        }),
      })
      setProjects((cur) => [d.project, ...cur])
      setActiveProjectId(d.project.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project.')
    } finally {
      setCreating(false)
    }
  }

  const sendMessage = async () => {
    if (!token || !activeProject || !message.trim()) return
    setSending(true)
    setError(null)
    try {
      const d = await workspaceFetch<{ project: WorkspaceProject }>(token, '/api/workspace/chat/send', {
        method: 'POST',
        body: JSON.stringify({ projectId: activeProject.id, prompt: message }),
      })
      updateProject(d.project)
      setMessage('')
      inputRef.current?.focus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send message.')
    } finally {
      setSending(false)
    }
  }

  const regrade = async () => {
    if (!token || !activeProject) return
    setBusyAction('regrade')
    try {
      const d = await workspaceFetch<{ project: WorkspaceProject }>(token, '/api/workspace/chat/regrade', {
        method: 'POST',
        body: JSON.stringify({ projectId: activeProject.id }),
      })
      updateProject(d.project)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Regrade failed.')
    } finally {
      setBusyAction(null)
    }
  }

  const revise = async () => {
    if (!token || !activeProject) return
    setBusyAction('revise')
    try {
      const d = await workspaceFetch<{ project: WorkspaceProject }>(token, '/api/workspace/chat/revise', {
        method: 'POST',
        body: JSON.stringify({ projectId: activeProject.id }),
      })
      updateProject(d.project)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revision failed.')
    } finally {
      setBusyAction(null)
    }
  }

  const exportProject = async (type: 'docx' | 'pdf') => {
    if (!token || !activeProject) return
    setBusyAction('export')
    try {
      const d = await workspaceFetch<{ artifact: { fileName: string }; mimeType: string; base64: string }>(token, '/api/workspace/export', {
        method: 'POST',
        body: JSON.stringify({ projectId: activeProject.id, type }),
      })
      downloadBlob(d.base64, d.mimeType, d.artifact.fileName)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setBusyAction(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  /* ── loading state ── */
  if (loading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-500" />
      </div>
    )
  }

  /* ── main layout ── */
  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">

      {/* ─── LEFT: Conversation sidebar ─── */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-50/80 dark:border-white/10 dark:bg-[#0b0d15] md:flex">
        <div className="flex items-center justify-between px-4 py-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Projects</h2>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={createProject} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>

        <ScrollArea className="flex-1 px-2">
          <div className="space-y-1 pb-4">
            {projects.map((p) => {
              const active = p.id === activeProjectId
              const pScore = p.scoreHistory.at(-1)
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveProjectId(p.id)}
                  className={cn(
                    'group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                    active
                      ? 'bg-white shadow-sm dark:bg-white/10'
                      : 'hover:bg-white/60 dark:hover:bg-white/5',
                  )}
                >
                  <MessageSquare className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-cyan-500' : 'text-slate-400 dark:text-zinc-600')} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{p.title}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-zinc-500">
                      {p.messages.length} messages{pScore ? ` · ${pScore.overallScore}/100` : ''}
                    </div>
                  </div>
                </button>
              )
            })}
            {projects.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-slate-400 dark:text-zinc-600">
                No projects yet. Click + to start.
              </div>
            )}
          </div>
        </ScrollArea>

        {/* quick links */}
        <div className="space-y-1 border-t border-slate-200 px-3 py-3 dark:border-white/10">
          <Link href="/workspace/scholar" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-600 transition-colors hover:bg-white/60 dark:text-zinc-400 dark:hover:bg-white/5">
            <Bot className="h-3.5 w-3.5" /> Scholar Search
          </Link>
          {activeProject && (
            <Link href={`/workspace/document/${activeProject.id}`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-600 transition-colors hover:bg-white/60 dark:text-zinc-400 dark:hover:bg-white/5">
              <FileText className="h-3.5 w-3.5" /> Open Editor
            </Link>
          )}
        </div>
      </aside>

      {/* ─── CENTER: Chat area ─── */}
      <main className="flex min-w-0 flex-1 flex-col">

        {/* top bar with score + quick actions */}
        {activeProject && (
          <div className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-2.5 backdrop-blur dark:border-white/10 dark:bg-[#0d0f18]/80">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{activeProject.title}</h3>
              {score && (
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  score.overallScore >= 90
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
                )}>
                  {score.overallScore}/100
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={regrade} disabled={busyAction !== null} className="h-7 gap-1 text-xs">
                {busyAction === 'regrade' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
                Regrade
              </Button>
              <Button size="sm" variant="ghost" onClick={revise} disabled={busyAction !== null} className="h-7 gap-1 text-xs">
                {busyAction === 'revise' ? <Loader2 className="h-3 w-3 animate-spin" /> : <WandSparkles className="h-3 w-3" />}
                Revise to 90+
              </Button>
              <Button size="sm" variant="ghost" onClick={() => exportProject('docx')} disabled={busyAction !== null} className="h-7 gap-1 text-xs">
                {busyAction === 'export' ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
                DOCX
              </Button>
              <Button size="sm" variant="ghost" onClick={() => exportProject('pdf')} disabled={busyAction !== null} className="h-7 gap-1 text-xs">
                <FileDown className="h-3 w-3" /> PDF
              </Button>
            </div>
          </div>
        )}

        {/* messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            {!activeProject ? (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <div className="mb-4 rounded-full bg-cyan-500/10 p-4">
                  <MessageSquare className="h-8 w-8 text-cyan-500" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Academic Workbench</h2>
                <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-zinc-400">
                  Start a new project to chat, search scholarly sources, grade your draft, and revise until it scores 90+.
                </p>
                <Button className="mt-6" onClick={createProject} disabled={creating}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  New project
                </Button>
              </div>
            ) : activeProject.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <MessageSquare className="mb-3 h-6 w-6 text-slate-300 dark:text-zinc-700" />
                <p className="text-sm text-slate-400 dark:text-zinc-600">Send a message to start working on this project.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {activeProject.messages.map((msg) => (
                  <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-[80%] rounded-2xl px-4 py-3',
                      msg.role === 'user'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-100 text-slate-800 dark:bg-white/5 dark:text-zinc-100',
                    )}>
                      {msg.role === 'assistant' && (
                        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-zinc-500">
                          <Bot className="h-3 w-3" /> Humara
                        </div>
                      )}
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                      <div className="mt-1.5 text-[10px] opacity-50">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>

        {/* error banner */}
        {error && (
          <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-300">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
          </div>
        )}

        {/* sticky input bar */}
        {activeProject && (
          <div className="border-t border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#0d0f18]">
            <div className="mx-auto flex max-w-3xl items-end gap-3">
              <textarea
                ref={inputRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Humara to improve your draft, add sources, change format…"
                rows={1}
                className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-zinc-600"
                style={{ minHeight: 42, maxHeight: 160 }}
                onInput={(e) => {
                  const t = e.currentTarget
                  t.style.height = 'auto'
                  t.style.height = `${Math.min(t.scrollHeight, 160)}px`
                }}
              />
              <Button
                onClick={() => void sendMessage()}
                disabled={sending || !message.trim()}
                className="h-[42px] w-[42px] shrink-0 rounded-xl p-0"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
