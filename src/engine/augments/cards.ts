import type { Position } from '../game/position';
import type { SideRules } from '../game/rules';
import {
  ARCHBISHOP,
  BISHOP,
  CHANCELLOR,
  F_FROZEN,
  F_SHIELD,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  T_NONE,
  T_WALL,
  WHITE,
  trapOf,
  type Color,
} from '../game/types';

/**
 * Augment cards. Passive cards change a side's rules (and some act once when
 * drafted); active cards are used during your own turn as a free action, at
 * most one card per turn. No card ever moves a piece: a turn is always exactly
 * one move.
 */
export type Tier = 'silver' | 'gold' | 'prism';
export const TIERS: readonly Tier[] = ['silver', 'gold', 'prism'];
export const TIER_NAME: Readonly<Record<Tier, string>> = { silver: '실버', gold: '골드', prism: '프리즘' };

export type CardCategory = 'piece' | 'pawn' | 'defense' | 'summon' | 'tactic' | 'victory' | 'special';
export const CATEGORY_NAME: Readonly<Record<CardCategory, string>> = {
  piece: '기물',
  pawn: '폰',
  defense: '방어',
  summon: '소환',
  tactic: '전술',
  victory: '승리 조건',
  special: '특수',
};

/** Icon keys rendered by the UI. */
export type CardIcon =
  | 'camel'
  | 'cross'
  | 'tower'
  | 'sidestep'
  | 'charge'
  | 'pike'
  | 'retreat'
  | 'pawn-plus'
  | 'crosshair'
  | 'shield'
  | 'wall'
  | 'oath'
  | 'coin'
  | 'mitre'
  | 'scroll'
  | 'king-sword'
  | 'crown-shield'
  | 'snowflake'
  | 'flame'
  | 'horse'
  | 'star-up'
  | 'phoenix'
  | 'mine'
  | 'guard'
  | 'amazon'
  | 'hill'
  | 'check3'
  | 'cavalry'
  | 'horde'
  | 'grail'
  | 'crown-up'
  | 'halo'
  | 'flag'
  | 'vanguard'
  | 'mercenary'
  | 'twin-queen';

export interface DraftContext {
  pos: Position;
  color: Color;
  /** Draft round, 1..3. */
  round: number;
}

