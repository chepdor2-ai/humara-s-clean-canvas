'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ── Cosmic Processing Animation ──────────────────────────────────────────
   Inspired by spiral-vortex energy, ascending light, and black-hole motion.
   A multi-ring orbital system with flowing particle trails, pulsing core,
   and cycling status messages — all pure CSS + Framer Motion.
   ─────────────────────────────────────────────────────────────────────── */

interface CosmicLoaderProps {
  /** Current processing stage label, e.g. "Phase 2/4 – Nuru 2.0" */
  stage: string;
  /** Descriptive processing message that cycles */
  message: string;
  /** 0–100 overall progress */
  progress: number;
  /** Engine display name */
  engineLabel: string;
  /** Status items shown in the grid (engine, cycle, fill) */
  statusItems: { label: string; value: string }[];
}

/* Particle positions along rings — 8 dots distributed in a spiral pattern */
const PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  ring: i % 3,                        // which ring (0=inner, 1=mid, 2=outer)
  offset: (i * 137.5) % 360,          // golden-angle distribution
  size: 2 + (i % 3),                  // 2–4px
  duration: 3 + (i % 4) * 0.8,        // 3–6.2s orbit
  delay: i * 0.25,
}));

const RING_RADII = [32, 52, 72];       // px — inner, mid, outer

