import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, ShieldCheck, Zap, Sparkles, Brain, FileText, Wand2, BarChart3, Globe, Lock, Users } from 'lucide-react';
import HeroAnimation from './HeroAnimation';
import FreeTrial from './FreeTrial';

export const metadata: Metadata = {
  title: 'HumaraGPT — #1 AI Humanizer | Make AI Text Undetectable',
  description: 'HumaraGPT rewrites AI-generated text to bypass Turnitin, GPTZero, Originality.AI and Copyleaks. Get 100% human scores while preserving meaning.',
  alternates: { canonical: 'https://humaragpt.com' },
};

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
            HumaraGPT structurally rewrites your content to bypass Turnitin, Originality.AI, and GPTZero while preserving your original meaning.
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-3">
            <Link href="/app" className="bg-brand-600 hover:bg-brand-700 text-white px-7 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              Try the Humanizer <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/pricing" className="bg-white hover:bg-slate-50 text-slate-700 px-7 py-3 rounded-lg text-sm font-medium border border-slate-200 transition-colors">
              View Pricing
            </Link>
          </div>
        </div>

        {/* Animated Hero Demo */}
        <div className="mt-16 mx-auto max-w-4xl px-6">
          <HeroAnimation />
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

      {/* Free Trial Humanizer */}
      <section className="py-20 bg-white w-full">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-semibold text-slate-900 mb-3">Try it now — free</h2>
            <p className="text-slate-500 max-w-xl mx-auto">Paste up to 250 words and see the magic. 2 free attempts, no account needed.</p>
          </div>
          <FreeTrial />
        </div>
      </section>

      {/* Services */}
      <section className="py-20 bg-white w-full">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-semibold text-slate-900 mb-3">Our services</h2>
            <p className="text-slate-500 max-w-xl mx-auto">Everything you need to make AI-generated content pass as human-written.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Wand2, title: 'AI Text Humanization', desc: 'Structurally rewrite AI-generated text with burstiness, natural rhythm, and idiomatic phrasing that bypasses every major detector.' },
              { icon: ShieldCheck, title: 'Multi-Detector Scanning', desc: 'Run your text against 7+ AI detectors simultaneously — Turnitin, GPTZero, Originality.AI, Copyleaks, Winston AI, and more.' },
              { icon: BarChart3, title: 'Before & After Analysis', desc: 'See AI vs. human scores side by side before and after humanization with per-detector breakdowns and meaning preservation metrics.' },
            ].map((svc) => (
              <div key={svc.title} className="p-6 bg-slate-50 rounded-xl border border-slate-100 hover:border-brand-200 hover:shadow-md transition-all">
                <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center mb-4">
                  <svc.icon className="w-5 h-5 text-brand-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{svc.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{svc.desc}</p>
              </div>
            ))}
          </div>

          {/* Additional Service cards */}
          <div className="grid md:grid-cols-4 gap-6 mt-8">
            {[
              { icon: Brain, title: 'Context Preservation', desc: 'Maps entities, arguments, and key concepts so technical meaning stays intact during rewrites.' },
              { icon: FileText, title: 'Style Profiles', desc: 'Academic, professional, casual, or direct — match any writing style automatically.' },
              { icon: Globe, title: 'Synonym Engine', desc: 'Click any word in the output for context-aware synonym suggestions from curated dictionaries.' },
              { icon: Lock, title: 'Privacy First', desc: 'Text is processed in memory and discarded. We never store your content permanently.' },
            ].map((svc) => (
              <div key={svc.title} className="p-5 bg-white rounded-xl border border-slate-200 hover:border-brand-200 hover:shadow-sm transition-all">
                <svc.icon className="w-5 h-5 text-brand-600 mb-3" />
                <h4 className="text-sm font-semibold text-slate-900 mb-1">{svc.title}</h4>
                <p className="text-xs text-slate-500 leading-relaxed">{svc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-slate-50 border-y border-slate-100 w-full">
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
              <div key={item.step} className="p-6 bg-white rounded-xl border border-slate-200">
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

      {/* Engine Modes */}
      <section className="py-20 bg-white w-full">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-semibold text-slate-900 mb-3">Multiple engine modes</h2>
            <p className="text-slate-500 max-w-xl mx-auto">Choose the right balance of speed and stealth for your content.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { name: 'Ghost Mini', tag: 'Fast', desc: 'Quick rewrites for everyday content — emails, blog posts, casual writing.' },
              { name: 'Ghost Pro', tag: 'Balanced', desc: 'Deep structural rewriting with style preservation. Ideal for professional use.' },
              { name: 'Ninja Stealth', tag: 'Maximum', desc: 'Multi-pass LLM pipeline for critical academic submissions.' },
              { name: 'Undetectable', tag: 'Extreme', desc: 'Our most aggressive mode. Passes the strictest detectors consistently.' },
            ].map((eng) => (
              <div key={eng.name} className="p-5 bg-slate-50 rounded-xl border border-slate-100 hover:border-brand-200 transition-all">
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="text-sm font-semibold text-slate-900">{eng.name}</h4>
                  <span className="text-[10px] font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded">{eng.tag}</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{eng.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof / Stats */}
      <section className="py-16 bg-slate-50 border-y border-slate-100 w-full">
        <div className="max-w-4xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { val: '99.2%', label: 'Average Human Score' },
              { val: '7+', label: 'Detectors Bypassed' },
              { val: '50K+', label: 'Documents Processed' },
              { val: '<3s', label: 'Average Processing Time' },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl font-bold text-slate-900 mb-1">{stat.val}</p>
                <p className="text-xs text-slate-500 font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-white w-full">
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
              <div key={f.title} className="flex gap-4 p-6 bg-slate-50 rounded-xl border border-slate-100">
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

      {/* Use Cases */}
      <section className="py-20 bg-slate-50 border-y border-slate-100 w-full">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-semibold text-slate-900 mb-3">Who uses HumaraGPT</h2>
            <p className="text-slate-500 max-w-xl mx-auto">Trusted by professionals across education, content, and enterprise.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Users, title: 'Students & Researchers', desc: 'Refine AI-drafted papers to meet academic integrity standards while keeping arguments and citations intact.' },
              { icon: Globe, title: 'Content Creators & SEO', desc: 'Produce high-volume human-sounding content that ranks on search engines without triggering AI content filters.' },
              { icon: Lock, title: 'Enterprise & Legal', desc: 'Generate compliant documentation, reports, and communications that pass corporate AI content policies.' },
            ].map((uc) => (
              <div key={uc.title} className="p-6 bg-white rounded-xl border border-slate-200">
                <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center mb-4">
                  <uc.icon className="w-5 h-5 text-brand-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{uc.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{uc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 bg-white w-full">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-semibold text-slate-900 mb-3">Simple pricing</h2>
          <p className="text-slate-500 mb-12 max-w-md mx-auto">Daily word limits that reset every 24 hours. Plans from $5/mo.</p>
          <div className="grid md:grid-cols-4 gap-5 max-w-5xl mx-auto text-left">
            {/* Starter */}
            <div className="p-5 bg-white rounded-xl border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Starter</h3>
              <p className="text-sm text-slate-400 mb-4">Light usage</p>
              <p className="text-3xl font-semibold text-slate-900 mb-5">$5<span className="text-sm text-slate-400 font-normal">/mo</span></p>
              <ul className="space-y-2 mb-5 text-sm text-slate-600">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> 20K words/day (Fast)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> 10K words/day (Stealth)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Basic detection</li>
              </ul>
              <Link href="/signup" className="block w-full text-center text-sm text-slate-700 font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">Get Started</Link>
            </div>
            {/* Creator */}
            <div className="p-5 bg-slate-900 rounded-xl border border-slate-800 relative">
              <span className="absolute -top-2.5 left-5 bg-brand-600 text-white text-[10px] font-semibold uppercase tracking-wider py-1 px-2.5 rounded-full">Popular</span>
              <h3 className="text-lg font-semibold text-white mb-1">Creator</h3>
              <p className="text-sm text-slate-400 mb-4">For content creators</p>
              <p className="text-3xl font-semibold text-white mb-5">$10<span className="text-sm text-slate-400 font-normal">/mo</span></p>
              <ul className="space-y-2 mb-5 text-sm text-slate-300">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" /> 40K words/day (Fast)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" /> 20K words/day (Stealth)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" /> Full detector suite</li>
              </ul>
              <Link href="/signup" className="block w-full text-center text-sm text-white font-medium bg-brand-600 hover:bg-brand-700 rounded-lg py-2.5 transition-colors">Get Started</Link>
            </div>
            {/* Professional */}
            <div className="p-5 bg-white rounded-xl border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Professional</h3>
              <p className="text-sm text-slate-400 mb-4">Power users</p>
              <p className="text-3xl font-semibold text-slate-900 mb-5">$20<span className="text-sm text-slate-400 font-normal">/mo</span></p>
              <ul className="space-y-2 mb-5 text-sm text-slate-600">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> 80K words/day (Fast)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> 40K words/day (Stealth)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> API access</li>
              </ul>
              <Link href="/signup" className="block w-full text-center text-sm text-slate-700 font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">Get Started</Link>
            </div>
            {/* Business */}
            <div className="p-5 bg-white rounded-xl border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Business</h3>
              <p className="text-sm text-slate-400 mb-4">Teams & enterprise</p>
              <p className="text-3xl font-semibold text-slate-900 mb-5">$35<span className="text-sm text-slate-400 font-normal">/mo</span></p>
              <ul className="space-y-2 mb-5 text-sm text-slate-600">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> 150K words/day (Fast)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> 75K words/day (Stealth)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Dedicated manager</li>
              </ul>
              <Link href="/contact" className="block w-full text-center text-sm text-slate-700 font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">Contact Sales</Link>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-6">Save 15% with yearly billing. <Link href="/pricing" className="text-brand-600 hover:underline">View full pricing â†’</Link></p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-slate-50 border-t border-slate-100 w-full">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-semibold text-slate-900 mb-4">Ready to humanize your content?</h2>
          <p className="text-slate-500 mb-8">Join thousands of writers who trust HumaraGPT for natural, undetectable AI text.</p>
          <Link href="/app" className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-7 py-3 rounded-lg text-sm font-medium transition-colors">
            Start Writing <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

