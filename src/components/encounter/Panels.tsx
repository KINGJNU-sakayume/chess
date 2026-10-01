import { useEffect, useRef, useState } from 'react';
import { sqName } from '../../engine/core/coords';
import { PIECE_NAME, type PieceType } from '../../engine/core/pieces';
import type { ActionToken, EncounterState, LogEntry, ReserveEntry } from '../../engine/core/state';
import { intentText, type IntentPreview } from '../../engine/enemy/preview';
import type { PieceInspection } from '../../engine/inspect';
import { objectiveSummary, targetsRemaining } from '../../engine/encounters/objectives';
import { PieceSvg } from '../board/PieceSvg';

export function PanelTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-gold-300/90">{children}</h3>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ObjectiveCard({ state }: { state: EncounterState }) {
  const T = state.config.turnLimit;
  const obj = state.config.objective;
  const kindLabel = state.config.kind === 'boss' ? 'Boss' : state.config.kind === 'elite' ? 'Elite' : 'Combat';
  return (
    <div className="panel p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-300">
            Act {state.config.act} · {kindLabel}
          </div>
          <div className="font-display text-lg text-ink-100">{state.config.name}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-300">{obj.type === 'SURVIVAL' || obj.type === 'DEFENSE' ? 'Phase' : 'Turn'}</div>
          <div className="font-display text-xl text-gold-300">
            {state.turn}
            {T ? <span className="text-ink-400"> / {T}</span> : null}
          </div>
        </div>
      </div>
      <p className="mt-2 text-sm leading-snug text-ink-200">{objectiveSummary(state)}</p>
      {obj.type === 'ELIMINATION' ? <p className="mt-1 text-xs text-blood-300">{targetsRemaining(state).length} target(s) remaining</p> : null}
      {obj.type === 'PROMOTION_RACE' ? (
        <p className="mt-1 text-xs text-ink-300">
          Promoted {state.objective.promotions}/{obj.required ?? 1} · Enemy countdown{' '}
          <span className="font-bold text-blood-300">{state.objective.countdown}</span>
        </p>
      ) : null}
      {state.config.affixes.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {state.config.affixes.map((a) => (
            <span key={a} className="rounded bg-blood-600/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-blood-300">
              {a.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ActionTokens({ tokens, free }: { tokens: ActionToken[]; free: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tokens.length === 0 ? <span className="text-xs text-ink-400">No actions left</span> : null}
      {tokens.map((t) => (
        <span
          key={t.id}
          title={t.label}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            t.source === 'base' ? 'bg-gold-400 text-ink-950' : 'bg-arcane-500/80 text-white shadow-[0_0_8px_rgba(94,200,214,0.6)]'
          }`}
        >
          {t.source === 'base' ? 'Action' : t.label.replace(/^.*?: /, '')}
        </span>
      ))}
      {free > 0 ? <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[11px] text-arcane-300">Free deploy ×{free}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ReserveTray({
  reserve,
  selectedId,
  canDeploy,
  onSelect,
}: {
  reserve: ReserveEntry[];
  selectedId: string | null;
  canDeploy: boolean;
  onSelect: (id: string | null) => void;
}) {
  if (!reserve.length) return null;
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-[0.16em] text-ink-300">Reserve ({reserve.length})</div>
      <div className="flex flex-wrap gap-1">
        {reserve.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={!canDeploy}
            title={canDeploy ? `Deploy ${PIECE_NAME[r.type]} to rank 1 (free)` : 'No free deployment left this turn'}
            onClick={() => onSelect(selectedId === r.id ? null : r.id)}
            className={`relative h-11 w-11 rounded-lg border transition ${
              selectedId === r.id ? 'border-arcane-300 bg-arcane-500/30' : 'border-ink-600 bg-ink-800 hover:border-ink-400'
            } disabled:opacity-40`}
          >
            <PieceSvg type={r.type} side="player" className="absolute inset-1" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function IntentList({ previews, telegraphs, onHover }: { previews: IntentPreview[]; telegraphs: EncounterState['telegraphs']; onHover: (sqs: number[]) => void }) {
  return (
    <div className="panel p-3">
      <PanelTitle>Enemy intents</PanelTitle>
      {previews.length === 0 && telegraphs.length === 0 ? <p className="text-xs text-ink-400">The enemy holds position.</p> : null}
      <ol className="space-y-1">
        {previews.map((p) => (
          <li
            key={p.intent.id}
            onMouseEnter={() => onHover([p.intent.from, p.intent.to])}
            onMouseLeave={() => onHover([])}
            className={`flex items-start gap-2 rounded-md px-2 py-1 text-[13px] ${
              p.willLand ? (p.victimType ? 'bg-blood-600/25 text-ink-100' : 'bg-ink-800 text-ink-200') : 'bg-ink-850 text-ink-400 line-through decoration-ink-500'
            }`}
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blood-500 text-[11px] font-bold text-white">{p.index + 1}</span>
            <span>{intentText(p)}</span>
          </li>
        ))}
        {telegraphs.map((t) => (
          <li key={t.id} className="flex items-start gap-2 rounded-md bg-ink-800 px-2 py-1 text-[13px] text-blood-300">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-blood-400 text-[10px] font-bold">!</span>
            <span>
              {t.label}
              {t.squares.length ? <span className="text-ink-400"> · {t.squares.map(sqName).join(', ')}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------

const LOG_COLORS: Record<LogEntry['kind'], string> = {
  turn: 'text-gold-300 font-semibold mt-1',
  move: 'text-ink-100',
  trigger: 'text-arcane-300',
  capture: 'text-blood-300',
  blocked: 'text-sky-300',
  intent: 'text-ink-200',
  fizzle: 'text-ink-400 italic',
  enemy: 'text-blood-300',
  system: 'text-ink-300',
  objective: 'text-gold-300 font-bold',
  warning: 'text-amber-400 font-bold',
};

export function CombatLog({ log, onHover }: { log: LogEntry[]; onHover: (sqs: number[]) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  useEffect(() => {
    if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log.length, follow]);
  const shown = log.slice(-400);
  return (
    <div className="panel flex min-h-0 flex-1 flex-col p-3">
      <PanelTitle>Combat log</PanelTitle>
      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget;
          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
        }}
        className="min-h-[160px] flex-1 overflow-y-auto rounded-lg bg-ink-950/60 p-2 font-mono text-[11.5px] leading-[1.45]"
      >
        {shown.map((l) => (
          <div
            key={l.id}
            className={`${LOG_COLORS[l.kind]} cursor-default`}
            style={{ paddingLeft: l.depth * 14 }}
            onMouseEnter={() => onHover(l.sqs ?? [])}
            onMouseLeave={() => onHover([])}
          >
            {l.depth > 0 ? '→ ' : ''}
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function Inspector({ info, expanded, onToggle }: { info: PieceInspection | null; expanded: boolean; onToggle: () => void }) {
  if (!info) {
    return (
      <div className="panel p-3 text-xs text-ink-400">
        <PanelTitle>Inspect</PanelTitle>
        Hover or select a piece to see its accumulated rules.
      </div>
    );
  }
  const shown = expanded ? info.modifiers : info.modifiers.slice(0, 4);
  return (
    <div className="panel p-3">
      <PanelTitle
        right={
          info.modifiers.length > 4 ? (
            <button type="button" className="text-[11px] text-arcane-300 hover:underline" onClick={onToggle}>
              {expanded ? 'Collapse' : `Expand (${info.modifiers.length})`}
            </button>
          ) : null
        }
      >
        {info.title}
      </PanelTitle>
      <div className={`text-[11px] uppercase tracking-wider ${info.side === 'player' ? 'text-arcane-300' : 'text-blood-300'}`}>
        {info.side === 'player' ? 'Your piece' : 'Enemy piece'}
        {info.tags.length ? ` · ${info.tags.join(' · ')}` : ''}
      </div>
      <div className="mt-1.5 text-xs text-ink-200">
        <span className="text-ink-400">Base: </span>
        {info.base}
      </div>
      {info.modifiers.length ? (
        <div className="mt-2">
          <div className="text-[11px] text-ink-400">{info.side === 'player' ? 'Run modifiers' : 'Modifiers'}</div>
          <ul className="mt-1 space-y-1">
            {shown.map((m) => (
              <li key={m.id} className={`text-xs ${m.active ? 'text-ink-100' : 'text-ink-400'}`} title={m.detail}>
                <span className={m.active ? 'text-emerald-300' : 'text-ink-500'}>{m.active ? '✓' : '○'}</span> {m.name}
                {m.note ? <span className="text-gold-300"> ({m.note})</span> : null}
                {expanded ? <div className="pl-4 text-[11px] text-ink-300">{m.detail}</div> : null}
              </li>
            ))}
          </ul>
          {!expanded && info.modifiers.length > 4 ? <div className="mt-1 text-[11px] text-ink-400">+{info.modifiers.length - 4} more…</div> : null}
        </div>
      ) : null}
      <div className="mt-2 text-xs text-ink-300">
        <span className="text-ink-400">Status: </span>
        {info.statuses.join(', ')}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export interface VariantChoice {
  title: string;
  options: { key: string; label: string; detail?: string; piece?: PieceType }[];
}

export function ChoiceDialog({ choice, onPick, onCancel }: { choice: VariantChoice; onPick: (key: string) => void; onCancel: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-[2px]" onClick={onCancel}>
      <div className="panel flex max-w-sm flex-col gap-3 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-sm text-gold-300">{choice.title}</div>
        <div className="flex flex-wrap justify-center gap-2">
          {choice.options.map((o) => (
            <button key={o.key} type="button" className="btn min-w-20 flex-col px-3 py-2" onClick={() => onPick(o.key)}>
              {o.piece ? <PieceSvg type={o.piece} side="player" className="h-11 w-11" /> : null}
              <span className="text-xs">{o.label}</span>
              {o.detail ? <span className="text-[10px] font-normal text-ink-300">{o.detail}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
