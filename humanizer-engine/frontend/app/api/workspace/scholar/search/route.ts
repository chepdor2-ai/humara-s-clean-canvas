import { NextResponse } from 'next/server'
import { requireWorkspaceUser } from '@/lib/workspace/api'
import { searchScholarCatalog } from '@/lib/workspace/service'

export async function GET(request: Request) {
  try {
    const { error } = await requireWorkspaceUser(request)
    if (error) return error

    const url = new URL(request.url)
    const query = url.searchParams.get('q') ?? ''
    const yearFrom = url.searchParams.get('yearFrom')
    const yearTo = url.searchParams.get('yearTo')
    const openAccessOnly = url.searchParams.get('openAccessOnly') === 'true'
    const author = url.searchParams.get('author') ?? undefined
    const journal = url.searchParams.get('journal') ?? undefined
    const sort = (url.searchParams.get('sort') as 'relevance' | 'year' | 'citation_count' | null) ?? 'relevance'

    const results = searchScholarCatalog(query, {
      yearFrom: yearFrom ? Number(yearFrom) : undefined,
      yearTo: yearTo ? Number(yearTo) : undefined,
      openAccessOnly,
      author,
      journal,
      sort,
    })

    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ error: 'Failed to search scholarly sources.' }, { status: 500 })
  }
}
