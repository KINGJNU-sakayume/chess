import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Sq } from '../engine/core/coords';
import { PIECE_NAME, PROMOTION_TYPES } from '../engine/core/pieces';
import type { EncounterState } from '../engine/core/state';
import { controlledSquares } from '../engine/encounters/objectives';
import { deploySquares, noActionsLeft } from '../engine/encounters/flow';
import { previewIntents } from '../engine/enemy/preview';
import { inspectPiece } from '../engine/inspect';
import { affordableMoves, attackCounts, createGenContext, type Move } from '../engine/moves/generate';
import { BoardView } from '../components/encounter/BoardView';
import { ActionTokens, ChoiceDialog, CombatLog, Inspector, IntentList, ObjectiveCard, ReserveTray, type VariantChoice } from '../components/encounter/Panels';
import { frameMs, moveMs, useSettings } from '../state/settingsStore';
import { useSession } from '../state/sessionStore';

interface Props {
  /** Rendered above the board (run header: crowns, gold…). */
  header?: ReactNode;
  /** Extra panel content (debug tools). */
  sidebarExtra?: ReactNode;
  /** Called when the player acknowledges the encounter outcome. */
  onContinue?: (final: EncounterState) => void;
  continueLabel?: string;
  onExit?: () => void;
}

export function EncounterScreen({ header, sidebarExtra, onContinue, continueLabel = 'Continue', onExit }: Props) {
  const { state, display, frames, history, act, endTurn, undo, advanceFrame, skipFrames, error } = useSession();
  const settings = useSettings();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reserveId, setReserveId] = useState<string | null>(null);
  const [hoverSq, setHoverSq] = useState<Sq | null>(null);
  const [highlight, setHighlight] = useState<Sq[]>([]);
  const [choice, setChoice] = useState<{ moves: Move[]; dialog: VariantChoice } | null>(null);

  const busy = frames.length > 0;
  const shown = display ?? state;

  // Frame playback (F5): short, skippable, speed-adjustable.
  useEffect(() => {
    if (!frames.length) return;
    const ms = frameMs(settings.animSpeed);
    if (ms === 0) {
      skipFrames();
      return;
    }
    const t = setTimeout(advanceFrame, ms);
    return () => clearTimeout(t);
  }, [frames, settings.animSpeed, advanceFrame, skipFrames]);

  const interactive = !!state && !busy && state.phase === 'player' && !state.outcome;

  const ctx = useMemo(() => (shown ? createGenContext(shown) : null), [shown]);
  const allMoves = useMemo(() => (interactive && state ? affordableMoves(createGenContext(state)) : []), [interactive, state]);
  const moves = useMemo(() => (selectedId ? allMoves.filter((m) => m.pieceId === selectedId) : []), [allMoves, selectedId]);
  const deploy = useMemo(() => (interactive && state && reserveId ? deploySquares(state) : []), [interactive, state, reserveId]);
  const previews = useMemo(() => (shown ? previewIntents(shown) : []), [shown]);
  const overlay = useMemo(() => (settings.attackOverlay && ctx ? attackCounts(ctx, 'enemy') : null), [settings.attackOverlay, ctx]);
  const controlled = useMemo(() => (shown?.config.objective.type === 'CONTROL' ? controlledSquares(shown) : undefined), [shown]);
  const lastMove = useMemo(() => {
    if (!shown) return null;
    for (let i = shown.log.length - 1; i >= 0; i--) {
      const l = shown.log[i];
      if ((l.kind === 'move' || l.kind === 'enemy') && l.depth === 0 && l.sqs && l.sqs.length === 2) return { from: l.sqs[0], to: l.sqs[1] };
    }
    return null;
  }, [shown]);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setReserveId(null);
    setChoice(null);
  }, []);

  const doAct = useCallback(
    (m: Move) => {
      act(
        { type: 'move', pieceId: m.pieceId, to: m.to, promotion: m.promotion, gate: m.gate, recall: m.recall, castleRook: m.castle?.rookFrom },
        settings.autoEndTurn,
      );
      clearSelection();
    },
    [act, settings.autoEndTurn, clearSelection],
  );

  const onSquareClick = (sq: Sq) => {
    if (!state || !interactive) {
      if (busy) skipFrames();
      return;
    }
    if (reserveId && deploy.includes(sq)) {
      act({ type: 'deploy', reserveId, to: sq }, settings.autoEndTurn);
      clearSelection();
      return;
    }
    if (selectedId) {
      const variants = moves.filter((m) => m.to === sq);
      if (variants.length === 1) return doAct(variants[0]);
      if (variants.length > 1) {
        setChoice({ moves: variants, dialog: variantDialog(variants) });
        return;
      }
    }
    const id = state.board[sq];
    if (id && state.pieces[id].side === 'player') {
      setSelectedId(id === selectedId ? null : id);
      setReserveId(null);
    } else {
      clearSelection();
      if (id) setSelectedId(null);
    }
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') clearSelection();
      if ((e.key === 'z' || e.key === 'Backspace') && history.length && !busy) undo();
      if (e.key === 'Enter' && interactive) endTurn();
      if (e.key === ' ' && busy) {
        e.preventDefault();
        skipFrames();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearSelection, history.length, busy, undo, interactive, endTurn, skipFrames]);

  if (!state || !shown) return null;

  const hoverPieceId = hoverSq !== null ? shown.board[hoverSq] : null;
  const inspectId = hoverPieceId ?? selectedId;
  const inspection = inspectId ? inspectPiece(shown, inspectId) : null;
  const outOfActions = interactive && noActionsLeft(state);
  const showOutcome = !!state.outcome && !busy;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col gap-3 p-3 lg:p-4">
      {header}
      <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-[300px_minmax(0,1fr)_330px]">
        {/* Left: objective, actions, reserve, inspector */}
        <div className="order-2 flex flex-col gap-3 lg:order-1">
          <ObjectiveCard state={shown} />
          <div className="panel flex flex-col gap-3 p-3">
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-[0.16em] text-ink-300">Actions this turn</div>
              <ActionTokens tokens={shown.phase === 'player' ? shown.actions : []} free={shown.phase === 'player' ? shown.reserveDeploysLeft : 0} />
            </div>
            <ReserveTray
              reserve={shown.reserve}
              selectedId={reserveId}
              canDeploy={interactive && state.reserveDeploysLeft > 0}
              onSelect={(id) => {
                setReserveId(id);
                setSelectedId(null);
              }}
            />
            <div className="flex gap-2">
              <button type="button" className="btn flex-1" disabled={!history.length || busy || !!state.outcome} onClick={() => undo()} title="Undo (Z)">
                Undo
              </button>
              <button
                type="button"
                className={`btn btn-gold flex-[2] ${outOfActions ? 'pulse-gold' : ''}`}
                disabled={!interactive}
                onClick={() => {
                  clearSelection();
                  endTurn();
                }}
                title="End turn (Enter)"
              >
                End Turn
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-300">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={settings.attackOverlay} onChange={(e) => settings.set({ attackOverlay: e.target.checked })} />
                Enemy attacks
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={settings.autoEndTurn} onChange={(e) => settings.set({ autoEndTurn: e.target.checked })} />
                Auto end turn
              </label>
              <span className="flex items-center gap-1">
                Speed
                {([1, 2, 0] as const).map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    className={`rounded px-1.5 py-0.5 ${settings.animSpeed === sp ? 'bg-gold-400 text-ink-950' : 'bg-ink-700 text-ink-200'}`}
                    onClick={() => settings.set({ animSpeed: sp })}
                  >
                    {sp === 0 ? 'Instant' : `${sp}×`}
                  </button>
                ))}
              </span>
            </div>
            {error ? <div className="text-xs text-blood-300">{error}</div> : null}
          </div>
          <Inspector info={inspection} expanded={settings.inspectorExpanded} onToggle={() => settings.set({ inspectorExpanded: !settings.inspectorExpanded })} />
          {sidebarExtra}
        </div>

        {/* Center: the board */}
        <div className="order-1 flex flex-col items-center lg:order-2">
          <div className="relative w-full max-w-[min(100%,calc(100vh-120px))]">
            <BoardView
              state={shown}
              selectedId={interactive ? selectedId : null}
              moves={interactive ? moves : []}
              deploySquares={deploy}
              previews={shown.phase === 'player' ? previews : []}
              attackOverlay={overlay}
              controlled={controlled}
              lastMove={lastMove}
              highlight={highlight}
              onSquareClick={onSquareClick}
              onSquareHover={setHoverSq}
              moveMs={moveMs(settings.animSpeed)}
            />
            {busy ? (
              <button type="button" className="absolute bottom-2 right-2 z-40 rounded-md bg-black/60 px-2 py-1 text-xs text-ink-200" onClick={skipFrames}>
                Skip ▸▸
              </button>
            ) : null}
            {choice ? (
              <ChoiceDialog
                choice={choice.dialog}
                onCancel={() => setChoice(null)}
                onPick={(key) => {
                  const m = choice.moves.find((mv) => variantKey(mv) === key);
                  if (m) doAct(m);
                }}
              />
            ) : null}
            {showOutcome ? (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
                <div className="panel flex max-w-sm flex-col items-center gap-3 p-6 text-center">
                  <div className={`font-display text-3xl ${state.outcome!.result === 'won' ? 'text-gold-300' : 'text-blood-400'}`}>
                    {state.outcome!.result === 'won' ? 'Victory' : 'Defeat'}
                  </div>
                  <p className="text-sm text-ink-200">{capitalize(state.outcome!.reason)}.</p>
                  {onContinue ? (
                    <button type="button" className="btn btn-gold" onClick={() => onContinue(state)}>
                      {continueLabel}
                    </button>
                  ) : null}
                  {onExit ? (
                    <button type="button" className="btn btn-ghost text-xs" onClick={onExit}>
                      Leave
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          <p className="mt-2 hidden text-center text-[11px] text-ink-400 lg:block">
            Click a piece to see its moves · <span className="text-arcane-300">cyan</span> = upgrade movement ·{' '}
            <span className="text-violet-300">violet</span> = pierce · <span className="text-blood-300">red arrows</span> = committed enemy intents
          </p>
        </div>

        {/* Right: intents and log */}
        <div className="order-3 flex min-h-0 flex-col gap-3 lg:max-h-[calc(100vh-110px)]">
          <IntentList previews={shown.phase === 'player' ? previews : []} telegraphs={shown.telegraphs} onHover={setHighlight} />
          <CombatLog log={shown.log} onHover={setHighlight} />
        </div>
      </div>
    </div>
  );
}

function variantKey(m: Move): string {
  return `${m.promotion ?? ''}|${m.gate ? 'g' : ''}|${m.recall ? 'r' : ''}|${m.castle?.rookFrom ?? ''}`;
}

function variantDialog(variants: Move[]): VariantChoice {
  if (variants.every((v) => v.promotion)) {
    const order = PROMOTION_TYPES;
    const sorted = variants.slice().sort((a, b) => order.indexOf(a.promotion!) - order.indexOf(b.promotion!));
    const extra = (m: Move) => [m.gate ? 'via Gate' : '', m.recall ? 'then Recall' : ''].filter(Boolean).join(', ');
    return {
      title: 'Promote to',
      options: sorted.map((m) => ({ key: variantKey(m), label: PIECE_NAME[m.promotion!], piece: m.promotion!, detail: extra(m) || undefined })),
    };
  }
  return {
    title: variants.some((v) => v.gate) ? 'Knight Gate' : variants.some((v) => v.recall) ? 'Bishop Recall' : 'Choose',
    options: variants.map((m) => ({
      key: variantKey(m),
      label: m.gate ? 'Step through the gate' : m.recall ? 'Capture, then return' : m.promotion ? PIECE_NAME[m.promotion] : 'Normal move',
      piece: m.promotion ?? undefined,
    })),
  };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
