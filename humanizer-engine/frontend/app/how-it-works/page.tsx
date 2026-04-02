import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How Humara Works',
  description: 'See how Humara rewrites text, scores outputs, and supports publishing workflows.',
  alternates: { canonical: '/how-it-works' },
};

const steps = [
  'Paste original text into the workspace.',
  'Select a rewrite engine and transformation strength.',
  'Run the humanizer route through the Next.js API.',
  'Review the generated output and detector score cards.',
  'Move to the detector page for a full analysis table when needed.',
];

export default function HowItWorksPage() {
  return (
    <main className="pb-12 pt-8 md:pt-12">
      <div className="app-frame space-y-6">
        <section className="panel hero-panel p-6 md:p-8 lg:p-10">
          <div className="eyebrow">How it works</div>
          <h1 className="hero-title">A direct workflow from draft to scored output.</h1>
          <p className="hero-copy">Humara uses dedicated API routes for rewrite, health, and detector analysis inside the app router.</p>
        </section>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {steps.map((step, index) => (
            <article key={step} className="metric-card">
              <p className="metric-label">Step {index + 1}</p>
              <p className="mt-2 text-sm leading-7 text-[hsl(var(--foreground))]">{step}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
