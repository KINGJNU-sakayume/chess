import { PIECE_NAME, type PieceType } from '../core/pieces';
import type { EncounterState } from '../core/state';
import { applyPlayerAction, endTurn } from '../encounters/flow';
import { generateEncounter } from '../encounters/generator';
import { createEncounter, type RosterPlacement } from '../encounters/setup';
import { stackedName } from '../rules/num';
import { allUpgrades, upgradeDef } from '../rules/registry';
import { createStreams, Rng, withStream, type StreamName } from '../rng/rng';
import { actTuning, ACTS } from '../../data/acts';
import { CURSE_POOL } from '../../data/affixes';
import { EVENTS, type EventOutcome } from '../../data/events';
import { RECRUITS } from '../../data/recruits';
import { applyPlacement, deploymentTop, grantUpgrade, validateFormation, zoneOf } from './acquire';
import { CROWN_PRICE, encounterGold, MAX_CROWNS, PIECE_PRICE, REMOVE_CURSE_PRICE, REROLL_PRICE, UPGRADE_PRICE } from './economy';
import { generateActMap, nodeById, reachableNodes } from './map';
import { generateOffers, type OfferContext, type OfferPool } from './offers';
import { standardRoster } from './roster';
import { addRosterPiece } from './rosterOps';
import { RUN_SCHEMA_VERSION, type MapNode, type Pending, type RecruitOffer, type RunAction, type RunState, type RunStats, type ShopItem } from './types';

/**
 * The run controller: a pure reducer over RunState. Every player decision is
 * a RunAction; replaying the recorded actions from the same seed reproduces
 * the run exactly (D6).
 */

export const emptyRunStats = (): RunStats => ({
  encountersWon: 0,
  encountersLost: 0,
  turnsPlayed: 0,
  captures: 0,
  promotions: 0,
  bishopLongMoves: 0,
  longestBishopMove: 0,
  movesByType: {},
  extraActions: 0,
  goldEarned: 0,
  fizzles: 0,
  immobilizations: 0,
  wardsBlocked: 0,
});

export function newRun(seed: string): RunState {
  const streams = createStreams(seed);
  const [map, rng] = withStream(streams, 'map', (r) => generateActMap(1, seed, r));
  return {
    schema: RUN_SCHEMA_VERSION,
    seed,
    rng,
    act: 1,
    map,
    at: null,
    visited: [],
    roster: standardRoster(),
    upgrades: [],
    mutations: [],
    rank4: [],
    curses: [],
    crowns: MAX_CROWNS,
    gold: 0,
    acquisitions: 0,
    encounter: null,
    encounterNode: null,
    undo: [],
    pending: null,
    pendingNode: null,
    result: null,
    stats: emptyRunStats(),
    history: [{ act: 1, text: 'The run begins with an orthodox army.' }],
    actions: [],
  };
}

/** What the UI should show. */
export type RunView = 'map' | 'encounter' | 'pending' | 'over';

export function runView(run: RunState): RunView {
  if (run.result) return 'over';
  if (run.encounter) return 'encounter';
  if (run.pending) return 'pending';
  return 'map';
}

export function runReducer(run: RunState, action: RunAction): RunState {
  const next = reduce(run, action);
  return { ...next, actions: [...run.actions, action] };
}

// ---------------------------------------------------------------------------

function rngOf<T>(run: RunState, stream: StreamName, fn: (rng: Rng) => T): [T, RunState] {
  const [value, rng] = withStream(run.rng, stream, fn);
  return [value, { ...run, rng }];
}

function offerCtx(run: RunState): OfferContext {
  return { act: run.act, owned: run.upgrades, roster: run.roster };
}

function offers(run: RunState, opts: { pool?: OfferPool; atLeastOneRare?: boolean; count?: number } = {}): [string[], RunState] {
  return rngOf(run, 'offers', (rng) => generateOffers(rng, offerCtx(run), opts));
}

function log(run: RunState, text: string): RunState {
  return { ...run, history: [...run.history, { act: run.act, text }] };
}

export function rosterPlacements(run: RunState): RosterPlacement[] {
  return run.roster.map((r) => ({ rosterId: r.id, type: r.type, sq: r.sq, locked: r.locked }));
}

