export type Doc = {
  id: string
  title: string
  snippet: string
  folder: string
  tags: string[]
  starred: boolean
  risk: number
  words: number
  modified: number
  mode: string
}

export const FOLDERS = [
  { id: "all", label: "All documents", count: 0 },
  { id: "starred", label: "Starred", count: 0 },
  { id: "recent", label: "Recent", count: 0 },
]
