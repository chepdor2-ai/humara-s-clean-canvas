import Link from 'next/link';
import { ArrowRight, CheckCircle2, ShieldCheck, Zap, Sparkles, MoveRight, BookOpen, Fingerprint, MousePointer2, Settings2, Languages, HelpCircle } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero Section */}
      <section className="w-full pt-48 pb-32 px-6 lg:px-12 max-w-7xl mx-auto flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F5EBE1] border border-[#EADDCF] text-[#D97757] font-black text-[10px] uppercase tracking-[0.2em] mb-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <Sparkles className="w-3 h-3" /> The New Standard in Humanization
        </div>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold font-sora text-[#5C4033] leading-[1.1] tracking-tight max-w-5xl mb-10 animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-100">
          Write like a person. <br />
          Not like a machine.
        </h1>

        <p className="text-lg md:text-xl text-[#8A7263] leading-relaxed max-w-2xl mb-14 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
          Humara is the world's most sophisticated rewriting engine. Precision-tuned to preserve your academic voice while dismantling AI detection patterns.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-6 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300">
          <Link href="/signup" className="group px-10 py-5 bg-[#5C4033] text-white text-[13px] font-black uppercase tracking-[0.2em] hover:bg-[#D97757] transition-all flex items-center gap-3 shadow-2xl shadow-[#5C4033]/20 hover:translate-y-[-2px] active:scale-95">
            Get Started Free
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link href="/how-it-works" className="px-10 py-5 bg-white text-[#5C4033] border border-[#EADDCF] text-[13px] font-black uppercase tracking-[0.2em] hover:bg-[#F5EBE1] transition-all hover:translate-y-[-2px] active:scale-95">
            View Engine
          </Link>
        </div>

        <div className="flex items-center gap-10 mt-16 animate-in fade-in duration-1000 delay-500">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[#8A7263]/60">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#7A8F6A]" /> No Credit Card
          </div>
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[#8A7263]/60">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#7A8F6A]" /> 500 Word Trial
          </div>
        </div>
      </section>

      {/* Hero Visual */}
      <section className="w-full max-w-6xl px-6 mb-40 animate-in fade-in zoom-in-95 duration-1000 delay-400">
        <div className="relative bg-white border border-[#EADDCF] p-2 shadow-[0_40px_100px_-20px_rgba(92,64,51,0.15)]">
           <div className="border border-[#EADDCF] p-8 grid grid-cols-1 lg:grid-cols-11 gap-8">
              <div className="lg:col-span-5 space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8A7263]">Raw AI Input</span>
                  <span className="px-2 py-1 bg-red-50 text-red-600 text-[9px] font-black uppercase tracking-widest border border-red-100">99% Probable AI</span>
                </div>
                <div className="p-6 bg-[#FFF8F0] min-h-[200px] border border-[#EADDCF] text-sm text-[#5C4033]/60 leading-relaxed font-medium">
                  The rapid advancement of artificial intelligence has revolutionized multiple industries, creating unparalleled efficiencies and automating complex tasks. This technological evolution represents a paradigm shift in how modern society operates.
                </div>
              </div>

              <div className="lg:col-span-1 flex items-center justify-center">
                <div className="w-12 h-12 bg-[#5C4033] text-white flex items-center justify-center shadow-lg transform lg:rotate-0 rotate-90">
                  <ArrowRight className="w-6 h-6" />
                </div>
              </div>

              <div className="lg:col-span-5 space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#5C4033]">Humanized Output</span>
                  <span className="px-2 py-1 bg-green-50 text-green-600 text-[9px] font-black uppercase tracking-widest border border-green-100">100% Human</span>
                </div>
                <div className="p-6 bg-white min-h-[200px] border border-[#EADDCF] text-sm text-[#5C4033] leading-relaxed font-bold">
                  The quick growth of AI has fundamentally changed how many industries work today. It's brought in new ways to save time and handle complex jobs automatically, marking a major shift in our daily operations.
                </div>
              </div>
           </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="w-full bg-[#5C4033] py-32 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
          <div>
            <h2 className="text-3xl md:text-5xl font-bold font-sora text-white leading-tight mb-8">
              AI text is too predictable. <br />
              Detectors know it.
            </h2>
            <p className="text-lg text-white/70 leading-relaxed mb-12">
              Standard AI models follow strict patterns of "perplexity" and "burstiness". Modern detectors use these mathematical footprints to flag your work instantly.
            </p>
            <div className="space-y-6">
              {[
                "Repetitive sentence structures",
                "Overly formal transitions",
                "Uniform paragraph lengths",
                "Lack of emotional nuance"
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-4 text-white/90 font-bold uppercase tracking-widest text-[11px]">
                  <div className="w-5 h-px bg-[#D97757]" /> {item}
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="aspect-square bg-white/5 border border-white/10 p-8 flex flex-col justify-end">
              <span className="text-3xl font-bold text-[#D97757] mb-2 font-sora">0%</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Human Rhythm</span>
            </div>
            <div className="aspect-square bg-white/5 border border-white/10 p-8 flex flex-col justify-end">
              <span className="text-3xl font-bold text-[#D97757] mb-2 font-sora">High</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Pattern Certainty</span>
            </div>
            <div className="aspect-square bg-white/5 border border-white/10 p-8 flex flex-col justify-end">
              <span className="text-3xl font-bold text-[#D97757] mb-2 font-sora">99%</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Detection Risk</span>
            </div>
            <div className="aspect-square bg-[#D97757] p-8 flex flex-col justify-end">
              <span className="text-3xl font-bold text-white mb-2 font-sora">Fix</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/80">With Humara</span>
            </div>
          </div>
        </div>
      </section>

      {/* Solution/Engine Section */}
      <section className="w-full py-40 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-end gap-12 mb-24">
            <div className="max-w-2xl">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#D97757] mb-6 block">The Humara Engine</span>
              <h2 className="text-4xl md:text-5xl font-bold font-sora text-[#5C4033] leading-tight">
                Not a paraphraser. <br />
                A reconstruction engine.
              </h2>
            </div>
            <p className="text-[#8A7263] max-w-md leading-relaxed pb-2">
              We don't just swap words. Our engine deconstructs your ideas and rebuilds them using human linguistic architecture.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-1 px-1 bg-[#EADDCF] border border-[#EADDCF]">
            {[
              {
                icon: Fingerprint,
                title: "Pattern Destruction",
                desc: "We dismantle the mathematical signatures that AI detectors look for, introducing natural linguistic variance."
              },
              {
                icon: Languages,
                title: "Style Mapping",
                desc: "Our engine maps your intended tone—academic, professional, or creative—and preserves it across the entire rewrite."
              },
              {
                icon: Settings2,
                title: "Precision Control",
                desc: "Adjust variation levels from 1% to 10% to find the perfect balance between original meaning and stealth."
              }
            ].map((feature, i) => (
              <div key={i} className="bg-white p-12 hover:bg-[#FFF8F0] transition-colors group">
                <feature.icon className="w-8 h-8 text-[#5C4033] mb-8 group-hover:text-[#D97757] transition-colors" />
                <h3 className="text-xl font-bold text-[#5C4033] mb-4 font-sora">{feature.title}</h3>
                <p className="text-[#8A7263] text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="w-full py-32 px-6 border-y border-[#EADDCF] bg-white">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#8A7263]/40 mb-16">Bypasses Leading Detectors</h2>
          <div className="flex flex-wrap justify-center gap-x-20 gap-y-12 opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
             {["Turnitin", "GPTZero", "Originality.ai", "Copyleaks", "Winston"].map((name) => (
               <span key={name} className="text-2xl font-black font-sora tracking-tighter text-[#5C4033] italic uppercase">{name}</span>
             ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="w-full py-48 px-6 bg-[#FFF8F0] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#D97757]/5 rounded-full blur-[120px] -mr-48 -mt-48" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#7A8F6A]/5 rounded-full blur-[120px] -ml-48 -mb-48" />
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-4xl md:text-6xl font-bold font-sora text-[#5C4033] leading-tight mb-10">
            Ready to reclaim <br /> your voice?
          </h2>
          <p className="text-xl text-[#8A7263] mb-12 max-w-xl mx-auto">
            Join 50,000+ researchers, students, and professionals who trust Humara for precision rewriting.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link href="/signup" className="px-12 py-6 bg-[#5C4033] text-white text-[14px] font-black uppercase tracking-[0.2em] hover:bg-[#D97757] transition-all shadow-2xl shadow-[#5C4033]/20">
              Start Free Trial
            </Link>
            <Link href="/pricing" className="px-12 py-6 bg-white border border-[#EADDCF] text-[#5C4033] text-[14px] font-black uppercase tracking-[0.2em] hover:bg-[#F5EBE1] transition-all">
              View Pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
