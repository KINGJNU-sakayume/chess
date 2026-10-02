import { useMemo, type ReactNode } from 'react';
import type { Sq } from '../../engine/core/coords';
import type { EncounterState, Piece } from '../../engine/core/state';
import type { IntentPreview } from '../../engine/enemy/preview';
import type { Move } from '../../engine/moves/generate';
import { Board, type BoardArrow, type BoardPieceView, type BoardSquareView, type MoveDot } from '../board/Board';
import { fileOf, rankOf } from '../../engine/core/coords';
import { ArrivalMarker, ControlMarker, ExitMarker, MarkIcon, TerrainArt } from './SquareArt';
import { boardAura } from './buildIdentity';
import { PieceAura, PieceSigils } from './identity';

export interface BoardViewProps {
  state: EncounterState;
  selectedId: string | null;
  moves: Move[];
  deploySquares: Sq[];
  previews: IntentPreview[];
  attackOverlay: ArrayLike<number> | null;
  controlled?: Sq[];
  lastMove: { from: Sq; to: Sq } | null;
  highlight: Sq[];
  onSquareClick: (sq: Sq) => void;
  onSquareHover: (sq: Sq | null) => void;
  moveMs: number;
  /** Effect layer (F5). */
  fx?: ReactNode;
}

/** A Pawn swarm this large starts to march in place (F4). */
const SWARM_SIZE = 10;

function dotFor(m: Move): MoveDot {
  if (m.pierced.length) return 'pierce';
  if (m.castle) return 'special';
  if (m.captureId || m.rubble) return 'capture';
  if (m.sources.length) return 'extra';
  return 'move';
}

function PieceBadges({ state, p, intentIndex, intentCount }: { state: EncounterState; p: Piece; intentIndex: number | null; intentCount: number }) {
  const temp = p.tempWards.reduce((n, w) => n + w.count, 0);
  const wards = p.wards + temp;
  const immobilized = p.statuses.some((s) => s.type === 'IMMOBILIZED');
  return (
    <>
      {p.tags.includes('target') ? (
        <div className="absolute inset-[4%] rounded-full border-[3px] border-blood-400/90 shadow-[0_0_10px_rgba(229,103,93,0.7)]" />
      ) : null}
      {p.tags.includes('escapee') ? (
        <div className="absolute inset-[4%] rounded-full border-[3px] border-emerald-300/90 shadow-[0_0_10px_rgba(110,231,183,0.7)]" />
      ) : null}
      {p.tags.includes('protectee') ? (
        <div className="absolute inset-[4%] rounded-full border-[3px] border-sky-300/90 shadow-[0_0_10px_rgba(125,211,252,0.7)]" />
      ) : null}
      {immobilized ? (
        <div className="absolute inset-0 rounded-md bg-sky-300/25 ring-2 ring-sky-200/80">
          <svg viewBox="0 0 100 100" className="absolute left-[2%] top-[2%] h-[32%] w-[32%]" fill="none" stroke="#dff6ff" strokeWidth="9">
            <rect x="10" y="30" width="40" height="26" rx="13" />
            <rect x="50" y="44" width="40" height="26" rx="13" />
          </svg>
        </div>
      ) : null}
      {wards > 0 ? (
        <div className="absolute bottom-[2%] left-[2%] flex h-[34%] w-[34%] items-center justify-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            <path
              d="M50 6 L88 20 V48 C88 72 70 88 50 96 C30 88 12 72 12 48 V20 Z"
              fill={temp > 0 && p.wards === 0 ? 'rgba(94,200,214,0.55)' : '#2fa3b4'}
              stroke="#d9fbff"
              strokeWidth="7"
              strokeDasharray={temp > 0 && p.wards === 0 ? '14 8' : undefined}
            />
          </svg>
          <span className="relative text-[clamp(8px,1.3vmin,12px)] font-extrabold text-white">{wards}</span>
        </div>
      ) : null}
      <PieceSigils state={state} p={p} />
      {p.tags.includes('boss') ? (
        <svg viewBox="0 0 100 100" className="absolute left-[34%] top-[-6%] h-[30%] w-[32%]" fill="#e8c46a" stroke="#3b2a08" strokeWidth="5">
          <path d="M8 80 L14 24 L36 52 L50 16 L64 52 L86 24 L92 80 Z" />
        </svg>
      ) : null}
      {intentIndex !== null ? (
        <div className="absolute right-[2%] top-[2%] flex h-[28%] min-w-[28%] items-center justify-center rounded-full bg-blood-500 px-[3%] text-[clamp(8px,1.3vmin,12px)] font-bold text-white shadow ring-2 ring-black/40">
          {intentCount > 1 ? `${intentIndex + 1}–${intentIndex + intentCount}` : intentIndex + 1}
        </div>
      ) : null}
      {p.counters.besieged ? (
        <div
          title="Besieged: a Rook will bombard this piece at the start of your next turn"
          className="absolute bottom-[2%] right-[2%] flex h-[30%] w-[30%] items-center justify-center rounded-sm bg-amber-500/90 text-[clamp(8px,1.2vmin,11px)] font-black text-ink-950 ring-2 ring-black/40"
        >
          ⌖
        </div>
      ) : null}
      {p.counters.gambit ? (
        <div
          title={`Queen's Gambit: next move pierces ${p.counters.gambit}`}
          className="absolute bottom-[2%] right-[2%] flex h-[28%] min-w-[28%] items-center justify-center rounded-full bg-violet-500/90 px-[3%] text-[clamp(8px,1.2vmin,11px)] font-bold text-white ring-2 ring-black/40"
        >
          ⇶{p.counters.gambit}
        </div>
      ) : null}
    </>
  );
}

