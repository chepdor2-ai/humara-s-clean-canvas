/**
 * OpenAlex API wrapper — free, no API key required.
 * Docs: https://docs.openalex.org/
 *
 * We intentionally keep the shape small but compatible with what the
 * Scholar UI and citation formatter need.
 */

const OPENALEX_BASE = 'https://api.openalex.org'

// Sending a polite "mailto" dramatically improves our rate-limit tier
// on OpenAlex. We fall back to a generic value if none is set.
const MAILTO = process.env.OPENALEX_MAILTO || 'support@humaragpt.com'

export type OpenAlexAuthor = {
  id?: string
  display_name?: string
  orcid?: string | null
}

export type OpenAlexAuthorship = {
  author_position?: 'first' | 'middle' | 'last'
  author?: OpenAlexAuthor
  institutions?: Array<{
    id?: string
    display_name?: string
    country_code?: string
  }>
  raw_author_name?: string
}

export type OpenAlexSource = {
  id?: string
  display_name?: string
  issn_l?: string | null
  issn?: string[] | null
  host_organization?: string | null
  host_organization_name?: string | null
  type?: string | null
}

export type OpenAlexLocation = {
  source?: OpenAlexSource | null
  landing_page_url?: string | null
  pdf_url?: string | null
  is_oa?: boolean
  version?: string | null
  license?: string | null
}

export type OpenAlexWork = {
  id: string
  doi?: string | null
  title: string
  display_name?: string
  publication_year?: number | null
  publication_date?: string | null
  type?: string | null
  type_crossref?: string | null
  cited_by_count?: number
  referenced_works_count?: number
  is_retracted?: boolean
  is_paratext?: boolean
  language?: string | null
  authorships?: OpenAlexAuthorship[]
  primary_location?: OpenAlexLocation | null
  best_oa_location?: OpenAlexLocation | null
  open_access?: {
    is_oa?: boolean
    oa_url?: string | null
    any_repository_has_fulltext?: boolean
  } | null
  is_oa?: boolean
  biblio?: {
    volume?: string | null
    issue?: string | null
    first_page?: string | null
    last_page?: string | null
  } | null
  abstract_inverted_index?: Record<string, number[]> | null
  concepts?: Array<{ display_name?: string; level?: number; score?: number }>
  keywords?: Array<{ display_name?: string }>
}

export type OpenAlexSearchResponse = {
  meta: {
    count: number
    db_response_time_ms?: number
    page: number
    per_page: number
  }
  results: OpenAlexWork[]
}

export type SearchParams = {
  query: string
  page?: number
  perPage?: number
  yearFrom?: number | string
  yearTo?: number | string
  oaOnly?: boolean
  author?: string
  journal?: string
  type?: string
  sort?: 'relevance_score:desc' | 'publication_year:desc' | 'cited_by_count:desc'
}

/**
 * Build a filter string for OpenAlex `/works?filter=...`
 */
function buildFilter(p: SearchParams): string {
  const parts: string[] = []

  const from = p.yearFrom ? Number(p.yearFrom) : NaN
  const to = p.yearTo ? Number(p.yearTo) : NaN
  if (!Number.isNaN(from) && from) parts.push(`from_publication_date:${from}-01-01`)
  if (!Number.isNaN(to) && to) parts.push(`to_publication_date:${to}-12-31`)

  if (p.oaOnly) parts.push('is_oa:true')

  if (p.author && p.author.trim()) {
    parts.push(`raw_author_name.search:${encodeURIComponent(p.author.trim())}`)
  }

  if (p.journal && p.journal.trim()) {
    parts.push(
      `primary_location.source.display_name.search:${encodeURIComponent(p.journal.trim())}`,
    )
  }

  if (p.type && p.type.trim()) parts.push(`type:${p.type.trim()}`)

  // Always exclude retracted & paratext noise from default results
  parts.push('is_retracted:false')
  parts.push('is_paratext:false')

  return parts.join(',')
}

/**
 * Search OpenAlex. Returns a paginated response.
 */
export async function searchOpenAlex(p: SearchParams): Promise<OpenAlexSearchResponse> {
  const page = Math.max(1, Math.min(50, Number(p.page) || 1))
  const perPage = Math.max(1, Math.min(50, Number(p.perPage) || 20))

  const url = new URL(`${OPENALEX_BASE}/works`)
  url.searchParams.set('search', p.query)
  url.searchParams.set('per_page', String(perPage))
  url.searchParams.set('page', String(page))
  url.searchParams.set('mailto', MAILTO)

  const sort = p.sort || 'relevance_score:desc'
  url.searchParams.set('sort', sort)

  const filter = buildFilter(p)
  if (filter) url.searchParams.set('filter', filter)

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    // Cache briefly — OpenAlex is stable, but search queries are dynamic
    next: { revalidate: 60 },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `OpenAlex request failed (${res.status}): ${body.slice(0, 200) || res.statusText}`,
    )
  }

  const data = (await res.json()) as OpenAlexSearchResponse
  return data
}

/**
 * OpenAlex delivers abstracts as an inverted index (word → positions).
 * Rebuild the original prose from it.
 */
export function reconstructAbstract(
  inverted?: Record<string, number[]> | null,
): string {
  if (!inverted) return ''
  const slots: string[] = []
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) slots[pos] = word
  }
  return slots.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * A compact "Smith, J., Lee, K., & Doe, A." style list, truncated when long.
 */
export function shortAuthorList(work: OpenAlexWork): string {
  const names =
    work.authorships
      ?.map((a) => a.author?.display_name || a.raw_author_name)
      .filter((n): n is string => Boolean(n)) ?? []
  if (names.length === 0) return 'Unknown author'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  if (names.length <= 4) return names.slice(0, -1).join(', ') + ', & ' + names[names.length - 1]
  return `${names[0]}, ${names[1]}, ${names[2]} et al.`
}

export function getJournal(work: OpenAlexWork): string {
  return (
    work.primary_location?.source?.display_name ||
    work.best_oa_location?.source?.display_name ||
    ''
  )
}

export function getDoiUrl(work: OpenAlexWork): string | null {
  if (!work.doi) return null
  const clean = work.doi.replace(/^https?:\/\/doi\.org\//, '')
  return `https://doi.org/${clean}`
}

export function getFullTextUrl(work: OpenAlexWork): string | null {
  return (
    work.best_oa_location?.pdf_url ||
    work.best_oa_location?.landing_page_url ||
    work.primary_location?.pdf_url ||
    work.primary_location?.landing_page_url ||
    getDoiUrl(work)
  )
}
