"use client"

import { useMemo } from "react"
import { changeRatio, wordDiff } from "@/lib/diff"

export function DiffView({ original, humanized }: { original: string; humanized: string }) {
  const tokens = useMemo(() => wordDiff(original, humanized), [original, humanized])
  const ratio = useMemo(() => changeRatio(original, humanized), [original, humanized])

  const added = tokens.filter((t) => t.type === "add" && t.text.trim()).length
  const removed = tokens.filter((t) => t.type === "del" && t.text.trim()).length

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-border/70 px-6 py-2.5 text-xs">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="font-mono tabular-nums">+{added}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            <span className="font-mono tabular-nums">−{removed}</span>
          </span>
          <span className="text-muted-foreground">
            <span className="font-mono tabular-nums text-foreground">{Math.round(ratio * 100)}%</span> rewritten
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          word-level
        </span>
      </div>

      <div className="doc-text premium-scroll max-h-[440px] overflow-y-auto px-6 py-5 text-[15px] leading-relaxed text-foreground">
        {tokens.map((t, i) => {
          if (t.type === "eq") {
            return <span key={i}>{t.text}</span>
          }
          if (t.type === "add") {
            return (
              <mark
                key={i}
                className="rounded-sm bg-emerald-500/15 px-0.5 text-emerald-700 underline decoration-emerald-500/50 decoration-dotted underline-offset-4 dark:text-emerald-300"
              >
                {t.text}
              </mark>
            )
          }
          return (
            <mark
              key={i}
              className="rounded-sm bg-rose-500/15 px-0.5 text-rose-700 line-through decoration-rose-500/50 decoration-dotted dark:text-rose-300"
            >
              {t.text}
            </mark>
          )
        })}
      </div>
    </div>
  )
}
