import { useMemo, useState } from 'react';
import { reachableNodes } from '../../engine/run/map';
import type { MapNode, RunState } from '../../engine/run/types';
import { TEMPLATES } from '../../data/encounters';
import { BOSSES } from '../../data/bosses';
import { actTuning } from '../../data/acts';
import { NodeIcon } from '../../components/run/NodeIcon';
import { NODE_COLOR, NODE_LABEL } from '../../components/run/nodeMeta';

const ROW_H = 74;
const WIDTH = 560;

function describeNode(n: MapNode): { title: string; text: string } {
  if (n.type === 'boss') {
    const b = BOSSES[n.templateId ?? ''];
    return { title: b?.name ?? 'Boss', text: b?.description ?? 'The act boss.' };
  }
  if (n.type === 'combat' || n.type === 'elite') {
    const t = TEMPLATES.find((x) => x.id === n.templateId);
    return {
      title: `${NODE_LABEL[n.type]} · ${t?.name ?? ''}`,
      text: `${t?.blurb ?? ''}${n.type === 'elite' ? ' Elites bring extra actions or enemy affixes, and a Rare reward.' : ''}`,
    };
  }
  const text: Record<string, string> = {
    upgrade: 'Choose 1 of 3 upgrades.',
    shop: 'Spend gold on upgrades, pieces, squares or a Crown. One free reroll.',
    mutation: 'Choose 1 of 3 board mutations and place it.',
    recruit: 'Choose 1 of 3 pieces to add to your roster.',
    event: 'A scripted choice with trade-offs.',
    sacrifice: 'Permanently give up a piece (or accept a curse) for a powerful reward.',
  };
  return { title: NODE_LABEL[n.type], text: text[n.type] ?? '' };
}

export function MapView({ run, onChoose }: { run: RunState; onChoose: (id: string) => void }) {
  const [hover, setHover] = useState<MapNode | null>(null);
  const reachable = useMemo(() => new Set(reachableNodes(run.map, run.at).map((n) => n.id)), [run.map, run.at]);
  const rows = run.map.rows + 1;
  const height = rows * ROW_H + 30;
  const pos = (n: MapNode) => ({ x: 40 + n.x * (WIDTH - 80), y: height - 30 - n.row * ROW_H });
  const byId = new Map(run.map.nodes.map((n) => [n.id, n]));
  const visitedEdges = new Set<string>();
  for (let i = 1; i < run.visited.length; i++) visitedEdges.add(`${run.visited[i - 1]}>${run.visited[i]}`);
  const info = hover ? describeNode(hover) : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-4 lg:flex-row lg:items-start">
      <div className="panel relative w-full max-w-[600px] overflow-hidden p-2">
        <div className="pointer-events-none absolute inset-x-0 top-3 text-center font-display text-sm uppercase tracking-[0.3em] text-ink-400">
          Act {run.act} — {actTuning(run.act).feel}
        </div>
        <svg viewBox={`0 0 ${WIDTH} ${height}`} className="h-auto w-full">
          {run.map.nodes.flatMap((n) =>
            n.next.map((id) => {
              const to = byId.get(id)!;
              const a = pos(n);
              const b = pos(to);
              const walked = visitedEdges.has(`${n.id}>${id}`);
              const open = run.at === n.id && reachable.has(id);
              return (
                <line
                  key={`${n.id}-${id}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={walked ? '#e8c46a' : open ? '#a497b6' : '#3d3349'}
                  strokeWidth={walked ? 4 : 2.5}
                  strokeDasharray={walked || open ? undefined : '6 6'}
                />
              );
            }),
          )}
          {run.map.nodes.map((n) => {
            const p = pos(n);
            const isReachable = reachable.has(n.id) && !run.encounter && !run.pending;
            const visited = run.visited.includes(n.id);
            const current = run.at === n.id;
            const r = n.type === 'boss' ? 30 : 21;
            return (
              <g
                key={n.id}
                transform={`translate(${p.x}, ${p.y})`}
                className={isReachable ? 'cursor-pointer' : ''}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(null)}
                onClick={() => isReachable && onChoose(n.id)}
              >
                {isReachable ? (
                  <circle r={r + 7} fill="none" stroke={NODE_COLOR[n.type]} strokeWidth={2} opacity={0.8}>
                    <animate attributeName="r" values={`${r + 4};${r + 9};${r + 4}`} dur="1.6s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.6s" repeatCount="indefinite" />
                  </circle>
                ) : null}
                <circle
                  r={r}
                  fill={visited ? '#2e2639' : '#1b1622'}
                  stroke={current ? '#e8c46a' : visited ? '#7a6c8f' : NODE_COLOR[n.type]}
                  strokeWidth={current ? 4 : 2.5}
                  opacity={!visited && !isReachable && run.visited.length > 0 && n.row <= (byId.get(run.at ?? '')?.row ?? -1) ? 0.35 : 1}
                />
                <foreignObject x={-r * 0.62} y={-r * 0.62} width={r * 1.24} height={r * 1.24} className="pointer-events-none">
                  <NodeIcon type={n.type} className="h-full w-full" />
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="panel w-full max-w-sm p-4 lg:sticky lg:top-4">
        {info ? (
          <>
            <div className="font-display text-lg text-gold-300">{info.title}</div>
            <p className="mt-1 text-sm text-ink-200">{info.text}</p>
          </>
        ) : (
          <>
            <div className="font-display text-lg text-gold-300">Choose your path</div>
            <p className="mt-1 text-sm text-ink-200">
              The whole act is visible. Every path holds 5–6 combats, 1–2 elites and 2–3 other nodes before the boss. Hover a node for
              details; glowing nodes are reachable.
            </p>
          </>
        )}
        <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-ink-300">
          {(['combat', 'elite', 'upgrade', 'shop', 'mutation', 'recruit', 'event', 'sacrifice', 'boss'] as const).map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <NodeIcon type={t} className="h-4 w-4" />
              {NODE_LABEL[t]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
