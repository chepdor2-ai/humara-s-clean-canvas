"use client"

import Link from "next/link"
import { ArrowRight, FileText, ShieldCheck, Wand2 } from "lucide-react"

type Item = {
  id: string
  type: "humanize" | "detect" | "document"
  title: string
  when: string
  risk?: number
  mode?: string
}

const items: Item[] = [
  { id: "1", type: "humanize", title: "Thesis chapter 4 — revised conclusions", when: "2m ago", risk: 0.04, mode: "Anti GPTZero" },
  { id: "2", type: "document", title: "Market analysis Q2 — draft v3", when: "1h ago" },
  { id: "3", type: "detect", title: "Scanned: cover-letter-final.docx", when: "3h ago", risk: 0.12 },
  { id: "4", type: "humanize", title: "Blog: Why latency matters", when: "Yesterday", risk: 0.07, mode: "Stealth" },
  { id: "5", type: "humanize", title: "Onboarding email rewrite", when: "2d ago", risk: 0.03, mode: "Deep Kill" },
]

const typeMeta: Record<Item["type"], { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  humanize: { icon: Wand2, color: "bg-primary/10 text-primary", label: "Humanized" },
  detect: { icon: ShieldCheck, color: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400", label: "Scanned" },
  document: { icon: FileText, color: "bg-amber-500/10 text-amber-500 dark:text-amber-400", label: "Saved" },
}

export function RecentActivity() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm rise-in">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">Recent activity</div>
        <Link
          href="/documents"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          View all
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <ul className="mt-1 flex flex-col">
        {items.map((item, i) => {
          const meta = typeMeta[item.type]
          const Icon = meta.icon
          return (
            <li key={item.id}>
              <button className="group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/50">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.color}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{meta.label}</span>
                    {item.mode && (
                      <>
                        <span>·</span>
                        <span>{item.mode}</span>
                      </>
                    )}
                    {item.risk !== undefined && (
                      <>
                        <span>·</span>
                        <span className="font-mono tabular-nums">{Math.round(item.risk * 100)}% risk</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="whitespace-nowrap text-[11px] text-muted-foreground">{item.when}</span>
              </button>
              {i < items.length - 1 && <div className="hairline" />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
