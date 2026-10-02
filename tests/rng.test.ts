import { describe, expect, it } from 'vitest';
import { deriveStream, Rng } from '../src/engine/rng';

describe('seeded PRNG', () => {
  it('is deterministic for the same seed', () => {
    const a = Rng.fromSeed('alpha');
    const b = Rng.fromSeed('alpha');
    const xs = Array.from({ length: 50 }, () => a.nextU32());
    const ys = Array.from({ length: 50 }, () => b.nextU32());
    expect(xs).toEqual(ys);
  });

  it('differs across seeds and labels', () => {
    expect(deriveStream('s', 'tier:1')).not.toEqual(deriveStream('s', 'offer:1:0:0'));
    expect(deriveStream('s1', 'map')).not.toEqual(deriveStream('s2', 'map'));
  });

  it('restores from saved state', () => {
    const r = Rng.fromSeed('save');
    r.float();
    const saved = r.state();
    const next = r.float();
    expect(new Rng(saved).float()).toBe(next);
  });

  it('produces roughly uniform ints', () => {
    const r = Rng.fromSeed('uniform');
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 6000; i++) counts[r.int(6)]++;
    for (const c of counts) expect(c).toBeGreaterThan(850);
  });
});
