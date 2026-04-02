import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://humara-blank-canvas.lovable.app'),
  title: 'Humara AI Humanizer & Detector Platform',
  description: 'Humara is an AI humanizer and detector platform with live scoring, cleaner rewrites, SEO-ready pages, and a modern workflow for content teams.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Humara',
  keywords: ['Humara', 'AI humanizer', 'AI detector', 'humanize text', 'AI rewrite tool', 'content detection'],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Humara AI Humanizer & Detector Platform',
    description: 'Humanize AI text, measure detector scores, and manage cleaner publishing workflows with Humara.',
    url: 'https://humara-blank-canvas.lovable.app',
    siteName: 'Humara',
    type: 'website',
    images: [
      {
        url: '/humara-mark.svg',
        width: 1200,
        height: 630,
        alt: 'Humara brand mark',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Humara AI Humanizer & Detector Platform',
    description: 'Rewrite AI text with a more human flow and compare detector scores in one workspace.',
    images: ['/humara-mark.svg'],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.png', type: 'image/png', sizes: '96x96' },
    ],
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
              <Image src="/humara-wordmark.svg" alt="Humara logo" width={210} height={56} className="brand-logo" priority />
              <div className="hidden sm:block">
                <p className="brand-kicker">Humanizer + Detector + Studio</p>
              </div>
            </Link>

            <div className="flex flex-wrap items-center justify-end gap-5">
              <Link href="/" className="nav-link">Home</Link>
              <Link href="/detector" className="nav-link">Detector</Link>
              <Link href="/pricing" className="nav-link">Pricing</Link>
              <Link href="/about" className="nav-link">About</Link>
              <Link href="/contact" className="nav-link">Contact</Link>
            </div>
          </div>
        </nav>

        {children}

        <footer className="mt-12 border-t border-[hsl(var(--border))] bg-[hsl(var(--card)/0.72)]">
          <div className="app-frame grid gap-6 py-8 text-xs footer-copy md:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
            <div className="space-y-2">
              <p className="text-sm font-extrabold tracking-[0.22em] text-[hsl(var(--foreground))]">Humara</p>
              <p>AI humanizer and detector workflows designed for cleaner publishing, stronger routing, and production-ready deployment.</p>
            </div>
            <div className="space-y-2">
              <p className="field-label">Platform</p>
              <Link href="/">Humanizer</Link><br />
              <Link href="/detector">Detector</Link><br />
              <Link href="/pricing">Pricing</Link>
            </div>
            <div className="space-y-2">
              <p className="field-label">Company</p>
              <Link href="/about">About</Link><br />
              <Link href="/contact">Contact</Link><br />
              <Link href="/how-it-works">How it works</Link>
            </div>
            <div className="space-y-2">
              <p className="field-label">Legal</p>
              <Link href="/terms">Terms</Link><br />
              <Link href="/privacy">Privacy</Link><br />
              <span>© 2026 Humara</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
