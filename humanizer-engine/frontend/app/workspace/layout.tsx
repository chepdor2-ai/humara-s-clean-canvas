import type { Metadata } from 'next'
import { WorkspaceNav } from './workspace-nav'

export const metadata: Metadata = {
  title: {
    default: 'Humara Workspace',
    template: '%s | Humara Workspace',
  },
  description:
    'Academic workspace — search real scholarly sources and draft papers with AI-powered writing and citation support.',
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-[#0a0a10] dark:text-zinc-100">
      <WorkspaceNav />
      <main className="flex-1">{children}</main>
    </div>
  )
}
