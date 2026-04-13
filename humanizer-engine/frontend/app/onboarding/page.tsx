import type { Metadata } from 'next';
import { BookOpen, Briefcase, Zap, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Get Started - Choose Your Use Case',
  description: 'Set up your HumaraGPT workspace. Choose between academic, content & SEO, or general writing modes.',
  robots: { index: false },
};

export default function Onboarding() {
  const options = [
    { icon: <BookOpen className="w-8 h-8"/>, title: "Academic & Research", desc: "Preserve scholarly tone while bypassing university detectors." },
    { icon: <Briefcase className="w-8 h-8"/>, title: "Content & SEO", desc: "Maintain brand voice and rank highly without AI penalties." },
    { icon: <Zap className="w-8 h-8"/>, title: "General Writing", desc: "Smooth out emails, blogs, and drafts for natural flow." }
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-[#05050A] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-4xl text-center mb-12">
        <h1 className="text-4xl font-semibold text-slate-900 dark:text-white mb-4">Welcome to HumaraGPT</h1>
        <p className="text-lg text-slate-500 dark:text-zinc-400">How will you be using our humanization engine?</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
        {options.map((opt, i) => (
          <button key={i} className="group p-8 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl hover:border-purple-700 hover:shadow-lg transition-all text-left flex flex-col h-full">
            <div className="w-14 h-14 rounded-xl bg-purple-950/40 text-purple-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              {opt.icon}
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">{opt.title}</h3>
            <p className="text-sm text-slate-500 dark:text-zinc-400 flex-1 mb-6 leading-relaxed">{opt.desc}</p>
            <div className="flex items-center text-purple-400 text-sm font-medium group-hover:translate-x-1 transition-transform">
               Select <ArrowRight className="w-4 h-4 ml-1"/>
            </div>
          </button>
        ))}
      </div>
      <Link href="/app" className="mt-10 text-sm text-slate-500 dark:text-zinc-500 font-medium hover:text-zinc-300 transition-colors">Skip for now</Link>
    </div>
  );
}

