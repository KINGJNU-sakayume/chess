import type { Rng } from '../rng/rng';
import { TEMPLATES } from '../../data/encounters';
import { actTuning } from '../../data/acts';
import type { ActMap, MapNode, NodeType } from './types';

/**
 * Act map generation (B8). A layered DAG of `rows` rows plus a boss row. The
 * whole map is visible from the start of the act. Every path from the first
 * row to the boss satisfies the composition rules (5–6 combats, 1–2 elites,
 * 2–3 non-combat nodes for 9 rows).
 */

type Category = 'C' | 'E' | 'N';

export interface PathRules {
  combat: [number, number];
  elite: [number, number];
  nonCombat: [number, number];
}

export const DEFAULT_PATH_RULES: PathRules = { combat: [5, 6], elite: [1, 2], nonCombat: [2, 3] };

/** Non-combat node weights (data-tunable). */
export const NON_COMBAT_WEIGHTS: Record<Exclude<NodeType, 'combat' | 'elite' | 'boss'>, number> = {
  upgrade: 24,
  shop: 20,
  mutation: 18,
  recruit: 16,
  event: 16,
  sacrifice: 6,
};

function allPaths(nodes: MapNode[], rows: number): MapNode[][] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: MapNode[][] = [];
  const walk = (n: MapNode, path: MapNode[]) => {
    const next = [...path, n];
    if (n.row === rows - 1) {
      out.push(next);
      return;
    }
    for (const id of n.next) {
      const child = byId.get(id)!;
      if (child.row < rows) walk(child, next);
    }
  };
  for (const n of nodes.filter((x) => x.row === 0)) walk(n, []);
  return out;
}

const category = (t: NodeType): Category => (t === 'combat' ? 'C' : t === 'elite' ? 'E' : 'N');

function pathOk(path: MapNode[], cats: Map<string, Category>, rules: PathRules): boolean {
  let c = 0;
  let e = 0;
  let n = 0;
  for (const node of path) {
    const k = cats.get(node.id)!;
    if (k === 'C') c++;
    else if (k === 'E') e++;
    else n++;
  }
  return c >= rules.combat[0] && c <= rules.combat[1] && e >= rules.elite[0] && e <= rules.elite[1] && n >= rules.nonCombat[0] && n <= rules.nonCombat[1];
}

export function validatePaths(map: ActMap, rules: PathRules = DEFAULT_PATH_RULES): boolean {
  const cats = new Map(map.nodes.map((n) => [n.id, category(n.type)]));
  return allPaths(map.nodes, map.rows).every((p) => pathOk(p, cats, rules));
}

/** Row categories satisfying the rules: rows 0–1 are combats, the rest shuffled. */
function basePattern(rng: Rng, rows: number, rules: PathRules): Category[] {
  const options: { c: number; e: number; n: number }[] = [];
  for (let c = rules.combat[0]; c <= rules.combat[1]; c++)
    for (let e = rules.elite[0]; e <= rules.elite[1]; e++)
      for (let n = rules.nonCombat[0]; n <= rules.nonCombat[1]; n++) if (c + e + n === rows) options.push({ c, e, n });
  const pick = options.length ? rng.pick(options) : { c: rows - 3, e: 1, n: 2 };
  const rest: Category[] = [
    ...Array<Category>(Math.max(0, pick.c - 2)).fill('C'),
    ...Array<Category>(pick.e).fill('E'),
    ...Array<Category>(pick.n).fill('N'),
  ];
  for (let attempt = 0; attempt < 50; attempt++) {
    const shuffled = rng.shuffle(rest);
    // Elites never in the first three rows; avoid three non-combat nodes in a row.
    const pattern: Category[] = ['C', 'C', ...shuffled];
    const eliteTooEarly = pattern.slice(0, 3).includes('E');
    const streak = pattern.some((_, i) => i >= 2 && pattern[i] === 'N' && pattern[i - 1] === 'N' && pattern[i - 2] === 'N');
    if (!eliteTooEarly && !streak) return pattern;
  }
  return ['C', 'C', ...rest];
}

function pickNonCombat(rng: Rng, avoid?: NodeType): NodeType {
  const entries = Object.entries(NON_COMBAT_WEIGHTS).filter(([k]) => k !== avoid);
  const idx = rng.weightedIndex(entries.map(([, w]) => w));
  return entries[idx][0] as NodeType;
}

