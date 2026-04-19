'use client'

import Link from 'next/link'
import {
  ArrowUpRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock3,
  FileDown,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Layers3,
  MessageSquare,
  Presentation,
  Search,
  Sparkles,
  Target,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { WorkspaceDraft, WorkspaceProject, WorkspaceScoreReport, WorkspaceSource, WorkspaceTaskStep } from '@/lib/workspace/types'

export function WorkspacePageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-[#0d0f18]/90 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-700 dark:text-cyan-300">
          <Sparkles className="h-3.5 w-3.5" />
          {eyebrow}
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white md:text-3xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-zinc-400">{description}</p>
        </div>
      </div>
      {action ? <div className="flex flex-wrap items-center gap-3">{action}</div> : null}
    </div>
  )
}

export function WorkspaceStatGrid({ project }: { project: WorkspaceProject | null }) {
  const latestScore = project?.scoreHistory.at(-1)
  const activeDraft = project?.drafts.find((draft) => draft.id === project.activeDraftId) ?? project?.drafts.at(-1)
  const wordCount = activeDraft?.contentMarkdown.split(/\s+/).filter(Boolean).length ?? 0
  const stats = [
    {
      label: 'Workspace tokens',
      value: project ? `${project.workspaceCredits.used.toLocaleString()} / ${project.workspaceCredits.limit.toLocaleString()}` : '—',
      icon: Layers3,
      tone: 'text-cyan-600 dark:text-cyan-300',
    },
    {
      label: 'Current score',
      value: latestScore ? `${latestScore.overallScore}/100` : 'Not graded',
      icon: GraduationCap,
      tone: 'text-emerald-600 dark:text-emerald-300',
    },
    {
      label: 'Source library',
      value: project ? `${project.sourceLibrary.length} sources` : '—',
      icon: BookOpen,
      tone: 'text-violet-600 dark:text-violet-300',
    },
    {
      label: 'Draft length',
      value: `${wordCount.toLocaleString()} words`,
      icon: FileText,
      tone: 'text-amber-600 dark:text-amber-300',
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="gap-3 bg-white/90 py-5 dark:bg-[#0d0f18]/90">
          <CardHeader className="px-5 pb-0">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-zinc-500">{stat.label}</div>
              <stat.icon className={cn('h-4 w-4', stat.tone)} />
            </div>
          </CardHeader>
          <CardContent className="px-5 pt-0">
            <div className="text-xl font-semibold text-slate-900 dark:text-white">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function ProjectMiniSidebar({
  projects,
  activeProjectId,
  onSelect,
}: {
  projects: WorkspaceProject[]
  activeProjectId: string | null
  onSelect: (projectId: string) => void
}) {
  return (
    <Card className="h-full gap-4 bg-white/90 py-4 dark:bg-[#0d0f18]/90">
      <CardHeader className="px-4 pb-0">
        <CardTitle className="text-sm">Projects</CardTitle>
        <CardDescription>Conversations, drafts, uploads, and revisions stay attached to each workspace project.</CardDescription>
      </CardHeader>
      <CardContent className="px-3 pt-0">
        <div className="space-y-2">
          {projects.map((project) => {
            const active = project.id === activeProjectId
            return (
              <button
                key={project.id}
                onClick={() => onSelect(project.id)}
                className={cn(
                  'w-full rounded-2xl border px-3 py-3 text-left transition-colors',
                  active
                    ? 'border-cyan-500/40 bg-cyan-500/10'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/15',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{project.title}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-zinc-500">{project.citationStyle} · target {project.minimumScoreTarget}+</div>
                  </div>
                  <Badge variant="outline">{project.mode}</Badge>
                </div>
                <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500 dark:text-zinc-500">
                  <span>{project.sourceLibrary.length} sources</span>
                  <span>{project.drafts.length} drafts</span>
                </div>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export function ProgressRail({ progress }: { progress: WorkspaceTaskStep[] }) {
  return (
    <Card className="gap-4 bg-white/90 py-4 dark:bg-[#0d0f18]/90">
      <CardHeader className="px-4 pb-0">
        <CardTitle className="text-sm">Live task progress</CardTitle>
        <CardDescription>Humara shows how the project is moving from instructions to export-ready artifact.</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pt-0">
        <div className="space-y-4">
          {progress.map((step) => (
            <div key={step.id} className="flex items-start gap-3">
              <div className="mt-0.5">
                {step.status === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : step.status === 'current' ? (
                  <Clock3 className="h-4 w-4 text-cyan-500" />
                ) : (
                  <Target className="h-4 w-4 text-slate-400 dark:text-zinc-600" />
                )}
              </div>
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-white">{step.title}</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-zinc-500">{step.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function MessageThread({ messages }: { messages: WorkspaceProject['messages'] }) {
  return (
    <ScrollArea className="h-[520px] rounded-3xl border border-slate-200 bg-white/90 px-4 py-4 dark:border-white/10 dark:bg-[#0d0f18]/90">
      <div className="space-y-4 pr-4">
        {messages.map((message) => (
          <div key={message.id} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm',
                message.role === 'user'
                  ? 'bg-cyan-600 text-white'
                  : message.role === 'assistant'
                    ? 'border border-slate-200 bg-slate-50 text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100'
                    : 'border border-dashed border-slate-300 bg-white text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400',
              )}
            >
              <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] opacity-80">
                {message.role === 'assistant' ? <Bot className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                {message.role}
              </div>
              <p className="whitespace-pre-wrap leading-6">{message.content}</p>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

export function SourceCards({ sources, compact = false }: { sources: WorkspaceSource[]; compact?: boolean }) {
  return (
    <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2')}>
      {sources.map((source) => (
        <Card key={source.id} className="gap-3 bg-white/90 py-4 dark:bg-[#0d0f18]/90">
          <CardHeader className="px-4 pb-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base leading-6">{source.title}</CardTitle>
                <CardDescription className="mt-2">{source.authors.join(', ')} · {source.journal} · {source.year}</CardDescription>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge variant="outline">Q {source.qualityScore}</Badge>
                {source.openAccess ? <Badge className="bg-emerald-500 hover:bg-emerald-500">OA</Badge> : <Badge variant="secondary">Limited</Badge>}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pt-0">
            <p className="text-sm leading-6 text-slate-600 dark:text-zinc-400">{source.abstractPreview}</p>
            <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-zinc-500">
              <span>DOI: {source.doi ?? 'N/A'}</span>
              <span>{source.citationCount} citations</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {source.fullTextUrl ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={source.fullTextUrl} target="_blank" rel="noreferrer">
                    Open full text
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              ) : null}
              <Button variant="secondary" size="sm">Cite this</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function ScorePanel({ score }: { score: WorkspaceScoreReport | null }) {
  if (!score) {
    return (
      <Card className="bg-white/90 py-4 dark:bg-[#0d0f18]/90">
        <CardHeader className="px-4 pb-0">
          <CardTitle className="text-sm">Score</CardTitle>
          <CardDescription>No score report yet.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="gap-4 bg-white/90 py-4 dark:bg-[#0d0f18]/90">
      <CardHeader className="px-4 pb-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Structured score</CardTitle>
            <CardDescription>Target: {score.minimumTarget}+ before final handoff.</CardDescription>
          </div>
          <div className="rounded-2xl bg-cyan-500/10 px-3 py-2 text-right">
            <div className="text-lg font-semibold text-slate-900 dark:text-white">{score.overallScore}</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">overall</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pt-0">
        <div className="grid gap-3 md:grid-cols-2">
          {Object.entries(score.dimensions).map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-zinc-500">{label.replace(/([A-Z])/g, ' $1')}</div>
              <div className="mt-2 text-base font-semibold text-slate-900 dark:text-white">{value}</div>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-zinc-500">Blocking weaknesses</div>
            <ul className="mt-2 space-y-2 text-sm text-slate-600 dark:text-zinc-400">
              {score.blockingWeaknesses.map((item) => (
                <li key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-zinc-500">Revision plan</div>
            <ul className="mt-2 space-y-2 text-sm text-slate-600 dark:text-zinc-400">
              {score.revisionPlan.map((item) => (
                <li key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function ArtifactPreview({ project, draft }: { project: WorkspaceProject; draft: WorkspaceDraft | null }) {
  return (
    <Card className="gap-4 bg-white/90 py-4 dark:bg-[#0d0f18]/90">
      <CardHeader className="px-4 pb-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Final document panel</CardTitle>
            <CardDescription>The artifact remains editable and synced with your workspace instructions.</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/workspace/document/${project.id}`}>Open document editor</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pt-0">
        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-[#0b0d15]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-900 dark:text-white">{draft?.contentJson.title ?? project.title}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-zinc-500">{project.citationStyle} · {project.drafts.length} versions · {project.sourceLibrary.length} sources linked</div>
            </div>
            <Badge variant="outline">Artifact</Badge>
          </div>
          <div className="space-y-4">
            {(draft?.contentJson.sections ?? []).map((section) => (
              <div key={section.id} className="rounded-2xl border border-white bg-white px-4 py-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{section.title}</h3>
                  <div className="text-[11px] text-slate-500 dark:text-zinc-500">{section.citations.length} citations</div>
                </div>
                <p className="text-sm leading-6 text-slate-600 dark:text-zinc-400">{section.body}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function WorkspaceControlTabs({
  project,
  score,
}: {
  project: WorkspaceProject
  score: WorkspaceScoreReport | null
}) {
  return (
    <Tabs defaultValue="instructions" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="instructions">Instructions</TabsTrigger>
        <TabsTrigger value="score">Score</TabsTrigger>
        <TabsTrigger value="sources">Sources</TabsTrigger>
      </TabsList>
      <TabsContent value="instructions">
        <Card className="bg-white/90 py-4 dark:bg-[#0d0f18]/90">
          <CardHeader className="px-4 pb-0">
            <CardTitle className="text-sm">Instruction profile</CardTitle>
            <CardDescription>Structured assignment map extracted from the prompt and rubric.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pt-0 text-sm text-slate-600 dark:text-zinc-400">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">{project.instructions}</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-zinc-500">Rubric</div>
                <div className="mt-2">{project.rubric || 'No rubric uploaded yet.'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-zinc-500">Requirements</div>
                <ul className="mt-2 space-y-2">
                  {project.instructionProfile.requiredSections.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="score">
        <ScorePanel score={score} />
      </TabsContent>
      <TabsContent value="sources">
        <Card className="bg-white/90 py-4 dark:bg-[#0d0f18]/90">
          <CardHeader className="px-4 pb-0">
            <CardTitle className="text-sm">Source library</CardTitle>
            <CardDescription>Saved research that can be cited, quoted, and pulled into revisions.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pt-0">
            <SourceCards sources={project.sourceLibrary} compact />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

export function ExportToolbar({ onExport }: { onExport: (type: 'docx' | 'pdf' | 'xlsx' | 'pptx') => void }) {
  const items = [
    { type: 'docx' as const, label: 'Export DOCX', icon: FileText },
    { type: 'pdf' as const, label: 'Export PDF', icon: FileDown },
    { type: 'xlsx' as const, label: 'Export XLSX', icon: FileSpreadsheet },
    { type: 'pptx' as const, label: 'Export PPTX', icon: Presentation },
  ]

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Button key={item.type} variant="outline" size="sm" onClick={() => onExport(item.type)}>
          <item.icon className="h-4 w-4" />
          {item.label}
        </Button>
      ))}
    </div>
  )
}

export function ScholarEmptyState({ onSuggestedQuery }: { onSuggestedQuery: (query: string) => void }) {
  const suggestions = ['academic workspace ai', 'automated feedback rubric', 'higher education generative ai']
  return (
    <Card className="bg-white/90 py-10 dark:bg-[#0d0f18]/90">
      <CardContent className="flex flex-col items-center gap-4 px-6 text-center">
        <div className="rounded-full bg-cyan-500/10 p-4 text-cyan-600 dark:text-cyan-300">
          <Search className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Search your scholarly layer</h3>
          <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-zinc-400">Find sources by topic, year, author, journal, open-access availability, or citation strength, then attach them directly to the active project.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map((query) => (
            <Button key={query} variant="secondary" size="sm" onClick={() => onSuggestedQuery(query)}>
              {query}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
