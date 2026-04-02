import { BookOpen, Briefcase, Zap, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function Onboarding() {
  const options = [
    { icon: <BookOpen className="w-8 h-8"/>, title: "Academic & Research", desc: "Preserve scholarly tone while bypassing university detectors." },
    { icon: <Briefcase className="w-8 h-8"/>, title: "Content & SEO", desc: "Maintain brand voice and rank highly without AI penalties." },
    { icon: <Zap className="w-8 h-8"/>, title: "General Writing", desc: "Smooth out emails, blogs, and drafts for natural flow." }
  ];

  return (
    <div className="min-h-screen bg-[#FFF8F0] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-4xl text-center mb-12">
        <h1 className="text-4xl font-bold font-sora text-[#5C4033] mb-4">Welcome to Humara.</h1>
        <p className="text-xl text-[#8A7263]">How will you be using our humanization engine?</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
        {options.map((opt, i) => (
          <button key={i} className="group p-8 bg-white border-2 border-[#EADDCF] rounded-3xl hover:border-[#D97757] hover:shadow-xl hover:shadow-[#D97757]/10 transition-all text-left flex flex-col h-full bg-gradient-to-b hover:from-white hover:to-[#FFF8F0]">
            <div className="w-16 h-16 rounded-2xl bg-[#FFF8F0] text-[#D97757] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              {opt.icon}
            </div>
            <h3 className="text-2xl font-bold text-[#5C4033] mb-3">{opt.title}</h3>
            <p className="text-[#8A7263] flex-1 mb-6">{opt.desc}</p>
            <div className="flex items-center text-[#D97757] font-bold group-hover:translate-x-2 transition-transform">
               Select <ArrowRight className="w-5 h-5 ml-1"/>
            </div>
          </button>
        ))}
      </div>
      <Link href="/app" className="mt-12 text-[#8A7263] font-semibold hover:text-[#5C4033] transition-colors">Skip for now</Link>
    </div>
  );
}
