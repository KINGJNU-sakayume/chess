import type { EncounterState } from '../core/state';
import { upgradeDef } from '../rules/registry';
import { POLICIES, simulateRun } from './sim';
import type { RunState } from './types';

/**
 * Headless balance simulation (M6): play many seeded runs per bot policy and
 * aggregate where runs end, which encounters kill them, how bosses fare and
 * what builds take. Every simulated run goes through the real reducer, so any
 * row of the report can be replayed from its seed.
 */
export interface BalanceOptions {
  seeds: number;
  /** Seed prefix; seed i is `${prefix}${i}`. */
  prefix?: string;
  policies?: string[];
  maxActs?: number;
  onRun?: (policy: string, seed: string, done: number, total: number) => void;
}

export interface EncounterRow {
  /** `${templateId}@${act}`; elites are starred (`hunt*@1`). */
  key: string;
  kind: EncounterState['config']['kind'];
  played: number;
  lost: number;
  /** Mean turn on which won encounters ended. */
  winTurn: number;
  /** Why the lost ones were lost (normalized outcome reasons). */
  reasons: Record<string, number>;
}

export interface PolicyReport {
  policy: string;
  runs: number;
  /** Runs that cleared every simulated act (the final boss when simulating all three). */
  wins: number;
  /** Runs whose furthest act was 1, 2 or 3 (index = act). */
  reached: [number, number, number, number];
  encounters: EncounterRow[];
  avgUpgrades: number;
  avgRoster: number;
  /** Most taken upgrades: [id, runs that took it]. */
  topUpgrades: [string, number][];
  perEncounter: { promotions: number; captures: number; extraActions: number; wardsBlocked: number; fizzles: number; immobilizations: number };
  crownsLost: number;
}

export interface BalanceReport {
  seeds: number;
  prefix: string;
  maxActs: number;
  policies: PolicyReport[];
}

export function runBalance(opts: BalanceOptions): BalanceReport {
  const prefix = opts.prefix ?? 'balance-';
  const maxActs = opts.maxActs ?? 3;
  const names = opts.policies ?? Object.keys(POLICIES);
  const total = names.length * opts.seeds;
  let done = 0;
  const policies = names.map((name) => {
    const policy = POLICIES[name];
    if (!policy) throw new Error(`Unknown policy "${name}" (have: ${Object.keys(POLICIES).join(', ')})`);
    const rows = new Map<string, EncounterRow & { winTurns: number }>();
    const runs: RunState[] = [];
    let wins = 0;
    for (let i = 0; i < opts.seeds; i++) {
      const seed = `${prefix}${i}`;
      const res = simulateRun(seed, policy, {
        maxActs,
        onEncounter: (enc) => {
          const key = `${enc.config.templateId}${enc.config.kind === 'elite' ? '*' : ''}@${enc.config.act}`;
          const row = rows.get(key) ?? { key, kind: enc.config.kind, played: 0, lost: 0, winTurn: 0, winTurns: 0, reasons: {} };
          row.played += 1;
          if (enc.outcome?.result === 'won') row.winTurns += enc.outcome.turn;
          else {
            row.lost += 1;
            const reason = (enc.outcome?.reason ?? 'unfinished').replace(/\s*\(.*\)\s*$/, '');
            row.reasons[reason] = (row.reasons[reason] ?? 0) + 1;
          }
          rows.set(key, row);
        },
      });
      runs.push(res.run);
      if (res.won) wins += 1;
      done += 1;
      opts.onRun?.(name, seed, done, total);
    }
    return summarize(name, runs, wins, [...rows.values()]);
  });
  return { seeds: opts.seeds, prefix, maxActs, policies };
}

