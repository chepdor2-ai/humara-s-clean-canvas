"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { DetectorBrandIcon } from "@/components/detector/detector-brand-icon"

export type DetectorResult = {
  name: string
  score: number // 0-100
  verdict: "human" | "mixed" | "ai"
  latencyMs: number
}

function barColor(score: number) {
  if (score < 30) return "bg-[oklch(0.72_0.15_160)]"
  if (score < 60) return "bg-[oklch(0.78_0.15_85)]"
  if (score < 85) return "bg-[oklch(0.72_0.17_55)]"
  return "bg-[oklch(0.65_0.2_25)]"
}

export function DetectorRows({ rows }: { rows: DetectorResult[] }) {
  return (
    <div className="divide-y divide-border">
      {rows.map((r, i) => (
        <motion.div
          key={r.name}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.35 }}
          className="grid grid-cols-12 items-center gap-3 px-4 py-3.5 hover:bg-accent/40 transition-colors"
        >
          <div className="col-span-4 flex items-center gap-3">
            <DetectorBrandIcon
              name={r.name}
              size={36}
              className="h-9 w-9 rounded-lg border border-border/40"
              imageClassName="rounded-lg"
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium">{r.name}</span>
              <span className="text-xs text-muted-foreground">{r.latencyMs}ms</span>
            </div>
          </div>
          <div className="col-span-5">
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${r.score}%` }}
                transition={{ duration: 1.2, ease: [0.2, 0.8, 0.2, 1], delay: i * 0.06 + 0.2 }}
                className={cn("h-full rounded-full", barColor(r.score))}
              />
            </div>
          </div>
          <div className="col-span-2 text-right font-mono text-sm tabular-nums">{r.score}%</div>
          <div className="col-span-1 text-right">
            <span
              className={cn(
                "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                r.verdict === "human" && "bg-[oklch(0.72_0.15_160)]/15 text-[oklch(0.55_0.15_160)]",
                r.verdict === "mixed" && "bg-[oklch(0.78_0.15_85)]/15 text-[oklch(0.55_0.15_85)]",
                r.verdict === "ai" && "bg-[oklch(0.65_0.2_25)]/15 text-[oklch(0.55_0.2_25)]",
              )}
            >
              {r.verdict}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  )
}
