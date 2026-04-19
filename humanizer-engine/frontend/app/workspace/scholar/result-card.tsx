'use client'

import { useMemo, useState } from 'react'
import { BookmarkPlus, ExternalLink, FileText, Quote, Users } from 'lucide-react'
import {
  getDoiUrl,
  getFullTextUrl,
  getJournal,
  reconstructAbstract,
  shortAuthorList,
  type OpenAlexWork,
} from '@/lib/workspace/openalex'

export function ResultCard({
  work,
  onCite,
  onSave,
  saved,
}: {
  work: OpenAlexWork
  onCite: (w: OpenAlexWork) => void
  onSave?: (w: OpenAlexWork) => void
  saved?: boolean
}) {
  const [showAbstract, setShowAbstract] = useState(false)

  const abstract = useMemo(
    () => reconstructAbstract(work.abstract_inverted_index ?? undefined),
    [work.abstract_inverted_index],
  )
  const journal = getJournal(work)
  const doiUrl = getDoiUrl(work)
  const fullTextUrl = getFullTextUrl(work)
  const isOa = work.open_access?.is_oa ?? work.is_oa

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-pretty text-[15px] font-semibold leading-snug text-slate-900 dark:text-zinc-50">
            {fullTextUrl ? (
              <a
                href={fullTextUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-cyan-700 hover:underline dark:hover:text-cyan-400"
              >
                {work.title}
              </a>
            ) : (
              work.title
            )}
          </h3>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-600 dark:text-zinc-400">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {shortAuthorList(work)}
            </span>
            {journal && (
              <>
                <span aria-hidden="true">·</span>
                <span className="italic">{journal}</span>
              </>
            )}
            {work.publication_year && (
              <>
                <span aria-hidden="true">·</span>
                <span>{work.publication_year}</span>
              </>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {isOa && (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                Open access
              </span>
            )}
            {work.type && (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-zinc-800 dark:text-zinc-300">
                {work.type.replace(/-/g, ' ')}
              </span>
            )}
            {typeof work.cited_by_count === 'number' && work.cited_by_count > 0 && (
              <span className="text-slate-500 dark:text-zinc-500">
                Cited by{' '}
                <span className="font-medium text-slate-700 dark:text-zinc-300">
                  {work.cited_by_count.toLocaleString()}
                </span>
              </span>
            )}
            {work.referenced_works_count ? (
              <span className="text-slate-500 dark:text-zinc-500">
                References {work.referenced_works_count}
              </span>
            ) : null}
          </div>

          {abstract && (
            <div className="mt-3">
              <p
                className={`text-[13.5px] leading-relaxed text-slate-700 dark:text-zinc-300 ${
                  showAbstract ? '' : 'line-clamp-3'
                }`}
              >
                {abstract}
              </p>
              <button
                type="button"
                onClick={() => setShowAbstract((v) => !v)}
                className="mt-1 text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-400"
              >
                {showAbstract ? 'Show less' : 'Show more'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onCite(work)}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <Quote className="h-3.5 w-3.5" />
          Cite
        </button>
        {fullTextUrl && (
          <a
            href={fullTextUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <FileText className="h-3.5 w-3.5" />
            Full text
          </a>
        )}
        {doiUrl && (
          <a
            href={doiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            DOI
          </a>
        )}
        {onSave && (
          <button
            type="button"
            onClick={() => onSave(work)}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
              saved
                ? 'bg-cyan-600 text-white hover:bg-cyan-700'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
            }`}
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
            {saved ? 'Saved' : 'Save'}
          </button>
        )}
      </div>
    </article>
  )
}
