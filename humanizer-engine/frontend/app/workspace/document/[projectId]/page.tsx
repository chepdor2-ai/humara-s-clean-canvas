'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { GitCompareArrows, Loader2, RefreshCcw, Save, WandSparkles } from 'lucide-react'
import { useAuth } from '@/app/AuthProvider'
import {
  ExportToolbar,
  ScorePanel,
  SourceCards,
  WorkspacePageHeader,
  WorkspaceStatGrid,
} from '@/components/workspace/workspace-ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

  useEffect(() => {
    const load = async () => {
      if (!session?.access_token || !projectId) return
      setLoading(true)
      setError(null)
      try {
        const data = await workspaceFetch<{ project: WorkspaceProject }>(session.access_token, `/api/workspace/projects/${projectId}`)
        setProject(data.project)
        const activeDraft = getActiveDraft(data.project)
        setTitle(activeDraft?.contentJson.title ?? data.project.title)
        setSections(activeDraft?.contentJson.sections ?? [])
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load document workspace.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [projectId, session?.access_token])

  const latestScore = useMemo(() => getLatestScore(project), [project])
  const activeDraft = useMemo(() => getActiveDraft(project), [project])

  const saveDocument = async () => {
    if (!session?.access_token || !project) return
    const updatedDraft = buildDraftFromSections(project, title, sections)
    if (!updatedDraft) return
    setSaving(true)
    setError(null)
    try {
      const data = await workspaceFetch<{ project: WorkspaceProject }>(session.access_token, `/api/workspace/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, draft: updatedDraft }),
      })
      setProject(data.project)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save document.')
    } finally {
      setSaving(false)
    }
  }

  const regradeProject = async () => {
    if (!session?.access_token || !project) return
    setBusyAction('regrade')
    setError(null)
    try {
      const data = await workspaceFetch<{ project: WorkspaceProject }>(session.access_token, '/api/workspace/chat/regrade', {
        method: 'POST',
        body: JSON.stringify({ projectId: project.id }),
      })
      setProject(data.project)
    } catch (regradeError) {
      setError(regradeError instanceof Error ? regradeError.message : 'Failed to regrade project.')
    } finally {
      setBusyAction(null)
    }
  }

  const reviseProject = async () => {
    if (!session?.access_token || !project) return
    setBusyAction('revise')
    setError(null)
    try {
      const data = await workspaceFetch<{ project: WorkspaceProject }>(session.access_token, '/api/workspace/chat/revise', {
        method: 'POST',
        body: JSON.stringify({ projectId: project.id }),
      })
      setProject(data.project)
      const draft = getActiveDraft(data.project)
      setTitle(draft?.contentJson.title ?? data.project.title)
      setSections(draft?.contentJson.sections ?? [])
    } catch (reviseError) {
      setError(reviseError instanceof Error ? reviseError.message : 'Failed to revise project.')
    } finally {
      setBusyAction(null)
    }
  }

  const exportProject = async (type: 'docx' | 'pdf' | 'xlsx' | 'pptx') => {
    if (!session?.access_token || !project) return
    setBusyAction('export')
    setError(null)
    try {
      const data = await workspaceFetch<{ artifact: { fileName: string }; mimeType: string; base64: string }>(session.access_token, '/api/workspace/export', {
        method: 'POST',
        body: JSON.stringify({ projectId: project.id, type }),
      })
      downloadBlob(data.base64, data.mimeType, data.artifact.fileName)
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Failed to export project.')
    } finally {
      setBusyAction(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-500" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Project not found</CardTitle>
            <CardDescription>The requested document workspace is unavailable.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/workspace/chat">Back to workspace chat</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-6 px-4 py-6 lg:px-8 lg:py-8">
      <WorkspacePageHeader
        eyebrow="Editable artifact"
        title="Document workspace"
        description="Edit the final document directly, keep versioned project state, regrade or auto-revise on demand, and export into submission-friendly deliverables."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/workspace/chat">Back to chat</Link>
            </Button>
            <Button onClick={saveDocument} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save document
            </Button>
          </div>
        }
      />

      <WorkspaceStatGrid project={project} />

      {error ? (
        <div className="rounded-2xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card className="gap-5 bg-white/90 py-4 dark:bg-[#0d0f18]/90">
            <CardHeader className="px-4 pb-0">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-sm">Rich document editor</CardTitle>
                  <CardDescription>Edit headings, structure, citations, and section content before export.</CardDescription>
                </div>
                <ExportToolbar onExport={exportProject} />
              </div>
            </CardHeader>
            <CardContent className="space-y-6 px-4 pt-0">
              <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-[#0b0d15]">
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mb-6 h-12 rounded-2xl border-none bg-transparent px-0 text-3xl font-semibold shadow-none focus-visible:ring-0"
                />
                <div className="space-y-5">
                  {sections.map((section, index) => (
                    <div key={section.id} className="rounded-2xl border border-white bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                      <Input
                        value={section.title}
                        onChange={(event) => {
                          setSections((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))
                        }}
                        className="mb-3 rounded-xl border-slate-200 bg-transparent text-lg font-semibold dark:border-white/10"
                      />
                      <Textarea
                        value={section.body}
                        onChange={(event) => {
                          setSections((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, body: event.target.value } : item))
                        }}
                        className="min-h-[180px] rounded-2xl border-slate-200 leading-7 dark:border-white/10"
                      />
                      <div className="mt-3 text-xs text-slate-500 dark:text-zinc-500">Goal: {section.goal} · Citations: {section.citations.join(', ') || 'None'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-4 bg-white/90 py-4 dark:bg-[#0d0f18]/90">
            <CardHeader className="px-4 pb-0">
              <CardTitle className="text-sm">Version controls</CardTitle>
              <CardDescription>Compare draft versions, regrade the current artifact, or run the section-based revision engine again.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 px-4 pt-0">
              <Button variant="outline" onClick={regradeProject} disabled={busyAction !== null}>
                {busyAction === 'regrade' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                Regrade paper
              </Button>
              <Button variant="secondary" onClick={reviseProject} disabled={busyAction !== null}>
                {busyAction === 'revise' ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                Auto-revise
              </Button>
              <Button variant="ghost" disabled>
                <GitCompareArrows className="h-4 w-4" />
                Compare versions
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <ScorePanel score={latestScore} />
          <Card className="gap-4 bg-white/90 py-4 dark:bg-[#0d0f18]/90">
            <CardHeader className="px-4 pb-0">
              <CardTitle className="text-sm">Draft history</CardTitle>
              <CardDescription>Track changes style timeline for the current project.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pt-0">
              {project.drafts.slice().reverse().map((draft) => (
                <div key={draft.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-white">Version {draft.versionNumber}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-zinc-500">{draft.status} · {new Date(draft.updatedAt).toLocaleString()}</div>
                    </div>
                    {draft.id === activeDraft?.id ? <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-600 dark:text-cyan-300">Active</div> : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="gap-4 bg-white/90 py-4 dark:bg-[#0d0f18]/90">
            <CardHeader className="px-4 pb-0">
              <CardTitle className="text-sm">Side-by-side source panel</CardTitle>
              <CardDescription>Saved sources stay visible while you edit the artifact.</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pt-0">
              <SourceCards sources={project.sourceLibrary} compact />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
