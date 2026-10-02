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

## Rule engine and first builds (M3)

- **Upgrade DSL.** Upgrades are `UpgradeDef` objects: hooks (event + condition + usage limit + effects), movement
  modifiers (Layer B), promotion rules, roster effects and acquisition choices. Numbers that grow with stacks use
  `NumExpr` (`base + perStack × stacks`, clamped). Every upgrade lists the primitives it uses.
- **Custom effects** (D5 escape hatch, all tested): `chainPromotion`, `phalanxWards`, `swarmTide`, `twinBishops`,
  `diagonalDominion`, and the predicate `targetAttackedByOtherBishop`. Implementations live in
  `src/engine/effects/custom.ts` with a doc string each.
- **Saturating upgrades** declare `maxUsefulStacks` (e.g. Early Promotion stops at rank 4, Veteran Pawn's threshold
  stops at 1). Offers skip an upgrade only once further stacks would do nothing — this is not a cap on builds.
- **Prerequisites** ("own 2+ Bishop upgrades") count stacks of upgrades carrying that tag.
- **Long Cathedral** triggers *once per Bishop per turn*. As written, two Bishops on open diagonals could pass
  extra actions back and forth forever; D4 requires loop-capable upgrades to carry their own "once per turn/piece"
  wording. N Bishops still give up to N + 1 moves per turn, so the effect scales with the build.
- **Long Cathedral, Consecrated Diagonal** only count real moves (not free REPOSITIONs such as Bishop Recall).
- **Consecrated Diagonal** consecrates the squares *crossed* (strictly between origin and destination), never the
  Bishop's own landing square. Duration: until the end of your next turn, +1 turn per extra stack.
- **Bishop Battery** stack 1 grants a Bishop-only action (stack 2+ makes it unrestricted, per the brief). "Also
  attacked" is evaluated on the board before the capturing move.
- **Bishop Recall** and **Knight Gate** are player choices encoded as move variants: the UI asks when a
  destination has more than one variant (like promotion).
- **Chain Promotion** advances the most advanced other Pawns *that are able to advance*, and a Pawn promoted by the
  chain becomes the same piece type as the triggering promotion (promote to Bishops, chain into Bishops).
- **Phalanx** stack 2 adds "diagonal-behind" support: a Pawn with an allied Pawn diagonally behind it.
- **Swarm Tide**: divisor = max(2, 5 − stacks), counted from Pawns on the board at turn start.
- **Twin Bishops** checks Bishops on the board at encounter start (Bishops in Reserve neither count nor gain Wards).
- **Diagonal Dominion**'s Crimson squares last until the start of your next turn, i.e. through the enemy phase.
- **Open File** pierces only along the file the Rook stands on (vertical moves).
- **Rook Rails** cover a whole rank or file; a Rook pierces 1 allied piece when moving along a rail it stands on.
  Multiple rails on the same line stack.
- **New roster pieces** take a free formation square in the deployment zone (Pawns prefer the front, pieces the
  back rank), otherwise they wait in Reserve.

## Run structure (M4)

- **Rows per act.** "~7 rows" conflicts with "5–6 combats, 1–2 elites and 2–3 non-combat nodes on every path"
  (at least 8 nodes). Maps use 9 rows plus the boss row (data: `ACTS[].rows`), which allows every legal
  composition (5/1/3, 5/2/2, 6/1/2). Generation picks a valid per-row pattern, then varies individual nodes only
  when every path through them stays valid. Rows 1–2 are combats; elites never appear before row 4; each act has
  at least one Shop.
