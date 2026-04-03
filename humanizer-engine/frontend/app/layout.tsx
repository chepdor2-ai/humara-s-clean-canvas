import type { Metadata } from 'next';
import './globals.css';
import RootLayoutClient from './RootLayoutClient';

export const metadata: Metadata = {
  title: "Humara - Make AI Text Look Human",
  description: 'Bypass AI detectors and make your AI text completely natural.',       
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-slate-900 antialiased">
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}

