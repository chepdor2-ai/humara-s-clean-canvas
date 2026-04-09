'use client';

import { useState, useEffect, useRef } from 'react';
import { Zap, CheckCircle2, ShieldCheck } from 'lucide-react';
import Image from 'next/image';

const DETECTORS = [
  { name: 'GPTZero', beforeAi: 94, afterAi: 1 },
  { name: 'Turnitin', beforeAi: 91, afterAi: 0 },
  { name: 'Originality.AI', beforeAi: 97, afterAi: 3 },
  { name: 'Copyleaks', beforeAi: 88, afterAi: 0 },
  { name: 'Winston AI', beforeAi: 93, afterAi: 2 },
];

const INPUT_TEXT = `The rapid advancement of artificial intelligence technologies has dramatically altered the landscape of modern business operations. Organizations worldwide are increasingly leveraging AI-powered solutions to streamline workflows, enhance productivity, and drive innovation across multiple departments.`;

const OUTPUT_TEXT = `AI is reshaping how businesses actually run—not just on paper, but in daily operations. Companies big and small are weaving smart tools into their workflows, cutting through bottleneck tasks that once ate up entire afternoons. The shift isn't theoretical anymore; it's happening in real time across every department.`;

type Phase = 'idle' | 'scanning' | 'humanizing' | 'complete';

