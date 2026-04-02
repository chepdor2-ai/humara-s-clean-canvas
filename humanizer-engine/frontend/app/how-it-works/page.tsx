import { MoveRight, Zap, ShieldCheck, Target, Layers, Workflow, Eye, BrainCircuit } from 'lucide-react';
import Link from 'next/link';

export default function HowItWorksPage() {
  const steps = [
    {
      id: "01",
      title: "Input AI Draft",
      desc: "Paste your raw AI-generated text. Our engine performs an initial diagnostic to identify 'AI signatures' like uniform sentence lengths and predictable word patterns."
    },
    {
      id: "02",
      title: "Deconstruction",
      desc: "Our model deconstructs your ideas into a semantic map. We extract the core logic, citations, and arguments without being tied to the original robotic phrasing."
    },
    {
      id: "03",
      title: "Neural Reconstruction",
      desc: "We rebuild your content using a 'Human Pattern' template. This introduces natural linguistic variance, rhythmic shifts, and complex word associations that mirror human thought."
    },
    {
      id: "04",
      title: "Detector Simulation",
      desc: "The output is passed through our internal 'Adversarial Detector Suite'. If it doesn't bypass Turnitin and GPTZero with a 95%+ human score, we loop back and refine."
    }
  ];

  return (
    <div className="bg-[#FFF8F0] min-h-screen selection:bg-[#D97757]/10">
      {/* Hero Section */}
      <section className="max-w-5xl mx-auto px-6 pt-48 pb-32">
        <div className="text-center">
           <span className="text-[11px] font-black uppercase tracking-[0.3em] text-[#D97757] mb-8 block">The Architecture</span>
           <h1 className="text-4xl md:text-7xl font-bold font-sora mb-12 text-[#5C4033] leading-[1.05]">
             The science of <br /> human pattern.
           </h1>
           <p className="text-xl md:text-2xl text-[#8A7263] leading-relaxed max-w-2xl mx-auto font-medium">
             Humara isn't a synonym-swapper. It's a neural reconstruction engine that mimics the biological chaos of human writing.
           </p>
        </div>
      </section>

      {/* Steps Section */}
      <section className="bg-white py-40 border-y border-[#EADDCF]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-1 bg-[#EADDCF] border border-[#EADDCF] shadow-2xl">
            {steps.map((step, i) => (
              <div key={i} className="bg-white p-10 flex flex-col justify-between min-h-[400px] hover:bg-[#FFF8F0] transition-colors group">
                <div>
                   <span className="text-4xl font-bold font-sora text-[#EADDCF] group-hover:text-[#D97757] transition-colors block mb-10">{step.id}</span>
                   <h3 className="text-2xl font-bold font-sora text-[#5C4033] mb-6">{step.title}</h3>
                   <p className="text-[#8A7263] text-sm leading-relaxed font-medium">{step.desc}</p>
                </div>
                <div className="pt-10">
                   <div className="w-10 h-px bg-[#5C4033] group-hover:w-full group-hover:bg-[#D97757] transition-all duration-700" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Engine Details */}
      <section className="py-40 px-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-32 items-center">
          <div className="space-y-12">
            <h2 className="text-3xl md:text-5xl font-bold font-sora text-[#5C4033] leading-tight">Beyond simple <br /> rewriting.</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-16">
               {[
                 { icon: BrainCircuit, title: "Neural Variance", desc: "Introduces human-like burstiness and perplexity signatures." },
                 { icon: ShieldCheck, title: "Detector Safe", desc: "Tested against GPTZero, Turnitin, and Originality.ai daily." },
                 { icon: Target, title: "Meaning Locking", desc: "Zero loss of technical accuracy or philosophical nuance." },
                 { icon: Workflow, title: "Multi-Model", desc: "Orchestrates across 4 specialized rewriting models." }
               ].map((feat, i) => (
                 <div key={i} className="space-y-4">
                   <feat.icon className="w-6 h-6 text-[#D97757]" />
                   <h4 className="text-[12px] font-black uppercase tracking-widest text-[#5C4033]">{feat.title}</h4>
                   <p className="text-[#8A7263] text-[13px] leading-relaxed font-medium">{feat.desc}</p>
                 </div>
               ))}
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-[#D97757]/5 rounded-full blur-[100px]" />
            <div className="relative bg-white border border-[#EADDCF] p-12 shadow-2xl">
               <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#8A7263] mb-12 border-b border-[#EADDCF] pb-6">Model Architecture</h4>
               <div className="space-y-8">
                 <div className="flex justify-between items-center p-5 bg-[#FFF8F0] border border-[#EADDCF]">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#5C4033]">Linguistic Analysis</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-green-600">Active</span>
                 </div>
                 <div className="flex justify-center"><MoveRight className="w-5 h-5 text-[#EADDCF] rotate-90" /></div>
                 <div className="flex justify-between items-center p-5 bg-[#5C4033] text-white">
                    <span className="text-[10px] font-black uppercase tracking-widest">Neural Rewrite</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#D97757]">Processing</span>
                 </div>
                 <div className="flex justify-center"><MoveRight className="w-5 h-5 text-[#EADDCF] rotate-90" /></div>
                 <div className="flex justify-between items-center p-5 bg-white border border-[#EADDCF]">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#8A7263]">Detector Verification</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#8A7263]/40">Standby</span>
                 </div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="w-full py-40 px-6 bg-[#5C4033] text-center">
         <h2 className="text-3xl md:text-5xl font-bold font-sora text-white mb-10 leading-tight">Experience the difference <br /> of neural humanization.</h2>
         <Link href="/signup" className="inline-block px-12 py-6 bg-[#D97757] text-white text-[14px] font-black uppercase tracking-[0.2em] hover:bg-[#C96342] transition-all shadow-2xl shadow-black/20">
            Start Free Trial
         </Link>
      </section>
    </div>
  );
}
