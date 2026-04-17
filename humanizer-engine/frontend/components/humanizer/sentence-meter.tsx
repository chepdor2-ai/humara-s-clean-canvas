"use client"

import { Dice5 } from "lucide-react"
import { useMemo } from "react"
import { toast } from "sonner"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { sentenceRisk, splitSentences } from "@/lib/sentence-utils"

function riskBand(r: number) {
  if (r <= 0.25) return { label: "Safe", color: "text-emerald-500", bg: "bg-emerald-500/15", bar: "bg-emerald-500" }
  if (r <= 0.5) return { label: "Low", color: "text-primary", bg: "bg-primary/15", bar: "bg-primary" }
  if (r <= 0.75) return { label: "Medium", color: "text-amber-500", bg: "bg-amber-500/15", bar: "bg-amber-500" }
  return { label: "High", color: "text-rose-500", bg: "bg-rose-500/20", bar: "bg-rose-500" }
}

export function SentenceMeter({
  text,
  salt,
  onRerollSentence,
}: {
  text: string
  salt: number
  onRerollSentence?: (index: number) => void
}) {
  const sentences = useMemo(() => splitSentences(text), [text])
  const scored = useMemo(
    () => sentences.map((s, i) => ({ text: s, risk: sentenceRisk(s, salt + i) })),
    [sentences, salt],
  )
  const avg = scored.length ? scored.reduce((a, b) => a + b.risk, 0) / scored.length : 0
  const avgBand = riskBand(avg)

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-border/70 px-6 py-2.5 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">Average detection risk</span>
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
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          {scored.length} sentences
        </span>
      </div>

      <div className="doc-text premium-scroll max-h-[440px] overflow-y-auto px-6 py-5 text-[15px] leading-relaxed text-foreground">
        {scored.map((s, i) => {
          const band = riskBand(s.risk)
          return (
            <HoverCard key={i} openDelay={80} closeDelay={80}>
              <HoverCardTrigger asChild>
                <span
                  className={`cursor-help rounded-sm transition-colors hover:${band.bg} underline decoration-transparent underline-offset-4 hover:decoration-[color:var(--border)]`}
                >
                  {s.text}
                </span>
              </HoverCardTrigger>
              <HoverCardContent align="start" className="w-72 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Detection risk
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
                <button
                  onClick={() => {
                    onRerollSentence?.(i)
                    toast.success(`Re-rolling sentence ${i + 1}`)
                  }}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                >
                  <Dice5 className="h-3.5 w-3.5" />
                  Re-roll this sentence
                </button>
              </HoverCardContent>
            </HoverCard>
          )
        })}
      </div>
    </div>
  )
}
