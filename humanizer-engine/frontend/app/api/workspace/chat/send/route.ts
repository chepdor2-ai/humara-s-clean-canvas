import { NextResponse } from 'next/server'
import { requireWorkspaceUser } from '@/lib/workspace/api'
import { buildAssistantReply, getProjectById, saveProjectRecord } from '@/lib/workspace/service'

export async function POST(request: Request) {
  try {
    const { supabase, user, error } = await requireWorkspaceUser(request)
    if (error || !supabase || !user) return error

    const body = await request.json()
    const projectId = String(body.projectId || '')
    const prompt = String(body.prompt || '')

    if (!projectId || !prompt.trim()) {
      return NextResponse.json({ error: 'projectId and prompt are required.' }, { status: 400 })
    }

    const project = await getProjectById(supabase, user.id, projectId)
    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
    }

    project.messages.push({
      id: `msg_${Date.now()}`,
      role: 'user',
      content: prompt,
      createdAt: new Date().toISOString(),
    })

    const result = buildAssistantReply(project, prompt)
    await saveProjectRecord(supabase, user.id, result.project)

    return NextResponse.json({ message: result.message, project: result.project })
  } catch {
    return NextResponse.json({ error: 'Failed to process workspace message.' }, { status: 500 })
  }
}
