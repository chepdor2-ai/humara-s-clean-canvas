"use client"

import { History, RotateCcw } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

export type Version = {
  id: string
  createdAt: number
  mode: string
  depth: string
  tone: string
  input: string
  output: string
  risk: number
}

function fmtAgo(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function VersionHistorySheet({
  versions,
  onRestore,
}: {
  versions: Version[]
  onRestore: (v: Version) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
        >
          <History className="h-3.5 w-3.5" />
          History
          <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 font-mono text-[10px] text-primary">
            {versions.length}
          </span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle>Version history</SheetTitle>
          <SheetDescription>Every humanization you&apos;ve run in this session.</SheetDescription>
        </SheetHeader>
        <div className="premium-scroll max-h-[calc(100vh-80px)] overflow-y-auto p-3">
          {versions.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
              <History className="h-5 w-5 text-muted-foreground" />
              <div className="text-sm font-medium">No versions yet</div>
              <div className="text-xs text-muted-foreground">
                Click Humanize to create your first version.
              </div>
            </div>
          )}
          {versions.map((v, i) => (
            <button
              key={v.id}
              onClick={() => {
                onRestore(v)
                setOpen(false)
                toast.success(`Restored version ${versions.length - i}`)
              }}
              className="group mb-2 block w-full rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  v{versions.length - i}
                </span>
                <span className="text-[11px] text-muted-foreground">{fmtAgo(v.createdAt)}</span>
              </div>
              <div className="mt-2 line-clamp-3 text-sm text-foreground">{v.output}</div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Chip>{v.mode}</Chip>
                <Chip>{v.depth}</Chip>
                <Chip>{v.tone}</Chip>
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      v.risk < 0.25
                        ? "bg-emerald-500"
                        : v.risk < 0.5
                          ? "bg-primary"
                          : v.risk < 0.75
                            ? "bg-amber-500"
                            : "bg-rose-500"
                    }`}
                  />
                  <span className="font-mono tabular-nums">{Math.round(v.risk * 100)}%</span>
                </span>
              </div>
              <div className="mt-3 flex items-center justify-end gap-1 text-[11px] text-primary opacity-0 transition-opacity group-hover:opacity-100">
                <RotateCcw className="h-3 w-3" />
                Restore
              </div>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-foreground/80">
      {children}
    </span>
  )
}