export function buildEncounter(run: RunState, node: MapNode): EncounterState {
  const kind = node.type === 'boss' ? 'boss' : node.type === 'elite' ? 'elite' : 'combat';
  const gen = generateEncounter({
    seed: node.seed,
    act: run.act,
    kind,
    templateId: node.templateId!,
    difficulty: Math.min(1, node.row / Math.max(1, run.map.rows - 1)),
    rules: { upgrades: run.upgrades, affixes: run.curses },
    roster: rosterPlacements(run),
    mutations: run.mutations,
    deploymentTop: deploymentTop(run),
  });
  return createEncounter(gen.setup);
}

function recruitOffers(run: RunState): [RecruitOffer[], RunState] {
  return rngOf(run, 'offers', (rng) => {
    const pool = RECRUITS.slice();
    const out: RecruitOffer[] = [];
    while (out.length < 3 && pool.length) {
      const idx = rng.weightedIndex(pool.map((p) => p.weight));
      const r = pool.splice(idx, 1)[0];
      out.push({ id: r.id, label: r.label, pieces: r.pieces });
    }
    return out;
  });
}

function addPieces(run: RunState, pieces: PieceType[]): RunState {
  let roster = run.roster;
  for (const t of pieces) roster = addRosterPiece(roster, t, zoneOf(run));
  return log({ ...run, roster }, `Recruited ${pieces.map((t) => PIECE_NAME[t]).join(', ')}`);
}

function shopItems(run: RunState): [ShopItem[], RunState] {
  const [ups, r1] = offers(run, { count: 3 });
  const [mut, r2] = offers(r1, { pool: 'mutation', count: 1 });
  const [recruits, r3] = recruitOffers(r2);
  const scale = 1 + 0.1 * (run.act - 1);
  const items: ShopItem[] = [...ups, ...mut].map((id) => {
    const def = upgradeDef(id);
    return { kind: 'upgrade', id, label: def.name, price: Math.round(UPGRADE_PRICE[def.rarity] * scale) };
  });
  const piece = recruits[0];
  if (piece) items.push({ kind: 'piece', id: piece.id, label: piece.label, price: piece.pieces.reduce((n, t) => n + PIECE_PRICE[t], 0), pieces: piece.pieces });
  if (run.crowns < MAX_CROWNS) items.push({ kind: 'crown', id: 'crown', label: 'Restore a Crown', price: CROWN_PRICE });
  if (run.curses.length) items.push({ kind: 'removeCurse', id: 'curse', label: 'Lift a curse', price: REMOVE_CURSE_PRICE });
  return [items, r3];
}

function enterNode(run: RunState, node: MapNode): RunState {
  let r: RunState = { ...run, at: node.id, visited: [...run.visited, node.id], pendingNode: node.id };
  switch (node.type) {
    case 'combat':
    case 'elite':
    case 'boss':
      return { ...r, encounter: buildEncounter(r, node), encounterNode: node.id, undo: [] };
    case 'upgrade': {
      const [o, r2] = offers(r);
      return { ...r2, pending: { kind: 'reward', source: 'upgrade', offers: o, gold: 0, crown: false } };
    }
    case 'mutation': {
      const [o, r2] = offers(r, { pool: 'mutation' });
      return { ...r2, pending: { kind: 'mutationOffer', offers: o } };
    }
    case 'recruit': {
      const [o, r2] = recruitOffers(r);
      return { ...r2, pending: { kind: 'recruit', offers: o } };
    }
    case 'shop': {
      const [items, r2] = shopItems(r);
      return { ...r2, pending: { kind: 'shop', items, rerolls: 0 } };
    }
    case 'event': {
      const pool = EVENTS.filter((e) => e.acts.includes(run.act));
      const [ev, r2] = rngOf(r, 'events', (rng) => rng.pick(pool));
      r = r2;
      return { ...r, pending: { kind: 'event', eventId: ev.id } };
    }
    case 'sacrifice':
      return { ...r, pending: { kind: 'sacrifice', stage: 'choose', offers: [] } };
  }
}

/** After a pending screen resolves: advance the act when the boss has fallen. */
function settle(run: RunState): RunState {
  if (run.pending || run.encounter || run.result) return run;
  const atBoss = run.at !== null && nodeById(run.map, run.at).type === 'boss';
  if (!atBoss) return { ...run, pendingNode: null };
  if (run.act >= ACTS.length) {
    return log({ ...run, result: { outcome: 'victory', act: run.act }, pendingNode: null }, 'The final boss falls. You broke chess.');
  }
  const act = run.act + 1;
  const [map, rng] = withStream(run.rng, 'map', (r) => generateActMap(act, run.seed, r));
  return log({ ...run, act, map, rng, at: null, visited: [], pendingNode: null }, `Act ${act} begins: ${actTuning(act).feel}.`);
}

