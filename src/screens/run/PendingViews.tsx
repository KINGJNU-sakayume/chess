import { useMemo, useState } from 'react';
import { sqName, type Sq } from '../../engine/core/coords';
import { PIECE_NAME } from '../../engine/core/pieces';
import { legalPieces, legalPlacementSquares, stacksOf } from '../../engine/run/acquire';
import { formationBoard } from './formationBoard';
import type { RunAction, RunState } from '../../engine/run/types';
import { upgradeDef } from '../../engine/rules/registry';
import { EVENTS } from '../../data/events';
import { SQUARE_INFO } from '../../data/squares';
import { Board } from '../../components/board/Board';
import { PieceSvg } from '../../components/board/PieceSvg';
import { UpgradeCard } from '../../components/run/UpgradeCard';

type Dispatch = (a: RunAction) => boolean;

function Title({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-5 text-center">
      <h2 className="font-display text-3xl text-gold-300">{children}</h2>
      {sub ? <p className="mt-1 text-sm text-ink-300">{sub}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function RewardView({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  const p = run.pending!;
  const offers = p.kind === 'reward' || p.kind === 'mutationOffer' || p.kind === 'sacrifice' ? p.offers : [];
  const titles: Record<string, string> = {
    combat: 'Victory',
    elite: 'Elite defeated',
    boss: 'Boss defeated',
    upgrade: 'Upgrade',
    event: 'A gift of knowledge',
    sacrifice: 'The price is paid',
  };
  const title = p.kind === 'reward' ? titles[p.source] : p.kind === 'mutationOffer' ? 'Board Mutation' : 'The price is paid';
  const sub =
    p.kind === 'reward'
      ? [p.gold ? `+${p.gold} gold` : '', p.crown ? '+1 Crown' : '', 'Choose 1 upgrade — it stays active for the whole run.'].filter(Boolean).join(' · ')
      : p.kind === 'mutationOffer'
        ? 'Choose a square to add to your board. Mutations persist across every encounter.'
        : 'Choose 1 of 3 powerful upgrades.';
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Title sub={sub}>{title}</Title>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {offers.map((id, i) => (
          <UpgradeCard key={id} id={id} owned={stacksOf(run, id)} onPick={() => dispatch({ type: 'pickOffer', index: i })} />
        ))}
      </div>
      {offers.length === 0 ? <p className="text-center text-ink-300">Nothing left to offer.</p> : null}
      <div className="mt-6 text-center">
        <button type="button" className="btn btn-ghost text-sm" onClick={() => dispatch({ type: 'skip' })}>
          Skip
        </button>
      </div>
    </div>
  );
}

export function RecruitView({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  const p = run.pending!;
  if (p.kind !== 'recruit') return null;
  return (
    <div className="mx-auto w-full max-w-4xl">
      <Title sub="Choose new pieces for your roster. Overflow waits in Reserve and deploys during encounters.">Recruitment</Title>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {p.offers.map((o, i) => (
          <button key={o.id} type="button" className="panel flex flex-col items-center gap-3 p-5 hover:brightness-110" onClick={() => dispatch({ type: 'pickOffer', index: i })}>
            <div className="flex">
              {o.pieces.map((t, j) => (
                <PieceSvg key={j} type={t} side="player" className="h-16 w-16" />
              ))}
            </div>
            <div className="font-display text-lg text-ink-100">{o.label}</div>
          </button>
        ))}
      </div>
      <div className="mt-6 text-center">
        <button type="button" className="btn btn-ghost text-sm" onClick={() => dispatch({ type: 'skip' })}>
          Skip
        </button>
      </div>
    </div>
  );
}

export function PlaceView({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  const p = run.pending!;
  const [picked, setPicked] = useState<Sq[]>([]);
  const legal = useMemo(() => legalPlacementSquares(run), [run]);
  const pieces = useMemo(() => legalPieces(run), [run]);
  if (p.kind !== 'place') return null;
  const def = upgradeDef(p.upgradeId);
  const step = p.step;

  let instructions = '';
  let count = 1;
  if (step.kind === 'squares') {
    count = step.count;
    instructions =
      step.count === 2
        ? `Choose two squares (ranks 1–6) for the linked ${SQUARE_INFO[step.square as keyof typeof SQUARE_INFO].name}s.`
        : `Choose a square (ranks 1–6) for the ${SQUARE_INFO[step.square as keyof typeof SQUARE_INFO].name}.`;
  } else if (step.kind === 'pieceSquare') instructions = 'Choose an empty rank-3 or rank-4 square for the Knight.';
  else if (step.kind === 'rank4') {
    count = step.count;
    instructions = `Choose ${step.count} rank-4 squares to add to your deployment zone.`;
  } else if (step.kind === 'piece') instructions = `Choose a ${PIECE_NAME[step.pieceType]}.`;
  else if (step.kind === 'line') instructions = 'Lay the rail along a rank (1–6) or a file.';
  else if (step.kind === 'castledSide') instructions = 'Castle kingside or queenside?';

  const highlight = step.kind === 'piece' ? pieces.filter((r) => r.sq !== null).map((r) => r.sq as Sq) : legal.filter((s) => !picked.includes(s));
  const board = formationBoard(run, highlight, picked);

  const onSquare = (sq: Sq) => {
    if (step.kind === 'piece') {
      const piece = pieces.find((r) => r.sq === sq);
      if (piece) dispatch({ type: 'pickPiece', rosterId: piece.id });
      return;
    }
    if (!legal.includes(sq)) return;
    const next = picked.includes(sq) ? picked.filter((s) => s !== sq) : [...picked, sq];
    if (next.length === count) {
      if (dispatch({ type: 'placeSquares', squares: next })) setPicked([]);
    } else setPicked(next);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-4 lg:flex-row lg:items-start">
      <div className="w-full max-w-[560px]">
        <Board pieces={board.pieces} squares={board.squares} onSquareClick={onSquare} />
      </div>
      <div className="panel w-full max-w-sm p-4">
        <div className="font-display text-xl text-gold-300">{def.name}</div>
        <p className="mt-1 text-sm text-ink-200">{def.describe(stacksOf(run, def.id))}</p>
        <p className="mt-3 text-sm text-arcane-300">{instructions}</p>
        {picked.length ? <p className="mt-1 text-xs text-ink-300">Selected: {picked.map(sqName).join(', ')}</p> : null}
        {step.kind === 'line' ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-1">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <button key={i} type="button" className="btn px-2 py-1 text-xs" onClick={() => dispatch({ type: 'placeLine', axis: 'rank', index: i })}>
                  Rank {i + 1}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {'abcdefgh'.split('').map((f, i) => (
                <button key={f} type="button" className="btn px-2 py-1 text-xs" onClick={() => dispatch({ type: 'placeLine', axis: 'file', index: i })}>
                  {f}-file
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {step.kind === 'castledSide' ? (
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn flex-1" onClick={() => dispatch({ type: 'pickSide', side: 'king' })}>
              Kingside (K g1, R f1)
            </button>
            <button type="button" className="btn flex-1" onClick={() => dispatch({ type: 'pickSide', side: 'queen' })}>
              Queenside (K c1, R d1)
            </button>
          </div>
        ) : null}
        <p className="mt-4 text-xs text-ink-400">The highlighted zone is your deployment area. Locked pieces (🔒) keep their starting squares.</p>
      </div>
    </div>
  );
}

export function ShopView({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  const p = run.pending!;
  if (p.kind !== 'shop') return null;
  const rerollPrice = p.rerolls === 0 ? 0 : 15;
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Title sub={`You have ${run.gold} gold.`}>Shop</Title>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {p.items.map((it, i) => {
          const affordable = run.gold >= it.price && !it.sold;
          const footer = (
            <div className={`mt-2 flex items-center justify-between rounded-md px-2 py-1 text-sm ${it.sold ? 'bg-ink-800 text-ink-400' : 'bg-gold-500/15 text-gold-300'}`}>
              <span>{it.sold ? 'Sold' : `${it.price} gold`}</span>
              {!it.sold && !affordable ? <span className="text-xs text-blood-300">Not enough gold</span> : null}
            </div>
          );
          if (it.kind === 'upgrade') {
            return <UpgradeCard key={i} id={it.id} owned={stacksOf(run, it.id)} onPick={affordable ? () => dispatch({ type: 'buy', index: i }) : undefined} footer={footer} />;
          }
          return (
            <button
              key={i}
              type="button"
              disabled={!affordable}
              className="panel flex flex-col items-center gap-3 p-5 hover:brightness-110 disabled:opacity-70"
              onClick={() => dispatch({ type: 'buy', index: i })}
            >
              {it.pieces ? (
                <div className="flex">
                  {it.pieces.map((t, j) => (
                    <PieceSvg key={j} type={t} side="player" className="h-14 w-14" />
                  ))}
                </div>
              ) : (
                <div className="font-display text-3xl text-gold-300">{it.kind === 'crown' ? '♛' : '✶'}</div>
              )}
              <div className="font-display text-lg text-ink-100">{it.label}</div>
              {footer}
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" className="btn" disabled={run.gold < rerollPrice} onClick={() => dispatch({ type: 'reroll' })}>
          Reroll upgrades {rerollPrice ? `(${rerollPrice} gold)` : '(free)'}
        </button>
        <button type="button" className="btn btn-gold" onClick={() => dispatch({ type: 'leave' })}>
          Leave
        </button>
      </div>
    </div>
  );
}

export function EventView({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  const p = run.pending!;
  if (p.kind !== 'event') return null;
  const ev = EVENTS.find((e) => e.id === p.eventId)!;
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Title>{ev.title}</Title>
      <div className="panel p-6">
        <p className="text-base leading-relaxed text-ink-100">{ev.text}</p>
        <div className="mt-5 flex flex-col gap-2">
          {ev.choices.map((c, i) => {
            const goldOk = !c.requires?.gold || run.gold >= c.requires.gold;
            const crownOk = !c.requires?.crownsBelowMax || run.crowns < 3;
            return (
              <button
                key={i}
                type="button"
                disabled={!goldOk || !crownOk}
                className="btn w-full flex-col items-start text-left"
                onClick={() => dispatch(c.outcomes.length === 0 ? { type: 'leave' } : { type: 'eventChoice', index: i })}
              >
                <span>{c.label}</span>
                <span className="text-xs font-normal text-ink-300">{c.detail}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SacrificeView({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  const p = run.pending!;
  const [selected, setSelected] = useState<string | null>(null);
  if (p.kind !== 'sacrifice') return null;
  if (p.stage === 'reward') return <RewardView run={run} dispatch={dispatch} />;
  const candidates = run.roster.filter((r) => r.type !== 'king');
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Title sub="Give up a piece forever — or let the enemy grow stronger — for a choice of Rare upgrades.">Sacrifice</Title>
      <div className="panel p-5">
        <div className="text-sm text-ink-200">Choose a piece to sacrifice:</div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {candidates.map((r) => (
            <button
              key={r.id}
              type="button"
              title={`${PIECE_NAME[r.type]}${r.sq !== null ? ` (${sqName(r.sq)})` : ' (Reserve)'}`}
              className={`relative h-12 w-12 rounded-lg border ${selected === r.id ? 'border-blood-400 bg-blood-600/30' : 'border-ink-600 bg-ink-800'}`}
              onClick={() => setSelected(r.id)}
            >
              <PieceSvg type={r.type} side="player" className="absolute inset-1" />
            </button>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="btn btn-danger" disabled={!selected} onClick={() => selected && dispatch({ type: 'sacrificePiece', rosterId: selected })}>
            Sacrifice it
          </button>
          <button type="button" className="btn" onClick={() => dispatch({ type: 'acceptCurse' })}>
            Accept a curse instead
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => dispatch({ type: 'leave' })}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

export function DefeatView({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  const p = run.pending!;
  if (p.kind !== 'defeat') return null;
  return (
    <div className="mx-auto w-full max-w-lg text-center">
      <Title sub={`${p.reason.charAt(0).toUpperCase()}${p.reason.slice(1)}. You lose a Crown (${run.crowns} left).`}>Defeat</Title>
      {p.boss ? (
        <button type="button" className="btn btn-gold" onClick={() => dispatch({ type: 'retryBoss' })}>
          Face the boss again
        </button>
      ) : (
        <button type="button" className="btn btn-gold" onClick={() => dispatch({ type: 'continueAfterDefeat' })}>
          Continue
        </button>
      )}
    </div>
  );
}

