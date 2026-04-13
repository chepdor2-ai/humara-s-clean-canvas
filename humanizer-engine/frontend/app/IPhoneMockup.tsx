'use client';

import { useState, useEffect, useRef } from 'react';
import { Zap, CheckCircle2 } from 'lucide-react';

const DETECTORS = [
  { name: 'GPTZero', beforeAi: 96, afterAi: 3 },
  { name: 'Turnitin', beforeAi: 92, afterAi: 0 },
  { name: 'Originality', beforeAi: 98, afterAi: 2 },
  { name: 'Copyleaks', beforeAi: 89, afterAi: 0 },
];

const INPUT_PREVIEW = 'Artificial intelligence has fundamentally transformed numerous sectors across the global economy. Furthermore, the implementation of machine learning algorithms has facilitated unprecedented advances…';
const OUTPUT_TEXT = 'These tools radically shift how we work. Machines spot patterns invisible to the human eye, reshaping healthcare diagnostics and financial forecasting almost overnight.';

type Phase = 'idle' | 'scanning' | 'humanizing' | 'complete';

function useTyping(text: string, active: boolean, speed = 18) {
  const [displayed, setDisplayed] = useState('');
  const idx = useRef(0);
  const key = useRef(0);

  useEffect(() => {
    if (!active) { idx.current = 0; key.current += 1; return; }
    idx.current = 0;
    const k = ++key.current;
    const id = setInterval(() => {
      if (k !== key.current) { clearInterval(id); return; }
      idx.current += 1;
      if (idx.current > text.length) { clearInterval(id); return; }
      setDisplayed(text.slice(0, idx.current));
    }, speed);
    return () => clearInterval(id);
  }, [text, active, speed]);

  return active ? displayed : '';
}

