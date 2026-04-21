import { NextResponse } from 'next/server'
import { requireWorkspaceUser } from '@/lib/workspace/api'
import { searchLiveScholarSources } from '@/lib/workspace/scholar'
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

    const filters = {
      yearFrom: yearFrom ? Number(yearFrom) : undefined,
      yearTo: yearTo ? Number(yearTo) : undefined,
      openAccessOnly,
      author,
      journal,
      sort,
    }

    try {
      const liveResults = await searchLiveScholarSources(query, filters)
      return NextResponse.json(liveResults)
    } catch {
      const results = searchScholarCatalog(query, filters)

      return NextResponse.json({
        results,
        googleResults: [],
        meta: {
          count: results.length,
          page: 1,
          perPage: results.length,
          googleEnabled: false,
          freshAsOf: new Date().toISOString(),
        },
      })
    }
  } catch {
    return NextResponse.json({ error: 'Failed to search scholarly sources.' }, { status: 500 })
  }
}
