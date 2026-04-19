import { NextResponse } from 'next/server'
import { requireWorkspaceUser } from '@/lib/workspace/api'
import { createExportArtifact, getProjectById, saveProjectRecord } from '@/lib/workspace/service'

export async function POST(request: Request) {
  try {
    const { supabase, user, error } = await requireWorkspaceUser(request)
    if (error || !supabase || !user) return error

    const body = await request.json()
    const projectId = String(body.projectId || '')
    const type = body.type as 'docx' | 'pdf' | 'xlsx' | 'pptx'

    if (!projectId || !type) {
      return NextResponse.json({ error: 'projectId and type are required.' }, { status: 400 })
    }

    const project = await getProjectById(supabase, user.id, projectId)
    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
    }

    const exportResult = await createExportArtifact(project, type)
    project.exports.push(exportResult.artifact)
    project.updatedAt = new Date().toISOString()
    await saveProjectRecord(supabase, user.id, project)

    return NextResponse.json(exportResult)
  } catch {
    return NextResponse.json({ error: 'Failed to export project.' }, { status: 500 })
  }
}
