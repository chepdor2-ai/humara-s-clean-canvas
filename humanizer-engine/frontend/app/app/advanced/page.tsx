import { Sliders, Gauge, FlaskConical, BarChart3 } from 'lucide-react';

export default function AdvancedPage() {
  return (
    <div className="max-w-5xl mx-auto h-full flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold font-sora text-[#5C4033] flex items-center gap-3">
          <FlaskConical className="text-[#8A7263] w-8 h-8" /> Advanced Tools
        </h1>
        <p className="text-[#8A7263] mt-2">Fine-tune engine parameters and run batch operations.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            icon: <Sliders className="w-6 h-6 text-[#D97757]" />,
            title: "Parameter Tuning",
            desc: "Adjust perplexity targets, burstiness curves, and vocabulary diversity.",
          },
          {
            icon: <Gauge className="w-6 h-6 text-[#7A8F6A]" />,
            title: "Batch Processing",
            desc: "Upload multiple documents for bulk humanization with consistent settings.",
          },
          {
            icon: <BarChart3 className="w-6 h-6 text-indigo-500" />,
            title: "Analytics",
            desc: "Track detection scores over time and identify patterns in your writing.",
          },
        ].map((item, i) => (
          <div
            key={i}
            className="bg-white p-8 border border-[#EADDCF] shadow-sm hover:shadow-md hover:border-[#D97757]/30 transition-all"
          >
            <div className="w-12 h-12 bg-[#FFF8F0] flex items-center justify-center mb-6">
              {item.icon}
            </div>
            <h3 className="text-lg font-bold text-[#5C4033] mb-2">{item.title}</h3>
            <p className="text-sm text-[#8A7263] leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#F5EBE1] border border-[#EADDCF] p-8">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#D97757] mb-3">Pro Feature</p>
        <p className="text-[#5C4033] font-medium">
          Advanced tools are available on the Professional and Enterprise plans. Upgrade to unlock batch processing, parameter tuning, and detailed analytics.
        </p>
      </div>
    </div>
  );
}
