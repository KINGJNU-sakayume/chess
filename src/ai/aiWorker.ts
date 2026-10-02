import { think, type ThinkRequest } from '../engine/ai/think';

/** Runs the AI off the UI thread. One request at a time; the client discards stale answers. */
self.onmessage = (e: MessageEvent<{ id: number; req: ThinkRequest }>) => {
  const { id, req } = e.data;
  try {
    const res = think(req);
    self.postMessage({ id, res });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
