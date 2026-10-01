import { describe, expect, it } from 'vitest';
import { parseSq, sqOf } from '../src/engine/core/coords';
import { legalPlacementSquares, validateFormation, zoneOf } from '../src/engine/run/acquire';
import { generateActMap, reachableNodes, validatePaths } from '../src/engine/run/map';
import { generateOffers, mostOwnedTag } from '../src/engine/run/offers';
import { newRun, runReducer, runView } from '../src/engine/run/reducer';
import { POLICIES, simulateRun } from '../src/engine/run/sim';
import type { RunAction, RunState } from '../src/engine/run/types';
import { deserializeRun, migrate, serializeRun, stateHash } from '../src/engine/serialize/save';
import { Rng } from '../src/engine/rng';
import { upgradeDef } from '../src/engine/rules/registry';
import { grantUpgrade } from '../src/engine/run/acquire';
import { encounterGold } from '../src/engine/run/economy';

const withPending = (run: RunState, pending: RunState['pending']): RunState => ({ ...run, pending });

describe('act maps (B8)', () => {
  it('every path has 5–6 combats, 1–2 elites and 2–3 non-combat nodes, ending in the boss', () => {
    for (let i = 0; i < 60; i++) {
      for (const act of [1, 2, 3]) {
        const map = generateActMap(act, `seed-${i}`, Rng.fromSeed(`map-${i}-${act}`));
        expect(validatePaths(map)).toBe(true);
        const boss = map.nodes.filter((n) => n.type === 'boss');
        expect(boss).toHaveLength(1);
        expect(map.nodes.filter((n) => n.row === 0).every((n) => n.type === 'combat')).toBe(true);
        // Every node except the boss leads somewhere; every non-first-row node has a parent.
        for (const n of map.nodes) {
          if (n.type !== 'boss') expect(n.next.length).toBeGreaterThan(0);
          if (n.row > 0) expect(map.nodes.some((p) => p.next.includes(n.id))).toBe(true);
        }
        expect(map.nodes.some((n) => n.type === 'shop')).toBe(true);
      }
    }
  });

  it('is deterministic per seed and visible from the start', () => {
    const a = generateActMap(1, 's', Rng.fromSeed('m'));
    const b = generateActMap(1, 's', Rng.fromSeed('m'));
    expect(stateHash(a)).toBe(stateHash(b));
    expect(reachableNodes(a, null).map((n) => n.row)).toEqual(reachableNodes(a, null).map(() => 0));
  });
});

describe('offers (B9)', () => {
  const ctx = (owned: { id: string; stacks: number }[] = []) => ({
    act: 2,
    owned: owned.map((o, i) => ({ ...o, order: i })),
    roster: newRun('x').roster,
  });

  it('never offers an owned unique upgrade or a saturated one', () => {
    const rng = Rng.fromSeed('offers-unique');
    for (let i = 0; i < 200; i++) {
      const offers = generateOffers(rng, ctx([{ id: 'bishop_recall', stacks: 1 }, { id: 'pawn_veteran', stacks: 2 }]));
      expect(offers).not.toContain('bishop_recall');
      expect(offers).not.toContain('pawn_veteran');
      expect(new Set(offers).size).toBe(offers.length);
    }
  });

  it('respects prerequisites', () => {
    const rng = Rng.fromSeed('offers-prereq');
    for (let i = 0; i < 300; i++) expect(generateOffers(rng, ctx())).not.toContain('bishop_piercing');
    const committed = ctx([{ id: 'bishop_crusade', stacks: 2 }]);
    let seen = false;
    for (let i = 0; i < 400 && !seen; i++) seen = generateOffers(rng, committed).includes('bishop_piercing');
    expect(seen).toBe(true);
  });

  it('always includes an offer outside the most-owned tag', () => {
    const rng = Rng.fromSeed('offers-diversity');
    const owned = ctx([
      { id: 'bishop_crusade', stacks: 3 },
      { id: 'bishop_ordination', stacks: 4 },
      { id: 'bishop_twin', stacks: 2 },
    ]);
    expect(mostOwnedTag(owned.owned)).toBe('bishop');
    for (let i = 0; i < 200; i++) {
      const offers = generateOffers(rng, owned);
      expect(offers.some((id) => !upgradeDef(id).tags.includes('bishop'))).toBe(true);
    }
  });

  it('weights offers toward the build (offer curve, not a cap)', () => {
    const rng = Rng.fromSeed('offers-weight');
    const owned = ctx([{ id: 'pawn_double_march', stacks: 4 }]);
    let pawnOffers = 0;
    let total = 0;
    for (let i = 0; i < 400; i++) {
      for (const id of generateOffers(rng, owned)) {
        total++;
        if (upgradeDef(id).tags.includes('pawn')) pawnOffers++;
      }
    }
    const neutral = Rng.fromSeed('offers-weight');
    let neutralPawn = 0;
    let neutralTotal = 0;
    for (let i = 0; i < 400; i++) {
      for (const id of generateOffers(neutral, ctx())) {
        neutralTotal++;
        if (upgradeDef(id).tags.includes('pawn')) neutralPawn++;
      }
    }
    expect(pawnOffers / total).toBeGreaterThan(neutralPawn / neutralTotal);
  });

  it('elite rewards contain at least one Rare or better', () => {
    const rng = Rng.fromSeed('offers-elite');
    for (let i = 0; i < 200; i++) {
      const offers = generateOffers(rng, { ...ctx(), act: 1 }, { atLeastOneRare: true });
      expect(offers.some((id) => ['rare', 'legendary'].includes(upgradeDef(id).rarity))).toBe(true);
    }
  });
});

