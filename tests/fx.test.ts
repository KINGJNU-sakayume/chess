import { describe, expect, it } from 'vitest';
import { deriveFx, FX_STEP, popupLabel } from '../src/state/fx';
import { visualFrames } from '../src/state/sessionStore';
import { applyPlayerAction } from '../src/engine/encounters/flow';
import { encounter, play, sq } from './helpers';

describe('juice (F5): effects derived from displayed frames', () => {
  const base = () =>
    encounter({
      player: [
        ['king', 'e1'],
        ['bishop', 'c1'],
        ['bishop', 'f1'],
        ['pawn', 'b7'],
      ],
      enemy: [
        ['king', 'e8'],
        ['knight', 'h6'],
      ],
      upgrades: ['bishop_long_cathedral'],
    });

  it('a long Bishop capture draws a light trail, a capture burst, the trigger popup and the extra action', () => {
    const s0 = base();
    const s1 = play(s0, 'c1', 'h6');
    const fx = deriveFx(s0, s1);
    expect(fx.find((e) => e.kind === 'trail')).toMatchObject({ tone: 'bishop', from: sq('c1'), to: sq('h6') });
    expect(fx.find((e) => e.kind === 'capture')).toMatchObject({ sq: sq('h6') });
    const popup = fx.find((e) => e.kind === 'popup' && e.text?.startsWith('Long Cathedral'));
    expect(popup).toBeDefined();
    expect(fx.find((e) => e.kind === 'extra')).toMatchObject({ text: '+1 action', sq: sq('h6') });
    // Chained effects fire one after another, in resolution (log) order: the move trigger, then the capture.
    const capture = fx.find((e) => e.kind === 'capture')!;
    expect(capture.delay).toBeGreaterThanOrEqual(popup!.delay + FX_STEP);
  });

  it('promotion flashes the board and transforms the piece', () => {
    const s0 = base();
    const s1 = play(s0, 'b7', 'b8', { promotion: 'queen' });
    const fx = deriveFx(s0, s1);
    expect(fx.some((e) => e.kind === 'flash' && e.tone === 'gold')).toBe(true);
    expect(fx.find((e) => e.kind === 'promotion')).toMatchObject({ sq: sq('b8'), side: 'player' });
  });

  it('undo and unrelated states produce no effects', () => {
    const s0 = base();
    const s1 = play(s0, 'c1', 'h6');
    expect(deriveFx(s1, s0)).toEqual([]);
    expect(deriveFx(s0, s0)).toEqual([]);
    expect(deriveFx(s0, encounter({ player: [['king', 'e1']], enemy: [['king', 'e8']], config: { id: 'other' } }))).toEqual([]);
  });

  it('frame playback keeps only frames that change what the board shows', () => {
    const s0 = base();
    const res = applyPlayerAction(s0, { type: 'move', pieceId: s0.board[sq('c1')]!, to: sq('h6') }, { frames: true });
    const frames = visualFrames(s0, res.frames);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.length).toBeLessThanOrEqual(res.frames.length);
  });

  it('boss announcements become a banner', () => {
    const s0 = base();
    const s1 = { ...s0, log: [...s0.log, { id: s0.log.length ? s0.log[s0.log.length - 1].id + 1 : 0, turn: 1, depth: 0, kind: 'enemy' as const, text: 'The Tyrant Queen stumbles on a broken route — her Ward shatters', sqs: [sq('d4')] }] };
    const fx = deriveFx(s0, s1);
    expect(fx).toEqual([expect.objectContaining({ kind: 'popup', tone: 'enemy', text: 'The Tyrant Queen stumbles on a broken route — her Ward shatters' })]);
    expect(fx[0].sq).toBeUndefined();
  });

  it('popups keep the upgrade name only', () => {
    expect(popupLabel('Long Cathedral II: extra action (other Bishop)')).toBe('Long Cathedral II');
    expect(popupLabel('A very long trigger description without any colon at all')).toHaveLength(26);
  });
});
