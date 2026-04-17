"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ArrowUpRight, Crown, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useLocalStorage } from "@/lib/hooks"

type Props = {
  usedWords: number
  quota: number
}

export function QuotaCTA({ usedWords, quota }: Props) {
  const pct = quota > 0 ? (usedWords / quota) * 100 : 0
  const [dismissedUntil, setDismissedUntil] = useLocalStorage<number>("humara.quota.dismissed", 0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const now = Date.now()
    setVisible(pct >= 80 && now > dismissedUntil)
  }, [pct, dismissedUntil])

  if (!visible) return null

  const dismiss = () => {
    setDismissedUntil(Date.now() + 1000 * 60 * 60 * 24) // 24h
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ type: "spring", stiffness: 280, damping: 28 }}
        className="relative overflow-hidden rounded-xl border border-[oklch(0.78_0.15_85)]/40 bg-gradient-to-br from-[oklch(0.78_0.15_85)]/15 via-[oklch(0.78_0.15_85)]/5 to-transparent p-4"
      >
        <button
          onClick={dismiss}
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="flex items-start gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[oklch(0.78_0.15_85)]/20">
            <Crown className="h-4 w-4 text-[oklch(0.55_0.15_85)]" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">You&apos;ve used {Math.round(pct)}% of your quota</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Upgrade to Studio for unlimited words, priority queue, and the new Deep Kill engine.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button className="inline-flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background hover:opacity-90">
                Upgrade to Studio
                <ArrowUpRight className="h-3 w-3" />
              </button>
              <span className="font-mono text-[10px] text-muted-foreground">$19/mo &middot; cancel anytime</span>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
