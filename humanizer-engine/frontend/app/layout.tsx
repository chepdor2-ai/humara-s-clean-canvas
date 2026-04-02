import type { Metadata } from 'next';
import './globals.css';
import RootLayoutClient from './RootLayoutClient';

export const metadata: Metadata = {
  title: "Humara - World's Most Advanced AI Text Humanizer",
  description: 'The ultimate AI humanization platform. Undetectable by all AI detectors. Transform AI text into authentic human writing.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0A0A0F] text-white antialiased">
        <div className="fixed inset-0 bg-gradient-to-br from-indigo-950/20 via-transparent to-teal-950/20 pointer-events-none" />
        <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.05),transparent_50%)] pointer-events-none" />
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
