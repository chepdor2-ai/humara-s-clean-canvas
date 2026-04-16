import type { Metadata } from 'next';
import { Ban, AlertTriangle, CheckCircle2, Shield, BookOpen, Globe, Briefcase, PenTool, FileText, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Acceptable Use Policy — HumaraGPT',
  description: 'HumaraGPT acceptable use policy. Academic use is strictly prohibited. Learn about permitted professional uses, prohibited activities, and enforcement measures for AI text humanization.',
  alternates: { canonical: 'https://www.humaragpt.com/acceptable-use' },
  keywords: ['HumaraGPT acceptable use', 'AI humanizer policy', 'academic use prohibited', 'AI text humanizer terms', 'content humanization guidelines'],
};

export default function AcceptableUsePage() {
  return (
    <div className="flex flex-col items-center min-h-screen">
      {/* Hero */}
      <section className="w-full bg-slate-50 dark:bg-zinc-900 pt-32 pb-24">
        <div className="max-w-5xl mx-auto px-6 text-center mt-12">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-brand-950/30 rounded-xl">
              <Shield className="w-8 h-8 text-brand-400" strokeWidth={2} />
            </div>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white mb-8">
            Acceptable Use Policy
          </h1>
          <p className="text-xl text-slate-500 dark:text-zinc-400 max-w-3xl mx-auto font-medium leading-relaxed">
            HumaraGPT is a professional AI text humanization tool. This policy outlines what you can and cannot use it for. Please read it carefully before using our service.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="w-full bg-white dark:bg-zinc-950 py-24 border-y border-slate-200 dark:border-zinc-800">
        <div className="max-w-4xl mx-auto px-6 space-y-16">

          {/* PROHIBITED: Academic Use */}
          <div className="bg-red-950/20 border-2 border-red-900/50 rounded-2xl p-8 md:p-12">
            <div className="flex items-center gap-3 mb-6">
              <Ban className="w-8 h-8 text-red-400 flex-shrink-0" strokeWidth={2} />
              <h2 className="text-3xl font-bold text-red-400">Prohibited: Academic Use</h2>
            </div>
            <p className="text-red-400 text-lg leading-relaxed font-bold mb-6">
              HumaraGPT unconditionally prohibits all use of its services for academic purposes. This is a zero-tolerance, non-negotiable policy.
            </p>

            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">What is considered academic use?</h3>
            <p className="text-slate-600 dark:text-zinc-300 leading-relaxed mb-6">
              Any use of HumaraGPT in connection with formal education, graded coursework, or academic credentialing is prohibited. This includes but is not limited to:
            </p>

            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {[
                'Essays and term papers',
                'Dissertations and theses',
                'Homework and take-home assignments',
                'Research papers and literature reviews',
                'Journal article submissions',
                'Conference paper submissions',
                'Lab reports and scientific write-ups',
                'Exam responses and quiz answers',
                'Scholarship application essays',
                'College admission essays',
                'Course project reports',
                'Any graded academic deliverable',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-600 dark:text-zinc-300 font-medium">{item}</span>
                </div>
              ))}
            </div>

            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Why we prohibit academic use</h3>
            <div className="space-y-4 text-slate-600 dark:text-zinc-300 leading-relaxed">
              <p>
                <strong>Academic integrity matters.</strong> Education systems rely on honest assessment of student knowledge and ability. Using AI humanization tools to disguise machine-generated work as your own is a form of academic fraud that:
              </p>
              <ul className="space-y-2 ml-4">
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-red-400 rounded-full mt-2 flex-shrink-0" />
                  <span>Violates institutional honor codes and academic integrity policies at virtually every university, college, and school worldwide</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-red-400 rounded-full mt-2 flex-shrink-0" />
                  <span>Undermines the value of legitimate academic credentials earned by honest students</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-red-400 rounded-full mt-2 flex-shrink-0" />
                  <span>Can result in course failure, academic probation, suspension, expulsion, or degree revocation</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-red-400 rounded-full mt-2 flex-shrink-0" />
                  <span>May carry legal consequences in jurisdictions that regulate academic fraud</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-red-400 rounded-full mt-2 flex-shrink-0" />
                  <span>Deprives students of the learning process that education is designed to provide</span>
                </li>
              </ul>
            </div>

            <div className="bg-red-950/40 border border-red-900/50 p-6 rounded-xl mt-8">
              <h4 className="text-sm font-bold text-red-400 mb-2">Enforcement</h4>
              <p className="text-sm text-red-400/80 leading-relaxed">
                HumaraGPT actively monitors usage patterns for indicators of academic misuse. Accounts found in violation of this policy will be <strong>immediately and permanently terminated without refund</strong>. We reserve the right to cooperate with academic institutions in investigations of academic dishonesty, share relevant usage data with institutional authorities upon valid request, and report confirmed violations to educational organizations.
              </p>
            </div>
          </div>

          {/* PERMITTED: Professional Uses */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 flex-shrink-0" strokeWidth={2} />
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Permitted: Professional Uses</h2>
            </div>
            <p className="text-slate-600 dark:text-zinc-300 text-lg leading-relaxed mb-8">
              HumaraGPT is designed for legitimate professional and commercial applications where AI text humanization adds genuine value:
            </p>

            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  icon: Globe,
                  title: 'SEO & Content Marketing',
                  items: ['Blog posts and articles', 'Website copy and landing pages', 'Product descriptions', 'Social media content', 'Newsletter content'],
                },
                {
                  icon: Briefcase,
                  title: 'Corporate & Business',
                  items: ['Internal communications', 'Marketing materials', 'Press releases', 'Business proposals', 'Corporate documentation'],
                },
                {
                  icon: PenTool,
                  title: 'Creative & Editorial',
                  items: ['Fiction and creative writing', 'Scriptwriting and dialogue', 'Copywriting projects', 'Editorial content', 'Personal blog writing'],
                },
                {
                  icon: FileText,
                  title: 'Technical & Documentation',
                  items: ['Technical documentation', 'User guides and manuals', 'API documentation', 'Knowledge base articles', 'Training materials (non-academic)'],
                },
              ].map((category) => (
                <div key={category.title} className="bg-slate-50 dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-brand-950/30 rounded-lg flex items-center justify-center">
                      <category.icon className="w-5 h-5 text-brand-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{category.title}</h3>
                  </div>
                  <ul className="space-y-2">
                    {category.items.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-slate-500 dark:text-zinc-400">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Additional Prohibited Uses */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <Ban className="w-8 h-8 text-red-400 flex-shrink-0" strokeWidth={2} />
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Other Prohibited Uses</h2>
            </div>
            <p className="text-slate-600 dark:text-zinc-300 leading-relaxed mb-6">
              In addition to academic use, the following activities are also prohibited:
            </p>
            <ul className="space-y-3 text-slate-600 dark:text-zinc-300 font-medium">
              {[
                'Generating or distributing misinformation, disinformation, or propaganda',
                'Creating content that is illegal, harmful, harassing, or discriminatory',
                'Impersonating individuals or organizations for fraudulent purposes',
                'Violating intellectual property rights or copyright law',
                'Submitting content that promotes violence, hate speech, or exploitation',
                'Using the service to conduct or facilitate any form of fraud',
                'Automated scraping, reverse engineering, or abuse of the platform',
                'Reselling or redistributing HumaraGPT services without authorization',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <span className="text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* User Responsibility */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <Shield className="w-8 h-8 text-brand-400 flex-shrink-0" strokeWidth={2} />
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Your Responsibility</h2>
            </div>
            <div className="space-y-4 text-slate-600 dark:text-zinc-300 leading-relaxed">
              <p>
                By using HumaraGPT, you acknowledge and agree that:
              </p>
              <ul className="space-y-3">
                {[
                  'You are solely responsible for ensuring your use of HumaraGPT complies with this Acceptable Use Policy, our Terms of Service, and all applicable laws and regulations.',
                  'You will not use HumaraGPT for any academic purpose whatsoever, as defined in this policy.',
                  'You understand that violations of this policy may result in immediate account termination without refund.',
                  'You will not hold HumaraGPT liable for any consequences resulting from your misuse of the service.',
                  'You will truthfully represent the nature of content you create using HumaraGPT when required by law or professional obligation.',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="inline-block w-2 h-2 bg-brand-400 rounded-full mt-2 flex-shrink-0" />
                    <span className="text-sm font-medium">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Contact & Last Updated */}
          <div className="border-t-2 border-slate-300 dark:border-zinc-700 pt-8">
            <p className="text-center text-sm text-slate-500 dark:text-zinc-400 mb-2">
              Questions about this policy? <Link href="/contact" className="text-brand-400 hover:underline font-semibold">Contact us</Link>
            </p>
            <p className="text-center text-sm font-bold text-slate-500 dark:text-zinc-500 italic">
              Last updated: April 2026
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full py-20 px-6 bg-slate-50 dark:bg-zinc-900">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-6">Ready for professional-grade content humanization?</h2>
          <p className="text-slate-500 dark:text-zinc-400 text-lg mb-8 font-medium">
            HumaraGPT is the leading AI text humanization platform for professionals and businesses.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/app" className="bg-brand-600 hover:bg-brand-700 text-white px-8 py-3 font-medium rounded-lg transition-colors inline-flex items-center gap-2 justify-center">
              Try the Humanizer <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/terms" className="bg-white dark:bg-zinc-950 text-slate-900 dark:text-white px-8 py-3 font-medium rounded-lg border border-slate-300 dark:border-zinc-700 hover:bg-slate-50 dark:bg-zinc-900 transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
