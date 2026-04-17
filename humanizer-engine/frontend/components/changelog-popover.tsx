"use client"

import { Bell, Sparkles } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const entries = [
  {
    date: "Today",
    tag: "New",
    title: "Sentence-level risk analyzer",
    body: "Hover any sentence in the output to see its detection score.",
  },
  {
    date: "Yesterday",
    tag: "Improved",
    title: "3× faster stealth engine",
    body: "GPTZero Killer v3.2 ships with batched inference.",
  },
  {
    date: "Mar 28",
    tag: "New",
    title: "Version history",
    body: "Every humanization is now saved as a scrollable version.",
  },
]

const tagColor: Record<string, string> = {
  New: "border-primary/30 bg-primary/10 text-primary",
  Improved: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Fixed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
}

export function ChangelogPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          aria-label="What's new"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-background" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-semibold">What&apos;s new</span>
          </div>
          <button className="text-[11px] font-medium text-primary hover:underline">View all</button>
        </div>
        <div className="max-h-[360px] space-y-1 overflow-y-auto premium-scroll p-2">
          {entries.map((e) => (
            <div key={e.title} className="rounded-lg p-2 transition-colors hover:bg-muted/60">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tagColor[e.tag]}`}
                >
                  {e.tag}
                </span>
                <span className="text-[11px] text-muted-foreground">{e.date}</span>
              </div>
              <div className="mt-1.5 text-sm font-medium text-foreground">{e.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{e.body}</div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
