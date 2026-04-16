import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import './light-overrides.css';
import RootLayoutClient from './RootLayoutClient';
import ThemeProvider from './ThemeProvider';
import { AuthProvider } from './AuthProvider';

const SITE_URL = 'https://www.humaragpt.com';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'HumaraGPT — AI Text Humanizer | Make AI Content Undetectable',
    template: '%s | HumaraGPT',
  },
  description: 'HumaraGPT is the leading AI text humanizer with 16+ specialized engines — Humara, Nuru, Oxygen, Ozone, Ghost, Ninja, King & more — each targeting a different AI detector. Bypass Turnitin, GPTZero, Originality.AI & Copyleaks with the right engine for every detection problem. Built for content creators, SEO professionals & enterprises.',
  keywords: [
    'AI humanizer', 'AI text humanizer', 'humanize AI text', 'AI content humanizer',
    'AI text rewriter', 'make AI text human', 'undetectable AI writer',
    'bypass AI detection', 'AI detection bypass tool', 'AI content rewriter',
    'humanize ChatGPT text', 'ChatGPT humanizer', 'GPT text humanizer',
    'Turnitin bypass', 'GPTZero bypass', 'Originality.AI bypass', 'Copyleaks bypass',
    'AI to human text converter', 'AI paraphrasing tool', 'anti AI detection',
    'content humanization', 'SEO content humanizer', 'professional AI rewriter',
    'text humanization tool', 'AI writing assistant', 'undetectable AI content',
    'remove AI detection', 'human-like AI text', 'natural AI text rewriter',
    'multiple AI humanizer engines', 'best humanizer engine collection', 'all AI detectors bypass',
    'Humara engine', 'Nuru engine', 'Oxygen humanizer', 'Ghost humanizer', 'Ninja humanizer',
    'King humanizer', 'Ozone humanizer', 'every AI detection solution',
  ],
  authors: [{ name: 'HumaraGPT' }],
  creator: 'HumaraGPT',
  publisher: 'HumaraGPT',
  category: 'Technology',
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
    url: SITE_URL,
    siteName: 'HumaraGPT',
    title: 'HumaraGPT — 16+ AI Humanizer Engines | Make AI Content Undetectable',
    description: 'The most advanced AI text humanizer with 16+ specialized engines for every AI detector. Bypass Turnitin, GPTZero, Originality.AI & Copyleaks while preserving original meaning.',
    images: [{ url: '/og-logo.png', width: 1200, height: 1200, alt: 'HumaraGPT — Leading AI Text Humanization Platform' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HumaraGPT — AI Text Humanizer',
    description: 'Rewrite AI content to bypass every detector. 99.2% human scores on Turnitin, GPTZero & more. Built for professionals & creators.',
    images: ['/og-logo.png'],
    creator: '@humaragpt',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  alternates: {
    canonical: SITE_URL,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('humara-theme');
                  var dark = stored === 'dark';
                  document.documentElement.classList.toggle('dark', dark);
                  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
                  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
                } catch (e) {}
              })();
            `,
          }}
        />
        <Script
          id="remove-extension-attrs"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var extAttrs = ['bis_skin_checked','bis_use','data-bis-config','data-dynamic-id'];
                var removeExtensionAttrs = function() {
                  extAttrs.forEach(function(attr) {
                    document.querySelectorAll('[' + attr + ']').forEach(function(el) {
                      el.removeAttribute(attr);
                    });
                  });
                };
                removeExtensionAttrs();
                var observer = new MutationObserver(removeExtensionAttrs);
                observer.observe(document.documentElement, { 
                  attributes: true, 
                  attributeFilter: extAttrs,
                  childList: true, 
                  subtree: true 
                });
              })();
            `,
          }}
        />
      </head>
      <body className="bg-slate-50 text-slate-900 dark:bg-[#05050A] dark:text-zinc-100 antialiased font-sans" suppressHydrationWarning>
        <Script
          id="json-ld-org"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'HumaraGPT',
              applicationCategory: 'UtilitiesApplication',
              operatingSystem: 'Web',
              url: SITE_URL,
              description: 'HumaraGPT is the leading AI text humanizer that rewrites AI-generated content to sound 100% human. Bypass Turnitin, GPTZero, Originality.AI & Copyleaks.',
              offers: {
                '@type': 'AggregateOffer',
                lowPrice: '5',
                highPrice: '35',
                priceCurrency: 'USD',
                offerCount: '4',
              },
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: '4.9',
                ratingCount: '2847',
                bestRating: '5',
                worstRating: '1',
              },
              provider: {
                '@type': 'Organization',
                name: 'HumaraGPT',
                url: SITE_URL,
                logo: `${SITE_URL}/og-logo.png`,
                sameAs: ['https://twitter.com/humaragpt'],
              },
            }),
          }}
        />
        <Script
          id="json-ld-faq"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: [
                {
                  '@type': 'Question',
                  name: 'What is HumaraGPT?',
                  acceptedAnswer: { '@type': 'Answer', text: 'HumaraGPT is an advanced AI text humanization platform that rewrites AI-generated content to be indistinguishable from human writing. It uses linguistic analysis, structural rewriting, and tone calibration to bypass all major AI detectors.' },
                },
                {
                  '@type': 'Question',
                  name: 'Which AI detectors does HumaraGPT bypass?',
                  acceptedAnswer: { '@type': 'Answer', text: 'HumaraGPT consistently bypasses Turnitin, GPTZero, Originality.AI, Copyleaks, Winston AI, Sapling, and ZeroGPT with a 99.2% average human score.' },
                },
                {
                  '@type': 'Question',
                  name: 'Can I use HumaraGPT for academic papers?',
                  acceptedAnswer: { '@type': 'Answer', text: 'No. HumaraGPT strictly prohibits use for academic submissions including essays, dissertations, theses, coursework, and any graded assignments. The platform is designed exclusively for professional content creation, SEO, marketing, and enterprise use.' },
                },
                {
                  '@type': 'Question',
                  name: 'How does AI text humanization work?',
                  acceptedAnswer: { '@type': 'Answer', text: 'AI text humanization works by analyzing and removing detectable AI patterns — uniform sentence lengths, predictable phrasing, and robotic transitions — then reconstructing the text with natural burstiness, varied vocabulary, and human-like rhythm while preserving the original meaning.' },
                },
                {
                  '@type': 'Question',
                  name: 'Is my content stored when using HumaraGPT?',
                  acceptedAnswer: { '@type': 'Answer', text: 'No. HumaraGPT processes all text in memory and discards it immediately after humanization. We never store your content permanently.' },
                },
              ],
            }),
          }}
        />
        <ThemeProvider>
          <AuthProvider>
            <RootLayoutClient>{children}</RootLayoutClient>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

