"use client"

import { ChevronDown, Copy, Download, FileCode, FileDown, FileText, Link2 } from "lucide-react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function downloadFile(name: string, content: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function ExportMenu({ text, disabled }: { text: string; disabled?: boolean }) {
  const safe = (fn: () => void) => () => {
    if (!text.trim()) {
      toast.error("Nothing to export yet")
      return
    }
    fn()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
          Export
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          onSelect={safe(() => {
            navigator.clipboard.writeText(text)
            toast.success("Copied plain text")
          })}
        >
          <Copy className="h-4 w-4" />
          Copy as plain text
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={safe(() => {
            const md = text
            navigator.clipboard.writeText(md)
            toast.success("Copied as Markdown")
          })}
        >
          <FileCode className="h-4 w-4" />
          Copy as Markdown
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={safe(() => {
            downloadFile("humanized.txt", text)
            toast.success("Downloaded humanized.txt")
          })}
        >
          <FileText className="h-4 w-4" />
          Download .txt
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={safe(() => {
            downloadFile("humanized.md", text, "text/markdown")
            toast.success("Downloaded humanized.md")
          })}
        >
          <FileCode className="h-4 w-4" />
          Download .md
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={safe(() => {
            const html = `<!doctype html><html><head><meta charset="utf-8"><title>Humanized</title></head><body style="font-family:Geist,system-ui;max-width:720px;margin:40px auto;line-height:1.7;">${text
              .split(/\n+/)
              .map((p) => `<p>${p.replace(/</g, "&lt;")}</p>`)
              .join("")}</body></html>`
            downloadFile("humanized.html", html, "text/html")
            toast.success("Downloaded humanized.html")
          })}
        >
          <FileDown className="h-4 w-4" />
          Download .html
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={safe(() => {
            toast.message("Share link ready", { description: "Demo only — link copied." })
            navigator.clipboard.writeText(`https://humaragpt.app/s/${Math.random().toString(36).slice(2, 10)}`)
          })}
        >
          <Link2 className="h-4 w-4" />
          Copy share link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
