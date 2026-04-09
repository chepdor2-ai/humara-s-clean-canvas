import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, ShieldCheck, Zap, Sparkles, Brain, FileText, Wand2, BarChart3, Globe, Lock, Users, AlertTriangle, Ban, BookOpen, HelpCircle, Briefcase, PenTool, MessageSquare, ChevronDown, ArrowUpRight, Monitor, Smartphone, Cpu, TrendingUp } from 'lucide-react';
import HeroAnimation from './HeroAnimation';
import FreeTrial from './FreeTrial';
import PricingSection from './PricingSection';
import IPhoneMockup from './IPhoneMockup';
import HeroVideo from './HeroVideo';

export const metadata: Metadata = {
  title: 'HumaraGPT — Best AI Text Humanizer 2026 | Bypass Turnitin & GPTZero',
  description: 'HumaraGPT is the #1 AI text humanizer trusted by 50,000+ professionals. Rewrite AI-generated content to bypass Turnitin, GPTZero, Originality.AI, Copyleaks & Winston AI with a 99.2% human score. Structural rewriting, not synonym spinning. For SEO professionals, content creators & enterprises.',
  keywords: 'AI humanizer, text humanizer, bypass AI detection, bypass Turnitin, bypass GPTZero, undetectable AI, AI content rewriter, humanize ChatGPT text, AI text converter, make AI content human',
  alternates: { canonical: 'https://humaragpt.com' },
};

