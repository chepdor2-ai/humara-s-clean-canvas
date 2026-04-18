'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ── Cosmic Processing Animation v2 ──────────────────────────────────────
   Premium orbital loader — brand-matched cyan/teal palette.
   Features: canvas particle field, sonar pulse rings, morphing core blob,
   comet-trail orbiters, animated waveform, smooth light/dark support.
   ─────────────────────────────────────────────────────────────────────── */

interface CosmicLoaderProps {
  stage: string;
  message: string;
  progress: number;
  engineLabel: string;
  statusItems: { label: string; value: string }[];
}

/* ── Brand palette ── */
const C = {
  cyan:   { r: 8,  g: 145, b: 178 },  // #0891b2 — primary
  teal:   { r: 20, g: 184, b: 166 },   // #14b8a6 — accent
  sky:    { r: 14, g: 165, b: 233 },    // #0ea5e9 — highlight
} as const;

function rgba(c: { r: number; g: number; b: number }, a: number) { return `rgba(${c.r},${c.g},${c.b},${a})`; }

/* ── Orbiter config ── */
const ORBITERS = [
  { radius: 42, duration: 4.5,  size: 3.5, color: C.cyan, startAngle: 0,    dir: 1  },
  { radius: 42, duration: 4.5,  size: 2,   color: C.cyan, startAngle: 180,  dir: 1  },
  { radius: 60, duration: 6,    size: 3,   color: C.teal, startAngle: 90,   dir: -1 },
  { radius: 60, duration: 6,    size: 2,   color: C.teal, startAngle: 270,  dir: -1 },
  { radius: 76, duration: 8,    size: 2.5, color: C.sky,  startAngle: 45,   dir: 1  },
  { radius: 76, duration: 8,    size: 1.5, color: C.sky,  startAngle: 225,  dir: 1  },
];

/* ── Waveform bars ── */
const WAVE_BARS = 24;

/* ── Canvas starfield ── */
function useStarfield(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = 560, H = 200;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // Generate 50 ambient particles
    const stars = Array.from({ length: 50 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.3 + Math.random() * 1.2,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.1,
      phase: Math.random() * Math.PI * 2,
      speed: 0.008 + Math.random() * 0.012,
    }));

    let raf: number;
    let t = 0;
    const draw = () => {
      t++;
      ctx.clearRect(0, 0, W, H);
      for (const s of stars) {
        s.x += s.vx;
        s.y += s.vy;
        if (s.x < -5) s.x = W + 5;
        if (s.x > W + 5) s.x = -5;
        if (s.y < -5) s.y = H + 5;
        if (s.y > H + 5) s.y = -5;
        const alpha = 0.15 + 0.25 * Math.sin(t * s.speed + s.phase);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(8,145,178,${alpha})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [canvasRef]);
}

