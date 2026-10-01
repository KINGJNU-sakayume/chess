import type { PieceType } from '../engine/core/pieces';

/** Recruitment offers (B9 Recruitment node, B11 "add a piece"). */
export interface RecruitDef {
  id: string;
  label: string;
  pieces: PieceType[];
  weight: number;
}

export const RECRUITS: RecruitDef[] = [
  { id: 'pawns2', label: 'Two Pawns', pieces: ['pawn', 'pawn'], weight: 28 },
  { id: 'pawns3', label: 'Pawn Levy (3 Pawns)', pieces: ['pawn', 'pawn', 'pawn'], weight: 10 },
  { id: 'knight', label: 'Knight', pieces: ['knight'], weight: 24 },
  { id: 'bishop', label: 'Bishop', pieces: ['bishop'], weight: 24 },
  { id: 'rook', label: 'Rook', pieces: ['rook'], weight: 14 },
];
