import type { Metadata } from 'next';
import './globals.css';
import RootLayoutClient from './RootLayoutClient';

export const metadata: Metadata = {
  title: "Humara - World's Best AI Text Humanizer",
  description: 'Bypass AI detectors with standard-setting humanization.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#FFF8F0] text-[#5C4033] antialiased">
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
