import React, { useId, useMemo } from 'react';

interface WaterJugProgressProps {
  percent: number;
  size?: number;
  phaseName?: string;
  phaseIndex?: number;
  totalPhases?: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const WaterJugProgress: React.FC<WaterJugProgressProps> = ({ percent, size = 224, phaseName, phaseIndex, totalPhases }) => {
  const safePercent = clamp(Number.isFinite(percent) ? percent : 0, 0, 100);
  const uid = useId().replace(/:/g, '');
  const displayPhaseName = useMemo(() => {
    if (phaseName === 'Complete') return 'Complete';
    if (!phaseName) return 'Processing';
    return phaseName.replace(/^Phase\s+\d+\/\d+\s*-\s*/i, '').trim();
  }, [phaseName]);

  const trackGradientId = `processing_track_${uid}`;
  const progressGradientId = `processing_progress_${uid}`;
  const glowFilterId = `processing_glow_${uid}`;

  const progressRadius = 78;
  const orbitOneRadius = 62;
  const orbitTwoRadius = 92;
  const progressCircumference = 2 * Math.PI * progressRadius;
  const strokeOffset = progressCircumference * (1 - safePercent / 100);
  const indicatorAngle = safePercent * 3.6 - 90;

  const palette = useMemo(() => {
    const hue = Math.round(188 + safePercent * 0.33);
    return {
      trackStart: `hsla(${hue}, 70%, 86%, 0.56)`,
      trackEnd: `hsla(${hue + 24}, 64%, 70%, 0.2)`,
      arcStart: `hsl(${Math.max(176, hue - 12)}, 90%, 56%)`,
      arcEnd: `hsl(${Math.min(224, hue + 8)}, 88%, 66%)`,
      frameStroke: `hsla(${hue + 16}, 82%, 88%, 0.55)`,
      indicator: `hsl(${Math.min(226, hue + 6)}, 92%, 72%)`,
      innerCore: 'rgba(4, 14, 26, 0.56)',
    };
  }, [safePercent]);

  return (
    <div className="relative flex items-center justify-center">
      <div className="pointer-events-none absolute inset-[-24px] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.28)_0%,rgba(14,165,233,0.16)_40%,transparent_72%)] blur-3xl animate-[glowPulse_3.9s_ease-in-out_infinite]" />
      <svg width={size} height={size} viewBox="0 0 220 220" className="relative z-10 block drop-shadow-[0_22px_36px_rgba(2,8,23,0.34)]">
        <defs>
          <linearGradient id={trackGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={palette.trackStart} />
            <stop offset="100%" stopColor={palette.trackEnd} />
          </linearGradient>
          <linearGradient id={progressGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={palette.arcStart} />
            <stop offset="100%" stopColor={palette.arcEnd} />
          </linearGradient>
          <filter id={glowFilterId} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx="110" cy="110" r="94" fill="rgba(255,255,255,0.12)" stroke={palette.frameStroke} strokeWidth="1.3" />
        <circle cx="110" cy="110" r={progressRadius} fill="none" stroke={`url(#${trackGradientId})`} strokeWidth="12" />
        <circle
          cx="110"
          cy="110"
          r={progressRadius}
          fill="none"
          stroke={`url(#${progressGradientId})`}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={progressCircumference}
          strokeDashoffset={strokeOffset}
          transform="rotate(-90 110 110)"
          className="transition-[stroke-dashoffset] duration-200 ease-out"
          filter={`url(#${glowFilterId})`}
        />

        <circle cx="110" cy="110" r={orbitOneRadius} fill="none" stroke="rgba(125,211,252,0.48)" strokeDasharray="2 8" strokeWidth="1.2" opacity="0.75">
          <animateTransform attributeName="transform" type="rotate" from="0 110 110" to="360 110 110" dur="13s" repeatCount="indefinite" />
        </circle>
        <circle cx="110" cy="110" r={orbitTwoRadius} fill="none" stroke="rgba(45,212,191,0.3)" strokeDasharray="3 10" strokeWidth="1" opacity="0.64">
          <animateTransform attributeName="transform" type="rotate" from="360 110 110" to="0 110 110" dur="17s" repeatCount="indefinite" />
        </circle>

        <g transform={`rotate(${indicatorAngle} 110 110)`}>
          <circle cx="110" cy="32" r="5.5" fill={palette.indicator} filter={`url(#${glowFilterId})`} />
          <circle cx="110" cy="32" r="2.1" fill="rgba(255,255,255,0.95)" />
        </g>

        <polygon
          points="110,72 145,92 145,128 110,148 75,128 75,92"
          fill="rgba(8, 20, 34, 0.4)"
          stroke={palette.frameStroke}
          strokeWidth="1.1"
        />
        <circle cx="110" cy="110" r="21" fill={palette.innerCore} stroke="rgba(186,230,253,0.28)" strokeWidth="1.2" />
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[42px] font-black leading-none tracking-tight text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.45)]">
          {Math.round(safePercent)}%
        </span>
        <span className={`mt-1 max-w-[182px] text-center text-white/95 drop-shadow-[0_2px_8px_rgba(0,0,0,0.42)] ${displayPhaseName === 'Complete' ? 'truncate text-[11px] font-bold uppercase tracking-[0.18em]' : 'line-clamp-2 text-[10px] font-semibold tracking-[0.08em]'}`}>
          {displayPhaseName}
        </span>
        {totalPhases && totalPhases > 1 && phaseIndex ? (
          <div className="mt-2 flex gap-1.5">
            {Array.from({ length: totalPhases }, (_, i) => (
              <div
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                  i + 1 <= phaseIndex
                    ? 'scale-110 bg-cyan-100 shadow-[0_0_8px_rgba(224,255,255,0.8)]'
                    : 'bg-white/35'
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default WaterJugProgress;
