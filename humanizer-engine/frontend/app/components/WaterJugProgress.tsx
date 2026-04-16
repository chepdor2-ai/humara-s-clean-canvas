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
    return phaseName.replace(/^Phase\s+\d+\/\d+\s*[–-]\s*/i, '').trim();
  }, [phaseName]);

  const clipId = `water_clip_${uid}`;
  const glassGradientId = `glass_gradient_${uid}`;
  const waterGradientId = `water_gradient_${uid}`;
  const highlightGradientId = `highlight_gradient_${uid}`;
  const surfaceGradientId = `surface_gradient_${uid}`;

  const innerTop = 30;
  const innerBottom = 190;
  const fillHeight = ((innerBottom - innerTop) * safePercent) / 100;
  const waterY = innerBottom - fillHeight;

  const waveAmplitude = Math.max(3, 10 - safePercent * 0.06);
  const secondaryWaveAmplitude = Math.max(2, waveAmplitude * 0.62);
  const d1 = `M26 ${waterY} C 52 ${waterY - waveAmplitude}, 78 ${waterY + waveAmplitude}, 110 ${waterY} C 138 ${waterY - waveAmplitude}, 164 ${waterY + waveAmplitude}, 194 ${waterY} L194 198 L26 198 Z`;
  const d2 = `M26 ${waterY} C 52 ${waterY + waveAmplitude}, 78 ${waterY - waveAmplitude}, 110 ${waterY} C 138 ${waterY + waveAmplitude}, 164 ${waterY - waveAmplitude}, 194 ${waterY} L194 198 L26 198 Z`;
  const d3 = `M26 ${waterY + 4} C 50 ${waterY - secondaryWaveAmplitude}, 86 ${waterY + secondaryWaveAmplitude}, 120 ${waterY + 4} C 148 ${waterY - secondaryWaveAmplitude}, 172 ${waterY + secondaryWaveAmplitude}, 194 ${waterY + 4} L194 198 L26 198 Z`;
  const d4 = `M26 ${waterY + 4} C 50 ${waterY + secondaryWaveAmplitude}, 86 ${waterY - secondaryWaveAmplitude}, 120 ${waterY + 4} C 148 ${waterY + secondaryWaveAmplitude}, 172 ${waterY - secondaryWaveAmplitude}, 194 ${waterY + 4} L194 198 L26 198 Z`;

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
      <div className="pointer-events-none absolute inset-[-22px] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.22)_0%,rgba(45,212,191,0.12)_38%,transparent_72%)] blur-2xl animate-[glowPulse_4.2s_ease-in-out_infinite]" />
      <div className="pointer-events-none absolute inset-[-10px] rounded-full border border-white/12 dark:border-cyan-300/12 animate-[spin_24s_linear_infinite]" />
      <svg width={size} height={size} viewBox="0 0 220 220" className="relative z-10 block drop-shadow-[0_20px_36px_rgba(2,8,23,0.34)] animate-[float_6.5s_ease-in-out_infinite]">
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
          <linearGradient id={surfaceGradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.12" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.12" />
          </linearGradient>
        </defs>

        <circle cx="110" cy="110" r="92" fill={`url(#${glassGradientId})`} stroke="#cbd5e1" strokeWidth="2.5" />

        <g clipPath={`url(#${clipId})`}>
          <rect x="26" y={waterY} width="168" height={198 - waterY} fill={`url(#${waterGradientId})`} />
          <path d={d1} fill={`url(#${waterGradientId})`} opacity="0.97">
            <animate attributeName="d" dur="2.7s" repeatCount="indefinite" values={`${d1};${d2};${d1}`} />
          </path>
          <path d={d3} fill={`url(#${surfaceGradientId})`} opacity="0.32">
            <animate attributeName="d" dur="4.1s" repeatCount="indefinite" values={`${d3};${d4};${d3}`} />
          </path>
          <ellipse cx="110" cy={Math.max(innerTop + 8, waterY + 2)} rx="73" ry="7" fill={colors.foam} opacity="0.2">
            <animate attributeName="opacity" dur="3.8s" repeatCount="indefinite" values="0.14;0.28;0.14" />
          </ellipse>

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
          <circle cx="96" cy={bubbleStart + 14} r="2.1" fill={colors.foam} opacity="0">
            <animate attributeName="cy" dur="3.2s" repeatCount="indefinite" values={`${bubbleStart + 14};${bubblePeak - 6};${bubbleStart + 14}`} />
            <animate attributeName="opacity" dur="3.2s" repeatCount="indefinite" values="0;0.68;0" />
          </circle>
          <circle cx="132" cy={bubbleStart + 10} r="1.9" fill={colors.foam} opacity="0">
            <animate attributeName="cy" dur="2.7s" repeatCount="indefinite" values={`${bubbleStart + 10};${bubblePeak - 10};${bubbleStart + 10}`} />
            <animate attributeName="opacity" dur="2.7s" repeatCount="indefinite" values="0;0.7;0" />
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
        <span className={`mt-1 max-w-[180px] text-center text-white/95 drop-shadow-[0_2px_8px_rgba(0,0,0,0.42)] ${displayPhaseName === 'Complete' ? 'truncate text-[11px] font-bold uppercase tracking-[0.18em]' : 'line-clamp-2 text-[10px] font-semibold tracking-[0.08em]'}`}>
          {displayPhaseName}
        </span>
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
