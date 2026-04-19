'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Filter, Loader2, Search, SlidersHorizontal, X } from 'lucide-react'
import type { OpenAlexSearchResponse, OpenAlexWork } from '@/lib/workspace/openalex'
import { ResultCard } from './result-card'
import { CiteDialog } from './cite-dialog'

type SortKey = 'relevance_score:desc' | 'publication_year:desc' | 'cited_by_count:desc'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'relevance_score:desc', label: 'Relevance' },
  { value: 'publication_year:desc', label: 'Newest first' },
  { value: 'cited_by_count:desc', label: 'Most cited' },
]

const TYPE_OPTIONS = [
  { value: '', label: 'Any type' },
  { value: 'article', label: 'Article' },
  { value: 'book', label: 'Book' },
  { value: 'book-chapter', label: 'Book chapter' },
  { value: 'review', label: 'Review' },
  { value: 'dissertation', label: 'Dissertation' },
  { value: 'preprint', label: 'Preprint' },
]

const currentYear = new Date().getFullYear()

function saveLibrary(work: OpenAlexWork) {
  try {
    const raw = localStorage.getItem('humara-scholar-library')
    const list: OpenAlexWork[] = raw ? JSON.parse(raw) : []
    if (!list.find((w) => w.id === work.id)) {
      list.unshift(work)
      localStorage.setItem('humara-scholar-library', JSON.stringify(list.slice(0, 200)))
    }
    return true
  } catch {
    return false
  }
}

