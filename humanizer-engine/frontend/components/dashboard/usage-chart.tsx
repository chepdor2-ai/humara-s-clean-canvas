"use client"

import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type Range = "7d" | "30d" | "90d"

function generate(range: Range) {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90
  const now = Date.now()
  const out: { date: string; humanizer: number; detector: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000)
    const base = 600 + Math.sin(i / 3) * 200 + Math.cos(i / 7) * 120
    const humanizer = Math.max(50, Math.round(base + (i % 5) * 40 + Math.random() * 80))
    const detector = Math.max(10, Math.round(humanizer * 0.35 + Math.random() * 60))
    out.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      humanizer,
      detector,
    })
  }
  return out
}

export function UsageChart() {
  const [range, setRange] = useState<Range>("30d")
  const data = useMemo(() => generate(range), [range])
  const total = useMemo(() => data.reduce((a, b) => a + b.humanizer + b.detector, 0), [data])

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm rise-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Usage over time</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums">
              {total.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">requests · last {range}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-primary" />
              Humanizer
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-amber-500/80" />
              Detector
            </span>
          </div>
          <div className="relative flex rounded-md border border-border bg-muted/60 p-0.5">
            {(["7d", "30d", "90d"] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                data-active={range === r}
                className="relative z-10 rounded px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[active=true]:bg-card data-[active=true]:text-foreground data-[active=true]:shadow-sm data-[active=true]:ring-1 data-[active=true]:ring-border"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="grad-humanizer" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="grad-detector" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.78 0.15 60)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="oklch(0.78 0.15 60)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="var(--muted-foreground)"
              tick={{ fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={42} />
            <Tooltip
              cursor={{ stroke: "var(--primary)", strokeOpacity: 0.4, strokeDasharray: "3 3" }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 12,
                padding: "8px 10px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
              }}
              labelStyle={{ color: "var(--muted-foreground)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}
            />
            <Area
              type="monotone"
              dataKey="humanizer"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#grad-humanizer)"
              isAnimationActive
              animationDuration={900}
            />
            <Area
              type="monotone"
              dataKey="detector"
              stroke="oklch(0.78 0.15 60)"
              strokeWidth={2}
              fill="url(#grad-detector)"
              isAnimationActive
              animationDuration={1100}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
