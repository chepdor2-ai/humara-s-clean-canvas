"use client"

import { useMemo } from "react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** Deterministic pseudo-random */
function prand(seed: number) {
  let s = seed
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1)
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61)
    return ((s ^ (s >>> 14)) >>> 0) / 4294967295
  }
}

function buildData() {
  // 7 weeks x 7 days
  const weeks = 20
  const data: number[][] = []
  const rand = prand(42)
  for (let w = 0; w < weeks; w++) {
    const col: number[] = []
    for (let d = 0; d < 7; d++) {
      const weekendBias = d >= 5 ? 0.3 : 1
      const recency = 0.4 + (w / weeks) * 0.8
      const v = Math.round(rand() * 10 * recency * weekendBias)
      col.push(Math.max(0, v))
    }
    data.push(col)
  }
  return data
}

function scale(v: number) {
  if (v === 0) return "bg-muted/40"
  if (v < 3) return "bg-primary/20"
  if (v < 6) return "bg-primary/40"
  if (v < 9) return "bg-primary/70"
  return "bg-primary"
}

export function ActivityHeatmap() {
  const data = useMemo(buildData, [])
  const total = useMemo(() => data.reduce((a, col) => a + col.reduce((x, y) => x + y, 0), 0), [data])

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm rise-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Activity</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            <span className="font-mono text-foreground tabular-nums">{total}</span> humanizations in the last 20 weeks
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>Less</span>
          <div className="flex gap-0.5">
            <span className="h-3 w-3 rounded-sm bg-muted/40" />
            <span className="h-3 w-3 rounded-sm bg-primary/20" />
            <span className="h-3 w-3 rounded-sm bg-primary/40" />
            <span className="h-3 w-3 rounded-sm bg-primary/70" />
            <span className="h-3 w-3 rounded-sm bg-primary" />
          </div>
          <span>More</span>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex flex-col justify-between gap-0.5 py-0.5 text-[10px] text-muted-foreground">
          {DAYS.map((d, i) => (
            <span key={d} className={i % 2 === 0 ? "" : "opacity-0"}>
              {d}
            </span>
          ))}
        </div>
        <div className="flex flex-1 gap-1 overflow-x-auto premium-scroll">
          {data.map((col, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {col.map((v, di) => (
                <HoverCard key={di} openDelay={50} closeDelay={50}>
                  <HoverCardTrigger asChild>
                    <div
                      className={`h-3.5 w-3.5 rounded-sm transition-transform hover:scale-125 ${scale(v)}`}
                    />
                  </HoverCardTrigger>
                  <HoverCardContent className="w-auto px-3 py-2 text-xs">
                    <div className="font-mono tabular-nums text-foreground">{v}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {DAYS[di]} · week -{data.length - wi}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
