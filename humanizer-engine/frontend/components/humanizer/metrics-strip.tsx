"use client"

import { Clock, Gauge, Languages, Waves } from "lucide-react"
import { useMemo } from "react"
import { detectLanguage, readingEase, readingEaseSentenceAverage, readingTime, toneLabel } from "@/lib/sentence-utils"

function easeBand(score: number) {
  if (score >= 70) return { label: "Easy", color: "text-emerald-500" }
  if (score >= 50) return { label: "Standard", color: "text-primary" }
  if (score >= 30) return { label: "Fairly hard", color: "text-amber-500" }
  return { label: "Very hard", color: "text-rose-500" }
}

export function MetricsStrip({ text, sentenceAveragedReadability = false }: { text: string; label?: string; sentenceAveragedReadability?: boolean }) {
  const metrics = useMemo(() => {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0
    const chars = text.length
    const rt = readingTime(text)
    const ease = sentenceAveragedReadability ? readingEaseSentenceAverage(text) : readingEase(text)
    const tone = toneLabel(text)
    const lang = detectLanguage(text)
    return { words, chars, rt, ease, tone, lang }
  }, [sentenceAveragedReadability, text])

  const band = easeBand(metrics.ease)

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
      <Cell icon={<Clock className="h-3 w-3" />}>
        <span className="font-mono tabular-nums text-foreground">{metrics.words}</span>
        <span>words</span>
        <span className="text-muted-foreground/70">· {metrics.rt}</span>
      </Cell>
      <Cell icon={<Gauge className="h-3 w-3" />}>
        <span className={`font-mono tabular-nums ${band.color}`}>{metrics.ease || "—"}</span>
        <span>readability</span>
        {metrics.ease > 0 && <span className={band.color}>· {band.label}</span>}
      </Cell>
      <Cell icon={<Waves className="h-3 w-3" />}>
        <span className="text-foreground">{metrics.tone}</span>
        <span>tone</span>
      </Cell>
      <Cell icon={<Languages className="h-3 w-3" />}>
        <span className="font-mono text-[10px] uppercase text-foreground">{metrics.lang.flag}</span>
        <span>{metrics.lang.label}</span>
      </Cell>
    </div>
  )
}

function Cell({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground/70">{icon}</span>
      {children}
    </span>
  )
}
