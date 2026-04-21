import { NextResponse } from 'next/server';
import { searchLiveScholarSources } from '@/lib/workspace/scholar';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const sortParam = searchParams.get('sort') || 'relevance';
    const year = searchParams.get('year') || '';
    const page = Number(searchParams.get('page') || '1');

    if (!q.trim()) {
      return NextResponse.json({
        results: [],
        googleResults: [],
        meta: { count: 0, page: 1, perPage: 10, googleEnabled: false, freshAsOf: new Date().toISOString() },
      });
    }

    const sort =
      sortParam.includes('cited_by')
        ? 'citation_count'
        : sortParam.includes('publication')
          ? 'year'
          : 'relevance';

    const data = await searchLiveScholarSources(q, {
      yearFrom: year ? Number(year) : undefined,
      sort,
    }, Number.isFinite(page) && page > 0 ? page : 1);

    return NextResponse.json(data);
  } catch (err) {
    console.error('Scholar fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch scholarly sources.' }, { status: 500 });
  }
}