export interface CardDef {
  id: string;
  name: string;
  tier: Tier;
  kind: 'passive' | 'active';
  category: CardCategory;
  icon: CardIcon;
  /** Rules text shown on the card. */
  text: string;
  /** Uses for active cards. */
  uses?: number;
  /** Passive rule changes. */
  rules?: (r: SideRules) => void;
  /** One-time effect when drafted. */
  onAcquire?: (pos: Position, color: Color) => void;
  /** Valid target squares for an active card. */
  targets?: (pos: Position, color: Color) => number[];
  /** Apply an active card to a target square (journaled through the position's setters). */
  apply?: (pos: Position, color: Color, sq: number) => void;
  /** Whether the card may be offered. */
  offerable?: (ctx: DraftContext) => boolean;
  /** Draft value for the AI, in centipawns. */
  aiValue: (ctx: DraftContext) => number;
  /** Hint shown while choosing a target. */
  targetHint?: string;
  /** False if the card makes no sense in a roguelike run (effects that only fire mid-game). */
  run?: boolean;
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

const backRank = (c: Color): number => (c === WHITE ? 0 : 7);
const pawnRank = (c: Color): number => (c === WHITE ? 1 : 6);

function squaresWhere(pred: (sq: number) => boolean): number[] {
  const out: number[] = [];
  for (let sq = 0; sq < 64; sq++) if (pred(sq)) out.push(sq);
  return out;
}

const own = (pos: Position, sq: number, color: Color, kind?: number): boolean => {
  const c = pos.board[sq];
  return c !== 0 && c >> 4 === color && (kind === undefined || (c & 15) === kind);
};
const enemy = (pos: Position, sq: number, color: Color): boolean => {
  const c = pos.board[sq];
  return c !== 0 && c >> 4 !== color;
};
const freeSquare = (pos: Position, sq: number): boolean => pos.board[sq] === 0 && pos.terrain[sq] === T_NONE && sq !== pos.ep;
const emptyOnRank = (pos: Position, rank: number): number[] => squaresWhere((sq) => sq >> 3 === rank && freeSquare(pos, sq));
const middleSquares = (pos: Position): number[] => squaresWhere((sq) => (sq >> 3) >= 2 && (sq >> 3) <= 5 && freeSquare(pos, sq));
const count = (pos: Position, color: Color, kind: number): number => pos.countPieces(color, kind);

const VALUE: Record<number, number> = {
  [PAWN]: 1,
  [KNIGHT]: 3,
  [BISHOP]: 3.2,
  [ROOK]: 5,
  [QUEEN]: 9,
  [ARCHBISHOP]: 7.5,
  [CHANCELLOR]: 8.5,
};

/** Most valuable lost kind among `kinds`, or 0. */
function bestLost(pos: Position, color: Color, kinds: number[]): number {
  let best = 0;
  for (const k of kinds) if (pos.lost[color * 16 + k] > 0 && (!best || VALUE[k] > VALUE[best])) best = k;
  return best;
}

/** Summoned pieces cannot move on the turn they arrive (they thaw at the end of it). */
function summon(pos: Position, color: Color, sq: number, kind: number): void {
  pos.setPiece(sq, kind | (color << 4));
  pos.setFlags(sq, F_FROZEN);
}

function revive(pos: Position, color: Color, sq: number, kinds: number[]): void {
  const kind = bestLost(pos, color, kinds);
  if (!kind) return;
  pos.addLost(color, kind, -1);
  summon(pos, color, sq, kind);
}

/** Put a new piece on the colour's third rank (fourth if full), preferring the given files. */
function deploy(pos: Position, color: Color, kind: number, files: number[]): void {
  for (const rel of [2, 3]) {
    const rank = color === WHITE ? rel : 7 - rel;
    for (const f of files) {
      const sq = rank * 8 + f;
      if (freeSquare(pos, sq)) {
        pos.setPiece(sq, kind | (color << 4));
        return;
      }
    }
  }
}

const ALL_FILES = [3, 4, 2, 5, 1, 6, 0, 7];

const fixed =
  (v: number) =>
  (): number =>
    v;

// -------------------------------------------------------------------------
// Cards
// -------------------------------------------------------------------------

export const CARDS: readonly CardDef[] = [
  // ---------------------------------------------------------------- Silver
  {
    id: 'camel_knight',
    name: '낙타 도약',
    tier: 'silver',
    kind: 'passive',
    category: 'piece',
    icon: 'camel',
    text: '나이트가 (3,1) 모양으로도 도약해 이동하고 잡을 수 있습니다.',
    rules: (r) => {
      r.knightCamel = true;
    },
    aiValue: (c) => 70 + 45 * count(c.pos, c.color, KNIGHT),
  },
  {
    id: 'bishop_step',
    name: '성직자의 발걸음',
    tier: 'silver',
    kind: 'passive',
    category: 'piece',
    icon: 'cross',
    text: '비숍이 상하좌우로 한 칸 이동하고 잡을 수 있습니다. 비숍이 다른 색 칸으로 건너갈 수 있게 됩니다.',
    rules: (r) => {
      r.bishopStep = true;
    },
    aiValue: (c) => 70 + 50 * count(c.pos, c.color, BISHOP),
  },
  {
    id: 'rook_step',
    name: '망루 계단',
    tier: 'silver',
    kind: 'passive',
    category: 'piece',
    icon: 'tower',
    text: '룩이 대각선으로 한 칸 이동하고 잡을 수 있습니다.',
    rules: (r) => {
      r.rookStep = true;
    },
    aiValue: (c) => 60 + 45 * count(c.pos, c.color, ROOK),
  },
  {
    id: 'pawn_sidestep',
    name: '측면 행군',
    tier: 'silver',
    kind: 'passive',
    category: 'pawn',
    icon: 'sidestep',
    text: '폰이 좌우로 한 칸 이동할 수 있습니다. 이 이동으로는 잡을 수 없습니다.',
    rules: (r) => {
      r.pawnSidestep = true;
    },
    aiValue: (c) => 40 + 9 * count(c.pos, c.color, PAWN),
  },
  {
    id: 'pawn_charge',
    name: '돌격 행군',
    tier: 'silver',
    kind: 'passive',
    category: 'pawn',
    icon: 'charge',
    text: '폰이 어느 줄에서든 앞의 두 칸이 비어 있으면 두 칸 전진할 수 있습니다.',
    rules: (r) => {
      r.pawnCharge = true;
    },
    aiValue: (c) => 40 + 9 * count(c.pos, c.color, PAWN),
  },
  {
    id: 'pawn_pike',
    name: '창병',
    tier: 'silver',
    kind: 'passive',
    category: 'pawn',
    icon: 'pike',
    text: '폰이 바로 앞 칸의 상대 기물도 잡을 수 있습니다.',
    rules: (r) => {
      r.pawnPike = true;
    },
    aiValue: (c) => 45 + 9 * count(c.pos, c.color, PAWN),
  },
  {
    id: 'pawn_retreat',
    name: '전술적 후퇴',
    tier: 'silver',
    kind: 'passive',
    category: 'pawn',
    icon: 'retreat',
    text: '폰이 뒤로 한 칸 물러날 수 있습니다. 잡을 수는 없고, 첫째 줄로는 물러날 수 없습니다.',
    rules: (r) => {
      r.pawnRetreat = true;
    },
    aiValue: (c) => 35 + 8 * count(c.pos, c.color, PAWN),
  },
  {
    id: 'reinforce',
    name: '증원',
    tier: 'silver',
    kind: 'active',
    uses: 2,
    category: 'summon',
    icon: 'pawn-plus',
    text: '폰 시작 줄(백은 2번째, 흑은 7번째 줄)의 빈 칸에 폰을 하나 소환합니다. 소환된 폰은 그 턴에는 움직일 수 없습니다.',
    targetHint: '폰을 소환할 칸을 고르세요.',
    targets: (pos, color) => emptyOnRank(pos, pawnRank(color)),
    apply: (pos, color, sq) => summon(pos, color, sq, PAWN),
    aiValue: (c) => 60 + 25 * Math.min(2, emptyOnRank(c.pos, pawnRank(c.color)).length),
  },
  {
    id: 'sniper',
    name: '저격',
    tier: 'silver',
    kind: 'active',
    uses: 1,
    category: 'tactic',
    icon: 'crosshair',
    text: '상대 폰 하나를 제거합니다. 보호막이 있는 폰이면 보호막만 깨집니다.',
    targetHint: '제거할 상대 폰을 고르세요.',
    targets: (pos, color) => squaresWhere((sq) => own(pos, sq, (color ^ 1) as Color, PAWN)),
    apply: (pos, _color, sq) => {
      pos.destroy(sq);
    },
    aiValue: fixed(110),
  },
  {
    id: 'shield',
    name: '보호막',
    tier: 'silver',
    kind: 'active',
    uses: 1,
    category: 'defense',
    icon: 'shield',
    text: '킹이 아닌 아군 기물 하나에 보호막을 씌웁니다. 보호막은 그 기물이 처음 제거될 때 대신 깨지고, 잡으려던 기물은 제자리로 돌아갑니다.',
    targetHint: '보호막을 씌울 아군 기물을 고르세요.',
    targets: (pos, color) =>
      squaresWhere((sq) => own(pos, sq, color) && (pos.board[sq] & 15) !== KING && !(pos.flags[sq] & F_SHIELD)),
    apply: (pos, _color, sq) => pos.setFlags(sq, pos.flags[sq] | F_SHIELD),
    aiValue: fixed(120),
  },
  {
    id: 'barricade',
    name: '바리케이드',
    tier: 'silver',
    kind: 'active',
    uses: 2,
    category: 'tactic',
    icon: 'wall',
    text: '3~6번째 줄의 빈 칸에 바리케이드를 세웁니다. 바리케이드는 모든 기물의 길을 막지만, 기물이 잡듯이 들어가 부술 수 있습니다.',
    targetHint: '바리케이드를 세울 칸을 고르세요.',
    targets: (pos) => middleSquares(pos),
    apply: (pos, _color, sq) => pos.setTerrain(sq, T_WALL),
    aiValue: fixed(75),
  },
  {
    id: 'knight_oath',
    name: '기사의 맹세',
    tier: 'silver',
    kind: 'passive',
    category: 'defense',
    icon: 'oath',
    text: '나이트가 기물을 잡으면 보호막을 얻습니다.',
    rules: (r) => {
      r.knightOath = true;
    },
    aiValue: (c) => 40 + 35 * count(c.pos, c.color, KNIGHT),
  },
  {
    id: 'vanguard',
    name: '선봉대',
    tier: 'silver',
    kind: 'passive',
    category: 'summon',
    icon: 'vanguard',
    text: '즉시 자기 진영 3번째 줄의 빈 칸에 나이트를 하나 배치합니다.',
    onAcquire: (pos, color) => deploy(pos, color, KNIGHT, [2, 5, 1, 6, 3, 4, 0, 7]),
    aiValue: fixed(240),
  },
  {
    id: 'investment',
    name: '투자',
    tier: 'silver',
    kind: 'passive',
    category: 'special',
    icon: 'coin',
    text: '다음 증강 선택지가 한 단계 높은 등급으로 나옵니다.',
    offerable: (c) => c.round < 3,
    aiValue: (c) => (c.round === 1 ? 105 : 85),
    run: false,
  },

  // ------------------------------------------------------------------ Gold
  {
    id: 'ordain',
    name: '대주교 서품',
    tier: 'gold',
    kind: 'active',
    uses: 1,
    category: 'piece',
    icon: 'mitre',
    text: '아군 비숍 하나를 대주교(비숍 + 나이트 행마)로 승격합니다.',
    targetHint: '대주교로 승격할 비숍을 고르세요.',
    targets: (pos, color) => squaresWhere((sq) => own(pos, sq, color, BISHOP)),
    apply: (pos, color, sq) => pos.setPiece(sq, ARCHBISHOP | (color << 4)),
    offerable: (c) => count(c.pos, c.color, BISHOP) > 0,
    aiValue: fixed(330),
  },
  {
    id: 'appoint',
    name: '재상 임명',
    tier: 'gold',
    kind: 'active',
    uses: 1,
    category: 'piece',
    icon: 'scroll',
    text: '아군 룩 하나를 재상(룩 + 나이트 행마)으로 승격합니다.',
    targetHint: '재상으로 승격할 룩을 고르세요.',
    targets: (pos, color) => squaresWhere((sq) => own(pos, sq, color, ROOK)),
    apply: (pos, color, sq) => pos.setPiece(sq, CHANCELLOR | (color << 4)),
    offerable: (c) => count(c.pos, c.color, ROOK) > 0,
    aiValue: fixed(330),
  },
  {
    id: 'warrior_king',
    name: '전사왕',
    tier: 'gold',
    kind: 'passive',
    category: 'piece',
    icon: 'king-sword',
    text: '킹이 모든 방향으로 두 칸까지 이동하고 잡을 수 있습니다. 사이 칸이 막혀 있으면 두 칸은 갈 수 없습니다.',
    rules: (r) => {
      r.kingRange = 2;
    },
    aiValue: (c) => (c.round === 1 ? 170 : 230),
  },
  {
    id: 'royal_aegis',
    name: '왕관의 가호',
    tier: 'gold',
    kind: 'passive',
    category: 'defense',
    icon: 'crown-shield',
    text: '즉시 킹이 보호막을 얻습니다. 킹이 잡힐 때 보호막이 대신 깨지고, 잡으려던 기물은 제자리로 돌아갑니다.',
    onAcquire: (pos, color) => {
      const k = pos.kingSq[color];
      if (k >= 0) pos.setFlags(k, pos.flags[k] | F_SHIELD);
    },
    offerable: (c) => {
      const k = c.pos.kingSq[c.color];
      return k >= 0 && !(c.pos.flags[k] & F_SHIELD);
    },
    aiValue: fixed(280),
  },
  {
    id: 'freeze',
    name: '동결',
    tier: 'gold',
    kind: 'active',
    uses: 2,
    category: 'tactic',
    icon: 'snowflake',
    text: '킹이 아닌 상대 기물 하나를 얼립니다. 얼어붙은 기물은 상대의 다음 턴 동안 움직이거나 잡을 수 없습니다.',
    targetHint: '얼릴 상대 기물을 고르세요.',
    targets: (pos, color) =>
      squaresWhere((sq) => enemy(pos, sq, color) && (pos.board[sq] & 15) !== KING && !(pos.flags[sq] & F_FROZEN)),
    apply: (pos, _color, sq) => pos.setFlags(sq, pos.flags[sq] | F_FROZEN),
    aiValue: fixed(230),
  },
  {
    id: 'martyr_pawns',
    name: '순교자',
    tier: 'gold',
    kind: 'passive',
    category: 'pawn',
    icon: 'flame',
    text: '당신의 폰을 잡은 기물은 그 자리에서 함께 제거됩니다. 킹은 예외입니다.',
    rules: (r) => {
      r.martyrPawns = true;
    },
    aiValue: (c) => 90 + 28 * count(c.pos, c.color, PAWN),
  },
  {
    id: 'conscript',
    name: '징집',
    tier: 'gold',
    kind: 'active',
    uses: 1,
    category: 'summon',
    icon: 'horse',
    text: '첫째 줄(백은 1번째, 흑은 8번째 줄)의 빈 칸에 나이트를 하나 소환합니다. 소환된 나이트는 그 턴에는 움직일 수 없습니다.',
    targetHint: '나이트를 소환할 칸을 고르세요.',
    targets: (pos, color) => emptyOnRank(pos, backRank(color)),
    apply: (pos, color, sq) => summon(pos, color, sq, KNIGHT),
    aiValue: (c) => (c.round === 1 ? 250 : 290),
  },
  {
    id: 'early_promotion',
    name: '조기 승진',
    tier: 'gold',
    kind: 'passive',
    category: 'pawn',
    icon: 'star-up',
    text: '폰이 상대 진영 셋째 줄(백은 6번째, 흑은 3번째 줄)에 도착하면 승진합니다.',
    rules: (r) => {
      r.promoRank = Math.min(r.promoRank, 5);
    },
    offerable: (c) => c.pos.rules[c.color].promoRank > 5,
    aiValue: (c) => 120 + 18 * count(c.pos, c.color, PAWN),
  },
  {
    id: 'resurrect',
    name: '부활',
    tier: 'gold',
    kind: 'active',
    uses: 1,
    category: 'summon',
    icon: 'phoenix',
    text: '잡힌 아군 나이트·비숍·룩 중 가장 강한 기물 하나를 첫째 줄 빈 칸에 되살립니다. 되살아난 기물은 그 턴에는 움직일 수 없습니다.',
    targetHint: '기물을 되살릴 칸을 고르세요.',
    targets: (pos, color) => (bestLost(pos, color, [KNIGHT, BISHOP, ROOK]) ? emptyOnRank(pos, backRank(color)) : []),
    apply: (pos, color, sq) => revive(pos, color, sq, [KNIGHT, BISHOP, ROOK]),
    aiValue: (c) => (bestLost(c.pos, c.color, [ROOK]) ? 320 : bestLost(c.pos, c.color, [KNIGHT, BISHOP]) ? 260 : 190),
  },
  {
    id: 'minefield',
    name: '지뢰 매설',
    tier: 'gold',
    kind: 'active',
    uses: 2,
    category: 'tactic',
    icon: 'mine',
    text: '3~6번째 줄의 빈 칸에 함정을 설치합니다. 함정 칸에 들어온 상대 기물은 제거되고, 킹이 들어오면 함정만 사라집니다.',
    targetHint: '함정을 설치할 칸을 고르세요.',
    targets: (pos) => middleSquares(pos),
    apply: (pos, color, sq) => pos.setTerrain(sq, trapOf(color)),
    aiValue: fixed(170),
  },
  {
    id: 'royal_guard',
    name: '근위대',
    tier: 'gold',
    kind: 'passive',
    category: 'defense',
    icon: 'guard',
    text: '즉시 킹과 맞닿은 아군 기물 모두에게 보호막을 씌웁니다.',
    onAcquire: (pos, color) => {
      const k = pos.kingSq[color];
      if (k < 0) return;
      for (let sq = 0; sq < 64; sq++) {
        if (sq === k || !own(pos, sq, color)) continue;
        if (Math.abs((sq & 7) - (k & 7)) <= 1 && Math.abs((sq >> 3) - (k >> 3)) <= 1) {
          pos.setFlags(sq, pos.flags[sq] | F_SHIELD);
        }
      }
    },
    aiValue: (c) => {
      const k = c.pos.kingSq[c.color];
      let n = 0;
      for (let sq = 0; sq < 64; sq++) {
        if (k < 0 || sq === k || !own(c.pos, sq, c.color) || c.pos.flags[sq] & F_SHIELD) continue;
        if (Math.abs((sq & 7) - (k & 7)) <= 1 && Math.abs((sq >> 3) - (k >> 3)) <= 1) n++;
      }
      return 40 + 55 * n;
    },
  },

  {
    id: 'mercenary_rook',
    name: '용병 룩',
    tier: 'gold',
    kind: 'passive',
    category: 'summon',
    icon: 'mercenary',
    text: '즉시 자기 진영 3번째 줄의 빈 칸에 룩을 하나 배치합니다.',
    onAcquire: (pos, color) => deploy(pos, color, ROOK, [0, 7, 1, 6, 2, 5, 3, 4]),
    aiValue: fixed(400),
  },

  // ----------------------------------------------------------------- Prism
  {
    id: 'amazon',
    name: '아마존의 각성',
    tier: 'prism',
    kind: 'passive',
    category: 'piece',
    icon: 'amazon',
    text: '당신의 퀸이 나이트처럼도 움직일 수 있습니다. 앞으로 승진하는 퀸도 마찬가지입니다.',
    rules: (r) => {
      r.queenKnight = true;
    },
    aiValue: (c) => 240 + 260 * Math.min(1, count(c.pos, c.color, QUEEN)),
  },
  {
    id: 'king_of_the_hill',
    name: '언덕의 왕',
    tier: 'prism',
    kind: 'passive',
    category: 'victory',
    icon: 'hill',
    text: '당신의 킹이 중앙 네 칸(d4·e4·d5·e5) 중 하나에 들어서면 즉시 승리합니다.',
    rules: (r) => {
      r.kingOfTheHill = true;
    },
    aiValue: fixed(480),
  },
  {
    id: 'three_check',
    name: '세 번의 체크',
    tier: 'prism',
    kind: 'passive',
    category: 'victory',
    icon: 'check3',
    text: '상대 킹을 세 번 체크하면 승리합니다. 체크는 당신이 수를 둔 직후 상대 킹을 공격하고 있으면 한 번으로 셉니다.',
    rules: (r) => {
      r.threeCheck = true;
    },
    aiValue: fixed(470),
  },
  {
    id: 'cavalry_order',
    name: '기마 기사단',
    tier: 'prism',
    kind: 'passive',
    category: 'piece',
    icon: 'cavalry',
    text: '즉시 보유한 모든 비숍이 대주교(비숍 + 나이트 행마)로 승격합니다.',
    onAcquire: (pos, color) => {
      for (let sq = 0; sq < 64; sq++) if (own(pos, sq, color, BISHOP)) pos.setPiece(sq, ARCHBISHOP | (color << 4));
    },
    offerable: (c) => count(c.pos, c.color, BISHOP) > 0,
    aiValue: (c) => 120 + 330 * count(c.pos, c.color, BISHOP),
  },
  {
    id: 'mass_conscription',
    name: '총동원령',
    tier: 'prism',
    kind: 'passive',
    category: 'summon',
    icon: 'horde',
    text: '즉시 폰 시작 줄의 빈 칸을 모두 폰으로 채웁니다.',
    onAcquire: (pos, color) => {
      for (const sq of emptyOnRank(pos, pawnRank(color))) pos.setPiece(sq, PAWN | (color << 4));
    },
    offerable: (c) => emptyOnRank(c.pos, pawnRank(c.color)).length >= 3,
    run: false,
    aiValue: (c) => 95 * emptyOnRank(c.pos, pawnRank(c.color)).length,
  },
  {
    id: 'revival',
    name: '부활의 성배',
    tier: 'prism',
    kind: 'active',
    uses: 1,
    category: 'summon',
    icon: 'grail',
    text: '잡힌 아군 기물 중 가장 강한 기물(킹과 폰 제외) 하나를 첫째 줄 빈 칸에 되살립니다. 되살아난 기물은 그 턴에는 움직일 수 없습니다.',
    targetHint: '기물을 되살릴 칸을 고르세요.',
    targets: (pos, color) =>
      bestLost(pos, color, [QUEEN, CHANCELLOR, ARCHBISHOP, ROOK, BISHOP, KNIGHT]) ? emptyOnRank(pos, backRank(color)) : [],
    apply: (pos, color, sq) => revive(pos, color, sq, [QUEEN, CHANCELLOR, ARCHBISHOP, ROOK, BISHOP, KNIGHT]),
    aiValue: (c) => (bestLost(c.pos, c.color, [QUEEN]) ? 620 : 400),
  },
  {
    id: 'coronation',
    name: '대관식',
    tier: 'prism',
    kind: 'passive',
    category: 'pawn',
    icon: 'crown-up',
    text: '폰이 상대 진영 넷째 줄(백은 5번째, 흑은 4번째 줄)에 도착하면 승진합니다.',
    rules: (r) => {
      r.promoRank = Math.min(r.promoRank, 4);
    },
    offerable: (c) => c.pos.rules[c.color].promoRank > 4,
    aiValue: (c) => 220 + 35 * count(c.pos, c.color, PAWN),
  },
  {
    id: 'divine_aegis',
    name: '신성한 가호',
    tier: 'prism',
    kind: 'passive',
    category: 'defense',
    icon: 'halo',
    text: '즉시 킹을 제외한 모든 아군 기물이 보호막을 얻습니다.',
    onAcquire: (pos, color) => {
      for (let sq = 0; sq < 64; sq++) {
        if (own(pos, sq, color) && (pos.board[sq] & 15) !== KING) pos.setFlags(sq, pos.flags[sq] | F_SHIELD);
      }
    },
    aiValue: (c) => {
      let v = 0;
      for (let sq = 0; sq < 64; sq++) {
        const code = c.pos.board[sq];
        if (code && code >> 4 === c.color && (code & 15) !== KING && !(c.pos.flags[sq] & F_SHIELD)) v += (code & 15) === PAWN ? 25 : 55;
      }
      return v;
    },
  },
  {
    id: 'breakthrough',
    name: '돌파',
    tier: 'prism',
    kind: 'passive',
    category: 'victory',
    icon: 'flag',
    text: '당신의 폰이 승진하면 즉시 승리합니다.',
    rules: (r) => {
      r.breakthrough = true;
    },
    offerable: (c) => count(c.pos, c.color, PAWN) > 0,
    aiValue: (c) => 260 + 40 * count(c.pos, c.color, PAWN),
  },
  {
    id: 'second_queen',
    name: '두 번째 여왕',
    tier: 'prism',
    kind: 'passive',
    category: 'summon',
    icon: 'twin-queen',
    text: '즉시 자기 진영 3번째 줄의 빈 칸에 퀸을 하나 배치합니다.',
    onAcquire: (pos, color) => deploy(pos, color, QUEEN, ALL_FILES),
    aiValue: fixed(620),
  },
];

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));

export function cardById(id: string): CardDef {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`Unknown card: ${id}`);
  return c;
}

export const hasCard = (id: string): boolean => BY_ID.has(id);

/** Cards that can appear in a roguelike run. */
export const RUN_CARDS: readonly CardDef[] = CARDS.filter((c) => c.run !== false);
