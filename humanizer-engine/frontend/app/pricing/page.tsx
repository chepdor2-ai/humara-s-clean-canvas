import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Humara Pricing',
  description: 'Explore Humara pricing for AI humanizer and detector workflows.',
  alternates: { canonical: '/pricing' },
};

const tiers = [
  ['Starter', 'For solo writers validating copy before publishing.', '1 workspace, humanizer access, detector reports'],
  ['Growth', 'For content teams running repeatable editorial workflows.', 'team usage, richer monitoring, higher limits'],
  ['Enterprise', 'For larger publishing systems and custom delivery needs.', 'priority support, rollout help, tailored setup'],
];

export default function PricingPage() {
  return (
    <main className="pb-12 pt-8 md:pt-12">
      <div className="app-frame space-y-6">
        <section className="panel hero-panel p-6 md:p-8 lg:p-10">
          <div className="eyebrow">Pricing</div>
          <h1 className="hero-title">Pricing built for humanizer and detector workflows.</h1>
          <p className="hero-copy">Simple commercial structure for teams that need reliable rewrite and scoring operations.</p>
        </section>
        <section className="grid gap-4 md:grid-cols-3">
          {tiers.map(([name, desc, features]) => (
            <article key={name} className="metric-card h-full">
              <p className="metric-label">Plan</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.04em] text-[hsl(var(--foreground))]">{name}</h2>
              <p className="mt-3 text-sm leading-7 text-[hsl(var(--muted-foreground))]">{desc}</p>
              <p className="mt-4 text-sm font-semibold text-[hsl(var(--foreground))]">{features}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
