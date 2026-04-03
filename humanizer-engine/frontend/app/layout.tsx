import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import RootLayoutClient from './RootLayoutClient';
import ThemeProvider from './ThemeProvider';
import { AuthProvider } from './AuthProvider';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://humaragpt.com'),
  title: {
    default: 'HumaraGPT — Make AI Text Undetectable | #1 AI Humanizer',
    template: '%s | HumaraGPT',
  },
  description: 'HumaraGPT rewrites AI-generated text so it reads 100% human. Bypass Turnitin, GPTZero & Originality.AI while keeping your meaning intact.',
  keywords: ['AI humanizer', 'bypass AI detection', 'undetectable AI', 'Turnitin bypass', 'GPTZero bypass', 'Originality.AI bypass', 'AI text rewriter', 'humanize ChatGPT text', 'AI content humanizer', 'make AI text human'],
  authors: [{ name: 'HumaraGPT' }],
  creator: 'HumaraGPT',
  publisher: 'HumaraGPT',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icon.png', sizes: '256x256', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://humaragpt.com',
    siteName: 'HumaraGPT',
    title: 'HumaraGPT — Make AI Text Undetectable',
    description: 'HumaraGPT rewrites AI-generated text so it reads 100% human. Bypass Turnitin, GPTZero & Originality.AI.',
    images: [{ url: '/og-logo.png', width: 1200, height: 1200, alt: 'HumaraGPT AI Humanizer' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HumaraGPT — Make AI Text Undetectable',
    description: 'Rewrite AI text to bypass every detector. 100% human scores on Turnitin, GPTZero & more.',
    images: ['/og-logo.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="bg-white dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 antialiased font-sans transition-colors duration-300">
        <ThemeProvider>
          <AuthProvider>
            <RootLayoutClient>{children}</RootLayoutClient>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

