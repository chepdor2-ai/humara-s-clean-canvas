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

  const clipId = `water_clip_${uid}`;
  const glassGradientId = `glass_gradient_${uid}`;
  const waterGradientId = `water_gradient_${uid}`;
  const highlightGradientId = `highlight_gradient_${uid}`;

  const innerTop = 30;
  const innerBottom = 190;
  const fillHeight = ((innerBottom - innerTop) * safePercent) / 100;
  const waterY = innerBottom - fillHeight;

  const waveAmplitude = Math.max(3, 10 - safePercent * 0.06);
  const d1 = `M26 ${waterY} C 52 ${waterY - waveAmplitude}, 78 ${waterY + waveAmplitude}, 110 ${waterY} C 138 ${waterY - waveAmplitude}, 164 ${waterY + waveAmplitude}, 194 ${waterY} L194 198 L26 198 Z`;
  const d2 = `M26 ${waterY} C 52 ${waterY + waveAmplitude}, 78 ${waterY - waveAmplitude}, 110 ${waterY} C 138 ${waterY + waveAmplitude}, 164 ${waterY - waveAmplitude}, 194 ${waterY} L194 198 L26 198 Z`;

  const colors = useMemo(() => {
    const hue = Math.round((safePercent / 100) * 120); // 0:red -> 120:green
    return {
      top: `hsl(${hue}, 92%, 58%)`,
      bottom: `hsl(${Math.max(0, hue - 10)}, 90%, 43%)`,
      foam: `hsl(${Math.max(0, hue - 4)}, 100%, 92%)`,
      glow: `hsla(${hue}, 95%, 56%, 0.42)`,
    };
  }, [safePercent]);

  const bubbleStart = Math.min(innerBottom - 8, waterY + 26);
  const bubblePeak = Math.max(innerTop + 10, waterY - 26);

  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} viewBox="0 0 220 220" className="block drop-shadow-[0_20px_36px_rgba(2,8,23,0.34)]">
        <defs>
          <clipPath id={clipId}>
            <circle cx="110" cy="110" r="84" />
          </clipPath>
          <linearGradient id={glassGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f8fbff" stopOpacity="0.9" />
            <stop offset="55%" stopColor="#dbeafe" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#cbd5e1" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id={waterGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.top} />
            <stop offset="100%" stopColor={colors.bottom} />
          </linearGradient>
          <radialGradient id={highlightGradientId} cx="30%" cy="20%" r="65%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.86" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="110" cy="110" r="92" fill={`url(#${glassGradientId})`} stroke="#cbd5e1" strokeWidth="2.5" />

        <g clipPath={`url(#${clipId})`}>
          <rect x="26" y={waterY} width="168" height={198 - waterY} fill={`url(#${waterGradientId})`} />
          <path d={d1} fill={`url(#${waterGradientId})`} opacity="0.97">
            <animate attributeName="d" dur="2.7s" repeatCount="indefinite" values={`${d1};${d2};${d1}`} />
          </path>

          <circle cx="74" cy={bubbleStart} r="2.8" fill={colors.foam} opacity="0">
            <animate attributeName="cy" dur="2.5s" repeatCount="indefinite" values={`${bubbleStart};${bubblePeak};${bubbleStart}`} />
            <animate attributeName="opacity" dur="2.5s" repeatCount="indefinite" values="0;0.85;0" />
          </circle>
          <circle cx="112" cy={bubbleStart + 8} r="3.5" fill={colors.foam} opacity="0">
            <animate attributeName="cy" dur="2.9s" repeatCount="indefinite" values={`${bubbleStart + 8};${bubblePeak - 2};${bubbleStart + 8}`} />
            <animate attributeName="opacity" dur="2.9s" repeatCount="indefinite" values="0;0.8;0" />
          </circle>
          <circle cx="148" cy={bubbleStart + 3} r="2.4" fill={colors.foam} opacity="0">
            <animate attributeName="cy" dur="2.2s" repeatCount="indefinite" values={`${bubbleStart + 3};${bubblePeak + 3};${bubbleStart + 3}`} />
            <animate attributeName="opacity" dur="2.2s" repeatCount="indefinite" values="0;0.75;0" />
          </circle>
        </g>

        <circle cx="110" cy="110" r="84" fill="none" stroke="#ffffff" strokeOpacity="0.65" strokeWidth="1.3" />
        <ellipse cx="92" cy="78" rx="58" ry="42" fill={`url(#${highlightGradientId})`} />
        <circle cx="110" cy="110" r="95" fill={colors.glow} opacity={safePercent > 2 ? 0.26 : 0} />
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[44px] font-black leading-none tracking-tight text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.45)]">
          {Math.round(safePercent)}%
        </span>
        {phaseName ? (
          <span className="mt-1 max-w-[180px] truncate text-center text-[11px] font-bold uppercase tracking-[0.18em] text-white/95 drop-shadow-[0_2px_8px_rgba(0,0,0,0.42)]">
            {phaseName}
          </span>
        ) : (
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.42)]">
            Processing
          </span>
        )}
        {totalPhases && totalPhases > 1 && phaseIndex ? (
          <div className="mt-2 flex gap-1.5">
            {Array.from({ length: totalPhases }, (_, i) => (
              <div
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                  i + 1 <= phaseIndex ? 'bg-white scale-110' : 'bg-white/30'
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
