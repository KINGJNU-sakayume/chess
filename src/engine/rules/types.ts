import type { Sq } from '../core/coords';
import type { PieceType, Side } from '../core/pieces';
import type { SquareType, TimePoint } from '../core/state';

/**
 * The upgrade/rule DSL. Upgrades are plain TypeScript data composed from the
 * effect primitives of Part B1; the RuleEngine interprets them. Anything that
 * cannot be expressed declaratively uses a *named* custom effect/predicate
 * registered in `engine/effects/custom.ts` (documented + tested there).
 */

// ---------------------------------------------------------------------------
// Primitives & metadata
// ---------------------------------------------------------------------------

export type Primitive =
  | 'MOVE_PATTERN'
  | 'PIERCE'
  | 'EXTRA_ACTION'
  | 'WARD'
  | 'STATUS'
  | 'MARK_SQUARE'
  | 'SPAWN'
  | 'REPOSITION'
  | 'PROMOTION_RULE'
  | 'RESTRICT_ENEMY'
  | 'ROSTER';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export type UpgradeCategory = 'piece' | 'mutation' | 'start' | 'debuff';

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/**
 * A number that may depend on the upgrade's stack count or on counters.
 * Object form: `base + perStack * stacks + counter + pieceCounter`, clamped.
 */
export type NumExpr =
  | number
  | 'stacks'
  | {
      base?: number;
      perStack?: number;
      min?: number;
      max?: number;
      counter?: string;
      pieceCounter?: string;
    };

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const GAME_EVENTS = [
  'onRunStart',
  'onEncounterStart',
  'onPieceAdded',
  'onTurnStart',
  'onReserveDeploy',
  'onBeforeMove',
  'onPieceMove',
  'onSquareCrossed',
  'onSquareEntered',
  'onAttack',
  'onCapture',
  'onCaptureBlocked',
  'onPieceDestroyed',
  'onPieceLanded',
  'onCheck',
  'onFork',
  'onCastle',
  'onEnPassant',
  'onPromotion',
  'onAltarActivated',
  'onIntentPlanned',
  'onIntentFizzled',
  'onEnemyPhaseStart',
  'onEnemyPhaseEnd',
  'onTurnEnd',
  'onAfterAction',
  'onEncounterWon',
  'onEncounterLost',
] as const;

export type GameEventType = (typeof GAME_EVENTS)[number];

