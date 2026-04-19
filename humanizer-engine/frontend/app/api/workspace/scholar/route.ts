import { NextRequest, NextResponse } from 'next/server'
import { searchOpenAlex } from '@/lib/workspace/openalex'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  if (!q) {
    return NextResponse.json({ error: 'Missing query parameter `q`' }, { status: 400 })
  }

  const sort = (url.searchParams.get('sort') as
    | 'relevance_score:desc'
    | 'publication_year:desc'
    | 'cited_by_count:desc'
    | null) || 'relevance_score:desc'

  try {
    const data = await searchOpenAlex({
      query: q,
      page: Number(url.searchParams.get('page')) || 1,
      perPage: Number(url.searchParams.get('perPage')) || 20,
      yearFrom: url.searchParams.get('yearFrom') || undefined,
      yearTo: url.searchParams.get('yearTo') || undefined,
      oaOnly: url.searchParams.get('oa') === '1',
      author: url.searchParams.get('author') || undefined,
      journal: url.searchParams.get('journal') || undefined,
      type: url.searchParams.get('type') || undefined,
      sort,
    })
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60' },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Search failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
