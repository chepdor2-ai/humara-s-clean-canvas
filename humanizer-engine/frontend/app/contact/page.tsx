import type { Metadata } from 'next';
import { Mail, MessageSquare, Building2, Clock, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import ContactForm from './ContactForm';

const WHATSAPP_NUMBER = '254743468864';
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Get in touch with the HumaraGPT team for support, partnerships, or enterprise inquiries.',
  alternates: { canonical: 'https://humaragpt.com/contact' },
};

export default function ContactPage() {
  const channels = [
    { icon: MessageCircle, title: 'WhatsApp (Preferred)', desc: 'Instant support — fastest way to reach us.', detail: '+254 743 468 864', sub: 'Replies within minutes', href: `${WHATSAPP_LINK}?text=${encodeURIComponent('Hi HumaraGPT team! I have a question.')}`, highlight: true },
    { icon: Mail, title: 'Email Support', desc: 'For general questions and account help.', detail: 'support@humaragpt.com', sub: 'We reply within 24 hours', href: 'mailto:support@humaragpt.com', highlight: false },
    { icon: Building2, title: 'Enterprise & Partnerships', desc: 'Custom plans, API access, and integrations.', detail: 'enterprise@humaragpt.com', sub: 'Dedicated account manager', href: 'mailto:enterprise@humaragpt.com', highlight: false },
  ];

  return (
    <div className="flex flex-col items-center bg-white dark:bg-[#05050A]">
      {/* Hero */}
      <section className="w-full pt-32 pb-16 bg-slate-50 dark:bg-zinc-900">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 py-1.5 px-3 rounded-full bg-slate-200 dark:bg-zinc-800 text-purple-400 text-xs font-medium mb-8 border border-slate-300 dark:border-zinc-700">
            <Clock className="w-3.5 h-3.5" /> We reply within 24h
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold text-slate-900 dark:text-white tracking-tight leading-[1.1] mb-6">
            Get in touch
          </h1>
          <p className="text-lg text-slate-500 dark:text-zinc-400 leading-relaxed max-w-2xl mx-auto">
            Have questions about HumaraGPT? Need a custom enterprise plan? We are here to help.
          </p>
          <a
            href={`${WHATSAPP_LINK}?text=${encodeURIComponent('Hi HumaraGPT team! I have a question about your platform.')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 mt-10 px-8 py-4 bg-[#25D366] hover:bg-[#20BD5A] text-white text-lg font-semibold rounded-2xl transition-all hover:shadow-lg hover:shadow-green-500/25 hover:scale-[1.02] active:scale-[0.98]"
          >
            <MessageCircle className="w-6 h-6" />
            Chat on WhatsApp
          </a>
        </div>
      </section>

      {/* Contact Cards */}
      <section className="w-full py-16 bg-white dark:bg-[#05050A] border-y border-slate-200 dark:border-zinc-800">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-6">
            {channels.map((ch) => {
              const Icon = ch.icon;
              return (
                <a key={ch.title} href={ch.href} target={ch.href.startsWith('https') ? '_blank' : undefined} rel={ch.href.startsWith('https') ? 'noopener noreferrer' : undefined} className={`bg-slate-50 dark:bg-zinc-900 rounded-xl border p-6 hover:shadow-md transition-all block ${ch.highlight ? 'border-[#25D366]/40 hover:border-[#25D366] ring-1 ring-[#25D366]/10' : 'border-slate-200 dark:border-zinc-800 hover:border-purple-800'}`}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${ch.highlight ? 'bg-[#25D366]/10' : 'bg-slate-200 dark:bg-zinc-800'}`}>
                    <Icon className={`w-5 h-5 ${ch.highlight ? 'text-[#25D366]' : 'text-purple-400'}`} />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{ch.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-zinc-400 mb-4">{ch.desc}</p>
                  <p className={`text-sm font-medium mb-1 ${ch.highlight ? 'text-[#25D366]' : 'text-purple-400'}`}>{ch.detail}</p>
                  <p className="text-xs text-slate-500 dark:text-zinc-500">{ch.sub}</p>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contact Form */}
      <section className="w-full py-16 bg-white dark:bg-[#05050A]">
        <div className="max-w-2xl mx-auto px-6">
          <ContactForm />
        </div>
      </section>

      {/* FAQ */}
      <section className="w-full py-20 bg-white dark:bg-[#05050A]">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-10 text-center">Frequently asked questions</h2>
          <div className="space-y-6">
            {[
              { q: 'Is my text stored after processing?', a: 'No. Your text is processed in memory and discarded immediately after humanization. We never store your content unless you explicitly opt in for model improvement.' },
              { q: 'Can HumaraGPT bypass Turnitin?', a: 'Yes. Our multi-pass rewriting engine consistently achieves 95-100% human scores on Turnitin, GPTZero, Originality.AI, Copyleaks, and Winston AI.' },
              { q: 'Do you offer refunds?', a: 'Yes. If you are not satisfied within the first 7 days of a paid plan, contact us for a full refund — no questions asked.' },
              { q: 'Is there an API?', a: 'API access is available on our Professional plan. Contact enterprise@humaragpt.com for custom API integrations and volume pricing.' },
            ].map((faq) => (
              <div key={faq.q} className="bg-slate-50 dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">{faq.q}</h3>
                <p className="text-sm text-slate-500 dark:text-zinc-400 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full py-16 bg-slate-50 dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">Ready to get started?</h2>
          <p className="text-slate-500 dark:text-zinc-400 mb-8">Try the humanizer free — no credit card required.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={`${WHATSAPP_LINK}?text=${encodeURIComponent('Hi! I want to get started with HumaraGPT.')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#25D366] hover:bg-[#20BD5A] text-white font-semibold rounded-xl transition-all hover:shadow-lg"
            >
              <MessageCircle className="w-5 h-5" /> WhatsApp Us
            </a>
            <Link href="/app" className="bg-purple-600 hover:bg-purple-700 text-white px-7 py-3 rounded-xl text-sm font-medium transition-colors">
              Try HumaraGPT Free
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

