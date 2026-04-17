"use client"

import { useMemo } from "react"

export function Sparkline({
  data,
  stroke = "currentColor",
  fill = "currentColor",
  height = 36,
  width = 120,
}: {
  data: number[]
  stroke?: string
  fill?: string
  height?: number
  width?: number
}) {
  const { path, area, last } = useMemo(() => {
    if (data.length < 2) return { path: "", area: "", last: { x: 0, y: 0 } }
    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1
    const step = width / (data.length - 1)
    const points = data.map((v, i) => {
      const x = i * step
      const y = height - ((v - min) / range) * height
      return { x, y }
    })
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ")
    const area = `${path} L${width} ${height} L0 ${height} Z`
    return { path, area, last: points[points.length - 1] }
  }, [data, height, width])

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="overflow-visible" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-${path.length}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity="0.25" />
          <stop offset="100%" stopColor={fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${path.length})`} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="draw-line" />
      {last && (
        <g>
          <circle cx={last.x} cy={last.y} r={3.5} fill={stroke} />
          <circle cx={last.x} cy={last.y} r={3.5} fill={stroke} className="ring-ping origin-center" style={{ transformBox: "fill-box" }} />
        </g>
      )}
    </svg>
  )
}