function pickTemplate(rng: Rng, act: number): string {
  const pool = TEMPLATES.filter((t) => t.acts.includes(act));
  return pool[rng.weightedIndex(pool.map((t) => t.weight))].id;
}

export function generateActMap(act: number, runSeed: string, rng: Rng, rules: PathRules = DEFAULT_PATH_RULES): ActMap {
  const rows = actTuning(act).rows;
  // 1. Layout: row widths change by at most one between rows.
  const widths: number[] = [3];
  for (let r = 1; r < rows; r++) {
    const prev = widths[r - 1];
    const options = [prev - 1, prev, prev + 1].filter((w) => w >= 2 && w <= 4);
    widths.push(rng.pick(options));
  }
  const nodes: MapNode[] = [];
  const rowNodes: MapNode[][] = [];
  for (let r = 0; r < rows; r++) {
    const list: MapNode[] = [];
    for (let i = 0; i < widths[r]; i++) {
      const id = `a${act}r${r}n${i}`;
      const jitter = (rng.float() - 0.5) * 0.08;
      list.push({ id, row: r, x: (i + 0.5) / widths[r] + jitter, type: 'combat', next: [], seed: `${runSeed}|${id}` });
    }
    rowNodes.push(list);
    nodes.push(...list);
  }
  const boss: MapNode = { id: `a${act}boss`, row: rows, x: 0.5, type: 'boss', next: [], seed: `${runSeed}|a${act}boss`, templateId: actTuning(act).boss };
  nodes.push(boss);

  // 2. Monotone (non-crossing) edges: every node gets at least one parent and one child.
  for (let r = 0; r < rows - 1; r++) {
    const a = rowNodes[r];
    const b = rowNodes[r + 1];
    for (let i = 0; i < a.length; i++) {
      const lo = Math.floor((i * b.length) / a.length);
      const hi = Math.max(lo, Math.ceil(((i + 1) * b.length) / a.length) - 1);
      for (let j = lo; j <= hi; j++) a[i].next.push(b[j].id);
    }
    // Thin some double edges for variety without orphaning anyone.
    for (const n of a) {
      if (n.next.length < 2 || !rng.chance(0.35)) continue;
      const drop = rng.chance(0.5) ? n.next[0] : n.next[n.next.length - 1];
      const otherParents = a.filter((x) => x !== n && x.next.includes(drop));
      if (otherParents.length > 0) n.next = n.next.filter((id) => id !== drop);
    }
  }
  for (const n of rowNodes[rows - 1]) n.next = [boss.id];

  // 3. Categories: a valid base pattern per row, then per-node variations that keep every path valid.
  const pattern = basePattern(rng, rows, rules);
  const cats = new Map<string, Category>();
  for (const n of nodes) if (n.type !== 'boss') cats.set(n.id, pattern[n.row]);
  const paths = allPaths(nodes, rows);
  const variable = rng.shuffle(nodes.filter((n) => n.row >= 2 && n.type !== 'boss'));
  for (const n of variable) {
    const current = cats.get(n.id)!;
    const alternatives = (['C', 'E', 'N'] as Category[]).filter((k) => k !== current && !(k === 'E' && n.row < 3));
    const alt = rng.pick(alternatives);
    cats.set(n.id, alt);
    if (!paths.filter((p) => p.includes(n)).every((p) => pathOk(p, cats, rules))) cats.set(n.id, current);
  }

  // 4. Concrete node types and content.
  for (const n of nodes) {
    if (n.type === 'boss') continue;
    const k = cats.get(n.id)!;
    if (k === 'C' || k === 'E') {
      n.type = k === 'C' ? 'combat' : 'elite';
      n.templateId = pickTemplate(rng, act);
      n.objective = TEMPLATES.find((t) => t.id === n.templateId)!.objective;
    } else {
      n.type = pickNonCombat(rng);
    }
  }
  // Make sure each act offers at least one Shop somewhere.
  if (!nodes.some((n) => n.type === 'shop')) {
    const candidates = nodes.filter((n) => n.type !== 'boss' && category(n.type) === 'N');
    if (candidates.length) rng.pick(candidates).type = 'shop';
  }
  return { act, rows, nodes };
}

export function nodeById(map: ActMap, id: string): MapNode {
  const n = map.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`Unknown map node ${id}`);
  return n;
}

/** Nodes the player may enter next. */
export function reachableNodes(map: ActMap, at: string | null): MapNode[] {
  if (at === null) return map.nodes.filter((n) => n.row === 0);
  return nodeById(map, at).next.map((id) => nodeById(map, id));
}
