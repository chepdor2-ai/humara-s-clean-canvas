import { NextResponse } from 'next/server'
import { requireWorkspaceUser } from '@/lib/workspace/api'
import { getProjectById, saveProjectRecord, scholarlyCatalog } from '@/lib/workspace/service'
import type { WorkspaceSource } from '@/lib/workspace/types'

export async function POST(request: Request) {
  try {
    const { supabase, user, error } = await requireWorkspaceUser(request)
    if (error || !supabase || !user) return error

    const body = await request.json()
    const projectId = String(body.projectId || '')
    const sourceId = String(body.sourceId || '')
    const incomingSource = body.source as Partial<WorkspaceSource> | undefined

    if (!projectId || (!sourceId && !incomingSource?.id)) {
      return NextResponse.json({ error: 'projectId and sourceId or source are required.' }, { status: 400 })
    }

    const project = await getProjectById(supabase, user.id, projectId)
    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
    }

    const source = incomingSource?.id
      ? {
          id: String(incomingSource.id),
          title: String(incomingSource.title || 'Untitled source'),
          authors: Array.isArray(incomingSource.authors) ? incomingSource.authors.map(String) : [],
          journal: String(incomingSource.journal || 'Unknown source'),
          year: Number(incomingSource.year || new Date().getFullYear()),
          publicationDate: incomingSource.publicationDate ?? null,
          doi: incomingSource.doi ?? null,
          abstractPreview: String(incomingSource.abstractPreview || ''),
          openAccess: Boolean(incomingSource.openAccess),
          fullTextUrl: incomingSource.fullTextUrl ?? null,
          sourceUrl: incomingSource.sourceUrl ?? null,
          openAlexId: incomingSource.openAlexId ?? null,
          provider: incomingSource.provider ?? 'openalex',
          citationCount: Number(incomingSource.citationCount || 0),
          qualityScore: Number(incomingSource.qualityScore || 70),
          savedAt: new Date().toISOString(),
          notes: incomingSource.notes,
        } satisfies WorkspaceSource
      : scholarlyCatalog.find((item) => item.id === sourceId)
    if (!source) {
      return NextResponse.json({ error: 'Source not found.' }, { status: 404 })
    }

    if (!project.sourceLibrary.some((item) => item.id === source.id)) {
      project.sourceLibrary.push(source)
      project.updatedAt = new Date().toISOString()
      await saveProjectRecord(supabase, user.id, project)
    }

    return NextResponse.json({ project })
  } catch {
    return NextResponse.json({ error: 'Failed to add source.' }, { status: 500 })
  }
}