function summarize(policy: string, runs: RunState[], wins: number, rows: (EncounterRow & { winTurns: number })[]): PolicyReport {
  const reached: PolicyReport['reached'] = [0, 0, 0, 0];
  const taken = new Map<string, number>();
  let encounters = 0;
  const sums = { promotions: 0, captures: 0, extraActions: 0, wardsBlocked: 0, fizzles: 0, immobilizations: 0 };
  let crownsLost = 0;
  for (const r of runs) {
    reached[Math.min(3, Math.max(1, r.act))] += 1;
    for (const u of r.upgrades) taken.set(u.id, (taken.get(u.id) ?? 0) + 1);
    const st = r.stats;
    encounters += st.encountersWon + st.encountersLost;
    sums.promotions += st.promotions;
    sums.captures += st.captures;
    sums.extraActions += st.extraActions;
    sums.wardsBlocked += st.wardsBlocked ?? 0;
    sums.fizzles += st.fizzles ?? 0;
    sums.immobilizations += st.immobilizations ?? 0;
    crownsLost += st.encountersLost;
  }
  const per = (n: number) => (encounters ? n / encounters : 0);
  const KIND_ORDER = { combat: 0, elite: 1, boss: 2 } as const;
  const actOf = (key: string) => Number(key.split('@')[1]);
  return {
    policy,
    runs: runs.length,
    wins,
    reached,
    encounters: rows
      .map(({ winTurns, ...row }) => ({ ...row, winTurn: row.played > row.lost ? winTurns / (row.played - row.lost) : 0 }))
      .sort((a, b) => actOf(a.key) - actOf(b.key) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.key.localeCompare(b.key)),
    avgUpgrades: runs.reduce((n, r) => n + r.upgrades.reduce((m, u) => m + u.stacks, 0), 0) / Math.max(1, runs.length),
    avgRoster: runs.reduce((n, r) => n + r.roster.length, 0) / Math.max(1, runs.length),
    topUpgrades: [...taken.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8),
    perEncounter: {
      promotions: per(sums.promotions),
      captures: per(sums.captures),
      extraActions: per(sums.extraActions),
      wardsBlocked: per(sums.wardsBlocked),
      fizzles: per(sums.fizzles),
      immobilizations: per(sums.immobilizations),
    },
    crownsLost,
  };
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '—');
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

/** Encounter rows worth a designer's attention: lost at least `rate` of the time over `min` plays. */
export function hotspots(p: PolicyReport, rate = 0.4, min = 4): EncounterRow[] {
  return p.encounters.filter((e) => e.played >= min && e.lost / e.played >= rate);
}

export function formatBalanceReport(report: BalanceReport): string {
  const lines: string[] = [];
  lines.push(`# Balance report`, '');
  lines.push(`${report.seeds} seeds per policy (\`${report.prefix}0\`…), up to Act ${report.maxActs}. Seeds replay exactly.`, '');
  lines.push('| Policy | Run wins | Ended in Act I / II / III | Upgrades (stacks) | Roster | Lost encounters |');
  lines.push('|---|---|---|---|---|---|');
  for (const p of report.policies) {
    lines.push(
      `| ${p.policy} | ${p.wins}/${p.runs} (${pct(p.wins, p.runs)}) | ${p.reached[1]} / ${p.reached[2]} / ${p.reached[3]} | ${f1(p.avgUpgrades)} | ${f1(p.avgRoster)} | ${p.crownsLost} |`,
    );
  }
  for (const p of report.policies) {
    lines.push('', `## ${p.policy}`, '');
    const pe = p.perEncounter;
    lines.push(
      `Per encounter: ${f2(pe.promotions)} promotions · ${f2(pe.captures)} captures · ${f2(pe.extraActions)} extra actions · ${f2(pe.wardsBlocked)} Ward blocks · ${f2(pe.fizzles)} enemy fizzles · ${f2(pe.immobilizations)} immobilizations`,
      '',
    );
    lines.push(`Most taken: ${p.topUpgrades.map(([id, n]) => `${upgradeDef(id).name} (${n})`).join(', ') || '—'}`, '');
    lines.push('| Encounter | Kind | Played | Lost | Loss rate | Mean winning turn | Losses by reason |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const e of p.encounters) {
      const flag = e.played >= 4 && e.lost / e.played >= 0.4 ? ' ⚠' : '';
      const reasons = Object.entries(e.reasons)
        .sort((a, b) => b[1] - a[1])
        .map(([r, n]) => `${r} ×${n}`)
        .join('; ');
      lines.push(`| ${e.key} | ${e.kind} | ${e.played} | ${e.lost} | ${pct(e.lost, e.played)}${flag} | ${e.winTurn ? f1(e.winTurn) : '—'} | ${reasons || '—'} |`);
    }
  }
  return lines.join('\n');
}
