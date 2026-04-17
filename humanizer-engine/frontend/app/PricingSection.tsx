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

import { motion, Variants } from 'framer-motion';

const container: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
};

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
      <motion.div 
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-50px" }}
        className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6"
      >
        {plans.map((plan) => (
          <motion.div
            variants={item}
            whileHover={{ y: -5 }}
            key={plan.name}
            className={`relative p-7 sm:p-8 rounded-3xl flex flex-col transition-shadow duration-300 ${
              plan.popular
                ? 'bg-white dark:bg-[#0F0F17] border-2 border-cyan-500 shadow-lg shadow-cyan-500/10 lg:scale-[1.03]'
                : 'bg-white dark:bg-[#0F0F17] border border-slate-200 dark:border-white/10 hover:shadow-xl hover:shadow-white/5'
            }`}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-cyan-600 text-white text-[10px] font-semibold uppercase tracking-wider py-1 px-3 rounded-lg">
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
                  <CheckCircle2 className={`w-4 h-4 shrink-0 ${plan.popular ? 'text-cyan-500' : 'text-emerald-500'}`} />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className={`block w-full text-center text-sm font-medium rounded-2xl py-3 transition-all ${
                plan.popular
                  ? 'bg-cyan-600 hover:bg-cyan-700 text-white hover:shadow-md hover:shadow-cyan-600/25'
                  : 'bg-cyan-600/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-600/20'
              }`}
            >
              Get Started
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
