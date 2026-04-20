'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Loader2, RefreshCcw, Save, WandSparkles } from 'lucide-react'
import { useAuth } from '@/app/AuthProvider'
import {
  ExportToolbar,
  ScorePanel,
  SourceCards,
  WorkspacePageHeader,
  WorkspaceStatGrid,
} from '@/components/workspace/workspace-ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { buildDraftFromSections, downloadBlob, getActiveDraft, getLatestScore, workspaceFetch } from '@/lib/workspace/client'
import type { WorkspaceDraftSection, WorkspaceProject } from '@/lib/workspace/types'

export default function WorkspaceDocumentPage() {
  const { session } = useAuth()
  const params = useParams<{ projectId: string }>()
  const projectId = typeof params?.projectId === 'string' ? params.projectId : ''
  const [project, setProject] = useState<WorkspaceProject | null>(null)
  const [title, setTitle] = useState('')
  const [sections, setSections] = useState<WorkspaceDraftSection[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyAction, setBusyAction] = useState<'regrade' | 'revise' | 'export' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const token = session?.access_token

  useEffect(() => {
    if (!token || !projectId) return
    setLoading(true)
    setError(null)
    workspaceFetch<{ project: WorkspaceProject }>(token, `/api/workspace/projects/${projectId}`)
      .then((d) => {
        setProject(d.project)
        const draft = getActiveDraft(d.project)
        setTitle(draft?.contentJson.title ?? d.project.title)
        setSections(draft?.contentJson.sections ?? [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load document.'))
      .finally(() => setLoading(false))
  }, [projectId, token])

  const latestScore = useMemo(() => getLatestScore(project), [project])
  const activeDraft = useMemo(() => getActiveDraft(project), [project])

  const save = async () => {
    if (!token || !project) return
    const updated = buildDraftFromSections(project, title, sections)
    if (!updated) return
    setSaving(true)
    setError(null)
    try {
      const d = await workspaceFetch<{ project: WorkspaceProject }>(token, `/api/workspace/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, draft: updated }),
      })
      setProject(d.project)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const regrade = async () => {
    if (!token || !project) return
    setBusyAction('regrade')
    try {
      const d = await workspaceFetch<{ project: WorkspaceProject }>(token, '/api/workspace/chat/regrade', {
        method: 'POST',
        body: JSON.stringify({ projectId: project.id }),
      })
      setProject(d.project)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Regrade failed.')
    } finally {
      setBusyAction(null)
    }
  }

  const revise = async () => {
    if (!token || !project) return
    setBusyAction('revise')
    try {
      const d = await workspaceFetch<{ project: WorkspaceProject }>(token, '/api/workspace/chat/revise', {
        method: 'POST',
        body: JSON.stringify({ projectId: project.id }),
      })
      setProject(d.project)
      const draft = getActiveDraft(d.project)
      setTitle(draft?.contentJson.title ?? d.project.title)
      setSections(draft?.contentJson.sections ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revision failed.')
    } finally {
      setBusyAction(null)
    }
  }

  const exportDoc = async (type: 'docx' | 'pdf' | 'xlsx' | 'pptx') => {
    if (!token || !project) return
    setBusyAction('export')
    try {
      const d = await workspaceFetch<{ artifact: { fileName: string }; mimeType: string; base64: string }>(token, '/api/workspace/export', {
        method: 'POST',
        body: JSON.stringify({ projectId: project.id, type }),
      })
      downloadBlob(d.base64, d.mimeType, d.artifact.fileName)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setBusyAction(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-500" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex h-[calc(100vh-64px)] flex-col items-center justify-center gap-4">
        <p className="text-sm text-slate-500 dark:text-zinc-400">Project not found.</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/workspace/chat">Back to chat</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 lg:py-8">
      {/* header row */}
      <WorkspacePageHeader
        title={project.title}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/workspace/chat">Back to chat</Link>
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={regrade} disabled={busyAction !== null}>
              {busyAction === 'regrade' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
              Regrade
            </Button>
            <Button size="sm" variant="ghost" onClick={revise} disabled={busyAction !== null}>
              {busyAction === 'revise' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}
              Revise to 90+
            </Button>
            <ExportToolbar onExport={exportDoc} />
          </div>
        }
      />

      <WorkspaceStatGrid project={project} />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* editor */}
        <div className="space-y-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-10 border-none bg-transparent px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
            placeholder="Document title"
          />
          {sections.map((section, i) => (
            <div key={section.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0d0f18]">
              <Input
                value={section.title}
                onChange={(e) => setSections((cur) => cur.map((s, si) => si === i ? { ...s, title: e.target.value } : s))}
                className="mb-2 border-none bg-transparent px-0 text-base font-semibold shadow-none focus-visible:ring-0"
              />
              <Textarea
                value={section.body}
                onChange={(e) => setSections((cur) => cur.map((s, si) => si === i ? { ...s, body: e.target.value } : s))}
                className="min-h-[140px] resize-none border-slate-200 text-sm leading-7 dark:border-white/10"
              />
              <div className="mt-2 text-[11px] text-slate-400 dark:text-zinc-600">
                {section.goal}{section.citations.length > 0 ? ` · ${section.citations.join(', ')}` : ''}
              </div>
            </div>
          ))}
        </div>

        {/* right rail: score + sources + versions */}
        <div className="space-y-4">
          <ScorePanel score={latestScore} />

          {project.sourceLibrary.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-zinc-500">Sources</h4>
              <SourceCards sources={project.sourceLibrary} compact />
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-zinc-500">Versions</h4>
            {project.drafts.slice().reverse().map((draft) => (
              <div key={draft.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/5">
                <div>
                  <div className="text-xs font-medium text-slate-900 dark:text-white">v{draft.versionNumber}</div>
                  <div className="text-[10px] text-slate-400 dark:text-zinc-600">{draft.status}</div>
                </div>
                {draft.id === activeDraft?.id && (
                  <span className="text-[10px] font-semibold text-cyan-600 dark:text-cyan-400">Active</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
