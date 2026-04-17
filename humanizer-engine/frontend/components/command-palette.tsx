"use client"

import { useRouter } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useState } from "react"
import {
  BookOpen,
  Code2,
  Download,
  FileText,
  Keyboard,
  LayoutDashboard,
  LogOut,
  Moon,
  Palette,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Wand2,
  Zap,
} from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { emit, useKeyboardShortcut } from "@/lib/hooks"

type Ctx = {
  open: boolean
  setOpen: (v: boolean) => void
  toggle: () => void
}

const CommandPaletteCtx = createContext<Ctx | null>(null)

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteCtx)
  if (!ctx) throw new Error("useCommandPalette must be used within CommandPaletteProvider")
  return ctx
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen((v) => !v), [])

  useKeyboardShortcut({ key: "k", meta: true, preventDefault: true }, () => toggle())
  useKeyboardShortcut({ key: "escape" }, () => setOpen(false))

  return (
    <CommandPaletteCtx.Provider value={{ open, setOpen, toggle }}>
      {children}
      <CommandPalette open={open} setOpen={setOpen} />
    </CommandPaletteCtx.Provider>
  )
}

function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const router = useRouter()
  const { setTheme, resolvedTheme } = useTheme()

  const run = (fn: () => void) => () => {
    setOpen(false)
    // Let the dialog close before running to avoid focus conflicts
    setTimeout(fn, 30)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Search pages, run actions, and jump anywhere."
      className="overflow-hidden shadow-2xl"
    >
      <CommandInput placeholder="Type a command or search…" />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem onSelect={run(() => emit("humanizer:run"))}>
            <Zap />
            <span>Humanize current text</span>
            <CommandShortcut>H</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => emit("humanizer:sample"))}>
            <Sparkles />
            <span>Insert sample text</span>
            <CommandShortcut>S</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => emit("humanizer:clear"))}>
            <FileText />
            <span>Clear input</span>
            <CommandShortcut>C</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => emit("humanizer:export"))}>
            <Download />
            <span>Export output…</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={run(() => router.push("/app/dashboard"))}>
            <LayoutDashboard />
            <span>Dashboard</span>
            <CommandShortcut>G D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => router.push("/app"))}>
            <Wand2 />
            <span>Humanizer</span>
            <CommandShortcut>G H</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => router.push("/app/documents"))}>
            <FileText />
            <span>Documents</span>
            <CommandShortcut>G O</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => router.push("/app/detector"))}>
            <ShieldCheck />
            <span>AI Detector</span>
            <CommandShortcut>G A</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => router.push("/app/style"))}>
            <Palette />
            <span>Style Profiles</span>
          </CommandItem>
          <CommandItem onSelect={run(() => router.push("/app/grammar"))}>
            <SlidersHorizontal />
            <span>Grammar</span>
          </CommandItem>
          <CommandItem onSelect={run(() => toast.info("API console coming soon"))}>
            <Code2 />
            <span>API</span>
          </CommandItem>
          <CommandItem onSelect={run(() => toast.info("Docs coming soon"))}>
            <BookOpen />
            <span>Docs</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Preferences">
          <CommandItem
            onSelect={run(() => {
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
              toast.success(`Switched to ${resolvedTheme === "dark" ? "light" : "dark"} mode`)
            })}
          >
            {resolvedTheme === "dark" ? <Sun /> : <Moon />}
            <span>Toggle theme</span>
            <CommandShortcut>T</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => emit("shortcuts:open"))}>
            <Keyboard />
            <span>Keyboard shortcuts</span>
            <CommandShortcut>?</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => toast.info("Settings coming soon"))}>
            <Settings />
            <span>Settings</span>
          </CommandItem>
          <CommandItem onSelect={run(() => toast.message("Signed out (demo)"))}>
            <LogOut />
            <span>Sign out</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
