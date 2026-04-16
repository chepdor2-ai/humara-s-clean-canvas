import type { Metadata } from 'next';
import { Lock, Eye, Database, Mail, Shield, Zap } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'HumaraGPT privacy policy � how we collect, use, and protect your data. Your text is never stored or used for training.',
  alternates: { canonical: 'https://www.humaragpt.com/privacy' },
};

export default function PrivacyPage() {
  return (
    <div className="flex flex-col items-center min-h-screen bg-white dark:bg-[#05050A]">
      {/* Hero Section */}
      <section className="w-full bg-slate-50 dark:bg-zinc-900 pt-32 pb-24">
        <div className="max-w-5xl mx-auto px-6 text-center mt-12">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-slate-200 dark:bg-zinc-800 rounded-xl">
              <Lock className="w-8 h-8 text-purple-400" strokeWidth={2} />
            </div>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white mb-8 border-b-4 border-purple-500 pb-6 inline-block">
            Privacy Policy
          </h1>
          <p className="text-xl text-slate-500 dark:text-zinc-400 max-w-3xl mx-auto font-medium leading-relaxed mt-8">
            Your privacy and data security are our top priorities.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="w-full bg-white dark:bg-[#05050A] py-24 border-y border-slate-200 dark:border-zinc-800">
        <div className="max-w-4xl mx-auto px-6">
          <div className="space-y-12">
            {/* Information We Collect */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Database className="w-6 h-6 text-purple-400 flex-shrink-0" strokeWidth={2} />
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Information We Collect</h2>
              </div>
              <p className="text-slate-600 dark:text-zinc-300 text-lg leading-relaxed font-medium">
                We collect information you provide directly, including email addresses, account names, and the text you submit to be rewritten through our service.
              </p>
              <div className="bg-slate-200 dark:bg-zinc-800/50 border-l-4 border-purple-500 p-6 rounded-r-lg">
                <p className="text-sm text-slate-600 dark:text-zinc-300 font-medium leading-relaxed">
                  We use industry-standard encryption to protect your data in transit and at rest. Your submitted text is never shared with third parties without your explicit consent.
                </p>
              </div>
            </div>

            {/* How We Use Your Data */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Eye className="w-6 h-6 text-purple-400 flex-shrink-0" strokeWidth={2} />
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">How We Use Your Data</h2>
              </div>
              <p className="text-slate-600 dark:text-zinc-300 text-lg leading-relaxed font-medium">
                We process your data strictly for the following purposes:
              </p>
              <ul className="space-y-3 text-slate-600 dark:text-zinc-300 font-medium">
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Providing and improving our humanization services</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Maintaining and securing your account</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Communicating service updates and support</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Complying with legal obligations</span>
                </li>
              </ul>
            </div>

            {/* Content Storage */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Zap className="w-6 h-6 text-purple-400 flex-shrink-0" strokeWidth={2} />
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Content Storage & Retention</h2>
              </div>
              <p className="text-slate-600 dark:text-zinc-300 text-lg leading-relaxed font-medium">
                We do not store your queried text permanently unless required for continuous model improvement via opted-in mechanisms. You maintain complete control over whether your data is used for training purposes.
              </p>
            </div>

            {/* Third-Party Services */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Mail className="w-6 h-6 text-purple-400 flex-shrink-0" strokeWidth={2} />
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Third-Party Services</h2>
              </div>
              <p className="text-slate-600 dark:text-zinc-300 text-lg leading-relaxed font-medium">
                We may share aggregated, anonymized data with service providers to enhance our service quality. We never sell your personal information to third parties.
              </p>
            </div>

            {/* Security Measures */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-6 h-6 text-purple-400 flex-shrink-0" strokeWidth={2} />
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Security Measures</h2>
              </div>
              <p className="text-slate-600 dark:text-zinc-300 text-lg leading-relaxed font-medium">
                HumaraGPT implements comprehensive security protocols including encrypted data transmission, secure authentication, and regular security audits to protect your information.
              </p>
            </div>

            {/* Your Rights */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Lock className="w-6 h-6 text-purple-400 flex-shrink-0" strokeWidth={2} />
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Your Rights & Choices</h2>
              </div>
              <p className="text-slate-600 dark:text-zinc-300 text-lg leading-relaxed font-medium">
                You have the right to access, modify, or delete your personal data at any time. You can also opt-out of promotional communications and control data usage preferences through your account settings.
              </p>
            </div>

            {/* Last Updated */}
            <div className="border-t-2 border-slate-300 dark:border-zinc-700 pt-8 mt-8">
              <p className="text-center text-sm font-bold text-slate-500 dark:text-zinc-400 italic">
                Last updated: April 2026
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="w-full py-20 px-6 bg-slate-50 dark:bg-zinc-900">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-6">Your Privacy Matters</h2>
          <p className="text-slate-500 dark:text-zinc-400 text-lg mb-8 font-medium">
            Have privacy concerns? Contact us anytime for clarification or data requests.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/app" className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 font-medium rounded-lg transition-colors">
              Start Using HumaraGPT
            </Link>
            <Link href="/" className="bg-slate-200 dark:bg-zinc-800 text-slate-900 dark:text-white px-8 py-3 font-medium rounded-lg border border-slate-300 dark:border-zinc-700 hover:bg-slate-300 dark:hover:bg-zinc-700 transition-colors">
              Back to Home
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

