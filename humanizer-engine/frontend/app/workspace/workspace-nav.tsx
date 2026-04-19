'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, PenLine, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/workspace/scholar', label: 'Scholar', icon: BookOpen },
  { href: '/workspace/writer', label: 'Writer', icon: PenLine },
]

export function WorkspaceNav() {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-slate-900 dark:text-zinc-50"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-600 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <span>Humara</span>
          <span className="hidden text-xs font-medium text-slate-500 dark:text-zinc-400 sm:inline">
            / Workspace
          </span>
        </Link>

        <nav className="ml-2 flex items-center gap-1" aria-label="Workspace">
          {TABS.map((t) => {
            const active = pathname?.startsWith(t.href)
            const Icon = t.icon
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition',
                  active
                    ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-400'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto">
          <Link
            href="/app"
            className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Humanizer
          </Link>
        </div>
      </div>
    </header>
  )
}