describe('acquisition and placement', () => {
  it('Mass Production adds a Pawn (Reserve when the zone is full)', () => {
    const run = grantUpgrade(newRun('acq'), 'pawn_mass_production');
    expect(run.roster.filter((r) => r.type === 'pawn')).toHaveLength(9);
    expect(run.upgrades).toEqual([{ id: 'pawn_mass_production', stacks: 1, order: 0 }]);
    const twice = grantUpgrade(run, 'pawn_mass_production');
    expect(twice.upgrades[0].stacks).toBe(2);
  });

  it('board mutations require placement in ranks 1–6; gates take a pair', () => {
    let run = grantUpgrade(newRun('mut'), 'mut_altar');
    expect(run.pending).toMatchObject({ kind: 'place', step: { kind: 'squares', count: 1 } });
    expect(legalPlacementSquares(run)).not.toContain(parseSq('e7'));
    run = runReducer(run, { type: 'placeSquares', squares: [parseSq('e3')] });
    expect(run.mutations).toMatchObject([{ type: 'BISHOP_ALTAR', sq: parseSq('e3') }]);
    expect(run.pending).toBeNull();
    run = grantUpgrade(run, 'mut_gate');
    run = runReducer(run, { type: 'placeSquares', squares: [parseSq('c3'), parseSq('f5')] });
    expect(run.mutations.filter((m) => m.type === 'KNIGHT_GATE').map((m) => m.linkSq)).toEqual([parseSq('f5'), parseSq('c3')]);
    run = grantUpgrade(run, 'mut_rail');
    run = runReducer(run, { type: 'placeLine', axis: 'file', index: 0 });
    expect(run.mutations.at(-1)).toMatchObject({ type: 'ROOK_RAIL', rail: { axis: 'file', index: 0 } });
  });

  it('starting-position upgrades reshape and lock the formation', () => {
    let run = grantUpgrade(newRun('start'), 'start_advanced_bishop');
    const bishop = run.roster.find((r) => r.type === 'bishop' && r.sq === sqOf(2, 0))!;
    run = runReducer(run, { type: 'pickPiece', rosterId: bishop.id });
    expect(run.roster.find((r) => r.id === bishop.id)).toMatchObject({ sq: sqOf(2, 2), locked: true });

    run = grantUpgrade(run, 'start_castled');
    run = runReducer(run, { type: 'pickSide', side: 'king' });
    expect(run.roster.find((r) => r.type === 'king')).toMatchObject({ sq: parseSq('g1'), locked: true });
    expect(run.roster.find((r) => r.sq === parseSq('f1'))?.type).toBe('rook');

    run = grantUpgrade(run, 'start_forward_knight');
    const knight = run.roster.find((r) => r.type === 'knight')!;
    run = runReducer(run, { type: 'pickPiece', rosterId: knight.id });
    run = runReducer(run, { type: 'placeSquares', squares: [parseSq('e4')] });
    expect(run.roster.find((r) => r.id === knight.id)).toMatchObject({ sq: parseSq('e4'), locked: true });

    run = grantUpgrade(run, 'start_open_center');
    expect(run.roster.filter((r) => r.type === 'pawn')).toHaveLength(6);

    run = grantUpgrade(run, 'start_forward_deployment');
    expect(zoneOf(run)).toHaveLength(24);
    run = grantUpgrade(run, 'start_forward_deployment');
    expect(run.pending).toMatchObject({ step: { kind: 'rank4', count: 2 } });
    run = runReducer(run, { type: 'placeSquares', squares: [parseSq('c4'), parseSq('f4')] });
    expect(zoneOf(run)).toHaveLength(26);
  });

  it('the formation editor keeps locked pieces and the King on the board', () => {
    let run = grantUpgrade(newRun('form'), 'start_castled');
    run = runReducer(run, { type: 'pickSide', side: 'king' });
    const king = run.roster.find((r) => r.type === 'king')!;
    expect(validateFormation(run, run.roster.map((r) => (r.id === king.id ? { ...r, sq: parseSq('e1') } : r)))).toMatch(/locked/);
    const pawn = run.roster.find((r) => r.type === 'pawn')!;
    expect(validateFormation(run, run.roster.map((r) => (r.id === pawn.id ? { ...r, sq: null } : r)))).toBeNull();
    expect(validateFormation(run, run.roster.map((r) => (r.id === pawn.id ? { ...r, sq: parseSq('a5') } : r)))).toMatch(/outside/);
  });
});

