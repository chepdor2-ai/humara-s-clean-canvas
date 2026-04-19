'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ChartSpec } from '@/lib/workspace/markdown'

const COLORS = ['#0891b2', '#0e7490', '#22d3ee', '#0369a1', '#67e8f9', '#164e63']

export function ChartBlock({ spec }: { spec: ChartSpec }) {
  const xKey = spec.xKey || 'name'
  const yKey = spec.yKey || 'value'

  return (
    <figure className="my-5 rounded-lg border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      {spec.title && (
        <figcaption className="mb-2 text-center text-sm font-semibold text-slate-800 dark:text-zinc-200">
          {spec.title}
        </figcaption>
      )}
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {spec.type === 'bar' ? (
            <BarChart data={spec.data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey={xKey} stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip />
              <Bar dataKey={yKey} fill="#0891b2" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : spec.type === 'line' ? (
            <LineChart data={spec.data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey={xKey} stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey={yKey} stroke="#0891b2" strokeWidth={2} dot />
            </LineChart>
          ) : spec.type === 'area' ? (
            <AreaChart data={spec.data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey={xKey} stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip />
              <Area type="monotone" dataKey={yKey} stroke="#0891b2" fill="#0891b2" fillOpacity={0.25} />
            </AreaChart>
          ) : (
            <PieChart>
              <Tooltip />
              <Legend />
              <Pie
                data={spec.data}
                dataKey={yKey as string}
                nameKey={xKey as string}
                cx="50%"
                cy="50%"
                outerRadius={90}
                label
              >
                {spec.data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
