import Link from 'next/link';
import { ArrowRight, CheckCircle2, ShieldCheck, Zap, Sparkles, Brain, Target, Rocket, Eye, Fingerprint, Cpu, Shield } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col items-center relative">
      {/* Hero Section */}
      <section className="w-full pt-32 md:pt-48 pb-32 px-6 lg:px-12 max-w-7xl mx-auto flex flex-col items-center text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-indigo-500/20 text-indigo-400 font-bold text-[10px] uppercase tracking-[0.2em] mb-8 glow animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <Sparkles className="w-3.5 h-3.5" /> World's Most Advanced Humanizer
        </div>

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold font-sora text-white leading-[1.05] tracking-tight max-w-6xl mb-8 animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-100">
          Transform AI Text Into
          <span className="block text-gradient mt-2">Undetectable Human Writing</span>
        </h1>

        <p className="text-lg md:text-xl text-gray-400 leading-relaxed max-w-3xl mb-12 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
          The most sophisticated AI humanization platform. Bypass all AI detectors with neural reconstruction technology that preserves meaning while eliminating detection patterns.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-6 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300">
          <Link href="/signup" className="group px-10 py-5 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:from-indigo-500 hover:to-teal-500 transition-all duration-300 flex items-center gap-3 shadow-2xl shadow-indigo-500/50 hover:shadow-indigo-500/70 hover:scale-105 active:scale-95 relative overflow-hidden">
            <span className="relative z-10">Start Free Trial</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform relative z-10" />
            <div className="absolute inset-0 bg-gradient-to-r from-teal-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </Link>
          <Link href="/detector" className="px-10 py-5 glass border border-white/10 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-white/10 transition-all hover:scale-105 active:scale-95 flex items-center gap-3">
            <Eye className="w-5 h-5" />
            Free AI Detector
          </Link>
        </div>

        <div className="flex items-center gap-10 mt-12 animate-in fade-in duration-1000 delay-500">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
            <CheckCircle2 className="w-4 h-4 text-teal-400" /> No Credit Card
          </div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
            <CheckCircle2 className="w-4 h-4 text-teal-400" /> 500 Words Free
          </div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
            <CheckCircle2 className="w-4 h-4 text-teal-400" /> Instant Results
          </div>
        </div>
      </section>

      {/* Hero Visual - Split View Demo */}
      <section className="w-full max-w-7xl px-6 mb-32 animate-in fade-in zoom-in-95 duration-1000 delay-400">
        <div className="relative glass-strong border border-white/10 p-3 rounded-2xl shadow-2xl shadow-indigo-500/10 glow">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Before */}
              <div className="space-y-4 bg-[#1E1E2E]/80 p-8 rounded-xl border border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">AI-Generated Input</span>
                  <span className="px-3 py-1.5 bg-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-wider border border-red-500/30 rounded-lg">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>
                      99% AI Detected
                    </span>
                  </span>
                </div>
                <div className="p-6 bg-black/30 rounded-lg min-h-[240px] border border-white/5 text-sm text-gray-400 leading-relaxed font-medium">
                  The rapid advancement of artificial intelligence has revolutionized multiple industries, creating unparalleled efficiencies and automating complex tasks. This technological evolution represents a paradigm shift in how modern society approaches productivity and innovation.
                </div>
                <div className="flex gap-2 pt-2">
                  <div className="flex-1 h-2 bg-red-500/30 rounded-full"></div>
                  <div className="flex-1 h-2 bg-red-500/30 rounded-full"></div>
                  <div className="flex-1 h-2 bg-red-500/20 rounded-full"></div>
                  <div className="flex-1 h-2 bg-gray-800 rounded-full"></div>
                </div>
              </div>

              {/* After */}
              <div className="space-y-4 bg-gradient-to-br from-indigo-600/10 to-teal-600/10 p-8 rounded-xl border border-indigo-500/20 glow-green relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500/20 to-teal-500/20 rounded-full blur-3xl"></div>
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <span className="text-xs font-bold uppercase tracking-wider text-white">Humanized Output</span>
                  <span className="px-3 py-1.5 bg-teal-500/20 text-teal-400 text-[10px] font-bold uppercase tracking-wider border border-teal-500/30 rounded-lg">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse"></span>
                      100% Human
                    </span>
                  </span>
                </div>
                <div className="p-6 glass rounded-lg min-h-[240px] border border-white/10 text-sm text-white leading-relaxed font-semibold relative z-10">
                  The quick growth of AI has fundamentally changed how many industries work today. It's brought in new ways to save time and handle complex jobs automatically, marking a major shift in our daily operations and how we think about getting things done.
                </div>
                <div className="flex gap-2 pt-2 relative z-10">
                  <div className="flex-1 h-2 bg-teal-500/50 rounded-full"></div>
                  <div className="flex-1 h-2 bg-teal-500/30 rounded-full"></div>
                  <div className="flex-1 h-2 bg-teal-500/20 rounded-full"></div>
                  <div className="flex-1 h-2 bg-teal-500/10 rounded-full"></div>
                </div>
              </div>
           </div>

           {/* Transformation Arrow */}
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 hidden lg:flex">
             <div className="w-16 h-16 rounded-full bg-gradient-to-r from-indigo-600 to-teal-500 flex items-center justify-center shadow-2xl glow">
               <ArrowRight className="w-8 h-8 text-white" />
             </div>
           </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="w-full py-24 px-6 border-y border-white/10 glass-strong">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 md:gap-8">
            {[
              { value: "100%", label: "Undetectable", sublabel: "Bypass Rate" },
              { value: "50K+", label: "Active Users", sublabel: "Worldwide" },
              { value: "<1s", label: "Processing", sublabel: "Average Time" },
              { value: "99.9%", label: "Meaning Preserved", sublabel: "Accuracy" }
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-gradient mb-2 font-sora">{stat.value}</div>
                <div className="text-sm font-bold text-white mb-1">{stat.label}</div>
                <div className="text-xs uppercase tracking-wider text-gray-500">{stat.sublabel}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400 mb-4 block">Advanced Technology</span>
            <h2 className="text-4xl md:text-5xl font-bold font-sora text-white leading-tight mb-6">
              Neural Reconstruction Engine
            </h2>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto">
              Not just a paraphraser. A complete AI text reconstruction system powered by advanced linguistic algorithms.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Brain,
                title: "Pattern Elimination",
                desc: "Destroys AI fingerprints by analyzing and eliminating predictable patterns that detectors look for.",
                color: "from-indigo-500 to-purple-500"
              },
              {
                icon: Target,
                title: "Meaning Preservation",
                desc: "Advanced semantic analysis ensures 99.9% meaning accuracy while completely transforming structure.",
                color: "from-purple-500 to-pink-500"
              },
              {
                icon: Zap,
                title: "Instant Processing",
                desc: "Lightning-fast neural processing delivers humanized text in under 1 second, no matter the length.",
                color: "from-pink-500 to-teal-500"
              },
              {
                icon: Fingerprint,
                title: "Style Adaptation",
                desc: "Automatically matches academic, professional, or casual tones while maintaining authenticity.",
                color: "from-teal-500 to-cyan-500"
              },
              {
                icon: Shield,
                title: "Multi-Detector Bypass",
                desc: "Tested against Turnitin, GPTZero, Originality.AI, Winston AI, and all major detection platforms.",
                color: "from-cyan-500 to-blue-500"
              },
              {
                icon: Cpu,
                title: "Precision Control",
                desc: "Adjust humanization strength from subtle to extreme with real-time detector score previews.",
                color: "from-blue-500 to-indigo-500"
              }
            ].map((feature, i) => (
              <div key={i} className="glass-strong border border-white/10 p-8 rounded-2xl hover:border-indigo-500/30 transition-all duration-300 group hover:scale-105">
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.color} p-3 mb-6 group-hover:scale-110 transition-transform shadow-lg`}>
                  <feature.icon className="w-full h-full text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3 font-sora">{feature.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Detectors Section */}
      <section className="w-full py-32 px-6 border-y border-white/10 glass">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-gray-500 mb-16">Bypasses All Major AI Detectors</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-12">
             {["Turnitin", "GPTZero", "Originality.AI", "Copyleaks", "Winston AI"].map((name) => (
               <div key={name} className="flex items-center justify-center">
                 <span className="text-2xl md:text-3xl font-black font-sora text-gray-600 hover:text-white transition-colors duration-300">{name}</span>
               </div>
             ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="w-full py-32 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-20">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400 mb-4 block">Simple Process</span>
            <h2 className="text-4xl md:text-5xl font-bold font-sora text-white leading-tight">
              Three Steps to Perfect Humanization
            </h2>
          </div>

          <div className="space-y-8">
            {[
              { step: "01", title: "Paste Your AI Text", desc: "Copy any AI-generated content into our advanced editor interface." },
              { step: "02", title: "Configure Settings", desc: "Choose your engine, strength level, and target tone for optimal results." },
              { step: "03", title: "Get Human Text", desc: "Receive undetectable, perfectly humanized content in under 1 second." }
            ].map((item, i) => (
              <div key={i} className="flex gap-8 items-start glass-strong border border-white/10 p-8 rounded-2xl hover:border-indigo-500/30 transition-all group">
                <div className="text-6xl font-bold text-gradient-gold opacity-30 group-hover:opacity-100 transition-opacity font-sora">{item.step}</div>
                <div className="flex-1 pt-2">
                  <h3 className="text-2xl font-bold text-white mb-3 font-sora">{item.title}</h3>
                  <p className="text-gray-400 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="w-full py-40 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/20 via-transparent to-teal-600/20 blur-3xl"></div>
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-5xl md:text-7xl font-bold font-sora text-white leading-tight mb-8">
            Ready to Beat Every
            <span className="block text-gradient mt-2">AI Detector?</span>
          </h2>
          <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
            Join thousands of students, researchers, and professionals using Humara to create authentic, undetectable content.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link href="/signup" className="px-12 py-6 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:from-indigo-500 hover:to-teal-500 transition-all shadow-2xl shadow-indigo-500/50 hover:scale-105 active:scale-95">
              Start Free Trial Now
            </Link>
            <Link href="/pricing" className="px-12 py-6 glass border border-white/10 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-white/10 transition-all hover:scale-105 active:scale-95">
              View Pricing Plans
            </Link>
          </div>
          <div className="flex items-center justify-center gap-8 mt-12 text-sm text-gray-500">
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-400" /> No commitment</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-400" /> Cancel anytime</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-400" /> 99.9% success rate</span>
          </div>
        </div>
      </section>
    </div>
  );
}
