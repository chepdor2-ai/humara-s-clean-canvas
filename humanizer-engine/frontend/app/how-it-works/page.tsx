import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, FileText, Brain, Wand2, ShieldCheck, BarChart3, Sparkles, Search, Send, RefreshCw, CheckCircle2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'How It Works — Humanization & AI Detection',
  description: 'See exactly how HumaraGPT humanizes AI-generated text and detects AI content — from the moment you paste your text to the final human-scored output.',
  alternates: { canonical: 'https://humaragpt.com/how-it-works' },
};

export default function HowItWorksPage() {
  return (
    <div className="flex flex-col items-center container-snap">
      {/* Hero */}
      <section className="w-full pt-20 sm:pt-32 pb-14 sm:pb-20 bg-white dark:bg-[#0a0a0b]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 py-1.5 px-3 rounded-full bg-brand-950/40 text-brand-400 text-xs font-medium mb-6 sm:mb-8 border border-brand-800 badge-float">
            <Sparkles className="w-3.5 h-3.5" /> End-to-End Pipeline
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-semibold text-slate-900 dark:text-white tracking-tight leading-[1.1] mb-4 sm:mb-6 animate-fade-in-up">
            How HumaraGPT works
          </h1>
          <p className="max-w-2xl mx-auto text-sm sm:text-lg text-slate-500 dark:text-zinc-400 leading-relaxed">
            From pasting your text to the final detection-proof output — every step explained.
          </p>
        </div>
      </section>

      {/* ─── HUMANIZATION FLOW ─── */}
      <section className="w-full py-14 sm:py-20 bg-slate-50 dark:bg-zinc-900 border-y border-slate-200 dark:border-zinc-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-16">
            <div className="inline-flex items-center gap-2 py-1.5 px-3 rounded-full bg-brand-950/40 text-brand-400 text-xs font-medium mb-4 sm:mb-6 border border-brand-800">
              <Wand2 className="w-3.5 h-3.5" /> Humanization
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white mb-2 sm:mb-3">The humanization process</h2>
            <p className="text-sm sm:text-base text-slate-500 dark:text-zinc-400 max-w-xl mx-auto">What happens when you click &ldquo;Humanize&rdquo; — step by step.</p>
          </div>

          <div className="space-y-6">
            {/* Step 1: User pastes text */}
            <div className="bg-white dark:bg-[#0a0a0b] rounded-xl border border-slate-200 dark:border-zinc-800 p-4 sm:p-6 card-tilt">
              <div className="flex items-start gap-3 sm:gap-5">
                <div className="w-9 h-9 sm:w-12 sm:h-12 bg-brand-950/40 rounded-xl flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 sm:w-6 sm:h-6 text-brand-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-semibold text-brand-600 uppercase tracking-widest">Step 1</span>
                    <span className="text-xs text-slate-500 dark:text-zinc-500 bg-slate-200 dark:bg-zinc-800 px-2 py-0.5 rounded">You &rarr; Frontend</span>
                  </div>
                  <h3 className="text-base sm:text-xl font-semibold text-slate-900 dark:text-white mb-1.5 sm:mb-2">You paste your AI-generated text</h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 leading-relaxed">You paste or type your text into the editor. You can choose an engine mode (Fast, Standard, or Stealth) depending on how aggressive the rewrite should be. The frontend sends your text, selected engine, and any style preferences to the backend API.</p>
                </div>
              </div>
            </div>

            {/* Step 2: Pre-detection scan */}
            <div className="flex justify-center">
              <div className="w-px h-8 bg-slate-200 dark:bg-zinc-700" />
            </div>
            <div className="bg-white dark:bg-[#0a0a0b] rounded-xl border border-slate-200 dark:border-zinc-800 p-4 sm:p-6 card-tilt">
              <div className="flex items-start gap-3 sm:gap-5">
                <div className="w-9 h-9 sm:w-12 sm:h-12 bg-red-950/30 rounded-xl flex items-center justify-center shrink-0">
                  <Search className="w-4 h-4 sm:w-6 sm:h-6 text-red-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-semibold text-brand-600 uppercase tracking-widest">Step 2</span>
                    <span className="text-xs text-slate-500 dark:text-zinc-500 bg-slate-200 dark:bg-zinc-800 px-2 py-0.5 rounded">Backend</span>
                  </div>
                  <h3 className="text-base sm:text-xl font-semibold text-slate-900 dark:text-white mb-1.5 sm:mb-2">Pre-detection scan (input analysis)</h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 leading-relaxed mb-3 sm:mb-4">Before rewriting, the backend runs your original text through multiple AI detectors simultaneously. This establishes a &ldquo;before&rdquo; baseline score and identifies which sentences are most likely to be flagged as AI-written.</p>
                  <div className="bg-slate-50 dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-800 p-3 sm:p-4">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Detectors checked</p>
                    <div className="flex flex-wrap gap-2">
                      {['Turnitin', 'GPTZero', 'Originality.AI', 'Copyleaks', 'Winston AI', 'Sapling', 'Crossplag'].map(d => (
                        <span key={d} className="text-xs font-medium bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 px-2 sm:px-3 py-1 rounded-md border border-slate-300 dark:border-zinc-700">{d}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: Pattern Analysis */}
            <div className="flex justify-center">
              <div className="w-px h-8 bg-slate-200 dark:bg-zinc-700" />
            </div>
            <div className="bg-white dark:bg-[#0a0a0b] rounded-xl border border-slate-200 dark:border-zinc-800 p-4 sm:p-6 card-tilt">
              <div className="flex items-start gap-3 sm:gap-5">
                <div className="w-9 h-9 sm:w-12 sm:h-12 bg-amber-950/30 rounded-xl flex items-center justify-center shrink-0">
                  <BarChart3 className="w-4 h-4 sm:w-6 sm:h-6 text-amber-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-semibold text-brand-600 uppercase tracking-widest">Step 3</span>
                    <span className="text-xs text-slate-500 dark:text-zinc-500 bg-slate-200 dark:bg-zinc-800 px-2 py-0.5 rounded">Backend &middot; NLP Engine</span>
                  </div>
                  <h3 className="text-base sm:text-xl font-semibold text-slate-900 dark:text-white mb-1.5 sm:mb-2">Pattern analysis &amp; AI marker detection</h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 leading-relaxed mb-3 sm:mb-4">The engine scans for AI signatures — overused transitions (&ldquo;Furthermore&rdquo;, &ldquo;Moreover&rdquo;), uniform sentence lengths, predictable vocabulary, and passive voice clusters. It maps each sentence&rsquo;s AI probability score so it knows which parts need the heaviest rewriting.</p>
                  <div className="grid sm:grid-cols-2 gap-2 sm:gap-3">
                    {[
                      'Detects repetitive transition phrases',
                      'Identifies uniform sentence length distributions',
                      'Flags predictable vocabulary patterns',
                      'Maps entity relationships and concept dependencies',
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
                        <div className="w-1.5 h-1.5 bg-amber-400 rounded-full mt-2 shrink-0" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 4: Structural Rewrite */}
            <div className="flex justify-center">
              <div className="w-px h-8 bg-slate-200 dark:bg-zinc-700" />
            </div>
            <div className="bg-white dark:bg-[#0a0a0b] rounded-xl border border-slate-200 dark:border-zinc-800 p-4 sm:p-6 card-tilt">
              <div className="flex items-start gap-3 sm:gap-5">
                <div className="w-9 h-9 sm:w-12 sm:h-12 bg-brand-950/40 rounded-xl flex items-center justify-center shrink-0">
                  <Brain className="w-4 h-4 sm:w-6 sm:h-6 text-brand-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-semibold text-brand-600 uppercase tracking-widest">Step 4</span>
                    <span className="text-xs text-slate-500 dark:text-zinc-500 bg-slate-200 dark:bg-zinc-800 px-2 py-0.5 rounded">Backend &middot; Rewrite Engine</span>
                  </div>
                  <h3 className="text-base sm:text-xl font-semibold text-slate-900 dark:text-white mb-1.5 sm:mb-2">Structural rewrite with burstiness</h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 leading-relaxed mb-3 sm:mb-4">Each sentence is deconstructed and rebuilt. The engine introduces &ldquo;burstiness&rdquo; — the natural variation in sentence length and complexity that distinguishes human writing from AI output. It uses curated synonym dictionaries and context-aware phrase replacements while preserving technical terms and your core meaning.</p>
                  <div className="grid sm:grid-cols-2 gap-2 sm:gap-3">
                    {[
                      'Varies sentence length (short punches to complex structures)',
                      'Replaces mechanical phrasing with idiomatic alternatives',
                      'Preserves technical terms and domain vocabulary',
                      'Context-aware synonym selection from curated dictionaries',
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
                        <div className="w-1.5 h-1.5 bg-brand-400 rounded-full mt-2 shrink-0" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 5: Tone Calibration */}
            <div className="flex justify-center">
              <div className="w-px h-8 bg-slate-200 dark:bg-zinc-700" />
            </div>
            <div className="bg-white dark:bg-[#0a0a0b] rounded-xl border border-slate-200 dark:border-zinc-800 p-4 sm:p-6 card-tilt">
              <div className="flex items-start gap-3 sm:gap-5">
                <div className="w-9 h-9 sm:w-12 sm:h-12 bg-violet-950/30 rounded-xl flex items-center justify-center shrink-0">
                  <Wand2 className="w-4 h-4 sm:w-6 sm:h-6 text-violet-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-semibold text-brand-600 uppercase tracking-widest">Step 5</span>
                    <span className="text-xs text-slate-500 dark:text-zinc-500 bg-slate-200 dark:bg-zinc-800 px-2 py-0.5 rounded">Backend &middot; Post-processor</span>
                  </div>
                  <h3 className="text-base sm:text-xl font-semibold text-slate-900 dark:text-white mb-1.5 sm:mb-2">Tone calibration &amp; style matching</h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 leading-relaxed">The rewritten text is fine-tuned to match your target style — academic, professional, or conversational. Perplexity adjustments create authentic human-like word distributions. A final polish pass ensures coherence, flow, and that the meaning similarity stays above 95%.</p>
                </div>
              </div>
            </div>

            {/* Step 6: Post-detection */}
            <div className="flex justify-center">
              <div className="w-px h-8 bg-slate-200 dark:bg-zinc-700" />
            </div>
            <div className="bg-white dark:bg-[#0a0a0b] rounded-xl border border-slate-200 dark:border-zinc-800 p-4 sm:p-6 card-tilt">
              <div className="flex items-start gap-3 sm:gap-5">
                <div className="w-9 h-9 sm:w-12 sm:h-12 bg-emerald-950/30 rounded-xl flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4 sm:w-6 sm:h-6 text-emerald-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-semibold text-brand-600 uppercase tracking-widest">Step 6</span>
                    <span className="text-xs text-slate-500 dark:text-zinc-500 bg-slate-200 dark:bg-zinc-800 px-2 py-0.5 rounded">Backend &rarr; You</span>
                  </div>
                  <h3 className="text-base sm:text-xl font-semibold text-slate-900 dark:text-white mb-1.5 sm:mb-2">Post-detection verification &amp; results</h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 leading-relaxed mb-3 sm:mb-4">The humanized text is scanned again through the same detectors to confirm it now scores as human-written. The API returns both the &ldquo;before&rdquo; and &ldquo;after&rdquo; detection scores so you can see exactly how much the score improved. The editor highlights per-sentence AI probability so you can fine-tune individual sentences if needed.</p>
                  <div className="bg-emerald-950/20 rounded-lg border border-emerald-800 p-4">
                    <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider mb-3">What you get back</p>
                    <div className="grid md:grid-cols-2 gap-2 text-sm text-emerald-400">
                      <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /> Humanized text</div>
                      <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /> Before &amp; after AI scores</div>
                      <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /> Per-detector breakdown</div>
                      <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /> Meaning similarity %</div>
                      <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /> Per-sentence AI heatmap</div>
                      <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /> Synonym alternatives</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── AI DETECTION FLOW ─── */}
      <section className="w-full py-14 sm:py-20 bg-white dark:bg-[#0a0a0b]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-16">
            <div className="inline-flex items-center gap-2 py-1.5 px-3 rounded-full bg-red-950/30 text-red-400 text-xs font-medium mb-4 sm:mb-6 border border-red-800">
              <Search className="w-3.5 h-3.5" /> AI Detection
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white mb-2 sm:mb-3">The AI detection process</h2>
            <p className="text-sm sm:text-base text-slate-500 dark:text-zinc-400 max-w-xl mx-auto">How the standalone AI Detector works when you check any text.</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 sm:gap-6">
            <div className="card-tilt bg-slate-50 dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4 sm:p-6">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-brand-950/40 rounded-lg flex items-center justify-center mb-3 sm:mb-4">
                <Send className="w-4 h-4 sm:w-5 sm:h-5 text-brand-400" />
              </div>
              <p className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-1.5 sm:mb-2">Step 1</p>
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-1.5 sm:mb-2">Submit text</h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 leading-relaxed">Paste any text into the AI Detector to check it against multiple detectors.</p>
            </div>

            <div className="card-tilt bg-slate-50 dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4 sm:p-6">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-amber-950/40 rounded-lg flex items-center justify-center mb-3 sm:mb-4">
                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
              </div>
              <p className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-1.5 sm:mb-2">Step 2</p>
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-1.5 sm:mb-2">Multi-detector scan</h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 leading-relaxed">7+ detectors run in parallel — Turnitin, GPTZero, Originality.AI, Copyleaks, and more.</p>
            </div>

            <div className="card-tilt bg-slate-50 dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4 sm:p-6">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-950/40 rounded-lg flex items-center justify-center mb-3 sm:mb-4">
                <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
              </div>
              <p className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-1.5 sm:mb-2">Step 3</p>
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-1.5 sm:mb-2">Aggregated results</h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 leading-relaxed">Overall AI/human scores, per-detector breakdown, and a clear verdict.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full py-14 sm:py-20 bg-slate-50 dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white mb-3 sm:mb-4">Try it yourself</h2>
          <p className="text-sm sm:text-base text-slate-500 dark:text-zinc-400 mb-6 sm:mb-8">Paste your text and see the full pipeline in action.</p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-3">
            <Link href="/app" className="bg-brand-600 hover:bg-brand-700 text-white px-7 py-3 rounded-full text-sm font-medium transition-all hover:shadow-lg hover:shadow-brand-600/25 flex items-center gap-2 w-full sm:w-auto justify-center">
              Try the Humanizer <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/detector" className="bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 px-7 py-3 rounded-full text-sm font-medium border border-slate-300 dark:border-zinc-700 transition-colors w-full sm:w-auto text-center">
              Try AI Detector
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
