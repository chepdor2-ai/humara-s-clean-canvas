import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Calendar, Clock, Tag } from 'lucide-react';
import { BLOG_POSTS } from './data';

export const metadata: Metadata = {
  title: 'Blog — AI Humanization Guides, Tips & Industry Insights',
  description: 'Expert guides on AI text humanization, bypassing AI detectors, SEO content strategy, and making AI-generated content undetectable. Updated weekly by the HumaraGPT team.',
  alternates: { canonical: 'https://humaragpt.com/blog' },
  keywords: [
    'AI humanizer blog', 'AI detection tips', 'bypass AI detection guide',
    'AI content strategy', 'SEO AI writing', 'GPTZero bypass tips',
    'AI text humanization guides', 'undetectable AI content tips',
  ],
  openGraph: {
    title: 'HumaraGPT Blog — AI Humanization Guides & Tips',
    description: 'Expert guides on AI text humanization, detection bypass, and content strategy.',
    url: 'https://humaragpt.com/blog',
    type: 'website',
  },
};

const CATEGORY_COLORS: Record<string, string> = {
  Guides: 'bg-blue-900/30 text-blue-300 border-blue-700',
  Comparisons: 'bg-purple-900/30 text-purple-300 border-purple-700',
  Technology: 'bg-emerald-900/30 text-emerald-300 border-emerald-700',
  SEO: 'bg-amber-900/30 text-amber-300 border-amber-700',
};

export default function BlogPage() {
  return (
    <div className="flex flex-col items-center min-h-screen">
      {/* Hero */}
      <section className="w-full bg-slate-50 dark:bg-zinc-900 pt-32 pb-24">
        <div className="max-w-5xl mx-auto px-6 text-center mt-12">
          <span className="inline-block py-1 px-3 rounded-full bg-brand-900/30 text-brand-300 font-semibold uppercase text-xs mb-6 border border-brand-700">
            Blog
          </span>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white mb-8">
            AI Humanization Insights
          </h1>
          <p className="text-xl text-slate-500 dark:text-zinc-400 max-w-3xl mx-auto font-medium leading-relaxed">
            Expert guides on making AI content undetectable, bypassing detectors, and building an effective AI-assisted content strategy.
          </p>
        </div>
      </section>

      {/* Posts Grid */}
      <section className="w-full bg-white dark:bg-zinc-950 py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {BLOG_POSTS.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-8 hover:border-purple-700/50 hover:bg-slate-50 dark:bg-zinc-900/80 transition-all duration-300 flex flex-col"
              >
                <div className="flex items-center gap-3 mb-5">
                  <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border ${CATEGORY_COLORS[post.category] || 'bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-slate-300 dark:border-zinc-700'}`}>
                    {post.category}
                  </span>
                </div>

                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3 group-hover:text-purple-300 transition-colors leading-tight">
                  {post.title}
                </h2>

                <p className="text-slate-500 dark:text-zinc-400 text-sm leading-relaxed mb-6 flex-1">
                  {post.description}
                </p>

                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-500">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(post.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {post.readTime}
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-purple-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full bg-slate-50 dark:bg-zinc-900 py-24 border-t border-slate-200 dark:border-zinc-800">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-6">
            Ready to Humanize Your Content?
          </h2>
          <p className="text-slate-500 dark:text-zinc-400 text-lg mb-8">
            Try HumaraGPT free — no credit card required. See your AI scores drop to human levels in seconds.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 rounded-2xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-purple-600/25"
          >
            Get Started Free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
