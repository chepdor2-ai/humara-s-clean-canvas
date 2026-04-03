import type { Metadata } from 'next';
import { Quote, Brain, Shield, Target, BookOpen } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About Humara',
  description: 'Learn how Humara uses advanced NLP to make AI-generated text indistinguishable from human writing. Our mission, values, and approach.',
  alternates: { canonical: 'https://humara.ai/about' },
};

export default function AboutPage() {
  return (
    <div className="flex flex-col items-center min-h-screen">
      <section className="w-full bg-brand-50 pt-32 pb-24">
        <div className="max-w-5xl mx-auto px-6 text-center mt-12">
          <span className="inline-block py-1 px-3 rounded-full bg-brand-100 text-brand-800 font-semibold uppercase text-xs mb-6 border border-brand-300">Philosophy</span>
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-8">
            About Humara
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto font-medium leading-relaxed">
            High-end AI text humanizer. We believe AI should be a tool for refining, not replacing human thought. Our mission is to bypass detection while preserving meaning.
          </p>
        </div>
      </section>

      <section className="w-full bg-white py-24 border-y border-brand-100">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 leading-tight">
              Service Usage
            </h2>
            <div className="space-y-6 text-gray-600 leading-relaxed text-lg font-medium">
              <p>
                We provide tools strictly designed to refine text structure and readability (burstiness, perplexity adjustment). Our advanced AI rewriting engine deconstructs machine-generated content and rebuilds it to sound authentically human.
              </p>
              <p>
                Unlike rudimentary synonym-spinners, Humara analyzes linguistic patterns, sentence rhythm, and vocabulary distribution to create undetectable prose that preserves semantic integrity.
              </p>
              <p>
                Ensure you follow institutional guidelines when using AI-modified text. Our tools are built for professionals and creators who need to bypass detection without sacrificing quality.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 bg-brand-100 border border-brand-100 rounded-xl overflow-hidden shadow-lg">
            {[
              { icon: Brain, title: "Linguistic", val: "Advanced" },
              { icon: Shield, title: "Detection", val: "Bypass" },
              { icon: Target, title: "Accuracy", val: "99.9%" },
              { icon: BookOpen, title: "Academic", val: "Safe" }
            ].map((item, i) => (
              <div key={i} className="bg-white p-8 flex flex-col justify-center items-center text-center">
                <item.icon className="w-8 h-8 text-brand-600 mb-4" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-2">{item.title}</h3>
                <p className="text-lg font-bold text-gray-900">{item.val}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full py-24 px-6 bg-brand-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4">Core Values</h2>
            <p className="text-lg text-gray-600">Built on integrity, precision, and respect for authentic expression.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: "Acceptable Content",
                desc: "Content submitted must not violate local or international rules. We do not store your queried text permanently unless required for continuous model improvement via opted-in mechanisms."
              },
              {
                title: "Semantic Preservation",
                desc: "We never sacrifice the core intent of your work. Our engine understands the logic of your arguments and rebuilds them without changing the underlying message."
              },
              {
                title: "Academic Integrity",
                desc: "Our tools are designed for professionals and researchers who need to maintain formal standards while leveraging the efficiency of modern AI drafting."
              }
            ].map((v, i) => (
              <div key={i} className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <div className="w-12 h-1 bg-brand-500" />
                <h3 className="text-xl font-bold text-gray-900">{v.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed font-medium">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full py-24 px-6 bg-gray-900 text-center">
        <div className="max-w-4xl mx-auto flex flex-col items-center">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-8">
            Start humanizing today
          </h2>
          <p className="text-gray-300 text-lg mb-10 leading-relaxed">
            Ready to humanize your AI-generated content? Try Humara free today with no credit card required.
          </p>
          <Link href="/app" className="inline-block bg-brand-600 hover:bg-brand-700 text-white px-8 py-4 text-lg font-semibold rounded-lg transition">
            Try the Humanizer Free &rarr;
          </Link>
        </div>
      </section>
    </div>
  );
}

