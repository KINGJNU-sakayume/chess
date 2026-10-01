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

## Turn structure, intents and resolution (M2)

- **Immutable state.** Engine operations copy the state's containers once (`beginDraft`), mutate the copy and
  return it; pieces are always replaced, never mutated. Tests deep-freeze inputs to enforce this. Undo is a stack
  of these snapshots for the current Player Turn.
- **Time and durations.** Timed effects carry an expiry point (`turnStart`, `turnEnd`, `phaseStart`, `phaseEnd`
  of a given turn). Enemy phase *n* follows Player Turn *n*. "Immobilized for its next enemy phase" applied during
  Player Turn *n* expires at the end of enemy phase *n*; applied during enemy phase *n* it lasts through phase
  *n + 1*. Status ticking (enemy phase step 3) removes everything whose expiry point has been reached.
- **Action tokens.** The base action and every `EXTRA_ACTION` are tokens with optional restrictions (piece type,
  specific piece, "a different piece", non-capturing). A move is paid by the *most restrictive* token that allows
  it, so flexible tokens are saved. Unused tokens are discarded at End Turn.
- **Auto end turn** is a setting (off by default) so that Undo stays useful on single-action turns; End Turn pulses
  when no actions remain.
- **Reserve deployment** may be used at any point during the Player Turn (not only before the first move).
- **Intent resolution.** An intent executes if its destination is still among the piece's current legal moves,
  capturing whatever player piece is there (Ward rules apply). Fizzle reasons: piece captured, piece immobilized,
  destination consecrated, destination occupied, path blocked. Intents are planned sequentially on a hypothetical
  board, so later intents assume earlier ones resolved.
- **Ward consumption.** Temporary Wards are consumed before permanent ones (they would expire anyway).
- **Blocked captures.** A Ward-blocked attacker stays on its origin square; path-crossing events have already
  fired (it travelled and was repelled), but landing effects and promotion do not happen.
- **En passant.** The player may capture en passant an enemy Pawn that advanced two squares from its home rank
  during the previous enemy phase, at any point during the following Player Turn. Enemy Pawns never capture en
  passant: their intents are committed before the player moves, so the situation cannot be planned. Only standard
  two-square advances from the home rank create en passant chances (Double March pushes from other ranks do not).
- **Castling** (player only): King and a Rook on the same rank, both unmoved this encounter, at least three files
  apart, every square between empty. The King moves two squares toward the Rook, which lands on the square the King
  crossed. This generalises orthodox castling to rearranged formations.
- **Rubble** behaves like an enemy piece for move generation: capture-capable moves may enter it (clearing it),
  it blocks slides, and clearing it is not a piece capture (no capture triggers).
- **Reinforcements** arrive on telegraphed squares; if a square is occupied at arrival time the reinforcement is
  delayed by one phase, so the player can block arrivals by occupying them.
- **Enemy promotion** always produces a Queen.

## Enemy planning

- Sequential greedy planning: score every candidate move of every eligible enemy piece, take the best, apply it to
  a hypothetical board, repeat with a different piece until N intents are planned. Scores combine capture value,
  check threat on the player's King, profile goal progress, protection of the enemy King (a coarse 2-ply map of
  squares the player could attack after one move) and 1-ply safety on arrival. Pieces currently attacked get a
  bonus for moving to safety. Seeded jitter (< 0.5 points) breaks ties.
- Committed intents can never respond to the player's next move, so the planner's King defence is prophylactic:
  it moves the King away from squares the player could attack next turn.

## Encounter generation and validation

- Templates (Skirmish, Fortress, Hunt, Last Stand, …) generate layouts procedurally; enemies never start on the
  player's formation squares and terrain never lands on the deployment zone.
- Validation follows D7. Playouts use a random-greedy policy that reads intents (dodge, block, bait, capture the
  intending piece) and pursues the objective. Playouts stop early once at least one success has been found after
  eight playouts; every executed playout is checked for a win within the first two turns. Up to 8 generation
  attempts are made before falling back to the template's safe variant (validated for every act in tests).
