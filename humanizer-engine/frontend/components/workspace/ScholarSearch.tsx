'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Quote,
  Star,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Calendar,
  Filter,
  Loader2,
  ExternalLink
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function ScholarSearch() {
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [meta, setMeta] = useState<{count: number, page: number}>({ count: 0, page: 1 })
  const [loading, setLoading] = useState(false)
  const [sort, setSort] = useState('relevance')
  const [yearFilter, setYearFilter] = useState('')
  const [page, setPage] = useState(1)

  const fetchResults = useCallback(async (q: string, p: number, s: string, y: string) => {
    if (!q.trim()) return
    setLoading(true)
    try {
      const url = new URL(window.location.origin + '/api/workspace/scholar')
      url.searchParams.set('q', q)
      url.searchParams.set('page', p.toString())
      if (s !== 'relevance') url.searchParams.set('sort', s)
      if (y) url.searchParams.set('year', y)

      const res = await fetch(url.toString())
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      setResults(data.results || [])
      setMeta({
        count: data.meta?.count || 0,
        page: data.meta?.page || 1
      })
    } catch (err) {
      console.error(err)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setActiveQuery(query)
    setPage(1)
    fetchResults(query, 1, sort, yearFilter)
  }

  // Handle pagination or filter changes
  useEffect(() => {
    if (activeQuery) {
      fetchResults(activeQuery, page, sort, yearFilter)
    }
  }, [page, sort, yearFilter, activeQuery, fetchResults])

  const formatAuthors = (authorships: any[]) => {
    if (!authorships || authorships.length === 0) return 'Unknown Author'
    return authorships.map((a: any) => a.author?.display_name).join(', ')
  }

  const currentYear = new Date().getFullYear()

  return (
    <div className="flex h-full w-full flex-col bg-slate-50 dark:bg-[#0a0c14]">
      {/* Search Header Patterned after Google Scholar */}
      <header className="flex flex-col items-center border-b border-slate-200/60 bg-white/80 py-6 backdrop-blur-md dark:border-white/5 dark:bg-[#0d0f18]/80">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/25">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            Humara <span className="text-blue-600">Scholar</span>
          </h1>
        </div>
        
        <form onSubmit={handleSearch} className="flex w-full max-w-3xl items-center px-4">
          <div className="relative flex w-full items-center">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for articles, papers, authors..."
              className="w-full rounded-l-xl border border-r-0 border-slate-300 py-3 pl-4 pr-10 text-slate-900 outline-none transition-all focus:border-blue-500 focus:shadow-[0_0_0_4px_rgba(59,130,246,0.1)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-blue-500"
            />
            <button
              type="submit"
              className="flex h-[46px] items-center justify-center rounded-r-xl border border-blue-600 bg-blue-600 px-6 transition-all hover:bg-blue-700 hover:shadow-lg shadow-blue-500/25"
            >
              <Search className="h-5 w-5 text-white" />
            </button>
          </div>
        </form>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Filters */}
        {activeQuery && (
          <aside className="w-64 border-r border-slate-200/60 bg-white/50 p-6 dark:border-white/5 dark:bg-[#0a0c14]/50 hidden md:block">
            <div className="mb-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-zinc-200">
                <Calendar className="h-4 w-4 text-slate-400" /> Date
              </h3>
              <div className="flex flex-col gap-2 border-l-2 border-slate-200 pl-3 dark:border-zinc-800">
                <button onClick={() => setYearFilter('')} className={cn("text-left text-sm transition-colors", !yearFilter ? "font-semibold text-blue-600" : "text-slate-600 hover:text-blue-600 dark:text-zinc-400")}>
                  Any time
                </button>
                <button onClick={() => setYearFilter(currentYear.toString())} className={cn("text-left text-sm transition-colors", yearFilter === currentYear.toString() ? "font-semibold text-blue-600" : "text-slate-600 hover:text-blue-600 dark:text-zinc-400")}>
                  Since {currentYear}
                </button>
                <button onClick={() => setYearFilter((currentYear - 1).toString())} className={cn("text-left text-sm transition-colors", yearFilter === (currentYear - 1).toString() ? "font-semibold text-blue-600" : "text-slate-600 hover:text-blue-600 dark:text-zinc-400")}>
                  Since {currentYear - 1}
                </button>
                <button onClick={() => setYearFilter((currentYear - 4).toString())} className={cn("text-left text-sm transition-colors", yearFilter === (currentYear - 4).toString() ? "font-semibold text-blue-600" : "text-slate-600 hover:text-blue-600 dark:text-zinc-400")}>
                  Since {currentYear - 4}
                </button>
              </div>
            </div>

            <div>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-zinc-200">
                <Filter className="h-4 w-4 text-slate-400" /> Sort by
              </h3>
              <div className="flex flex-col gap-2 border-l-2 border-slate-200 pl-3 dark:border-zinc-800">
                <button onClick={() => setSort('relevance')} className={cn("text-left text-sm transition-colors", sort === 'relevance' ? "font-semibold text-blue-600" : "text-slate-600 hover:text-blue-600 dark:text-zinc-400")}>
                  Relevance
                </button>
                <button onClick={() => setSort('cited_by_count:desc')} className={cn("text-left text-sm transition-colors", sort === 'cited_by_count:desc' ? "font-semibold text-blue-600" : "text-slate-600 hover:text-blue-600 dark:text-zinc-400")}>
                  Most Cited
                </button>
                <button onClick={() => setSort('publication_date:desc')} className={cn("text-left text-sm transition-colors", sort === 'publication_date:desc' ? "font-semibold text-blue-600" : "text-slate-600 hover:text-blue-600 dark:text-zinc-400")}>
                  Newest First
                </button>
              </div>
            </div>
          </aside>
        )}

        {/* Results Stream */}
        <main className="flex-1 overflow-y-auto px-4 py-8 premium-scroll relative">
          <div className="mx-auto max-w-4xl">
            {loading ? (
              <div className="mt-20 flex flex-col items-center justify-center text-blue-600">
                <Loader2 className="h-10 w-10 animate-spin" />
                <p className="mt-4 text-sm font-medium text-slate-500 dark:text-zinc-400">Searching global scholarly works...</p>
              </div>
            ) : !activeQuery ? (
              <div className="mt-32 flex flex-col items-center justify-center text-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-blue-50 text-blue-500 dark:bg-blue-500/10 mb-6">
                  <Search className="h-10 w-10" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200">Stand on the shoulders of giants</h2>
                <p className="mt-2 text-slate-500 dark:text-zinc-400 max-w-sm">Access hundreds of millions of scholarly works, authors, and sources directly in your workspace.</p>
              </div>
            ) : results.length === 0 ? (
              <div className="mt-20 flex flex-col items-center justify-center text-center">
                <h2 className="text-lg font-bold text-slate-800 dark:text-zinc-200">No results found</h2>
                <p className="mt-2 text-slate-500 dark:text-zinc-400">Try adjusting your filters or search query.</p>
              </div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <div className="text-xs font-medium text-slate-500 dark:text-zinc-500 pb-2 border-b border-slate-200 dark:border-zinc-800">
                  About {meta.count.toLocaleString()} results (Page {meta.page})
                </div>
                
                {results.map((work) => (
                  <article key={work.id} className="group flex flex-col gap-1">
                    <a href={work.doi || work.id} target="_blank" rel="noreferrer" className="text-lg font-semibold text-blue-700 hover:underline dark:text-blue-400 leading-snug">
                      {work.title || 'Untitled Work'}
                    </a>
                    
                    <div className="text-sm text-emerald-700 dark:text-emerald-500 mb-1">
                      {formatAuthors(work.authorships)} - {work.primary_location?.source?.display_name || 'Publisher'}, {work.publication_year}
                    </div>
                    
                    {/* Abstract snippet heuristic */}
                    <div className="text-sm text-slate-600 dark:text-zinc-400 line-clamp-3 leading-relaxed mb-2">
                       {work.abstract_inverted_index 
                         ? Object.keys(work.abstract_inverted_index).slice(0, 40).join(' ') + '...'
                         : 'No abstract available.'}
                    </div>

                    <div className="flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-zinc-500">
                      <div className="flex items-center gap-1">
                         <Quote className="h-3 w-3" /> Cited by {work.cited_by_count || 0}
                      </div>
                      {work.is_oa && (
                        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                          <Star className="h-3 w-3 fill-current" /> Open Access
                        </div>
                      )}
                      {work.doi && (
                         <a href={work.doi} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                           <ExternalLink className="h-3 w-3" /> View Source
                         </a>
                      )}
                    </div>
                  </article>
                ))}

                {/* Pagination */}
                <div className="mt-12 flex items-center justify-center gap-4 border-t border-slate-200 pt-8 dark:border-zinc-800">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors disabled:opacity-50 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </button>
                  <span className="text-sm font-medium text-slate-500 dark:text-zinc-500">Page {page}</span>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