export default function Home() {
  return (
    <div className="flex flex-col items-center container-snap">

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="w-full pt-20 sm:pt-28 pb-16 sm:pb-24 bg-[#05050A] relative overflow-hidden min-h-[90vh] flex items-center">
        {/* Video background */}
        <HeroVideo />

        {/* Decorative arcs */}
        <div className="arc-decor arc-decor--lg -top-40 -right-40 clip-bottom-left hidden md:block" />
        <div className="arc-decor arc-decor--sm bottom-20 -left-16 hidden md:block" />

        {/* Radial glow overlays */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(at_center,#9333ea15_0%,transparent_70%)]" />
          <div className="absolute -top-[40%] left-[10%] w-[70%] h-[120%] bg-gradient-to-br from-purple-600/[0.12] via-transparent to-transparent rotate-[-20deg] blur-3xl" />
          <div className="absolute -top-[20%] right-[5%] w-[40%] h-[80%] bg-gradient-to-bl from-purple-500/[0.08] via-transparent to-transparent rotate-[15deg] blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          {/* Status badge with green pulse dot */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2.5 py-2 px-5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-xs font-medium text-gray-300">V3 Engine — Now Available</span>
            </div>
          </div>

          {/* Two-column: Text + 3D iPhone */}
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left column — Hero text */}
            <div className="text-center lg:text-left">
              <h1 className="glow-text text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight leading-[1.08] mb-6">
                The Most Advanced<br />
                <span className="gradient-text">AI Humanizer</span>
              </h1>
              <p className="max-w-xl mx-auto lg:mx-0 text-base sm:text-lg text-gray-300 mb-4 leading-relaxed">
                Structurally rewrite AI-generated text to bypass every major detector — preserving your original meaning with a <strong className="text-white">99.2% average human score</strong>.
              </p>
              <p className="max-w-xl mx-auto lg:mx-0 text-sm text-gray-500 mb-8 leading-relaxed">
                Trusted by 50,000+ SEO professionals, marketers, and content creators. Bypass Turnitin, GPTZero, Originality.AI, Copyleaks, Winston AI and more — with deep structural rewriting, not synonym spinning.
              </p>

              {/* CTA buttons */}
              <div className="flex flex-col sm:flex-row justify-center lg:justify-start items-center gap-3 sm:gap-4 mb-10">
                <Link href="/app" className="shimmer-btn group relative flex items-center gap-2 w-full sm:w-auto justify-center">
                  <span className="shimmer-btn__spark" />
                  <span className="relative z-10 flex items-center gap-2">Try the Humanizer Free <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" /></span>
                </Link>
                <Link href="/how-it-works" className="bg-white/5 hover:bg-white/10 text-gray-300 px-8 py-3.5 rounded-2xl text-sm font-medium border border-white/10 transition-all hover:shadow-md backdrop-blur-sm w-full sm:w-auto text-center">
                  See How It Works
                </Link>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-6 sm:gap-8 max-w-md mx-auto lg:mx-0">
                {[
                  { val: '99.2%', label: 'Human Score' },
                  { val: '50K+', label: 'Documents Processed' },
                  { val: '7+', label: 'Detectors Bypassed' },
                ].map((s) => (
                  <div key={s.label} className="text-center lg:text-left">
                    <p className="text-2xl sm:text-3xl font-bold text-white">{s.val}</p>
                    <p className="text-[10px] sm:text-xs text-gray-500 font-medium mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right column — 3D iPhone Mockup */}
            <div className="flex justify-center lg:justify-end">
              <IPhoneMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ HERO ANIMATION (full-width below) ═══════════════ */}
      <section className="py-12 sm:py-16 bg-black border-y border-white/10 w-full">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8">
            <h2 className="text-lg sm:text-xl font-semibold text-white mb-2">Watch the humanization in action</h2>
            <p className="text-sm text-gray-400">Real-time AI detection scores — before and after processing</p>
          </div>
          <HeroAnimation />
        </div>
      </section>

      {/* ═══════════════ TRUST BAR ═══════════════ */}
      <section className="py-6 sm:py-8 bg-black border-y border-white/10 w-full">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Bypasses leading AI detectors</p>
          <div className="flex flex-wrap justify-center gap-4 sm:gap-10 text-gray-500">
            {['Turnitin', 'GPTZero', 'Originality.AI', 'Copyleaks', 'Winston AI'].map(name => (
              <span key={name} className="text-xs sm:text-sm font-semibold hover:text-gray-300 transition-colors cursor-default">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ FEATURES (2×2 grid with arrow icons) ═══════════════ */}
      <section className="py-20 sm:py-28 bg-[#05050A] w-full relative overflow-hidden">
        {/* Wave background */}
        <div className="absolute inset-0 pointer-events-none">
          <img src="/wave-bg-1.webp" alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.07]" />
        </div>
        <div className="arc-decor -bottom-24 -left-28 hidden md:block" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-14">
            <div className="max-w-lg">
              <div className="w-12 h-12 bg-brand-950/40 rounded-xl flex items-center justify-center mb-5">
                <Wand2 className="w-6 h-6 text-brand-400" />
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-tight mb-3">
                Built for Content Creators.<br />Powered by AI.
              </h2>
              <p className="text-sm sm:text-base text-gray-400 leading-relaxed">
                Everything you need to make AI-generated content pass as authentic human writing — from structural rewriting to multi-detector scanning.
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-5 sm:gap-6">
            {[
              { icon: ShieldCheck, title: 'Multi-Detector Scanning', desc: 'Run your text against 7+ AI detectors simultaneously — Turnitin, GPTZero, Originality.AI, and more — with before and after scoring.' },
              { icon: Sparkles, title: 'Structural Rewriting', desc: 'Our engine rebuilds sentence architecture with natural burstiness, varying lengths, and human-like cadence that defeats detection.' },
              { icon: Brain, title: 'Context Preservation', desc: 'Maps entities, arguments, and key concepts before rewriting. Technical accuracy and semantic meaning stay perfectly intact.' },
              { icon: Zap, title: 'Multiple Engine Modes', desc: 'Five distinct modes — Fast, Academic, Standard, Stealth, and Undetectable — each tuned for different use cases and detection levels.' },
            ].map((f) => (
              <div key={f.title} className="group ref-card p-7 sm:p-8 bg-[#0F0F17] rounded-3xl border border-white/10">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 bg-brand-950/40 rounded-xl flex items-center justify-center">
                    <f.icon className="w-5 h-5 text-brand-400" />
                  </div>
                  <div className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-brand-600 group-hover:border-brand-600 transition-colors">
                    <ArrowUpRight className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
                  </div>
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ FREE TRIAL + 3D MACBOOK ═══════════════ */}
      <section className="py-16 sm:py-24 bg-black border-y border-white/10 w-full">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Try it now — free</h2>
            <p className="text-sm sm:text-base text-gray-400 max-w-xl mx-auto">Paste up to 150 words and see the magic. 2 free attempts, no account needed.</p>
          </div>
          <FreeTrial />
        </div>
      </section>

      {/* ═══════════════ MACBOOK SHOWCASE ═══════════════ */}
      <section className="py-20 sm:py-28 bg-[#05050A] w-full relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[60%] bg-[radial-gradient(ellipse_at_center,#9333ea08_0%,transparent_70%)]" />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-purple-500/10 border border-purple-500/20 mb-5">
              <Monitor className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-xs font-medium text-purple-300">Desktop Experience</span>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3">Professional-grade humanization</h2>
            <p className="text-sm sm:text-base text-gray-400 max-w-2xl mx-auto">See the full desktop workflow — input on the left, humanized output on the right, with real-time detector scores.</p>
          </div>
          {/* Clean laptop image — no overlay animation */}
          <div className="relative max-w-3xl mx-auto group">
            <div className="relative">
              <img src="/laptop-showcase.png" alt="HumaraGPT Desktop" className="w-full h-auto relative z-10 drop-shadow-2xl rounded-lg" loading="eager" decoding="async" />
            </div>
            {/* Glow beneath laptop */}
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-[50%] h-12 bg-purple-500/12 blur-3xl rounded-full animate-[glowPulse_3s_ease-in-out_infinite]" />
          </div>
        </div>
      </section>

      {/* ═══════════════ SOCIAL PROOF / QUOTE + STATS ═══════════════ */}
      <section className="py-20 sm:py-28 bg-[#05050A] w-full relative overflow-hidden">
        <div className="arc-decor arc-decor--lg -top-32 -right-32 hidden md:block" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 relative z-10">
          {/* Quote */}
          <div className="text-center mb-16 sm:mb-20">
            <p className="text-xl sm:text-2xl md:text-3xl font-medium text-gray-200 leading-relaxed italic max-w-3xl mx-auto">
              &ldquo;HumaraGPT does not just paraphrase — it structurally reconstructs text so the output reads like it was always human-written.&rdquo;
            </p>
            <p className="mt-6 text-sm text-gray-500">— Built on deep linguistic analysis, not synonym swapping</p>
          </div>

          {/* 2×2 stat grid */}
          <div className="grid grid-cols-2 gap-6 sm:gap-8 max-w-lg mx-auto">
            {[
              { val: '2024', label: 'Engine Version Year' },
              { val: '5', label: 'Distinct Engine Modes' },
              { val: '99.2%', label: 'Average Human Score' },
              { val: '<3s', label: 'Processing Time' },
            ].map((stat) => (
              <div key={stat.label} className="text-center py-6 px-4 rounded-3xl bg-[#0F0F17] border border-white/10">
                <p className="text-3xl sm:text-4xl font-bold text-white mb-1">{stat.val}</p>
                <p className="text-xs text-gray-500 font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ MID-CTA ═══════════════ */}
      <section className="py-14 sm:py-20 bg-black border-y border-white/10 w-full">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Start humanizing your content today</h2>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-3">
            <Link href="/app" className="shimmer-btn group relative flex items-center gap-2 w-full sm:w-auto justify-center">
              <span className="shimmer-btn__spark" />
              <span className="relative z-10 flex items-center gap-2">Get Started <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" /></span>
            </Link>
            <Link href="/pricing" className="text-sm font-medium text-gray-400 hover:text-white transition-colors underline underline-offset-4">
              View all plans
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════ HOW IT WORKS (3-step) ═══════════════ */}
      <section className="py-20 sm:py-28 bg-[#05050A] w-full relative overflow-hidden">
        {/* Wave background */}
        <div className="absolute inset-0 pointer-events-none">
          <img src="/wave-bg-2.webp" alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.06]" />
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3">How it works</h2>
            <p className="text-sm sm:text-base text-gray-400 max-w-xl mx-auto">Our contextual pipeline goes beyond synonym swapping — three stages of deep rewriting.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-5 sm:gap-6">
            {[
              { step: '01', title: 'Pattern Analysis', desc: 'We identify and remove common AI markers — predictable phrasing, uniform sentence lengths, and overused transitions.' },
              { step: '02', title: 'Structural Rewrite', desc: 'Sentences are restructured with natural burstiness — varying lengths that match genuine human writing.' },
              { step: '03', title: 'Tone Calibration', desc: 'Output adjusted to match your target voice — academic, professional, conversational, or direct.' },
            ].map((item) => (
              <div key={item.step} className="ref-card p-7 sm:p-8 bg-[#0F0F17] rounded-3xl border border-white/10">
                <span className="text-3xl sm:text-4xl font-bold text-brand-900/60 mb-4 block">{item.step}</span>
                <h3 className="text-base sm:text-lg font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ USE CASES ═══════════════ */}
      <section className="py-20 sm:py-28 bg-black border-y border-white/10 w-full">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3">Who uses HumaraGPT</h2>
            <p className="text-sm sm:text-base text-gray-400 max-w-xl mx-auto">Trusted by professionals across content creation, marketing, and enterprise.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-5 sm:gap-6">
            {[
              { icon: PenTool, title: 'Content Creators', desc: 'Humanize AI-drafted posts and newsletters that engage audiences without triggering AI flags.' },
              { icon: Globe, title: 'SEO Professionals', desc: 'High-volume, human-sounding content that ranks and passes publisher AI filters.' },
              { icon: Briefcase, title: 'Enterprise Teams', desc: 'Compliant documentation, marketing copy, and communications meeting corporate AI policies.' },
            ].map((uc) => (
              <div key={uc.title} className="group ref-card p-7 sm:p-8 bg-[#0F0F17] rounded-3xl border border-white/10">
                <div className="w-10 h-10 bg-brand-950/40 rounded-xl flex items-center justify-center mb-5">
                  <uc.icon className="w-5 h-5 text-brand-400" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-white mb-2">{uc.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{uc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ DEVICE SHOWCASE (Both devices) ═══════════════ */}
      <section className="py-20 sm:py-28 bg-[#05050A] w-full relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/4 w-[50%] h-[40%] bg-[radial-gradient(ellipse_at_center,#9333ea06_0%,transparent_70%)]" />
          <div className="absolute bottom-0 right-1/4 w-[50%] h-[40%] bg-[radial-gradient(ellipse_at_center,#9333ea06_0%,transparent_70%)]" />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3">Works everywhere you write</h2>
            <p className="text-sm sm:text-base text-gray-400 max-w-2xl mx-auto">From mobile quick edits to full desktop workflows — HumaraGPT adapts to your screen and your use case.</p>
          </div>
          {/* Multi-device image with animated screen overlays */}
          <div className="relative max-w-3xl mx-auto">
            <div className="relative group">
              <img src="/devices-showcase.png" alt="HumaraGPT on all devices" className="w-full h-auto relative z-10 mx-auto drop-shadow-2xl rounded-lg" loading="lazy" decoding="async" />
              {/* Animated glow overlay on screens */}
              <div className="absolute inset-0 z-20 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/8 via-transparent to-purple-400/5 animate-[shimmer_4s_ease-in-out_infinite]" />
              </div>
            </div>
            {/* Glow beneath devices */}
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-[70%] h-12 bg-purple-500/8 blur-3xl rounded-full" />
            {/* Feature labels */}
            <div className="grid grid-cols-3 gap-4 mt-8 text-center">
              <div>
                <div className="inline-flex items-center gap-2 py-1.5 px-3 rounded-full bg-purple-500/10 border border-purple-500/20 mb-2">
                  <Monitor className="w-3 h-3 text-purple-400" />
                  <span className="text-[10px] sm:text-xs font-medium text-purple-300">Desktop</span>
                </div>
                <p className="text-xs text-gray-500">Full split-pane workflow</p>
              </div>
              <div>
                <div className="inline-flex items-center gap-2 py-1.5 px-3 rounded-full bg-purple-500/10 border border-purple-500/20 mb-2">
                  <Cpu className="w-3 h-3 text-purple-400" />
                  <span className="text-[10px] sm:text-xs font-medium text-purple-300">Tablet</span>
                </div>
                <p className="text-xs text-gray-500">Touch-optimized UI</p>
              </div>
              <div>
                <div className="inline-flex items-center gap-2 py-1.5 px-3 rounded-full bg-purple-500/10 border border-purple-500/20 mb-2">
                  <Smartphone className="w-3 h-3 text-purple-400" />
                  <span className="text-[10px] sm:text-xs font-medium text-purple-300">Mobile</span>
                </div>
                <p className="text-xs text-gray-500">Quick edits on the go</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ PRICING (4 cards with toggle) ═══════════════ */}
      <section className="py-20 sm:py-28 bg-[#05050A] w-full relative overflow-hidden">
        {/* Wave background */}
        <div className="absolute inset-0 pointer-events-none">
          <img src="/wave-bg-3.webp" alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.06]" />
        </div>
        <div className="arc-decor arc-decor--sm top-16 -right-16 hidden md:block" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3">Choose the plan that fits</h2>
            <p className="text-sm sm:text-base text-gray-400 max-w-md mx-auto">Daily word limits that reset every 24 hours. Upgrade or cancel anytime.</p>
          </div>
          <PricingSection />
        </div>
      </section>

      {/* ═══════════════ FAQ (clean divider accordion) ═══════════════ */}
      <section className="py-20 sm:py-28 bg-black border-y border-white/10 w-full">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3">Frequently Asked Questions</h2>
            <p className="text-sm sm:text-base text-gray-400">Everything you need to know about HumaraGPT</p>
          </div>
          <div className="divide-y divide-white/10">
            {[
              {
                q: 'What is HumaraGPT and how does it work?',
                a: 'HumaraGPT is the most advanced AI text humanization platform available. It uses a proprietary multi-stage pipeline — pattern analysis, structural rewriting, and tone calibration — to transform AI-generated content into text that is indistinguishable from human writing.',
              },
              {
                q: 'Which AI detectors does HumaraGPT bypass?',
                a: 'HumaraGPT consistently achieves 99%+ human scores on Turnitin, GPTZero, Originality.AI, Copyleaks, Winston AI, Sapling, and ZeroGPT. Our engine is continuously updated as detectors evolve.',
              },
              {
                q: 'Can I use HumaraGPT for academic work?',
                a: 'No. HumaraGPT strictly prohibits all academic use including essays, dissertations, theses, homework, coursework, research papers, and any graded academic work. Accounts violating this policy will be permanently terminated.',
              },
              {
                q: 'Does it preserve the meaning of my text?',
                a: 'Yes. Our context analyzer maps entities, arguments, causal relationships, and technical terminology before rewriting. The humanized output preserves factual accuracy and semantic meaning — only surface-level detection patterns are changed.',
              },
              {
                q: 'Is HumaraGPT a synonym spinner?',
                a: 'No. Unlike synonym spinners that swap individual words, HumaraGPT performs deep structural rewriting — rebuilding sentence architecture, varying complexity, and matching human writing rhythms.',
              },
              {
                q: 'Is my content stored or shared?',
                a: 'No. All text is processed in memory and discarded immediately after humanization. Your content is never stored, shared with third parties, or used for model training.',
              },
            ].map((faq, i) => (
              <details key={faq.q} className="group">
                <summary className="flex items-center justify-between py-5 sm:py-6 cursor-pointer">
                  <span className="text-sm sm:text-base font-medium text-white pr-4">{faq.q}</span>
                  <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <div className="pb-5 sm:pb-6 text-sm text-gray-400 leading-relaxed pr-8">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ ACADEMIC PROHIBITION ═══════════════ */}
      <section className="py-14 sm:py-20 bg-red-950/20 border-y border-red-900/30 w-full">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-start gap-5 sm:gap-6">
            <div className="w-12 h-12 bg-red-900/30 rounded-xl flex items-center justify-center shrink-0">
              <Ban className="w-6 h-6 text-red-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-3">Academic Use Is Strictly Prohibited</h2>
              <p className="text-sm text-gray-400 leading-relaxed mb-4">
                HumaraGPT is a professional content tool for legitimate commercial purposes only. <strong className="text-red-400">We prohibit use for any academic purpose.</strong>
              </p>
              <div className="grid grid-cols-2 gap-2.5 mb-5">
                {[
                  'Essays, dissertations & theses',
                  'Homework & coursework assignments',
                  'Research papers & journal submissions',
                  'Exam responses & take-home tests',
                  'Lab reports & academic projects',
                  'Any graded academic work',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-xs sm:text-sm text-red-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <Link href="/acceptable-use" className="inline-flex items-center gap-1.5 text-sm font-medium text-red-400 hover:underline">
                Read Acceptable Use Policy <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ SEO CONTENT BLOCK ═══════════════ */}
      <section className="py-20 sm:py-28 bg-[#05050A] w-full">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">What is AI text humanization?</h2>
            <p className="text-sm sm:text-base text-gray-400 max-w-2xl mx-auto">Understanding the technology behind undetectable AI content</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-8 sm:gap-12">
            <div className="space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-white mb-2">How AI Detection Works</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  AI detectors analyze text for statistical patterns — uniform sentence length, predictable transitions, low perplexity, and repetitive syntax. They flag content scoring above detection thresholds.
                </p>
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Why Simple Paraphrasing Fails</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Synonym replacement leaves the statistical fingerprint intact — uniform burstiness, consistent vocabulary, and formulaic structures that still trigger detectors.
                </p>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-white mb-2">How HumaraGPT Is Different</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Our multi-stage pipeline performs deep linguistic analysis, then structurally reconstructs text with natural burstiness, varying sentence lengths, and human-like cadence while preserving meaning.
                </p>
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Meaning Preservation</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  HumaraGPT maps entities, arguments, and key concepts before rewriting. Named entities, causal relationships, and terminology are preserved exactly for factual accuracy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ BEFORE & AFTER COMPARISON ═══════════════ */}
      <section className="py-20 sm:py-28 bg-black border-y border-white/10 w-full">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-purple-500/10 border border-purple-500/20 mb-5">
              <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-xs font-medium text-purple-300">Real Results</span>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3">See the difference</h2>
            <p className="text-sm sm:text-base text-gray-400 max-w-2xl mx-auto">Side-by-side comparison of AI-generated text vs. HumaraGPT output — same meaning, completely different detection profile.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-5 sm:gap-6 mb-10">
            {/* Before */}
            <div className="p-6 sm:p-8 bg-[#0F0F17] rounded-3xl border border-red-500/20 relative">
              <div className="absolute -top-3 left-6">
                <span className="px-3 py-1 text-xs font-semibold bg-red-500/20 text-red-400 rounded-full">AI-Generated</span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed mt-2">
                Artificial intelligence has significantly transformed the landscape of modern healthcare. The integration of machine learning algorithms into diagnostic processes has enabled healthcare professionals to identify diseases with unprecedented accuracy. Furthermore, the implementation of natural language processing in electronic health records has streamlined documentation workflows, thereby reducing administrative burden on medical practitioners.
              </p>
              <div className="flex items-center gap-3 mt-6 pt-4 border-t border-red-500/10">
                <div className="flex-1 h-2 bg-red-500/20 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: '96%' }} />
                </div>
                <span className="text-xs font-bold text-red-400">96% AI</span>
              </div>
            </div>
            {/* After */}
            <div className="p-6 sm:p-8 bg-[#0F0F17] rounded-3xl border border-emerald-500/20 relative">
              <div className="absolute -top-3 left-6">
                <span className="px-3 py-1 text-xs font-semibold bg-emerald-500/20 text-emerald-400 rounded-full">HumaraGPT Output</span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed mt-2">
                AI has genuinely changed how healthcare operates — not in some abstract, futuristic way, but right now. Machine learning models are helping doctors catch diseases they might have missed, with accuracy rates that keep climbing. And on the admin side? NLP tools embedded in electronic health records have taken a real chunk of the paperwork off clinicians&apos; plates, which honestly was long overdue.
              </p>
              <div className="flex items-center gap-3 mt-6 pt-4 border-t border-emerald-500/10">
                <div className="flex-1 h-2 bg-emerald-500/20 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: '3%' }} />
                </div>
                <span className="text-xs font-bold text-emerald-400">3% AI</span>
              </div>
            </div>
          </div>

          {/* Detector score cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {[
              { name: 'GPTZero', before: '94%', after: '2%' },
              { name: 'Turnitin', before: '98%', after: '1%' },
              { name: 'Originality.AI', before: '91%', after: '5%' },
              { name: 'Copyleaks', before: '96%', after: '3%' },
            ].map((d) => (
              <div key={d.name} className="ref-card p-4 bg-[#0F0F17] rounded-2xl border border-white/10 text-center">
                <p className="text-xs font-medium text-gray-500 mb-2">{d.name}</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-sm font-bold text-red-500 line-through">{d.before}</span>
                  <ArrowRight className="w-3 h-3 text-gray-600" />
                  <span className="text-sm font-bold text-emerald-500">{d.after}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ LEGITIMATE USES ═══════════════ */}
      <section className="py-20 sm:py-28 bg-black border-y border-white/10 w-full">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Legitimate uses for AI humanization</h2>
            <p className="text-sm sm:text-base text-gray-400 max-w-2xl mx-auto">Built for professionals who need human-quality AI content.</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {[
              { icon: Globe, title: 'SEO & Blog Content', desc: 'Humanize AI drafts to pass content standards and publisher AI filters.' },
              { icon: MessageSquare, title: 'Email Marketing', desc: 'Humanize campaigns to avoid spam filter AI-detection triggers.' },
              { icon: Briefcase, title: 'Corporate Comms', desc: 'Draft memos and reports with AI, then humanize to meet standards.' },
              { icon: PenTool, title: 'Creative Writing', desc: 'AI-brainstorm fiction and scripts, then humanize for authentic voice.' },
              { icon: BarChart3, title: 'Marketing Copy', desc: 'Generate ad copy with AI, then humanize to avoid platform penalties.' },
              { icon: FileText, title: 'Tech Documentation', desc: 'Speed up docs with AI, then humanize for natural readability.' },
            ].map((uc) => (
              <div key={uc.title} className="ref-card p-5 sm:p-6 bg-[#0F0F17] rounded-3xl border border-white/10">
                <uc.icon className="w-5 h-5 text-brand-400 mb-3" />
                <h4 className="text-sm sm:text-base font-semibold text-white mb-1">{uc.title}</h4>
                <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">{uc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ WORKFLOW PIPELINE VISUAL ═══════════════ */}
      <section className="py-20 sm:py-28 bg-[#05050A] w-full relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[50%] bg-[radial-gradient(ellipse_at_center,#9333ea05_0%,transparent_65%)]" />
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3">Your content, perfected in 3 seconds</h2>
            <p className="text-sm sm:text-base text-gray-400 max-w-xl mx-auto">Every piece of text flows through our multi-stage pipeline before delivery.</p>
          </div>

          {/* Pipeline visual */}
          <div className="relative">
            {/* Connector line */}
            <div className="hidden sm:block absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent -translate-y-1/2 z-0" />
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 sm:gap-3 relative z-10">
              {[
                { icon: FileText, label: 'Input', desc: 'Paste AI text', color: 'text-gray-400' },
                { icon: Brain, label: 'Analyze', desc: 'Context mapping', color: 'text-purple-400' },
                { icon: Cpu, label: 'Rewrite', desc: 'Structural rebuild', color: 'text-purple-300' },
                { icon: ShieldCheck, label: 'Verify', desc: 'Multi-detector scan', color: 'text-purple-200' },
                { icon: CheckCircle2, label: 'Output', desc: '99.2% human', color: 'text-emerald-400' },
              ].map((step, i) => (
                <div key={step.label} className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#0F0F17] border border-white/10 flex items-center justify-center mb-3 shadow-sm">
                    <step.icon className={`w-6 h-6 ${step.color}`} />
                  </div>
                  <p className="text-sm font-semibold text-white">{step.label}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Performance metrics bar */}
          <div className="mt-14 p-6 sm:p-8 bg-[#0F0F17] rounded-3xl border border-white/10">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
              {[
                { val: '<3s', label: 'Average Processing', icon: Zap },
                { val: '99.2%', label: 'Human Score', icon: ShieldCheck },
                { val: '100%', label: 'Meaning Preserved', icon: Brain },
                { val: '7+', label: 'Detectors Bypassed', icon: TrendingUp },
              ].map((m) => (
                <div key={m.label}>
                  <m.icon className="w-5 h-5 text-purple-400 mx-auto mb-2" />
                  <p className="text-xl sm:text-2xl font-bold text-white">{m.val}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500 font-medium mt-1">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ FINAL CTA ═══════════════ */}
      <section className="py-24 sm:py-32 bg-gradient-to-b from-[#05050A] via-[#05050A] to-purple-950/20 w-full relative overflow-hidden">
        <div className="arc-decor arc-decor--lg -bottom-40 left-1/2 -translate-x-1/2 hidden md:block" />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-[50%] bg-gradient-to-b from-brand-500/[0.08] to-transparent rounded-full blur-3xl" />
        </div>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">Ready to humanize your content?</h2>
          <p className="text-sm sm:text-base text-gray-400 mb-3">Join thousands of professionals who trust HumaraGPT.</p>
          <p className="text-xs text-gray-500 mb-10">For commercial and professional use only. <Link href="/acceptable-use" className="text-brand-400 hover:underline">See acceptable use policy</Link></p>
          <Link href="/app" className="shimmer-btn group relative inline-flex items-center gap-2">
            <span className="shimmer-btn__spark" />
            <span className="relative z-10 flex items-center gap-2">Start Writing <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" /></span>
          </Link>
        </div>
      </section>
    </div>
  );
}

