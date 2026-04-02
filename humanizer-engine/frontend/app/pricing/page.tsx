import { CheckCircle2, Minus, Sparkles, Zap } from 'lucide-react';
import Link from 'next/link';

export default function PricingPage() {
  const tiers = [
    {
      name: "Starter",
      price: "0",
      description: "Perfect for trying out Humara.",
      features: ["500 Words Free", "Ghost Mini Engine", "Basic Humanization", "Community Support"],
      notIncluded: ["AI Detection Reports", "Style Memory", "API Access"],
      cta: "Start Free",
      featured: false
    },
    {
      name: "Professional",
      price: "15",
      description: "For students and content creators.",
      features: ["50,000 Words/month", "All Neural Engines", "Live AI Detection", "Style Memory (3 profiles)", "Priority Support"],
      notIncluded: ["Unlimited Processing", "API Access"],
      cta: "Start Pro Trial",
      featured: true
    },
    {
      name: "Enterprise",
      price: "49",
      description: "For teams and power users.",
      features: ["Unlimited Words", "Advanced Stealth Modes", "Full Style Library", "API Access", "Dedicated Support"],
      notIncluded: [],
      cta: "Contact Sales",
      featured: false
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-40 relative z-10">
      <div className="text-center max-w-3xl mx-auto mb-24">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400 mb-6 block">Pricing Plans</span>
        <h1 className="text-5xl md:text-6xl font-bold font-sora text-white mb-8 leading-tight">Simple, Transparent <br /> <span className="text-gradient">Pricing</span></h1>
        <p className="text-xl text-gray-400 leading-relaxed">Choose the plan that fits your needs. Upgrade or downgrade anytime with no commitments.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {tiers.map((tier, i) => (
          <div key={i} className={`p-10 flex flex-col transition-all duration-500 rounded-2xl relative overflow-hidden ${
            tier.featured 
              ? 'glass-strong border-2 border-indigo-500 scale-105 shadow-2xl shadow-indigo-500/20 glow' 
              : 'glass border border-white/10 hover:border-white/20'
          }`}>
            {tier.featured && (
              <div className="absolute top-0 right-0 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white text-[10px] font-bold uppercase tracking-wider px-4 py-2 rounded-bl-xl flex items-center gap-2">
                <Sparkles className="w-3 h-3" /> Most Popular
              </div>
            )}
            
            <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ${tier.featured ? 'text-indigo-400' : 'text-gray-500'}`}>{tier.name}</h3>
            <p className="text-sm mb-8 text-gray-400 font-medium">{tier.description}</p>
            
            <div className="mb-10">
              <span className="text-6xl font-bold font-sora tracking-tight text-white">${tier.price}</span>
              <span className="text-xs font-bold uppercase tracking-wider ml-2 text-gray-500">/ month</span>
            </div>

            <div className="space-y-4 mb-12 flex-1">
              {tier.features.map((feature, j) => (
                <div key={j} className="flex items-center gap-3 text-white">
                  <CheckCircle2 className={`w-4 h-4 ${tier.featured ? 'text-indigo-400' : 'text-teal-400'}`} />
                  <span className="text-sm font-medium">{feature}</span>
                </div>
              ))}
              {tier.notIncluded.map((feature, j) => (
                <div key={j} className="flex items-center gap-3 opacity-30">
                  <Minus className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-600 line-through">{feature}</span>
                </div>
              ))}
            </div>

            <Link 
              href={tier.cta === "Contact Sales" ? "/contact" : "/signup"} 
              className={`w-full py-4 text-xs font-bold uppercase tracking-wider text-center transition-all rounded-lg ${
                tier.featured 
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white hover:from-indigo-500 hover:to-teal-500 shadow-lg shadow-indigo-500/50 hover:scale-105 active:scale-95' 
                  : 'glass border border-white/10 text-white hover:bg-white/10 hover:scale-105 active:scale-95'
              }`}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-32 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-12">Used by students at top universities worldwide</p>
        <div className="flex flex-wrap justify-center gap-16 opacity-40">
           {["Oxford", "Stanford", "MIT", "Cambridge", "Harvard"].map((uni) => (
             <span key={uni} className="text-2xl font-bold font-sora text-gray-600 hover:text-white transition-colors">{uni}</span>
           ))}
        </div>
      </div>
      
      <div className="mt-32 max-w-4xl mx-auto glass-strong border border-white/10 p-12 rounded-2xl text-center">
        <h3 className="text-3xl font-bold text-white mb-4 font-sora">Need a Custom Plan?</h3>
        <p className="text-gray-400 mb-8 max-w-2xl mx-auto">For universities, institutions, or high-volume users, we offer custom pricing and dedicated support.</p>
        <Link href="/contact" className="inline-flex px-8 py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:from-indigo-500 hover:to-teal-500 transition-all shadow-lg shadow-indigo-500/50 hover:scale-105 active:scale-95">
          Contact Our Team
        </Link>
      </div>
    </div>
  );
}
