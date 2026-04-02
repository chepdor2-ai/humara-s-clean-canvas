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
    <main className="pb-10 pt-10 md:pt-14">
      <div className="app-frame space-y-6">
        <section className="panel hero-panel p-6 md:p-8 lg:p-10">
          <div className="max-w-3xl space-y-3">
            <div className="eyebrow">Humara Engine</div>
            <h1 className="hero-title">Rewritten for human flow, built on your existing engine.</h1>
            <p className="hero-copy">
              Humanize AI-written text using your existing engines, then review the detector impact instantly.
            </p>
          </div>
        </section>

        <section className="panel p-5 md:p-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="field-label">Engine</label>
              <select value={engine} onChange={(e) => setEngine(e.target.value)} className="field">
                <option value="ghost_mini">Ghost Mini</option>
                <option value="ghost_pro">Ghost Pro</option>
                <option value="ninja">Ninja</option>
              </select>
            </div>
            <div>
              <label className="field-label">Strength</label>
              <select value={strength} onChange={(e) => setStrength(e.target.value)} className="field">
                <option value="light">Light</option>
                <option value="balanced">Balanced</option>
                <option value="deep">Deep</option>
              </select>
            </div>
            <div>
              <label className="field-label">Status</label>
              <div className="status-chip">
                {isProcessing ? 'Processing…' : 'Ready'}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="field-label">Original text</label>
                <button onClick={() => { setInputText(''); setOutputText(''); setMessage(''); }} className="subtle-button px-3 py-2 text-[0.7rem]">Clear</button>
              </div>
               <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} rows={14} className="field min-h-[21rem] resize-y leading-7" placeholder="Paste AI-generated text here..." />
              <p className="text-xs font-semibold muted-copy">{inputWords} words • {inputText.length} characters</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="field-label">Humanized output</label>
                <button
                  onClick={async () => {
                    if (!outputText) return;
                    await navigator.clipboard.writeText(outputText);
                    setMessage('Output copied to clipboard.');
                  }}
                  className="subtle-button px-3 py-2 text-[0.7rem]"
                >
                  Copy
                </button>
              </div>
              <textarea value={outputText} readOnly rows={14} className="field min-h-[21rem] resize-y leading-7" placeholder="Humanized text will appear here..." />
              <p className="text-xs font-semibold muted-copy">{outputWords} words • {outputText.length} characters</p>
            </div>
          </div>

          <div className="space-y-3">
            <button onClick={handleHumanize} disabled={isProcessing} className="primary-button w-full px-5 py-4">
              {isProcessing ? 'Processing…' : 'Humanize text'}
            </button>
            {message ? <div className="message-box text-sm font-medium">{message}</div> : null}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {detectorCards.map((item) => (
            <article key={item.key} className="metric-card text-center">
              <p className="metric-label">{item.label}</p>
              <p className="metric-value">{typeof scores[item.key] === 'number' ? `${Math.round(scores[item.key] as number)}%` : '--'}</p>
            </article>
          ))}
          <article className="metric-card text-center md:col-span-2 xl:col-span-1">
            <p className="metric-label">Overall</p>
            <p className="metric-value">{typeof scores.overall === 'number' ? `${Math.round(scores.overall as number)}%` : '--'}</p>
            <p className="mt-2 text-xs font-semibold muted-copy">Engine: {String(scores.engine_used ?? '--')}</p>
          </article>
        </section>
      </div>
    </main>
  );
}
