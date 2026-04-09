import type { Metadata } from 'next';
import { Quote, Brain, Shield, Target, BookOpen, Ban, AlertTriangle, Globe, Briefcase, PenTool, CheckCircle2, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About HumaraGPT — AI Text Humanization for Professionals',
  description: 'HumaraGPT is the leading AI text humanization platform for SEO professionals, content creators & enterprises. Learn about our mission, technology, and strict policy against academic use.',
  alternates: { canonical: 'https://humaragpt.com/about' },
  keywords: ['about HumaraGPT', 'AI text humanizer company', 'AI humanization technology', 'professional AI rewriter', 'content humanization platform'],
};

export default function AboutPage() {
  return (
    <div className="flex flex-col items-center min-h-screen">
      <section className="w-full bg-brand-50 dark:bg-zinc-900 pt-32 pb-24">
        <div className="max-w-5xl mx-auto px-6 text-center mt-12">
          <span className="inline-block py-1 px-3 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-800 dark:text-brand-300 font-semibold uppercase text-xs mb-6 border border-brand-300 dark:border-brand-700">About Us</span>
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-8">
            About HumaraGPT
          </h1>
          <p className="text-xl text-gray-600 dark:text-zinc-400 max-w-3xl mx-auto font-medium leading-relaxed">
            The most advanced AI text humanization platform — built exclusively for content creators, SEO professionals, and enterprises. We make AI-generated content indistinguishable from human writing while maintaining strict ethical standards.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="w-full bg-white dark:bg-zinc-950 py-24 border-y border-brand-100 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white leading-tight">
              Our Mission
            </h2>
            <div className="space-y-6 text-gray-600 dark:text-zinc-400 leading-relaxed text-lg font-medium">
              <p>
                HumaraGPT was created to solve a real problem: AI-assisted content that sounds robotic kills engagement, triggers platform filters, and undermines credibility. Our advanced AI rewriting engine deconstructs machine-generated content and rebuilds it to sound authentically human.
              </p>
              <p>
                Unlike rudimentary synonym-spinners, HumaraGPT analyzes deep linguistic patterns — sentence rhythm, vocabulary distribution, burstiness, and transition flow — to create genuinely undetectable prose that preserves semantic integrity.
              </p>
              <p>
                We believe AI should be a tool for <strong>amplifying</strong> human creativity, not replacing it. Our platform empowers professionals to draft faster with AI, then deliver content that reads as naturally as hand-written prose.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 bg-brand-100 dark:bg-zinc-800 border border-brand-100 dark:border-zinc-700 rounded-xl overflow-hidden shadow-lg">
            {[
              { icon: Brain, title: "Pipeline", val: "Multi-Stage" },
              { icon: Shield, title: "Detectors", val: "7+ Bypassed" },
              { icon: Target, title: "Human Score", val: "99.2%" },
              { icon: Globe, title: "Users", val: "50K+" }
            ].map((item, i) => (
              <div key={i} className="bg-white dark:bg-zinc-950 p-8 flex flex-col justify-center items-center text-center">
                <item.icon className="w-8 h-8 text-brand-600 dark:text-brand-400 mb-4" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-600 dark:text-zinc-500 mb-2">{item.title}</h3>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{item.val}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Academic Prohibition — Prominent Section */}
      <section className="w-full py-24 px-6 bg-red-50 dark:bg-red-950/20 border-y border-red-100 dark:border-red-900/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-2xl mb-6">
              <Ban className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">Academic Use Policy</h2>
            <p className="text-lg text-red-700 dark:text-red-400 font-semibold max-w-2xl mx-auto">
              HumaraGPT strictly prohibits all use for academic purposes. This is a non-negotiable policy.
            </p>
          </div>

          <div className="bg-white dark:bg-zinc-950 rounded-2xl border-2 border-red-200 dark:border-red-900/50 p-8 md:p-12 mb-10">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Prohibited Academic Activities</h3>
            <p className="text-gray-600 dark:text-zinc-400 mb-6 leading-relaxed">
              The following uses of HumaraGPT are <strong className="text-red-700 dark:text-red-400">explicitly and unconditionally prohibited</strong>. Any account found engaging in these activities will be immediately and permanently terminated without refund:
            </p>
            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {[
                'Submitting humanized text as original academic work',
                'Using HumaraGPT for essays, papers, or dissertations',
                'Humanizing content for homework or coursework',
                'Bypassing Turnitin or similar tools for graded work',
                'Rewriting AI-generated thesis or research content',
                'Using humanized text for exam answers or take-home tests',
                'Submitting humanized content for academic journals',
                'Any circumvention of academic integrity systems',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-700 dark:text-zinc-300 font-medium">{item}</span>
                </div>
              ))}
            </div>
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl p-6">
              <h4 className="text-sm font-bold text-red-800 dark:text-red-400 mb-2">Why We Enforce This Policy</h4>
              <p className="text-sm text-red-700 dark:text-red-400/80 leading-relaxed">
                Academic integrity is a cornerstone of education. Using AI humanization tools to disguise AI-generated academic work as your own constitutes academic dishonesty, violates institutional honor codes, and undermines the value of legitimate credentials. Consequences of academic dishonesty can include course failure, suspension, expulsion, and degree revocation. HumaraGPT is committed to being part of the solution, not the problem.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 p-8 md:p-12">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Intended Professional Uses</h3>
            <p className="text-gray-600 dark:text-zinc-400 mb-6 leading-relaxed">
              HumaraGPT is designed for professionals who use AI as a drafting tool and need the output to be publication-ready:
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: Globe, text: 'SEO content production & blog writing' },
                { icon: Briefcase, text: 'Corporate communications & marketing' },
                { icon: PenTool, text: 'Creative writing & fiction projects' },
                { icon: BookOpen, text: 'Technical documentation & guides' },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-brand-50 dark:bg-brand-950/30 rounded-lg flex items-center justify-center shrink-0">
                    <item.icon className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  </div>
                  <span className="text-sm text-gray-700 dark:text-zinc-300 font-medium">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Core Values */}
      <section className="w-full py-24 px-6 bg-brand-50 dark:bg-zinc-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">Core Values</h2>
            <p className="text-lg text-gray-600 dark:text-zinc-400">Built on integrity, precision, and respect for authentic expression.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: "Ethical AI Use",
                desc: "We are committed to responsible AI deployment. HumaraGPT is a professional tool for legitimate content creation — never for academic deception. We actively enforce our acceptable use policy and terminate accounts that violate it."
              },
              {
                title: "Semantic Preservation",
                desc: "We never sacrifice the core intent of your work. Our engine understands arguments, entities, and causal logic, then rebuilds text without changing the underlying message. Technical accuracy is preserved throughout."
              },
              {
                title: "Privacy & Security",
                desc: "Your content is processed in memory and discarded immediately. We never store submitted text, share it with third parties, or use it for model training. Your intellectual property remains yours."
              }
            ].map((v, i) => (
              <div key={i} className="bg-white dark:bg-zinc-950 p-8 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm space-y-4">
                <div className="w-12 h-1 bg-brand-500" />
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{v.title}</h3>
                <p className="text-gray-600 dark:text-zinc-400 text-sm leading-relaxed font-medium">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full py-24 px-6 bg-gray-900 text-center">
        <div className="max-w-4xl mx-auto flex flex-col items-center">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-8">
            Start humanizing today
          </h2>
          <p className="text-gray-300 text-lg mb-4 leading-relaxed">
            Ready to humanize your AI-generated content? Try HumaraGPT free today with no credit card required.
          </p>
          <p className="text-gray-500 text-sm mb-10">
            For professional and commercial use only. <Link href="/acceptable-use" className="text-brand-400 hover:underline">See acceptable use policy</Link>
          </p>
          <Link href="/app" className="inline-block bg-brand-600 hover:bg-brand-700 text-white px-8 py-4 text-lg font-semibold rounded-lg transition">
            Try the Humanizer Free &rarr;
          </Link>
        </div>
      </section>
    </div>
  );
}