describe('crowns, gold and the boss (B7)', () => {
  function enterFirstCombat(seed: string) {
    let run = newRun(seed);
    run = runReducer(run, { type: 'chooseNode', nodeId: reachableNodes(run.map, null)[0].id });
    return run;
  }

  it('losing a normal encounter costs a Crown and gives no reward', () => {
    let run = enterFirstCombat('crowns');
    const enc = run.encounter!;
    run = { ...run, encounter: { ...enc, outcome: { result: 'lost', reason: 'test', turn: 3 }, phase: 'over' } };
    run = runReducer(run, { type: 'finishEncounter' });
    expect(run.crowns).toBe(2);
    expect(run.pending).toMatchObject({ kind: 'defeat', boss: false });
    run = runReducer(run, { type: 'continueAfterDefeat' });
    expect(runView(run)).toBe('map');
  });

  it('winning grants gold (base + 2 per unused turn) and a choice of 3 upgrades', () => {
    let run = enterFirstCombat('gold');
    const enc = run.encounter!;
    const won = { ...enc, outcome: { result: 'won' as const, reason: 'test', turn: 2 }, phase: 'over' as const };
    expect(encounterGold(won)).toBe(10 + 2 * ((enc.config.turnLimit ?? 0) - 2));
    run = runReducer({ ...run, encounter: won }, { type: 'finishEncounter' });
    expect(run.gold).toBe(encounterGold(won));
    expect(run.pending).toMatchObject({ kind: 'reward' });
    expect((run.pending as { offers: string[] }).offers).toHaveLength(3);
  });

  it('0 Crowns ends the run; a lost boss is retried with the same seed', () => {
    let run = enterFirstCombat('dead');
    run = { ...run, crowns: 1 };
    const enc = run.encounter!;
    run = runReducer({ ...run, encounter: { ...enc, outcome: { result: 'lost', reason: 'x', turn: 1 }, phase: 'over' } }, { type: 'finishEncounter' });
    expect(run.result).toEqual({ outcome: 'defeat', act: 1 });

    let bossRun = newRun('boss');
    const bossNode = bossRun.map.nodes.find((n) => n.type === 'boss')!;
    bossRun = { ...bossRun, at: bossRun.map.nodes.find((n) => n.next.includes(bossNode.id))!.id };
    bossRun = runReducer(bossRun, { type: 'chooseNode', nodeId: bossNode.id });
    const first = bossRun.encounter!;
    expect(first.config.bossId).toBe('fortress_king');
    bossRun = runReducer({ ...bossRun, encounter: { ...first, outcome: { result: 'lost', reason: 'x', turn: 10 }, phase: 'over' } }, { type: 'finishEncounter' });
    expect(bossRun.pending).toMatchObject({ kind: 'defeat', boss: true });
    bossRun = runReducer(bossRun, { type: 'retryBoss' });
    expect(stateHash(bossRun.encounter!.board)).toBe(stateHash(first.board));
    expect(bossRun.crowns).toBe(2);
  });
});

