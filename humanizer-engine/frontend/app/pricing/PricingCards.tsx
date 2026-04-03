'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const KSH_RATE = 125; // $1 = 125 KSH

const TIERS = [
  {
    name: 'Starter',
    monthly: 5,
    yearly: 4.25,
    description: 'For casual users and light writing.',
    features: ['20,000 words/day (Fast & Standard)', '10,000 words/day (Stealth)', 'Basic AI Detection', '30 Day Access', 'Email Support'],
    cta: 'Get Started',
    featured: false,
    color: '#64748b',
  },
  {
    name: 'Creator',
    monthly: 10,
    yearly: 8.50,
    description: 'For students and content creators.',
    features: ['40,000 words/day (Fast & Standard)', '20,000 words/day (Stealth)', 'Full Detector Suite', 'Style Memory (3 slots)', 'Priority Support'],
    cta: 'Get Started',
    featured: true,
    color: '#6366f1',
  },
  {
    name: 'Professional',
    monthly: 20,
    yearly: 17,
    description: 'For power users and agencies.',
    features: ['80,000 words/day (Fast & Standard)', '40,000 words/day (Stealth)', 'All Engine Modes', 'Style Memory (5 slots)', 'API Access', 'Priority Support'],
    cta: 'Get Started',
    featured: false,
    color: '#10b981',
  },
  {
    name: 'Business',
    monthly: 35,
    yearly: 29.75,
    description: 'For teams and enterprise.',
    features: ['150,000 words/day (Fast & Standard)', '75,000 words/day (Stealth)', 'All Engine Modes', 'Unlimited Style Profiles', 'Full API Access', 'Dedicated Manager'],
    cta: 'Get Started',
    featured: false,
    color: '#f59e0b',
  },
];

export default function PricingCards() {
  const [yearly, setYearly] = useState(false);
  const [currency, setCurrency] = useState<'USD' | 'KES'>('USD');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const formatPrice = (usdPrice: number) => {
    if (currency === 'KES') {
      const ksh = usdPrice * KSH_RATE;
      return `KSh ${ksh.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    return `$${usdPrice.toFixed(usdPrice % 1 === 0 ? 0 : 2)}`;
  };

  const handleCheckout = async (tierName: string) => {
    setLoadingPlan(tierName);
    try {
      // Get user email from session, or prompt
      let email = '';
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        email = session.user.email;
      } else {
        const input = prompt('Enter your email to continue to payment:');
        if (!input) { setLoadingPlan(null); return; }
        email = input.trim();
      }

      const res = await fetch('/api/paystack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          plan: tierName.toLowerCase(),
          currency,
          billing: yearly ? 'yearly' : 'monthly',
        }),
      });
      const data = await res.json();
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        alert(data.error || 'Payment initialization failed. Please try again.');
      }
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <section className="w-full py-16 bg-white dark:bg-zinc-950">
      <div className="max-w-6xl mx-auto px-6">
        {/* Billing toggle + Currency selector */}
        <div className="flex flex-col items-center gap-4 mb-12">
          <div className="flex items-center gap-3">
            <span className={`text-sm font-medium ${!yearly ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>Monthly</span>
            <button onClick={() => setYearly(!yearly)}
              className={`relative w-12 h-6 rounded-full transition-colors ${yearly ? 'bg-brand-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${yearly ? 'left-7' : 'left-1'}`} />
            </button>
            <span className={`text-sm font-medium ${yearly ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>Yearly</span>
            {yearly && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full">Save 15%</span>}
          </div>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => setCurrency('USD')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${currency === 'USD' ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700'}`}
            >
              USD ($)
            </button>
            <button
              onClick={() => setCurrency('KES')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${currency === 'KES' ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700'}`}
            >
              KSh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {TIERS.map((tier, i) => {
            const price = yearly ? tier.yearly : tier.monthly;
            return (
              <div key={i} className={`rounded-xl border p-7 flex flex-col transition-all duration-300 relative overflow-hidden ${
                tier.featured
                  ? 'bg-slate-900 dark:bg-zinc-800 text-white border-slate-800 dark:border-zinc-700 shadow-xl scale-[1.02]'
                  : 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white border-slate-200 dark:border-zinc-700 hover:border-brand-200 hover:shadow-md'
              }`}>
                {/* Color line on top */}
                <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ backgroundColor: tier.color }} />
                {tier.featured && (
                  <span className="absolute -top-2.5 left-6 bg-brand-600 text-white text-[10px] font-semibold uppercase tracking-wider py-1 px-2.5 rounded-full">Popular</span>
                )}
                <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${tier.featured ? 'text-brand-400' : 'text-slate-400'}`}>{tier.name}</h3>
                <p className={`text-sm mb-5 ${tier.featured ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>{tier.description}</p>

                <div className="mb-6">
                  <span className="text-4xl font-semibold tracking-tight">{formatPrice(price)}</span>
                  <span className={`text-sm ml-1 ${tier.featured ? 'text-slate-500' : 'text-slate-400'}`}>/mo</span>
                  {yearly && <span className="block text-[11px] text-slate-400 mt-0.5">billed {formatPrice(price * 12)}/year</span>}
                </div>

                <div className="space-y-3 mb-7 flex-1">
                  {tier.features.map((feature, j) => (
                    <div key={j} className="flex items-center gap-2.5">
                      <CheckCircle2 className={`w-4 h-4 shrink-0 ${tier.featured ? 'text-brand-400' : 'text-emerald-500'}`} />
                      <span className="text-sm font-medium">{feature}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => handleCheckout(tier.name)}
                  disabled={loadingPlan === tier.name}
                  className={`w-full py-3 rounded-lg text-sm font-medium text-center transition-colors disabled:opacity-60 ${
                    tier.featured
                      ? 'bg-brand-600 text-white hover:bg-brand-700'
                      : 'bg-white dark:bg-zinc-800 text-slate-700 dark:text-white border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-700'
                  }`}
                >
                  {loadingPlan === tier.name ? 'Processing...' : tier.cta}
                </button>
              </div>
            );
          })}
        </div>

        {/* Custom plan */}
        <div className="mt-8 p-6 bg-slate-50 dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-700 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Need a custom package?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Custom word limits, SLA, dedicated support, and tailored integrations.</p>
          </div>
          <Link href="/contact" className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors whitespace-nowrap">
            Contact Sales
          </Link>
        </div>
      </div>
    </section>
  );
}
