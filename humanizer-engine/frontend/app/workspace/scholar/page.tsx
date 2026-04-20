'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Loader2, Plus, Search } from 'lucide-react'
import { useAuth } from '@/app/AuthProvider'
import {
  ScholarEmptyState,
  SourceCards,
  WorkspacePageHeader,
} from '@/components/workspace/workspace-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { workspaceFetch } from '@/lib/workspace/client'
import type { WorkspaceProject, WorkspaceSource } from '@/lib/workspace/types'

export default function WorkspaceScholarPage() {
  const { session } = useAuth()
  const [projects, setProjects] = useState<WorkspaceProject[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingResults, setLoadingResults] = useState(false)
  const [results, setResults] = useState<WorkspaceSource[]>([])
  const [error, setError] = useState<string | null>(null)

  const token = session?.access_token

  useEffect(() => {
    if (!token) return
    setLoadingProjects(true)
    workspaceFetch<{ projects: WorkspaceProject[] }>(token, '/api/workspace/projects')
      .then((d) => {
        setProjects(d.projects)
        setActiveProjectId(d.projects[0]?.id ?? null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load projects.'))
      .finally(() => setLoadingProjects(false))
  }, [token])

  const search = async (q = query) => {
    if (!token || !q.trim()) return
    setLoadingResults(true)
    setError(null)
    try {
      const params = new URLSearchParams({ q, openAccessOnly: 'false', sort: 'relevance' })
      const data = await workspaceFetch<{ results: WorkspaceSource[] }>(token, `/api/workspace/scholar/search?${params.toString()}`)
      setResults(data.results)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed.')
    } finally {
      setLoadingResults(false)
    }
  }

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null,
    [activeProjectId, projects],
  )

  const addSource = async (sourceId: string) => {
    if (!token || !activeProject) return
    try {
      const d = await workspaceFetch<{ project: WorkspaceProject }>(token, '/api/workspace/scholar/add-source', {
        method: 'POST',
        body: JSON.stringify({ projectId: activeProject.id, sourceId }),
      })
      setProjects((cur) => cur.map((p) => (p.id === d.project.id ? d.project : p)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add source.')
    }
  }

  const handleSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void search()
  }

  if (loadingProjects) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-500" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 lg:py-8">
      <WorkspacePageHeader
        title="Scholar Search"
        description="Find and add scholarly sources to your project."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/workspace/chat">Back to chat</Link>
          </Button>
        }
      />

      {/* search bar */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKey}
            className="h-10 rounded-xl pl-10"
            placeholder="Search by topic, author, journal…"
          />
        </div>
        <Button className="h-10 rounded-xl" onClick={() => void search()} disabled={loadingResults || !query.trim()}>
          {loadingResults ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* results */}
      {results.length === 0 && !loadingResults ? (
        <ScholarEmptyState onSuggestedQuery={(q) => { setQuery(q); void search(q) }} />
      ) : (
        <div className="space-y-3">
          {results.map((source) => (
            <div key={source.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0d0f18]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-white">{source.title}</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-zinc-500">{source.authors.join(', ')} · {source.journal} · {source.year}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {source.openAccess && <Badge className="bg-emerald-500 text-[10px] hover:bg-emerald-500">OA</Badge>}
                  <span className="text-[11px] text-slate-400 dark:text-zinc-600">{source.citationCount} cites</span>
                </div>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-zinc-400">{source.abstractPreview}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => addSource(source.id)}>
                  <Plus className="h-3 w-3" /> Add to project
                </Button>
                {source.fullTextUrl && (
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" asChild>
                    <Link href={source.fullTextUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3 w-3" /> Full text
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* project library */}
      {activeProject && activeProject.sourceLibrary.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Project sources ({activeProject.sourceLibrary.length})</h3>
          <SourceCards sources={activeProject.sourceLibrary} compact />
        </div>
      )}
    </div>
  )
}