describe('save / load (G1) and determinism (D6)', () => {
  function playSome(seed: string, steps: number): RunState {
    const res = simulateRun(seed, POLICIES.any, { maxActs: 1, maxSteps: steps });
    return res.run;
  }

  it('round-trips through JSON', () => {
    const run = playSome('save-rt', 40);
    const back = deserializeRun(serializeRun(run));
    expect(stateHash({ ...back, undo: [] })).toBe(stateHash({ ...run, undo: [] }));
  });

  it('migrates old schemas', () => {
    const run = newRun('migrate');
    const legacy = JSON.parse(serializeRun(run));
    legacy.schema = 0;
    delete legacy.run.curses;
    delete legacy.run.rank4;
    const file = migrate(legacy);
    expect(file.schema).toBe(1);
    expect(file.run.curses).toEqual([]);
    expect(file.run.rank4).toEqual([]);
  });

  it('replaying the action log reproduces the identical final state hash', () => {
    const run = playSome('replay', 300);
    expect(run.actions.length).toBeGreaterThan(50);
    let replay = newRun('replay');
    for (const a of run.actions as RunAction[]) replay = runReducer(replay, a);
    expect(stateHash(replay)).toBe(stateHash(run));
  });

  it('pending screens carry their own data', () => {
    const run = withPending(newRun('p'), { kind: 'recruit', offers: [{ id: 'knight', label: 'Knight', pieces: ['knight'] }] });
    const after = runReducer(run, { type: 'pickOffer', index: 0 });
    expect(after.roster.filter((r) => r.type === 'knight')).toHaveLength(3);
  });
});

describe('M4 acceptance: Act I with single-archetype builds', () => {
  const SEEDS = ['acceptance-3', 'acceptance-4', 'acceptance-8'];

  it('a Pawn-only run and a Bishop-only run both clear Act I and play differently', () => {
    const pawnRuns = SEEDS.map((seed) => simulateRun(seed, POLICIES.pawn, { maxActs: 1 }));
    const bishopRuns = SEEDS.map((seed) => simulateRun(seed, POLICIES.bishop, { maxActs: 1 }));
    // The two seeded runs on the first seed are both winnable.
    expect(pawnRuns[0].won).toBe(true);
    expect(bishopRuns[0].won).toBe(true);
    // Only archetype upgrades were taken.
    for (const r of pawnRuns) expect(r.run.upgrades.every((u) => upgradeDef(u.id).tags.some((t) => t === 'pawn' || t === 'promotion'))).toBe(true);
    for (const r of bishopRuns) expect(r.run.upgrades.every((u) => upgradeDef(u.id).tags.includes('bishop'))).toBe(true);
    // Swarm/promotion pressure vs long diagonal networks (aggregated over seeds).
    const sum = (runs: typeof pawnRuns, f: (st: RunState['stats']) => number) => runs.reduce((n, r) => n + f(r.run.stats), 0);
    expect(sum(pawnRuns, (st) => st.promotions)).toBeGreaterThan(2 * sum(bishopRuns, (st) => st.promotions));
    expect(sum(bishopRuns, (st) => st.movesByType.bishop ?? 0)).toBeGreaterThan(2 * sum(pawnRuns, (st) => st.movesByType.bishop ?? 0));
    expect(sum(bishopRuns, (st) => st.bishopLongMoves)).toBeGreaterThan(sum(pawnRuns, (st) => st.bishopLongMoves));
    expect(sum(pawnRuns, (st) => st.movesByType.pawn ?? 0)).toBeGreaterThan(0);
  });

  it('both archetypes clear Act I on most seeds (balance regression guard)', () => {
    let pawnWins = 0;
    let bishopWins = 0;
    for (let i = 0; i < 8; i++) {
      if (simulateRun(`act1-${i}`, POLICIES.pawn, { maxActs: 1 }).won) pawnWins++;
      if (simulateRun(`act1-${i}`, POLICIES.bishop, { maxActs: 1 }).won) bishopWins++;
    }
    expect(pawnWins).toBeGreaterThanOrEqual(5);
    expect(bishopWins).toBeGreaterThanOrEqual(3);
  });
});
