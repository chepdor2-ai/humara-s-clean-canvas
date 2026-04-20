'use client'

import { motion } from 'framer-motion'

export function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="humara-avatar-sm flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-xs font-bold text-white shadow-lg shadow-cyan-500/20">
        H
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-600 dark:text-cyan-400">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500" />
          HumaraGPT
        </div>
        <div className="flex items-center gap-1.5 rounded-2xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-slate-200/60 dark:bg-white/5 dark:ring-white/10">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="inline-block h-2 w-2 rounded-full bg-cyan-500/70 dark:bg-cyan-400/70"
              animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4], scale: [1, 1.2, 1] }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
          <span className="ml-1.5 text-xs text-slate-400 dark:text-zinc-600">Thinking...</span>
        </div>
      </div>
    </div>
  )
}
