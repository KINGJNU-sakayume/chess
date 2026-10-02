import type { Sq } from '../core/coords';
import type { PieceType } from '../core/pieces';
import type { EncounterState, ObjectiveType, OwnedUpgrade } from '../core/state';
import type { PlayerActionInput } from '../encounters/flow';
import type { PlacedMutation } from '../encounters/setup';
import type { StreamStates } from '../rng/rng';
import type { RosterPiece } from './roster';

/** Persistent run state (B7–B9, G1). Pure data: serializable as JSON. */

export const RUN_SCHEMA_VERSION = 2;

export type NodeType = 'combat' | 'elite' | 'upgrade' | 'shop' | 'mutation' | 'recruit' | 'event' | 'sacrifice' | 'boss';

export const NON_COMBAT: readonly NodeType[] = ['upgrade', 'shop', 'mutation', 'recruit', 'event', 'sacrifice'];

export interface MapNode {
  id: string;
  row: number;
  /** Horizontal layout position in [0, 1]. */
  x: number;
  type: NodeType;
  /** Ids of reachable nodes in the next row. */
  next: string[];
  /** Encounter template (combat/elite/boss) — shown on the map. */
  templateId?: string;
  objective?: ObjectiveType;
  /** Stable seed for whatever happens at this node. */
  seed: string;
}

export interface ActMap {
  act: number;
  rows: number;
  nodes: MapNode[];
}

export interface RecruitOffer {
  id: string;
  label: string;
  pieces: PieceType[];
}

export interface ShopItem {
  kind: 'upgrade' | 'piece' | 'crown' | 'removeCurse';
  id: string;
  label: string;
  price: number;
  sold?: boolean;
  pieces?: PieceType[];
}

/** A choice the player must make before returning to the map. */
export type Pending =
  | { kind: 'reward'; source: 'combat' | 'elite' | 'boss' | 'upgrade' | 'sacrifice' | 'event'; offers: string[]; gold: number; crown: boolean }
  | { kind: 'mutationOffer'; offers: string[] }
  | { kind: 'recruit'; offers: RecruitOffer[] }
  | { kind: 'place'; upgradeId: string; step: PlaceStep; resume?: Pending }
  | { kind: 'shop'; items: ShopItem[]; rerolls: number }
  | { kind: 'event'; eventId: string }
  | { kind: 'sacrifice'; stage: 'choose' | 'reward'; offers: string[] }
  | { kind: 'defeat'; nodeId: string; boss: boolean; reason: string };

export type PlaceStep =
  | { kind: 'squares'; square: string; count: 1 | 2; shape: 'single' | 'pair' }
  | { kind: 'line' }
  | { kind: 'piece'; pieceType: PieceType; then: 'advanceToRank3' | 'chooseSquareRank34' }
  | { kind: 'pieceSquare'; rosterId: string }
  | { kind: 'castledSide' }
  | { kind: 'rank4'; count: number };

export interface RunStats {
  encountersWon: number;
  encountersLost: number;
  turnsPlayed: number;
  captures: number;
  promotions: number;
  bishopLongMoves: number;
  longestBishopMove: number;
  movesByType: Partial<Record<PieceType, number>>;
  extraActions: number;
  goldEarned: number;
  fizzles: number;
  immobilizations: number;
  wardsBlocked: number;
}

export interface RunLogEntry {
  act: number;
  text: string;
}

export interface RunState {
  schema: number;
  seed: string;
  rng: StreamStates;
  act: number;
  map: ActMap;
  /** Last node entered in this act (null at act start). */
  at: string | null;
  visited: string[];
  roster: RosterPiece[];
  upgrades: OwnedUpgrade[];
  mutations: PlacedMutation[];
  /** Forward Deployment's chosen rank-4 squares. */
  rank4: Sq[];
  /** Run-level enemy affixes accepted as curses. */
  curses: string[];
  crowns: number;
  gold: number;
  /** Next acquisition order index (D4 ordering). */
  acquisitions: number;
  encounter: EncounterState | null;
  encounterNode: string | null;
  /** Undo snapshots for the current Player Turn (transient; never saved). */
  undo: EncounterState[];
  pending: Pending | null;
  /** The node whose content is pending (shop/event/etc.). */
  pendingNode: string | null;
  result: null | { outcome: 'victory' | 'defeat'; act: number };
  stats: RunStats;
  history: RunLogEntry[];
  /** Every run action taken, in order (G1/D6 replay). */
  actions: RunAction[];
}

export type RunAction =
  | { type: 'chooseNode'; nodeId: string }
  | { type: 'encounterAct'; action: PlayerActionInput }
  | { type: 'endTurn' }
  | { type: 'undo' }
  | { type: 'finishEncounter' }
  | { type: 'pickOffer'; index: number }
  | { type: 'skip' }
  | { type: 'placeSquares'; squares: Sq[] }
  | { type: 'placeLine'; axis: 'rank' | 'file'; index: number }
  | { type: 'pickPiece'; rosterId: string }
  | { type: 'pickSide'; side: 'king' | 'queen' }
  | { type: 'buy'; index: number }
  | { type: 'reroll' }
  | { type: 'leave' }
  | { type: 'eventChoice'; index: number }
  | { type: 'sacrificePiece'; rosterId: string }
  | { type: 'acceptCurse' }
  | { type: 'formation'; roster: RosterPiece[] }
  | { type: 'retryBoss' }
  | { type: 'continueAfterDefeat' };
