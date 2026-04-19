"use client"

import { AlertTriangle, CheckCircle2, Wand2 } from "lucide-react"
import { useMemo } from "react"
import { toast } from "sonner"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { sentenceRisk, splitSentences } from "@/lib/sentence-utils"

function riskBand(r: number) {
  if (r <= 0.35) return { label: "AI Free", color: "text-emerald-600", bg: "bg-emerald-500/14", bar: "bg-emerald-500", border: "border-emerald-500/25", accent: "text-emerald-500", flagged: false }
  if (r <= 0.6) return { label: "Watch", color: "text-amber-600", bg: "bg-amber-500/14", bar: "bg-amber-500", border: "border-amber-500/25", accent: "text-amber-500", flagged: true }
  return { label: "Flagged", color: "text-rose-600", bg: "bg-rose-500/16", bar: "bg-rose-500", border: "border-rose-500/30", accent: "text-rose-500", flagged: true }
}

export function SentenceMeter({
  text,
  salt,
  onFixSentence,
}: {
  text: string
  salt: number
  onFixSentence?: (index: number) => void
}) {
  const sentences = useMemo(() => splitSentences(text), [text])
  const scored = useMemo(
    () => sentences.map((s, i) => ({ text: s, risk: sentenceRisk(s, salt + i) })),
    [sentences, salt],
  )
  const avg = scored.length ? scored.reduce((a, b) => a + b.risk, 0) / scored.length : 0
  const avgBand = riskBand(avg)
  const flaggedCount = scored.filter((s) => riskBand(s.risk).flagged).length

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-border/70 px-6 py-2.5 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">Sentence AI scan</span>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${avgBand.bar} transition-all`}
                style={{ width: `${Math.round(avg * 100)}%` }}
              />
            </div>
            <span className={`font-mono tabular-nums ${avgBand.color}`}>{Math.round(avg * 100)}%</span>
            <span className={avgBand.color}>· {avgBand.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          <span className="font-mono">{scored.length} sentences</span>
          <span className={flaggedCount === 0 ? 'text-emerald-500' : 'text-rose-500'}>{flaggedCount} flagged</span>
        </div>
      </div>

      <div className="doc-text premium-scroll max-h-[440px] overflow-y-auto px-6 py-5 text-[15px] leading-relaxed text-foreground">
        {scored.map((s, i) => {
          const band = riskBand(s.risk)
          return (
            <HoverCard key={i} openDelay={80} closeDelay={80}>
              <HoverCardTrigger asChild>
                <div className={`mb-3 rounded-xl border px-4 py-3 transition-colors ${band.border} ${band.bg}`}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.18em]">
                    <span className={`inline-flex items-center gap-1.5 ${band.color}`}>
                      {band.flagged ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      {band.label}
                    </span>
                    <span className={`font-mono ${band.color}`}>{Math.round(s.risk * 100)}%</span>
                  </div>
                  <p className={`cursor-help rounded-md leading-relaxed transition-colors ${band.flagged ? 'text-rose-950 dark:text-rose-100' : 'text-emerald-950 dark:text-emerald-100'}`}>
                    {s.text}
                  </p>
                </div>
              </HoverCardTrigger>
              <HoverCardContent align="start" className="w-72 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Sentence status
                  </span>
                  <span className={`font-mono text-xs tabular-nums ${band.color}`}>
                    {Math.round(s.risk * 100)}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${band.bar}`} style={{ width: `${Math.round(s.risk * 100)}%` }} />
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  <span className={`font-medium ${band.color}`}>{band.label}</span> · Sentence {i + 1} of{" "}
                  {scored.length}
                </div>
                {band.flagged && onFixSentence && (
                  <button
                    onClick={() => {
                      onFixSentence(i)
                      toast.success(`Fixing sentence ${i + 1}`)
                    }}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-500/15 dark:text-rose-300"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    Fix this sentence
                  </button>
                )}
              </HoverCardContent>
            </HoverCard>
          )
        })}
      </div>
    </div>
  )
}
