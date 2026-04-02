import { CheckCircle2, Minus } from 'lucide-react';
import Link from 'next/link';

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
    <div className="max-w-7xl mx-auto px-6 py-40">
      <div className="text-center max-w-3xl mx-auto mb-32">
        <span className="text-[11px] font-black uppercase tracking-[0.3em] text-[#D97757] mb-8 block">Investment</span>
        <h1 className="text-4xl md:text-6xl font-bold font-sora text-[#5C4033] mb-8 leading-tight">Simple, transparent <br /> scaling.</h1>
        <p className="text-lg text-[#8A7263] leading-relaxed">Choose the plan that matches your writing volume. Upgrade or downgrade at any time.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-1 bg-[#EADDCF] border border-[#EADDCF] max-w-6xl mx-auto shadow-2xl shadow-[#5C4033]/10">
        {tiers.map((tier, i) => (
          <div key={i} className={`p-12 flex flex-col transition-all duration-500 ${tier.featured ? 'bg-[#5C4033] text-white scale-[1.02] relative z-10 shadow-2xl' : 'bg-white text-[#5C4033] hover:bg-[#FFF8F0]'}`}>
            <h3 className={`text-[11px] font-black uppercase tracking-[0.2em] mb-4 ${tier.featured ? 'text-[#D97757]' : 'text-[#8A7263]'}`}>{tier.name}</h3>
            <p className={`text-sm mb-10 font-medium ${tier.featured ? 'text-white/60' : 'text-[#8A7263]'}`}>{tier.description}</p>
            
            <div className="mb-12">
              <span className="text-5xl font-bold font-sora tracking-tight">${tier.price}</span>
              <span className={`text-[11px] font-black uppercase tracking-widest ml-2 ${tier.featured ? 'text-white/40' : 'text-[#8A7263]/40'}`}>/ mo</span>
            </div>

            <div className="space-y-5 mb-16 flex-1">
              {tier.features.map((feature, j) => (
                <div key={j} className="flex items-center gap-3">
                  <CheckCircle2 className={`w-3.5 h-3.5 ${tier.featured ? 'text-[#D97757]' : 'text-[#7A8F6A]'}`} />
                  <span className="text-[13px] font-bold tracking-tight">{feature}</span>
                </div>
              ))}
              {tier.notIncluded.map((feature, j) => (
                <div key={j} className="flex items-center gap-3 opacity-30">
                  <Minus className="w-3.5 h-3.5" />
                  <span className="text-[13px] font-bold tracking-tight line-through">{feature}</span>
                </div>
              ))}
            </div>

            <Link 
              href={tier.cta === "Contact Sales" ? "/contact" : "/signup"} 
              className={`w-full py-5 text-[12px] font-black uppercase tracking-[0.2em] text-center transition-all ${
                tier.featured 
                ? 'bg-[#D97757] text-white hover:bg-[#C96342]' 
                : 'bg-[#5C4033] text-white hover:bg-[#D97757]'
              }`}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-32 text-center">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#8A7263]/60 mb-8 italic">Trusted by students and researchers at</p>
        <div className="flex flex-wrap justify-center gap-16 opacity-30 grayscale contrast-125">
           {["Oxford", "Stanford", "MIT", "Cambridge", "Harvard"].map((uni) => (
             <span key={uni} className="text-xl font-bold font-sora tracking-tighter uppercase">{uni}</span>
           ))}
        </div>
      </div>
    </div>
  );
}
