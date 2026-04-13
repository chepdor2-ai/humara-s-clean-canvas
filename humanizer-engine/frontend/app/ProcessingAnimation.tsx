'use client';
import { useState, useEffect } from 'react';
import { Search, Zap, Sparkles, ShieldCheck } from 'lucide-react';

const STEPS = [
  { label: 'Analyzing patterns', icon: Search },
  { label: 'Rewriting content', icon: Zap },
  { label: 'Optimizing flow', icon: Sparkles },
  { label: 'Validating output', icon: ShieldCheck },
];

export default function ProcessingAnimation({ isRephrasing = false, iteration = 0 }: { isRephrasing?: boolean; iteration?: number }) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const pTimer = setInterval(() => {
      setProgress(p => (p >= 92 ? p : p + Math.random() * 2.5 + 0.5));
    }, 250);
    const sTimer = setInterval(() => {
      setStep(s => (s + 1) % STEPS.length);
    }, 2200);
    return () => { clearInterval(pTimer); clearInterval(sTimer); };
  }, []);

  const Icon = STEPS[step].icon;

  return (
    <div className="flex flex-col items-center justify-center min-h-[380px] gap-6 px-8">
      {/* Animated icon */}
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-brand-950 flex items-center justify-center">
          <Icon className="w-6 h-6 text-emerald-600 dark:text-brand-400 animate-pulse" />
        </div>
        <div className="absolute -inset-3 rounded-3xl border-2 border-emerald-300/40 dark:border-brand-700/40 animate-ping" />
      </div>

      {/* Status text */}
      <div className="text-center space-y-1.5">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {isRephrasing ? 'Rephrasing' : iteration > 0 ? `Iteration ${iteration} — Reducing AI score` : 'Humanizing'} your text
        </p>
        <p className="text-xs text-emerald-600 dark:text-brand-400 flex items-center gap-2 justify-center">
          <span className="flex gap-0.5">
            <span className="w-1 h-1 bg-emerald-500 dark:bg-brand-500 rounded-full animate-bounce" />
            <span className="w-1 h-1 bg-emerald-500 dark:bg-brand-500 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1 h-1 bg-emerald-500 dark:bg-brand-500 rounded-full animate-bounce [animation-delay:300ms]" />
          </span>
          {STEPS[step].label}
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-52 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-emerald-400 dark:from-brand-400 to-emerald-600 dark:to-brand-600 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(progress, 92)}%` }}
        />
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-3">
        {STEPS.map((s, i) => {
          const StepIcon = s.icon;
          return (
            <div key={i} className={`flex items-center gap-1 text-[10px] font-medium transition-all duration-300 ${
              i === step ? 'text-emerald-600 dark:text-brand-400' : 'text-slate-400 dark:text-slate-600'
            }`}>
              <StepIcon className={`w-2.5 h-2.5 ${i === step ? 'animate-pulse' : ''}`} />
              {s.label.split(' ')[0]}
            </div>
          );
        })}
      </div>
    </div>
  );
}
