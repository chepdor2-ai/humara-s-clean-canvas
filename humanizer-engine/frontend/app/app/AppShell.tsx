'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { ThemeProvider } from '@/components/theme-provider'
import { Sidebar } from '@/components/humanizer/sidebar'
import { TopBar } from '@/components/humanizer/topbar'
import { CommandPaletteProvider } from '@/components/command-palette'
import { ShortcutsOverlay } from '@/components/shortcuts-overlay'
import { AmbientBackground } from '@/components/ambient-background'
import { OnboardingTour } from '@/components/onboarding-tour'
import { Toaster } from '@/components/ui/sonner'
import { UsageProvider } from './UsageBar'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const isGrammarRoute = pathname === '/app/grammar'

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <CommandPaletteProvider>
        <UsageProvider>
          <AmbientBackground />
          <div className="flex min-h-screen">
            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <div className="flex min-h-0 flex-1 flex-col min-w-0">
              <TopBar onMenuToggle={() => setSidebarOpen(o => !o)} />
              <main className={isGrammarRoute ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 min-h-0 overflow-y-auto'}>{children}</main>
            </div>
          </div>
          <ShortcutsOverlay />
          <OnboardingTour />
          <Toaster />
        </UsageProvider>
      </CommandPaletteProvider>
    </ThemeProvider>
  )
}
