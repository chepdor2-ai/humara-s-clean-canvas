'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Zap, Code2, Building2, Crown, ArrowRight, Shield, Globe, Clock, BarChart3 } from 'lucide-react';

const KSH_RATE = 125;

const API_TIERS = [
  {
    name: 'Hobby',
    monthly: 9,
    yearly: 7.65,
    description: 'For side projects and prototyping.',
    icon: Zap,
    color: '#6366f1',
    features: [
      '50,000 words/month',
      '100 requests/day',
      '2 engines (Humara 2.0, 2.2)',
      '10 req/min rate limit',
      'Community support',
      'Standard latency',
    ],
    cta: 'Start Building',
    featured: false,
  },
  {
    name: 'Developer',
    monthly: 29,
    yearly: 24.65,
    description: 'For apps and SaaS products.',
    icon: Code2,
    color: '#8b5cf6',
    features: [
      '250,000 words/month',
      '1,000 requests/day',
      'All 6 engines',
      '30 req/min rate limit',
      'Email support',
      'Faster latency',
      'Webhook callbacks',
      'Batch processing',
    ],
    cta: 'Start Building',
    featured: true,
  },
  {
    name: 'Business',
    monthly: 79,
    yearly: 67.15,
    description: 'For teams and high-volume apps.',
    icon: Building2,
    color: '#a855f7',
    features: [
      '1,000,000 words/month',
      '5,000 requests/day',
      'All 7 engines + priority',
      '60 req/min rate limit',
      'Priority support (24h)',
      'Lowest latency',
      'Webhook callbacks',
      'Batch processing',
      'Custom tone profiles',
      'Usage analytics API',
    ],
    cta: 'Start Building',
    featured: false,
  },
  {
    name: 'Enterprise',
    monthly: 199,
    yearly: 169.15,
    description: 'For large-scale deployments.',
    icon: Crown,
    color: '#d946ef',
    features: [
      '5,000,000 words/month',
      'Unlimited requests',
      'All engines + dedicated',
      '120 req/min rate limit',
      'Dedicated support + SLA',
      'Priority queue',
      'Custom model fine-tuning',
      '99.9% uptime SLA',
      'SSO integration',
      'Dedicated account manager',
    ],
    cta: 'Contact Sales',
    featured: false,
  },
];

const ENGINE_DETAILS = [
  { id: 'oxygen', name: 'Humara 2.0', desc: 'GPTZero killer — AntiGPTZero mode with adaptive chain processing', tier: 'Hobby+' },
  { id: 'ozone', name: 'Humara 2.1', desc: 'ZeroGPT/Surfer SEO cleaner — optimized for content marketing', tier: 'Developer+' },
  { id: 'easy', name: 'Humara 2.2', desc: 'Broad-spectrum general-purpose with multi-engine fusion', tier: 'Hobby+' },
  { id: 'oxygen3', name: 'Humara 3.0', desc: 'Fine-tuned on 270K pairs — sentence-independent processing', tier: 'Developer+' },
  { id: 'humara_v3_3', name: 'Humara 2.4', desc: 'Strongest GPTZero killer — triple fallback + detector feedback', tier: 'Business+' },
  { id: 'nuru_v2', name: 'Nuru 2.0', desc: 'Deep sentence restructuring — 40%+ structural change rate', tier: 'Developer+' },
  { id: 'ghost_pro_wiki', name: 'Wikipedia', desc: 'Encyclopedic neutral POV — optimized for NPOV content', tier: 'Developer+' },
];

