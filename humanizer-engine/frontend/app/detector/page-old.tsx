'use client';

import { useMemo, useState } from 'react';

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
    <main className="pb-10 pt-10 md:pt-14">
      <div className="app-frame space-y-6">
        <section className="panel hero-panel space-y-3 p-6 md:p-8 lg:p-10">
          <div className="eyebrow">Detector Suite</div>
          <h1 className="hero-title">Measure AI probability across the full detector stack.</h1>
          <p className="hero-copy">Run the existing multi-detector engine and review every detector score in one place.</p>
        </section>

        <section className="panel space-y-4 p-5 md:p-6">
          <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} rows={12} className="field min-h-[18rem] resize-y leading-7" placeholder="Paste text here to analyze..." />

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm font-semibold muted-copy">{words} words • {inputText.length} characters</div>
            <div className="flex gap-3">
              <button onClick={() => { setInputText(''); setResults(null); setMessage(''); }} className="subtle-button px-4 py-3">Clear</button>
              <button onClick={handleAnalyze} disabled={isProcessing} className="primary-button px-5 py-3">
                {isProcessing ? 'Analyzing…' : 'Analyze'}
              </button>
            </div>
          </div>

          {message ? <div className="message-box text-sm font-medium">{message}</div> : null}
        </section>

        {results ? (
          <>
            <section className="grid gap-4 md:grid-cols-4">
              <article className="metric-card"><p className="metric-label">Overall AI</p><p className="metric-value">{Math.round(results.summary.overall_ai_score)}%</p></article>
              <article className="metric-card"><p className="metric-label">Overall Human</p><p className="metric-value">{Math.round(results.summary.overall_human_score)}%</p></article>
              <article className="metric-card"><p className="metric-label">Engines</p><p className="metric-value">{results.summary.total_detectors}</p></article>
              <article className="metric-card"><p className="metric-label">Verdict</p><p className="mt-2 text-xl font-extrabold tracking-[-0.04em]">{results.summary.overall_verdict}</p></article>
            </section>

            <section className="panel overflow-x-auto p-5 md:p-6">
              <table className="score-table w-full min-w-[720px] text-left">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.22em] muted-copy">
                    <th className="py-3 font-bold">Detector</th>
                    <th className="py-3 font-bold">AI score</th>
                    <th className="py-3 font-bold">Human score</th>
                    <th className="py-3 font-bold">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {[...results.detectors].sort((a, b) => b.ai_score - a.ai_score).map((row) => (
                    <tr key={row.detector} className="text-sm">
                      <td className="py-3 font-semibold">{row.detector}</td>
                      <td className="py-3">{Math.round(row.ai_score)}%</td>
                      <td className="py-3">{Math.round(row.human_score)}%</td>
                      <td className="py-3">{row.verdict ?? (row.ai_score >= 50 ? 'AI' : 'Human')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
