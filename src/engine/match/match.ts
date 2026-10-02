import { cardById, type Tier } from '../augments/cards';
import { DRAFT_PLIES, DRAFT_ROUNDS, REROLLS_PER_GAME, compileRules, rollOffer, roundTier, tierAt, tierIndex } from '../augments/draft';
import { toSan } from '../game/notation';
import { Position, START_FEN } from '../game/position';
import {
  BLACK,
  F_SHIELD,
  KNIGHT,
  M_CASTLE,
  M_EP,
  M_WALL,
  T_TRAP_B,
  T_TRAP_W,
  WHITE,
  WIN_BREAKTHROUGH,
  WIN_HILL,
  WIN_KING_CAPTURE,
  WIN_THREE_CHECK,
  movePromo,
  type Color,
} from '../game/types';

/**
 * A whole game as a pure reducer over actions. The UI, saves, undo and the
 * self-play tests all replay the same action list, so a game can always be
 * reconstructed exactly from its setup and actions.
 */
export type MatchMode = 'ai' | 'local';

export interface MatchSetup {
  mode: MatchMode;
  /** The human's colour in AI games. */
  human: Color;
  /** AI strength 1..5. */
  level: number;
  seed: string;
  /** In-game draft rounds at the start, move 10 and move 20 (default on). Runs turn them off. */
  drafts?: boolean;
  /** Augments each side brings into the game (runs), with extra uses for active cards. */
  loadout?: [LoadoutCard[], LoadoutCard[]];
  /** Display names per side (e.g. an enemy's name); null = default. */
  names?: [string | null, string | null];
  /** 'run' when the game is a battle inside a roguelike run. */
  context?: 'free' | 'run';
}

export interface LoadoutCard {
  id: string;
  /** Extra uses per game for an active card (forged at rest sites). */
  bonus?: number;
}

export interface OwnedCard {
  id: string;
  /** Uses left (active cards); 0 for passive cards. */
  uses: number;
}

export interface SideState {
  cards: OwnedCard[];
  /** Cards offered in the open draft round, or null once picked. */
  offer: string[] | null;
  offerTier: Tier | null;
  rerolls: number;
  rerollCount: number;
  /** Tier steps added to the next offer (Investment). */
  investment: number;
  cardUsedThisTurn: boolean;
}

export type MatchAction =
  | { type: 'pick'; color: Color; card: string }
  | { type: 'reroll'; color: Color }
  | { type: 'card'; color: Color; card: string; sq: number }
  | { type: 'move'; color: Color; move: number }
  | { type: 'resign'; color: Color };

export type LogEntry =
  | { kind: 'move'; color: Color; ply: number; san: string }
  | { kind: 'card'; color: Color; ply: number; card: string; sq: number }
  | { kind: 'pick'; color: Color; ply: number; card: string; round: number };

export type ResultReason =
  | 'king'
  | 'hill'
  | 'three_check'
  | 'breakthrough'
  | 'no_moves'
  | 'resign'
  | 'fifty'
  | 'repetition'
  | 'material';

export interface MatchResult {
  /** -1 for a draw. */
  winner: Color | -1;
  reason: ResultReason;
}

export type MatchEventKind = 'capture' | 'bounce' | 'trap' | 'martyr' | 'promote' | 'wall' | 'oath' | 'card' | 'check';

export interface MatchEvent {
  kind: MatchEventKind;
  sq: number;
}

export interface MatchState {
  setup: MatchSetup;
  pos: Position;
  sides: [SideState, SideState];
  /** Draft rounds opened so far (1..3). */
  round: number;
  phase: 'draft' | 'play' | 'over';
  result: MatchResult | null;
  log: LogEntry[];
  /** Position repetition counts (by hash key). */
  rep: Record<string, number>;
  /** Hashes of the positions since the last card or draft (AI repetition detection). */
  hashes: [number, number][];
  lastMove: number;
  /** Stable piece ids per square, for move animations. */
  ids: (string | null)[];
  nextId: number;
  /** What the last action did (UI effects). */
  events: MatchEvent[];
  actions: MatchAction[];
}

const WIN_REASON: Record<number, ResultReason> = {
  [WIN_KING_CAPTURE]: 'king',
  [WIN_HILL]: 'hill',
  [WIN_THREE_CHECK]: 'three_check',
  [WIN_BREAKTHROUGH]: 'breakthrough',
};

