import AuthGuard from '../app/AuthGuard'
import { AppShell } from '../app/AppShell'

export const metadata = {
  title: 'Humara Workspace',
  description: 'Claude-like academic workspace for research, drafting, grading, revision, and export.',
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  )
}