export function ScholarClient() {
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [yearFrom, setYearFrom] = useState<string>('')
  const [yearTo, setYearTo] = useState<string>('')
  const [oaOnly, setOaOnly] = useState(false)
  const [author, setAuthor] = useState('')
  const [journal, setJournal] = useState('')
  const [type, setType] = useState('')
  const [sort, setSort] = useState<SortKey>('relevance_score:desc')
  const [page, setPage] = useState(1)

  const [results, setResults] = useState<OpenAlexSearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [citeWork, setCiteWork] = useState<OpenAlexWork | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      const raw = localStorage.getItem('humara-scholar-library')
      const list: OpenAlexWork[] = raw ? JSON.parse(raw) : []
      setSavedIds(new Set(list.map((w) => w.id)))
    } catch {
      /* ignore */
    }
  }, [])

  const runSearch = useCallback(
    async (opts?: { page?: number; query?: string }) => {
      const q = (opts?.query ?? activeQuery).trim()
      if (!q) return
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        params.set('q', q)
        if (yearFrom) params.set('yearFrom', yearFrom)
        if (yearTo) params.set('yearTo', yearTo)
        if (oaOnly) params.set('oa', '1')
        if (author) params.set('author', author)
        if (journal) params.set('journal', journal)
        if (type) params.set('type', type)
        params.set('sort', sort)
        params.set('page', String(opts?.page ?? page))
        params.set('perPage', '20')

        const res = await fetch(`/api/workspace/scholar?${params.toString()}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Search failed (${res.status})`)
        }
        const data: OpenAlexSearchResponse = await res.json()
        setResults(data)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
        setResults(null)
      } finally {
        setLoading(false)
      }
    },
    [activeQuery, yearFrom, yearTo, oaOnly, author, journal, type, sort, page],
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setActiveQuery(q)
    setPage(1)
    runSearch({ page: 1, query: q })
  }

  const handleSave = (work: OpenAlexWork) => {
    if (saveLibrary(work)) {
      setSavedIds((s) => new Set(s).add(work.id))
    }
  }

  const hasActiveFilters = Boolean(yearFrom || yearTo || oaOnly || author || journal || type)
  const totalPages = results ? Math.min(50, Math.ceil(results.meta.count / results.meta.per_page)) : 0

  const resetFilters = () => {
    setYearFrom('')
    setYearTo('')
    setOaOnly(false)
    setAuthor('')
    setJournal('')
    setType('')
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Scholar</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
          Search real scholarly works from OpenAlex — 240M+ peer-reviewed articles, books, and preprints.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. generative AI in higher education"
              className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-10 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-zinc-800"
                aria-label="Clear query"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition ${
              hasActiveFilters || showFilters
                ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
          </button>
          <button
            type="submit"
            className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-cyan-600 px-4 text-sm font-medium text-white hover:bg-cyan-700"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </button>
        </div>

        {showFilters && (
          <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-zinc-400">
                Year range
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1900}
                  max={currentYear}
                  placeholder="From"
                  value={yearFrom}
                  onChange={(e) => setYearFrom(e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <span className="text-slate-400">–</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1900}
                  max={currentYear}
                  placeholder="To"
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-zinc-400">
                Author
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. Hinton"
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-zinc-400">
                Journal / source
              </label>
              <input
                type="text"
                value={journal}
                onChange={(e) => setJournal(e.target.value)}
                placeholder="e.g. Nature"
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-zinc-400">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-zinc-400">
                Sort by
              </label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={oaOnly}
                  onChange={(e) => setOaOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                />
                <span>Open access only</span>
              </label>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Reset filters
                </button>
              )}
            </div>
          </div>
        )}
      </form>

      <section aria-live="polite">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        {!results && !loading && !error && <EmptyState />}

        {loading && !results && (
          <div className="flex items-center justify-center py-16 text-slate-500 dark:text-zinc-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Searching OpenAlex…
          </div>
        )}

        {results && (
          <>
            <div className="mb-4 flex items-center justify-between text-sm text-slate-600 dark:text-zinc-400">
              <span>
                About{' '}
                <span className="font-semibold text-slate-900 dark:text-zinc-100">
                  {results.meta.count.toLocaleString()}
                </span>{' '}
                results
                {activeQuery && (
                  <>
                    {' '}
                    for <span className="italic">&quot;{activeQuery}&quot;</span>
                  </>
                )}
              </span>
              {loading && (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Updating…
                </span>
              )}
            </div>

            <div className="space-y-3">
              {results.results.map((work) => (
                <ResultCard
                  key={work.id}
                  work={work}
                  onCite={(w) => setCiteWork(w)}
                  onSave={handleSave}
                  saved={savedIds.has(work.id)}
                />
              ))}
            </div>

            {results.results.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                No results. Try different keywords or loosen your filters.
              </div>
            )}

            {totalPages > 1 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                onChange={(p) => {
                  setPage(p)
                  runSearch({ page: p })
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
              />
            )}
          </>
        )}
      </section>

      {citeWork && <CiteDialog work={citeWork} onClose={() => setCiteWork(null)} />}
    </div>
  )
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number
  totalPages: number
  onChange: (p: number) => void
}) {
  const pages = useMemo(() => {
    const arr: (number | '…')[] = []
    const around = 1
    const first = 1
    const last = totalPages
    for (let i = 1; i <= totalPages; i++) {
      if (i === first || i === last || (i >= page - around && i <= page + around)) arr.push(i)
      else if (arr[arr.length - 1] !== '…') arr.push('…')
    }
    return arr
  }, [page, totalPages])

  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-1.5" aria-label="Pagination">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Previous
      </button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="px-2 text-sm text-slate-400">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`min-w-[2.25rem] rounded-md border px-3 py-1.5 text-sm font-medium ${
              p === page
                ? 'border-cyan-500 bg-cyan-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Next
      </button>
    </nav>
  )
}

function EmptyState() {
  const suggestions = [
    'climate change adaptation',
    'large language models education',
    'CRISPR gene therapy',
    'postcolonial literature theory',
    'machine learning healthcare',
    'sustainable supply chain',
  ]
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-400">
        <Filter className="h-5 w-5" />
      </div>
      <h2 className="text-base font-semibold">Start by searching a topic</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600 dark:text-zinc-400">
        Scholar queries the live OpenAlex index — titles, abstracts, authors, and concepts across
        more than 240 million works.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {suggestions.map((s) => (
          <span
            key={s}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  )
}
