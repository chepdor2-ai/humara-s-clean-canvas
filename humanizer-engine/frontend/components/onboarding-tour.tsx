"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, Sparkles, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useLocalStorage } from "@/lib/hooks"

const STEPS = [
  {
    title: "Welcome to HumaraGPT",
    body: "The stealth humanizer trusted by 120,000+ writers. Let\u2019s take a 20-second tour of what makes it fast.",
    cta: "Show me around",
  },
  {
    title: "Paste, pick a style, humanize",
    body: "Seven engines, three depths, and tone control. Press H to humanize, or click Try a sample to see it live.",
    cta: "Next: Keyboard",
  },
  {
    title: "Pro shortcuts",
    body: "Press Cmd/Ctrl+K for the command palette, or ? to see every shortcut. You\u2019ll rarely need the mouse.",
    cta: "Next: Detection",
  },
  {
    title: "Verify with confidence",
    body: "Run output through 6 detectors in the AI Detector tab. See per-sentence risk before you publish.",
    cta: "Start creating",
  },
]

export function OnboardingTour() {
  const [dismissed, setDismissed] = useLocalStorage("humara.tour.v1", false)
  const [step, setStep] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 600)
    return () => clearTimeout(id)
  }, [])

  if (!mounted || dismissed) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="fixed bottom-6 right-6 z-50 w-[360px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="relative border-b border-border bg-gradient-to-br from-primary/15 via-accent/50 to-transparent p-4">
          <button
            onClick={() => setDismissed(true)}
            className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Dismiss tour"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/20">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Getting started &middot; {step + 1}/{STEPS.length}
            </span>
          </div>
        </div>
        <div className="p-4">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h3 className="text-base font-semibold tracking-tight">{current.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed text-pretty">{current.body}</p>
          </motion.div>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    width: i === step ? 16 : 5,
                    backgroundColor: i === step ? "var(--primary)" : "var(--border)",
                  }}
                  className="h-1.5 rounded-full"
                />
              ))}
            </div>
            <Button
              size="sm"
              onClick={() => (isLast ? setDismissed(true) : setStep(step + 1))}
              className="gap-1.5"
            >
              {current.cta}
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
