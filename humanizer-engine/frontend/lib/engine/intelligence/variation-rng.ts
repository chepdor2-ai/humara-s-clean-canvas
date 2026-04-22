/**
 * Per-Call Variation RNG
 * ──────────────────────────────────────────────────────────────────
 * Every humanization call gets its own seeded, xorshift128+ RNG so
 * that two identical inputs produce different humanized outputs on
 * each invocation. Also drives temperature jitter for LLM calls and
 * synonym-candidate ranking tie-breakers across Nuru / AntiPangram /
 * the shared dictionaries.
 *
 * This is the core "different output every time" guarantee. The seed
 * is derived from `Date.now() ^ crypto_random ^ hashText(input)` so
 * two concurrent requests with the same text still diverge.
 * ──────────────────────────────────────────────────────────────────
 */

export interface VariationRNG {
  /** Uniform [0, 1). */
  next(): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** Pick one from a non-empty array. */
  pick<T>(arr: readonly T[]): T;
  /** Pick k distinct elements from arr (k ≤ arr.length). */
  sample<T>(arr: readonly T[], k: number): T[];
  /** Shuffle a copy of the array (Fisher-Yates). */
  shuffle<T>(arr: readonly T[]): T[];
  /** Jitter a center value by ±range, clamped to [min, max]. */
  jitter(center: number, range: number, min: number, max: number): number;
  /** Return the underlying 64-bit seed pair for forwarding. */
  seedPair(): { a: number; b: number };
  /** Fork a child RNG with an independent stream but derived from this seed. */
  fork(label: string): VariationRNG;
}

function mix32(a: number, b: number): number {
  let x = (a ^ (b << 13)) >>> 0;
  x = (x ^ (x >>> 7)) >>> 0;
  x = (x ^ (x << 17)) >>> 0;
  return x >>> 0;
}

function hashStringTo32(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function createXorshift(seedA: number, seedB: number): VariationRNG {
  // Ensure non-zero seeds (xorshift requirement).
  let a = (seedA | 1) >>> 0;
  let b = (seedB | 1) >>> 0;

  const next = (): number => {
    let s1 = a;
    const s0 = b;
    a = s0;
    s1 ^= (s1 << 23) >>> 0;
    s1 = (s1 ^ (s1 >>> 17) ^ s0 ^ (s0 >>> 26)) >>> 0;
    b = s1;
    return ((s1 + s0) >>> 0) / 0x1_0000_0000;
  };

  const int = (n: number): number => {
    if (n <= 0) return 0;
    return Math.floor(next() * n);
  };

  const pick = <T,>(arr: readonly T[]): T => arr[int(arr.length)];

  const shuffle = <T,>(arr: readonly T[]): T[] => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1);
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  };

  const sample = <T,>(arr: readonly T[], k: number): T[] => {
    if (k <= 0 || arr.length === 0) return [];
    if (k >= arr.length) return shuffle(arr);
    return shuffle(arr).slice(0, k);
  };

  const jitter = (center: number, range: number, min: number, max: number): number => {
    const delta = (next() * 2 - 1) * range;
    const value = center + delta;
    if (value < min) return min;
    if (value > max) return max;
    return value;
  };

  const seedPair = () => ({ a, b });

  const fork = (label: string): VariationRNG => {
    const h = hashStringTo32(label);
    return createXorshift(mix32(a, h), mix32(b, ~h >>> 0));
  };

  return { next, int, pick, sample, shuffle, jitter, seedPair, fork };
}

/**
 * Create a per-call RNG. The seed is a blend of:
 *   - Date.now()                 — walltime
 *   - Math.random()              — V8/node randomness
 *   - hash(text)                 — input signature
 *   - hash(extraEntropy ?? "")   — caller-supplied tag
 *
 * This is **deliberately non-deterministic across runs** so each
 * humanization produces distinct output even for identical input.
 */
export function createVariationRNG(
  text: string,
  extraEntropy = "",
): VariationRNG {
  const now = Date.now() >>> 0;
  const nanoish = Math.floor((typeof performance !== "undefined" ? performance.now() : 0) * 1000) >>> 0;
  const rnd1 = Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
  const rnd2 = Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
  const textHash = hashStringTo32(text);
  const extraHash = hashStringTo32(extraEntropy);
  const a = mix32(mix32(now, rnd1), textHash);
  const b = mix32(mix32(nanoish, rnd2), ~extraHash >>> 0);
  return createXorshift(a || 0xDEADBEEF, b || 0xCAFEBABE);
}

/**
 * Create a deterministic RNG from an explicit 64-bit seed pair.
 * Useful for re-deriving a child RNG after a cross-process boundary.
 */
export function createSeededRNG(a: number, b: number): VariationRNG {
  return createXorshift(a || 0xDEADBEEF, b || 0xCAFEBABE);
}

/**
 * Utility: weighted pick using a provided RNG.
 */
export function weightedPick<T>(
  rng: VariationRNG,
  options: Array<{ value: T; weight: number }>,
): T {
  const total = options.reduce((s, o) => s + Math.max(0, o.weight), 0);
  if (total <= 0) return options[0].value;
  let cursor = rng.next() * total;
  for (const opt of options) {
    cursor -= Math.max(0, opt.weight);
    if (cursor <= 0) return opt.value;
  }
  return options[options.length - 1].value;
}
