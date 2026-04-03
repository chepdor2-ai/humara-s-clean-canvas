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
    <div className="flex flex-col items-center">
      {/* Hero */}
      <section className="w-full pt-32 pb-20 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 py-1.5 px-3 rounded-full bg-brand-50 text-brand-700 text-xs font-medium mb-8 border border-brand-200">
            <Sparkles className="w-3.5 h-3.5" /> End-to-End Pipeline
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold text-slate-900 tracking-tight leading-[1.1] mb-6">
            How HumaraGPT works
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-slate-500 leading-relaxed">
            From the moment you paste your text to the final detection-proof output — here is exactly what happens at every step.
          </p>
        </div>
      </section>

      {/* ─── HUMANIZATION FLOW ─── */}
      <section className="w-full py-20 bg-slate-50 border-y border-slate-100">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 py-1.5 px-3 rounded-full bg-brand-50 text-brand-700 text-xs font-medium mb-6 border border-brand-200">
              <Wand2 className="w-3.5 h-3.5" /> Humanization
            </div>
            <h2 className="text-3xl font-semibold text-slate-900 mb-3">The humanization process</h2>
            <p className="text-slate-500 max-w-xl mx-auto">What happens when you click &ldquo;Humanize&rdquo; — step by step.</p>
          </div>

          <div className="space-y-6">
            {/* Step 1: User pastes text */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 md:p-8">
              <div className="flex items-start gap-5">
                <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6 text-brand-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-semibold text-brand-600 uppercase tracking-widest">Step 1</span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">You &rarr; Frontend</span>
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">You paste your AI-generated text</h3>
                  <p className="text-slate-500 leading-relaxed">You paste or type your text into the editor. You can choose an engine mode (Ghost Mini, Ghost Pro, or Ninja Stealth) depending on how aggressive the rewrite should be. The frontend sends your text, selected engine, and any style preferences to the backend API.</p>
                </div>
              </div>
            </div>

            {/* Step 2: Pre-detection scan */}
            <div className="flex justify-center">
              <div className="w-px h-8 bg-slate-200" />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6 md:p-8">
              <div className="flex items-start gap-5">
                <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
                  <Search className="w-6 h-6 text-red-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-semibold text-brand-600 uppercase tracking-widest">Step 2</span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Backend</span>
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">Pre-detection scan (input analysis)</h3>
                  <p className="text-slate-500 leading-relaxed mb-4">Before rewriting, the backend runs your original text through multiple AI detectors simultaneously. This establishes a &ldquo;before&rdquo; baseline score and identifies which sentences are most likely to be flagged as AI-written.</p>
                  <div className="bg-slate-50 rounded-lg border border-slate-100 p-4">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Detectors checked</p>
                    <div className="flex flex-wrap gap-2">
                      {['Turnitin', 'GPTZero', 'Originality.AI', 'Copyleaks', 'Winston AI', 'Sapling', 'Crossplag'].map(d => (
                        <span key={d} className="text-xs font-medium bg-white text-slate-600 px-3 py-1 rounded-md border border-slate-200">{d}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: Pattern Analysis */}
            <div className="flex justify-center">
              <div className="w-px h-8 bg-slate-200" />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6 md:p-8">
              <div className="flex items-start gap-5">
                <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
                  <BarChart3 className="w-6 h-6 text-amber-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-semibold text-brand-600 uppercase tracking-widest">Step 3</span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Backend &middot; NLP Engine</span>
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">Pattern analysis &amp; AI marker detection</h3>
                  <p className="text-slate-500 leading-relaxed mb-4">The engine scans for AI signatures — overused transitions (&ldquo;Furthermore&rdquo;, &ldquo;Moreover&rdquo;), uniform sentence lengths, predictable vocabulary, and passive voice clusters. It maps each sentence&rsquo;s AI probability score so it knows which parts need the heaviest rewriting.</p>
                  <div className="grid md:grid-cols-2 gap-3">
                    {[
                      'Detects repetitive transition phrases',
                      'Identifies uniform sentence length distributions',
                      'Flags predictable vocabulary patterns',
                      'Maps entity relationships and concept dependencies',
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-slate-600">
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
              <div className="w-px h-8 bg-slate-200" />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6 md:p-8">
              <div className="flex items-start gap-5">
                <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center shrink-0">
                  <Brain className="w-6 h-6 text-brand-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-semibold text-brand-600 uppercase tracking-widest">Step 4</span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Backend &middot; Rewrite Engine</span>
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">Structural rewrite with burstiness</h3>
                  <p className="text-slate-500 leading-relaxed mb-4">Each sentence is deconstructed and rebuilt. The engine introduces &ldquo;burstiness&rdquo; — the natural variation in sentence length and complexity that distinguishes human writing from AI output. It uses curated synonym dictionaries and context-aware phrase replacements while preserving technical terms and your core meaning.</p>
                  <div className="grid md:grid-cols-2 gap-3">
                    {[
                      'Varies sentence length (short punches to complex structures)',
                      'Replaces mechanical phrasing with idiomatic alternatives',
                      'Preserves technical terms and domain vocabulary',
                      'Context-aware synonym selection from curated dictionaries',
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-slate-600">
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
              <div className="w-px h-8 bg-slate-200" />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6 md:p-8">
              <div className="flex items-start gap-5">
                <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center shrink-0">
                  <Wand2 className="w-6 h-6 text-violet-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-semibold text-brand-600 uppercase tracking-widest">Step 5</span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Backend &middot; Post-processor</span>
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">Tone calibration &amp; style matching</h3>
                  <p className="text-slate-500 leading-relaxed">The rewritten text is fine-tuned to match your target style — academic, professional, or conversational. Perplexity adjustments create authentic human-like word distributions. A final polish pass ensures coherence, flow, and that the meaning similarity stays above 95%.</p>
                </div>
              </div>
            </div>

            {/* Step 6: Post-detection */}
            <div className="flex justify-center">
              <div className="w-px h-8 bg-slate-200" />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6 md:p-8">
              <div className="flex items-start gap-5">
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6 text-emerald-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-semibold text-brand-600 uppercase tracking-widest">Step 6</span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Backend &rarr; You</span>
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">Post-detection verification &amp; results</h3>
                  <p className="text-slate-500 leading-relaxed mb-4">The humanized text is scanned again through the same detectors to confirm it now scores as human-written. The API returns both the &ldquo;before&rdquo; and &ldquo;after&rdquo; detection scores so you can see exactly how much the score improved. The editor highlights per-sentence AI probability so you can fine-tune individual sentences if needed.</p>
                  <div className="bg-emerald-50 rounded-lg border border-emerald-100 p-4">
                    <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider mb-3">What you get back</p>
                    <div className="grid md:grid-cols-2 gap-2 text-sm text-emerald-700">
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
      <section className="w-full py-20 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 py-1.5 px-3 rounded-full bg-red-50 text-red-700 text-xs font-medium mb-6 border border-red-200">
              <Search className="w-3.5 h-3.5" /> AI Detection
            </div>
            <h2 className="text-3xl font-semibold text-slate-900 mb-3">The AI detection process</h2>
            <p className="text-slate-500 max-w-xl mx-auto">How the standalone AI Detector tool works when you want to check any text.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-slate-50 rounded-xl border border-slate-100 p-6">
              <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center mb-4">
                <Send className="w-5 h-5 text-brand-600" />
              </div>
              <p className="text-xs font-semibold text-brand-600 uppercase tracking-widest mb-2">Step 1</p>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Submit text</h3>
              <p className="text-sm text-slate-500 leading-relaxed">Paste any text into the AI Detector. The frontend sends it to the <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">/api/detect</code> endpoint.</p>
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-100 p-6">
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center mb-4">
                <RefreshCw className="w-5 h-5 text-amber-500" />
              </div>
              <p className="text-xs font-semibold text-brand-600 uppercase tracking-widest mb-2">Step 2</p>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Multi-detector scan</h3>
              <p className="text-sm text-slate-500 leading-relaxed">The backend runs your text through 7+ AI detectors in parallel — Turnitin, GPTZero, Originality.AI, Copyleaks, Winston AI, Sapling, and Crossplag. Each returns an independent AI vs. human probability score.</p>
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-100 p-6">
              <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-xs font-semibold text-brand-600 uppercase tracking-widest mb-2">Step 3</p>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Aggregated results</h3>
              <p className="text-sm text-slate-500 leading-relaxed">Results are aggregated into an overall AI score, overall human score, and a verdict (AI, Human, or Mixed). You see a breakdown per detector with individual scores, plus word count and sentence count stats.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full py-20 bg-slate-50 border-t border-slate-100">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-semibold text-slate-900 mb-4">Try it yourself</h2>
          <p className="text-slate-500 mb-8">Paste your text and see the full pipeline in action — humanization scores, detector results, and all.</p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-3">
            <Link href="/app" className="bg-brand-600 hover:bg-brand-700 text-white px-7 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              Try the Humanizer <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/detector" className="bg-white hover:bg-slate-50 text-slate-700 px-7 py-3 rounded-lg text-sm font-medium border border-slate-200 transition-colors">
              Try AI Detector
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
