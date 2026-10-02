import type { Sq } from './coords';
import type { PieceType, Side } from './pieces';
import type { RngState } from '../rng/rng';

/**
 * Immutable encounter state (the "GameState" of Part D). Engine functions take
 * a state and return a new one; they never mutate their input (tests enforce
 * this by deep-freezing inputs). Undo is a stack of these snapshots.
 */

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Points in the turn cycle at which timed effects can expire, in order. */
export type TimePoint = 'turnStart' | 'turnEnd' | 'phaseStart' | 'phaseEnd';

/**
 * "Active until this time point is reached." Enemy phase `n` follows Player
 * Turn `n`, so the order is turnStart(n) < turnEnd(n) < phaseStart(n) <
 * phaseEnd(n) < turnStart(n + 1).
 */
export interface Expiry {
  at: TimePoint;
  turn: number;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

export type PieceTag =
  | 'target' // ELIMINATION target
  | 'escapee' // ESCAPE designated piece
  | 'protectee' // DEFENSE designated piece
  | 'boss' // boss piece (cosmetic + boss hooks)
  | 'locked'; // starting square locked by a starting-position upgrade

export interface TempWard {
  count: number;
  expires: Expiry;
  source: string;
}

export interface StatusEffect {
  type: 'IMMOBILIZED';
  expires: Expiry;
  source: string;
}

export interface Piece {
  id: string;
  type: PieceType;
  side: Side;
  sq: Sq;
  /** Player pieces link back to their persistent roster entry. */
  rosterId?: string;
  /** Has moved during this encounter (castling rights, home-rank double step). */
  moved: boolean;
  /** Persistent Wards (WARD primitive). Each blocks one capture. */
  wards: number;
  /** Wards that expire at a time point (Phalanx, Royal Guard, Sanctuary...). */
  tempWards: TempWard[];
  statuses: StatusEffect[];
  /** Captures made by this piece during the encounter (Veteran Pawn). */
  captures: number;
  tags: PieceTag[];
  /** Per-piece counters (e.g. Queen's Gambit pierce charges). */
  counters: Record<string, number>;
  promotedFrom?: PieceType;
  spawned?: boolean;
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export type Terrain = 'WALL' | 'RUBBLE';

export type SquareType =
  | 'CRIMSON'
  | 'BISHOP_ALTAR'
  | 'KNIGHT_GATE'
  | 'ROOK_RAIL'
  | 'PROMOTION'
  | 'ROYAL'
  | 'CURSED'
  | 'SANCTUARY'
  | 'CONSECRATED'
  | 'ENEMY_SANCTUARY'
  | 'PROFANE';

export interface SquareMark {
  id: string;
  sq: Sq;
  type: SquareType;
  /** The side the square works for. Board mutations belong to the player. */
  side: Side;
  /** 'mutation' for persistent board mutations, otherwise the effect/boss id. */
  source: string;
  /** Undefined = lasts for the whole encounter (mutations persist all run). */
  expires?: Expiry;
  /** KNIGHT_GATE partner square. */
  linkSq?: Sq;
  /** ROOK_RAIL line. */
  rail?: { axis: 'rank' | 'file'; index: number };
  /** Terrain placed on a mutated square suppresses the mutation (B10). */
  suppressed?: boolean;
}

// ---------------------------------------------------------------------------
// Actions & intents
// ---------------------------------------------------------------------------

export interface ActionToken {
  id: string;
  /** 'base' for the default action, otherwise the granting upgrade/square id. */
  source: string;
  label: string;
  pieceTypes?: PieceType[];
  pieceId?: string;
  excludePieceId?: string;
  excludeTypes?: PieceType[];
  nonCapturing?: boolean;
}

export interface MoveIntent {
  id: string;
  kind: 'move';
  pieceId: string;
  pieceType: PieceType;
  from: Sq;
  to: Sq;
  expectedTargetId?: string;
  expectedTargetType?: PieceType;
}

/** Telegraphed non-move enemy actions (bosses, reinforcements, countdowns). */
export interface Telegraph {
  id: string;
  kind: 'reinforcements' | 'spawn' | 'zone' | 'countdown' | 'promotion';
  label: string;
  /** Enemy phases until it happens (0 = this coming phase). */
  inPhases: number;
  squares: Sq[];
}

export type Intent = MoveIntent;

// ---------------------------------------------------------------------------
// Encounter configuration
// ---------------------------------------------------------------------------

export type ObjectiveType =
  | 'ASSASSINATION'
  | 'ELIMINATION'
  | 'SURVIVAL'
  | 'PROMOTION_RACE'
  | 'ESCAPE'
  | 'CONTROL'
  | 'DEFENSE'
  | 'RESCUE';

export interface ObjectiveConfig {
  type: ObjectiveType;
  /** PROMOTION_RACE: pawns the player must promote. */
  required?: number;
  /** PROMOTION_RACE: enemy countdown in enemy phases. */
  countdown?: number;
  /** ESCAPE exits / CONTROL squares. */
  squares?: Sq[];
  /** Boss objective label override. */
  label?: string;
}

export type BehaviorProfile =
  | { kind: 'aggressive' }
  | { kind: 'guard_king' }
  | { kind: 'hold_line'; rank?: number }
  | { kind: 'race_promotion' }
  | { kind: 'hunter'; target: 'king' | 'escapee' | 'queen' | 'protectee' };

export interface EnemyPieceSpec {
  type: PieceType;
  sq: Sq;
  tags?: PieceTag[];
  wards?: number;
}

export interface ReinforcementWave {
  /** Arrives during the enemy phase of this turn (step 2). */
  phase: number;
  pieces: EnemyPieceSpec[];
}

export interface EncounterConfig {
  id: string;
  templateId: string;
  name: string;
  act: number;
  kind: 'combat' | 'elite' | 'boss';
  objective: ObjectiveConfig;
  /** T: counts Player Turns (or enemy phases to survive). Null = no limit. */
  turnLimit: number | null;
  /** N: enemy intents per phase. */
  enemyActions: number;
  profile: BehaviorProfile;
  affixes: string[];
  bossId?: string;
  /** Seed for this encounter's enemyAI stream (stable across boss retries). */
  seed: string;
}

// ---------------------------------------------------------------------------
// Rules snapshot (copied from the run at encounter start)
// ---------------------------------------------------------------------------

export interface OwnedUpgrade {
  id: string;
  stacks: number;
  /** Acquisition order (lower = earlier); used for deterministic ordering (D4). */
  order: number;
}

export interface EncounterRules {
  upgrades: OwnedUpgrade[];
  /** Every enemy affix in force: run-level curses plus the encounter's own affixes. */
  affixes: string[];
}

// ---------------------------------------------------------------------------
// Misc state
// ---------------------------------------------------------------------------

export interface ReserveEntry {
  id: string;
  rosterId: string;
  type: PieceType;
}

export interface PendingArrival {
  id: string;
  spec: EnemyPieceSpec;
  /** Arrives at step 2 of this enemy phase. */
  phase: number;
  source: string;
}

export interface CapturedRecord {
  piece: Piece;
  byId: string | null;
  turn: number;
}

export type LogKind =
  | 'turn'
  | 'move'
  | 'trigger'
  | 'capture'
  | 'blocked'
  | 'intent'
  | 'fizzle'
  | 'enemy'
  | 'system'
  | 'objective'
  | 'warning';

export interface LogEntry {
  id: number;
  turn: number;
  depth: number;
  kind: LogKind;
  text: string;
  sqs?: Sq[];
}

export interface Outcome {
  result: 'won' | 'lost';
  reason: string;
  turn: number;
}

export interface ObjectiveProgress {
  promotions: number;
  countdown: number | null;
  enemyPromoted: boolean;
}

export interface EncounterStats {
  playerMoves: number;
  movesByType: Partial<Record<PieceType, number>>;
  captures: number;
  capturesByType: Partial<Record<PieceType, number>>;
  promotions: number;
  longestBishopMove: number;
  bishopLongMoves: number;
  extraActionsGranted: number;
  wardsBlocked: number;
  fizzles: number;
  immobilizations: number;
  piecesLost: number;
  deploys: number;
  triggers: number;
}

export interface EncounterState {
  config: EncounterConfig;
  rules: EncounterRules;
  board: (string | null)[];
  pieces: Record<string, Piece>;
  terrain: (Terrain | null)[];
  marks: SquareMark[];
  reserve: ReserveEntry[];
  arrivals: PendingArrival[];
  captured: CapturedRecord[];
  turn: number;
  phase: 'player' | 'enemy' | 'over';
  actions: ActionToken[];
  reserveDeploysLeft: number;
  intents: Intent[];
  telegraphs: Telegraph[];
  /** Encounter-scoped counters (e.g. Zeal). */
  counters: Record<string, number>;
  /** Usage flags reset at every Player Turn start ("once per turn"). */
  turnFlags: Record<string, number>;
  movedThisTurn: string[];
  movedLastTurn: string[];
  enPassant: { sq: Sq; pawnId: string } | null;
  objective: ObjectiveProgress;
  outcome: Outcome | null;
  log: LogEntry[];
  logSeq: number;
  nextId: number;
  rng: RngState;
  stats: EncounterStats;
}
