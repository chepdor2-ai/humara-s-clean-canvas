"use client"

import { motion } from "framer-motion"
import { useEffect, useState } from "react"

type Props = {
  /** 0-100, where 100 = very likely AI */
  score: number
  size?: number
}

export function RiskGauge({ score, size = 220 }: Props) {
  const [animated, setAnimated] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(score))
    return () => cancelAnimationFrame(id)
  }, [score])

  const stroke = 8
  const radius = (size - stroke) / 2
  const circumference = Math.PI * radius // half circle
  const dash = (animated / 100) * circumference

  const label =
    score < 30 ? "Likely Human" : score < 60 ? "Mixed Signals" : score < 85 ? "Likely AI" : "Almost Certainly AI"
  const color =
    score < 30
      ? "oklch(0.72 0.15 160)"
      : score < 60
        ? "oklch(0.78 0.15 85)"
        : score < 85
          ? "oklch(0.72 0.17 55)"
          : "oklch(0.65 0.2 25)"

  return (
    <div className="relative flex flex-col items-center">
      <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`} className="overflow-visible">
        <defs>
          <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="oklch(0.72 0.15 160)" />
            <stop offset="50%" stopColor="oklch(0.78 0.15 85)" />
            <stop offset="100%" stopColor="oklch(0.65 0.2 25)" />
          </linearGradient>
        </defs>
        {/* Track */}
        <path
          d={`M ${stroke / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* Progress */}
        <motion.path
          d={`M ${stroke / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke="url(#gauge-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - dash }}
          transition={{ duration: 1.4, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center">
        <motion.span
          key={score}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-mono text-4xl font-semibold tabular-nums"
          style={{ color }}
        >
          {Math.round(animated)}
        </motion.span>
        <span className="text-xs text-muted-foreground">AI probability</span>
      </div>
      <div className="mt-2 text-center">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
          style={{ borderColor: color, color }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
          {label}
        </span>
      </div>
    </div>
  )
}
