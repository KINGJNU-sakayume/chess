import { levelOf } from '../../engine/ai/think';
import { COLOR_NAME, type Color } from '../../engine/game/types';
import type { MatchState, ResultReason } from '../../engine/match/match';

export function sideName(m: MatchState, c: Color): string {
  if (m.setup.mode === 'ai') return c === m.setup.human ? '나' : `AI · ${levelOf(m.setup.level).name}`;
  return COLOR_NAME[c];
}

const REASON_TEXT: Record<ResultReason, string> = {
  king: '킹을 잡았습니다',
  hill: '킹이 언덕(중앙)에 올랐습니다',
  three_check: '상대 킹을 세 번 체크했습니다',
  breakthrough: '폰이 승진해 돌파했습니다',
  no_moves: '둘 수 있는 수가 없어 졌습니다',
  resign: '기권했습니다',
  fifty: '50수 동안 잡기도 폰 이동도 없었습니다',
  repetition: '같은 국면이 세 번 반복되었습니다',
  material: '양쪽 모두 킹만 남았습니다',
};

export function resultTitle(m: MatchState): string {
  const r = m.result;
  if (!r) return '';
  if (r.winner === -1) return '무승부';
  if (m.setup.mode === 'ai') return r.winner === m.setup.human ? '승리!' : '패배';
  return `${COLOR_NAME[r.winner]} 승리!`;
}

export function resultDetail(m: MatchState): string {
  const r = m.result;
  if (!r) return '';
  if (r.winner === -1) return REASON_TEXT[r.reason];
  const loser = (r.winner ^ 1) as Color;
  if (r.reason === 'resign') return `${sideName(m, loser)}(${COLOR_NAME[loser]})가 기권했습니다`;
  if (r.reason === 'no_moves') return `${sideName(m, loser)}(${COLOR_NAME[loser]})가 둘 수 있는 수가 없습니다`;
  return `${sideName(m, r.winner)}(${COLOR_NAME[r.winner]}): ${REASON_TEXT[r.reason]}`;
}
