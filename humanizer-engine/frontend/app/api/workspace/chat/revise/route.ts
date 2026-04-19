import { NextResponse } from 'next/server'
import { requireWorkspaceUser } from '@/lib/workspace/api'
import { getProjectById, reviseProjectToTarget, saveProjectRecord } from '@/lib/workspace/service'

export async function POST(request: Request) {
  try {
    const { supabase, user, error } = await requireWorkspaceUser(request)
    if (error || !supabase || !user) return error

    const body = await request.json()
    const projectId = String(body.projectId || '')
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    }

    const project = await getProjectById(supabase, user.id, projectId)
    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
    }

    const result = reviseProjectToTarget(project)
    await saveProjectRecord(supabase, user.id, result.project)

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Failed to revise project.' }, { status: 500 })
  }
}