export function BoardView(props: BoardViewProps) {
  const { state, selectedId, moves, deploySquares, previews, attackOverlay, controlled, lastMove, highlight, moveMs } = props;

  const pieces: BoardPieceView[] = useMemo(() => {
    const intentIdx = new Map<string, number>();
    const intentCount = new Map<string, number>();
    previews.forEach((p) => {
      if (!intentIdx.has(p.intent.pieceId)) intentIdx.set(p.intent.pieceId, p.index);
      intentCount.set(p.intent.pieceId, (intentCount.get(p.intent.pieceId) ?? 0) + 1);
    });
    const pawns = Object.values(state.pieces).filter((p) => p.side === 'player' && p.type === 'pawn').length;
    const swarm = pawns >= SWARM_SIZE && moveMs > 0;
    return Object.values(state.pieces).map((p) => ({
      id: p.id,
      type: p.type,
      side: p.side,
      sq: p.sq,
      underlay: p.side === 'player' ? <PieceAura state={state} p={p} /> : null,
      overlay: <PieceBadges state={state} p={p} intentIndex={intentIdx.get(p.id) ?? null} intentCount={intentCount.get(p.id) ?? 0} />,
      className: swarm && p.side === 'player' && p.type === 'pawn' ? 'swarm-bob' : undefined,
      phaseMs: (fileOf(p.sq) * 233 + rankOf(p.sq) * 397) % 1600,
    }));
  }, [state, previews, moveMs]);
  const aura = useMemo(() => boardAura(state), [state]);

  const squares = useMemo(() => {
    const out: Partial<Record<Sq, BoardSquareView>> = {};
    const get = (sq: Sq) => (out[sq] ??= {});
    const decor = (sq: Sq, node: ReactNode) => {
      const v = get(sq);
      v.decor = (
        <>
          {v.decor}
          {node}
        </>
      );
    };
    // Terrain and marks.
    state.terrain.forEach((t, sq) => {
      if (t) decor(sq, <TerrainArt key={`t${sq}`} type={t} />);
    });
    const gateLabels = new Map<string, number>();
    for (const m of state.marks) {
      let label: string | undefined;
      if (m.type === 'KNIGHT_GATE') {
        const pairKey = [m.sq, m.linkSq].sort().join('-');
        if (!gateLabels.has(pairKey)) gateLabels.set(pairKey, gateLabels.size + 1);
        label = `G${gateLabels.get(pairKey)}`;
      }
      decor(m.sq, <MarkIcon key={m.id} type={m.type} dimmed={m.suppressed} label={label} />);
      get(m.sq).title = undefined;
    }
    for (const sq of state.config.objective.squares ?? []) {
      if (state.config.objective.type === 'ESCAPE') decor(sq, <ExitMarker key={`x${sq}`} />);
      if (state.config.objective.type === 'CONTROL') decor(sq, <ControlMarker key={`c${sq}`} controlled={!!controlled?.includes(sq)} />);
    }
    for (const t of state.telegraphs) {
      for (const sq of t.squares) {
        const v = get(sq);
        v.top = (
          <>
            {v.top}
            <ArrivalMarker key={`${t.id}${sq}`} label={t.kind === 'reinforcements' ? `+${t.inPhases + 1}` : t.inPhases === 0 ? '!' : `${t.inPhases + 1}`} />
          </>
        );
      }
    }
    if (attackOverlay) {
      for (let sq = 0; sq < 64; sq++) if (attackOverlay[sq] > 0) get(sq).tint = 'rgba(201, 65, 58, 0.22)';
    }
    if (lastMove) {
      get(lastMove.from).tone = 'last';
      get(lastMove.to).tone = 'last';
    }
    for (const sq of highlight) get(sq).tone = 'hover';
    // Intent destinations. Chained routes (bosses) also number each stop, matching the intent list.
    const routeLength = new Map<string, number>();
    for (const p of previews) routeLength.set(p.intent.pieceId, (routeLength.get(p.intent.pieceId) ?? 0) + 1);
    for (const p of previews) {
      const v = get(p.intent.to);
      if ((routeLength.get(p.intent.pieceId) ?? 0) > 1) {
        v.top = (
          <>
            {v.top}
            <div
              key={`step${p.index}`}
              className={`absolute bottom-[3%] right-[3%] flex h-[26%] w-[26%] items-center justify-center rounded-full text-[clamp(8px,1.3vmin,12px)] font-bold text-white shadow ring-2 ring-black/40 ${p.willLand ? 'bg-blood-500' : 'bg-ink-500/80 line-through'}`}
            >
              {p.index + 1}
            </div>
          </>
        );
      }
      if (p.willLand) {
        v.top = (
          <>
            {v.top}
            <div className="absolute inset-[18%] rounded-full border-[3px] border-blood-400/90" />
            <div className="absolute left-1/2 top-[8%] h-[84%] w-[3px] -translate-x-1/2 bg-blood-400/70" />
            <div className="absolute left-[8%] top-1/2 h-[3px] w-[84%] -translate-y-1/2 bg-blood-400/70" />
          </>
        );
      }
    }
    if (selectedId) {
      const sel = state.pieces[selectedId];
      if (sel) get(sel.sq).tone = 'selected';
      for (const m of moves) {
        const v = get(m.to);
        const dot = dotFor(m);
        // Prefer the most informative dot when variants share a square.
        const rank: MoveDot[] = ['move', 'extra', 'special', 'capture', 'pierce'];
        if (!v.dot || rank.indexOf(dot) > rank.indexOf(v.dot)) v.dot = dot;
      }
    }
    for (const sq of deploySquares) get(sq).dot = 'deploy';
    return out;
  }, [state, selectedId, moves, deploySquares, previews, attackOverlay, controlled, lastMove, highlight]);

  const arrows: BoardArrow[] = useMemo(
    () =>
      previews.map((p) => ({
        from: p.intent.from,
        to: p.intent.to,
        color: p.willLand ? (p.victimType ? '#e5675d' : '#d9906b') : '#8f8a99',
        dashed: !p.willLand,
        opacity: p.willLand ? 0.88 : 0.55,
      })),
    [previews],
  );

  return (
    <Board
      pieces={pieces}
      squares={squares}
      arrows={arrows}
      onSquareClick={props.onSquareClick}
      onSquareHover={props.onSquareHover}
      moveMs={props.moveMs}
      fx={props.fx}
      aura={aura}
    />
  );
}
