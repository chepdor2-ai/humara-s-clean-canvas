import type { Metadata } from 'next';
import { Mail, MessageSquare, Building2, Clock } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Get in touch with the Humara team for support, partnerships, or enterprise inquiries.',
  alternates: { canonical: 'https://humara.ai/contact' },
};

export default function ContactPage() {
  const channels = [
    { icon: Mail, title: 'Email Support', desc: 'For general questions and account help.', detail: 'support@humara.ai', sub: 'We reply within 24 hours' },
    { icon: Building2, title: 'Enterprise & Partnerships', desc: 'Custom plans, API access, and integrations.', detail: 'enterprise@humara.ai', sub: 'Dedicated account manager' },
    { icon: MessageSquare, title: 'Feedback & Bugs', desc: 'Report issues or suggest improvements.', detail: 'feedback@humara.ai', sub: 'We read every message' },
  ];

  return (
    <div className="flex flex-col items-center">
      {/* Hero */}
      <section className="w-full pt-32 pb-16 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 py-1.5 px-3 rounded-full bg-brand-50 text-brand-700 text-xs font-medium mb-8 border border-brand-200">
            <Clock className="w-3.5 h-3.5" /> We reply within 24h
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold text-slate-900 tracking-tight leading-[1.1] mb-6">
            Get in touch
          </h1>
          <p className="text-lg text-slate-500 leading-relaxed max-w-2xl mx-auto">
            Have questions about Humara? Need a custom enterprise plan? We are here to help.
          </p>
        </div>
      </section>

      {/* Contact Cards */}
      <section className="w-full py-16 bg-slate-50 border-y border-slate-100">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-6">
            {channels.map((ch) => {
              const Icon = ch.icon;
              return (
                <div key={ch.title} className="bg-white rounded-xl border border-slate-200 p-6 hover:border-brand-200 hover:shadow-md transition-all">
                  <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-brand-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-1">{ch.title}</h3>
                  <p className="text-sm text-slate-500 mb-4">{ch.desc}</p>
                  <p className="text-sm font-medium text-brand-600 mb-1">{ch.detail}</p>
                  <p className="text-xs text-slate-400">{ch.sub}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="w-full py-20 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-semibold text-slate-900 mb-10 text-center">Frequently asked questions</h2>
          <div className="space-y-6">
            {[
              { q: 'Is my text stored after processing?', a: 'No. Your text is processed in memory and discarded immediately after humanization. We never store your content unless you explicitly opt in for model improvement.' },
              { q: 'Can Humara bypass Turnitin?', a: 'Yes. Our multi-pass rewriting engine consistently achieves 95-100% human scores on Turnitin, GPTZero, Originality.AI, Copyleaks, and Winston AI.' },
              { q: 'Do you offer refunds?', a: 'Yes. If you are not satisfied within the first 7 days of a paid plan, contact us for a full refund — no questions asked.' },
              { q: 'Is there an API?', a: 'API access is available on our Ninja plan. Contact enterprise@humara.ai for custom API integrations and volume pricing.' },
            ].map((faq) => (
              <div key={faq.q} className="bg-slate-50 rounded-xl border border-slate-100 p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-2">{faq.q}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full py-16 bg-slate-50 border-t border-slate-100">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-semibold text-slate-900 mb-4">Ready to get started?</h2>
          <p className="text-slate-500 mb-8">Try the humanizer free — no credit card required.</p>
          <Link href="/app" className="bg-brand-600 hover:bg-brand-700 text-white px-7 py-3 rounded-lg text-sm font-medium transition-colors">
            Try Humara Free
          </Link>
        </div>
      </section>
    </div>
  );
}

