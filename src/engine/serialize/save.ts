import { RUN_SCHEMA_VERSION, type RunState } from '../run/types';

/**
 * Save files (G1): versioned JSON with a migration chain. Storage itself lives
 * in `src/state` — the engine only (de)serializes.
 */
export interface SaveFile {
  schema: number;
  savedAt: string;
  run: RunState;
}

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] upgrades a save from schema n to n + 1. */
export const MIGRATIONS: Record<number, Migration> = {
  // Schema 0 was the pre-release format without curses/rank4; kept as the migration template.
  0: (data) => {
    const run = (data.run ?? {}) as Record<string, unknown>;
    return { ...data, schema: 1, run: { ...run, curses: run.curses ?? [], rank4: run.rank4 ?? [], schema: 1 } };
  },
  // Schema 2 (M5) tracks fizzles, immobilizations and Ward blocks per run and per encounter.
  1: (data) => {
    const run = (data.run ?? {}) as Record<string, unknown>;
    const stats = (run.stats ?? {}) as Record<string, unknown>;
    const encounter = run.encounter as Record<string, unknown> | null | undefined;
    const encStats = (encounter?.stats ?? {}) as Record<string, unknown>;
    return {
      ...data,
      schema: 2,
      run: {
        ...run,
        schema: 2,
        stats: { ...stats, fizzles: stats.fizzles ?? 0, immobilizations: stats.immobilizations ?? 0, wardsBlocked: stats.wardsBlocked ?? 0 },
        encounter: encounter ? { ...encounter, stats: { ...encStats, immobilizations: encStats.immobilizations ?? 0 } } : (encounter ?? null),
      },
    };
  },
};

export function serializeRun(run: RunState, now = new Date()): string {
  const file: SaveFile = { schema: RUN_SCHEMA_VERSION, savedAt: now.toISOString(), run: { ...run, undo: [] } };
  return JSON.stringify(file);
}

export function migrate(raw: Record<string, unknown>): SaveFile {
  let data = raw;
  let schema = typeof data.schema === 'number' ? data.schema : 0;
  if (schema > RUN_SCHEMA_VERSION) throw new Error(`Save file is from a newer version (schema ${schema})`);
  while (schema < RUN_SCHEMA_VERSION) {
    const step = MIGRATIONS[schema];
    if (!step) throw new Error(`No migration from schema ${schema}`);
    data = step(data);
    schema += 1;
  }
  return data as unknown as SaveFile;
}

export function deserializeRun(json: string): RunState {
  const file = migrate(JSON.parse(json) as Record<string, unknown>);
  return { ...file.run, undo: [] };
}

/** Deterministic JSON (sorted keys) for hashing. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v === undefined ? null : v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** cyrb53 hash of the stable serialization. */
export function stateHash(value: unknown): string {
  const str = stableStringify(value);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Rebuild a run from its seed and recorded actions (replay, D6). */
export function replayRun(seed: string, actions: RunState['actions'], reducer: (r: RunState, a: RunState['actions'][number]) => RunState, init: (seed: string) => RunState): RunState {
  let run = init(seed);
  for (const a of actions) run = reducer(run, a);
  return run;
}
