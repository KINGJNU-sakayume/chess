import { sqOf, type Sq } from '../core/coords';
import type { PieceType } from '../core/pieces';

/** A persistent roster entry (B6): a piece type plus its formation square. */
export interface RosterPiece {
  id: string;
  type: PieceType;
  /** Formation square inside the deployment zone, or null = Reserve. */
  sq: Sq | null;
  /** Locked by a starting-position upgrade (formation editor cannot move it). */
  locked?: boolean;
}

const BACK: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

/** The orthodox starting army on ranks 1–2. */
export function standardRoster(): RosterPiece[] {
  const out: RosterPiece[] = [];
  BACK.forEach((type, file) => out.push({ id: `r${file}`, type, sq: sqOf(file, 0) }));
  for (let file = 0; file < 8; file++) out.push({ id: `p${file}`, type: 'pawn', sq: sqOf(file, 1) });
  return out;
}
