import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, BookOpen, PenLine } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Humara Workspace',
  description:
    'Search real scholarly sources and draft academic papers with AI-powered writing and citation support.',
}

export default function WorkspaceHome() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
          Workspace
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
          Research and write, end-to-end.
        </h1>
        <p className="mt-2 max-w-2xl text-pretty text-sm text-slate-600 dark:text-zinc-400 sm:text-base">
          Search 240M+ real scholarly works from OpenAlex, copy perfect citations in any style,
          and draft well-structured academic papers with a Word-like editor.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Link
          href="/workspace/scholar"
          className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-cyan-700"
        >
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-400">
            <BookOpen className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold">Scholar</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
            Search real scholarly works. Filter by year, journal, author, and open-access. Copy
            citations in APA, MLA, Chicago, Harvard, IEEE, BibTeX, RIS, EndNote and more.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-cyan-700 dark:text-cyan-400">
            Open Scholar
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <Link
          href="/workspace/writer"
          className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-cyan-700"
        >
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-400">
            <PenLine className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold">Writer</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
            A chat on the left, a Word-like page on the right. Draft academic papers with inline
            citations from OpenAlex, tables, and charts — export to .docx, .html, or PDF.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-cyan-700 dark:text-cyan-400">
            Open Writer
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>
    </div>
  )
}
