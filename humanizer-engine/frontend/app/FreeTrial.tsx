'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, RotateCcw, Copy, Check } from 'lucide-react';

const MAX_WORDS = 150;
const MAX_FREE_ATTEMPTS = 2;
const STORAGE_KEY = 'humara_free_attempts';

function getAttempts(): number {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
}
function setAttempts(n: number) {
  if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, String(n));
}

export default function FreeTrial() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const wordCount = useMemo(() => (input.trim() ? input.trim().split(/\s+/).length : 0), [input]);

  const handleHumanize = async () => {
    const used = getAttempts();
    if (used >= MAX_FREE_ATTEMPTS) {
      router.push('/login?ref=trial');
      return;
    }
    if (!input.trim()) return;
    if (wordCount < 10) { setError('Enter at least 10 words.'); return; }
    if (wordCount > MAX_WORDS) { setError(`Maximum ${MAX_WORDS} words for free trial.`); return; }

    setLoading(true); setError(''); setOutput('');
    try {
      const res = await fetch('/api/humanize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input, engine: 'ninja_1', strength: 'medium', tone: 'academic', strict_meaning: true, enable_post_processing: true }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Humanization failed');
      setOutput(data.humanized);
      setAttempts(used + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const attemptsUsed = typeof window !== 'undefined' ? getAttempts() : 0;
  const remaining = MAX_FREE_ATTEMPTS - attemptsUsed;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid md:grid-cols-2 gap-4">
        {/* Input */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/80">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Paste AI Text</span>
            <span className={`text-[11px] tabular-nums ${wordCount > MAX_WORDS ? 'text-red-400 font-bold' : 'text-slate-500 dark:text-zinc-500'}`}>{wordCount}/{MAX_WORDS} words</span>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 min-h-[200px] bg-transparent outline-none resize-none text-[14px] leading-relaxed text-slate-900 dark:text-zinc-200 p-4 placeholder-slate-400 dark:placeholder-zinc-600"
            placeholder="Paste your AI-generated text here…"
          />
        </div>

        {/* Output */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/80">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Humanized Output</span>
            {output && (
              <button onClick={handleCopy} className="p-1 text-purple-400 hover:bg-purple-950/50 rounded-md transition-colors" title="Copy">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
          {loading ? (
            <div className="flex-1 min-h-[200px] flex items-center justify-center">
              <div className="flex items-center gap-2 text-brand-600">
                <RotateCcw className="w-4 h-4 animate-spin" />
                <span className="text-sm font-medium">Humanizing…</span>
              </div>
            </div>
          ) : output ? (
            <div className="relative flex-1">
              <div className="absolute inset-0 bg-emerald-50/50 dark:bg-emerald-950/20 pointer-events-none rounded-b-xl" />
              <div className="relative z-10 min-h-[200px] text-[14px] leading-relaxed text-slate-900 dark:text-zinc-200 p-4 whitespace-pre-wrap">{output}</div>
            </div>
          ) : (
            <div className="flex-1 min-h-[200px] flex items-center justify-center text-slate-400 dark:text-zinc-600">
              <span className="text-xs">Output appears here</span>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
        <div className="flex items-center gap-3">
          <button onClick={handleHumanize} disabled={!input.trim() || loading || wordCount > MAX_WORDS}
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-lg px-6 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-sm hover:shadow-md active:scale-[0.98]">
            {loading ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {loading ? 'Humanizing…' : 'Humanize Free'}
          </button>
          <span className="text-xs text-slate-500 dark:text-zinc-500">{remaining > 0 ? `${remaining} free attempt${remaining === 1 ? '' : 's'} remaining` : 'Free attempts used'}</span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-zinc-500 text-center sm:text-right">
          Fine-tuned to beat <span className="font-semibold text-slate-500 dark:text-zinc-400">GPTZero</span> · Humara 2.4 + Nuru 2.0 · No signup required
        </p>
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-950/30 border border-red-900 rounded-lg text-sm text-red-400 flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-red-500 rounded-full" /> {error}
        </div>
      )}
    </div>
  );
}
