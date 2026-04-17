"use client"

import { usePathname } from "next/navigation"
import { ChevronRight, Command, Search, Sparkles } from "lucide-react"
import { ChangelogPopover } from "@/components/changelog-popover"
import { useCommandPalette } from "@/components/command-palette"
import { ThemeToggle } from "./theme-toggle"

const LABELS: Record<string, string> = {
  "/app/dashboard": "Dashboard",
  "/app": "Humanizer",
  "/app/documents": "Documents",
  "/app/detector": "AI Detector",
  "/app/style": "Style Profiles",
  "/app/grammar": "Grammar",
  "/app/advanced": "Advanced",
  "/app/api-dashboard": "API",
  "/app/docs": "Docs",
  "/app/settings": "Settings",
}

export function TopBar() {
  const pathname = usePathname()
  const palette = useCommandPalette()
  const label = LABELS[pathname] ?? "Workspace"
  const isLive = pathname === "/app"

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-6 py-3 lg:px-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">Workspace</span>
          <ChevronRight className="h-3 w-3 opacity-60" />
          <span className="font-medium text-foreground">{label}</span>
          {isLive && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-soft" />
              Live
            </span>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={palette.toggle}
            className="hidden items-center gap-2 rounded-lg border border-border bg-card py-0 pl-3 pr-2 text-sm text-muted-foreground shadow-sm transition-colors hover:border-border hover:text-foreground md:inline-flex"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="w-40 text-left text-[13px]">Search or jump to…</span>
            <span className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              <Command className="h-3 w-3" />K
            </span>
          </button>

          <button
            type="button"
            onClick={palette.toggle}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground md:hidden"
            aria-label="Open command palette"
          >
            <Search className="h-4 w-4" />
          </button>

          <ChangelogPopover />

          <ThemeToggle />

          <div className="ml-1 hidden items-center gap-2 rounded-lg border border-border bg-card px-2 py-1 shadow-sm sm:flex">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-primary to-cyan-600 text-[10px] font-semibold text-white">
              <Sparkles className="h-3 w-3" />
            </div>
            <div className="flex flex-col text-left leading-tight">
              <span className="text-[11px] font-semibold text-foreground">Pro Plan</span>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">359d left</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
