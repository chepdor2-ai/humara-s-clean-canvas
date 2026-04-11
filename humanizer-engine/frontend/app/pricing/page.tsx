import type { Metadata } from 'next';
import { CheckCircle2, Minus } from 'lucide-react';
import Link from 'next/link';
import PricingCards from './PricingCards';

export const metadata: Metadata = {
  title: 'Pricing — Plans from $5/mo',
  description: 'Choose the HumaraGPT plan that fits your volume. Daily word limits, all engine modes, yearly savings of 15%. Start from $5/mo.',
  alternates: { canonical: 'https://humaragpt.com/pricing' },
};

export default function PricingPage() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero */}
      <section className="w-full pt-32 pb-16 bg-slate-950">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 py-1.5 px-3 rounded-full bg-brand-950 text-brand-300 text-xs font-medium mb-8 border border-brand-800">
            Simple Pricing
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold text-white tracking-tight leading-[1.1] mb-6">
            Plans that scale with<br />
            <span className="text-brand-600">your needs</span>
          </h1>
          <p className="text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto">
            Daily word limits that reset every 24 hours. Upgrade or downgrade at any time. Save 15% with yearly billing.
          </p>
        </div>
      </section>

      {/* Pricing Cards (client component for yearly toggle) */}
      <PricingCards />

      {/* Trust bar */}
      <section className="w-full py-12 bg-slate-900 border-y border-slate-800">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-5">Trusted by students and researchers at</p>
          <div className="flex flex-wrap justify-center gap-10 text-slate-600">
            {["Oxford", "Stanford", "MIT", "Cambridge", "Harvard"].map((uni) => (
              <span key={uni} className="text-lg font-semibold tracking-tight">{uni}</span>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ-like CTA */}
      <section className="w-full py-20 bg-slate-950">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-semibold text-white mb-4">Need a custom plan?</h2>
          <p className="text-slate-400 mb-8">Enterprise volumes, custom integrations, or SLA requirements? Let&apos;s talk.</p>
          <Link href="/contact" className="bg-brand-600 hover:bg-brand-700 text-white px-7 py-3 rounded-lg text-sm font-medium transition-colors">
            Contact Sales
          </Link>
        </div>
      </section>
    </div>
  );
}
