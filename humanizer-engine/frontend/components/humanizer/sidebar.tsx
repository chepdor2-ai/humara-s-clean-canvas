"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  BookOpen,
  Code2,
  FileText,
  LayoutDashboard,
  LogOut,
  Palette,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  SpellCheck,
  Wand2,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "./theme-toggle"
import { useAuth } from "@/app/AuthProvider"
import { supabase } from "@/lib/supabase"

type NavItem = {
  label: string
  icon: React.ComponentType<{ className?: string }>
  href?: string
  badge?: string
  soon?: boolean
}

const primary: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/app/dashboard" },
  { label: "Humanizer", icon: Wand2, href: "/app" },
  { label: "Documents", icon: FileText, href: "/app/documents" },
  { label: "AI Detector", icon: ShieldCheck, href: "/app/detector" },
  { label: "Style Profiles", icon: Palette, href: "/app/style" },
  { label: "Grammar", icon: SpellCheck, href: "/app/grammar" },
  { label: "Advanced", icon: SlidersHorizontal, href: "/app/advanced" },
  { label: "API", icon: Code2, href: "/app/api-dashboard" },
  { label: "Docs", icon: BookOpen, href: "/app/docs" },
  { label: "Settings", icon: Settings, href: "/app/settings" },
]

const explore: NavItem[] = [
  { label: "Pricing", icon: LayoutDashboard, href: "/pricing" },
  { label: "Blog", icon: FileText, href: "/blog" },
]

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  const baseClass = cn(
    "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
  )
  const body = (
    <>
      {active && (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-y-1 left-0 w-[3px] rounded-r-full bg-primary shadow-[0_0_12px] shadow-primary/40"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">{item.label}</span>
      {item.soon && (
        <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
          Soon
        </span>
      )}
    </>
  )
  if (item.href) {
    return (
      <Link href={item.href} className={baseClass} prefetch>
        {body}
      </Link>
    )
  }
  return (
    <button onClick={() => toast.info(`${item.label} is coming soon`)} className={baseClass}>
      {body}
    </button>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()
  // supabase imported from lib/supabase

  const isActive = (href?: string) => {
    if (!href) return false
    if (href === "/app") return pathname === "/app"
    if (href === "/app/dashboard") return pathname === "/app/dashboard"
    return pathname.startsWith(href)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/95 backdrop-blur-md lg:flex">
      <div className="flex items-center gap-3 px-6 py-5">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-cyan-600 shadow-lg shadow-primary/25">
          <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-cyan-600 blur-md opacity-60 pulse-soft" />
          <svg viewBox="0 0 24 24" className="relative h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v4" />
            <path d="m16.24 7.76 2.83-2.83" />
            <path d="M18 12h4" />
            <path d="m16.24 16.24 2.83 2.83" />
            <path d="M12 18v4" />
            <path d="m7.76 16.24-2.83 2.83" />
            <path d="M6 12H2" />
            <path d="m7.76 7.76-2.83-2.83" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <div className="flex flex-col">
          <span className="text-base font-semibold tracking-tight text-sidebar-foreground">HumaraGPT</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Stealth Suite</span>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto premium-scroll px-3 pb-4">
        <div className="space-y-0.5">
          {primary.map((item) => (
            <NavRow key={item.label} item={item} active={isActive(item.href)} />
          ))}
        </div>

        <div>
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Explore
          </div>
          <div className="space-y-0.5">
            {explore.map((item) => (
              <NavRow key={item.label} item={item} active={false} />
            ))}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-sidebar-border bg-gradient-to-br from-sidebar-accent/60 to-transparent p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Monthly Usage</div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-xl font-semibold text-sidebar-foreground tabular-nums">12,480</span>
            <span className="text-xs text-muted-foreground">/ 80,000</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-[16%] rounded-full bg-gradient-to-r from-primary to-cyan-500" />
          </div>
          <button
            onClick={() => toast.info("Upgrade flow coming soon")}
            className="mt-3 w-full rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
          >
            Upgrade Plan
          </button>
        </div>
      </nav>

      <div className="space-y-0.5 border-t border-sidebar-border p-3">
        <Link
          href="/"
          className="group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Back to Home</span>
        </Link>
        <ThemeToggle variant="row" />
        <button
          onClick={handleSignOut}
          className="group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
