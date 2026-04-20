import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const sort = searchParams.get('sort') || 'relevance';
  const year = searchParams.get('year') || '';
  const page = searchParams.get('page') || '1';

  if (!q) {
    return NextResponse.json({ results: [], meta: { count: 0, page: 1 } });
  }

  // We only search in title, abstract, default semantic search uses ?search=
  let url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&page=${page}&per_page=10`;
  
  if (sort && sort !== 'relevance') {
    url += `&sort=${sort}`;
  }
  
  if (year) {
    // filter=publication_year:>2023 or similar.
    // If year is "2024", we want publications from 2024 onwards.
    url += `&filter=publication_year:>=${year}`;
  }
  
  const apiKey = process.env.OPENALEX_API_KEY;
  if (apiKey) {
    url += (url.includes('?') ? '&' : '?') + `api_key=${apiKey}`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text();
      console.error('OpenAlex error', txt);
      return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('OpenAlex fetch error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
