import { useEffect, useRef } from 'react';
import { NodeIcon } from '../../components/run/NodeIcon';
import { NODE_COLOR } from '../../components/run/nodeColors';
import { bossById } from '../../engine/run/content';
import { nextNodes } from '../../engine/run/reducer';
import { NODE_NAME, type MapNode, type NodeType, type RunState } from '../../engine/run/types';
import { useRun } from '../../state/runStore';

const ROW_H = 78;
const TOP = 120;
const BOTTOM = 40;

/** Small stable horizontal wobble per node so the map does not look like a grid. */
const wobble = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h % 5) - 2) * 0.6;
};

export function MapView({ run }: { run: RunState }) {
  const act = useRun((s) => s.act);
  const map = run.map;
  const next = new Set(nextNodes(run));
  const height = TOP + map.rows * ROW_H + BOTTOM;
  const scroller = useRef<HTMLDivElement>(null);
  const x = (n: MapNode) => ((n.col + 0.5) / map.cols) * 100 + wobble(n.id);
  const y = (n: MapNode) => height - BOTTOM - n.row * ROW_H - ROW_H / 2;
  const bossY = TOP / 2;
  const nodes = Object.values(map.nodes);
  const boss = bossById(map.boss);
  const currentRow = run.current && run.current !== map.bossId ? map.nodes[run.current].row : -1;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = height - BOTTOM - (currentRow + 1) * ROW_H - el.clientHeight / 2;
    el.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [currentRow, height]);

  const enter = (id: string) => {
    if (next.has(id)) act({ type: 'enter', node: id });
  };
  const visited = new Set(run.visited);
  const edgeTaken = (a: string, b: string) => {
    const i = run.visited.indexOf(a);
    return i >= 0 && run.visited[i + 1] === b;
  };

  return (
    <div className="flex flex-col gap-3">
      <div ref={scroller} className="panel relative max-h-[70vh] overflow-y-auto overflow-x-hidden">
        <div className="relative mx-auto w-full max-w-[640px]" style={{ height }}>
          <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
            {nodes.map((n) =>
              n.next.map((m) => {
                const to = m === map.bossId ? null : map.nodes[m];
                const x2 = to ? x(to) : 50;
                const y2 = to ? y(to) : bossY + 34;
                const taken = edgeTaken(n.id, m);
                const live = run.current === n.id && next.has(m);
                return (
                  <line
                    key={`${n.id}-${m}`}
                    x1={x(n)}
                    y1={y(n)}
                    x2={x2}
                    y2={y2}
                    stroke={taken ? '#e8c46a' : live ? '#f3d98f' : '#55486a'}
                    strokeWidth={taken || live ? 2.2 : 1.4}
                    strokeDasharray={taken ? undefined : '3 4'}
                    vectorEffect="non-scaling-stroke"
                    opacity={taken || live ? 1 : 0.7}
                  />
                );
              }),
            )}
          </svg>
          {/* Boss */}
          <button
            type="button"
            onClick={() => enter(map.bossId)}
            disabled={!next.has(map.bossId)}
            className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-2xl border-2 px-4 py-2 transition ${
              next.has(map.bossId) ? 'pulse-gold cursor-pointer border-blood-400 bg-blood-600/40' : 'border-blood-600/60 bg-ink-900/80'
            }`}
            style={{ left: '50%', top: bossY }}
            title={boss.blurb}
          >
            <NodeIcon type="boss" className="h-9 w-9 text-blood-300" />
            <span className="text-sm font-bold text-blood-300">보스 · {boss.name}</span>
          </button>
          {nodes.map((n) => {
            const isNext = next.has(n.id);
            const isCur = run.current === n.id;
            const seen = visited.has(n.id);
            return (
              <button
                key={n.id}
                type="button"
                disabled={!isNext}
                onClick={() => enter(n.id)}
                title={NODE_NAME[n.type]}
                className={`absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 transition ${
                  isCur
                    ? 'border-gold-300 bg-gold-500/30 shadow-[0_0_14px_rgba(232,196,106,0.7)]'
                    : isNext
                      ? 'pulse-gold cursor-pointer border-gold-400 bg-ink-800 hover:scale-110'
                      : seen
                        ? 'border-gold-600/70 bg-ink-800/80'
                        : 'border-ink-600 bg-ink-900/90'
                }`}
                style={{ left: `${x(n)}%`, top: y(n), color: NODE_COLOR[n.type], opacity: isNext || isCur || seen ? 1 : 0.62 }}
              >
                <NodeIcon type={n.type} className="h-6 w-6" />
              </button>
            );
          })}
        </div>
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  const types: NodeType[] = ['battle', 'elite', 'event', 'shop', 'rest', 'treasure'];
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-ink-300">
      {types.map((t) => (
        <span key={t} className="flex items-center gap-1">
          <span style={{ color: NODE_COLOR[t] }}>
            <NodeIcon type={t} className="h-4 w-4" />
          </span>
          {NODE_NAME[t]}
        </span>
      ))}
    </div>
  );
}
