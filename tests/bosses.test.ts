import { describe, expect, it } from 'vitest';
import { sqOf } from '../src/engine/core/coords';
import type { EncounterState } from '../src/engine/core/state';
import { endTurn as engineEndTurn } from '../src/engine/encounters/flow';
import { generateEncounter } from '../src/engine/encounters/generator';
import { createEncounter } from '../src/engine/encounters/setup';
import { POLICIES, simulateRun } from '../src/engine/run/sim';
import type { RunState } from '../src/engine/run/types';
import { previewIntents } from '../src/engine/enemy/preview';
import { createGenContext, pieceMoves } from '../src/engine/moves/generate';
import { makeHypo, mutableCopy, unmakeHypo } from '../src/engine/moves/hypo';
import { encounter, logText, patch, sq, standardPlacements } from './helpers';

const endTurn = (s: EncounterState): EncounterState => engineEndTurn(s).state;

function boss(id: string, act: number, seed = 'boss-test'): EncounterState {
  const g = generateEncounter(
    { seed, act, kind: 'boss', templateId: id, difficulty: 1, rules: { upgrades: [], affixes: [] }, roster: standardPlacements(), mutations: [], deploymentTop: 1 },
    { validate: false },
  );
  return createEncounter(g.setup);
}

describe('bosses (Part E)', () => {
  it('The Fortress King telegraphs Sanctuaries a turn ahead, then raises them', () => {
    let s = boss('fortress_king', 1);
    expect(s.config.bossId).toBe('fortress_king');
    s = endTurn(endTurn(s));
    const tele = s.telegraphs.find((t) => t.id === 'fortress-sanctuary');
    expect(tele?.squares).toHaveLength(2);
    s = endTurn(s);
    expect(s.marks.filter((m) => m.type === 'ENEMY_SANCTUARY').map((m) => m.sq).sort()).toEqual([...tele!.squares].sort());
    expect(s.telegraphs.some((t) => t.id === 'fortress-sanctuary')).toBe(false);
  });

  it('The Tyrant Queen ramps up to three chained intents, plus one for her court', () => {
    let s = boss('tyrant_queen', 2);
    const queen = Object.values(s.pieces).find((p) => p.tags.includes('boss'))!;
    expect(queen.type).toBe('queen');
    expect(queen.wards).toBe(3);
    expect(s.config.objective.type).toBe('ELIMINATION');
    for (const length of [1, 2, 3]) {
      const route = s.intents.filter((i) => i.pieceId === queen.id);
      expect(route).toHaveLength(length);
      expect(route[0].from).toBe(s.pieces[queen.id].sq);
      for (let k = 1; k < route.length; k++) expect(route[k].from).toBe(route[k - 1].to);
      expect(s.intents.filter((i) => i.pieceId !== queen.id)).toHaveLength(1);
      // Every step is previewed from where the previous one leaves her.
      expect(previewIntents(s).every((p) => p.willLand)).toBe(true);
      if (length < 3) {
        s = endTurn(s);
        expect(s.outcome).toBeFalsy();
      }
    }
  });

  it('a blocked step breaks the rest of her route, and she stumbles: one Ward shatters', () => {
    let s = encounter({
      player: [
        ['king', 'a1'],
        ['rook', 'e4'],
      ],
      enemy: [
        ['queen', 'd8', ['boss', 'target']],
        ['king', 'h8'],
      ],
      config: { bossId: 'tyrant_queen', objective: { type: 'ELIMINATION' }, profile: { kind: 'aggressive' } },
    });
    s = patch(s, 'd8', { wards: 2 });
    const queenId = s.board[sq('d8')]!;
    // d8→d4 lands; d4→g4 runs into the Rook on e4; g4→g1 would be reachable from d4, but the route is broken.
    const route: [string, string][] = [
      ['d8', 'd4'],
      ['d4', 'g4'],
      ['g4', 'g1'],
    ];
    s = {
      ...s,
      intents: route.map(([from, to], i) => ({ id: `q${i}`, kind: 'move' as const, pieceId: queenId, pieceType: 'queen' as const, from: sq(from), to: sq(to) })),
    };
    expect(previewIntents(s).map((p) => p.fizzleReason)).toEqual([null, 'path blocked', 'route broken']);
    s = endTurn(s);
    expect(s.pieces[queenId].sq).toBe(sq('d4'));
    expect(s.pieces[queenId].wards).toBe(1);
    expect(logText(s).some((t) => t.includes('route broken'))).toBe(true);
    expect(logText(s).some((t) => t.includes('Ward shatters'))).toBe(true);
  });

  it('hypothetical moves can resolve Ward-blocked captures as the rules do', () => {
    const s = patch(
      encounter({
        player: [
          ['king', 'a1'],
          ['rook', 'd1'],
        ],
        enemy: [
          ['king', 'h8'],
          ['queen', 'd5', ['target']],
        ],
      }),
      'd5',
      { wards: 1 },
    );
    const h = mutableCopy(s);
    const capture = pieceMoves(createGenContext(h), s.board[sq('d1')]!).find((m) => m.to === sq('d5'))!;
    const u = makeHypo(h, capture, { wards: true });
    expect(h.board[sq('d1')]).toBe(s.board[sq('d1')]);
    expect(h.pieces[s.board[sq('d5')]!].wards).toBe(0);
    unmakeHypo(h, u);
    expect(h.pieces[s.board[sq('d5')]!].wards).toBe(1);
    // Without the flag the capture is simply made (cheap planner look-ahead).
    const raw = makeHypo(h, capture);
    expect(h.board[sq('d5')]).toBe(s.board[sq('d1')]);
    unmakeHypo(h, raw);
    expect(h.board).toEqual(s.board);
  });

  it('The Pawn Emperor spawns telegraphed Pawns and mass-promotes when the countdown ends', () => {
    let s = boss('pawn_emperor', 3);
    const pawnsBefore = Object.values(s.pieces).filter((p) => p.side === 'enemy' && p.type === 'pawn').length;
    const spawn = s.telegraphs.find((t) => t.id === 'emperor-spawn')!;
    expect(spawn.squares.length).toBeGreaterThanOrEqual(1);
    // Rank 7 starts full, so the tide spills onto rank 6.
    expect(spawn.squares.every((sq) => sq >= sqOf(0, 5) && sq <= sqOf(7, 6))).toBe(true);
    s = endTurn(s);
    const pawnsAfter = Object.values(s.pieces).filter((p) => p.side === 'enemy' && (p.type === 'pawn' || p.promotedFrom === 'pawn')).length;
    expect(pawnsAfter).toBeGreaterThan(pawnsBefore - 3);
    expect(s.telegraphs.find((t) => t.id === 'emperor-countdown')?.label).toMatch(/Mass promotion in 7/);
    // Fast-forward the countdown.
    s = { ...s, counters: { ...s.counters, 'emperor-countdown': 1 } };
    s = endTurn(s);
    if (!s.outcome) {
      expect(Object.values(s.pieces).some((p) => p.side === 'enemy' && p.type === 'pawn')).toBe(false);
      expect(Object.values(s.pieces).filter((p) => p.side === 'enemy' && p.type === 'queen').length).toBeGreaterThan(3);
    }
  });
});

