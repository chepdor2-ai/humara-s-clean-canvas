'use client';

import { useState, useEffect, useRef } from 'react';
import { Zap, CheckCircle2 } from 'lucide-react';

/* ── Simulated detector data ─────────────────────────────────────────── */
const DETECTORS = [
  { name: 'GPTZero', beforeAi: 96, afterAi: 3 },
  { name: 'Turnitin', beforeAi: 92, afterAi: 0 },
  { name: 'Originality.AI', beforeAi: 98, afterAi: 2 },
  { name: 'Copyleaks', beforeAi: 89, afterAi: 0 },
  { name: 'Winston AI', beforeAi: 94, afterAi: 5 },
];

const INPUT_TEXT = `Artificial intelligence has fundamentally transformed numerous sectors across the global economy. Furthermore, the implementation of machine learning algorithms has facilitated unprecedented advances in data processing capabilities. It is important to note that these technological developments have significantly impacted how organizations approach complex problem-solving.`;

const OUTPUT_TEXT = `These tools radically shift how we work. Machines spot patterns invisible to the human eye, reshaping healthcare diagnostics and financial forecasting almost overnight. The ripple effect touches every industry — from startups automating grunt work to hospitals catching diseases earlier than ever before.`;

type Phase = 'idle' | 'scanning' | 'humanizing' | 'complete';

/* ── Animated Dual Bar ───────────────────────────────────────────────── */
const AnimBar = ({ name, aiScore, animate }: { name: string; aiScore: number; animate: boolean }) => {
  const val = animate ? aiScore : 0;

  const humanScore = 100 - val;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium text-slate-500 w-[85px] truncate">{name}</span>
      <div className="flex-1 h-2 bg-emerald-400 rounded-full overflow-hidden flex">
        <div className="h-full bg-red-400 rounded-l-full" style={{ width: `${val}%`, transition: 'width 1.2s cubic-bezier(.4,0,.2,1)' }} />
      </div>
      <div className="flex items-center gap-1 w-[80px] justify-end">
        <span className="text-[10px] font-bold text-red-500 tabular-nums">{Math.round(val)}%</span>
        <span className="text-[10px] text-slate-300">/</span>
        <span className="text-[10px] font-bold text-emerald-600 tabular-nums">{Math.round(humanScore)}%</span>
      </div>
    </div>
  );
};

/* ── Typing animation hook ───────────────────────────────────────────── */
function useTyping(text: string, active: boolean, speed = 12) {
  const [displayed, setDisplayed] = useState('');
  const idx = useRef(0);
  const activeKey = useRef(0);

  useEffect(() => {
    if (!active) {
      idx.current = 0;
      activeKey.current += 1;
      return;
    }
    idx.current = 0;
    const key = ++activeKey.current;
    const id = setInterval(() => {
      if (key !== activeKey.current) { clearInterval(id); return; }
      idx.current += 1;
      if (idx.current > text.length) { clearInterval(id); return; }
      setDisplayed(text.slice(0, idx.current));
    }, speed);
    return () => clearInterval(id);
  }, [text, active, speed]);

  return active ? displayed : '';
}

/* ── Main Hero Animation ─────────────────────────────────────────────── */
export default function HeroAnimation() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [cycle, setCycle] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const outputText = useTyping(OUTPUT_TEXT, phase === 'humanizing' || phase === 'complete', 14);

  /* Auto-play loop */
  useEffect(() => {
    const run = () => {
      setPhase('scanning');
      timerRef.current = setTimeout(() => {
        setPhase('humanizing');
        timerRef.current = setTimeout(() => {
          setPhase('complete');
          timerRef.current = setTimeout(() => {
            setPhase('idle');
            timerRef.current = setTimeout(() => setCycle(c => c + 1), 2000);
          }, 5000);
        }, OUTPUT_TEXT.length * 14 + 500);
      }, 2500);
    };

    const start = setTimeout(run, 1000);
    return () => {
      clearTimeout(start);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [cycle]);

  const isScanning = phase === 'scanning';
  const isHumanizing = phase === 'humanizing';
  const isDone = phase === 'complete';

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-lg">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50">
        <div className="w-2.5 h-2.5 bg-slate-200 rounded-full" />
        <div className="w-2.5 h-2.5 bg-slate-200 rounded-full" />
        <div className="w-2.5 h-2.5 bg-slate-200 rounded-full" />
        <span className="text-xs text-slate-400 ml-2">Humara Humanizer</span>
        {isScanning && (
          <span className="ml-auto text-[10px] font-medium text-brand-600 flex items-center gap-1">
            <div className="w-2 h-2 border border-brand-600 border-t-transparent rounded-full animate-spin" />
            Scanning detectors…
          </span>
        )}
        {isHumanizing && (
          <span className="ml-auto text-[10px] font-medium text-brand-600 flex items-center gap-1">
            <Zap className="w-3 h-3" /> Humanizing…
          </span>
        )}
        {isDone && (
          <span className="ml-auto text-[10px] font-medium text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Complete
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* Input side */}
        <div className="p-6 border-r border-slate-100">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Input</span>
          <p className={`text-sm mt-3 leading-relaxed transition-colors duration-700 ${
            isScanning || isHumanizing || isDone ? 'text-red-400/70' : 'text-slate-400'
          }`}>
            {INPUT_TEXT}
          </p>

          {/* Before scores */}
          {(isScanning || isHumanizing || isDone) && (
            <div className="mt-5 pt-4 border-t border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Before</span>
                <span className="text-[10px] font-bold text-red-500">95% AI</span>
              </div>
              {DETECTORS.map(d => (
                <AnimBar key={`before-${d.name}`} name={d.name} aiScore={d.beforeAi} animate={isScanning || isHumanizing || isDone} />
              ))}
            </div>
          )}
        </div>

        {/* Output side */}
        <div className={`p-6 transition-colors duration-700 ${isDone ? 'bg-emerald-50/30' : 'bg-slate-50/50'}`}>
          <span className={`text-xs font-medium uppercase tracking-wider transition-colors duration-500 ${isDone ? 'text-emerald-600' : 'text-brand-600'}`}>Output</span>

          {isHumanizing || isDone ? (
            <p className="text-sm mt-3 leading-relaxed text-slate-700">
              {outputText}
              {isHumanizing && <span className="inline-block w-0.5 h-4 bg-brand-600 ml-0.5 animate-pulse align-text-bottom" />}
            </p>
          ) : (
            <p className="text-sm mt-3 leading-relaxed text-slate-300 italic">Output appears here…</p>
          )}

          {/* After scores */}
          {isDone && (
            <div className="mt-5 pt-4 border-t border-emerald-100 space-y-1.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">After</span>
                <span className="text-[10px] font-bold text-emerald-600">2% AI</span>
              </div>
              {DETECTORS.map(d => (
                <AnimBar key={`after-${d.name}`} name={d.name} aiScore={d.afterAi} animate={isDone} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom status */}
      <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-400">
            {isScanning ? 'Running 7 detectors…' : isHumanizing ? 'Rewriting with Ghost Pro…' : isDone ? 'Meaning preserved: 97%' : 'Ready'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${isDone ? 'bg-emerald-500' : isScanning || isHumanizing ? 'bg-brand-500 animate-pulse' : 'bg-slate-300'}`} />
          <span className="text-[10px] text-slate-400">
            {isDone ? 'Human' : isScanning || isHumanizing ? 'Processing' : 'Idle'}
          </span>
        </div>
      </div>
    </div>
  );
}
