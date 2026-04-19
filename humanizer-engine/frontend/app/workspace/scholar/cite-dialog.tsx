'use client'

import { useMemo, useState } from 'react'
import { Check, Copy, Download, X } from 'lucide-react'
import type { OpenAlexWork } from '@/lib/workspace/openalex'
import {
  type CitationStyle,
  CITATION_LABELS,
  formatCitation,
} from '@/lib/workspace/citations'
import { cn } from '@/lib/utils'

const STYLES: CitationStyle[] = [
  'apa',
  'mla',
  'chicago',
  'harvard',
  'ieee',
  'vancouver',
  'bibtex',
  'ris',
  'endnote',
]

export function CiteDialog({ work, onClose }: { work: OpenAlexWork; onClose: () => void }) {
  const [style, setStyle] = useState<CitationStyle>('apa')
  const [copied, setCopied] = useState(false)

  const citation = useMemo(() => formatCitation(work, style), [work, style])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(citation)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  const handleDownload = () => {
    const ext =
      style === 'bibtex' ? 'bib' : style === 'ris' ? 'ris' : style === 'endnote' ? 'enw' : 'txt'
    const blob = new Blob([citation], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `citation.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm dark:bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Cite this source"
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0 flex-1 pr-4">
            <h2 className="text-base font-semibold">Cite</h2>
            <p className="mt-0.5 truncate text-sm text-slate-600 dark:text-zinc-400">
              {work.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-slate-200 px-5 py-3 dark:border-zinc-800">
          {STYLES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStyle(s)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition',
                style === s
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700',
              )}
            >
              {CITATION_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="p-5">
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-[13px] leading-relaxed text-slate-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
            {citation}
          </pre>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white transition',
                copied ? 'bg-emerald-600' : 'bg-cyan-600 hover:bg-cyan-700',
              )}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy citation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
