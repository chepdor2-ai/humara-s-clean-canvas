'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Loader2, Plus, RefreshCcw, Send, WandSparkles } from 'lucide-react'
import { useAuth } from '@/app/AuthProvider'
import {
  ArtifactPreview,
  ExportToolbar,
  MessageThread,
  ProgressRail,
  ProjectMiniSidebar,
  ScorePanel,
  WorkspaceControlTabs,
  WorkspacePageHeader,
  WorkspaceStatGrid,
} from '@/components/workspace/workspace-ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { workspaceFetch, getActiveDraft, getLatestScore, downloadBlob } from '@/lib/workspace/client'
import type { WorkspaceProject } from '@/lib/workspace/types'

export default function WorkspaceChatPage() {
  const { session } = useAuth()
  const [projects, setProjects] = useState<WorkspaceProject[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('Make it more critical and add 2 more scholarly sources.')
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState(false)
  const [busyAction, setBusyAction] = useState<'regrade' | 'revise' | 'export' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!session?.access_token) return
      setLoading(true)
      setError(null)
      try {
        const data = await workspaceFetch<{ projects: WorkspaceProject[] }>(session.access_token, '/api/workspace/projects')
        setProjects(data.projects)
        setActiveProjectId((current) => current ?? data.projects[0]?.id ?? null)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load workspace projects.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [session?.access_token])

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null,
    [activeProjectId, projects],
  )
  const activeDraft = getActiveDraft(activeProject)
  const latestScore = getLatestScore(activeProject)

  const updateProject = (project: WorkspaceProject) => {
    setProjects((current) => current.map((item) => (item.id === project.id ? project : item)))
  }

  const createProject = async () => {
    if (!session?.access_token) return
    setCreating(true)
    setError(null)
    try {
      const data = await workspaceFetch<{ project: WorkspaceProject }>(session.access_token, '/api/workspace/projects', {
        method: 'POST',
        body: JSON.stringify({
          title: 'New Academic Workbench Project',
          instructions: 'Create a structured academic draft with clear sections, scholarly evidence, and a grading target of 90 or above.',
          rubric: 'Reward analytical depth, structure, evidence quality, and clean academic formatting.',
          uploads: ['lecture-notes.pdf'],
          citationStyle: 'APA 7',
          targetWordCount: 1500,
        }),
      })
      setProjects((current) => [data.project, ...current])
      setActiveProjectId(data.project.id)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create project.')
    } finally {
      setCreating(false)
    }
  }

  const sendMessage = async () => {
    if (!session?.access_token || !activeProject || !message.trim()) return
    setSending(true)
    setError(null)
    try {
      const data = await workspaceFetch<{ project: WorkspaceProject }>(session.access_token, '/api/workspace/chat/send', {
        method: 'POST',
        body: JSON.stringify({ projectId: activeProject.id, prompt: message }),
      })
      updateProject(data.project)
      setMessage('')
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Failed to send message.')
    } finally {
      setSending(false)
    }
  }

  const regradeProject = async () => {
    if (!session?.access_token || !activeProject) return
    setBusyAction('regrade')
    setError(null)
    try {
      const data = await workspaceFetch<{ project: WorkspaceProject }>(session.access_token, '/api/workspace/chat/regrade', {
        method: 'POST',
        body: JSON.stringify({ projectId: activeProject.id }),
      })
      updateProject(data.project)
    } catch (regradeError) {
      setError(regradeError instanceof Error ? regradeError.message : 'Failed to regrade project.')
    } finally {
      setBusyAction(null)
    }
  }

  const reviseProject = async () => {
    if (!session?.access_token || !activeProject) return
    setBusyAction('revise')
    setError(null)
    try {
      const data = await workspaceFetch<{ project: WorkspaceProject }>(session.access_token, '/api/workspace/chat/revise', {
        method: 'POST',
        body: JSON.stringify({ projectId: activeProject.id }),
      })
      updateProject(data.project)
    } catch (reviseError) {
      setError(reviseError instanceof Error ? reviseError.message : 'Failed to revise project.')
    } finally {
      setBusyAction(null)
    }
  }

  const exportProject = async (type: 'docx' | 'pdf' | 'xlsx' | 'pptx') => {
    if (!session?.access_token || !activeProject) return
    setBusyAction('export')
    setError(null)
    try {
      const data = await workspaceFetch<{ artifact: { fileName: string }; mimeType: string; base64: string }>(session.access_token, '/api/workspace/export', {
        method: 'POST',
        body: JSON.stringify({ projectId: activeProject.id, type }),
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

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 lg:px-8 lg:py-8">
      <WorkspacePageHeader
        eyebrow="Academic workbench"
        title="Claude-like project workspace"
        description="Chat, source collection, grading, revision-to-90, and the live final document now sit on top of your existing Humara product as a separate scholarly workspace."
        action={
          <>
            <Button variant="outline" onClick={createProject} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              New project
            </Button>
            <Button asChild>
              <Link href="/workspace/scholar">
                Open scholar search
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </>
        }
      />

      <WorkspaceStatGrid project={activeProject} />

      {error ? (
        <div className="rounded-2xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <ProjectMiniSidebar
            projects={projects}
            activeProjectId={activeProject?.id ?? null}
            onSelect={setActiveProjectId}
          />
          {activeProject ? <ProgressRail progress={activeProject.progress} /> : null}
        </div>

        <div className="space-y-6">
          {activeProject ? <MessageThread messages={activeProject.messages} /> : null}
          <Card className="gap-4 bg-white/90 py-4 dark:bg-[#0d0f18]/90">
            <CardHeader className="px-4 pb-0">
              <CardTitle className="text-sm">Continuous improvement chat</CardTitle>
              <CardDescription>Tell Humara to strengthen sections, change citation style, add sources, or convert the artifact into new deliverables.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pt-0">
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-[120px] rounded-2xl"
                placeholder="Make section 3 stronger, reduce repetition, convert to APA 7, or add 2 more scholarly sources."
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={sendMessage} disabled={sending || !message.trim()}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send
                </Button>
                <Button variant="outline" onClick={regradeProject} disabled={busyAction !== null}>
                  {busyAction === 'regrade' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  Regrade
                </Button>
                <Button variant="secondary" onClick={reviseProject} disabled={busyAction !== null}>
                  {busyAction === 'revise' ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                  Auto-revise to 90+
                </Button>
              </div>
            </CardContent>
          </Card>
          {activeProject && activeDraft ? <ArtifactPreview project={activeProject} draft={activeDraft} /> : null}
        </div>

        <div className="space-y-6">
          {activeProject ? <WorkspaceControlTabs project={activeProject} score={latestScore} /> : null}
          <Card className="gap-4 bg-white/90 py-4 dark:bg-[#0d0f18]/90">
            <CardHeader className="px-4 pb-0">
              <CardTitle className="text-sm">Export panel</CardTitle>
              <CardDescription>Export the artifact to Word or PDF now, with spreadsheet and slide blueprints also available.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pt-0">
              <ExportToolbar onExport={exportProject} />
              {activeProject ? <ScorePanel score={latestScore} /> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
