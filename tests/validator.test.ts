import { parseSq } from '../src/engine/core/coords';
import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../src/data/encounters';
import { generateEncounter, validateEncounter } from '../src/engine/encounters/generator';
import { createEncounter } from '../src/engine/encounters/setup';
import { standardPlacements } from './helpers';
import { Rng } from '../src/engine/rng';
import type { EncounterTemplate } from '../src/engine/encounters/templates';

const SEEDS = Number(process.env.VALIDATOR_SEEDS ?? 500);

function input(templateId: string, seed: string, act: number) {
  return {
    seed,
    act,
    kind: 'combat' as const,
    templateId,
    difficulty: (seed.length % 10) / 10,
    rules: { upgrades: [], affixes: [] },
    roster: standardPlacements(),
    mutations: [],
    deploymentTop: 1,
  };
}

describe('encounter validator (D7)', () => {
  for (const t of TEMPLATES) {
    it(`${t.id}: ${SEEDS} seeds all pass validation or fall back`, () => {
      let fallbacks = 0;
      let totalMs = 0;
      for (let i = 0; i < SEEDS; i++) {
        const act = 1 + (i % 3);
        const g = generateEncounter(input(t.id, `${t.id}-${i}`, act), { playouts: 12, attempts: 4 });
        expect(g.fallback || g.report?.ok).toBe(true);
        // The produced setup always builds into a playable, undecided encounter.
        const s = createEncounter(g.setup, { silent: true });
        expect(s.outcome).toBeNull();
        if (g.fallback) fallbacks++;
        totalMs += g.report?.ms ?? 0;
      }
      // Generation should rarely need the safe variant.
      expect(fallbacks / SEEDS).toBeLessThan(0.15);
      expect(totalMs / SEEDS).toBeLessThan(300);
    });
  }

  it('safe variants are pre-validated for every act', () => {
    for (const t of TEMPLATES as EncounterTemplate[]) {
      for (const act of [1, 2, 3]) {
        const ctx = { rng: Rng.fromSeed(`safe-${t.id}-${act}`), act, kind: 'combat' as const, difficulty: 0.5, occupied: new Set(standardPlacements().map((r) => r.sq!)), deploymentTop: 1, playerKing: parseSq('e1') };
        const out = t.safe(ctx);
        const g = generateEncounter(input(t.id, `safe-${t.id}-${act}`, act), { validate: false });
        const setup = { ...g.setup, enemies: out.enemies, terrain: out.terrain, waves: out.waves, config: { ...g.setup.config, objective: out.objective, turnLimit: out.turnLimit, enemyActions: out.enemyActions, profile: out.profile } };
        const report = validateEncounter(setup, { playouts: 20 });
        expect(report.reasons).toEqual([]);
        expect(report.ok).toBe(true);
      }
    }
  });
});
