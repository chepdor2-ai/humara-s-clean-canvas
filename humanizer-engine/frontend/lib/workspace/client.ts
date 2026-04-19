import type { WorkspaceDraft, WorkspaceProject } from '@/lib/workspace/types'

export async function workspaceFetch<T>(token: string, input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Workspace request failed.')
  }

  return data as T
}

export function getLatestScore(project: WorkspaceProject | null | undefined) {
  return project?.scoreHistory.at(-1) ?? null
}

export function getActiveDraft(project: WorkspaceProject | null | undefined): WorkspaceDraft | null {
  if (!project) return null
  return project.drafts.find((draft) => draft.id === project.activeDraftId) ?? project.drafts.at(-1) ?? null
}

export function decodeBase64ToBlob(base64: string, mimeType: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mimeType })
}

export function downloadBlob(base64: string, mimeType: string, fileName: string) {
  const blob = decodeBase64ToBlob(base64, mimeType)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export function buildDraftFromSections(project: WorkspaceProject, title: string, sections: WorkspaceDraft['contentJson']['sections']) {
  const activeDraft = getActiveDraft(project)
  if (!activeDraft) return null

  const contentJson = {
    ...activeDraft.contentJson,
    title,
    sections,
  }

  const contentMarkdown = [
    `# ${title}`,
    '',
    ...sections.flatMap((section) => [`## ${section.title}`, '', section.body, '']),
  ].join('\n')

  const contentHtml = [
    `<article class="workspace-document">`,
    `<h1>${title}</h1>`,
    ...sections.map((section) => `<section><h2>${section.title}</h2><p>${section.body}</p></section>`),
    `</article>`,
  ].join('')

  return {
    ...activeDraft,
    contentJson,
    contentMarkdown,
    contentHtml,
    updatedAt: new Date().toISOString(),
  }
}
