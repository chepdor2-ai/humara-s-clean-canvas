import { Quote, Sparkles, Target, Users, BookOpen, Brain, Shield } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="bg-[#FFF8F0] min-h-screen">
      {/* Hero Section */}
      <section className="max-w-5xl mx-auto px-6 pt-48 pb-32">
        <div className="text-center">
           <span className="text-[11px] font-black uppercase tracking-[0.3em] text-[#D97757] mb-8 block">Our Philosophy</span>
           <h1 className="text-4xl md:text-7xl font-bold font-sora mb-12 text-[#5C4033] leading-[1.05]">
             Restoring the <br /> human element.
           </h1>
           <p className="text-xl md:text-2xl text-[#8A7263] leading-relaxed max-w-3xl mx-auto font-medium">
             We believe AI should be a tool for drafting, not a replacement for thinking. Our mission is to protect human expression in an increasingly automated world.
           </p>
        </div>
      </section>

      {/* Narrative Section */}
      <section className="bg-white py-32 border-y border-[#EADDCF]">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
          <div className="space-y-10">
            <h2 className="text-3xl md:text-5xl font-bold font-sora text-[#5C4033] leading-tight">Built by writers, <br /> for writers.</h2>
            <div className="space-y-6 text-[#8A7263] leading-relaxed text-lg">
              <p>
                We started Humara after witnessing the rise of overly-sensitive AI detectors. These tools were frequently flagging original work, forcing writers into frustrating cycles of defensive editing that killed their creative voice.
              </p>
              <p>
                Existing "humanizers" were nothing more than glorified synonym-spinners that produced unreadable garbage. We knew there was a better way—one rooted in deep linguistic analysis and semantic preservation.
              </p>
            </div>
            <div className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#5C4033] rounded-full flex items-center justify-center text-[#FFF8F0]">
                  <Quote className="w-6 h-6" />
                </div>
                <div>
                   <p className="text-[#5C4033] font-bold text-sm tracking-widest uppercase">The Founders</p>
                   <p className="text-[#8A7263] text-xs font-black uppercase tracking-[0.2em] mt-1">Humara Engineering Lab</p>
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1 bg-[#EADDCF] border border-[#EADDCF] shadow-2xl">
             {[
               { icon: Brain, title: "Linguistics", val: "Proprietary" },
               { icon: Shield, title: "Detection", val: "Anti-Pattern" },
               { icon: Target, title: "Accuracy", val: "99.9%" },
               { icon: BookOpen, title: "Academic", val: "Deep Logic" }
             ].map((item, i) => (
               <div key={i} className="bg-white p-12 aspect-square flex flex-col justify-center items-center text-center">
                  <item.icon className="w-8 h-8 text-[#D97757] mb-6" />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8A7263] mb-2">{item.title}</h3>
                  <p className="text-xl font-bold font-sora text-[#5C4033]">{item.val}</p>
               </div>
             ))}
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-40 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-32">
          <h2 className="text-3xl md:text-5xl font-bold font-sora text-[#5C4033]">Engineered Values</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
          {[
            {
              title: "Meaning Preservation",
              desc: "We never sacrifice the core intent of your work. Our engine understands the logic of your arguments and rebuilds them without changing the underlying message."
            },
            {
              title: "Linguistic Variance",
              desc: "Human writing is messy. It has natural shifts in rhythm, vocabulary choice, and complexity. We replicate this irregularity to bypass mathematical AI detection."
            },
            {
              title: "Academic Integrity",
              desc: "Our tools are designed for professionals and researchers who need to maintain formal standards while leveraging the efficiency of modern AI drafting."
            }
          ].map((v, i) => (
            <div key={i} className="space-y-6">
              <div className="w-8 h-px bg-[#D97757]" />
              <h3 className="text-xl font-bold font-sora text-[#5C4033]">{v.title}</h3>
              <p className="text-[#8A7263] text-sm leading-relaxed font-medium">{v.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