export interface GameEvent {
  type: GameEventType;
  turn: number;
  /** Acting piece: mover, capturer, promoter, lander, intent piece. */
  actorId?: string;
  actorType?: PieceType;
  side?: Side;
  /** Captured / blocked / affected piece. */
  targetId?: string;
  targetType?: PieceType;
  targetSide?: Side;
  from?: Sq;
  to?: Sq;
  /** Crossed / entered / landed square. */
  sq?: Sq;
  /** Squares travelled (Chebyshev length of the move). */
  distance?: number;
  /** Squares strictly between origin and destination, in path order. */
  path?: Sq[];
  /** REPOSITION or otherwise free (no action spent). */
  free?: boolean;
  /** The move ended in a successful capture. */
  capture?: boolean;
  /** Pieces attacked after the move (onFork / onCheck). */
  attackedIds?: string[];
  promotedTo?: PieceType;
  /** Free-form extra context for custom predicates. */
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export interface Condition {
  actorType?: PieceType | PieceType[];
  actorSide?: Side;
  targetType?: PieceType | PieceType[];
  targetSide?: Side;
  /** event.distance >= value */
  minDistance?: NumExpr;
  /** event.free must equal this. */
  free?: boolean;
  /** event.capture must equal this. */
  capture?: boolean;
  /** Encounter counter >= value. */
  counterAtLeast?: [string, NumExpr];
  /** Named predicate from the custom registry. */
  custom?: string;
}

/** Conditions on a piece, used by movement modifiers (Layer B). */
export interface PieceCondition {
  counterAtLeast?: [string, NumExpr];
  pieceCapturesAtLeast?: NumExpr;
  pieceCounterAtLeast?: [string, NumExpr];
  /** The piece stands on a file with no Pawns of either side. */
  onPawnlessFile?: boolean;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export type TargetRef = 'actor' | 'target' | 'allyQueens';

export interface TokenRestrictionDef {
  pieceTypes?: PieceType[];
  /** Only the acting piece may use it. */
  actorOnly?: boolean;
  /** Any piece except the acting piece ("a different Bishop"). */
  excludeActor?: boolean;
  excludeTypes?: PieceType[];
  nonCapturing?: boolean;
}

export interface RelativeExpiry {
  at: TimePoint;
  /** Added to the current turn number. */
  turnOffset: NumExpr;
}

export type EffectDef =
  | { type: 'ADD_COUNTER'; counter: string; amount: NumExpr; label: string }
  | { type: 'ADD_PIECE_COUNTER'; target: TargetRef; counter: string; amount: NumExpr; label: string }
  | { type: 'GRANT_ACTION'; count: NumExpr; restriction?: TokenRestrictionDef; label: string }
  | { type: 'ADD_WARD'; target: TargetRef; count: NumExpr; until?: RelativeExpiry }
  | { type: 'APPLY_STATUS'; target: 'adjacentEnemiesOfActor' | TargetRef; status: 'IMMOBILIZED'; phases: NumExpr }
  | { type: 'MARK_PATH'; mark: SquareType; until: RelativeExpiry }
  | { type: 'CUSTOM'; name: string; params?: Record<string, number | string | boolean> };

export interface HookDef {
  event: GameEventType;
  /** Lower resolves first (D4). Default 0. */
  priority?: number;
  condition?: Condition;
  /**
   * Usage limiter — the "once per turn / per piece" wording that D4 requires
   * on effects that could otherwise loop. `uses` defaults to 1.
   */
  limit?: { per: 'turn' | 'pieceTurn' | 'encounter'; uses?: NumExpr };
  effects: EffectDef[] | ((stacks: number) => EffectDef[]);
}

// ---------------------------------------------------------------------------
// Movement modifiers (Layer B step 2)
// ---------------------------------------------------------------------------

export type VectorSet = 'orthogonal' | 'diagonal' | 'all';

export type MoveMode = 'both' | 'quiet' | 'capture';

export type MoveAddition =
  /** Add rays (range 1 = steps) to the piece. */
  | { type: 'MOVE_PATTERN'; vectors: VectorSet; range: NumExpr; mode?: MoveMode }
  /** Raise the range of existing rays in the given directions to at least `range`. */
  | { type: 'RANGE'; vectors: VectorSet; range: NumExpr }
  /** Slides may pass through pieces of the given owner (only the final square is captured). */
  | {
      type: 'PIERCE';
      count: NumExpr | 'unlimited';
      owner: 'enemy' | 'ally' | 'any';
      /** Restrict to rays along this axis. Default: any. */
      axis?: 'file' | 'rank' | 'diagonal' | 'any';
    }
  /** Pawns may push up to `max` squares from any rank if the path is empty. */
  | { type: 'PAWN_ADVANCE'; max: NumExpr }
  /** Diagonal-forward step into an empty square when orthogonally adjacent to an allied Pawn. */
  | { type: 'PAWN_DIAGONAL_ADVANCE' }
  /** Castling costs no action. */
  | { type: 'FREE_CASTLE' };

export interface MoveModDef {
  pieceType: PieceType | PieceType[];
  when?: PieceCondition;
  add: MoveAddition;
}

// ---------------------------------------------------------------------------
// Run-level effects
// ---------------------------------------------------------------------------

export type RosterEffect =
  | { type: 'ADD_PIECE'; pieceType: PieceType; count: number }
  | { type: 'REMOVE_FILE_PAWNS'; files: number[] };

/** Choices the player makes when acquiring an upgrade. */
export type AcquireChoice =
  | { kind: 'placeSquare'; square: SquareType; shape: 'single' | 'pair' | 'line' }
  | { kind: 'choosePiece'; pieceType: PieceType; then: 'advanceToRank3' | 'chooseSquareRank34' }
  | { kind: 'castledSide' }
  | { kind: 'chooseRank4Squares'; count: number; fromStack: number };

export interface CounterDef {
  id: string;
  label: string;
  thresholds?: number[];
}

export interface UpgradeDef {
  id: string;
  name: string;
  rarity: Rarity;
  category: UpgradeCategory;
  tags: string[];
  stackable: boolean;
  /** "own N+ upgrades with tag X" (counted in stacks). */
  prerequisites: { tag: string; count: number }[];
  primitives: Primitive[];
  /** Stacks beyond this have no further effect (offers skip saturated upgrades). */
  maxUsefulStacks?: number;
  /** Piece types this upgrade modifies (for the piece inspector). */
  affects: PieceType[];
  counters?: CounterDef[];
  hooks?: HookDef[];
  moveModifiers?: MoveModDef[];
  /** PROMOTION_RULE: promotion rank = 8 + rankDelta(stacks), never below minRank. */
  promotion?: { rankDelta: NumExpr; minRank: number };
  roster?: RosterEffect[];
  /** Extra free Reserve deployments per turn. */
  reserveDeploys?: NumExpr;
  /** Deployment zone expansion (Forward Deployment). */
  deploymentRank3?: boolean;
  choice?: AcquireChoice;
  /** Player square type placed by this mutation. */
  mutation?: SquareType;
  /** Enemy debuff id handled by the setup pipeline / planner / move generator. */
  debuff?: 'heavyQueen' | 'crackedFormation' | 'delayedReinforcement' | 'slowCommand' | 'royalCurse';
  describe: (stacks: number) => string;
  /** Short line for each stack beyond the first. */
  stackText?: string;
  flavor?: string;
}

export interface AffixDef {
  id: string;
  name: string;
  description: string;
  /** Applied by the setup pipeline. */
  enemyWards?: { pieceType: PieceType | 'all' | 'targets'; count: number };
  extraPawns?: number;
  extraWave?: boolean;
  extraAction?: boolean;
  /** Enemy Pawns adjacent to each other cannot be captured by Pawns. */
  phalanx?: boolean;
  /** Enemy pieces start one rank closer. */
  vanguard?: boolean;
  /** Enemy Pawns promote on this many ranks earlier. */
  hastyPromotion?: number;
  curse?: boolean;
}
