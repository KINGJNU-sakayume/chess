import { Rng } from '../rng/rng';
import { BOSSES } from './content';
import type { ActMap, MapNode, NodeType } from './types';

/** Floors per act before the boss, and map width. */
export const MAP_ROWS = 8;
export const MAP_COLS = 7;
const PATHS = 6;
/** Floor (0-based) that always holds treasure, and the last floor (always a rest site). */
const TREASURE_ROW = 4;
const REST_ROW = MAP_ROWS - 1;

const nodeId = (act: number, r: number, c: number) => `a${act}r${r}c${c}`;

/**
 * Slay the Spire style map: six paths climb from the bottom, each step moving
 * at most one column sideways, never crossing another path. Node types are
 * drawn with spacing rules (no back-to-back elites, shops or rest sites).
 */
export function generateMap(seed: string, act: number): ActMap {
  const rng = Rng.fromSeed(seed, `map:${act}`);
  const edges = new Set<string>();
  const used = new Set<string>();
  let firstStart = -1;
  for (let p = 0; p < PATHS; p++) {
    let c = rng.int(MAP_COLS);
    if (p === 1) while (c === firstStart) c = rng.int(MAP_COLS);
    if (p === 0) firstStart = c;
    used.add(`${0},${c}`);
    for (let r = 0; r < MAP_ROWS - 1; r++) {
      const options = [c - 1, c, c + 1].filter((n) => n >= 0 && n < MAP_COLS && (n === c || !edges.has(`${r},${n}>${c}`)));
      const n = rng.pick(options);
      edges.add(`${r},${c}>${n}`);
      used.add(`${r + 1},${n}`);
      c = n;
    }
  }

  const nodes: Record<string, MapNode> = {};
  for (const key of used) {
    const [r, c] = key.split(',').map(Number);
    nodes[nodeId(act, r, c)] = { id: nodeId(act, r, c), row: r, col: c, type: 'battle', next: [] };
  }
  for (const e of edges) {
    const [rc, n] = e.split('>');
    const [r, c] = rc.split(',').map(Number);
    const from = nodes[nodeId(act, r, c)];
    const to = nodeId(act, r + 1, Number(n));
    if (!from.next.includes(to)) from.next.push(to);
  }
  const bossId = `a${act}boss`;
  const list = Object.values(nodes).sort((a, b) => a.row - b.row || a.col - b.col);
  for (const n of list) {
    n.next.sort();
    if (n.row === MAP_ROWS - 1) n.next = [bossId];
  }

  // Parents, for spacing rules.
  const parents = new Map<string, MapNode[]>();
  for (const n of list) for (const m of n.next) parents.set(m, [...(parents.get(m) ?? []), n]);

  const pickType = (n: MapNode): NodeType => {
    if (n.row === 0) return 'battle';
    if (n.row === TREASURE_ROW) return 'treasure';
    if (n.row === REST_ROW) return 'rest';
    const weights: [NodeType, number][] = [
      ['battle', 46],
      ['event', 24],
      ['elite', n.row >= 2 ? 13 : 0],
      ['shop', n.row >= 2 ? 9 : 0],
      ['rest', n.row >= 3 && n.row <= REST_ROW - 2 ? 9 : 0],
    ];
    const spaced = new Set<NodeType>(['elite', 'shop', 'rest']);
    const parentTypes = new Set((parents.get(n.id) ?? []).map((p) => p.type));
    const allowed = weights.filter(([t, w]) => w > 0 && !(spaced.has(t) && parentTypes.has(t)));
    return allowed[rng.weightedIndex(allowed.map(([, w]) => w))][0];
  };
  for (const n of list) n.type = pickType(n);

  // Every act has at least one shop and one elite.
  for (const want of ['shop', 'elite'] as NodeType[]) {
    if (list.some((n) => n.type === want)) continue;
    const candidates = list.filter(
      (n) =>
        n.row >= 2 &&
        n.row < REST_ROW &&
        n.row !== TREASURE_ROW &&
        (n.type === 'battle' || n.type === 'event') &&
        !(parents.get(n.id) ?? []).some((p) => p.type === want) &&
        !n.next.some((m) => nodes[m]?.type === want),
    );
    if (candidates.length) rng.pick(candidates).type = want;
  }

  const bosses = BOSSES[act];
  return {
    act,
    rows: MAP_ROWS,
    cols: MAP_COLS,
    nodes,
    starts: list.filter((n) => n.row === 0).map((n) => n.id),
    bossId,
    boss: rng.pick(bosses).id,
  };
}

/** Nodes the player may enter next. */
export function reachable(map: ActMap, current: string | null): string[] {
  if (current === null) return map.starts;
  if (current === map.bossId) return [];
  return map.nodes[current]?.next ?? [];
}
