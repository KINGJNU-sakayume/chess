import { useState } from 'react';
import { TEMPLATES } from '../data/encounters';
import { generateEncounter } from '../engine/encounters/generator';
import { createEncounter } from '../engine/encounters/setup';
import { standardRoster } from '../engine/run/roster';
import type { OwnedUpgrade } from '../engine/core/state';
import { useAppStore } from '../state/appStore';
import { useSession } from '../state/sessionStore';
import { EncounterScreen } from './EncounterScreen';
import { DebugPanel } from '../components/DebugPanel';

/**
 * Sandbox: play any seeded encounter template with any build. Doubles as the
 * M2/M3 test harness and hosts the debug panel (grant any upgrade).
 */
export function SandboxScreen() {
  const go = useAppStore((s) => s.go);
  const session = useSession();
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [act, setAct] = useState(1);
  const [kind, setKind] = useState<'combat' | 'elite'>('combat');
  const [seed, setSeed] = useState(() => `sandbox-${Date.now() % 100000}`);
  const [upgrades, setUpgrades] = useState<OwnedUpgrade[]>([]);
  const [status, setStatus] = useState<string>('');

  const start = (ups = upgrades) => {
    const roster = standardRoster().map((r) => ({ rosterId: r.id, type: r.type, sq: r.sq }));
    const t0 = performance.now();
    const gen = generateEncounter({
      seed,
      act,
      kind,
      templateId,
      difficulty: 0.5,
      rules: { upgrades: ups, affixes: [] },
      roster,
      mutations: [],
      deploymentTop: 1,
    });
    const state = createEncounter(gen.setup);
    session.start(state);
    setStatus(
      `Generated in ${(performance.now() - t0).toFixed(0)} ms · attempts ${gen.attempts}${gen.fallback ? ' (safe variant)' : ''} · playout wins ${gen.report?.successes ?? '-'} / ${gen.report?.playouts ?? '-'}`,
    );
  };

  if (session.state) {
    return (
      <EncounterScreen
        header={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-display text-sm text-ink-300">
              Sandbox · seed <span className="text-ink-100">{seed}</span> · <span className="text-ink-400">{status}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn text-xs" onClick={() => start()}>
                Restart
              </button>
              <button type="button" className="btn text-xs" onClick={() => session.clear()}>
                New setup
              </button>
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => {
                  session.clear();
                  go('title');
                }}
              >
                Title
              </button>
            </div>
          </div>
        }
        sidebarExtra={
          <DebugPanel
            upgrades={upgrades}
            onChange={(next) => {
              setUpgrades(next);
              start(next);
            }}
          />
        }
        onContinue={() => session.clear()}
        continueLabel="Back to setup"
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-4 p-6">
      <h2 className="font-display text-2xl text-gold-300">Encounter Sandbox</h2>
      <div className="panel flex flex-col gap-3 p-4 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-ink-300">Template</span>
          <select className="rounded-md bg-ink-800 p-2" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.objective.toLowerCase().replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-ink-300">Act</span>
            <select className="rounded-md bg-ink-800 p-2" value={act} onChange={(e) => setAct(Number(e.target.value))}>
              {[1, 2, 3].map((a) => (
                <option key={a} value={a}>
                  Act {a}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-ink-300">Kind</span>
            <select className="rounded-md bg-ink-800 p-2" value={kind} onChange={(e) => setKind(e.target.value as 'combat' | 'elite')}>
              <option value="combat">Combat</option>
              <option value="elite">Elite</option>
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-ink-300">Seed</span>
          <input className="rounded-md bg-ink-800 p-2" value={seed} onChange={(e) => setSeed(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <button type="button" className="btn btn-gold flex-1" onClick={() => start()}>
            Start encounter
          </button>
          <button type="button" className="btn" onClick={() => go('title')}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
