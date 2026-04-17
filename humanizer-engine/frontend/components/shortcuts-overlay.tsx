"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { useEventBus, useKeyboardShortcut } from "@/lib/hooks"

const groups: { heading: string; rows: { label: string; keys: string[] }[] }[] = [
  {
    heading: "General",
    rows: [
      { label: "Open command palette", keys: ["⌘", "K"] },
      { label: "Toggle theme", keys: ["T"] },
      { label: "Show shortcuts", keys: ["?"] },
    ],
  },
  {
    heading: "Humanizer",
    rows: [
      { label: "Humanize", keys: ["H"] },
      { label: "Insert sample text", keys: ["S"] },
      { label: "Clear input", keys: ["C"] },
      { label: "Copy output", keys: ["⌘", "Shift", "C"] },
      { label: "Toggle diff view", keys: ["D"] },
      { label: "Step rate down / up", keys: ["[", "]"] },
    ],
  },
  {
    heading: "Navigation",
    rows: [
      { label: "Go to Dashboard", keys: ["G", "D"] },
      { label: "Go to Humanizer", keys: ["G", "H"] },
      { label: "Go to Documents", keys: ["G", "O"] },
      { label: "Go to AI Detector", keys: ["G", "A"] },
    ],
  },
]

export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false)
  useKeyboardShortcut({ key: "?", shift: true }, () => setOpen(true))
  useEventBus("shortcuts:open", () => setOpen(true))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Fly through HumaraGPT without touching the mouse.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.heading}>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.heading}
              </div>
              <div className="space-y-1.5">
                {g.rows.map((r) => (
                  <div
                    key={r.label}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm"
                  >
                    <span className="text-foreground/85">{r.label}</span>
                    <KbdGroup>
                      {r.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </KbdGroup>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
