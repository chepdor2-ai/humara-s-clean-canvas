'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BookMarked, ExternalLink, Loader2, Plus, Search } from 'lucide-react'
import { useAuth } from '@/app/AuthProvider'
import {
  ProjectMiniSidebar,
  ScholarEmptyState,
  SourceCards,
  WorkspacePageHeader,
  WorkspaceStatGrid,
} from '@/components/workspace/workspace-ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { workspaceFetch } from '@/lib/workspace/client'
import type { WorkspaceProject, WorkspaceSource } from '@/lib/workspace/types'

export default function WorkspaceScholarPage() {
  const { session } = useAuth()
  const [projects, setProjects] = useState<WorkspaceProject[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [query, setQuery] = useState('academic workspace ai')
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingResults, setLoadingResults] = useState(false)
  const [results, setResults] = useState<WorkspaceSource[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!session?.access_token) return
      setLoadingProjects(true)
      try {
        const data = await workspaceFetch<{ projects: WorkspaceProject[] }>(session.access_token, '/api/workspace/projects')
        setProjects(data.projects)
        setActiveProjectId(data.projects[0]?.id ?? null)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load workspace projects.')
      } finally {
        setLoadingProjects(false)
      }
    }
    void load()
  }, [session?.access_token])

  const search = async (nextQuery = query) => {
    if (!session?.access_token) return
    setLoadingResults(true)
    setError(null)
    try {
      const params = new URLSearchParams({ q: nextQuery, openAccessOnly: 'false', sort: 'relevance' })
      const data = await workspaceFetch<{ results: WorkspaceSource[] }>(session.access_token, `/api/workspace/scholar/search?${params.toString()}`)
      setResults(data.results)
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Failed to search sources.')
    } finally {
      setLoadingResults(false)
    }
  }

  useEffect(() => {
    if (!session?.access_token) return
    void search('academic workspace ai')
  }, [session?.access_token])

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null,
    [activeProjectId, projects],
  )

  const addSource = async (sourceId: string) => {
    if (!session?.access_token || !activeProject) return
    setError(null)
    try {
      const data = await workspaceFetch<{ project: WorkspaceProject }>(session.access_token, '/api/workspace/scholar/add-source', {
        method: 'POST',
        body: JSON.stringify({ projectId: activeProject.id, sourceId }),
      })
      setProjects((current) => current.map((project) => (project.id === data.project.id ? data.project : project)))
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Failed to add source to project.')
    }
  }

  if (loadingProjects) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-500" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 lg:px-8 lg:py-8">
      <WorkspacePageHeader
        eyebrow="Scholarly search"
        title="Project-connected source discovery"
        description="Search scholarly material, filter for strong evidence, and move sources directly into the active paper project instead of treating research as a disconnected step."
        action={
          <Button asChild>
            <Link href="/workspace/chat">Back to chat workspace</Link>
          </Button>
        }
      />

      <WorkspaceStatGrid project={activeProject} />

      {error ? (
        <div className="rounded-2xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <ProjectMiniSidebar projects={projects} activeProjectId={activeProject?.id ?? null} onSelect={setActiveProjectId} />

        <div className="space-y-6">
          <Card className="gap-4 bg-white/90 py-4 dark:bg-[#0d0f18]/90">
            <CardHeader className="px-4 pb-0">
              <CardTitle className="text-sm">Lightweight Google Scholar for Humara projects</CardTitle>
              <CardDescription>Search by topic now, then add sources into the current project library with one click.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pt-0">
              <div className="flex flex-col gap-3 lg:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="h-11 rounded-2xl pl-10"
                    placeholder="Search sources, authors, journals, or topics"
                  />
                </div>
                <Button className="h-11 rounded-2xl" onClick={() => void search(query)} disabled={loadingResults}>
                  {loadingResults ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Search
                </Button>
              </div>
            </CardContent>
          </Card>

          {results.length === 0 && !loadingResults ? (
            <ScholarEmptyState onSuggestedQuery={(nextQuery) => { setQuery(nextQuery); void search(nextQuery) }} />
          ) : (
            <div className="grid gap-4">
              {results.map((source) => (
                <Card key={source.id} className="gap-4 bg-white/90 py-4 dark:bg-[#0d0f18]/90">
                  <CardHeader className="px-4 pb-0">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <CardTitle className="text-base leading-6">{source.title}</CardTitle>
                        <CardDescription className="mt-2">{source.authors.join(', ')} · {source.journal} · {source.year}</CardDescription>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-zinc-500">
                        <span>{source.citationCount} citations</span>
                        <span>Quality {source.qualityScore}</span>
                        <span>{source.openAccess ? 'Open access' : 'Limited access'}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 px-4 pt-0">
                    <p className="text-sm leading-6 text-slate-600 dark:text-zinc-400">{source.abstractPreview}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => addSource(source.id)}>
                        <Plus className="h-4 w-4" />
                        Add to current project
                      </Button>
                      {source.fullTextUrl ? (
                        <Button variant="secondary" size="sm" asChild>
                          <Link href={source.fullTextUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            Open full text
                          </Link>
                        </Button>
                      ) : null}
                      {activeProject ? (
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/workspace/document/${activeProject.id}`}>
                            <BookMarked className="h-4 w-4" />
                            Open in project editor
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {activeProject ? (
            <Card className="gap-4 bg-white/90 py-4 dark:bg-[#0d0f18]/90">
              <CardHeader className="px-4 pb-0">
                <CardTitle className="text-sm">Current project library</CardTitle>
                <CardDescription>These sources are already attached to the active project and available for drafting or revision.</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pt-0">
                <SourceCards sources={activeProject.sourceLibrary} compact />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
