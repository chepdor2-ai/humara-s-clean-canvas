import type { Metadata } from 'next';
import { CheckCircle2, Minus } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pricing — Free Trial & Premium Plans',
  description: 'Start free with 500 words. Upgrade to Pro for unlimited AI humanization, priority processing, and multi-detector scoring. Plans from $15/mo.',
  alternates: { canonical: 'https://humara.ai/pricing' },
};

export default function PricingPage() {
  const tiers = [
    {
      name: "Free Trial",
      price: "0",
      description: "Experience the core engine.",
      features: ["500 Word Credits", "Ghost Mini Engine", "Standard Processing", "Basic Support"],
      notIncluded: ["AI Detection Reports", "Style Memory", "API Access"],
      cta: "Get Started",
      featured: false
    },
    {
      name: "Professional",
      price: "15",
      description: "For students and regular writers.",
      features: ["50,000 Words / mo", "All Engines (Ninja, Pro, Mini)", "AI Detection Reports", "Style Memory (3 slots)", "Priority Support"],
      notIncluded: ["Unlimited Words", "Full API Access"],
      cta: "Start Pro Trial",
      featured: true
    },
    {
      name: "Enterprise",
      price: "49",
      description: "For agencies and power users.",
      features: ["Unlimited Words", "Deep Stealth Engines", "Full Style Library", "API Access (Beta)", "Dedicated Manager"],
      notIncluded: [],
      cta: "Contact Sales",
      featured: false
    }
  ];

  return (
    <div className="flex flex-col items-center">
      {/* Hero */}
      <section className="w-full pt-32 pb-16 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 py-1.5 px-3 rounded-full bg-brand-50 text-brand-700 text-xs font-medium mb-8 border border-brand-200">
            Simple Pricing
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold text-slate-900 tracking-tight leading-[1.1] mb-6">
            Start free, scale as<br />
            <span className="text-brand-600">you grow</span>
          </h1>
          <p className="text-lg text-slate-500 leading-relaxed max-w-2xl mx-auto">
            Choose the plan that matches your writing volume. Upgrade or downgrade at any time.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="w-full py-16 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {tiers.map((tier, i) => (
              <div key={i} className={`rounded-xl border p-8 flex flex-col transition-all duration-300 ${
                tier.featured
                  ? 'bg-slate-900 text-white border-slate-800 relative shadow-xl scale-[1.02]'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-brand-200 hover:shadow-md'
              }`}>
                {tier.featured && (
                  <span className="absolute -top-2.5 left-6 bg-brand-600 text-white text-[10px] font-semibold uppercase tracking-wider py-1 px-2.5 rounded-full">Popular</span>
                )}
                <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${tier.featured ? 'text-brand-400' : 'text-slate-400'}`}>{tier.name}</h3>
                <p className={`text-sm mb-6 ${tier.featured ? 'text-slate-400' : 'text-slate-500'}`}>{tier.description}</p>

                <div className="mb-8">
                  <span className="text-4xl font-semibold tracking-tight">${tier.price}</span>
                  <span className={`text-sm ml-1 ${tier.featured ? 'text-slate-500' : 'text-slate-400'}`}>/mo</span>
                </div>

                <div className="space-y-3.5 mb-8 flex-1">
                  {tier.features.map((feature, j) => (
                    <div key={j} className="flex items-center gap-2.5">
                      <CheckCircle2 className={`w-4 h-4 shrink-0 ${tier.featured ? 'text-brand-400' : 'text-emerald-500'}`} />
                      <span className="text-sm font-medium">{feature}</span>
                    </div>
                  ))}
                  {tier.notIncluded.map((feature, j) => (
                    <div key={j} className="flex items-center gap-2.5 opacity-30">
                      <Minus className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-medium line-through">{feature}</span>
                    </div>
                  ))}
                </div>

                <Link
                  href={tier.cta === "Contact Sales" ? "/contact" : "/signup"}
                  className={`w-full py-3 rounded-lg text-sm font-medium text-center transition-colors ${
                    tier.featured
                      ? 'bg-brand-600 text-white hover:bg-brand-700'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="w-full py-12 bg-slate-50 border-y border-slate-100">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-5">Trusted by students and researchers at</p>
          <div className="flex flex-wrap justify-center gap-10 text-slate-300">
            {["Oxford", "Stanford", "MIT", "Cambridge", "Harvard"].map((uni) => (
              <span key={uni} className="text-lg font-semibold tracking-tight">{uni}</span>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ-like CTA */}
      <section className="w-full py-20 bg-white">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-semibold text-slate-900 mb-4">Questions?</h2>
          <p className="text-slate-500 mb-8">Need a custom plan or have questions about our pricing? We are happy to help.</p>
          <Link href="/contact" className="bg-brand-600 hover:bg-brand-700 text-white px-7 py-3 rounded-lg text-sm font-medium transition-colors">
            Contact Us
          </Link>
        </div>
      </section>
    </div>
  );
}