- **Seeds.** Each map node carries a stable seed (`runSeed|nodeId`); encounters, boss retries ("same seed
  variant") and node content derive from it. Offers use the `offers` stream, events the `events` stream, maps the
  `map` stream.
- **Offers.** Offer weight = rarity weight × (1 + 0.5 × stacks of owned upgrades sharing an archetype tag). Generic
  mechanical tags (`capture`, `movement`, `extra_action`, `defense`, `roster`) do not drive weighting. The most-owned
  tag is computed over archetype tags; ties resolve in a fixed tag order. Elites force one Rare+ offer; bosses offer
  Rare/Legendary only. Upgrades whose acquisition is impossible (e.g. Advanced Bishop without a Bishop) are skipped.
- **Rewards can be skipped.** Taking nothing is always allowed.
- **Gold.** Base (10/15/20) + 2 × unused turns, where unused = T − the turn the objective completed. Survival and
  Defense (which cannot finish early) give +5 flat. Elites ×1.5, bosses ×2, rounded.
- **Shop prices.** Upgrades 30/45/65/95 by rarity (+10% per act after the first), Pawn 12, Knight/Bishop 35,
  Rook 50, Crown 55, lift a curse 60, reroll 15 after the free one.
- **Starting-position upgrades.** Advanced Bishop moves a Bishop to rank 3 on its file (nearest free rank-3 square
  if needed). Forward Knight takes any empty rank-3/4 square. Castled Start chooses kingside (K g1, R f1) or
  queenside (K c1, R d1). Forward Deployment adds rank 3; each stack from the second adds 2 chosen rank-4 squares.
  Open Center removes the Pawns standing on the d- and e-files of the formation. Pieces moved by these upgrades
  are locked; displaced pieces swap into the vacated square.
- **Formation editor.** Any unlocked piece may move inside the deployment zone or to Reserve; the King must stay on
  the board.
- **Board mutations** are placed on ranks 1–6; different square types may share a square, the same type may not.
  Knight Gates link the two chosen squares; Rook Rails choose a rank (1–6) or a file.
- **Saves.** Versioned JSON (`schema`) with a migration chain; the per-turn undo stack is never saved. Autosave after
  every run action except mid-turn encounter actions, i.e. after every node and every End Turn.
- **Replays.** `RunState.actions` records every run action; replaying them from the seed reproduces the identical
  state hash (tested).
- **The Fortress King.** Act I boss: King in a corner with a two-pawn shield, Rook, Knight, Bishop and a broken
  rampart; T = 12 (11 before M6 tuning). Its Sanctuaries (2 every 3 turns, telegraphed a turn ahead) grant a Ward to an enemy piece
  standing on them at the start of your turn, and **crumble once that Ward blocks a capture**. Without the crumble,
  a King on a Sanctuary is uncapturable with one action per turn — a boss that disables builds instead of pressuring
  them.
- **Headless simulation.** `simulateRun` plays whole runs through the same reducer with a bot that reads intents
  (it targets where the enemy King is *going*), values the extra actions/Wards its build generates, and leans on the
  pieces its upgrades improve. It is the balance instrument for M4/M6 acceptance tests.

## Full run content (M5)

- **Upgrade roster (C1–C8).** 50 upgrades: Pawn 8, Bishop 9, Knight 5, Rook 5, Queen/King 5, board mutations 8,
  starting position 5, enemy debuffs 5. Interpretations of the new ones:
  - **Fork Engine** counts enemy pieces attacked from the landing square; the extra action is for a *non-Knight*
    piece, so Knights cannot loop on their own forks.
  - **Momentum Knight**: "moved on your previous turn" means the same Knight made at least one move during the
    previous Player Turn. The follow-up is a free move by that Knight (stack 1: non-capturing; stack 2: may
    capture), once per Knight per turn.
  - **Landing Shock** immobilizes the (up to 8) enemy pieces adjacent to the landing square for the next N enemy
    phases (N = stacks).
  - **Royal Fork** fires when, after a Knight move, the Knight attacks the enemy King and at least one other enemy
    piece; it captures the most valuable other attacked piece (ties: lowest square). The Knight does not move and
    Ward rules apply.
  - **Open File**: "no Pawns" means no Pawn of either side on the Rook's file; the pierce only applies to moves
    along that file.
  - **Rook Battery**: aligned = same rank or file with no piece or terrain between; the nearest aligned allied Rook
    gains the actions, usable only by itself.
  - **Siege Engine** counts, per (Rook, target) pair, consecutive *Player Turn ends* at which the Rook attacks the
    target; at max(1, 3 − stacks) the target is *besieged* (badge) and the Rook captures it at the start of your
    next turn if it still attacks it (the Rook stays; Ward rules apply).
  - **Queen's Gambit** stores pierce charges on your Queens (+stacks per allied piece lost); a Queen's next move
    may pierce that many pieces and spends all of her charges.
  - **War King**'s range applies to all eight directions; its capture Ward is permanent. **Royal Guard** Wards
    expire at the end of the enemy phase.
  - **Tyrant Queen** (upgrade) counts your non-Pawn, non-King pieces on the board at turn start (Reserve
    excluded).
  - **Debuffs** use the encounter's RNG stream: Cracked Formation never removes a marked target; Delayed
    Reinforcement never delays the King, a boss or a target and brings the piece back (with its tags and Wards)
    in enemy phase 2, so it is on the board for Player Turn 3 (delayed further if its square is blocked). Slow
    Command applies to bosses too. Heavy Queen also limits promoted and boss Queens.
- **New encounter templates.** *Pawn Race* (PROMOTION_RACE) needs one promotion in every act; the countdown
  equals the turn limit (8/8/9); 3/4/4–5 enemy Pawns start on ranks 6–7, screened by 2/3/4 pieces in
  Acts I/II/III. *Breakout* (ESCAPE) designates the escapee by preference Knight > Bishop > Rook > Queen > Pawn;
  three exits sit on rank 8 (M5 used two in Act III; see M6). The validator's reachability check for ESCAPE only
  measures the escapee, with real move geometry (a Knight next to an exit is not "one move away").
- **Chained intents.** A boss rule may give one piece several intents per phase. They are planned one after
  another on the hypothetical board (so step 2 starts where step 1 ends) and previewed the same way. **A piece
  whose step fails — fizzles, or is repelled by a Ward — abandons the rest of its route** ("route broken"),
  instead of attempting later steps from the wrong square. This makes "block one step" a real answer and keeps
  the preview honest.
- **The Tyrant Queen** (Act II): the Queen's court hems her in (only the d-file is open, its Pawn already on d5),
  so her opening routes are short and readable. Her route grows 1 → 2 → 3 steps over the first three turns,
  then stays at 3; the court shares one intent. She starts with **3 Wards and loses one every time her route
  breaks** ("she stumbles"). While warded she plays boldly (a hit only costs a Ward); bare, she is as careful
  as a King. Tuning history: with no Ward she fell to the first block (bot, unupgraded army: 12/12 by turn 4);
  with a permanent Ward the bot never landed the second hit (0/12); with the stumble rule and 2 Wards the
  unupgraded bot won 10/12; run simulations (M6) then showed upgraded armies beating her almost always, so she
  got a third Ward.
- **The Pawn Emperor** (Act III): a full court behind an unbroken wall of 8 Pawns (+2 advanced), the Emperor
  (King) with 1 Ward, 2 enemy actions, T = 12. Every enemy phase it summons the Pawns telegraphed the phase before
  (1–2 on free rank-7 squares, spilling onto rank 6 when rank 7 is full); a countdown from 8 turns every enemy
  Pawn into a Queen at 0, then restarts.
- **Boss safety.** The enemy planner values a boss piece's safety like its King's (a boss captured is an
  encounter lost); marked targets get a smaller premium. Without it the Tyrant Queen happily traded herself for a
  Rook.
- **Bot look-ahead** (validator playouts and balance sims, never the enemy): the bot now resolves Ward-blocked
  captures as the rules do (no phantom wins against warded bosses), re-simulates chained intents in order when its
  move interferes with a route, checks one ply beyond the committed intents (will the enemy be attacking its King,
  and can the King step away?), and in races backs a single runner instead of spreading Pawn moves.
- **Run statistics** add fizzles, enemy immobilizations and Ward blocks; save schema 2 migrates older saves by
  zero-filling them.

## Polish and balance (M6)

- **Balance instrument.** `npm run balance` (engine module `run/balance.ts`, loaded through Vite's SSR loader so no
  extra tooling is needed) plays seeded runs per bot policy and reports run wins, where runs end, loss rate and
  loss reason per encounter template × act (elites starred), boss results and the most taken upgrades. Latest
  numbers: [`docs/BALANCE.md`](./docs/BALANCE.md). The four policies are deliberately narrow (Pawn-only,
  Bishop-only, mutations/debuffs-only, "best rarity"), so they bracket real players rather than model them.
- **What the simulation changed** (40 seeds × 4 policies; full-run wins went from 60/5/10/38% to
  78/40/38/55% for pawn/bishop/board/any):
  - Almost every loss was "turn limit reached", not a lost King: Acts I–II turn limits are now 7–8 (were 6–7) and
    the Fortress King allows 12 turns (was 11). Elites get `ACTS[].eliteTurnBonus` (+1) on timed objectives —
    they hit harder, so they also allow a little longer — but never on hold-out objectives.
  - *Breakout* keeps three exits in every act, gets +1 turn from Act II, and its runner carries 1 Ward from Act II
    (hunters gang up on it).
  - *Last Stand* never lost an encounter (0% over hundreds of plays): the enemy could not reach a King inside a
    full formation. It is now an **ambush**: telegraphed ambushers drop onto ranks 3–4 near the player's King
    every phase (occupying a drop square delays that arrival), T = 6/7/7. **King hunters net the King**: once an
    intent strikes the King's square, the following intents aim at the squares it could step to (a second strike
    on a boxed-in King is decisive). The validator now rejects hold-out encounters that an idle player survives.
    Bots still survive most ambushes — their King keeps finding a square — but the formation gets torn apart,
    and doing nothing loses.
  - The Tyrant Queen got a third Ward (see M5).
  - Bot fixes the numbers exposed (validator playouts and simulation only, never the enemy): an urgency factor
    makes the objective dominate as the clock runs down (a Pawn build kept promoting Queens instead of moving its
    Breakout runner), and build affinity counts less in races and escapes, where one specific piece wins.
