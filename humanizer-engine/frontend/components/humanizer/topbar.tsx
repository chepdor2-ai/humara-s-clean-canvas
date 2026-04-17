"use client"

import { usePathname, useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { useState, useRef, useEffect } from "react"
import { ChevronRight, Command, LogOut, Menu, Search, Settings, Sparkles, User, Camera } from "lucide-react"
import { ChangelogPopover } from "@/components/changelog-popover"
import { useCommandPalette } from "@/components/command-palette"
import { ThemeToggle } from "./theme-toggle"
import { useAuth } from "@/app/AuthProvider"
import { supabase } from "@/lib/supabase"

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
  "/app/admin": "Admin",
}

function UserAvatar({ src, name, size = 32 }: { src?: string | null; name?: string; size?: number }) {
  const initials = (name || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  if (src) {
    return (
      <Image
        src={src}
        alt={name || "Avatar"}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className="flex items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-white font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  )
}

export function TopBar({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const palette = useCommandPalette()
  const { user, session } = useAuth()
  const label = LABELS[pathname] ?? "Workspace"
  const isLive = pathname === "/app"

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [profile, setProfile] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch profile
  useEffect(() => {
    if (!session?.access_token) return
    fetch("/api/profile", { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setProfile(d))
      .catch(() => {})
  }, [session?.access_token])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false)
    }
    if (dropdownOpen) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [dropdownOpen])

  const handleSignOut = async () => {
    setDropdownOpen(false)
    await supabase.auth.signOut()
    router.push("/auth")
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !session?.access_token) return
    // Validate file
    if (!file.type.startsWith("image/")) return
    if (file.size > 2 * 1024 * 1024) return // 2MB limit

    const formData = new FormData()
    formData.append("avatar", file)

    try {
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        setProfile((prev) => prev ? { ...prev, avatar_url: data.avatar_url } : prev)
      }
    } catch {
      // silently fail
    }
  }

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User"

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-3 lg:px-10">
        {/* Mobile menu button */}
        <button
          type="button"
          onClick={onMenuToggle}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground lg:hidden"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium hidden sm:inline">Workspace</span>
          <ChevronRight className="h-3 w-3 opacity-60 hidden sm:block" />
          <span className="font-medium text-foreground">{label}</span>
          {isLive && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-soft" />
              Live
            </span>
          )}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          {/* Search / Command palette - desktop */}
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

          {/* Search - mobile */}
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

          {/* User profile dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1 shadow-sm transition-colors hover:bg-accent"
            >
              <UserAvatar src={profile?.avatar_url} name={displayName} size={28} />
              <span className="hidden text-sm font-medium text-foreground sm:block max-w-[120px] truncate">{displayName}</span>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-border bg-popover p-1 shadow-xl shadow-black/10 animate-in fade-in-0 zoom-in-95">
                {/* Profile header */}
                <div className="flex items-center gap-3 px-3 py-3 border-b border-border">
                  <div className="relative group">
                    <UserAvatar src={profile?.avatar_url} name={displayName} size={40} />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Change profile photo"
                    >
                      <Camera className="h-4 w-4 text-white" />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                </div>

                {/* Plan badge */}
                <div className="px-3 py-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-primary to-cyan-600 text-[9px] font-semibold text-white">
                      <Sparkles className="h-3 w-3" />
                    </div>
                    <span className="text-xs font-semibold text-foreground">Pro Plan</span>
                  </div>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <Link
                    href="/app/settings"
                    onClick={() => setDropdownOpen(false)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-popover-foreground hover:bg-accent transition-colors"
                  >
                    <User className="h-4 w-4" />
                    Profile Settings
                  </Link>
                  <Link
                    href="/app/settings"
                    onClick={() => setDropdownOpen(false)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-popover-foreground hover:bg-accent transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                    Account Settings
                  </Link>
                </div>

                <div className="border-t border-border py-1">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