const newSide = (): SideState => ({
  cards: [],
  offer: null,
  offerTier: null,
  rerolls: REROLLS_PER_GAME,
  rerollCount: 0,
  investment: 0,
  cardUsedThisTurn: false,
});

const other = (c: Color): Color => (c ^ 1) as Color;

function cloneState(s: MatchState): MatchState {
  return {
    ...s,
    pos: s.pos.clone(),
    sides: [
      { ...s.sides[0], cards: s.sides[0].cards.map((c) => ({ ...c })) },
      { ...s.sides[1], cards: s.sides[1].cards.map((c) => ({ ...c })) },
    ],
    log: s.log.slice(),
    rep: { ...s.rep },
    hashes: s.hashes.slice(),
    ids: s.ids.slice(),
    events: [],
    actions: s.actions.slice(),
  };
}

const idFor = (color: Color, n: number): string => `${color === WHITE ? 'w' : 'b'}${n}`;

function assignIds(s: MatchState): void {
  for (let sq = 0; sq < 64; sq++) {
    const c = s.pos.board[sq];
    if (c === 0) {
      s.ids[sq] = null;
      continue;
    }
    const color = (c >> 4) as Color;
    const id = s.ids[sq];
    if (!id || id[0] !== (color === WHITE ? 'w' : 'b')) s.ids[sq] = idFor(color, s.nextId++);
  }
}

export function createMatch(setup: MatchSetup, fen = START_FEN): MatchState {
  const pos = Position.fromFen(fen);
  const s: MatchState = {
    setup,
    pos,
    sides: [newSide(), newSide()],
    round: 0,
    phase: 'play',
    result: null,
    log: [],
    rep: { [pos.hashKey()]: 1 },
    hashes: [[pos.hashLo, pos.hashHi]],
    lastMove: 0,
    ids: new Array(64).fill(null),
    nextId: 1,
    events: [],
    actions: [],
  };
  if (setup.loadout) applyLoadout(s, setup.loadout);
  assignIds(s);
  maybeOpenRound(s);
  return s;
}

/** Give each side its augments before the first move: rules, start-of-game effects, uses. */
function applyLoadout(s: MatchState, loadout: [LoadoutCard[], LoadoutCard[]]): void {
  for (const color of [WHITE, BLACK] as Color[]) {
    const side = s.sides[color];
    for (const c of loadout[color]) {
      const def = cardById(c.id);
      if (side.cards.some((o) => o.id === c.id)) continue;
      side.cards.push({ id: c.id, uses: def.kind === 'active' ? (def.uses ?? 1) + (c.bonus ?? 0) : 0 });
    }
    s.pos.setRules(color, compileRules(ownedIds(side)));
  }
  for (const color of [WHITE, BLACK] as Color[]) {
    for (const c of s.sides[color].cards) cardById(c.id).onAcquire?.(s.pos, color);
  }
  s.pos.commit();
  s.pos.refresh();
  s.rep = { [s.pos.hashKey()]: 1 };
  s.hashes = [[s.pos.hashLo, s.pos.hashHi]];
}

const ownedIds = (side: SideState): string[] => side.cards.map((c) => c.id);

function maybeOpenRound(s: MatchState): void {
  if (s.phase === 'over' || s.round >= DRAFT_ROUNDS || s.setup.drafts === false) return;
  if (s.pos.ply < DRAFT_PLIES[s.round] || s.pos.side !== WHITE) return;
  s.round++;
  const base = roundTier(s.setup.seed, s.round);
  for (const color of [WHITE, BLACK] as Color[]) {
    const side = s.sides[color];
    const tier = tierAt(base + side.investment);
    side.investment = 0;
    side.offerTier = tier;
    side.offer = rollOffer({
      pos: s.pos,
      color,
      owned: ownedIds(side),
      seed: s.setup.seed,
      round: s.round,
      tier,
      rerollIndex: side.rerollCount,
    });
    if (side.offer.length === 0) side.offer = null;
  }
  s.phase = s.sides[0].offer || s.sides[1].offer ? 'draft' : 'play';
}

