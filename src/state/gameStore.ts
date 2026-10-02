import { create } from 'zustand';
import { requestThink, resetAi } from '../ai/aiClient';
import { pickDraft } from '../engine/ai/think';
import { type Color, movePromo } from '../engine/game/types';
import {
  applyAction,
  cardTargets,
  createMatch,
  replay,
  undoActions,
  type MatchAction,
  type MatchSetup,
  type MatchState,
} from '../engine/match/match';
import { aiDelayMs, useSettings } from './settingsStore';

const SAVE_KEY = 'breakchess.game.v2';

export interface Reveal {
  round: number;
  picks: [string | null, string | null];
}

export interface AiCardNotice {
  key: number;
  color: Color;
  card: string;
  sq: number;
}

interface GameStore {
  match: MatchState | null;
  selected: number | null;
  /** Active card waiting for a target square. */
  targeting: string | null;
  /** Promotion choices for a pending move. */
  promotion: number[] | null;
  thinking: boolean;
  reveal: Reveal | null;
  notice: AiCardNotice | null;

  start: (setup: MatchSetup) => void;
  resume: () => boolean;
  /** Rebuild a game from its setup and actions (run battles after a reload). */
  restore: (setup: MatchSetup, actions: MatchAction[]) => void;
  clickSquare: (sq: number) => void;
  pick: (card: string) => void;
  reroll: () => void;
  beginCard: (card: string) => void;
  cancel: () => void;
  choosePromotion: (move: number) => void;
  undo: () => void;
  resign: () => void;
  quit: () => void;
  closeReveal: () => void;
}

export const other = (c: Color): Color => (c ^ 1) as Color;

/** Does a human control this colour? */
export const humanControls = (m: MatchState, c: Color): boolean => m.setup.mode === 'local' || m.setup.human === c;