describe('M5 acceptance: full runs', () => {
  let pawnRuns: RunState[] | null = null;
  let boardRuns: RunState[] | null = null;
  let bishopRuns: RunState[] | null = null;
  const seeds = ['full-0', 'full-1', 'full-2'];
  const runs = (policy: 'pawn' | 'board' | 'bishop') => {
    if (policy === 'pawn') return (pawnRuns ??= seeds.map((s) => simulateRun(s, POLICIES.pawn, { maxActs: 3 }).run));
    if (policy === 'board') return (boardRuns ??= seeds.map((s) => simulateRun(s, POLICIES.board, { maxActs: 3 }).run));
    return (bishopRuns ??= seeds.map((s) => simulateRun(s, POLICIES.bishop, { maxActs: 3 }).run));
  };

  it('a full three-act run is completable', () => {
    const won = runs('pawn').filter((r) => r.result?.outcome === 'victory');
    expect(won.length).toBeGreaterThanOrEqual(1);
    for (const r of won) expect(r.history.some((h) => h.text.includes('final boss falls'))).toBe(true);
  });

  it('a board-control run (mutations + debuffs) plays differently from both piece builds', () => {
    const per = (list: RunState[], f: (r: RunState) => number) => list.reduce((n, r) => n + f(r), 0) / list.reduce((n, r) => n + r.stats.encountersWon + r.stats.encountersLost, 0);
    const imm = (r: RunState) => r.stats.immobilizations;
    const muts = (r: RunState) => r.mutations.length;
    expect(per(runs('board'), imm)).toBeGreaterThan(2 * per(runs('pawn'), imm));
    expect(per(runs('board'), imm)).toBeGreaterThan(2 * per(runs('bishop'), imm));
    expect(per(runs('board'), muts)).toBeGreaterThan(per(runs('pawn'), muts));
    expect(per(runs('board'), muts)).toBeGreaterThan(per(runs('bishop'), muts));
    expect(runs('board').some((r) => r.upgrades.some((u) => u.id.startsWith('debuff_')))).toBe(true);
  });
});