function evaluateResult(s: MatchState): MatchResult | null {
  const pos = s.pos;
  if (pos.winner >= 0) return { winner: pos.winner as Color, reason: WIN_REASON[pos.winReason] ?? 'king' };
  if (pos.moves().length === 0) return { winner: other(pos.side), reason: 'no_moves' };
  if (pos.halfmove >= 100) return { winner: -1, reason: 'fifty' };
  if ((s.rep[pos.hashKey()] ?? 0) >= 3) return { winner: -1, reason: 'repetition' };
  if (!pos.hasMaterial(WHITE) && !pos.hasMaterial(BLACK) && !pos.rules[0].kingOfTheHill && !pos.rules[1].kingOfTheHill) {
    return { winner: -1, reason: 'material' };
  }
  return null;
}

function finish(s: MatchState): void {
  const r = evaluateResult(s);
  if (r) {
    s.result = r;
    s.phase = 'over';
    for (const side of s.sides) side.offer = null;
  }
}

/** Squares an active card can target right now, or [] if it cannot be used. */
export function cardTargets(s: MatchState, color: Color, cardId: string): number[] {
  if (s.phase !== 'play' || s.pos.side !== color) return [];
  const side = s.sides[color];
  if (side.cardUsedThisTurn) return [];
  const owned = side.cards.find((c) => c.id === cardId);
  const def = cardById(cardId);
  if (!owned || def.kind !== 'active' || owned.uses <= 0 || !def.targets) return [];
  return def.targets(s.pos, color);
}

/** Is it this colour's turn to act (move or use a card)? */
export const isTurnOf = (s: MatchState, color: Color): boolean => s.phase === 'play' && s.pos.side === color;

export class MatchError extends Error {}

export function applyAction(prev: MatchState, a: MatchAction): MatchState {
  const s = cloneState(prev);
  s.actions.push(a);
  switch (a.type) {
    case 'pick':
      doPick(s, a.color, a.card);
      break;
    case 'reroll':
      doReroll(s, a.color);
      break;
    case 'card':
      doCard(s, a.color, a.card, a.sq);
      break;
    case 'move':
      doMove(s, a.color, a.move);
      break;
    case 'resign':
      if (s.phase === 'over') throw new MatchError('game over');
      s.result = { winner: other(a.color), reason: 'resign' };
      s.phase = 'over';
      for (const side of s.sides) side.offer = null;
      break;
  }
  s.pos.commit();
  return s;
}

function doPick(s: MatchState, color: Color, cardId: string): void {
  const side = s.sides[color];
  if (s.phase !== 'draft' || !side.offer || !side.offer.includes(cardId)) throw new MatchError('card not offered');
  const def = cardById(cardId);
  side.cards.push({ id: cardId, uses: def.kind === 'active' ? (def.uses ?? 1) : 0 });
  side.offer = null;
  side.offerTier = null;
  if (def.rules) s.pos.setRules(color, compileRules(ownedIds(side)));
  if (def.onAcquire) def.onAcquire(s.pos, color);
  if (cardId === 'investment') side.investment += 1;
  s.log.push({ kind: 'pick', color, ply: s.pos.ply, card: cardId, round: s.round });
  s.events.push({ kind: 'card', sq: -1 });
  assignIds(s);
  if (!s.sides[0].offer && !s.sides[1].offer) {
    s.phase = 'play';
    resetRepetition(s);
    finish(s);
  }
}

function resetRepetition(s: MatchState): void {
  s.rep = { [s.pos.hashKey()]: 1 };
  s.hashes = [[s.pos.hashLo, s.pos.hashHi]];
}

function doReroll(s: MatchState, color: Color): void {
  const side = s.sides[color];
  if (s.phase !== 'draft' || !side.offer || side.rerolls <= 0 || !side.offerTier) throw new MatchError('cannot reroll');
  side.rerolls--;
  side.rerollCount++;
  const next = rollOffer({
    pos: s.pos,
    color,
    owned: ownedIds(side),
    seed: s.setup.seed,
    round: s.round,
    tier: side.offerTier,
    rerollIndex: side.rerollCount,
    exclude: side.offer,
  });
  if (next.length) side.offer = next;
}

function doCard(s: MatchState, color: Color, cardId: string, sq: number): void {
  const targets = cardTargets(s, color, cardId);
  if (!targets.includes(sq)) throw new MatchError('invalid card use');
  const side = s.sides[color];
  const owned = side.cards.find((c) => c.id === cardId)!;
  const def = cardById(cardId);
  def.apply!(s.pos, color, sq);
  owned.uses--;
  side.cardUsedThisTurn = true;
  s.log.push({ kind: 'card', color, ply: s.pos.ply, card: cardId, sq });
  s.events.push({ kind: 'card', sq });
  assignIds(s);
  // Card effects change the position; repetition restarts from here.
  resetRepetition(s);
  finish(s);
}