- **Known gaps** (see the report): Bishop-only runs still lose about half their Act II Fortresses (walls close
  diagonals — terrain is the intended counter to a build, B5), mutation/debuff-only runs struggle against the
  Tyrant Queen and the Pawn Emperor (no extra actions to answer several threats a turn), and Act III elites lose
  about half the time on small samples. None of these is a hard wall for a mixed build (`any`: 55% full-run wins).
- **Tuning via data.** Act tuning (`src/data/acts.ts`), the economy — prices, gold per unused turn, multipliers,
  Crowns (`src/data/economy.ts`), enemy behaviour-profile weights and the net bonus (`src/data/profiles.ts`),
  templates and bosses. The engine reads these; no balance number lives in engine code.
- **Juice (F5).** Effects are *derived from the difference between two displayed frames* — the new combat-log
  entries plus piece changes (`src/state/fx.ts`) — so an animation can never disagree with the log. Long Bishop
  moves draw a progressive golden diagonal trail with sparks (other long slides a fainter one); captures burst;
  every trigger pulses its squares and pops a short label, chained triggers one after another (110 ms apart at 1×)
  in resolution order; Ward blocks and fizzles get their own pulse; promotion flashes the board and the piece
  pops as it transforms (mass promotions flash red); pieces drop onto the board when they appear (deployment,
  reinforcements, spawns) in a quick wave; extra actions get a spinning gold ring, a "+N actions" label and the
  new token pops in. Popups on one square stack. Everything scales with the speed setting (2× halves durations),
  is skipped with the rest of the playback (Space / Skip) and is never mounted at Instant.
- **No input lag.** The first frame of an action is shown immediately; only the rest of the playback is paced.
- **Visual build identity (F4).** Pieces are never replaced. On top of the aura and base rings (which grow with
  the upgrades touching the piece type): small **sigils** in the corner for each kind of power those upgrades grant
  (new movement, pierce, extra actions, Wards, immobilize, promotion rules, reposition; at most three), a **board
  aura** in the colour of the dominant archetype (3+ stacks; violet for 4+ board mutations), and a **Pawn swarm**
  of 10+ Pawns marches in place, out of step. Bishop runs leave light trails.
- **Piece inspection (F2).** A compact view (rarity-coloured chips, inactive conditions dimmed, counters such as
  Zeal inline) and a detailed view (every modifier with its rules text, the square effects under the piece and
  their texts), toggled by *Details* or `I` and remembered. The header counts modifiers (and how many are
  active) and lists the piece's kinds of power.
