/**
 * Seeded PRNG (sfc32) with named, independent streams (D6).
 *
 * Engine code must never call Math.random(). Each stream's state is a plain
 * 4-tuple so it can be stored in immutable game state and serialized.
 */
export type RngState = readonly [number, number, number, number];

export const STREAM_NAMES = ['map', 'offers', 'encounterGen', 'enemyAI', 'events'] as const;
export type StreamName = (typeof STREAM_NAMES)[number];

/** cyrb128 string hash → four 32-bit seeds. */
export function hashSeed(str: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Derive an independent stream state from a seed string and a label. */
export function deriveStream(seed: string, label: string): RngState {
  const rng = new Rng(hashSeed(`${seed}::${label}`));
  // Warm up so similar labels decorrelate.
  for (let i = 0; i < 12; i++) rng.nextU32();
  return rng.state();
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(state: RngState) {
    [this.a, this.b, this.c, this.d] = state;
  }

  static fromSeed(seed: string, label = 'root'): Rng {
    return new Rng(deriveStream(seed, label));
  }

  state(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }

  nextU32(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Float in [0, 1). */
  float(): number {
    return this.nextU32() / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    if (n <= 0) return 0;
    return Math.floor(this.float() * n);
  }

  /** Integer in [lo, hi] inclusive. */
  range(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }

  chance(p: number): boolean {
    return this.float() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty array');
    return items[this.int(items.length)];
  }

  /** Weighted pick; weights <= 0 are never chosen. Returns -1 if all weights are 0. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) if (w > 0) total += w;
    if (total <= 0) return -1;
    let roll = this.float() * total;
    for (let i = 0; i < weights.length; i++) {
      if (weights[i] <= 0) continue;
      roll -= weights[i];
      if (roll < 0) return i;
    }
    for (let i = weights.length - 1; i >= 0; i--) if (weights[i] > 0) return i;
    return -1;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

export type StreamStates = Record<StreamName, RngState>;

export function createStreams(seed: string): StreamStates {
  const out = {} as Record<StreamName, RngState>;
  for (const name of STREAM_NAMES) out[name] = deriveStream(seed, name);
  return out;
}

/**
 * Run `fn` with a stream and return its result plus the updated stream map.
 * Other streams are untouched, so consuming one never shifts another.
 */
export function withStream<T>(streams: StreamStates, name: StreamName, fn: (rng: Rng) => T): [T, StreamStates] {
  const rng = new Rng(streams[name]);
  const result = fn(rng);
  return [result, { ...streams, [name]: rng.state() }];
}
