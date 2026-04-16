import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free AI Detector — Check If Text Is AI-Generated',
  description: 'Scan text against GPTZero, Turnitin, Originality.AI, Winston AI & Copyleaks in one click. Free AI detection tool by HumaraGPT.',
  alternates: { canonical: 'https://www.humaragpt.com/detector' },
};

export default function DetectorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
