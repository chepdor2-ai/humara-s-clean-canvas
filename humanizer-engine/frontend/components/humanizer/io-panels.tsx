"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Check, ClipboardPaste, Copy, Eraser, GitCompare, ShieldCheck, Sparkles, Text } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { toLowerSentenceStyle } from "@/lib/text-format"
import { DiffView } from "./diff-view"
import { ExportMenu } from "./export-menu"
import { MetricsStrip } from "./metrics-strip"
import { ProcessingOverlay } from "./processing-overlay"
import { SentenceMeter } from "./sentence-meter"
import { type Version, VersionHistorySheet } from "./version-history-sheet"

function wordCount(s: string) {
  const t = s.trim()
  if (!t) return 0
  return t.split(/\s+/).length
}

/**
 * Word-processor style typewriter. Re-applies lowercase-with-acronyms each tick
 * so in-flight text stays consistent while preserving abbreviations.
 */
function useTypewriter(source: string, active: boolean, cps = 1200) {
  const [rendered, setRendered] = useState("")

  useEffect(() => {
    if (!active || !source) return
    let frame = 0
    let cancelled = false
    let start: number | null = null

    const step = (ts: number) => {
      if (cancelled) return
      if (start === null) start = ts
      const elapsed = ts - start
      const target = Math.min(source.length, Math.floor((elapsed / 1000) * cps))
      const formatted = toLowerSentenceStyle(source.slice(0, target))
      setRendered(formatted)
      if (target < source.length) {
        frame = requestAnimationFrame(step)
      }
    }

    frame = requestAnimationFrame(step)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [source, active, cps])

  return rendered
}

type View = "result" | "diff" | "confidence"

export function IOPanels({
  input,
  setInput,
  output,
  processing,
  stageIndex,
  progress,
  animating,
  sourceText,
  onAnimationDone,
  versions,
  onRestore,
  onRerollSentence,
  runSalt,
}: {
  input: string
  setInput: (s: string) => void
  output: string
  processing: boolean
  stageIndex: number
  progress: number
  animating: boolean
  sourceText: string
  onAnimationDone: () => void
  versions: Version[]
  onRestore: (v: Version) => void
  onRerollSentence: (index: number) => void
  runSalt: number
}) {
  const [copied, setCopied] = useState(false)
  const [view, setView] = useState<View>("result")
  const typed = useTypewriter(sourceText, animating, 1200)
  const didFinish = useRef(false)

  useEffect(() => {
    if (animating && sourceText && typed.length >= sourceText.length && !didFinish.current) {
      didFinish.current = true
      onAnimationDone()
    }
    if (!animating) didFinish.current = false
  }, [animating, sourceText, typed, onAnimationDone])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const handleCopy = async () => {
    if (!output) return
    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
      toast.success("Output copied")
    } catch {}
  }

  const handlePaste = async () => {
    const applyPastedInput = (candidate: string) => {
      const normalized = toLowerSentenceStyle(candidate)
      if (!normalized.trim()) {
        toast.error("Clipboard is empty")
        return false
      }
      setInput(normalized)
      toast.success("Pasted from clipboard")
      return true
    }

    try {
      if (navigator.clipboard?.readText) {
        const t = await navigator.clipboard.readText()
        if (applyPastedInput(t)) return
      }
    } catch {
      // Fall through to manual paste fallback.
    }

    const manualText = window.prompt("Clipboard read is blocked. Paste your text (Ctrl+V) and press OK:", "")
    if (manualText !== null && applyPastedInput(manualText)) return

    toast.error("Could not read clipboard. Use Ctrl+V in the text box")
  }

  const liveDisplayed = animating ? typed : output

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {/* INPUT */}
      <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
            <span className="text-sm font-semibold text-foreground">Original</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <button
              onClick={() => {
                setInput("")
                toast.message("Input cleared")
              }}
              disabled={!input}
              className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <Eraser className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        </div>

        <div className="border-b border-border bg-muted/20 px-5 py-2">
          <MetricsStrip text={input} label="Input" />
        </div>

        <div className="relative flex-1">
          <textarea
            value={input}
            onChange={(e) => setInput(toLowerSentenceStyle(e.target.value))}
            placeholder="Paste text you want to humanize…"
            className="doc-text h-[440px] w-full resize-none bg-transparent px-6 py-5 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 premium-scroll"
          />
          {processing && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
              <div className="absolute inset-x-0 h-12 bg-gradient-to-b from-transparent via-primary/10 to-transparent scan-line" />
            </div>
          )}

          {!input && !processing && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <button
                onClick={handlePaste}
                className="pointer-events-auto inline-flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-all hover:border-primary/45 hover:bg-primary/15"
              >
                <ClipboardPaste className="h-4 w-4" />
                Paste from clipboard
              </button>
            </div>
          )}
        </div>
      </div>

      {/* OUTPUT */}
      <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <span
              className={
                processing || animating
                  ? "h-2 w-2 rounded-full bg-primary pulse-soft"
                  : "h-2 w-2 rounded-full bg-muted-foreground/50"
              }
            />
            <span className="text-sm font-semibold text-foreground">Humanized</span>
            {(processing || animating) && (
              <span className="ml-1 font-mono text-[10px] uppercase tracking-[0.15em] text-primary">● Live</span>
            )}
          </div>

          {/* View switcher */}
          <div className="order-3 w-full sm:order-none sm:w-auto">
            <div className="relative flex rounded-md border border-border bg-muted/60 p-0.5">
              {(["result", "diff", "confidence"] as View[]).map((v) => {
                const active = view === v
                const Icon = v === "result" ? Text : v === "diff" ? GitCompare : ShieldCheck
                return (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    disabled={!output && v !== "result"}
                    className="relative z-10 inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[active=true]:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    data-active={active}
                  >
                    {active && (
                      <motion.span
                        layoutId="out-view"
                        className="absolute inset-0 rounded bg-card shadow-sm ring-1 ring-border"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative inline-flex items-center gap-1">
                      <Icon className="h-3 w-3" />
                      {v === "result" ? "Result" : v === "diff" ? "Diff" : "Confidence"}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <VersionHistorySheet versions={versions} onRestore={onRestore} />
            <ExportMenu text={output} disabled={!output} />
            <button
              onClick={handleCopy}
              disabled={!output}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>

        {view === "result" && (
          <div className="border-b border-border bg-muted/20 px-5 py-2">
            <MetricsStrip text={liveDisplayed} label="Output" />
          </div>
        )}

        <div className="relative min-h-[440px] flex-1 overflow-hidden">
          {view === "result" && (
            <div className="doc-text px-6 py-5 text-[15px] leading-relaxed text-foreground">
              {animating && (
                <>
                  <span className="whitespace-pre-wrap">{typed}</span>
                  <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] bg-primary caret-blink align-middle" />
                </>
              )}
              {!animating && output && <div className="whitespace-pre-wrap">{output}</div>}
            </div>
          )}

          {view === "diff" && output && (
            <DiffView original={input || "Paste or generate original text to see a diff."} humanized={output} />
          )}

          {view === "confidence" && output && (
            <SentenceMeter text={output} salt={runSalt} onFixSentence={onRerollSentence} />
          )}

          {/* Empty state */}
          <AnimatePresence>
            {!output && !animating && !processing && view === "result" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center"
              >
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-500/10">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/25 to-transparent blur-xl" />
                  <Sparkles className="relative h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">Stealth humanized text appears here</div>
                  <div className="mt-1 text-xs text-muted-foreground">Paste text, pick style, then click Humanize</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <ProcessingOverlay visible={processing} stageIndex={stageIndex} progress={progress} />
        </div>
      </div>
    </div>
  )
}
