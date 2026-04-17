"use client"

import { AnimatePresence, motion } from "framer-motion"

type Stage = {
  label: string
  detail: string
}

const stages: Stage[] = [
  { label: "Analyzing", detail: "Detecting AI fingerprints" },
  { label: "Rewriting", detail: "Applying stealth patterns" },
  { label: "Humanizing", detail: "Injecting natural cadence" },
  { label: "Finalizing", detail: "Polishing for delivery" },
]

export function ProcessingOverlay({
  visible,
  stageIndex,
  progress,
}: {
  visible: boolean
  stageIndex: number
  progress: number
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center overflow-hidden rounded-b-2xl bg-card/80 backdrop-blur-md"
        >
          {/* scanning line (CSS-only) */}
          <div className="pointer-events-none absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-primary/15 to-transparent scan-line" />

          {/* floating dots (reduced count + CSS-only) */}
          <div className="pointer-events-none absolute inset-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className="absolute h-1 w-1 rounded-full bg-primary/60 pulse-soft"
                style={{
                  left: `${(i * 53 + 7) % 100}%`,
                  top: `${(i * 37 + 11) % 100}%`,
                  animationDelay: `${(i % 5) * 0.3}s`,
                }}
              />
            ))}
          </div>

          <div className="relative flex flex-col items-center gap-5">
            {/* Core orb */}
            <div className="relative h-20 w-20">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-cyan-500 opacity-30 blur-xl pulse-soft" />
              <div
                className="absolute inset-2 rounded-full border-2 border-primary/40 orbit-fast"
                style={{ borderRightColor: "transparent", borderTopColor: "transparent" }}
              />
              <div
                className="absolute inset-4 rounded-full border-2 border-cyan-500/50 orbit-slow"
                style={{ borderLeftColor: "transparent", borderBottomColor: "transparent" }}
              />
              <div className="absolute inset-6 flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-cyan-600 shadow-lg shadow-primary/30">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-white pulse-soft" fill="currentColor">
                  <path d="M13 2 4.09 12.97a1 1 0 0 0 .78 1.63h6.13l-2 6.4a1 1 0 0 0 1.77.83l8.91-10.97a1 1 0 0 0-.78-1.63h-6.13l2-6.4a1 1 0 0 0-1.77-.83Z" />
                </svg>
              </div>
            </div>

            {/* Stage text */}
            <div className="flex min-h-[48px] flex-col items-center text-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={stageIndex}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center gap-1"
                >
                  <div className="text-sm font-semibold text-foreground">
                    {stages[stageIndex]?.label ?? "Processing"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {stages[stageIndex]?.detail}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Progress bar */}
            <div className="relative h-1.5 w-56 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary via-cyan-500 to-primary bg-[length:200%_100%] shimmer"
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={{ type: "spring", stiffness: 60, damping: 20 }}
              />
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {progress}% complete
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
