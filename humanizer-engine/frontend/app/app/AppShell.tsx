'use client'

import { ThemeProvider } from '@/components/theme-provider'
import { Sidebar } from '@/components/humanizer/sidebar'
import { TopBar } from '@/components/humanizer/topbar'
import { CommandPaletteProvider } from '@/components/command-palette'
import { ShortcutsOverlay } from '@/components/shortcuts-overlay'
import { AmbientBackground } from '@/components/ambient-background'
import { OnboardingTour } from '@/components/onboarding-tour'
import { Toaster } from '@/components/ui/sonner'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <CommandPaletteProvider>
        <AmbientBackground />
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex flex-1 flex-col">
            <TopBar />
            <main className="flex-1">{children}</main>
          </div>
        </div>
        <ShortcutsOverlay />
        <OnboardingTour />
        <Toaster />
      </CommandPaletteProvider>
    </ThemeProvider>
  )
}
