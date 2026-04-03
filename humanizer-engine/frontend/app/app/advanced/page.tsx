import { Sliders, Gauge, FlaskConical, BarChart3 } from 'lucide-react';

export default function AdvancedPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <FlaskConical className="text-brand-600 w-8 h-8" /> Advanced Tools
        </h1>
        <p className="text-gray-600">Fine-tune engine parameters and run batch operations.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {[
          {
            icon: <Sliders className="w-6 h-6 text-brand-600" />,
            title: "Parameter Tuning",
            desc: "Adjust perplexity targets, burstiness curves, and vocabulary diversity.",
          },
          {
            icon: <Gauge className="w-6 h-6 text-green-600" />,
            title: "Batch Processing",
            desc: "Upload multiple documents to rewrite them at once with the same settings.",
          },
          {
            icon: <BarChart3 className="w-6 h-6 text-indigo-600" />,
            title: "Analytics",
            desc: "Track detection scores over time and identify patterns in your writing.",
          },
        ].map((item, i) => (
          <div
            key={i}
            className="bg-white p-6 border border-gray-200 rounded-lg hover:shadow-md transition-all"
          >
            <div className="w-12 h-12 bg-brand-50 flex items-center justify-center mb-4 rounded-lg">
              {item.icon}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-brand-50 border border-brand-200 rounded-lg p-6">
        <p className="text-xs font-medium text-brand-600 mb-2">Pro Feature</p>
        <p className="text-gray-900">
          Advanced tools are available on the Professional and Enterprise plans. Upgrade to unlock batch processing, parameter tuning, and detailed analytics.
        </p>
      </div>
    </div>
  );
}

