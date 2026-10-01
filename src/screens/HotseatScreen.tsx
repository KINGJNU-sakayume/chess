import { useMemo, useState } from 'react';
import { Board, type BoardPieceView, type BoardSquareView } from '../components/board/Board';
import { PromotionPicker } from '../components/PromotionPicker';
import {
  chessStatus,
  findKing,
  makeMove,
  movesFor,
  moveToUci,
  parseFen,
  START_FEN,
  type ChessMode,
  type ChessMove,
  type Position,
} from '../engine/chess';
import type { Sq } from '../engine/core/coords';
import type { PieceType } from '../engine/core/pieces';
import { useAppStore } from '../state/appStore';

/** M1 acceptance: a hot-seat, two-sided test board on the reference chess engine. */
export function HotseatScreen() {
  const go = useAppStore((s) => s.go);
  const [mode, setMode] = useState<ChessMode>('kingCapture');
  const [history, setHistory] = useState<{ pos: Position; move?: ChessMove }[]>([{ pos: parseFen(START_FEN) }]);
  const [selected, setSelected] = useState<Sq | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<ChessMove[] | null>(null);

  const pos = history[history.length - 1].pos;
  const last = history[history.length - 1].move;
  const status = chessStatus(pos, mode);
  const over = status.kind !== 'ongoing';
  const moves = useMemo(() => (over ? [] : movesFor(pos, mode)), [pos, mode, over]);

  const pieces: BoardPieceView[] = [];
  pos.board.forEach((p, sq) => {
    if (p) pieces.push({ id: `${sq}`, type: p.type, side: p.color === 'w' ? 'player' : 'enemy', sq });
  });

  const squares: Partial<Record<Sq, BoardSquareView>> = {};
  if (last) {
    squares[last.from] = { tone: 'last' };
    squares[last.to] = { tone: 'last' };
  }
  if (status.kind === 'ongoing' && status.check) {
    const k = findKing(pos, pos.turn);
    if (k !== -1) squares[k] = { tone: 'check' };
  }
  if (selected !== null) {
    squares[selected] = { ...squares[selected], tone: 'selected' };
    for (const m of moves) {
      if (m.from !== selected) continue;
      squares[m.to] = { ...squares[m.to], dot: m.captured ? 'capture' : m.castle ? 'special' : 'move' };
    }
  }

  const play = (m: ChessMove) => {
    setHistory((h) => [...h, { pos: makeMove(h[h.length - 1].pos, m), move: m }]);
    setSelected(null);
    setPendingPromotion(null);
  };

  const onSquareClick = (sq: Sq) => {
    if (over) return;
    if (selected !== null) {
      const candidates = moves.filter((m) => m.from === selected && m.to === sq);
      if (candidates.length > 1) {
        setPendingPromotion(candidates);
        return;
      }
      if (candidates.length === 1) {
        play(candidates[0]);
        return;
      }
    }
    const piece = pos.board[sq];
    setSelected(piece && piece.color === pos.turn ? sq : null);
  };

  const statusText = (() => {
    switch (status.kind) {
      case 'checkmate':
        return `Checkmate — ${status.winner === 'w' ? 'White' : 'Black'} wins`;
      case 'kingCaptured':
        return `King captured — ${status.winner === 'w' ? 'White' : 'Black'} wins`;
      case 'stalemate':
        return 'Stalemate';
      default:
        return `${pos.turn === 'w' ? 'White' : 'Black'} to move${status.check ? ' — check' : ''}`;
    }
  })();

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-4 p-4 lg:flex-row lg:items-start">
      <div className="relative w-full max-w-[min(88vh,720px)] flex-1">
        <Board pieces={pieces} squares={squares} onSquareClick={onSquareClick} />
        {pendingPromotion ? (
          <PromotionPicker
            side={pos.turn === 'w' ? 'player' : 'enemy'}
            options={pendingPromotion.map((m) => m.promotion as PieceType)}
            onPick={(t) => play(pendingPromotion.find((m) => m.promotion === t)!)}
            onCancel={() => setPendingPromotion(null)}
          />
        ) : null}
      </div>
      <aside className="panel flex w-full flex-col gap-3 p-4 lg:w-80">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-gold-300">Hot-seat Test Board</h2>
          <button type="button" className="btn btn-ghost text-xs" onClick={() => go('title')}>
            Back
          </button>
        </div>
        <p className="text-sm text-ink-200">{statusText}</p>
        <div className="flex gap-2">
          {(['kingCapture', 'strict'] as ChessMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`btn flex-1 text-xs ${mode === m ? 'btn-gold' : ''}`}
              onClick={() => {
                setMode(m);
                setSelected(null);
              }}
            >
              {m === 'kingCapture' ? 'King-capture' : 'Strict (check)'}
            </button>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-ink-300">
          King-capture is the gameplay royalty rule: moves may leave your King attacked, castling ignores check, and capturing
          the King wins. Strict mode is the orthodox reference used by the perft tests.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn flex-1"
            disabled={history.length <= 1}
            onClick={() => {
              setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
              setSelected(null);
            }}
          >
            Undo
          </button>
          <button
            type="button"
            className="btn flex-1"
            onClick={() => {
              setHistory([{ pos: parseFen(START_FEN) }]);
              setSelected(null);
            }}
          >
            Reset
          </button>
        </div>
        <ol className="max-h-64 overflow-y-auto rounded-lg bg-ink-900/60 p-2 font-mono text-xs text-ink-200">
          {history.slice(1).map((h, i) => (
            <li key={i}>
              {i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : '… '}
              {moveToUci(h.move!)}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