export function CosmicLoader({ stage, message, progress, engineLabel, statusItems }: CosmicLoaderProps) {
  /* Cycle a subtle hue rotation on the glow */
  const [hueShift, setHueShift] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setHueShift(h => (h + 1) % 360), 50);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="relative flex flex-col items-center justify-center w-full h-full px-4 py-6 sm:px-5 overflow-hidden select-none">
      {/* ── Background radial glow ── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30 dark:opacity-40"
        style={{
          background: `radial-gradient(ellipse 50% 50% at 50% 45%, hsl(${185 + hueShift * 0.15}, 80%, 55%) 0%, transparent 70%)`,
        }}
      />

      {/* ── Main card ── */}
      <div className="relative w-full max-w-[560px] space-y-5 rounded-2xl border border-slate-200/70 dark:border-zinc-800/60 bg-white/90 dark:bg-zinc-900/50 backdrop-blur-sm px-4 py-5">

        {/* ── Orbital system ── */}
        <div className="relative mx-auto" style={{ width: 160, height: 160 }}>
          {/* Ambient glow behind everything */}
          <div
            className="absolute rounded-full blur-2xl"
            style={{
              inset: 20,
              background: `radial-gradient(circle, rgba(8,145,178,.35) 0%, rgba(99,102,241,.2) 50%, transparent 75%)`,
              filter: `hue-rotate(${hueShift * 0.2}deg)`,
            }}
          />

          {/* Ring outlines — three concentric circles rotating at different speeds */}
          {RING_RADII.map((r, i) => {
            const size = r * 2;
            const cx = 80 - r;
            return (
              <motion.div
                key={`ring-${i}`}
                className="absolute rounded-full"
                style={{
                  width: size,
                  height: size,
                  left: cx,
                  top: cx,
                  border: `1px solid`,
                  borderColor: i === 0
                    ? 'rgba(8,145,178,0.25)'
                    : i === 1
                      ? 'rgba(99,102,241,0.2)'
                      : 'rgba(168,85,247,0.15)',
                }}
                animate={{ rotate: i % 2 === 0 ? 360 : -360 }}
                transition={{
                  duration: 8 + i * 4,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              />
            );
          })}

          {/* Dashed orbit path (mid ring) for texture */}
          <motion.div
            className="absolute rounded-full"
            style={{
              width: 104,
              height: 104,
              left: 28,
              top: 28,
              border: '1px dashed rgba(8,145,178,0.12)',
            }}
            animate={{ rotate: -360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          />

          {/* Flowing particles on ring orbits */}
          {PARTICLES.map(p => {
            const r = RING_RADII[p.ring];
            return (
              <motion.div
                key={`particle-${p.id}`}
                className="absolute rounded-full"
                style={{
                  width: p.size,
                  height: p.size,
                  left: 80 - p.size / 2,
                  top: 80 - r - p.size / 2,
                  transformOrigin: `${p.size / 2}px ${r + p.size / 2}px`,
                  background: p.ring === 0
                    ? 'rgba(8,145,178,0.9)'
                    : p.ring === 1
                      ? 'rgba(99,102,241,0.8)'
                      : 'rgba(168,85,247,0.7)',
                  boxShadow: p.ring === 0
                    ? '0 0 6px rgba(8,145,178,0.6)'
                    : p.ring === 1
                      ? '0 0 6px rgba(99,102,241,0.5)'
                      : '0 0 6px rgba(168,85,247,0.4)',
                }}
                animate={{ rotate: [p.offset, p.offset + 360] }}
                transition={{
                  duration: p.duration,
                  repeat: Infinity,
                  ease: 'linear',
                  delay: p.delay,
                }}
              />
            );
          })}

          {/* Central pulsing core */}
          <motion.div
            className="absolute rounded-full"
            style={{
              width: 36,
              height: 36,
              left: 62,
              top: 62,
              background: 'linear-gradient(135deg, #0891b2, #6366f1)',
              boxShadow: '0 0 20px rgba(8,145,178,0.5), 0 0 40px rgba(99,102,241,0.3)',
            }}
            animate={{
              scale: [1, 1.15, 1],
              boxShadow: [
                '0 0 20px rgba(8,145,178,0.5), 0 0 40px rgba(99,102,241,0.3)',
                '0 0 30px rgba(8,145,178,0.7), 0 0 60px rgba(99,102,241,0.4)',
                '0 0 20px rgba(8,145,178,0.5), 0 0 40px rgba(99,102,241,0.3)',
              ],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Core icon — lightning bolt */}
          <motion.svg
            viewBox="0 0 24 24"
            className="absolute text-white"
            style={{ width: 16, height: 16, left: 72, top: 72 }}
            fill="currentColor"
            animate={{ opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <path d="M13 2 4.09 12.97a1 1 0 0 0 .78 1.63h6.13l-2 6.4a1 1 0 0 0 1.77.83l8.91-10.97a1 1 0 0 0-.78-1.63h-6.13l2-6.4a1 1 0 0 0-1.77-.83Z" />
          </motion.svg>

          {/* Outer spiral trace — a rotating gradient arc */}
          <motion.div
            className="absolute rounded-full"
            style={{
              width: 152,
              height: 152,
              left: 4,
              top: 4,
              background: 'conic-gradient(from 0deg, transparent 0%, rgba(8,145,178,0.15) 25%, transparent 50%, rgba(99,102,241,0.1) 75%, transparent 100%)',
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
          />
        </div>

        {/* ── Stage text ── */}
        <div className="text-center space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-600 dark:text-cyan-400">
            Humanizing
          </p>
          <AnimatePresence mode="wait">
            <motion.p
              key={stage}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="text-sm font-semibold text-slate-800 dark:text-zinc-100 truncate"
            >
              {stage}
            </motion.p>
          </AnimatePresence>
          <AnimatePresence mode="wait">
            <motion.p
              key={message}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed max-w-md mx-auto"
            >
              {message}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* ── Progress bar ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span className="text-slate-600 dark:text-zinc-300">{engineLabel}</span>
            <span className="text-cyan-600 dark:text-cyan-400 tabular-nums">{Math.round(progress)}%</span>
          </div>
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800/60">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: 'linear-gradient(90deg, #0891b2, #6366f1, #a855f7, #6366f1, #0891b2)',
                backgroundSize: '200% 100%',
              }}
              initial={false}
              animate={{
                width: `${Math.max(2, Math.min(100, progress))}%`,
                backgroundPosition: ['0% 0%', '200% 0%'],
              }}
              transition={{
                width: { type: 'spring', stiffness: 60, damping: 20 },
                backgroundPosition: { duration: 3, repeat: Infinity, ease: 'linear' },
              }}
            />
          </div>
        </div>

        {/* ── Status grid ── */}
        <div className="grid grid-cols-3 gap-2">
          {statusItems.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-slate-200/70 dark:border-zinc-800/50 bg-white/80 dark:bg-zinc-900/50 px-2.5 py-2 text-center"
            >
              <p className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-zinc-500 font-semibold">{item.label}</p>
              <p className="mt-0.5 truncate text-xs font-bold text-slate-700 dark:text-zinc-200">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
