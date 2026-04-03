import type { Metadata } from 'next';
import { Lock, Eye, Database, Mail, Shield, Zap } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Humara privacy policy — how we collect, use, and protect your data. Your text is never stored or used for training.',
  alternates: { canonical: 'https://humara.ai/privacy' },
};

export default function PrivacyPage() {
  return (
    <div className="flex flex-col items-center min-h-screen bg-brand-950">
      {/* Hero Section */}
      <section className="w-full bg-brand-50 pt-32 pb-24">
        <div className="max-w-5xl mx-auto px-6 text-center mt-12">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-brand-50 rounded-xl">
              <Lock className="w-8 h-8 text-brand-600" strokeWidth={2} />
            </div>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-8 border-b-4 border-brand-500 pb-6 inline-block">
            Privacy Policy
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto font-medium leading-relaxed mt-8">
            Your privacy and data security are our top priorities.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="w-full bg-white py-24 border-y border-brand-100">
        <div className="max-w-4xl mx-auto px-6">
          <div className="space-y-12">
            {/* Information We Collect */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Database className="w-6 h-6 text-brand-600 flex-shrink-0" strokeWidth={2} />
                <h2 className="text-2xl font-bold text-gray-900">Information We Collect</h2>
              </div>
              <p className="text-gray-700 text-lg leading-relaxed font-medium">
                We collect information you provide directly, including email addresses, account names, and the text you submit to be rewritten through our service.
              </p>
              <div className="bg-brand-50 border-l-4 border-brand-500 p-6 rounded-r-lg">
                <p className="text-sm text-gray-700 font-medium leading-relaxed">
                  We use industry-standard encryption to protect your data in transit and at rest. Your submitted text is never shared with third parties without your explicit consent.
                </p>
              </div>
            </div>

            {/* How We Use Your Data */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Eye className="w-6 h-6 text-brand-600 flex-shrink-0" strokeWidth={2} />
                <h2 className="text-2xl font-bold text-gray-900">How We Use Your Data</h2>
              </div>
              <p className="text-gray-700 text-lg leading-relaxed font-medium">
                We process your data strictly for the following purposes:
              </p>
              <ul className="space-y-3 text-gray-700 font-medium">
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-brand-600 rounded-full mt-2 flex-shrink-0" />
                  <span>Providing and improving our humanization services</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-brand-600 rounded-full mt-2 flex-shrink-0" />
                  <span>Maintaining and securing your account</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-brand-600 rounded-full mt-2 flex-shrink-0" />
                  <span>Communicating service updates and support</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 bg-brand-600 rounded-full mt-2 flex-shrink-0" />
                  <span>Complying with legal obligations</span>
                </li>
              </ul>
            </div>

            {/* Content Storage */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Zap className="w-6 h-6 text-brand-600 flex-shrink-0" strokeWidth={2} />
                <h2 className="text-2xl font-bold text-gray-900">Content Storage & Retention</h2>
              </div>
              <p className="text-gray-700 text-lg leading-relaxed font-medium">
                We do not store your queried text permanently unless required for continuous model improvement via opted-in mechanisms. You maintain complete control over whether your data is used for training purposes.
              </p>
            </div>

            {/* Third-Party Services */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Mail className="w-6 h-6 text-brand-600 flex-shrink-0" strokeWidth={2} />
                <h2 className="text-2xl font-bold text-gray-900">Third-Party Services</h2>
              </div>
              <p className="text-gray-700 text-lg leading-relaxed font-medium">
                We may share aggregated, anonymized data with service providers to enhance our service quality. We never sell your personal information to third parties.
              </p>
            </div>

            {/* Security Measures */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-6 h-6 text-brand-600 flex-shrink-0" strokeWidth={2} />
                <h2 className="text-2xl font-bold text-gray-900">Security Measures</h2>
              </div>
              <p className="text-gray-700 text-lg leading-relaxed font-medium">
                Humara implements comprehensive security protocols including encrypted data transmission, secure authentication, and regular security audits to protect your information.
              </p>
            </div>

            {/* Your Rights */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Lock className="w-6 h-6 text-brand-600 flex-shrink-0" strokeWidth={2} />
                <h2 className="text-2xl font-bold text-gray-900">Your Rights & Choices</h2>
              </div>
              <p className="text-gray-700 text-lg leading-relaxed font-medium">
                You have the right to access, modify, or delete your personal data at any time. You can also opt-out of promotional communications and control data usage preferences through your account settings.
              </p>
            </div>

            {/* Last Updated */}
            <div className="border-t-2 border-brand-200 pt-8 mt-8">
              <p className="text-center text-sm font-bold text-gray-600 italic">
                Last updated: April 2026
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="w-full py-20 px-6 bg-brand-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Your Privacy Matters</h2>
          <p className="text-gray-600 text-lg mb-8 font-medium">
            Have privacy concerns? Contact us anytime for clarification or data requests.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/app" className="bg-brand-600 hover:bg-brand-700 text-white px-8 py-3 font-medium rounded-lg transition-colors">
              Start Using Humara
            </Link>
            <Link href="/" className="bg-white text-gray-900 px-8 py-3 font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              Back to Home
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