function accumulateStats(stats: RunStats, enc: EncounterState): RunStats {
  const s = enc.stats;
  const movesByType = { ...stats.movesByType };
  for (const [k, v] of Object.entries(s.movesByType)) movesByType[k as PieceType] = (movesByType[k as PieceType] ?? 0) + (v ?? 0);
  return {
    ...stats,
    encountersWon: stats.encountersWon + (enc.outcome?.result === 'won' ? 1 : 0),
    encountersLost: stats.encountersLost + (enc.outcome?.result === 'lost' ? 1 : 0),
    turnsPlayed: stats.turnsPlayed + enc.turn,
    captures: stats.captures + s.captures,
    promotions: stats.promotions + s.promotions,
    bishopLongMoves: stats.bishopLongMoves + s.bishopLongMoves,
    longestBishopMove: Math.max(stats.longestBishopMove, s.longestBishopMove),
    movesByType,
    extraActions: stats.extraActions + s.extraActionsGranted,
    fizzles: (stats.fizzles ?? 0) + s.fizzles,
    immobilizations: (stats.immobilizations ?? 0) + (s.immobilizations ?? 0),
    wardsBlocked: (stats.wardsBlocked ?? 0) + s.wardsBlocked,
  };
}

function finishEncounter(run: RunState): RunState {
  const enc = run.encounter;
  if (!enc?.outcome) throw new Error('Encounter not finished');
  const node = nodeById(run.map, run.encounterNode!);
  let r: RunState = { ...run, encounter: null, undo: [], stats: accumulateStats(run.stats, enc) };
  if (enc.outcome.result === 'won') {
    const gold = encounterGold(enc);
    r = log({ ...r, gold: r.gold + gold, stats: { ...r.stats, goldEarned: r.stats.goldEarned + gold } }, `Won ${enc.config.name} (+${gold} gold)`);
    if (node.type === 'boss') {
      const crown = r.crowns < MAX_CROWNS;
      const [o, r2] = offers(r, { pool: 'rarePlus' });
      return { ...r2, crowns: Math.min(MAX_CROWNS, r2.crowns + 1), pending: { kind: 'reward', source: 'boss', offers: o, gold, crown } };
    }
    const [o, r2] = offers(r, { atLeastOneRare: node.type === 'elite' });
    return { ...r2, pending: { kind: 'reward', source: node.type === 'elite' ? 'elite' : 'combat', offers: o, gold, crown: false } };
  }
  // Defeat: lose a Crown, no reward.
  const crowns = r.crowns - 1;
  r = log({ ...r, crowns }, `Lost ${enc.config.name}: ${enc.outcome.reason} (−1 Crown)`);
  if (crowns <= 0) return log({ ...r, result: { outcome: 'defeat', act: r.act } }, 'The last Crown is lost. The run ends.');
  return { ...r, pending: { kind: 'defeat', nodeId: node.id, boss: node.type === 'boss', reason: enc.outcome.reason } };
}

function applyEventOutcomes(run: RunState, outcomes: EventOutcome[]): RunState {
  let r = run;
  for (const o of outcomes) {
    switch (o.type) {
      case 'gold':
        r = log({ ...r, gold: Math.max(0, r.gold + o.amount) }, `${o.amount >= 0 ? '+' : ''}${o.amount} gold`);
        break;
      case 'crown':
        r = log({ ...r, crowns: Math.min(MAX_CROWNS, r.crowns + o.amount) }, 'A Crown is restored');
        break;
      case 'addPieces':
        r = addPieces(r, o.pieces);
        break;
      case 'removePiece': {
        const candidates = r.roster.filter((p) => p.type !== 'king' && (o.pieceType === 'any' || p.type === o.pieceType) && !p.locked);
        if (!candidates.length) break;
        const [victim, r2] = rngOf(r, 'events', (rng) => rng.pick(candidates));
        r = log({ ...r2, roster: r2.roster.filter((p) => p.id !== victim.id) }, `Lost a ${PIECE_NAME[victim.type]}`);
        break;
      }
      case 'randomUpgrade': {
        const pool = allUpgrades().filter((u) => u.tags.includes(o.tag) && !u.choice);
        const ctxOk = pool.filter((u) => generateOffersFilter(r, u.id));
        if (!ctxOk.length) {
          r = log({ ...r, gold: r.gold + 15 }, 'Nothing to learn here (+15 gold)');
          break;
        }
        const [pick, r2] = rngOf(r, 'events', (rng) => rng.pick(ctxOk));
        r = grantUpgrade(r2, pick.id);
        break;
      }
      case 'offer': {
        const [o2, r2] = offers(r, { pool: o.pool });
        r = { ...r2, pending: { kind: 'reward', source: 'event', offers: o2, gold: 0, crown: false } };
        break;
      }
      case 'curse': {
        const options = CURSE_POOL.filter((c) => !r.curses.includes(c));
        if (!options.length) break;
        const [curse, r2] = rngOf(r, 'events', (rng) => rng.pick(options));
        r = log({ ...r2, curses: [...r2.curses, curse] }, `Cursed: ${curse.replace(/_/g, ' ')}`);
        break;
      }
      case 'gamble': {
        const [win, r2] = rngOf(r, 'events', (rng) => rng.chance(o.chance));
        r = applyEventOutcomes(log(r2, win ? 'Fortune smiles.' : 'Fortune frowns.'), win ? o.win : o.lose);
        break;
      }
    }
  }
  return r;
}

