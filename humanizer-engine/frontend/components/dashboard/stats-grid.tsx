"use client"

import { ArrowDownRight, ArrowUpRight, Flame, ShieldCheck, Sparkles, Type } from "lucide-react"
import { useCountUp } from "@/lib/hooks"
import { Sparkline } from "./sparkline"

type Stat = {
  label: string
  value: number
  suffix?: string
  format?: "number" | "percent" | "compact"
  delta: number
  trend: number[]
  icon: React.ComponentType<{ className?: string }>
  color: string
}

function formatValue(v: number, format: Stat["format"]) {
  if (format === "percent") return `${v.toFixed(1)}%`
  if (format === "compact") {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
    return v.toFixed(0)
  }
  return Math.round(v).toLocaleString()
}

function StatCard({ stat, index }: { stat: Stat; index: number }) {
  const value = useCountUp(stat.value, 900 + index * 100)
  const positive = stat.delta >= 0
  const Icon = stat.icon
  return (
    <div
      className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-md rise-in"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/10 opacity-0 blur-3xl transition-opacity group-hover:opacity-100" />

      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {stat.label}
        </span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${stat.color}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>

      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-mono text-[26px] font-semibold tracking-tight tabular-nums text-foreground">
            {formatValue(value, stat.format)}
            {stat.suffix && <span className="ml-0.5 text-base text-muted-foreground">{stat.suffix}</span>}
          </div>
          <div
            className={`mt-1 inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${
              positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
            }`}
          >
            {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {positive ? "+" : ""}
            {stat.delta.toFixed(1)}%
            <span className="ml-1 text-muted-foreground">vs last week</span>
          </div>
        </div>
        <div className="h-10 w-28 text-primary">
          <Sparkline data={stat.trend} height={36} width={112} />
        </div>
      </div>
    </div>
  )
}

export function StatsGrid() {
  const stats: Stat[] = [
    {
      label: "Words humanized",
      value: 48240,
      format: "compact",
      delta: 12.4,
      trend: [120, 140, 100, 180, 220, 200, 260, 240, 300, 280, 340, 360, 420, 400],
      icon: Type,
      color: "bg-primary/10 text-primary",
    },
    {
      label: "Avg detection risk",
      value: 4.2,
      format: "percent",
      delta: -2.1,
      trend: [28, 24, 20, 22, 18, 16, 14, 12, 10, 9, 8, 7, 6, 4],
      icon: ShieldCheck,
      color: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400",
    },
    {
      label: "Humanize runs",
      value: 312,
      format: "number",
      delta: 8.7,
      trend: [6, 9, 7, 11, 12, 10, 14, 13, 15, 18, 16, 20, 22, 21],
      icon: Sparkles,
      color: "bg-cyan-500/10 text-cyan-500",
    },
    {
      label: "Current streak",
      value: 18,
      suffix: "d",
      format: "number",
      delta: 0,
      trend: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
      icon: Flame,
      color: "bg-amber-500/10 text-amber-500 dark:text-amber-400",
    },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((s, i) => (
        <StatCard key={s.label} stat={s} index={i} />
      ))}
    </div>
  )
}
