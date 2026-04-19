'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ── Hexagonal Health Tracker ──────────────────────────────────────────
   Dynamic honeycomb grid that visualises pipeline phases in real time.
   Each pipeline layer (engine step, Nuru passes, cleanup, etc.) gets
   its own centered row of hexagons.  Row width adapts to cell count.

   Cell states:
     pending  → dim, translucent
     active   → pulsing brand glow
     success  → solid brand gradient
     error    → red pulse
   ──────────────────────────────────────────────────────────────────── */

export type CellStatus = 'pending' | 'active' | 'success' | 'error';

export interface HexCell {
  id: string;
  label: string;
  status: CellStatus;
}

export interface PipelineLayer {
  label: string;
  cells: HexCell[];
}

interface HexagonalHealthProps {
  layers: PipelineLayer[];
  /** Compact mode for tight spaces (smaller hexagons) */
  compact?: boolean;
}

/* ── Brand palette ── */
const BRAND = {
  cyan:  'rgb(8, 145, 178)',
  teal:  'rgb(20, 184, 166)',
  sky:   'rgb(14, 165, 233)',
} as const;

/* ── Hex geometry ── */
const HEX_SIZE   = 22;   // "radius" of each hexagon (center to vertex)
const HEX_GAP    = 4;    // gap between hexagons
const HEX_W      = HEX_SIZE * 2;
const HEX_H      = HEX_SIZE * Math.sqrt(3);
const CELL_PITCH = HEX_W + HEX_GAP; // horizontal distance center-to-center

/* ── hexagon path (pointy-top) ── */
function hexPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(' ');
}

/* ── Status-based styling ── */
function cellFill(status: CellStatus): string {
  switch (status) {
    case 'success': return 'url(#hexSuccessGrad)';
    case 'active':  return 'url(#hexActiveGrad)';
    case 'error':   return 'url(#hexErrorGrad)';
    case 'pending':
    default:        return 'rgba(30, 41, 59, 0.35)';
  }
}

function cellStroke(status: CellStatus): string {
  switch (status) {
    case 'success': return 'rgba(20, 184, 166, 0.7)';
    case 'active':  return 'rgba(8, 145, 178, 0.9)';
    case 'error':   return 'rgba(239, 68, 68, 0.8)';
    case 'pending':
    default:        return 'rgba(100, 116, 139, 0.2)';
  }
}

function cellGlow(status: CellStatus): string {
  switch (status) {
    case 'success': return `drop-shadow(0 0 6px rgba(20,184,166,0.5))`;
    case 'active':  return `drop-shadow(0 0 10px rgba(8,145,178,0.7))`;
    case 'error':   return `drop-shadow(0 0 8px rgba(239,68,68,0.6))`;
    case 'pending':
    default:        return 'none';
  }
}

/* ────────────────────────────────────────────────────────────────────── */

