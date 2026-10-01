# Design Decisions

Interpretations and choices made where the build brief was silent, ambiguous or self-contradictory. Part B of
the brief is authoritative; every entry below either implements Part B literally or resolves a gap using the
Development Rule ("does this increase the player's ability to create their own broken version of chess?").

## Engine foundations

- **Board coordinates.** Squares are `0..63` (`rank * 8 + file`). The player is White at the bottom (ranks 1–2),
  the enemy is Black at the top and moves toward rank 1.
- **Strict reference mode.** `src/engine/chess` is a self-contained orthodox chess implementation (FEN, legal-move
  filtering, castling-through-check rules, perft). It also exposes a king-capture variant used by the hot-seat
  test board. Gameplay never uses strict mode (B3).
- **PRNG.** sfc32 seeded by cyrb128, with named streams `map`, `offers`, `encounterGen`, `enemyAI`, `events`
  derived independently from the run seed, so consuming one stream never shifts another (D6). `Math.random()` is
  banned in `src/engine/**` and `src/data/**` via ESLint.
