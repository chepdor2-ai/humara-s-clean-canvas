"use client"

import Link from "next/link"
import Image from "next/image"
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
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  SpellCheck,
  Wand2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "./theme-toggle"
import { useAuth } from "@/app/AuthProvider"
import { supabase } from "@/lib/supabase"
import { useUsage } from "@/app/app/UsageBar"

const ADMIN_EMAILS = ['maguna956@gmail.com', 'maxwellotieno11@gmail.com']

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

function NavRow({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
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
          className="sidebar-active-indicator absolute inset-y-1 left-0 w-[3px] rounded-r-full bg-primary shadow-[0_0_12px] shadow-primary/40"
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
      <Link href={item.href} className={baseClass} prefetch onClick={onNavigate}>
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

export function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()
  const { usage, loading: usageLoading } = useUsage()
  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email)

  const navItems: NavItem[] = [
    ...primary,
    ...(isAdmin ? [{ label: "Admin", icon: Shield as React.ComponentType<{ className?: string }>, href: "/app/admin" }] : []),
  ]

  const isActive = (href?: string) => {
    if (!href) return false
    if (href === "/app") return pathname === "/app"
    if (href === "/app/dashboard") return pathname === "/app/dashboard" || pathname === "/app/payment/verify"
    return pathname.startsWith(href)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={onClose} />
      )}

      <aside className={cn(
        "premium-sidebar fixed top-0 left-0 z-50 h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/95 backdrop-blur-md transition-transform duration-200 lg:static lg:z-auto lg:flex",
        open ? "flex translate-x-0" : "-translate-x-full lg:translate-x-0 lg:flex hidden"
      )}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-5">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative logo-shine">
              <Image src="/logo.png" alt="HumaraGPT" width={36} height={36} priority className="w-9 h-9 relative z-10 drop-shadow-[0_0_10px_rgba(6,182,212,0.6)]" />
              <div className="sidebar-logo-pulse absolute -inset-1 rounded-full bg-cyan-500/25 animate-[logoPulse_2.5s_ease-in-out_infinite] blur-md" />
            </div>
            <div className="flex flex-col">
              <span className="brand-wordmark text-base font-semibold tracking-tight"><span className="brand-humara">Humara</span><span className="brand-gpt uniform-brand-glow">GPT</span></span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Stealth Suite</span>
            </div>
          </Link>
          {/* Mobile close button */}
          <button onClick={onClose} className="ml-auto p-1 rounded-md text-muted-foreground hover:text-foreground lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto premium-scroll px-3 pb-4">
          <div className="space-y-0.5">
            {navItems.map((item) => (
              <NavRow key={item.label} item={item} active={isActive(item.href)} onNavigate={onClose} />
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
            <span className="text-xl font-semibold text-sidebar-foreground tabular-nums">{usageLoading ? '—' : (usage?.monthlyUsed ?? 0).toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">/ {usageLoading ? '—' : (usage?.monthlyLimit ?? 0).toLocaleString()}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="sidebar-auto-glow-bar h-full rounded-full bg-gradient-to-r from-primary to-cyan-500 transition-all" style={{ width: `${usage ? Math.min(100, Math.round(((usage.monthlyUsed ?? 0) / Math.max(1, usage.monthlyLimit ?? 0)) * 100)) : 0}%` }} />
          </div>
          <Link
            href="/pricing"
            onClick={onClose}
            className="sidebar-auto-glow-link mt-3 block w-full rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-center text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
          >
            Upgrade Plan
          </Link>
        </div>
      </nav>

      <div className="space-y-0.5 border-t border-sidebar-border p-3">
        <Link
          href="/"
          onClick={onClose}
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
    </>
  )
}
