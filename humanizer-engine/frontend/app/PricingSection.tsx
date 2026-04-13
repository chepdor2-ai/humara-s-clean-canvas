'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

const plans = [
  {
    name: 'Starter',
    desc: 'For light usage',
    monthly: 5,
    yearly: 48,
    features: ['10,000 words/day', 'All 3 models (Humara 2.0, 2.1, 2.2)', 'All strength & tone modes', 'Email support'],
    popular: false,
  },
  {
    name: 'Creator',
    desc: 'For content creators',
    monthly: 10,
    yearly: 96,
    features: ['20,000 words/day', 'All 3 models (Humara 2.0, 2.1, 2.2)', 'All strength & tone modes', 'Style profiles', 'Priority support'],
    popular: true,
  },
  {
    name: 'Professional',
    desc: 'For power users & teams',
    monthly: 20,
    yearly: 192,
    features: ['40,000 words/day', 'All 3 models (Humara 2.0, 2.1, 2.2)', 'All strength & tone modes', 'API access', 'Custom style profiles', 'Dedicated manager'],
    popular: false,
  },
];

export default function PricingSection() {
  const [isYearly, setIsYearly] = useState(false);

  return (
    <div>
      {/* Toggle */}
      <div className="flex justify-center mb-12">
        <div className="bg-slate-100 dark:bg-white/5 p-1 rounded-full flex items-center">
          <button
            onClick={() => setIsYearly(false)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              !isYearly
                ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-300'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setIsYearly(true)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              isYearly
                ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-300'
            }`}
          >
            Yearly <span className="text-emerald-500 text-xs ml-1">-15%</span>
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative p-7 sm:p-8 rounded-3xl flex flex-col transition-all duration-300 ${
              plan.popular
                ? 'bg-white dark:bg-[#0F0F17] border-2 border-purple-500 shadow-lg shadow-purple-500/10 scale-[1.03] lg:scale-105'
                : 'bg-white dark:bg-[#0F0F17] border border-slate-200 dark:border-white/10'
            }`}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-[10px] font-semibold uppercase tracking-wider py-1 px-3 rounded-lg">
                Popular
              </span>
            )}
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{plan.name}</h3>
            <p className="text-xs text-gray-500 mt-1 mb-6">{plan.desc}</p>
            <p className="mb-8">
              <span className="text-5xl sm:text-6xl font-bold text-slate-900 dark:text-white">
                ${isYearly ? Math.round(plan.yearly / 12) : plan.monthly}
              </span>
              <span className="text-sm text-gray-500 font-normal ml-1">/mo</span>
            </p>
            {isYearly && (
              <p className="text-xs text-emerald-500 -mt-6 mb-6">
                ${plan.yearly}/yr — save ${plan.monthly * 12 - plan.yearly}
              </p>
            )}
            <ul className="space-y-3 mb-8 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-slate-600 dark:text-gray-300">
                  <CheckCircle2 className={`w-4 h-4 shrink-0 ${plan.popular ? 'text-purple-500' : 'text-emerald-500'}`} />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className={`block w-full text-center text-sm font-medium rounded-2xl py-3 transition-all ${
                plan.popular
                  ? 'bg-purple-600 hover:bg-purple-700 text-white hover:shadow-md hover:shadow-purple-600/25'
                  : 'bg-purple-600/10 text-purple-400 border border-purple-500/30 hover:bg-purple-600/20'
              }`}
            >
              Get Started
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
