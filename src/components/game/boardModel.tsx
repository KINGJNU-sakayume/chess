import type { BoardPieceView, BoardSquareView } from '../board/Board';
import type { UiPieceType } from '../board/PieceSvg';
import { PieceOverlay, Trap, Wall } from './BoardDecor';
import type { Position } from '../../engine/game/position';
import {
  ARCHBISHOP,
  BISHOP,
  CENTER_SQUARES,
  CHANCELLOR,
  COLOR_NAME,
  F_FROZEN,
  F_SHIELD,
  KING,
  KIND_NAME,
  KNIGHT,
  M_CASTLE,
  M_EP,
  PAWN,
  QUEEN,
  ROOK,
  T_TRAP_B,
  T_TRAP_W,
  T_WALL,
  WHITE,
  type Color,
} from '../../engine/game/types';
import { cardTargets, type MatchState } from '../../engine/match/match';

const UI_TYPE: Record<number, UiPieceType> = {
  [PAWN]: 'pawn',
  [KNIGHT]: 'knight',
  [BISHOP]: 'bishop',
  [ROOK]: 'rook',
  [QUEEN]: 'queen',
  [KING]: 'king',
  [ARCHBISHOP]: 'archbishop',
  [CHANCELLOR]: 'chancellor',
};

export const uiType = (kind: number): UiPieceType => UI_TYPE[kind];

/** Rule changes that apply to a piece kind, as short Korean notes. */
export function kindNotes(pos: Position, color: Color, kind: number): string[] {
  const r = pos.rules[color];
  const out: string[] = [];
  if (kind === KNIGHT && r.knightCamel) out.push('(3,1) 도약 추가');
  if (kind === KNIGHT && r.knightOath) out.push('잡으면 보호막');
  if (kind === BISHOP && r.bishopStep) out.push('상하좌우 한 칸 추가');
  if (kind === ROOK && r.rookStep) out.push('대각선 한 칸 추가');
  if (kind === QUEEN && r.queenKnight) out.push('나이트 행마 추가(아마존)');
  if (kind === KING && r.kingRange > 1) out.push('두 칸까지 이동');
  if (kind === ARCHBISHOP) out.push(r.bishopStep ? '비숍 + 나이트 행마, 상하좌우 한 칸 추가' : '비숍 + 나이트 행마');
  if (kind === CHANCELLOR) out.push(r.rookStep ? '룩 + 나이트 행마, 대각선 한 칸 추가' : '룩 + 나이트 행마');
  if (kind === PAWN) {
    if (r.pawnSidestep) out.push('좌우 이동·잡기');
    if (r.pawnCharge) out.push('어디서나 두 칸 전진');
    if (r.pawnPike) out.push('정면 잡기');
    if (r.pawnRetreat) out.push('뒤로 한 칸, 대각선 뒤로 잡기');
    if (r.martyrPawns) out.push('잡히면 상대도 제거(순교)');
    if (r.pawnOath) out.push('잡으면 보호막');
    if (r.promoRank < 7) out.push(`${color === WHITE ? r.promoRank + 1 : 8 - r.promoRank}번째 줄에서 승진`);
    if (r.breakthrough) out.push('승진하면 승리(돌파)');
  }
  if (r.shieldSpentOnCapture && kind !== QUEEN) out.push('잡으면 보호막이 사라짐(신성한 가호)');
  return out;
}

export interface BoardUi {
  selected: number | null;
  targeting: string | null;
  dangerHints: boolean;
  /** Is the side to move controlled by a human here (show move dots)? */
  interactive: boolean;
}

export function buildBoard(m: MatchState, ui: BoardUi): { pieces: BoardPieceView[]; squares: Partial<Record<number, BoardSquareView>> } {
  const pos = m.pos;
  const pieces: BoardPieceView[] = [];
  const squares: Partial<Record<number, BoardSquareView>> = {};
  const sqv = (sq: number): BoardSquareView => (squares[sq] ??= {});

  const hill = pos.rules[0].kingOfTheHill || pos.rules[1].kingOfTheHill;
  if (hill) {
    for (const sq of CENTER_SQUARES) {
      sqv(sq).tint = 'rgba(232, 196, 106, 0.32)';
      sqv(sq).title = '언덕: 언덕의 왕 증강을 가진 쪽의 킹이 들어서면 승리';
    }
  }

  for (let sq = 0; sq < 64; sq++) {
    const t = pos.terrain[sq];
    if (t === T_WALL) {
      sqv(sq).decor = <Wall />;
      sqv(sq).title = '바리케이드: 지나갈 수 없지만, 잡듯이 들어가 부술 수 있습니다';
    } else if (t === T_TRAP_W || t === T_TRAP_B) {
      const owner: Color = t === T_TRAP_W ? 0 : 1;
      sqv(sq).decor = <Trap owner={owner} />;
      sqv(sq).title = `${COLOR_NAME[owner]}의 함정: ${COLOR_NAME[(owner ^ 1) as Color]} 기물이 들어오면 제거됩니다(킹은 함정만 해제)`;
    }
    const code = pos.board[sq];
    if (!code) continue;
    const kind = code & 15;
    const color = (code >> 4) as Color;
    pieces.push({
      id: m.ids[sq] ?? `x${sq}`,
      type: UI_TYPE[kind],
      side: color === WHITE ? 'white' : 'black',
      sq,
      overlay: <PieceOverlay pos={pos} sq={sq} />,
    });
    const notes = kindNotes(pos, color, kind);
    if (pos.flags[sq] & F_SHIELD) notes.push('보호막');
    if (pos.flags[sq] & F_FROZEN) notes.push('동결: 이번 턴에 움직일 수 없음');
    const title = `${COLOR_NAME[color]} ${KIND_NAME[kind]}${notes.length ? ` — ${notes.join(', ')}` : ''}`;
    sqv(sq).title = squares[sq]?.title && pos.terrain[sq] ? `${title} / ${squares[sq]!.title}` : title;
  }

  if (m.lastMove) {
    sqv(m.lastMove & 63).tone = 'last';
    sqv((m.lastMove >> 6) & 63).tone = 'last';
  }

  if (m.phase === 'play') {
    const us = pos.side as Color;
    const k = pos.kingSq[us];
    if (k >= 0 && pos.inCheck(us)) sqv(k).tone = 'check';

    if (ui.targeting && ui.interactive) {
      for (const t of cardTargets(m, us, ui.targeting)) {
        sqv(t).tone = 'target';
        sqv(t).dot = 'target';
      }
    } else if (ui.selected !== null && ui.interactive) {
      sqv(ui.selected).tone = 'selected';
      const them = (us ^ 1) as Color;
      for (const mv of pos.moves()) {
        if ((mv & 63) !== ui.selected) continue;
        const to = (mv >> 6) & 63;
        const capture = pos.board[to] !== 0 || (mv & M_EP) !== 0;
        let danger = false;
        if (ui.dangerHints) {
          pos.makeMove(mv);
          const king = pos.kingSq[us];
          danger = pos.winner < 0 && king >= 0 && !(pos.flags[king] & F_SHIELD) && pos.isAttacked(king, them);
          pos.unmakeMove();
        }
        const v = sqv(to);
        if (mv & M_CASTLE) v.dot = 'special';
        else if (capture) v.dot = danger ? 'danger-capture' : 'capture';
        else if (!v.dot || v.dot === 'move') v.dot = danger ? 'danger' : 'move';
      }
    }
  }
  return { pieces, squares };
}
