# Break Chess

A browser-playable chess roguelike. Every run begins close to normal chess; by repeatedly upgrading pieces,
mutating the board, reshaping your starting formation and weakening enemy rules, you build **your own broken
version of chess**.

- Fully client-side: Vite + React + TypeScript + Tailwind CSS. No server, no paid APIs, no LLMs.
- Deterministic engine with seeded PRNG streams; runs headless in tests.
- See [`DESIGN_DECISIONS.md`](./DESIGN_DECISIONS.md) for interpretations of the design brief.

## Development

```bash
npm install
npm run dev        # http://localhost:5173/chess/
npm run lint
npm run typecheck
npm test
npm run build
```

## Deployment

`.github/workflows/ci.yml` runs install → lint → typecheck → test → build on every push, and deploys `dist/` to
GitHub Pages on pushes to the default branch. Enable Pages once in **Settings → Pages → Source: GitHub Actions**.
The Vite `base` is derived from the repository name in CI (`VITE_BASE`), defaulting to `/chess/`.
