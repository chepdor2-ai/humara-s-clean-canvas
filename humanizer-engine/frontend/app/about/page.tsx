import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Humara',
  description: 'Learn about Humara and the product direction behind the AI humanizer and detector platform.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <main className="pb-12 pt-8 md:pt-12">
      <div className="app-frame space-y-6">
        <section className="panel hero-panel p-6 md:p-8 lg:p-10">
          <div className="eyebrow">About</div>
          <h1 className="hero-title">Humara is built for cleaner AI-assisted publishing.</h1>
          <p className="hero-copy">The brand direction combines humanization, detector awareness, and a calmer editorial system for serious content workflows.</p>
        </section>
        <section className="grid gap-4 md:grid-cols-2">
          <article className="panel p-6"><h2 className="text-2xl font-extrabold tracking-[-0.04em]">What we focus on</h2><p className="mt-3 hero-copy">Reliable rewrites, clearer scoring, modern routing, and a deployable Next.js experience.</p></article>
          <article className="panel p-6"><h2 className="text-2xl font-extrabold tracking-[-0.04em]">Why the redesign matters</h2><p className="mt-3 hero-copy">The new Humara system now aligns the visual identity, navigation, SEO, and app behavior around one coherent product.</p></article>
        </section>
      </div>
    </main>
  );
}