export default function IPhoneMockup() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [cycle, setCycle] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outputText = useTyping(OUTPUT_TEXT, phase === 'humanizing' || phase === 'complete', 18);

  useEffect(() => {
    const run = () => {
      setPhase('scanning');
      timer.current = setTimeout(() => {
        setPhase('humanizing');
        timer.current = setTimeout(() => {
          setPhase('complete');
          timer.current = setTimeout(() => {
            setPhase('idle');
            timer.current = setTimeout(() => setCycle(c => c + 1), 2000);
          }, 4000);
        }, OUTPUT_TEXT.length * 18 + 400);
      }, 2200);
    };
    const start = setTimeout(run, 800);
    return () => { clearTimeout(start); if (timer.current) clearTimeout(timer.current); };
  }, [cycle]);

  const isScanning = phase === 'scanning';
  const isHumanizing = phase === 'humanizing';
  const isDone = phase === 'complete';

  return (
    <div className="relative force-dark" style={{ perspective: '1200px' }}>
      {/* Glow behind phone */}
      <div className="absolute -inset-10 bg-gradient-to-br from-purple-500/25 via-purple-600/15 to-transparent rounded-full blur-[60px] pointer-events-none" />

      {/* iPhone frame — 3D tilt */}
      <div
        className="relative mx-auto w-[280px] sm:w-[300px] transition-transform duration-700 hover:scale-[1.02]"
        style={{ transform: 'rotateY(-8deg) rotateX(4deg)', transformStyle: 'preserve-3d' }}
      >
        {/* Outer shell with metallic edge */}
        <div className="rounded-[3rem] p-[2px] bg-gradient-to-b from-zinc-500 via-zinc-700 to-zinc-800 shadow-2xl shadow-purple-900/40">
          {/* Inner frame */}
          <div className="rounded-[2.9rem] bg-zinc-900 p-[8px]">
            {/* Notch */}
            <div className="absolute top-[2px] left-1/2 -translate-x-1/2 w-[100px] h-[28px] bg-zinc-900 rounded-b-2xl z-20 flex items-center justify-center gap-2">
              <div className="w-2 h-2 rounded-full bg-zinc-800 ring-1 ring-zinc-700" />
            </div>

            {/* Screen */}
            <div className="relative rounded-[2.3rem] overflow-hidden bg-[#09090F] min-h-[520px] sm:min-h-[560px] ring-1 ring-white/5">
              {/* Status bar */}
              <div className="flex items-center justify-between px-6 pt-10 pb-2">
                <span className="text-[9px] text-gray-500 font-medium tabular-nums">9:41</span>
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-2" viewBox="0 0 16 10"><path d="M1 4h2v6H1zM5 2h2v8H5zM9 0h2v10H9z" fill="#6b7280"/><rect x="13" y="1" width="3" height="8" rx="0.5" fill="none" stroke="#6b7280" strokeWidth="0.8"/><rect x="13.5" y="2" width="2" height="4" fill="#6b7280"/></svg>
                </div>
              </div>

              {/* App header */}
              <div className="px-4 pb-3 flex items-center gap-2 border-b border-white/5">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/30">
                  <Zap className="w-3 h-3 text-white" />
                </div>
                <span className="text-[11px] font-semibold text-white/90">HumaraGPT</span>
                {isScanning && (
                  <span className="ml-auto text-[8px] text-purple-400 flex items-center gap-1">
                    <div className="w-1.5 h-1.5 border border-purple-400 border-t-transparent rounded-full animate-spin" />
                    Scanning…
                  </span>
                )}
                {isHumanizing && (
                  <span className="ml-auto text-[8px] text-purple-400 flex items-center gap-1">
                    <Zap className="w-2 h-2" /> Writing…
                  </span>
                )}
                {isDone && (
                  <span className="ml-auto text-[8px] text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-2 h-2" /> Done
                  </span>
                )}
              </div>

              {/* Content area */}
              <div className="px-4 space-y-3 pb-4 pt-3">
                {/* Input card */}
                <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06] backdrop-blur-sm">
                  <span className="text-[8px] uppercase tracking-wider text-gray-500 font-semibold">Input</span>
                  <p className={`text-[10px] leading-relaxed mt-1.5 transition-colors duration-700 ${isScanning || isHumanizing || isDone ? 'text-red-400/60' : 'text-gray-400'}`}>
                    {INPUT_PREVIEW}
                  </p>
                </div>

                {/* Output card */}
                <div className={`rounded-xl p-3 border transition-all duration-700 ${isDone ? 'bg-emerald-500/[0.06] border-emerald-500/15 shadow-lg shadow-emerald-500/5' : 'bg-white/[0.03] border-white/[0.06]'}`}>
                  <span className={`text-[8px] uppercase tracking-wider font-semibold ${isDone ? 'text-emerald-400' : 'text-purple-400'}`}>Output</span>
                  {isHumanizing || isDone ? (
                    <p className="text-[10px] leading-relaxed mt-1.5 text-gray-200">
                      {outputText}
                      {isHumanizing && <span className="inline-block w-px h-2.5 bg-purple-400 ml-0.5 animate-pulse align-text-bottom" />}
                    </p>
                  ) : (
                    <p className="text-[10px] leading-relaxed mt-1.5 text-gray-600 italic">Awaiting output…</p>
                  )}
                </div>

                {/* Detector scores */}
                {(isScanning || isHumanizing || isDone) && (
                  <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06] space-y-1.5">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[8px] uppercase tracking-wider text-gray-500 font-semibold">{isDone ? 'After' : 'Before'}</span>
                      <span className={`text-[8px] font-bold ${isDone ? 'text-emerald-400' : 'text-red-400'}`}>{isDone ? '2% AI' : '95% AI'}</span>
                    </div>
                    {DETECTORS.map(d => {
                      const val = isDone ? d.afterAi : d.beforeAi;
                      return (
                        <div key={d.name} className="flex items-center gap-1.5">
                          <span className="text-[8px] text-gray-500 w-[60px] truncate">{d.name}</span>
                          <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-1000 ${val > 10 ? 'bg-red-400' : 'bg-emerald-400'}`} style={{ width: `${val}%` }} />
                          </div>
                          <span className={`text-[7px] font-bold tabular-nums w-[24px] text-right ${val > 10 ? 'text-red-400' : 'text-emerald-400'}`}>{val}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bottom bar */}
              <div className="absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-[#09090F] via-[#09090F]/80 to-transparent">
                <div className="flex items-center justify-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${isDone ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : isScanning || isHumanizing ? 'bg-purple-500 animate-pulse shadow-sm shadow-purple-500/50' : 'bg-gray-600'}`} />
                  <span className="text-[8px] text-gray-500">{isDone ? 'Human Score: 98%' : isScanning || isHumanizing ? 'Processing…' : 'Ready'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom home indicator */}
        <div className="flex justify-center mt-[-6px] relative z-30">
          <div className="w-[100px] h-[4px] bg-zinc-700 rounded-full" />
        </div>
      </div>
    </div>
  );
}
