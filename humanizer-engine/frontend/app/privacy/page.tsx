import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Humara Privacy Policy',
  description: 'Read the Humara privacy policy.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <main className="pb-12 pt-8 md:pt-12">
      <div className="app-frame space-y-6">
        <section className="panel hero-panel p-6 md:p-8 lg:p-10">
          <div className="eyebrow">Privacy</div>
          <h1 className="hero-title">Humara privacy policy.</h1>
          <p className="hero-copy">This page explains how platform usage and submitted content are handled in the product experience.</p>
        </section>
        <section className="panel p-6"><p className="hero-copy">Humara is designed around a minimal, transparent product surface. Operational data should only be used to support platform delivery, quality, and troubleshooting.</p></section>
      </div>
    </main>
  );
}
