import { describe, expect, it } from 'vitest';
import { sqName } from '../src/engine/core/coords';
import { generateEncounter, validateEncounter } from '../src/engine/encounters/generator';
import { createEncounter } from '../src/engine/encounters/setup';
import { formatBalanceReport, hotspots, runBalance } from '../src/engine/run/balance';
import { encounter, setupOf, sq, standardPlacements } from './helpers';

const gen = (templateId: string, act: number, kind: 'combat' | 'elite', seed: string) =>
  generateEncounter(
    { seed, act, kind, templateId, difficulty: 0.5, rules: { upgrades: [], affixes: [] }, roster: standardPlacements(), mutations: [], deploymentTop: 1 },
    { validate: false },
  );

describe('headless balance simulation (M6)', () => {
  it('aggregates seeded runs into a deterministic, replayable report', () => {
    const opts = { seeds: 2, policies: ['any'], maxActs: 1, prefix: 'bal-test-' };
    const report = runBalance(opts);
    const p = report.policies[0];
    expect(p.runs).toBe(2);
    expect(p.encounters.reduce((n, e) => n + e.played, 0)).toBeGreaterThan(0);
    for (const e of p.encounters) {
      expect(e.lost).toBeLessThanOrEqual(e.played);
      expect(Object.values(e.reasons).reduce((a, b) => a + b, 0)).toBe(e.lost);
    }
    expect(hotspots(p, 0)).toHaveLength(p.encounters.filter((e) => e.played >= 4).length);
    const md = formatBalanceReport(report);
    expect(md).toContain('| any |');
    expect(md).toContain('Losses by reason');
    expect(runBalance(opts)).toEqual(report);
  });
});

describe('tuning rules (M6)', () => {
  it('King hunters strike the King and net the squares it could step to', () => {
    const s = encounter({
      player: [['king', 'e4']],
      enemy: [
        ['rook', 'h4'],
        ['bishop', 'a8'],
        ['rook', 'a3'],
        ['king', 'h8'],
      ],
      config: { objective: { type: 'SURVIVAL' }, profile: { kind: 'hunter', target: 'king' }, enemyActions: 3, turnLimit: 6 },
    });
    const strikes = s.intents.filter((i) => i.to === sq('e4'));
    expect(strikes).toHaveLength(1);
    const escapes = ['d3', 'e3', 'f3', 'd4', 'f4', 'd5', 'e5', 'f5'].map(sq);
    const nets = s.intents.filter((i) => escapes.includes(i.to));
    expect(nets.length, `intents: ${s.intents.map((i) => `${sqName(i.from)}-${sqName(i.to)}`).join(' ')}`).toBe(2);
  });

  it('elites allow an extra turn on timed objectives, never on hold-out ones', () => {
    const combat = gen('skirmish', 1, 'combat', 'elite-turns');
    const elite = gen('skirmish', 1, 'elite', 'elite-turns');
    expect(elite.setup.config.turnLimit).toBe(combat.setup.config.turnLimit! + 1);
    const race = gen('pawn_race', 2, 'elite', 'elite-race');
    expect(race.setup.config.objective.countdown).toBe(race.setup.config.turnLimit);
    expect(gen('last_stand', 1, 'elite', 'elite-hold').setup.config.turnLimit).toBe(gen('last_stand', 1, 'combat', 'elite-hold').setup.config.turnLimit);
  });

  it('a hold-out encounter an idle player survives is rejected as trivial', () => {
    const setup = setupOf({
      player: [
        ['king', 'e1'],
        ['pawn', 'e2'],
      ],
      enemy: [['pawn', 'a7']],
      config: { objective: { type: 'SURVIVAL' }, profile: { kind: 'hunter', target: 'king' }, turnLimit: 3 },
    });
    expect(validateEncounter(setup, { playouts: 2 }).reasons).toContain('survivable without acting');
  });

  it('Last Stand ambushers drop in near the King, telegraphed from the start', () => {
    const g = gen('last_stand', 2, 'combat', 'ambush');
    expect(g.setup.waves.length).toBeGreaterThanOrEqual(3);
    for (const w of g.setup.waves) for (const p of w.pieces) expect(p.sq >> 3).toBeLessThanOrEqual(3);
    const s = createEncounter(g.setup);
    expect(s.telegraphs.some((t) => t.kind === 'reinforcements')).toBe(true);
  });

  it('from Act II the Breakout runner carries a Ward', () => {
    for (const [act, wards] of [
      [1, 0],
      [2, 1],
      [3, 1],
    ]) {
      const s = createEncounter(gen('breakout', act, 'combat', `runner-${act}`).setup);
      const runner = Object.values(s.pieces).find((p) => p.tags.includes('escapee'))!;
      expect(runner.wards).toBe(wards);
    }
  });
});
