import type { ScholarSearchFilters, WorkspaceSource } from '@/lib/workspace/types'

export interface ScholarSearchMeta {
  count: number
  page: number
  perPage: number
  googleEnabled: boolean
  freshAsOf: string
}

export interface ScholarGoogleResult {
  title: string
  url: string
  snippet: string
  displayLink: string
}

export interface ScholarSearchResponse {
  results: WorkspaceSource[]
  googleResults: ScholarGoogleResult[]
  meta: ScholarSearchMeta
}

interface OpenAlexWork {
  id?: string
  display_name?: string
  doi?: string | null
  publication_year?: number
  publication_date?: string | null
  cited_by_count?: number
  is_oa?: boolean
  abstract_inverted_index?: Record<string, number[]>
  authorships?: Array<{
    author?: { display_name?: string | null } | null
  }>
  primary_location?: {
    landing_page_url?: string | null
    pdf_url?: string | null
    source?: { display_name?: string | null } | null
  } | null
}

function stripDoiPrefix(value: string | null | undefined) {
  if (!value) return null
  return value
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim()
}

function decodeAbstract(index?: Record<string, number[]>) {
  if (!index) return ''
  const slots: string[] = []
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) {
      slots[position] = word
    }
  }
  return slots.filter(Boolean).join(' ')
}

function normalizeOpenAlexWork(work: OpenAlexWork): WorkspaceSource {
  const authors = (work.authorships ?? [])
    .map((entry) => entry.author?.display_name?.trim())
    .filter((value): value is string => Boolean(value))

  const doi = stripDoiPrefix(work.doi)
  const sourceUrl = doi
    ? `https://doi.org/${doi}`
    : work.primary_location?.landing_page_url ?? null
  const fullTextUrl = work.primary_location?.pdf_url ?? sourceUrl
  const abstractPreview = decodeAbstract(work.abstract_inverted_index).slice(0, 500)

  return {
    id: work.id ?? `openalex_${Math.random().toString(36).slice(2, 10)}`,
    title: work.display_name?.trim() || 'Untitled work',
    authors,
    journal: work.primary_location?.source?.display_name?.trim() || 'OpenAlex source',
    year: work.publication_year ?? new Date().getFullYear(),
    publicationDate: work.publication_date ?? null,
    doi,
    abstractPreview,
    openAccess: Boolean(work.is_oa || work.primary_location?.pdf_url),
    fullTextUrl,
    sourceUrl,
    openAlexId: work.id ?? null,
    provider: 'openalex',
    citationCount: work.cited_by_count ?? 0,
    qualityScore: Math.max(
      55,
      Math.min(
        99,
        68
          + Math.min(18, Math.floor((work.cited_by_count ?? 0) / 20))
          + (work.is_oa ? 5 : 0)
          + (doi ? 4 : 0),
      ),
    ),
    savedAt: new Date().toISOString(),
    notes: work.id ? `OpenAlex ${work.id}` : 'OpenAlex result',
  }
}

async function fetchOpenAlexResults(query: string, filters: ScholarSearchFilters = {}, page = 1) {
  const url = new URL('https://api.openalex.org/works')
  url.searchParams.set('search', query)
  url.searchParams.set('page', String(page))
  url.searchParams.set('per-page', '10')

  if (filters.sort === 'year') {
    url.searchParams.set('sort', 'publication_date:desc')
  } else if (filters.sort === 'citation_count') {
    url.searchParams.set('sort', 'cited_by_count:desc')
  }

  const filterParts: string[] = []
  if (filters.yearFrom) filterParts.push(`publication_year:>=${filters.yearFrom}`)
  if (filters.yearTo) filterParts.push(`publication_year:<=${filters.yearTo}`)
  if (filters.openAccessOnly) filterParts.push('is_oa:true')
  if (filters.author) filterParts.push(`authorships.author.display_name.search:${filters.author}`)
  if (filters.journal) filterParts.push(`primary_location.source.display_name.search:${filters.journal}`)
  if (filterParts.length > 0) {
    url.searchParams.set('filter', filterParts.join(','))
  }

  const apiKey = process.env.OPENALEX_API_KEY?.trim()
  if (apiKey) {
    url.searchParams.set('api_key', apiKey)
  }

  const mailto = process.env.OPENALEX_MAILTO?.trim()
  if (mailto) {
    url.searchParams.set('mailto', mailto)
  }

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      ...(mailto ? { 'User-Agent': `humara-workspace/1.0 (${mailto})` } : {}),
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`OpenAlex request failed with status ${response.status}`)
  }

  const data = await response.json()
  return {
    results: Array.isArray(data.results) ? (data.results as OpenAlexWork[]).map(normalizeOpenAlexWork) : [],
    count: Number(data.meta?.count ?? 0),
    page: Number(data.meta?.page ?? page),
    perPage: Number(data.meta?.per_page ?? 10),
  }
}

async function fetchGoogleResults(query: string, page = 1): Promise<ScholarGoogleResult[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY?.trim()
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID?.trim()

  if (!apiKey || !searchEngineId) {
    return []
  }

  const url = new URL('https://customsearch.googleapis.com/customsearch/v1')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('cx', searchEngineId)
  url.searchParams.set('q', query)
  url.searchParams.set('num', '5')
  url.searchParams.set('start', String((page - 1) * 5 + 1))
  url.searchParams.set('sort', 'date')
  url.searchParams.set('safe', 'active')

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })

  if (!response.ok) {
    return []
  }

  const data = await response.json()
  return Array.isArray(data.items)
    ? data.items.map((item: { title?: string; link?: string; snippet?: string; displayLink?: string }) => ({
        title: item.title ?? 'Untitled result',
        url: item.link ?? '#',
        snippet: item.snippet ?? '',
        displayLink: item.displayLink ?? '',
      }))
    : []
}

export async function searchLiveScholarSources(query: string, filters: ScholarSearchFilters = {}, page = 1): Promise<ScholarSearchResponse> {
  if (!query.trim()) {
    return {
      results: [],
      googleResults: [],
      meta: {
        count: 0,
        page,
        perPage: 10,
        googleEnabled: Boolean(process.env.GOOGLE_SEARCH_API_KEY?.trim() && process.env.GOOGLE_SEARCH_ENGINE_ID?.trim()),
        freshAsOf: new Date().toISOString(),
      },
    }
  }

  const [openAlex, googleResults] = await Promise.all([
    fetchOpenAlexResults(query, filters, page),
    fetchGoogleResults(`${query} recent research`, page),
  ])

  return {
    results: openAlex.results,
    googleResults,
    meta: {
      count: openAlex.count,
      page: openAlex.page,
      perPage: openAlex.perPage,
      googleEnabled: googleResults.length > 0 || Boolean(process.env.GOOGLE_SEARCH_API_KEY?.trim() && process.env.GOOGLE_SEARCH_ENGINE_ID?.trim()),
      freshAsOf: new Date().toISOString(),
    },
  }
}
