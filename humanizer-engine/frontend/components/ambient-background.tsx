export function AmbientBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Base soft gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] via-transparent to-transparent dark:from-primary/[0.08]" />
      {/* Drifting blobs */}
      <div className="ambient-blob absolute -left-40 top-0 h-[520px] w-[520px] rounded-full bg-primary/20 blur-[140px] dark:bg-primary/25" />
      <div className="ambient-blob-alt absolute -right-40 top-[30%] h-[480px] w-[480px] rounded-full bg-cyan-400/15 blur-[140px] dark:bg-cyan-400/20" />
      <div className="ambient-blob-slow absolute left-[40%] bottom-0 h-[420px] w-[420px] rounded-full bg-amber-400/10 blur-[140px] dark:bg-amber-400/10" />
      {/* Fine grain */}
      <div className="absolute inset-0 opacity-[0.025] mix-blend-overlay dark:opacity-[0.05]">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full">
          <filter id="noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#noise)" />
        </svg>
      </div>
    </div>
  )
}
