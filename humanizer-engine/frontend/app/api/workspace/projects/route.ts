import { NextResponse } from 'next/server'
import { requireWorkspaceUser } from '@/lib/workspace/api'
import { createProjectRecord, listProjects } from '@/lib/workspace/service'

export async function GET(request: Request) {
  try {
    const { supabase, user, error } = await requireWorkspaceUser(request)
    if (error || !supabase || !user) return error

    const projects = await listProjects(supabase, user.id)
    return NextResponse.json({ projects })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch workspace projects.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user, error } = await requireWorkspaceUser(request)
    if (error || !supabase || !user) return error

    const body = await request.json()
    const project = await createProjectRecord(supabase, user.id, {
      title: String(body.title || 'Untitled Workspace Project'),
      instructions: String(body.instructions || 'Create a structured academic draft from the provided brief.'),
      rubric: typeof body.rubric === 'string' ? body.rubric : '',
      uploads: Array.isArray(body.uploads) ? body.uploads.map(String) : [],
      citationStyle: typeof body.citationStyle === 'string' ? body.citationStyle : undefined,
      targetWordCount: typeof body.targetWordCount === 'number' ? body.targetWordCount : undefined,
    })

    return NextResponse.json({ project }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create workspace project.' }, { status: 500 })
  }
}
