import { useEffect, useState } from 'react';
import { runView } from '../../engine/run/reducer';
import type { RunAction, RunState } from '../../engine/run/types';
import type { SessionAction } from '../../state/sessionStore';
import { useSession } from '../../state/sessionStore';
import { useRun } from '../../state/runStore';
import { useAppStore } from '../../state/appStore';
import { EncounterScreen } from '../EncounterScreen';
import { BuildPanel } from '../../components/run/BuildPanel';
import { MapView } from './MapView';
import { DefeatView, EventView, PlaceView, RecruitView, RewardView, SacrificeView, ShopView } from './PendingViews';
import { FormationEditor } from './FormationEditor';
import { RunOverView } from './RunOverView';

function Crowns({ n }: { n: number }) {
  return (
    <span className="flex items-center gap-0.5" title={`${n} Crown${n === 1 ? '' : 's'} — lose one per lost encounter; 0 ends the run`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} viewBox="0 0 100 100" className="h-5 w-5" fill={i < n ? '#e8c46a' : 'none'} stroke={i < n ? '#a9822f' : '#55486a'} strokeWidth="6">
          <path d="M12 74 L18 28 L36 50 L50 20 L64 50 L82 28 L88 74 Z" />
        </svg>
      ))}
    </span>
  );
}

export function RunHeader({ run, onBuild, onFormation, onQuit }: { run: RunState; onBuild: () => void; onFormation?: () => void; onQuit: () => void }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-700/60 bg-ink-900/70 px-3 py-2">
      <div className="flex items-center gap-4">
        <span className="font-display text-lg text-gold-300">Act {run.act}</span>
        <Crowns n={run.crowns} />
        <span className="text-sm text-gold-300" title="Gold">
          ◈ {run.gold}
        </span>
        <span className="hidden text-sm text-ink-300 sm:inline">
          Army {run.roster.length} · Upgrades {run.upgrades.reduce((n, u) => n + u.stacks, 0)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="btn px-3 py-1.5 text-xs" onClick={onBuild}>
          Your chess
        </button>
        {onFormation ? (
          <button type="button" className="btn px-3 py-1.5 text-xs" onClick={onFormation}>
            Formation
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost px-2 py-1.5 text-xs" onClick={onQuit} title="Your progress is saved">
          Save &amp; quit
        </button>
      </div>
    </header>
  );
}

const toRunAction = (a: SessionAction): RunAction =>
  a.type === 'act' ? { type: 'encounterAct', action: a.action } : a.type === 'endTurn' ? { type: 'endTurn' } : { type: 'undo' };

export function RunScreen() {
  const { run, dispatch, recordEncounter, error, close } = useRun();
  const session = useSession();
  const go = useAppStore((s) => s.go);
  const [showBuild, setShowBuild] = useState(false);
  const [showFormation, setShowFormation] = useState(false);

  // Keep the encounter session in sync with the run's current encounter. The session
  // records its own actions back into the run, so a different object means a new encounter
  // (a new node or a boss retry).
  const encounter = run?.encounter ?? null;
  useEffect(() => {
    const current = useSession.getState().state;
    if (!encounter) {
      if (current) session.clear();
      return;
    }
    if (current !== encounter) {
      session.start(encounter, { onAction: (a, state, history) => recordEncounter(toRunAction(a), state, history) }, useRun.getState().run?.undo ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter]);

  if (!run) return null;
  const quit = () => {
    session.clear();
    close();
    go('title');
  };
  const view = runView(run);
  const header = (
    <RunHeader run={run} onBuild={() => setShowBuild(true)} onFormation={view === 'map' ? () => setShowFormation(true) : undefined} onQuit={quit} />
  );

  let body: React.ReactNode = null;
  if (view === 'encounter') {
    return (
      <>
        <EncounterScreen header={header} onContinue={() => dispatch({ type: 'finishEncounter' })} continueLabel="Continue" />
        {showBuild ? <BuildPanel run={run} onClose={() => setShowBuild(false)} /> : null}
      </>
    );
  }
  if (view === 'map') body = <MapView run={run} onChoose={(id) => dispatch({ type: 'chooseNode', nodeId: id })} />;
  if (view === 'over') body = <RunOverView run={run} onExit={quit} />;
  if (view === 'pending') {
    const p = run.pending!;
    switch (p.kind) {
      case 'reward':
      case 'mutationOffer':
        body = <RewardView run={run} dispatch={dispatch} />;
        break;
      case 'recruit':
        body = <RecruitView run={run} dispatch={dispatch} />;
        break;
      case 'place':
        body = <PlaceView key={`${p.upgradeId}-${p.step.kind}`} run={run} dispatch={dispatch} />;
        break;
      case 'shop':
        body = <ShopView run={run} dispatch={dispatch} />;
        break;
      case 'event':
        body = <EventView run={run} dispatch={dispatch} />;
        break;
      case 'sacrifice':
        body = <SacrificeView run={run} dispatch={dispatch} />;
        break;
      case 'defeat':
        body = <DefeatView run={run} dispatch={dispatch} />;
        break;
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1400px] flex-col gap-4 p-3 lg:p-4">
      {header}
      {error ? <div className="rounded-md bg-blood-600/30 px-3 py-2 text-sm text-blood-300">{error}</div> : null}
      <main className="flex-1 py-2">{body}</main>
      {showBuild ? <BuildPanel run={run} onClose={() => setShowBuild(false)} /> : null}
      {showFormation ? (
        <FormationEditor
          run={run}
          onClose={() => setShowFormation(false)}
          onSave={(roster) => {
            if (dispatch({ type: 'formation', roster })) setShowFormation(false);
          }}
        />
      ) : null}
    </div>
  );
}