export default function ApiPricingPage() {
  const [yearly, setYearly] = useState(false);
  const [currency, setCurrency] = useState<'USD' | 'KES'>('USD');

  const formatPrice = (usdPrice: number) => {
    if (currency === 'KES') {
      const ksh = usdPrice * KSH_RATE;
      return `KSh ${ksh.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    return `$${usdPrice.toFixed(usdPrice % 1 === 0 ? 0 : 2)}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#05050A]">
      {/* Hero */}
      <section className="relative overflow-hidden py-20 lg:py-28">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-950/20 via-transparent to-transparent" />
        <div className="max-w-5xl mx-auto px-6 text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-purple-950/40 border border-purple-800/40 text-purple-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <Code2 className="w-3.5 h-3.5" /> API Access
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
            Humanize AI Text at Scale
          </h1>
          <p className="text-lg text-slate-500 dark:text-zinc-400 max-w-2xl mx-auto mb-8">
            Integrate HumaraGPT into your applications with our REST API. Simple pricing, powerful engines, zero complexity.
          </p>

          {/* Trust badges */}
          <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-500 dark:text-zinc-500 mb-12">
            <span className="flex items-center gap-1.5"><Shield className="w-4 h-4 text-emerald-500" /> SHA-256 key hashing</span>
            <span className="flex items-center gap-1.5"><Globe className="w-4 h-4 text-blue-500" /> Global CDN</span>
            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-amber-500" /> &lt;2s avg response</span>
            <span className="flex items-center gap-1.5"><BarChart3 className="w-4 h-4 text-purple-500" /> Real-time analytics</span>
          </div>

          {/* Billing toggle */}
          <div className="flex flex-col items-center gap-4 mb-12">
            <div className="flex items-center gap-3">
              <span className={`text-sm font-medium ${!yearly ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-zinc-400'}`}>Monthly</span>
              <button onClick={() => setYearly(!yearly)} className={`relative w-12 h-6 rounded-full transition-colors ${yearly ? 'bg-purple-600' : 'bg-zinc-700'}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${yearly ? 'left-7' : 'left-1'}`} />
              </button>
              <span className={`text-sm font-medium ${yearly ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-zinc-400'}`}>Yearly</span>
              {yearly && <span className="text-xs font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded-full">Save 15%</span>}
            </div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800 rounded-lg p-0.5">
              <button onClick={() => setCurrency('USD')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${currency === 'USD' ? 'bg-zinc-700 text-white shadow-sm' : 'text-slate-500 dark:text-zinc-400'}`}>USD ($)</button>
              <button onClick={() => setCurrency('KES')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${currency === 'KES' ? 'bg-zinc-700 text-white shadow-sm' : 'text-slate-500 dark:text-zinc-400'}`}>KSh</button>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="max-w-7xl mx-auto px-6 -mt-8 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {API_TIERS.map((tier) => {
            const price = yearly ? tier.yearly : tier.monthly;
            const Icon = tier.icon;
            return (
              <div key={tier.name} className={`rounded-2xl p-6 flex flex-col relative ${tier.featured ? 'bg-slate-100 dark:bg-zinc-800 shadow-2xl shadow-purple-500/15 ring-2 ring-purple-500/30 scale-[1.02]' : 'bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700/60'}`}>
                <div className="absolute top-0 left-4 right-4 h-[2px] rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${tier.color}, transparent)` }} />
                {tier.featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-600 to-purple-500 text-white text-[10px] font-bold uppercase tracking-wider py-1 px-3 rounded-full shadow-lg">Most Popular</span>
                )}

                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-5 h-5" style={{ color: tier.color }} />
                  <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: tier.color }}>{tier.name}</h3>
                </div>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mb-4">{tier.description}</p>

                <div className="mb-5">
                  <span className="text-3xl font-bold text-slate-900 dark:text-white">{formatPrice(price)}</span>
                  <span className="text-sm text-slate-500 dark:text-zinc-400 ml-1">/mo</span>
                  {yearly && <span className="block text-xs text-slate-500 dark:text-zinc-500 mt-0.5">billed {formatPrice(price * 12)}/year</span>}
                </div>

                <div className="space-y-2.5 mb-6 flex-1">
                  {tier.features.map((f, j) => (
                    <div key={j} className="flex items-start gap-2">
                      <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${tier.featured ? 'text-purple-400' : 'text-emerald-500'}`} />
                      <span className="text-sm text-slate-700 dark:text-zinc-300">{f}</span>
                    </div>
                  ))}
                </div>

                {tier.name === 'Enterprise' ? (
                  <Link href="/contact" className="w-full py-3 rounded-xl text-sm font-semibold text-center bg-purple-600/10 text-purple-400 border border-purple-500/30 hover:bg-purple-600/20 transition-all block">
                    {tier.cta}
                  </Link>
                ) : (
                  <Link href="/app/settings" className={`w-full py-3 rounded-xl text-sm font-semibold text-center transition-all block ${tier.featured ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white hover:from-purple-700 hover:to-purple-600 shadow-lg shadow-purple-500/25' : 'bg-purple-600/10 text-purple-400 border border-purple-500/30 hover:bg-purple-600/20'}`}>
                    {tier.cta} <ArrowRight className="w-3.5 h-3.5 inline ml-1" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Available Engines */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white text-center mb-3">Available Engines</h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 text-center mb-10">Each engine is optimized for different use cases. Higher plans unlock more engines.</p>

        <div className="grid gap-3">
          {ENGINE_DETAILS.map((e) => (
            <div key={e.id} className="flex items-center gap-4 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm text-slate-900 dark:text-white">{e.name}</span>
                  <code className="text-xs text-slate-500 dark:text-zinc-500 font-mono bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{e.id}</code>
                  <span className="text-[10px] font-bold text-purple-400 bg-purple-950/40 px-2 py-0.5 rounded-full">{e.tier}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400">{e.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Start */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white text-center mb-10">Get Started in 60 Seconds</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { step: '1', title: 'Get API Key', desc: 'Sign up and generate your API key from Settings → API Keys.' },
            { step: '2', title: 'Make a Request', desc: 'Send a POST request to /api/v1/humanize with your text.' },
            { step: '3', title: 'Get Results', desc: 'Receive humanized text with AI scores and usage metadata.' },
          ].map((s) => (
            <div key={s.step} className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 text-center">
              <div className="w-10 h-10 mx-auto mb-4 rounded-full bg-purple-950/50 text-purple-400 flex items-center justify-center text-lg font-bold">{s.step}</div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{s.title}</h3>
              <p className="text-sm text-slate-500 dark:text-zinc-400">{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50 border-b border-slate-800">
            <span className="text-xs text-slate-500 font-mono">cURL</span>
          </div>
          <pre className="p-4 text-sm text-slate-300 font-mono overflow-x-auto leading-relaxed">{`curl -X POST https://humaragpt.com/api/v1/humanize \\
  -H "Authorization: Bearer hum_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Your AI-generated text here",
    "engine": "oxygen",
    "strength": "medium",
    "tone": "academic"
  }'`}</pre>
        </div>

        <div className="text-center mt-10">
          <Link href="/app/docs" className="inline-flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-purple-700 transition-colors shadow-lg shadow-purple-500/25">
            View Full Documentation <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
