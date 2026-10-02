import { think, type ThinkRequest, type ThinkResult } from '../engine/ai/think';

/**
 * Talks to the AI worker. `reset()` terminates a search in progress (undo,
 * new game); answers to requests made before a reset are dropped.
 */
type Pending = { resolve: (r: ThinkResult) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function ensureWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  worker.onmessage = (e: MessageEvent<{ id: number; res?: ThinkResult; error?: string }>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.res) p.resolve(e.data.res);
    else p.reject(new Error(e.data.error ?? 'AI error'));
  };
  return worker;
}

export function requestThink(req: ThinkRequest): Promise<ThinkResult> {
  const w = ensureWorker();
  const id = ++seq;
  if (!w) {
    // No worker support: think on the main thread.
    return new Promise((resolve) => setTimeout(() => resolve(think(req)), 0));
  }
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, req });
  });
}

/** Abort any search in progress. */
export function resetAi(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  for (const p of pending.values()) p.reject(new Error('cancelled'));
  pending.clear();
}
