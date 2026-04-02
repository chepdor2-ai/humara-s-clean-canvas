import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Humara Terms of Service',
  description: 'Read the Humara terms of service.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <main className="pb-12 pt-8 md:pt-12">
      <div className="app-frame space-y-6">
        <section className="panel hero-panel p-6 md:p-8 lg:p-10">
          <div className="eyebrow">Terms</div>
          <h1 className="hero-title">Humara terms of service.</h1>
          <p className="hero-copy">These terms define acceptable use of the humanizer, detector, and related pages.</p>
        </section>
        <section className="panel p-6"><p className="hero-copy">Use the platform responsibly, review generated content before publication, and ensure your usage complies with local and platform requirements.</p></section>
      </div>
    </main>
  );
}