export function CosmicLoader({ stage, message, progress, engineLabel, statusItems }: CosmicLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useStarfield(canvasRef);

  /* Pulse ring counter — emit a new ring every 2.5s */
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setPulseKey(k => k + 1), 2500);
    return () => clearInterval(iv);
  }, []);

  /* Waveform amplitudes — gentle randomised motion */
  const waveAmps = useMemo(() =>
    Array.from({ length: WAVE_BARS }, (_, i) => ({
      base: 0.3 + 0.4 * Math.sin((i / WAVE_BARS) * Math.PI),
      phase: (i / WAVE_BARS) * Math.PI * 2,
    })),
    [],
  );

  const CX = 90; // center x/y of orbital system (in 180×180 viewport)

  return (
    <div className="relative flex flex-col items-center justify-center w-full h-full px-4 py-6 sm:px-5 overflow-hidden select-none">

      {/* ── Canvas starfield (ambient particles) ── */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 w-full h-full opacity-50 dark:opacity-70"
        style={{ width: '100%', height: '100%' }}
      />

      {/* ── Ambient radial glow — CSS only, no JS timer ── */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-20 dark:opacity-35 animate-[cosmicGlow_8s_ease-in-out_infinite]"
          style={{
            background: `radial-gradient(ellipse 45% 45% at 50% 42%, ${rgba(C.cyan, 0.6)} 0%, ${rgba(C.teal, 0.2)} 40%, transparent 70%)`,
          }}
        />
      </div>

      {/* ── Main card ── */}
      <div className="relative w-full max-w-[560px] space-y-5 rounded-2xl border border-slate-200/60 dark:border-zinc-700/40 bg-white/92 dark:bg-zinc-900/60 backdrop-blur-md px-5 py-6 shadow-lg shadow-cyan-500/5 dark:shadow-cyan-400/5">

        {/* ── Orbital system ── */}
        <div className="relative mx-auto" style={{ width: 180, height: 180 }}>

          {/* Soft ambient glow behind rings */}
          <div
            className="absolute rounded-full blur-3xl opacity-60 dark:opacity-80"
            style={{
              inset: 30,
              background: `radial-gradient(circle, ${rgba(C.cyan, 0.3)} 0%, ${rgba(C.teal, 0.15)} 50%, transparent 80%)`,
            }}
          />

          {/* Sonar pulse rings — expand outward and fade */}
          <AnimatePresence>
            {[0, 1, 2].map(i => (
              <motion.div
                key={`pulse-${pulseKey}-${i}`}
                className="absolute rounded-full"
                style={{
                  width: 40,
                  height: 40,
                  left: CX - 20,
                  top: CX - 20,
                  border: `1.5px solid ${rgba(C.cyan, 0.4)}`,
                }}
                initial={{ scale: 1, opacity: 0.5 }}
                animate={{ scale: 4.5, opacity: 0 }}
                transition={{
                  duration: 3,
                  ease: 'easeOut',
                  delay: i * 0.5,
                }}
              />
            ))}
          </AnimatePresence>

          {/* Orbit tracks — dashed circles */}
          {[42, 60, 76].map((r, i) => (
            <div
              key={`track-${i}`}
              className="absolute rounded-full"
              style={{
                width: r * 2,
                height: r * 2,
                left: CX - r,
                top: CX - r,
                border: `1px dashed ${rgba(C.cyan, 0.08 + i * 0.02)}`,
              }}
            />
          ))}

          {/* Rotating conic sweep — gives depth */}
          <motion.div
            className="absolute rounded-full"
            style={{
              width: 160,
              height: 160,
              left: CX - 80,
              top: CX - 80,
              background: `conic-gradient(from 0deg, transparent 0%, ${rgba(C.cyan, 0.08)} 15%, transparent 30%, ${rgba(C.teal, 0.06)} 50%, transparent 65%, ${rgba(C.sky, 0.05)} 80%, transparent 100%)`,
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
          />

          {/* Comet-trail orbiters */}
          {ORBITERS.map((orb, i) => (
            <motion.div
              key={`orb-${i}`}
              className="absolute rounded-full"
              style={{
                width: orb.size,
                height: orb.size,
                left: CX - orb.size / 2,
                top: CX - orb.radius - orb.size / 2,
                transformOrigin: `${orb.size / 2}px ${orb.radius + orb.size / 2}px`,
                background: rgba(orb.color, 0.95),
                boxShadow: `0 0 ${orb.size * 3}px ${rgba(orb.color, 0.6)}, 0 0 ${orb.size * 6}px ${rgba(orb.color, 0.25)}`,
              }}
              animate={{ rotate: [orb.startAngle, orb.startAngle + 360 * orb.dir] }}
              transition={{ duration: orb.duration, repeat: Infinity, ease: 'linear' }}
            />
          ))}

          {/* Central core — gradient blob with breathing pulse */}
          <motion.div
            className="absolute rounded-full"
            style={{
              width: 40,
              height: 40,
              left: CX - 20,
              top: CX - 20,
              background: `linear-gradient(135deg, ${rgba(C.cyan, 1)}, ${rgba(C.teal, 1)})`,
            }}
            animate={{
              scale: [1, 1.12, 1],
              boxShadow: [
                `0 0 16px ${rgba(C.cyan, 0.5)}, 0 0 32px ${rgba(C.teal, 0.2)}, inset 0 0 8px ${rgba(C.sky, 0.15)}`,
                `0 0 24px ${rgba(C.cyan, 0.7)}, 0 0 48px ${rgba(C.teal, 0.35)}, inset 0 0 12px ${rgba(C.sky, 0.25)}`,
                `0 0 16px ${rgba(C.cyan, 0.5)}, 0 0 32px ${rgba(C.teal, 0.2)}, inset 0 0 8px ${rgba(C.sky, 0.15)}`,
              ],
            }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Inner shimmer ring on core */}
          <motion.div
            className="absolute rounded-full"
            style={{
              width: 48,
              height: 48,
              left: CX - 24,
              top: CX - 24,
              border: `1px solid ${rgba(C.cyan, 0.2)}`,
            }}
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.5, 0.8, 0.5],
            }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Core icon — waveform/pulse */}
          <motion.svg
            viewBox="0 0 24 24"
            className="absolute"
            style={{ width: 18, height: 18, left: CX - 9, top: CX - 9 }}
            fill="none"
            stroke="white"
            strokeWidth={2}
            strokeLinecap="round"
            animate={{ opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <path d="M2 12h2l3-7 4 14 4-10 3 6h4" />
          </motion.svg>
        </div>

        {/* ── Audio waveform visualiser ── */}
        <div className="flex items-center justify-center gap-[3px] h-6">
          {waveAmps.map((bar, i) => (
            <motion.div
              key={i}
              className="w-[2.5px] rounded-full"
              style={{
                background: `linear-gradient(to top, ${rgba(C.cyan, 0.7)}, ${rgba(C.teal, 0.9)})`,
              }}
              animate={{
                height: [
                  `${bar.base * 24}px`,
                  `${(bar.base * 0.4 + 0.6) * 24}px`,
                  `${bar.base * 24}px`,
                ],
              }}
              transition={{
                duration: 0.8 + (i % 5) * 0.15,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: i * 0.04,
              }}
            />
          ))}
        </div>

        {/* ── Stage text ── */}
        <div className="text-center space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-600 dark:text-cyan-400">
            Humanizing
          </p>
          <AnimatePresence mode="wait">
            <motion.p
              key={stage}
              initial={{ opacity: 0, y: 5, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -5, filter: 'blur(4px)' }}
              transition={{ duration: 0.25 }}
              className="text-sm font-semibold text-slate-800 dark:text-zinc-100 truncate"
            >
              {stage}
            </motion.p>
          </AnimatePresence>
          <AnimatePresence mode="wait">
            <motion.p
              key={message}
              initial={{ opacity: 0, filter: 'blur(2px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(2px)' }}
              transition={{ duration: 0.3 }}
              className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto"
            >
              {message}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* ── Progress bar ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span className="text-slate-600 dark:text-zinc-300">{engineLabel}</span>
            <span className="text-cyan-600 dark:text-cyan-400 tabular-nums font-mono">{Math.round(progress)}%</span>
          </div>
          <div className="relative h-[6px] w-full overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800/60">
            {/* Shimmer track */}
            <motion.div
              className="absolute inset-0 rounded-full opacity-30"
              style={{
                background: `linear-gradient(90deg, transparent 0%, ${rgba(C.cyan, 0.15)} 50%, transparent 100%)`,
                backgroundSize: '200% 100%',
              }}
              animate={{ backgroundPosition: ['200% 0%', '-200% 0%'] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            />
            {/* Fill */}
            <motion.div
              className="h-full rounded-full relative overflow-hidden"
              style={{
                background: `linear-gradient(90deg, ${rgba(C.cyan, 1)}, ${rgba(C.teal, 1)})`,
              }}
              initial={false}
              animate={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
              transition={{ type: 'spring', stiffness: 60, damping: 20 }}
            >
              {/* Moving highlight on fill */}
              <motion.div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)`,
                  backgroundSize: '60% 100%',
                }}
                animate={{ backgroundPosition: ['-100% 0%', '200% 0%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              />
            </motion.div>
          </div>
        </div>

        {/* ── Status grid ── */}
        <div className="grid grid-cols-3 gap-2">
          {statusItems.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-slate-200/60 dark:border-zinc-700/40 bg-slate-50/80 dark:bg-zinc-800/40 px-2.5 py-2 text-center transition-colors"
            >
              <p className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-zinc-500 font-semibold">{item.label}</p>
              <p className="mt-0.5 truncate text-xs font-bold text-slate-700 dark:text-zinc-200">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Keyframe injection ── */}
      <style>{`
        @keyframes cosmicGlow {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(1.05); }
        }
        .dark .animate-\\[cosmicGlow_8s_ease-in-out_infinite\\] {
          animation: cosmicGlow 8s ease-in-out infinite;
        }
        .animate-\\[cosmicGlow_8s_ease-in-out_infinite\\] {
          animation: cosmicGlow 8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
