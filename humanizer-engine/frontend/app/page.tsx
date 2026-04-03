import Link from 'next/link';
import { ArrowRight, CheckCircle2, ShieldCheck, Zap, Sparkles } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero */}
      <section className="w-full pt-20 pb-24 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 py-1.5 px-3 rounded-full bg-brand-50 text-brand-700 text-xs font-medium mb-8 border border-brand-200">
            <Sparkles className="w-3.5 h-3.5" /> V3 Engine — Now Available
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold text-slate-900 tracking-tight leading-[1.1] mb-6">
            Make AI-generated text<br />
            <span className="text-brand-600">undetectable</span>
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-slate-500 mb-10 leading-relaxed">
            Humara structurally rewrites your content to bypass Turnitin, Originality.AI, and GPTZero while preserving your original meaning.
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-3">
            <Link href="/app" className="bg-brand-600 hover:bg-brand-700 text-white px-7 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              Try the Editor <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/pricing" className="bg-white hover:bg-slate-50 text-slate-700 px-7 py-3 rounded-lg text-sm font-medium border border-slate-200 transition-colors">
              View Pricing
            </Link>
          </div>
        </div>

        {/* Before/After preview */}
        <div className="mt-16 mx-auto max-w-3xl px-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50">
              <div className="w-2.5 h-2.5 bg-slate-200 rounded-full"></div>
              <div className="w-2.5 h-2.5 bg-slate-200 rounded-full"></div>
              <div className="w-2.5 h-2.5 bg-slate-200 rounded-full"></div>
              <span className="text-xs text-slate-400 ml-2">Humara Editor</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="p-6">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Input</span>
                <p className="text-slate-400 text-sm mt-3 italic leading-relaxed">&ldquo;Artificial intelligence has fundamentally transformed numerous sectors across the global economy...&rdquo;</p>
                <div className="mt-5 flex items-center gap-1.5 text-red-500 text-sm font-medium">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                  98% AI Detected
                </div>
              </div>
              <div className="p-6 border-l border-slate-100 bg-slate-50/50">
                <span className="text-xs font-medium text-brand-600 uppercase tracking-wider">Output</span>
                <p className="text-slate-700 text-sm mt-3 leading-relaxed">&ldquo;These tools radically shift how we work. Instead of typing by hand, machines spot patterns we can&apos;t see, changing fields like healthcare and finance overnight.&rdquo;</p>
                <div className="mt-5 flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" /> 100% Human Score
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="py-8 bg-slate-50 border-y border-slate-100 w-full">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-4">Bypasses leading AI detectors</p>
          <div className="flex flex-wrap justify-center gap-8 text-slate-400">
            <span className="text-sm font-semibold">Turnitin</span>
            <span className="text-sm font-semibold">GPTZero</span>
            <span className="text-sm font-semibold">Originality.AI</span>
            <span className="text-sm font-semibold">Copyleaks</span>
            <span className="text-sm font-semibold">Winston AI</span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-white w-full">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-semibold text-slate-900 mb-3">How it works</h2>
            <p className="text-slate-500 max-w-xl mx-auto">Our contextual pipeline goes beyond synonym swapping — it structurally rewrites your text like a professional editor.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '1', title: 'Pattern Analysis', desc: 'We identify and remove common AI markers — predictable phrasing, uniform sentence lengths, and overused transitions.' },
              { step: '2', title: 'Structural Rewrite', desc: 'Sentences are restructured with natural burstiness — varying lengths and complexity that match genuine human writing.' },
              { step: '3', title: 'Tone Calibration', desc: 'The final output is adjusted to match your target voice — academic, professional, conversational, or direct.' },
            ].map((item) => (
              <div key={item.step} className="p-6 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-10 h-10 bg-brand-100 rounded-lg flex items-center justify-center mb-4">
                  <span className="text-sm font-bold text-brand-700">{item.step}</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-slate-50 border-y border-slate-100 w-full">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-semibold text-slate-900 mb-3">Built for reliability</h2>
            <p className="text-slate-500 max-w-xl mx-auto">Every feature is designed to give you confidence in the output.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: ShieldCheck, title: 'Built-in Detection Scanning', desc: 'Scan your text against Turnitin, Originality.AI, GPTZero, Copyleaks, and more — before and after humanizing.' },
              { icon: Zap, title: 'Multiple Engine Modes', desc: 'Choose Ghost Mini for speed, Ghost Pro for balance, or Ninja Stealth for maximum evasion on critical content.' },
              { icon: Sparkles, title: 'Meaning Preservation', desc: 'Our context analyzer maps entities and key concepts, ensuring technical accuracy is maintained throughout the rewrite.' },
              { icon: CheckCircle2, title: 'Granular Controls', desc: 'Adjust strength, tone, and style profiles to match your specific needs — from academic papers to SEO blog posts.' },
            ].map((f) => (
              <div key={f.title} className="flex gap-4 p-6 bg-white rounded-xl border border-slate-200">
                <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center shrink-0">
                  <f.icon className="w-5 h-5 text-brand-600" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-1">{f.title}</h4>
                  <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 bg-white w-full">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-semibold text-slate-900 mb-3">Simple pricing</h2>
          <p className="text-slate-500 mb-12 max-w-md mx-auto">Start free, upgrade when you need more.</p>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto text-left">
            {/* Free */}
            <div className="p-6 bg-white rounded-xl border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Starter</h3>
              <p className="text-sm text-slate-400 mb-4">Try the basics</p>
              <p className="text-3xl font-semibold text-slate-900 mb-6">$0<span className="text-sm text-slate-400 font-normal">/mo</span></p>
              <ul className="space-y-2.5 mb-6 text-sm text-slate-600">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> 2,000 words/month</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Ghost Mini engine</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Basic AI detection</li>
              </ul>
              <Link href="/signup" className="block w-full text-center text-sm text-slate-700 font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">Sign Up Free</Link>
            </div>
            {/* Pro */}
            <div className="p-6 bg-slate-900 rounded-xl border border-slate-800 relative">
              <span className="absolute -top-2.5 left-6 bg-brand-600 text-white text-[10px] font-semibold uppercase tracking-wider py-1 px-2.5 rounded-full">Popular</span>
              <h3 className="text-lg font-semibold text-white mb-1">Pro</h3>
              <p className="text-sm text-slate-400 mb-4">For content creators</p>
              <p className="text-3xl font-semibold text-white mb-6">$19<span className="text-sm text-slate-400 font-normal">/mo</span></p>
              <ul className="space-y-2.5 mb-6 text-sm text-slate-300">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" /> 100,000 words/month</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" /> Ghost Pro engine</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" /> Full detector suite</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" /> SEO tone formatting</li>
              </ul>
              <Link href="/signup" className="block w-full text-center text-sm text-white font-medium bg-brand-600 hover:bg-brand-700 rounded-lg py-2.5 transition-colors">Get Started</Link>
            </div>
            {/* Ninja */}
            <div className="p-6 bg-white rounded-xl border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Ninja</h3>
              <p className="text-sm text-slate-400 mb-4">Maximum precision</p>
              <p className="text-3xl font-semibold text-slate-900 mb-6">$49<span className="text-sm text-slate-400 font-normal">/mo</span></p>
              <ul className="space-y-2.5 mb-6 text-sm text-slate-600">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> 500,000 words/month</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Ninja LLM multi-pass</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> API access</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Early V4 access</li>
              </ul>
              <Link href="/signup" className="block w-full text-center text-sm text-slate-700 font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">Contact Us</Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-slate-50 border-t border-slate-100 w-full">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-semibold text-slate-900 mb-4">Ready to humanize your content?</h2>
          <p className="text-slate-500 mb-8">Join thousands of writers who trust Humara for natural, undetectable AI text.</p>
          <Link href="/app" className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-7 py-3 rounded-lg text-sm font-medium transition-colors">
            Start Writing <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