function useTyping(text: string, active: boolean, speed = 12) {
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

export default function MacBookMockup() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [cycle, setCycle] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outputText = useTyping(OUTPUT_TEXT, phase === 'humanizing' || phase === 'complete', 12);

  useEffect(() => {
    const run = () => {
      setPhase('scanning');
      timer.current = setTimeout(() => {
        setPhase('humanizing');
        timer.current = setTimeout(() => {
          setPhase('complete');
          timer.current = setTimeout(() => {
            setPhase('idle');
            timer.current = setTimeout(() => setCycle(c => c + 1), 2500);
          }, 5000);
        }, OUTPUT_TEXT.length * 12 + 500);
      }, 2500);
    };
    const start = setTimeout(run, 1200);
    return () => { clearTimeout(start); if (timer.current) clearTimeout(timer.current); };
  }, [cycle]);

  const isScanning = phase === 'scanning';
  const isHumanizing = phase === 'humanizing';
  const isDone = phase === 'complete';

  return (
    <div className="relative">
      {/* Purple glow behind */}
      <div className="absolute -inset-20 bg-gradient-to-br from-purple-500/20 via-purple-600/10 to-transparent rounded-full blur-[100px] pointer-events-none" />

      {/* MacBook photo + floating screen overlay */}
      <div className="relative max-w-4xl mx-auto">
        {/* Real MacBook image */}
        <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-purple-900/30">
          <Image
            src="/macbook-frame.jpg"
            alt="MacBook Pro"
            width={1400}
            height={900}
            className="w-full h-auto object-cover"
            priority
          />
          {/* Gradient overlay to darken edges and blend */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#05050A] via-transparent to-transparent opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#05050A]/40 via-transparent to-[#05050A]/40" />
        </div>

        {/* Floating animated screen — positioned over the laptop */}
        <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-2xl bg-[#09090F]/95 backdrop-blur-xl rounded-xl overflow-hidden border border-white/10 shadow-2xl shadow-purple-500/10">
            {/* App chrome bar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-[#0A0A12]/90">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500/80" />
                <div className="w-2 h-2 rounded-full bg-yellow-500/80" />
                <div className="w-2 h-2 rounded-full bg-green-500/80" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="bg-white/5 rounded-md px-8 py-0.5 text-[8px] sm:text-[9px] text-gray-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-2.5 h-2.5 text-emerald-500" />
                  humaragpt.com/app
                </div>
              </div>
              <div className="w-8" />
            </div>

            {/* App header */}
            <div className="px-4 py-2 flex items-center gap-2 border-b border-white/5">
              <div className="w-4 h-4 rounded-md bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <Zap className="w-2 h-2 text-white" />
              </div>
              <span className="text-[10px] sm:text-[11px] font-semibold text-white/90">HumaraGPT Humanizer</span>
              <span className="text-[8px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded-full font-medium">V3</span>
              {isScanning && (
                <span className="ml-auto text-[8px] sm:text-[9px] text-purple-400 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 border border-purple-400 border-t-transparent rounded-full animate-spin" />
                  Scanning…
                </span>
              )}
              {isHumanizing && (
                <span className="ml-auto text-[8px] sm:text-[9px] text-purple-400 flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5" /> Humanizing…
                </span>
              )}
              {isDone && (
                <span className="ml-auto text-[8px] sm:text-[9px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5" /> 98% Human
                </span>
              )}
            </div>

            {/* Split pane */}
            <div className="grid grid-cols-2 min-h-[160px] sm:min-h-[220px]">
              {/* Input */}
              <div className="p-3 sm:p-4 border-r border-white/5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[7px] sm:text-[8px] uppercase tracking-wider text-gray-500 font-semibold">Input</span>
                  {(isScanning || isHumanizing || isDone) && <span className="text-[7px] sm:text-[8px] font-bold text-red-400">95% AI</span>}
                </div>
                <p className={`text-[8px] sm:text-[10px] leading-relaxed transition-colors duration-700 line-clamp-4 sm:line-clamp-6 ${isScanning || isHumanizing || isDone ? 'text-red-400/60' : 'text-gray-400'}`}>
                  {INPUT_TEXT}
                </p>

                {(isScanning || isHumanizing || isDone) && (
                  <div className="mt-2 pt-2 border-t border-white/5 space-y-0.5 hidden sm:block">
                    {DETECTORS.map(d => (
                      <div key={d.name} className="flex items-center gap-1">
                        <span className="text-[7px] text-gray-500 w-[60px] truncate">{d.name}</span>
                        <div className="flex-1 h-0.5 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-red-400 rounded-full" style={{ width: `${d.beforeAi}%`, transition: 'width 1s ease' }} />
                        </div>
                        <span className="text-[7px] font-bold text-red-400 tabular-nums w-[18px] text-right">{d.beforeAi}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Output */}
              <div className={`p-3 sm:p-4 transition-all duration-700 ${isDone ? 'bg-emerald-500/[0.04]' : ''}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[7px] sm:text-[8px] uppercase tracking-wider font-semibold ${isDone ? 'text-emerald-400' : 'text-purple-400'}`}>Output</span>
                  {isDone && <span className="text-[7px] sm:text-[8px] font-bold text-emerald-400">2% AI</span>}
                </div>

                {isHumanizing || isDone ? (
                  <p className="text-[8px] sm:text-[10px] leading-relaxed text-gray-200 line-clamp-4 sm:line-clamp-6">
                    {outputText}
                    {isHumanizing && <span className="inline-block w-px h-2.5 bg-purple-400 ml-0.5 animate-pulse align-text-bottom" />}
                  </p>
                ) : (
                  <p className="text-[8px] sm:text-[10px] leading-relaxed text-gray-600 italic">Output will appear here…</p>
                )}

                {isDone && (
                  <div className="mt-2 pt-2 border-t border-emerald-500/10 space-y-0.5 hidden sm:block">
                    {DETECTORS.map(d => (
                      <div key={d.name} className="flex items-center gap-1">
                        <span className="text-[7px] text-gray-500 w-[60px] truncate">{d.name}</span>
                        <div className="flex-1 h-0.5 bg-white/5 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${d.afterAi > 5 ? 'bg-red-400' : 'bg-emerald-400'}`} style={{ width: `${Math.max(d.afterAi, 1)}%`, transition: 'width 1s ease' }} />
                        </div>
                        <span className="text-[7px] font-bold text-emerald-400 tabular-nums w-[18px] text-right">{d.afterAi}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom status */}
            <div className="px-3 sm:px-4 py-1.5 border-t border-white/5 flex items-center justify-between">
              <span className="text-[7px] sm:text-[8px] text-gray-500">
                {isScanning ? 'Running 7 detectors…' : isHumanizing ? 'Mode: Standard • Preserving meaning…' : isDone ? 'Human score: 98% • Meaning: 97%' : 'Ready • Paste text to begin'}
              </span>
              <div className="flex items-center gap-1">
                <div className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${isDone ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : isScanning || isHumanizing ? 'bg-purple-500 animate-pulse shadow-sm shadow-purple-500/50' : 'bg-gray-600'}`} />
                <span className="text-[7px] sm:text-[8px] text-gray-500">{isDone ? 'Human' : isScanning || isHumanizing ? 'Processing' : 'Idle'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
