"use client"

import Link from "next/link"
import { Command, Keyboard, Sparkles, Wand2 } from "lucide-react"
import { toast } from "sonner"
import { useCommandPalette } from "@/components/command-palette"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { emit } from "@/lib/hooks"

export function QuickActions() {
  const palette = useCommandPalette()
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.12] via-primary/[0.04] to-transparent p-5 shadow-sm rise-in">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/25 blur-3xl" />
      <div className="relative flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold text-foreground">Start something</span>
        </div>

        <Link
          href="/humanizer"
          className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card/70 p-3 transition-all hover:border-primary/40 hover:bg-card"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Wand2 className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-medium">Open Humanizer</span>
              <span className="block text-[11px] text-muted-foreground">Paste text, hit Humanize</span>
            </span>
          </span>
          <Kbd>H</Kbd>
        </Link>

        <button
          onClick={palette.toggle}
          className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card/70 p-3 transition-all hover:border-primary/40 hover:bg-card"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Command className="h-4 w-4" />
            </span>
            <span className="text-left">
              <span className="block text-sm font-medium">Command palette</span>
              <span className="block text-[11px] text-muted-foreground">Jump to anything</span>
            </span>
          </span>
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </button>

        <button
          onClick={() => {
            emit("shortcuts:open")
            toast.message("Shortcuts reference opened")
          }}
          className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card/70 p-3 transition-all hover:border-primary/40 hover:bg-card"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Keyboard className="h-4 w-4" />
            </span>
            <span className="text-left">
              <span className="block text-sm font-medium">Keyboard shortcuts</span>
              <span className="block text-[11px] text-muted-foreground">Fly through the app</span>
            </span>
          </span>
          <Kbd>?</Kbd>
        </button>
      </div>
    </div>
  )
}
