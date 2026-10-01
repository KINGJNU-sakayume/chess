import { FILES, parseSq, sqName, sqOf, type Sq } from '../core/coords';
import { LETTER_TO_TYPE, PIECE_LETTER, type PieceType } from '../core/pieces';

/**
 * Strict standard-chess reference model (Part B3: used for perft and as a
 * reference only — gameplay uses the king-capture RuleEngine).
 */
export type Color = 'w' | 'b';
export interface ChessPiece {
  color: Color;
  type: PieceType;
}
export interface CastlingRights {
  wK: boolean;
  wQ: boolean;
  bK: boolean;
  bQ: boolean;
}
export interface Position {
  board: (ChessPiece | null)[];
  turn: Color;
  castling: CastlingRights;
  ep: Sq | null;
  halfmove: number;
  fullmove: number;
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const opposite = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export function parseFen(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) throw new Error(`Invalid FEN: ${fen}`);
  const [placement, turn, castling, ep, half = '0', full = '1'] = parts;
  const board: (ChessPiece | null)[] = new Array(64).fill(null);
  const rows = placement.split('/');
  if (rows.length !== 8) throw new Error(`Invalid FEN placement: ${placement}`);
  rows.forEach((row, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch);
      } else {
        const type = LETTER_TO_TYPE[ch.toLowerCase()];
        if (!type) throw new Error(`Invalid FEN piece: ${ch}`);
        board[sqOf(file, rank)] = { color: ch === ch.toUpperCase() ? 'w' : 'b', type };
        file++;
      }
    }
    if (file !== 8) throw new Error(`Invalid FEN row: ${row}`);
  });
  return {
    board,
    turn: turn === 'b' ? 'b' : 'w',
    castling: {
      wK: castling.includes('K'),
      wQ: castling.includes('Q'),
      bK: castling.includes('k'),
      bQ: castling.includes('q'),
    },
    ep: ep === '-' ? null : parseSq(ep),
    halfmove: Number(half),
    fullmove: Number(full),
  };
}

export function toFen(pos: Position): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const p = pos.board[sqOf(file, rank)];
      if (!p) {
        empty++;
        continue;
      }
      if (empty) row += String(empty);
      empty = 0;
      const letter = PIECE_LETTER[p.type];
      row += p.color === 'w' ? letter : letter.toLowerCase();
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  const c = pos.castling;
  const castling = (c.wK ? 'K' : '') + (c.wQ ? 'Q' : '') + (c.bK ? 'k' : '') + (c.bQ ? 'q' : '') || '-';
  return [rows.join('/'), pos.turn, castling, pos.ep === null ? '-' : sqName(pos.ep), pos.halfmove, pos.fullmove].join(' ');
}

export { FILES };
