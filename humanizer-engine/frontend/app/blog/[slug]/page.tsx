import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Calendar, Clock, Tag, ArrowRight } from 'lucide-react';
import { notFound } from 'next/navigation';
import { BLOG_POSTS, getPostBySlug, getAllSlugs } from '../data';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `https://humaragpt.com/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `https://humaragpt.com/blog/${post.slug}`,
      type: 'article',
      publishedTime: post.date,
      authors: ['HumaraGPT'],
      tags: post.keywords,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  };
}

function renderMarkdown(content: string) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let tableRows: string[][] = [];
  let inTable = false;

  while (i < lines.length) {
    const line = lines[i];

    // Table handling
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      // Skip separator rows (|---|---|)
      if (!cells.every((c) => /^[-:]+$/.test(c))) {
        tableRows.push(cells);
      }
      i++;
      continue;
    } else if (inTable) {
      inTable = false;
      const [header, ...body] = tableRows;
      elements.push(
        <div key={`table-${i}`} className="overflow-x-auto my-8">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {header.map((cell, ci) => (
                  <th key={ci} className="text-left px-4 py-3 font-semibold text-slate-900 dark:text-white bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 first:rounded-tl-lg last:rounded-tr-lg">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-4 py-3 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-800">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-xl font-bold text-slate-900 dark:text-white mt-10 mb-4">{line.slice(4)}</h3>);
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mt-14 mb-6">{line.slice(3)}</h2>);
      i++;
      continue;
    }

    // List items
    if (line.trim().startsWith('- ')) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        listItems.push(lines[i].trim().slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="space-y-2 my-6 ml-1">
          {listItems.map((item, li) => (
            <li key={li} className="flex gap-3 text-slate-600 dark:text-zinc-300 leading-relaxed">
              <span className="text-purple-400 mt-1.5 shrink-0">•</span>
              <span dangerouslySetInnerHTML={{ __html: inlineMarkdown(item) }} />
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line.trim())) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="space-y-2 my-6 ml-1 list-decimal list-inside">
          {listItems.map((item, li) => (
            <li key={li} className="text-slate-600 dark:text-zinc-300 leading-relaxed">
              <span dangerouslySetInnerHTML={{ __html: inlineMarkdown(item) }} />
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph
    elements.push(
      <p key={i} className="text-slate-600 dark:text-zinc-300 leading-relaxed my-5 text-lg" dangerouslySetInnerHTML={{ __html: inlineMarkdown(line) }} />
    );
    i++;
  }

  // Flush remaining table
  if (inTable && tableRows.length > 0) {
    const [header, ...body] = tableRows;
    elements.push(
      <div key="table-end" className="overflow-x-auto my-8">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {header.map((cell, ci) => (
                <th key={ci} className="text-left px-4 py-3 font-semibold text-slate-900 dark:text-white bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700">{cell}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-4 py-3 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-800">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return elements;
}

function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-900 dark:text-white font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-zinc-200">$1</em>');
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const postIndex = BLOG_POSTS.findIndex((p) => p.slug === slug);
  const prevPost = postIndex > 0 ? BLOG_POSTS[postIndex - 1] : null;
  const nextPost = postIndex < BLOG_POSTS.length - 1 ? BLOG_POSTS[postIndex + 1] : null;

  return (
    <div className="flex flex-col items-center min-h-screen">
      {/* Hero */}
      <section className="w-full bg-white dark:bg-zinc-900 pt-32 pb-16">
        <div className="max-w-4xl mx-auto px-6 mt-12">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-zinc-400 hover:text-purple-400 mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Blog
          </Link>

          <div className="flex items-center gap-3 mb-6">
            <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border bg-purple-900/30 text-purple-300 border-purple-700">
              {post.category}
            </span>
          </div>

          <h1 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-white mb-6 leading-tight">
            {post.title}
          </h1>

          <p className="text-xl text-slate-500 dark:text-zinc-400 max-w-3xl font-medium leading-relaxed mb-8">
            {post.description}
          </p>

          <div className="flex items-center gap-6 text-sm text-slate-500 dark:text-zinc-500">
            <span className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {new Date(post.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {post.readTime}
            </span>
          </div>
        </div>
      </section>

      {/* Content */}
      <article className="w-full bg-zinc-950 py-16">
        <div className="max-w-4xl mx-auto px-6">
          {renderMarkdown(post.content)}
        </div>
      </article>

      {/* Keywords / Tags */}
      <section className="w-full bg-zinc-950 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex flex-wrap gap-2 pt-8 border-t border-slate-200 dark:border-zinc-800">
            {post.keywords.map((kw) => (
              <span key={kw} className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-full border border-slate-200 dark:border-zinc-800">
                <Tag className="w-3 h-3" /> {kw}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Prev/Next Navigation */}
      <section className="w-full bg-zinc-950 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {prevPost && (
              <Link href={`/blog/${prevPost.slug}`} className="group bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 hover:border-purple-700/50 transition-all">
                <span className="text-xs text-slate-500 dark:text-zinc-500 mb-2 block">← Previous</span>
                <span className="text-slate-900 dark:text-white font-semibold group-hover:text-purple-300 transition-colors">{prevPost.title}</span>
              </Link>
            )}
            {nextPost && (
              <Link href={`/blog/${nextPost.slug}`} className="group bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 hover:border-purple-700/50 transition-all md:text-right md:col-start-2">
                <span className="text-xs text-slate-500 dark:text-zinc-500 mb-2 block">Next →</span>
                <span className="text-slate-900 dark:text-white font-semibold group-hover:text-purple-300 transition-colors">{nextPost.title}</span>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full bg-white dark:bg-zinc-900 py-24 border-t border-slate-200 dark:border-zinc-800">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-6">Try HumaraGPT Today</h2>
          <p className="text-slate-500 dark:text-zinc-400 text-lg mb-8">
            Transform your AI content into natural, undetectable human writing in seconds.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 rounded-2xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-purple-600/25"
          >
            Get Started Free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* JSON-LD Article Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.description,
            datePublished: post.date,
            dateModified: post.date,
            author: { '@type': 'Organization', name: 'HumaraGPT', url: 'https://humaragpt.com' },
            publisher: { '@type': 'Organization', name: 'HumaraGPT', logo: { '@type': 'ImageObject', url: 'https://humaragpt.com/og-logo.png' } },
            mainEntityOfPage: { '@type': 'WebPage', '@id': `https://humaragpt.com/blog/${post.slug}` },
            keywords: post.keywords.join(', '),
          }),
        }}
      />
    </div>
  );
}
