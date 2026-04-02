'use client';

import { useMemo, useState } from 'react';

type HumanizeResponse = {
  humanized?: string;
  engine_used?: string;
  output_detector_results?: Record<string, number>;
  error?: string;
};

const detectorCards = [
  { key: 'gptzero', label: 'GPTZero' },
  { key: 'turnitin', label: 'Turnitin' },
  { key: 'originality', label: 'Originality' },
  { key: 'winston', label: 'Winston AI' },
  { key: 'copyleaks', label: 'Copyleaks' },
] as const;

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [engine, setEngine] = useState('ghost_pro');
  const [strength, setStrength] = useState('balanced');
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [scores, setScores] = useState<Record<string, number | string | null>>({
    gptzero: null,
    turnitin: null,
    originality: null,
    winston: null,
    copyleaks: null,
    overall: null,
    engine_used: '--',
  });

  const inputWords = useMemo(() => inputText.trim().split(/\s+/).filter(Boolean).length, [inputText]);
  const outputWords = useMemo(() => outputText.trim().split(/\s+/).filter(Boolean).length, [outputText]);

  const handleHumanize = async () => {
    if (!inputText.trim()) return setMessage('Please enter text to humanize.');
    if (inputWords < 10) return setMessage('Please enter at least 10 words.');

    setIsProcessing(true);
    setMessage('');

    try {
      const response = await fetch('/api/humanize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          engine,
          strength,
          preserve_sentences: true,
          strict_meaning: true,
          no_contractions: true,
          tone: 'neutral',
          enable_post_processing: true,
        }),
      });

      const data = (await response.json()) as HumanizeResponse;
      if (!response.ok || data.error) throw new Error(data.error || 'Humanization failed.');

      setOutputText(data.humanized || '');
      setScores({
        gptzero: data.output_detector_results?.gptzero ?? null,
        turnitin: data.output_detector_results?.turnitin ?? null,
        originality: data.output_detector_results?.originality ?? null,
        winston: data.output_detector_results?.winston ?? null,
        copyleaks: data.output_detector_results?.copyleaks ?? null,
        overall: data.output_detector_results?.overall ?? null,
        engine_used: data.engine_used ?? engine,
      });
      setMessage('Text humanized successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unexpected error.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="pt-24 pb-10">
      <div className="w-[92%] max-w-7xl mx-auto space-y-6">
        <section className="glass rounded-2xl p-6 md:p-8 shadow-lg">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center rounded-full border border-orange-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-gray-600">
              Humara Engine
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight text-gray-900">Humara AI Humanizer</h1>
            <p className="text-sm md:text-base text-gray-600 leading-relaxed">
              Humanize AI-written text using your existing engines, then review the detector impact instantly.
            </p>
          </div>
        </section>

        <section className="glass rounded-2xl p-5 md:p-6 shadow-lg space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-gray-500">Engine</label>
              <select value={engine} onChange={(e) => setEngine(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-900 outline-none">
                <option value="ghost_mini">Ghost Mini</option>
                <option value="ghost_pro">Ghost Pro</option>
                <option value="ninja">Ninja</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-gray-500">Strength</label>
              <select value={strength} onChange={(e) => setStrength(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-900 outline-none">
                <option value="light">Light</option>
                <option value="balanced">Balanced</option>
                <option value="deep">Deep</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-gray-500">Status</label>
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-900">
                {isProcessing ? 'Processing…' : 'Ready'}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-[0.22em] text-gray-500">Original text</label>
                <button onClick={() => { setInputText(''); setOutputText(''); setMessage(''); }} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700">Clear</button>
              </div>
              <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} rows={14} className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-sm leading-6 text-gray-900 outline-none" placeholder="Paste AI-generated text here..." />
              <p className="text-xs font-semibold text-gray-500">{inputWords} words • {inputText.length} characters</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-[0.22em] text-gray-500">Humanized output</label>
                <button
                  onClick={async () => {
                    if (!outputText) return;
                    await navigator.clipboard.writeText(outputText);
                    setMessage('Output copied to clipboard.');
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700"
                >
                  Copy
                </button>
              </div>
              <textarea value={outputText} readOnly rows={14} className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-sm leading-6 text-gray-900 outline-none" placeholder="Humanized text will appear here..." />
              <p className="text-xs font-semibold text-gray-500">{outputWords} words • {outputText.length} characters</p>
            </div>
          </div>

          <div className="space-y-3">
            <button onClick={handleHumanize} disabled={isProcessing} className="gradient-orange w-full rounded-2xl px-5 py-3 text-sm font-black uppercase tracking-[0.22em] text-white shadow-md disabled:opacity-60">
              {isProcessing ? 'Processing…' : 'Humanize text'}
            </button>
            {message ? <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700">{message}</div> : null}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {detectorCards.map((item) => (
            <article key={item.key} className="glass rounded-2xl p-4 text-center shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-gray-500">{item.label}</p>
              <p className="mt-2 text-2xl font-black text-gray-900">{typeof scores[item.key] === 'number' ? `${Math.round(scores[item.key] as number)}%` : '--'}</p>
            </article>
          ))}
          <article className="glass rounded-2xl p-4 text-center shadow-sm md:col-span-2 xl:col-span-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-gray-500">Overall</p>
            <p className="mt-2 text-2xl font-black text-gray-900">{typeof scores.overall === 'number' ? `${Math.round(scores.overall as number)}%` : '--'}</p>
            <p className="mt-2 text-xs font-semibold text-gray-500">Engine: {String(scores.engine_used ?? '--')}</p>
          </article>
        </section>
      </div>
    </main>
  );
}
