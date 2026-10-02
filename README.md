# Break Chess

A browser-playable chess roguelike. Every run begins close to normal chess; by repeatedly upgrading pieces,
mutating the board, reshaping your starting formation and weakening enemy rules, you build **your own broken
version of chess**.

- Fully client-side: Vite + React + TypeScript + Tailwind CSS. No server, no paid APIs, no LLMs.
- Deterministic engine with seeded PRNG streams; runs headless in tests and in balance simulations.
- See [`DESIGN_DECISIONS.md`](./DESIGN_DECISIONS.md) for interpretations of the design brief and
  [`docs/BALANCE.md`](./docs/BALANCE.md) for the latest balance simulation.

## Playing

From the title screen: **New run** (optionally with a seed), **Continue run** from the autosave, the **Encounter
Sandbox** (any template or boss, act and seed) or the **Hot-seat Test Board** (plain two-player chess).

- Click one of your pieces to see its moves: cyan dots are movement granted by upgrades, violet diamonds pierce.
- Red arrows are the enemy's **committed intents**: they execute after your turn, exactly as shown, unless you dodge,
  block, capture, immobilize or bait them. Numbered markers show a boss's route step by step.
- Hover a piece to inspect its accumulated rules; **Details** (or `I`) switches between the compact and full view.
- Keys: `Enter` End Turn · `Z` Undo · `Space` skip animations · `I` inspector details · `Esc` deselect.
- Animation speed 1×, 2× or Instant is in the actions panel. The sandbox has a debug panel that grants any
  upgrade or board square, to try combinations.

A run is three acts of 9 rows each, ending in a boss: the Fortress King, the Tyrant Queen and the Pawn Emperor.
You have three Crowns; losing an encounter costs one. Progress autosaves after every node and every End Turn.

## Development

```bash
npm install
npm run dev        # http://localhost:5173/chess/
npm run lint
npm run typecheck
npm test
npm run build
npm run balance    # headless balance simulation (see below)
```

### Balance simulation

```bash
npm run balance -- --seeds 40 --policies pawn,bishop,board,any --acts 3 --out docs/BALANCE.md
```

A bot plays whole seeded runs through the same reducer as the UI, with a pick policy per archetype (`pawn`,
`bishop`, `board` = mutations and debuffs only, `any` = best rarity). The report lists run win rates, where runs
end, loss rates per encounter template and act (with the reason: turn limit, King captured…), boss results and the
most taken upgrades. Every row replays exactly from its seed. Tuning lives in data: `src/data/acts.ts`,
`src/data/economy.ts`, `src/data/profiles.ts`, the encounter templates in `src/data/encounters` and the bosses in
`src/data/bosses`.

### Layout

- `src/engine` — rules: chess core, move generation layers, effect primitives and the event-driven resolver,
  encounters (setup, flow, objectives, generator and validator), enemy planning, runs, saves, simulation.
- `src/data` — content and tuning: upgrades (C1–C8), squares, affixes, events, recruits, templates, bosses.
- `src/state` — Zustand stores (session with animation frames and effects, run, settings).
- `src/components`, `src/screens` — React UI. `tests` — Vitest suites (perft, every primitive and upgrade,
  interactions, validator, runs, bosses, balance, effects).

## Deployment

`.github/workflows/ci.yml` runs install → lint → typecheck → test → build on every push, and deploys `dist/` to
GitHub Pages on pushes to `main`. Enable Pages once in **Settings → Pages → Source: GitHub Actions**.
The Vite `base` is derived from the repository name in CI (`VITE_BASE`), defaulting to `/chess/`.
