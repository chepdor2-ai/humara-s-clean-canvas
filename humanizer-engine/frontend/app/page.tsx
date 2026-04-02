'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type HumanizeResponse = {
  humanized?: string;
  engine_used?: string;
  output_detector_results?: Record<string, number>;
  error?: string;
};

const detectorCards = [
  { key: 'gptzero', label: 'GPTZero' },
  { key: 'turnitin', label: 'Turnitin' },
  { key: 'originality', label: 'Originality' },
  { key: 'winston', label: 'Winston AI' },
  { key: 'copyleaks', label: 'Copyleaks' },
] as const;

const highlights = [
  'Production-ready Next.js routing',
  'TypeScript-first API flows',
  'Live detector scoring',
  'Brand-safe rewrite workspace',
];

const sections = [
  ['01 / Brand-first workspace', 'A cleaner editorial shell built around the new Humara identity and your uploaded pattern direction.'],
  ['02 / Humanizer engine', 'Run Ghost Mini, Ghost Pro, or Ninja from one focused rewrite interface.'],
  ['03 / Detector intelligence', 'Compare multiple detector-style scores instantly without leaving the page.'],
  ['04 / Faster decisions', 'Editorial teams can compare input, output, and detector impact side by side.'],
  ['05 / Deployment-ready', 'Routes, metadata, icons, and build output are aligned for reliable publishing.'],
  ['06 / SEO structure', 'The landing page now uses strong hierarchy, semantic sections, and page-level metadata.'],
  ['07 / Trust signals', 'Dedicated About, Pricing, Contact, Privacy, Terms, and How it Works pages are now covered.'],
  ['08 / Copy review', 'Word counts, character counts, and quick clipboard actions keep iteration fast.'],
  ['09 / API routing', 'The humanize, detect, and health endpoints are organized through the Next.js app router.'],
  ['10 / Responsive layout', 'The interface scales cleanly across desktop and mobile without dashboard clutter.'],
  ['11 / Clear navigation', 'Users can reach commercial, legal, and product pages from every screen.'],
  ['12 / Stronger branding', 'Custom web icon, favicon, and text-based Humara logo are generated from your reference.'],
  ['13 / Publish workflow', 'The app is set up for preview validation first and then a clean publish/update flow.'],
  ['14 / TypeScript focus', 'Core product flows remain in Next.js and TypeScript while legacy clutter is avoided.'],
  ['15 / Content teams', 'Humara speaks to agencies, publishers, and operators who need cleaner AI-assisted output.'],
];

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [engine, setEngine] = useState('ghost_pro');
  const [strength, setStrength] = useState('balanced');
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [scores, setScores] = useState<Record<string, number | string | null>>({
    gptzero: null,
    turnitin: null,
    originality: null,
    winston: null,
    copyleaks: null,
    overall: null,
    engine_used: '--',
  });

  const inputWords = useMemo(() => inputText.trim().split(/\s+/).filter(Boolean).length, [inputText]);
  const outputWords = useMemo(() => outputText.trim().split(/\s+/).filter(Boolean).length, [outputText]);

  const handleHumanize = async () => {
    if (!inputText.trim()) return setMessage('Please enter text to humanize.');
    if (inputWords < 10) return setMessage('Please enter at least 10 words.');

    setIsProcessing(true);
    setMessage('');

    try {
      const response = await fetch('/api/humanize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          engine,
          strength,
          preserve_sentences: true,
          strict_meaning: true,
          no_contractions: true,
          tone: 'neutral',
          enable_post_processing: true,
        }),
      });

      const data = (await response.json()) as HumanizeResponse;
      if (!response.ok || data.error) throw new Error(data.error || 'Humanization failed.');

      setOutputText(data.humanized || '');
      setScores({
        gptzero: data.output_detector_results?.gptzero ?? null,
        turnitin: data.output_detector_results?.turnitin ?? null,
        originality: data.output_detector_results?.originality ?? null,
        winston: data.output_detector_results?.winston ?? null,
        copyleaks: data.output_detector_results?.copyleaks ?? null,
        overall: data.output_detector_results?.overall ?? null,
        engine_used: data.engine_used ?? engine,
      });
      setMessage('Text humanized successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unexpected error.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="pb-12 pt-8 md:pt-12">
      <div className="app-frame space-y-6">
        <section className="panel hero-panel overflow-hidden p-6 md:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div className="space-y-5 max-w-3xl">
              <div className="eyebrow">Humara platform</div>
              <h1 className="hero-title">AI humanizer and detector workflows, rebuilt with the real Humara brand.</h1>
              <p className="hero-copy">
                Humara is a cleaner, SEO-ready Next.js platform for rewriting AI-assisted copy, measuring detector impact,
                and publishing through a more credible editorial workflow.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="#workspace" className="primary-button px-5 py-4">Start rewriting</Link>
                <Link href="/detector" className="subtle-button px-5 py-4">Open detector</Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {highlights.map((item) => (
                  <div key={item} className="metric-card">
                    <p className="metric-label">Included</p>
                    <p className="mt-2 text-base font-extrabold tracking-[-0.03em] text-[hsl(var(--foreground))]">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel p-4 md:p-5 bg-[hsl(var(--card))]">
              <div className="rounded-[1.4rem] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
                <div className="rounded-[1.25rem] bg-[hsl(var(--primary))] p-4">
                  <img src="/humara-mark.svg" alt="Humara brand mark" className="mx-auto h-28 w-28" loading="lazy" />
                </div>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between text-[0.72rem] font-extrabold uppercase tracking-[0.22em] text-[hsl(var(--muted-foreground))]">
                    <span>Brand direction</span>
                    <span>Humara</span>
                  </div>
                  <p className="text-sm leading-7 text-[hsl(var(--muted-foreground))]">
                    Built from your uploaded motif with a calmer editorial palette, bold navy framing, soft sea accents,
                    and a custom text logo for favicon, header, and share previews.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="metric-card"><p className="metric-label">Framework</p><p className="metric-value">Next.js</p></article>
          <article className="metric-card"><p className="metric-label">Language</p><p className="metric-value">TypeScript</p></article>
          <article className="metric-card"><p className="metric-label">API status</p><p className="metric-value">Ready</p></article>
        </section>

        <section id="workspace" className="panel p-5 md:p-6 space-y-5">
          <div className="max-w-2xl space-y-2">
            <div className="eyebrow">Humanizer workspace</div>
            <h2 className="text-3xl font-extrabold tracking-[-0.04em] text-[hsl(var(--foreground))]">Rewrite and score in one pass.</h2>
            <p className="hero-copy">Paste source text, choose an engine, and review the detector impact instantly.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="field-label">Engine</label>
              <select value={engine} onChange={(e) => setEngine(e.target.value)} className="field">
                <option value="ghost_mini">Ghost Mini</option>
                <option value="ghost_pro">Ghost Pro</option>
                <option value="ninja">Ninja</option>
              </select>
            </div>
            <div>
              <label className="field-label">Strength</label>
              <select value={strength} onChange={(e) => setStrength(e.target.value)} className="field">
                <option value="light">Light</option>
                <option value="balanced">Balanced</option>
                <option value="deep">Deep</option>
              </select>
            </div>
            <div>
              <label className="field-label">Status</label>
              <div className="status-chip">{isProcessing ? 'Processing…' : 'Ready'}</div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="field-label">Original text</label>
                <button onClick={() => { setInputText(''); setOutputText(''); setMessage(''); }} className="subtle-button px-3 py-2 text-[0.7rem]">Clear</button>
              </div>
              <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} rows={14} className="field min-h-[21rem] resize-y leading-7" placeholder="Paste AI-generated text here..." />
              <p className="text-xs font-semibold muted-copy">{inputWords} words • {inputText.length} characters</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="field-label">Humanized output</label>
                <button
                  onClick={async () => {
                    if (!outputText) return;
                    await navigator.clipboard.writeText(outputText);
                    setMessage('Output copied to clipboard.');
                  }}
                  className="subtle-button px-3 py-2 text-[0.7rem]"
                >
                  Copy
                </button>
              </div>
              <textarea value={outputText} readOnly rows={14} className="field min-h-[21rem] resize-y leading-7" placeholder="Humanized text will appear here..." />
              <p className="text-xs font-semibold muted-copy">{outputWords} words • {outputText.length} characters</p>
            </div>
          </div>

          <div className="space-y-3">
            <button onClick={handleHumanize} disabled={isProcessing} className="primary-button w-full px-5 py-4">
              {isProcessing ? 'Processing…' : 'Humanize text'}
            </button>
            {message ? <div className="message-box text-sm font-medium">{message}</div> : null}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {detectorCards.map((item) => (
            <article key={item.key} className="metric-card text-center">
              <p className="metric-label">{item.label}</p>
              <p className="metric-value">{typeof scores[item.key] === 'number' ? `${Math.round(scores[item.key] as number)}%` : '--'}</p>
            </article>
          ))}
          <article className="metric-card text-center md:col-span-2 xl:col-span-1">
            <p className="metric-label">Overall</p>
            <p className="metric-value">{typeof scores.overall === 'number' ? `${Math.round(scores.overall as number)}%` : '--'}</p>
            <p className="mt-2 text-xs font-semibold muted-copy">Engine: {String(scores.engine_used ?? '--')}</p>
          </article>
        </section>

        <section className="panel p-5 md:p-6">
          <div className="space-y-2 max-w-3xl">
            <div className="eyebrow">Comprehensive landing page</div>
            <h2 className="text-3xl font-extrabold tracking-[-0.04em] text-[hsl(var(--foreground))]">Fifteen focused sections for SEO, clarity, and conversion.</h2>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sections.map(([title, copy]) => (
              <article key={title} className="metric-card h-full">
                <p className="metric-label">Landing section</p>
                <h3 className="mt-2 text-lg font-extrabold tracking-[-0.03em] text-[hsl(var(--foreground))]">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-[hsl(var(--muted-foreground))]">{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="panel p-5 md:p-6"><div className="eyebrow">Use cases</div><h2 className="mt-3 text-2xl font-extrabold tracking-[-0.04em]">For agencies, teams, and operators</h2><p className="mt-3 hero-copy">Use Humara for draft cleanup, rewrite passes, editorial QA, and detector comparison before publishing.</p></article>
          <article className="panel p-5 md:p-6"><div className="eyebrow">Routing</div><h2 className="mt-3 text-2xl font-extrabold tracking-[-0.04em]">All key pages are now surfaced</h2><p className="mt-3 hero-copy">The site includes product, commercial, company, and legal pages so users never hit dead ends.</p></article>
          <article className="panel p-5 md:p-6"><div className="eyebrow">Deployment</div><h2 className="mt-3 text-2xl font-extrabold tracking-[-0.04em]">Prepared for publish/update</h2><p className="mt-3 hero-copy">The app builds successfully in production and the API routes answer correctly through Next.js.</p></article>
        </section>
      </div>
    </main>
  );
}
