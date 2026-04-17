"use client"

import { motion } from "framer-motion"
import { ChevronDown, Settings2, Sparkles, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

type SegmentProps<T extends string> = {
  label: string
  options: T[]
  value: T
  onChange: (v: T) => void
}

function Segment<T extends string>({ label, options, value, onChange }: SegmentProps<T>) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="relative flex rounded-lg border border-border bg-muted/60 p-0.5">
        {options.map((opt) => {
          const active = value === opt
          return (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className={cn(
                "relative z-10 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                active ? "text-white" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId={`seg-${label}`}
                  className="absolute inset-0 rounded-md bg-gradient-to-b from-primary to-cyan-600 shadow-sm shadow-primary/30"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative">{opt}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

type Props = {
  mode: "Stealth" | "Anti GPTZero" | "Deep Kill"
  setMode: (v: "Stealth" | "Anti GPTZero" | "Deep Kill") => void
  depth: "Light" | "Medium" | "Strong"
  setDepth: (v: "Light" | "Medium" | "Strong") => void
  tone: string
  setTone: (v: string) => void
  meaning: boolean
  setMeaning: (v: boolean) => void
  grammar: boolean
  setGrammar: (v: boolean) => void
  rate: number
  setRate: (n: number) => void
  onHumanize: () => void
  processing: boolean
  words: number
  maxWords: number
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-5 w-9 rounded-full transition-colors",
        on ? "bg-primary" : "bg-muted border border-border",
      )}
      role="switch"
      aria-checked={on}
    >
      <motion.span
        className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow"
        animate={{ left: on ? 18 : 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </button>
  )
}

export function ControlPanel(props: Props) {
  const {
    mode, setMode, depth, setDepth, tone, setTone,
    meaning, setMeaning, grammar, setGrammar,
    rate, setRate, onHumanize, processing,
    words, maxWords,
  } = props

  const pct = Math.min(100, (words / maxWords) * 100)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="pointer-events-none absolute -top-20 right-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative flex flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-lg font-semibold tracking-tight text-transparent">
              Humara Stealth
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              <Sparkles className="h-3 w-3" />
              Professional
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Words</span>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary to-cyan-500"
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 30 }}
            />
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {words.toLocaleString()}/{maxWords.toLocaleString()}
          </span>
          <button className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative flex flex-wrap items-center gap-x-6 gap-y-4 border-t border-border bg-gradient-to-b from-transparent to-muted/20 px-6 py-4">
        <Segment label="Mode" options={["Stealth", "Anti GPTZero", "Deep Kill"]} value={mode} onChange={setMode} />

        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Engine</span>
          <button className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-soft" />
            GPTZero Killer
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        <Segment label="Depth" options={["Light", "Medium", "Strong"]} value={depth} onChange={setDepth} />

        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tone</span>
          <div className="relative">
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="appearance-none rounded-lg border border-border bg-card py-1.5 pl-3 pr-8 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option>Academic</option>
              <option>Casual</option>
              <option>Professional</option>
              <option>Creative</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Meaning</span>
            <Toggle on={meaning} onChange={setMeaning} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Grammar</span>
            <Toggle on={grammar} onChange={setGrammar} />
          </div>
        </div>
      </div>

      <div className="relative flex flex-wrap items-center justify-between gap-4 border-t border-border px-6 py-4">
        <div className="flex flex-1 items-center gap-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rate</span>
          <div className="relative flex h-8 flex-1 max-w-md items-center">
            <div className="absolute inset-x-0 h-1.5 rounded-full bg-muted" />
            <motion.div
              className="absolute h-1.5 rounded-full bg-gradient-to-r from-primary to-cyan-500"
              initial={false}
              animate={{ width: `${(rate / 10) * 100}%` }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
            <input
              type="range"
              min={1}
              max={10}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="relative z-10 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-primary"
            />
          </div>
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{rate}</span>
        </div>

        <motion.button
          onClick={onHumanize}
          disabled={processing}
          whileHover={{ scale: processing ? 1 : 1.02 }}
          whileTap={{ scale: processing ? 1 : 0.98 }}
          className={cn(
            "relative inline-flex items-center gap-2 overflow-hidden rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-colors",
            "bg-gradient-to-b from-primary to-cyan-600 disabled:cursor-not-allowed disabled:opacity-80",
          )}
        >
          {processing ? (
            <>
              <span className="orbit-fast">
                <Sparkles className="h-4 w-4" />
              </span>
              Humanizing…
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" />
              Humanize
            </>
          )}
          {processing && (
            <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-white/20 blur-sm scan-line [animation-duration:1.2s] [animation-direction:alternate]" />
          )}
        </motion.button>
      </div>
    </div>
  )
}
