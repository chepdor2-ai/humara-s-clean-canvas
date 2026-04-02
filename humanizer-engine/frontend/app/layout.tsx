import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Humara | AI Humanizer & Detector',
  description: 'Humara combines AI humanization and AI detection in one working interface powered by the existing engine stack.',
  icons: {
    icon: '/icon.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="app-shell">
        <nav className="site-nav">
          <div className="app-frame flex min-h-16 items-center justify-between gap-6 py-3">
            <Link href="/" className="brand-mark">
              <Image src="/humara-logo.png" alt="Humara logo" width={170} height={56} className="brand-logo" priority />
              <div className="hidden sm:block">
                <p className="brand-kicker">Humanizer + Detector</p>
              </div>
            </Link>

            <div className="flex items-center gap-5">
              <Link href="/" className="nav-link">Home</Link>
              <Link href="/detector" className="nav-link">Detector</Link>
            </div>
          </div>
        </nav>

        {children}

        <footer className="mt-12 border-t border-[hsl(var(--border))] bg-[hsl(var(--card)/0.72)]">
          <div className="app-frame py-6 text-center text-xs footer-copy">
            <p>© 2026 Humara. Humanizer and detector workflows powered by your existing engine stack.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
