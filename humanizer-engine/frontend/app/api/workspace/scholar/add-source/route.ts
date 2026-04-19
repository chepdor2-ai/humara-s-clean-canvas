import { NextResponse } from 'next/server'
import { requireWorkspaceUser } from '@/lib/workspace/api'
import { getProjectById, saveProjectRecord, scholarlyCatalog } from '@/lib/workspace/service'

export async function POST(request: Request) {
  try {
    const { supabase, user, error } = await requireWorkspaceUser(request)
    if (error || !supabase || !user) return error

    const body = await request.json()
    const projectId = String(body.projectId || '')
    const sourceId = String(body.sourceId || '')

    if (!projectId || !sourceId) {
      return NextResponse.json({ error: 'projectId and sourceId are required.' }, { status: 400 })
    }

    const project = await getProjectById(supabase, user.id, projectId)
    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
    }

    const source = scholarlyCatalog.find((item) => item.id === sourceId)
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
