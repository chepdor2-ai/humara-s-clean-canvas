import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
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
    default: 'HumaraGPT — AI Text Humanizer | Make AI Content Undetectable',
    template: '%s | HumaraGPT',
  },
  description: 'HumaraGPT is the leading AI text humanizer that rewrites AI-generated content to sound 100% human. Bypass Turnitin, GPTZero, Originality.AI & Copyleaks. Built for content creators, SEO professionals & enterprises. Strictly prohibited for academic submissions.',
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
    url: 'https://humaragpt.com',
    siteName: 'HumaraGPT',
    title: 'HumaraGPT — AI Text Humanizer | Make AI Content Undetectable',
    description: 'The most advanced AI text humanizer. Rewrite AI-generated content to bypass Turnitin, GPTZero, Originality.AI & Copyleaks while preserving original meaning. Not for academic use.',
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
    canonical: 'https://humaragpt.com',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} dark`} suppressHydrationWarning>
      <head>
        <Script
          id="remove-extension-attrs"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var removeExtensionAttrs = function() {
                  document.querySelectorAll('[bis_skin_checked]').forEach(function(el) {
                    el.removeAttribute('bis_skin_checked');
                  });
                };
                removeExtensionAttrs();
                var observer = new MutationObserver(removeExtensionAttrs);
                observer.observe(document.documentElement, { 
                  attributes: true, 
                  attributeFilter: ['bis_skin_checked'],
                  childList: true, 
                  subtree: true 
                });
                var interval = setInterval(removeExtensionAttrs, 10);
                setTimeout(function() { clearInterval(interval); }, 1000);
              })();
            `,
          }}
        />
      </head>
      <body className="bg-[#05050A] text-zinc-100 antialiased font-sans" suppressHydrationWarning>
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
              url: 'https://humaragpt.com',
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
                url: 'https://humaragpt.com',
                logo: 'https://humaragpt.com/og-logo.png',
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

