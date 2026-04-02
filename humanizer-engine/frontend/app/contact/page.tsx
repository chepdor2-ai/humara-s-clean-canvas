import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Humara',
  description: 'Contact Humara for product, deployment, and platform questions.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <main className="pb-12 pt-8 md:pt-12">
      <div className="app-frame space-y-6">
        <section className="panel hero-panel p-6 md:p-8 lg:p-10">
          <div className="eyebrow">Contact</div>
          <h1 className="hero-title">Talk to the Humara team.</h1>
          <p className="hero-copy">Use this page for product questions, deployment support, or commercial discussions.</p>
        </section>
        <section className="grid gap-4 md:grid-cols-3">
          <article className="metric-card"><p className="metric-label">Email</p><p className="mt-2 text-lg font-extrabold">hello@humara.ai</p></article>
          <article className="metric-card"><p className="metric-label">Support</p><p className="mt-2 text-lg font-extrabold">Platform setup</p></article>
          <article className="metric-card"><p className="metric-label">Response</p><p className="mt-2 text-lg font-extrabold">Business days</p></article>
        </section>
      </div>
    </main>
  );
}
