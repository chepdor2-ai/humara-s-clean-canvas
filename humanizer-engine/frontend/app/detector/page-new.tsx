'use client';

import { useMemo, useState } from 'react';
import { ShieldCheck, AlertTriangle, Zap, Eye, ArrowRight } from 'lucide-react';

type DetectorRow = {
  detector: string;
  ai_score: number;
  human_score: number;
  verdict?: string;
};

type DetectResponse = {
  detectors: DetectorRow[];
  summary: {
    overall_ai_score: number;
    overall_human_score: number;
    overall_verdict: string;
    detectors_flagged_ai: number;
    detectors_flagged_human: number;
    detectors_uncertain: number;
    total_detectors: number;
    word_count: number;
    sentence_count: number;
  };
  error?: string;
};

export default function DetectorPage() {
  const [inputText, setInputText] = useState('');
  const [results, setResults] = useState<DetectResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState('');

  const words = useMemo(() => inputText.trim().split(/\s+/).filter(Boolean).length, [inputText]);

  const handleAnalyze = async () => {
    if (!inputText.trim()) return setMessage('Please enter text to analyze.');
    if (words < 10) return setMessage('Please enter at least 10 words for analysis.');

    setIsProcessing(true);
    setMessage('');
    setResults(null);

    try {
      const response = await fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      });

      const data = (await response.json()) as DetectResponse;
      if (!response.ok || data.error) throw new Error(data.error || 'Detection failed.');
      setResults(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unexpected error.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="pb-10 pt-32 md:pt-40 px-6 max-w-7xl mx-auto relative z-10">
      <div className="space-y-8">
        {/* Header */}
        <section className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-teal-500/20 text-teal-400 font-bold text-[10px] uppercase tracking-[0.2em] mb-6 glow-green">
            <Eye className="w-3.5 h-3.5" /> Free AI Detection
          </div>
          <h1 className="text-5xl md:text-6xl font-bold font-sora text-white mb-6 leading-tight">Multi-Detector <span className="text-gradient">Analysis Suite</span></h1>
          <p className="text-xl text-gray-400 leading-relaxed">Test your text against multiple AI detectors simultaneously. Get comprehensive scores in seconds.</p>
        </section>

        {/* Input Section */}
        <section className="glass-strong border border-white/10 p-8 rounded-2xl space-y-6">
          <textarea 
            value={inputText} 
            onChange={(e) => setInputText(e.target.value)} 
            rows={12} 
            className="w-full bg-black/30 border border-white/10 rounded-xl p-6 text-sm leading-relaxed text-white placeholder:text-gray-600 resize-y focus:outline-none focus:border-indigo-500/50 transition-all min-h-[300px]" 
            placeholder="Paste your text here to analyze for AI detection..." 
          />

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm font-bold text-gray-400">{words} words • {inputText.length} characters</div>
            <div className="flex gap-4">
              <button 
                onClick={() => { setInputText(''); setResults(null); setMessage(''); }} 
                className="px-6 py-3 glass border border-white/10 text-gray-400 text-xs font-bold uppercase tracking-wider rounded-lg hover:text-white hover:border-white/20 transition-all"
              >
                Clear
              </button>
              <button 
                onClick={handleAnalyze} 
                disabled={isProcessing} 
                className="px-8 py-3 bg-gradient-to-r from-teal-600 to-teal-500 text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:from-teal-500 hover:to-cyan-500 transition-all shadow-lg shadow-teal-500/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 hover:scale-105 active:scale-95"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Analyze Text
                  </>
                )}
              </button>
            </div>
          </div>

          {message && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm font-medium text-amber-400 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5" />
              {message}
            </div>
          )}
        </section>

        {/* Results */}
        {results && (
          <>
            {/* Summary Cards */}
            <section className="grid gap-4 md:grid-cols-4">
              <div className="glass-strong border border-white/10 p-6 rounded-xl hover:border-red-500/30 transition-all">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Overall AI Score</p>
                <p className="text-4xl font-bold text-red-400 font-sora">{Math.round(results.summary.overall_ai_score)}%</p>
              </div>
              <div className="glass-strong border border-white/10 p-6 rounded-xl hover:border-teal-500/30 transition-all">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Human Score</p>
                <p className="text-4xl font-bold text-teal-400 font-sora">{Math.round(results.summary.overall_human_score)}%</p>
              </div>
              <div className="glass-strong border border-white/10 p-6 rounded-xl hover:border-indigo-500/30 transition-all">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Detectors Tested</p>
                <p className="text-4xl font-bold text-white font-sora">{results.summary.total_detectors}</p>
              </div>
              <div className="glass-strong border border-white/10 p-6 rounded-xl hover:border-indigo-500/30 transition-all">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Verdict</p>
                <p className={`text-2xl font-bold font-sora ${
                  results.summary.overall_verdict.includes('AI') ? 'text-red-400' : 'text-teal-400'
                }`}>
                  {results.summary.overall_verdict}
                </p>
              </div>
            </section>

            {/* Detector Table */}
            <section className="glass-strong border border-white/10 rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-white/10">
                <h3 className="text-lg font-bold text-white flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-teal-400" />
                  Individual Detector Scores
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-black/30">
                    <tr className="text-xs uppercase tracking-wider text-gray-500">
                      <th className="py-4 px-6 font-bold text-left">Detector</th>
                      <th className="py-4 px-6 font-bold text-right">AI Score</th>
                      <th className="py-4 px-6 font-bold text-right">Human Score</th>
                      <th className="py-4 px-6 font-bold text-center">Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {results.detectors.map((row, idx) => (
                      <tr key={idx} className="hover:bg-white/5 transition-colors">
                        <td className="py-4 px-6 font-bold text-white">{row.detector}</td>
                        <td className="py-4 px-6 text-right">
                          <span className={`font-bold ${row.ai_score > 0.5 ? 'text-red-400' : 'text-gray-400'}`}>
                            {Math.round(row.ai_score * 100)}%
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <span className={`font-bold ${row.human_score > 0.5 ? 'text-teal-400' : 'text-gray-400'}`}>
                            {Math.round(row.human_score * 100)}%
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            row.verdict?.includes('AI') || row.verdict?.includes('Likely AI')
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : row.verdict?.includes('Human') || row.verdict?.includes('Likely Human')
                              ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}>
                            {row.verdict || 'Unknown'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* CTA */}
            {results.summary.overall_ai_score > 0.3 && (
              <section className="glass-strong border border-indigo-500/30 p-8 rounded-2xl text-center">
                <h3 className="text-2xl font-bold text-white mb-4 font-sora">Need to Humanize This Text?</h3>
                <p className="text-gray-400 mb-6 max-w-2xl mx-auto">
                  Your text shows AI characteristics. Use our advanced humanization engine to make it undetectable.
                </p>
                <a 
                  href="/app" 
                  className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:from-indigo-500 hover:to-teal-500 transition-all shadow-lg shadow-indigo-500/50 hover:scale-105 active:scale-95"
                >
                  Open Humanizer
                  <ArrowRight className="w-4 h-4" />
                </a>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