export function HexagonalHealth({ layers, compact = false }: HexagonalHealthProps) {
  const scale = compact ? 0.7 : 1;
  const scaledSize   = HEX_SIZE * scale;
  const scaledH      = HEX_H * scale;
  const scaledPitch  = CELL_PITCH * scale;
  const ROW_GAP      = (compact ? 8 : 14) * scale;
  const LABEL_H      = 14 * scale;

  // Compute layout dimensions
  const layout = useMemo(() => {
    let totalHeight = 0;
    const rowMeta: { y: number; cells: { cx: number; cy: number; cell: HexCell }[]; label: string; width: number }[] = [];

    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li];
      const n = layer.cells.length;
      if (n === 0) continue;

      const rowWidth = n * scaledPitch;
      const rowY = totalHeight + LABEL_H + scaledH / 2;

      const cells = layer.cells.map((cell, ci) => {
        const cx = ci * scaledPitch + scaledPitch / 2;
        return { cx, cy: scaledH / 2, cell };
      });

      rowMeta.push({ y: totalHeight, cells, label: layer.label, width: rowWidth });
      totalHeight += LABEL_H + scaledH + ROW_GAP;
    }

    // Find max width for centering
    const maxWidth = Math.max(...rowMeta.map(r => r.width), 120);

    return { rowMeta, totalHeight: Math.max(totalHeight - ROW_GAP, 40), maxWidth };
  }, [layers, scaledPitch, scaledH, ROW_GAP, LABEL_H]);

  if (layers.length === 0 || layers.every(l => l.cells.length === 0)) {
    return null;
  }

  return (
    <div className="flex flex-col items-center w-full overflow-hidden">
      <svg
        width="100%"
        viewBox={`0 0 ${layout.maxWidth + 8} ${layout.totalHeight + 4}`}
        className="max-w-full"
        style={{ maxHeight: compact ? 180 : 260 }}
      >
        <defs>
          {/* Success gradient */}
          <linearGradient id="hexSuccessGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={BRAND.cyan} stopOpacity={0.85} />
            <stop offset="100%" stopColor={BRAND.teal} stopOpacity={0.95} />
          </linearGradient>
          {/* Active gradient */}
          <linearGradient id="hexActiveGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={BRAND.cyan} stopOpacity={0.6} />
            <stop offset="100%" stopColor={BRAND.sky} stopOpacity={0.7} />
          </linearGradient>
          {/* Error gradient */}
          <linearGradient id="hexErrorGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(239, 68, 68)" stopOpacity={0.7} />
            <stop offset="100%" stopColor="rgb(185, 28, 28)" stopOpacity={0.85} />
          </linearGradient>
          {/* Glow filter for active cells */}
          <filter id="hexGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Pulse animation for active cells */}
          <filter id="hexPulse" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {layout.rowMeta.map((row, ri) => {
          const offsetX = (layout.maxWidth - row.width) / 2 + 4;

          return (
            <g key={ri} transform={`translate(${offsetX}, ${row.y})`}>
              {/* Row label */}
              <text
                x={row.width / 2}
                y={LABEL_H - 3}
                textAnchor="middle"
                className="fill-slate-400 dark:fill-zinc-500"
                style={{
                  fontSize: `${Math.max(7, 9 * scale)}px`,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase' as const,
                }}
              >
                {row.label}
              </text>

              {/* Connecting lines between cells in this row */}
              {row.cells.slice(0, -1).map((c, ci) => {
                const next = row.cells[ci + 1];
                const bothDone = c.cell.status === 'success' && next.cell.status === 'success';
                const oneActive = c.cell.status === 'active' || next.cell.status === 'active';
                return (
                  <line
                    key={`line-${ci}`}
                    x1={c.cx + scaledSize * 0.8}
                    y1={LABEL_H + c.cy}
                    x2={next.cx - scaledSize * 0.8}
                    y2={LABEL_H + next.cy}
                    stroke={bothDone ? BRAND.teal : oneActive ? BRAND.cyan : 'rgba(100,116,139,0.15)'}
                    strokeWidth={bothDone ? 1.5 : 1}
                    strokeOpacity={bothDone ? 0.6 : oneActive ? 0.4 : 0.2}
                    strokeDasharray={bothDone ? 'none' : '2 3'}
                  />
                );
              })}

              {/* Hexagon cells */}
              {row.cells.map((c, ci) => {
                const { cx, cy, cell } = c;
                const isActive = cell.status === 'active';
                const isSuccess = cell.status === 'success';
                const isError = cell.status === 'error';

                return (
                  <g key={cell.id} transform={`translate(0, ${LABEL_H})`}>
                    {/* Glow ring for active/success */}
                    {(isActive || isSuccess) && (
                      <polygon
                        points={hexPath(cx, cy, scaledSize + 2)}
                        fill="none"
                        stroke={isActive ? BRAND.cyan : BRAND.teal}
                        strokeWidth={0.8}
                        strokeOpacity={0.3}
                        filter="url(#hexGlow)"
                      >
                        {isActive && (
                          <animate
                            attributeName="stroke-opacity"
                            values="0.2;0.6;0.2"
                            dur="1.5s"
                            repeatCount="indefinite"
                          />
                        )}
                      </polygon>
                    )}

                    {/* Main hexagon */}
                    <polygon
                      points={hexPath(cx, cy, scaledSize)}
                      fill={cellFill(cell.status)}
                      stroke={cellStroke(cell.status)}
                      strokeWidth={isActive ? 1.5 : 1}
                      style={{ filter: cellGlow(cell.status) }}
                    >
                      {isActive && (
                        <animate
                          attributeName="fill-opacity"
                          values="0.7;1;0.7"
                          dur="1.2s"
                          repeatCount="indefinite"
                        />
                      )}
                    </polygon>

                    {/* Inner highlight for completed */}
                    {isSuccess && (
                      <polygon
                        points={hexPath(cx, cy, scaledSize * 0.6)}
                        fill="rgba(255,255,255,0.1)"
                        stroke="none"
                      />
                    )}

                    {/* Cell label (number or short name) */}
                    <text
                      x={cx}
                      y={cy + 1}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className={`${
                        isSuccess || isActive
                          ? 'fill-white'
                          : isError
                            ? 'fill-red-200'
                            : 'fill-slate-500 dark:fill-zinc-600'
                      }`}
                      style={{
                        fontSize: `${Math.max(6, 8 * scale)}px`,
                        fontWeight: isActive ? 800 : 600,
                        pointerEvents: 'none',
                      }}
                    >
                      {cell.label.length > 4 ? cell.label.slice(0, 3) : cell.label}
                    </text>

                    {/* Checkmark for success */}
                    {isSuccess && (
                      <text
                        x={cx}
                        y={cy + scaledSize * 0.4 + 6}
                        textAnchor="middle"
                        style={{ fontSize: `${6 * scale}px` }}
                        className="fill-emerald-300/80"
                      >
                        ✓
                      </text>
                    )}

                    {/* Error X for failed */}
                    {isError && (
                      <text
                        x={cx}
                        y={cy + scaledSize * 0.4 + 6}
                        textAnchor="middle"
                        style={{ fontSize: `${6 * scale}px` }}
                        className="fill-red-300/80"
                      >
                        ✗
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Vertical connecting lines between rows */}
        {layout.rowMeta.slice(0, -1).map((row, ri) => {
          const nextRow = layout.rowMeta[ri + 1];
          if (!nextRow) return null;

          // Connect center of current row's last active/success cell to center of next row
          const rowCenterX = layout.maxWidth / 2 + 4;
          const y1 = row.y + LABEL_H + scaledH;
          const y2 = nextRow.y + LABEL_H;

          const rowDone = row.cells.every(c => c.cell.status === 'success');

          return (
            <line
              key={`vline-${ri}`}
              x1={rowCenterX}
              y1={y1}
              x2={rowCenterX}
              y2={y2}
              stroke={rowDone ? BRAND.teal : 'rgba(100,116,139,0.15)'}
              strokeWidth={1}
              strokeOpacity={rowDone ? 0.5 : 0.2}
              strokeDasharray={rowDone ? 'none' : '3 4'}
            />
          );
        })}
      </svg>
    </div>
  );
}

/* ── Pipeline configuration per engine ─────────────────────────────── */
/* These define the hex grid layout for each engine's processing
   pipeline. The backend phase events drive which cells transition
   from pending → active → success/error.                              */

export interface EnginePipelineConfig {
  layers: { label: string; count: number; cellLabels?: string[] }[];
}

/** Pre-defined pipeline layouts for engines with multi-phase processing */
export const ENGINE_PIPELINE_CONFIGS: Record<string, EnginePipelineConfig> = {
  // ── Core Engines ──
  easy: {  // Swift
    layers: [
      { label: 'Engine', count: 1, cellLabels: ['EZ'] },
      { label: 'Nuru 2.0', count: 10, cellLabels: ['1','2','3','4','5','6','7','8','9','10'] },
      { label: 'Clean', count: 2, cellLabels: ['CLN', 'GRM'] },
    ],
  },
  ninja_1: {  // Ninja
    layers: [
      { label: 'Engine', count: 4, cellLabels: ['LLM', 'H20', 'NRU', 'SNR'] },
      { label: 'Nuru 2.0', count: 10, cellLabels: ['1','2','3','4','5','6','7','8','9','10'] },
      { label: 'Nuru Targeted', count: 5, cellLabels: ['T1','T2','T3','T4','T5'] },
      { label: 'Clean', count: 2, cellLabels: ['CLN', 'GRM'] },
    ],
  },
  antipangram: {  // Pangram
    layers: [
      { label: 'Forensic', count: 1, cellLabels: ['APG'] },
    ],
  },

  // ── Detection Control ──
  humara_v3_3: {  // Humarin
    layers: [
      { label: 'Engine', count: 1, cellLabels: ['H24'] },
      { label: 'Nuru 2.0', count: 10, cellLabels: ['1','2','3','4','5','6','7','8','9','10'] },
      { label: 'Clean', count: 2, cellLabels: ['CLN', 'GRM'] },
    ],
  },
  oxygen: {  // Oxygen
    layers: [
      { label: 'Engine', count: 1, cellLabels: ['OXY'] },
    ],
  },
  king: {  // King
    layers: [
      { label: 'Engine', count: 3, cellLabels: ['RW', 'AUD', 'REV'] },
      { label: 'Nuru 2.0', count: 10, cellLabels: ['1','2','3','4','5','6','7','8','9','10'] },
      { label: 'Clean', count: 2, cellLabels: ['CLN', 'GRM'] },
    ],
  },
  nuru_v2: {  // Nuru
    layers: [
      { label: 'Restructure', count: 1, cellLabels: ['RST'] },
      { label: 'Nuru 2.0', count: 10, cellLabels: ['1','2','3','4','5','6','7','8','9','10'] },
      { label: 'Clean', count: 2, cellLabels: ['CLN', 'GRM'] },
    ],
  },
  ghost_pro_wiki: {  // Ghost
    layers: [
      { label: 'Wikipedia', count: 1, cellLabels: ['WIK'] },
      { label: 'Nuru 2.0', count: 10, cellLabels: ['1','2','3','4','5','6','7','8','9','10'] },
      { label: 'Nuru Targeted', count: 5, cellLabels: ['T1','T2','T3','T4','T5'] },
    ],
  },

  // ── Advanced Engines ──
  ninja_3: {  // Alpha
    layers: [
      { label: 'Engine', count: 2, cellLabels: ['WIK', 'H20'] },
      { label: 'Nuru 2.0', count: 10, cellLabels: ['1','2','3','4','5','6','7','8','9','10'] },
      { label: 'Clean', count: 2, cellLabels: ['CLN', 'GRM'] },
    ],
  },
  ninja_2: {  // Beta
    layers: [
      { label: 'Engine', count: 2, cellLabels: ['EZ', 'H20'] },
      { label: 'Nuru 2.0', count: 10, cellLabels: ['1','2','3','4','5','6','7','8','9','10'] },
      { label: 'Clean', count: 2, cellLabels: ['CLN', 'GRM'] },
    ],
  },
  ninja_5: {  // Omega
    layers: [
      { label: 'Engine', count: 2, cellLabels: ['EZ', 'H24'] },
      { label: 'Nuru 2.0', count: 10, cellLabels: ['1','2','3','4','5','6','7','8','9','10'] },
      { label: 'Clean', count: 2, cellLabels: ['CLN', 'GRM'] },
    ],
  },
  ghost_trial_2: {  // Specter
    layers: [
      { label: 'Engine', count: 2, cellLabels: ['H24', 'H20'] },
      { label: 'Nuru 2.0', count: 10, cellLabels: ['1','2','3','4','5','6','7','8','9','10'] },
      { label: 'Clean', count: 2, cellLabels: ['CLN', 'GRM'] },
    ],
  },
  phantom: {  // Phantom
    layers: [
      { label: 'Engine', count: 1, cellLabels: ['H24'] },
      { label: 'Nuru 2.0', count: 10, cellLabels: ['1','2','3','4','5','6','7','8','9','10'] },
      { label: 'Clean', count: 2, cellLabels: ['CLN', 'GRM'] },
      { label: 'Forensic', count: 1, cellLabels: ['APG'] },
    ],
  },
};

/**
 * Build PipelineLayer[] from engine config + current phase state.
 * @param engineId  Engine internal ID
 * @param currentPhase  1-indexed current phase from SSE
 * @param totalPhases   Total phases from SSE
 * @param phaseFailed   Whether the current phase failed
 */
export function buildPipelineLayers(
  engineId: string,
  currentPhase: number,
  totalPhases: number,
  phaseFailed: boolean = false,
): PipelineLayer[] {
  const config = ENGINE_PIPELINE_CONFIGS[engineId];

  if (!config) {
    // Fallback: single row with totalPhases cells
    const cells: HexCell[] = [];
    for (let i = 0; i < Math.max(totalPhases, 1); i++) {
      cells.push({
        id: `p${i}`,
        label: `${i + 1}`,
        status: i + 1 < currentPhase ? 'success'
              : i + 1 === currentPhase ? (phaseFailed ? 'error' : 'active')
              : 'pending',
      });
    }
    return [{ label: 'Pipeline', cells }];
  }

  // Map config layers to PipelineLayer[] with status tracking
  const layers: PipelineLayer[] = [];
  let globalCellIndex = 0;

  // Flatten all cells across layers to map against currentPhase
  const totalCells = config.layers.reduce((sum, l) => sum + l.count, 0);

  // Map currentPhase (1-indexed for SSE phases) to cell index
  // SSE phases correspond to the phase pipeline (e.g., Phase 1/5, Phase 2/5...)
  // We distribute them across our layers proportionally
  // Simpler approach: treat each cell as a sequential step
  for (const layerConfig of config.layers) {
    const cells: HexCell[] = [];
    for (let i = 0; i < layerConfig.count; i++) {
      const cellIdx = globalCellIndex;
      const label = layerConfig.cellLabels?.[i] ?? `${i + 1}`;

      // Map phase index to cell status
      // currentPhase from SSE is 1-indexed and maps to our totalPhases
      // Scale our cell indices to the SSE phase range
      const cellPhase = Math.floor((cellIdx / totalCells) * totalPhases) + 1;
      const nextCellPhase = Math.floor(((cellIdx + 1) / totalCells) * totalPhases) + 1;

      let status: CellStatus = 'pending';
      if (currentPhase > nextCellPhase) {
        status = 'success';
      } else if (currentPhase >= cellPhase && currentPhase <= nextCellPhase) {
        status = phaseFailed ? 'error' : 'active';
      }

      cells.push({ id: `${layerConfig.label}-${i}`, label, status });
      globalCellIndex++;
    }
    layers.push({ label: layerConfig.label, cells });
  }

  return layers;
}