export function hasSavedGame(): boolean {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

/** Listeners told about every committed match (the run store persists run battles this way). */
const listeners = new Set<(m: MatchState) => void>();
export const onMatchChange = (fn: (m: MatchState) => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

function save(m: MatchState): void {
  for (const fn of listeners) fn(m);
  if (m.setup.context === 'run') return;
  try {
    if (m.phase === 'over') localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify({ setup: m.setup, actions: m.actions }));
  } catch {
    /* storage unavailable */
  }
}

/** Invalidates AI work in flight (undo, new game, quit). */
let aiToken = 0;
let noticeKey = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const useGame = create<GameStore>((set, get) => {
  /** Apply an action; returns false if the engine refused it. */
  const commit = (a: MatchAction): boolean => {
    const prev = get().match;
    if (!prev) return false;
    let next: MatchState;
    try {
      next = applyAction(prev, a);
    } catch {
      return false;
    }
    let reveal = get().reveal;
    if (prev.phase === 'draft' && next.phase !== 'draft') {
      const picks: [string | null, string | null] = [null, null];
      for (const l of next.log) if (l.kind === 'pick' && l.round === next.round) picks[l.color] = l.card;
      reveal = { round: next.round, picks };
    }
    set({ match: next, selected: null, targeting: null, promotion: null, reveal });
    save(next);
    return true;
  };

  /** Let the AI act if it is its turn (draft pick or move). */
  const drive = () => {
    const m = get().match;
    if (!m || m.setup.mode !== 'ai' || m.phase === 'over') return;
    const ai = other(m.setup.human);
    const token = aiToken;
    if (m.phase === 'draft') {
      const offer = m.sides[ai].offer;
      // The AI picks after the human, so its choice never shows before the reveal.
      if (!offer || m.sides[m.setup.human].offer) return;
      setTimeout(() => {
        if (token !== aiToken) return;
        const cur = get().match;
        if (!cur || cur.phase !== 'draft' || !cur.sides[ai].offer) return;
        commit({ type: 'pick', color: ai, card: pickDraft(cur.pos.toData(), ai, cur.sides[ai].offer!, cur.setup.level, cur.setup.seed) });
        drive();
      }, 350);
      return;
    }
    // Wait while the draft reveal is on screen, so the human sees the AI's pick before it moves.
    if (m.pos.side !== ai || get().thinking || get().reveal) return;
    set({ thinking: true });
    const t0 = performance.now();
    const side = m.sides[ai];
    requestThink({
      pos: m.pos.toData(),
      history: m.hashes,
      level: m.setup.level,
      cards: side.cards.filter((c) => c.uses > 0),
      cardAllowed: !side.cardUsedThisTurn,
      seed: m.setup.seed,
    })
      .then(async (res) => {
        if (token !== aiToken) return;
        const speed = useSettings.getState().animSpeed;
        const minThink = speed === 0 ? 0 : 420;
        const elapsed = performance.now() - t0;
        if (elapsed < minThink) await sleep(minThink - elapsed);
        if (token !== aiToken) return;
        if (res.card) {
          commit({ type: 'card', color: ai, card: res.card.id, sq: res.card.sq });
          set({ notice: { key: ++noticeKey, color: ai, card: res.card.id, sq: res.card.sq } });
          await sleep(aiDelayMs(speed) + 500);
          if (token !== aiToken) return;
        }
        const cur = get().match;
        if (cur && cur.phase === 'play') commit({ type: 'move', color: ai, move: res.move });
        set({ thinking: false });
        drive();
      })
      .catch(() => {
        if (token === aiToken) set({ thinking: false });
      });
  };

  const reset = () => {
    aiToken++;
    resetAi();
  };

  return {
    match: null,
    selected: null,
    targeting: null,
    promotion: null,
    thinking: false,
    reveal: null,
    notice: null,

    start: (setup) => {
      reset();
      const match = createMatch(setup);
      set({ match, selected: null, targeting: null, promotion: null, thinking: false, reveal: null, notice: null });
      save(match);
      drive();
    },

    restore: (setup, actions) => {
      reset();
      const match = replay(setup, actions);
      set({ match, selected: null, targeting: null, promotion: null, thinking: false, reveal: null, notice: null });
      drive();
    },

    resume: () => {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        const { setup, actions } = JSON.parse(raw) as { setup: MatchSetup; actions: MatchAction[] };
        reset();
        const match = replay(setup, actions);
        set({ match, selected: null, targeting: null, promotion: null, thinking: false, reveal: null, notice: null });
        drive();
        return true;
      } catch {
        try {
          localStorage.removeItem(SAVE_KEY);
        } catch {
          /* ignore */
        }
        return false;
      }
    },

    clickSquare: (sq) => {
      const { match: m, selected, targeting } = get();
      if (!m || m.phase !== 'play' || get().thinking) return;
      const color = m.pos.side as Color;
      if (!humanControls(m, color)) return;
      if (targeting) {
        if (cardTargets(m, color, targeting).includes(sq)) {
          commit({ type: 'card', color, card: targeting, sq });
          drive();
        } else set({ targeting: null });
        return;
      }
      if (selected !== null) {
        const options = m.pos.moves().filter((mv) => (mv & 63) === selected && ((mv >> 6) & 63) === sq);
        if (options.length > 1 && options.every((mv) => movePromo(mv))) {
          set({ promotion: options });
          return;
        }
        if (options.length >= 1) {
          commit({ type: 'move', color, move: options[0] });
          drive();
          return;
        }
      }
      const code = m.pos.board[sq];
      if (code && code >> 4 === color && sq !== selected) set({ selected: sq });
      else set({ selected: null });
    },

    pick: (card) => {
      const m = get().match;
      if (!m || m.phase !== 'draft') return;
      const color = ([0, 1] as Color[]).find((c) => m.sides[c].offer?.includes(card) && humanControls(m, c));
      if (color === undefined) return;
      commit({ type: 'pick', color, card });
      drive();
    },

    reroll: () => {
      const m = get().match;
      if (!m || m.phase !== 'draft') return;
      const color = ([0, 1] as Color[]).find((c) => m.sides[c].offer && humanControls(m, c));
      if (color === undefined) return;
      commit({ type: 'reroll', color });
    },

    beginCard: (card) => {
      const m = get().match;
      if (!m || get().thinking) return;
      const color = m.pos.side as Color;
      if (!humanControls(m, color) || cardTargets(m, color, card).length === 0) return;
      set({ targeting: card, selected: null });
    },

    cancel: () => set({ targeting: null, selected: null, promotion: null }),

    choosePromotion: (move) => {
      const m = get().match;
      if (!m) return;
      commit({ type: 'move', color: m.pos.side as Color, move });
      drive();
    },

    undo: () => {
      const m = get().match;
      if (!m || m.actions.length === 0) return;
      let actions: MatchAction[];
      if (m.setup.mode === 'ai') actions = undoActions(m.actions, m.setup.human);
      else {
        const last = [...m.actions].reverse().find((a) => a.type === 'move');
        if (!last) return;
        actions = undoActions(m.actions, last.color);
      }
      if (actions.length === m.actions.length) return;
      reset();
      const match = replay(m.setup, actions);
      set({ match, selected: null, targeting: null, promotion: null, thinking: false, reveal: null, notice: null });
      save(match);
      drive();
    },

    resign: () => {
      const m = get().match;
      if (!m || m.phase === 'over') return;
      const color = m.setup.mode === 'ai' ? m.setup.human : (m.pos.side as Color);
      reset();
      set({ thinking: false });
      commit({ type: 'resign', color });
    },

    quit: () => {
      reset();
      set({ match: null, selected: null, targeting: null, promotion: null, thinking: false, reveal: null, notice: null });
    },

    closeReveal: () => {
      set({ reveal: null });
      drive();
    },
  };
});
