import AuthGuard from './AuthGuard';
import { AppShell } from './AppShell';

export const metadata = {
  title: "HumaraGPT App - Best AI Text Converter",
  description: 'Make AI text look natural and bypass detectors easily.',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}

