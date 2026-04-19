import { NextResponse } from 'next/server'
import { requireWorkspaceUser } from '@/lib/workspace/api'
import { getProjectById, saveProjectRecord } from '@/lib/workspace/service'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user, error } = await requireWorkspaceUser(request)
    if (error || !supabase || !user) return error

    const { id } = await context.params
    const project = await getProjectById(supabase, user.id, id)

    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
    }

    return NextResponse.json({ project })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch project.' }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user, error } = await requireWorkspaceUser(request)
    if (error || !supabase || !user) return error

    const { id } = await context.params
    const body = await request.json()
    const project = await getProjectById(supabase, user.id, id)

    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
    }

    if (typeof body.title === 'string' && body.title.trim()) {
      project.title = body.title.trim()
    }

    if (body.draft) {
      const draftIndex = project.drafts.findIndex((draft) => draft.id === project.activeDraftId)
      if (draftIndex >= 0) {
        project.drafts[draftIndex] = {
          ...project.drafts[draftIndex],
          ...body.draft,
        }
      }
    }

    project.updatedAt = new Date().toISOString()
    await saveProjectRecord(supabase, user.id, project)

    return NextResponse.json({ project })
  } catch {
    return NextResponse.json({ error: 'Failed to update project.' }, { status: 500 })
  }
}