function generateOffersFilter(run: RunState, id: string): boolean {
  const def = upgradeDef(id);
  const owned = run.upgrades.find((u) => u.id === id)?.stacks ?? 0;
  if (!def.stackable && owned > 0) return false;
  if (def.maxUsefulStacks !== undefined && owned >= def.maxUsefulStacks) return false;
  return true;
}

function pickReward(run: RunState, p: Extract<Pending, { kind: 'reward' | 'mutationOffer' }>, index: number): RunState {
  const id = p.offers[index];
  if (!id) throw new Error('No such offer');
  return grantUpgrade({ ...run, pending: null }, id);
}

function reduce(run: RunState, a: RunAction): RunState {
  if (run.result && a.type !== 'formation') throw new Error('The run is over');
  switch (a.type) {
    case 'chooseNode': {
      if (run.encounter || run.pending) throw new Error('Finish the current node first');
      const node = reachableNodes(run.map, run.at).find((n) => n.id === a.nodeId);
      if (!node) throw new Error('Node not reachable');
      return enterNode(run, node);
    }
    case 'encounterAct': {
      if (!run.encounter) throw new Error('No encounter');
      const next = applyPlayerAction(run.encounter, a.action).state;
      return { ...run, encounter: next, undo: [...run.undo, run.encounter] };
    }
    case 'endTurn': {
      if (!run.encounter) throw new Error('No encounter');
      return { ...run, encounter: endTurn(run.encounter).state, undo: [] };
    }
    case 'undo': {
      if (!run.encounter || !run.undo.length) throw new Error('Nothing to undo');
      return { ...run, encounter: run.undo[run.undo.length - 1], undo: run.undo.slice(0, -1) };
    }
    case 'finishEncounter':
      return settle(finishEncounter(run));
    case 'retryBoss': {
      const p = run.pending;
      if (!p || p.kind !== 'defeat' || !p.boss) throw new Error('No boss to retry');
      const node = nodeById(run.map, p.nodeId);
      return { ...run, pending: null, encounter: buildEncounter(run, node), encounterNode: node.id, undo: [] };
    }
    case 'continueAfterDefeat': {
      const p = run.pending;
      if (!p || p.kind !== 'defeat' || p.boss) throw new Error('Nothing to continue');
      return settle({ ...run, pending: null });
    }
    case 'pickOffer': {
      const p = run.pending;
      if (!p) throw new Error('Nothing pending');
      if (p.kind === 'reward' || p.kind === 'mutationOffer') return settle(pickReward(run, p, a.index));
      if (p.kind === 'recruit') {
        const offer = p.offers[a.index];
        if (!offer) throw new Error('No such offer');
        return settle(addPieces({ ...run, pending: null }, offer.pieces));
      }
      if (p.kind === 'sacrifice' && p.stage === 'reward') {
        const id = p.offers[a.index];
        if (!id) throw new Error('No such offer');
        return settle(grantUpgrade({ ...run, pending: null }, id));
      }
      throw new Error('Nothing to pick');
    }
    case 'skip': {
      const p = run.pending;
      if (!p || !['reward', 'mutationOffer', 'recruit', 'sacrifice'].includes(p.kind)) throw new Error('Cannot skip');
      return settle(log({ ...run, pending: null }, 'Skipped the offer'));
    }
    case 'placeSquares':
    case 'placeLine':
    case 'pickPiece':
    case 'pickSide': {
      return settle(applyPlacement(run, a));
    }
    case 'buy': {
      const p = run.pending;
      if (!p || p.kind !== 'shop') throw new Error('Not in a shop');
      const item = p.items[a.index];
      if (!item || item.sold) throw new Error('Not for sale');
      if (run.gold < item.price) throw new Error('Not enough gold');
      const items = p.items.map((it, i) => (i === a.index ? { ...it, sold: true } : it));
      const shop: Pending = { ...p, items };
      let r: RunState = log({ ...run, gold: run.gold - item.price, pending: shop }, `Bought ${item.label} for ${item.price} gold`);
      switch (item.kind) {
        case 'upgrade': {
          r = grantUpgrade({ ...r, pending: null }, item.id);
          if (r.pending?.kind === 'place') return { ...r, pending: { ...r.pending, resume: shop } };
          return { ...r, pending: shop };
        }
        case 'piece':
          return { ...addPieces(r, item.pieces ?? []), pending: shop };
        case 'crown':
          return { ...r, crowns: Math.min(MAX_CROWNS, r.crowns + 1) };
        case 'removeCurse':
          return log({ ...r, curses: r.curses.slice(1) }, `Lifted curse: ${run.curses[0]?.replace(/_/g, ' ')}`);
      }
      return r;
    }
    case 'reroll': {
      const p = run.pending;
      if (!p || p.kind !== 'shop') throw new Error('Not in a shop');
      const price = p.rerolls === 0 ? 0 : REROLL_PRICE;
      if (run.gold < price) throw new Error('Not enough gold');
      const [items, r] = shopItems({ ...run, gold: run.gold - price });
      // Keep non-upgrade items that were already bought or are not rerollable.
      const kept = p.items.filter((it) => it.kind !== 'upgrade');
      const fresh = items.filter((it) => it.kind === 'upgrade');
      return { ...r, pending: { kind: 'shop', items: [...fresh, ...kept], rerolls: p.rerolls + 1 } };
    }
    case 'leave': {
      const p = run.pending;
      if (!p || !['shop', 'event', 'sacrifice'].includes(p.kind)) throw new Error('Nothing to leave');
      return settle({ ...run, pending: null });
    }
    case 'eventChoice': {
      const p = run.pending;
      if (!p || p.kind !== 'event') throw new Error('No event');
      const ev = EVENTS.find((e) => e.id === p.eventId)!;
      const choice = ev.choices[a.index];
      if (!choice) throw new Error('No such choice');
      if (choice.requires?.gold && run.gold < choice.requires.gold) throw new Error('Not enough gold');
      if (choice.requires?.crownsBelowMax && run.crowns >= MAX_CROWNS) throw new Error('Crowns are full');
      const r = applyEventOutcomes(log({ ...run, pending: null }, `${ev.title}: ${choice.label}`), choice.outcomes);
      return settle(r);
    }
    case 'sacrificePiece': {
      const p = run.pending;
      if (!p || p.kind !== 'sacrifice' || p.stage !== 'choose') throw new Error('No sacrifice');
      const victim = run.roster.find((x) => x.id === a.rosterId);
      if (!victim || victim.type === 'king') throw new Error('Cannot sacrifice that piece');
      const r = log({ ...run, roster: run.roster.filter((x) => x.id !== victim.id) }, `Sacrificed a ${PIECE_NAME[victim.type]}`);
      const [o, r2] = offers(r, { pool: 'rarePlus' });
      return { ...r2, pending: { kind: 'sacrifice', stage: 'reward', offers: o } };
    }
    case 'acceptCurse': {
      const p = run.pending;
      if (!p || p.kind !== 'sacrifice' || p.stage !== 'choose') throw new Error('No sacrifice');
      const r = applyEventOutcomes(run, [{ type: 'curse' }]);
      const [o, r2] = offers(r, { pool: 'rarePlus' });
      return { ...r2, pending: { kind: 'sacrifice', stage: 'reward', offers: o } };
    }
    case 'formation': {
      if (run.encounter) throw new Error('Cannot change formation during an encounter');
      const err = validateFormation(run, a.roster);
      if (err) throw new Error(err);
      return { ...run, roster: a.roster };
    }
  }
}

export function describeOwned(run: RunState): string[] {
  return run.upgrades.map((u) => stackedName(upgradeDef(u.id).name, u.stacks));
}
