import { Sparkles } from 'lucide-react';
export default function Page() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-32 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-8 shadow-lg shadow-purple-500/30">
        <Sparkles className="text-white w-8 h-8" />
      </div>
      <h1 className="text-4xl md:text-6xl font-bold mb-6 text-slate-900">Coming Soon</h1>
      <p className="text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
        We are building the world's most premium AI text humanization platform. This page is currently being polished for our multi-million dollar launch.
      </p>
    </div>
  );
}