function doMove(s: MatchState, color: Color, m: number): void {
  const pos = s.pos;
  if (s.phase !== 'play' || pos.side !== color) throw new MatchError('not your turn');
  if (!pos.moves().includes(m)) throw new MatchError('illegal move');
  const from = m & 63;
  const to = (m >> 6) & 63;
  const before = Int8Array.from(pos.board);
  const terrainBefore = Uint8Array.from(pos.terrain);
  const flagsBefore = Uint8Array.from(pos.flags);
  const san = toSan(pos, m);
  pos.makeMove(m);

  // Piece ids follow the move (unless the attacker bounced off a shield).
  const bounced = pos.board[from] !== 0 && pos.board[from] === before[from];
  if (!bounced) {
    const moverId = s.ids[from];
    s.ids[from] = null;
    if (m & M_EP) s.ids[to - (color === WHITE ? 8 : -8)] = null;
    s.ids[to] = moverId;
    if (m & M_CASTLE) {
      const rFrom = to > from ? from + 3 : from - 4;
      const rTo = to > from ? from + 1 : from - 1;
      s.ids[rTo] = s.ids[rFrom];
      s.ids[rFrom] = null;
    }
  }
  assignIds(s);

  // Events for the UI.
  const ev = s.events;
  if (bounced) ev.push({ kind: 'bounce', sq: m & M_EP ? to - (color === WHITE ? 8 : -8) : to });
  else {
    const victimSq = m & M_EP ? to - (color === WHITE ? 8 : -8) : to;
    if (before[victimSq] !== 0 && (victimSq !== to || before[to] >> 4 !== color)) ev.push({ kind: 'capture', sq: victimSq });
    if (m & M_WALL) ev.push({ kind: 'wall', sq: to });
    const trap = color === WHITE ? T_TRAP_B : T_TRAP_W;
    if (terrainBefore[to] === trap && pos.terrain[to] !== trap) ev.push({ kind: 'trap', sq: to });
    else if (pos.board[to] === 0 && before[victimSq] !== 0) ev.push({ kind: 'martyr', sq: to });
    if (movePromo(m) && pos.board[to] !== 0) ev.push({ kind: 'promote', sq: to });
    if ((pos.board[to] & 15) === KNIGHT && pos.flags[to] & F_SHIELD && !(flagsBefore[from] & F_SHIELD)) ev.push({ kind: 'oath', sq: to });
  }
  const enemyKing = pos.kingSq[other(color)];
  if (enemyKing >= 0 && pos.winner < 0 && pos.inCheck(other(color))) ev.push({ kind: 'check', sq: enemyKing });

  s.sides[color].cardUsedThisTurn = false;
  s.lastMove = m;
  s.log.push({ kind: 'move', color, ply: pos.ply - 1, san });
  const key = pos.hashKey();
  s.rep[key] = (s.rep[key] ?? 0) + 1;
  s.hashes.push([pos.hashLo, pos.hashHi]);
  finish(s);
  if (!s.result) maybeOpenRound(s);
}

/** Rebuild a game from its setup and actions. */
export function replay(setup: MatchSetup, actions: readonly MatchAction[]): MatchState {
  let s = createMatch(setup);
  for (const a of actions) s = applyAction(s, a);
  return s;
}

/**
 * Actions after taking back the given colour's last move (and anything after
 * it, such as the opponent's reply, and the card it used that turn).
 */
export function undoActions(actions: readonly MatchAction[], color: Color): MatchAction[] {
  const out = actions.slice();
  let i = out.length - 1;
  while (i >= 0 && !(out[i].type === 'move' && out[i].color === color)) i--;
  if (i < 0) return out;
  out.length = i;
  while (out.length && out[out.length - 1].type === 'card' && out[out.length - 1].color === color) out.pop();
  return out;
}

/** Ply at which the next draft round opens, or null if all rounds are done. */
export const nextDraftPly = (s: MatchState): number | null =>
  s.setup.drafts !== false && s.round < DRAFT_ROUNDS ? DRAFT_PLIES[s.round] : null;

export { tierIndex };
