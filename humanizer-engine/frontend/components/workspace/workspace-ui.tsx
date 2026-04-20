'use client'

import Link from 'next/link'
import {
  ArrowUpRight,
  BookOpen,
  FileDown,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Layers3,
  Presentation,
  Search,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { WorkspaceProject, WorkspaceScoreReport, WorkspaceSource } from '@/lib/workspace/types'

/* ── Page header (used by scholar + document pages) ── */
export function WorkspacePageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">{description}</p>}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  )
}

/* ── Compact stat row (used by document page) ── */
export function WorkspaceStatGrid({ project }: { project: WorkspaceProject | null }) {
  const latestScore = project?.scoreHistory.at(-1)
  const activeDraft = project?.drafts.find((d) => d.id === project.activeDraftId) ?? project?.drafts.at(-1)
  const wordCount = activeDraft?.contentMarkdown.split(/\s+/).filter(Boolean).length ?? 0

  const stats = [
    { label: 'Score', value: latestScore ? `${latestScore.overallScore}/100` : '—', icon: GraduationCap, tone: 'text-emerald-500' },
    { label: 'Sources', value: project ? String(project.sourceLibrary.length) : '—', icon: BookOpen, tone: 'text-violet-500' },
    { label: 'Words', value: wordCount.toLocaleString(), icon: FileText, tone: 'text-amber-500' },
    { label: 'Tokens', value: project ? `${(project.workspaceCredits.used / 1000).toFixed(1)}k` : '—', icon: Layers3, tone: 'text-cyan-500' },
  ]

  return (
    <div className="flex flex-wrap gap-4">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-2 text-sm">
          <s.icon className={cn('h-4 w-4', s.tone)} />
          <span className="font-medium text-slate-900 dark:text-white">{s.value}</span>
          <span className="text-slate-400 dark:text-zinc-600">{s.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Source cards (used by scholar + document pages) ── */
export function SourceCards({ sources, compact = false }: { sources: WorkspaceSource[]; compact?: boolean }) {
  return (
    <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2')}>
      {sources.map((source) => (
        <div key={source.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-white">{source.title}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-zinc-500">{source.authors.join(', ')} · {source.journal} · {source.year}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {source.openAccess && <Badge className="bg-emerald-500 text-[10px] hover:bg-emerald-500">OA</Badge>}
              <Badge variant="outline" className="text-[10px]">Q{source.qualityScore}</Badge>
            </div>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-zinc-400">{source.abstractPreview}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400 dark:text-zinc-600">
            <span>DOI: {source.doi ?? 'N/A'}</span>
            <span>{source.citationCount} cites</span>
            {source.fullTextUrl && (
              <Link href={source.fullTextUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-600 hover:underline dark:text-cyan-400">
                Full text <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Score panel (used by document page) ── */
export function ScorePanel({ score }: { score: WorkspaceScoreReport | null }) {
  if (!score) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-zinc-600">
        Not graded yet.
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-900 dark:text-white">Score</span>
        <span className={cn(
          'rounded-full px-2.5 py-0.5 text-xs font-semibold',
          score.overallScore >= 90
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
        )}>
          {score.overallScore}/100
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(score.dimensions).map(([k, v]) => (
          <div key={k} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/5">
            <div className="text-[11px] text-slate-500 dark:text-zinc-500">{k.replace(/([A-Z])/g, ' $1')}</div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">{v}</div>
          </div>
        ))}
      </div>
      {score.blockingWeaknesses.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase text-slate-500 dark:text-zinc-500">Weaknesses</div>
          <ul className="space-y-1 text-xs text-slate-600 dark:text-zinc-400">
            {score.blockingWeaknesses.map((w) => <li key={w}>• {w}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ── Export toolbar (used by document page) ── */
export function ExportToolbar({ onExport }: { onExport: (type: 'docx' | 'pdf' | 'xlsx' | 'pptx') => void }) {
  const items = [
    { type: 'docx' as const, label: 'DOCX', icon: FileText },
    { type: 'pdf' as const, label: 'PDF', icon: FileDown },
    { type: 'xlsx' as const, label: 'XLSX', icon: FileSpreadsheet },
    { type: 'pptx' as const, label: 'PPTX', icon: Presentation },
  ]

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Button key={item.type} variant="outline" size="sm" onClick={() => onExport(item.type)} className="h-7 gap-1 text-xs">
          <item.icon className="h-3 w-3" />
          {item.label}
        </Button>
      ))}
    </div>
  )
}

/* ── Scholar empty state ── */
export function ScholarEmptyState({ onSuggestedQuery }: { onSuggestedQuery: (query: string) => void }) {
  const suggestions = ['academic workspace ai', 'automated feedback rubric', 'higher education generative ai']
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="rounded-full bg-cyan-500/10 p-3 text-cyan-600 dark:text-cyan-300">
        <Search className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">Search scholarly sources</h3>
        <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-zinc-400">Find papers by topic, then add them to your active project.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((q) => (
          <Button key={q} variant="secondary" size="sm" onClick={() => onSuggestedQuery(q)}>
            {q}
          </Button>
        ))}
      </div>
    </div>
  )
}
