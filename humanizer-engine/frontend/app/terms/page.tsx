import type { Metadata } from 'next';
import { Shield, AlertCircle, Lock, Server, Users, FileText } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service — HumaraGPT',
  description: 'HumaraGPT terms of service — acceptable use policies, strict academic prohibition, content guidelines, liability, and user responsibilities for AI text humanization.',
  alternates: { canonical: 'https://humaragpt.com/terms' },
};

export default function TermsPage() {
  return (
    <div className="flex flex-col items-center min-h-screen bg-white dark:bg-[#05050A]">
      {/* Hero Section */}
      <section className="w-full bg-slate-50 dark:bg-zinc-900 pt-32 pb-24">
        <div className="max-w-5xl mx-auto px-6 text-center mt-12">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-purple-950/30 rounded-xl">
              <FileText className="w-8 h-8 text-purple-400" strokeWidth={2} />
            </div>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white mb-8 border-b-4 border-purple-500 pb-6 inline-block">
            Terms of Service
          </h1>
          <p className="text-xl text-slate-500 dark:text-zinc-400 max-w-3xl mx-auto font-medium leading-relaxed mt-8">
            Please read these terms carefully before using HumaraGPT.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="w-full bg-white dark:bg-[#05050A] py-24 border-y border-slate-200 dark:border-zinc-800">
        <div className="max-w-4xl mx-auto px-6">
          <div className="space-y-12">
            {/* Service Usage */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-6 h-6 text-purple-400 flex-shrink-0" strokeWidth={2} />
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Service Usage</h2>
              </div>
              <p className="text-slate-600 dark:text-zinc-300 text-lg leading-relaxed font-medium">
                We provide tools strictly designed to refine text structure and readability (burstiness, perplexity adjustment). Ensure you follow institutional guidelines when using AI-modified text.
              </p>
              <div className="bg-purple-950/20 border-l-4 border-purple-500 p-6 rounded-r-lg">
                <p className="text-sm text-slate-600 dark:text-zinc-300 font-medium leading-relaxed">
                  By using HumaraGPT, you acknowledge and agree that you are responsible for the content you submit and ensure compliance with all applicable laws and institutional policies.
                </p>
              </div>
            </div>

            {/* Acceptable Content */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-6 h-6 text-purple-400 flex-shrink-0" strokeWidth={2} />
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Acceptable Content</h2>
              </div>
              <p className="text-slate-600 dark:text-zinc-300 text-lg leading-relaxed font-medium">
                Content submitted must not violate local or international rules. We do not store your queried text permanently unless required for continuous model improvement via opted-in mechanisms.
              </p>
              <ul className="space-y-3 text-slate-600 dark:text-zinc-300 font-medium">
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0" />
                  <span>No illegal or harmful content</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0" />
                  <span>No content that violates third-party intellectual property rights</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0" />
                  <span>No harassment, discrimination, or hate speech</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Comply with academic integrity policies where applicable</span>
                </li>
              </ul>
            </div>

            {/* ACADEMIC PROHIBITION */}
            <div className="space-y-4 bg-red-950/20 border-2 border-red-900/50 rounded-xl p-8 -mx-2">
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0" strokeWidth={2} />
                <h2 className="text-2xl font-bold text-red-400">Strict Academic Use Prohibition</h2>
              </div>
              <p className="text-red-400 text-lg leading-relaxed font-bold">
                HumaraGPT strictly prohibits the use of its services for any academic purpose. This is a zero-tolerance policy.
              </p>
              <p className="text-slate-600 dark:text-zinc-300 text-base leading-relaxed font-medium">
                By using HumaraGPT, you agree that you will <strong>not</strong> use the service for any of the following:
              </p>
              <ul className="space-y-3 text-slate-600 dark:text-zinc-300 font-medium">
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Essays, dissertations, theses, or any written academic assignments</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Homework, coursework, or any graded academic submissions</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Research papers, journal submissions, or conference papers</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Exam responses, take-home tests, or lab reports</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Any content intended to bypass academic integrity detection systems for graded work</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Any other form of academic dishonesty or fraud</span>
                </li>
              </ul>
              <div className="bg-red-950/40 border border-red-900/50 p-4 rounded-lg mt-4">
                <p className="text-sm text-red-400 font-bold">
                  Violation of this policy will result in immediate and permanent account termination without refund. HumaraGPT reserves the right to report violations to relevant academic institutions and cooperate with institutional investigations.
                </p>
              </div>
            </div>

            {/* Data Privacy */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Lock className="w-6 h-6 text-purple-400 flex-shrink-0" strokeWidth={2} />
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Data & Privacy</h2>
              </div>
              <p className="text-slate-600 dark:text-zinc-300 text-lg leading-relaxed font-medium">
                Your privacy is important to us. Text submitted through HumaraGPT is processed securely and is not stored without explicit consent for model training purposes.
              </p>
            </div>

            {/* User Responsibilities */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-6 h-6 text-purple-400 flex-shrink-0" strokeWidth={2} />
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">User Responsibilities</h2>
              </div>
              <p className="text-slate-600 dark:text-zinc-300 text-lg leading-relaxed font-medium">
                You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to immediately notify us of any unauthorized use of your account.
              </p>
            </div>

            {/* Limitation of Liability */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Server className="w-6 h-6 text-purple-400 flex-shrink-0" strokeWidth={2} />
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Limitation of Liability</h2>
              </div>
              <p className="text-slate-600 dark:text-zinc-300 text-lg leading-relaxed font-medium">
                HumaraGPT is provided &ldquo;as is&rdquo; without warranties of any kind. While we strive to maintain high service quality, we cannot guarantee uninterrupted service or error-free operations.
              </p>
            </div>

            {/* Last Updated */}
            <div className="border-t-2 border-slate-200 dark:border-zinc-800 pt-8 mt-8">
              <p className="text-center text-sm font-bold text-slate-500 dark:text-zinc-500 italic">
                Last updated: April 2026
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="w-full py-20 px-6 bg-slate-50 dark:bg-zinc-900">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-6">Questions about our Terms?</h2>
          <p className="text-slate-500 dark:text-zinc-400 text-lg mb-8 font-medium">
            Contact our support team for clarification on any of our policies.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/app" className="bg-purple-600 hover:bg-purple-500 text-white px-8 py-3 font-medium rounded-lg transition-colors">
              Get Started
            </Link>
            <Link href="/" className="bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 px-8 py-3 font-medium rounded-lg border border-slate-300 dark:border-zinc-700 hover:bg-slate-300 dark:hover:bg-zinc-700 transition-colors">
              Back to Home
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

