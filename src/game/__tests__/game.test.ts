import { describe, expect, it } from 'vitest';
import { loadPersonalBest, submitScore } from '../personalBest';
import { comboMultiplier, pointsForHit, reactionWindowMs } from '../scoring';
import { GameSession } from '../session';

describe('scoring', () => {
  it('rewards faster reactions', () => {
    expect(pointsForHit(300, 3000, 1)).toBeGreaterThan(pointsForHit(2000, 3000, 1));
    expect(pointsForHit(100, 3000, 1)).toBe(250);
    expect(pointsForHit(3000, 3000, 1)).toBe(100);
  });

  it('applies a capped combo multiplier', () => {
    expect(comboMultiplier(1)).toBe(1);
    expect(comboMultiplier(3)).toBeCloseTo(1.2);
    expect(comboMultiplier(50)).toBeCloseTo(2);
    expect(pointsForHit(100, 3000, 3)).toBe(300);
  });

  it('shrinks the reaction window over the round', () => {
    expect(reactionWindowMs(0, 60000)).toBe(3200);
    expect(reactionWindowMs(60000, 60000)).toBe(1900);
    expect(reactionWindowMs(30000, 60000)).toBe(2550);
  });
});

describe('GameSession', () => {
  const fixedRng = () => 0; // always GUARD (first) → re-roll → GUARD

  it('runs prompts, hits, wrong moves, misses and ends after the duration', () => {
    const s = new GameSession(10_000, fixedRng);
    s.start(0);
    expect(s.update(500, [])).toEqual([]);
    const [p] = s.update(900, []);
    expect(p.type).toBe('prompt');

    const hit = s.update(1500, ['GUARD']);
    expect(hit[0]).toMatchObject({ type: 'hit', reactionMs: 600, combo: 1 });
    expect(s.score).toBeGreaterThan(100);

    s.update(2200, []); // next prompt after the gap
    const wrong = s.update(2500, ['DUCK']);
    expect(wrong[0]).toMatchObject({ type: 'wrong', got: 'DUCK' });
    expect(s.combo).toBe(0);

    const prompt3 = s.update(3200, []);
    expect(prompt3[0].type).toBe('prompt');
    const window = (prompt3[0] as { prompt: { windowMs: number } }).prompt.windowMs;
    const miss = s.update(3200 + window, []);
    expect(miss[0].type).toBe('miss');

    expect(s.update(10_000, [])).toEqual([{ type: 'end' }]);
    const r = s.results(null);
    expect(r.correct).toBe(1);
    expect(r.attempts).toBe(3);
    expect(r.accuracy).toBeCloseTo(1 / 3);
    expect(r.avgReactionMs).toBe(600);
    expect(r.bestCombo).toBe(1);
    expect(r.perGesture.GUARD).toEqual({ hits: 1, prompts: 3 });
  });

  it('freezes the clock while paused', () => {
    const s = new GameSession(10_000, fixedRng);
    s.start(0);
    s.update(900, []); // prompt shown at 900
    s.pause(1000);
    expect(s.update(5000, ['GUARD'])).toEqual([]);
    s.resume(6000);
    expect(s.snapshot(6000).timeLeftMs).toBe(9000);
    const [hit] = s.update(6100, ['GUARD']);
    expect(hit).toMatchObject({ type: 'hit', reactionMs: 200 });
  });
});

describe('personal best', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  const pb = (score: number) => ({ score, accuracy: 1, bestCombo: 1, date: '2026-01-01' });

  it('stores only improvements', () => {
    const store = mem();
    expect(loadPersonalBest(store)).toBeNull();
    expect(submitScore(pb(500), store).isNew).toBe(true);
    expect(submitScore(pb(300), store)).toMatchObject({ isNew: false, best: { score: 500 } });
    expect(submitScore(pb(900), store).isNew).toBe(true);
    expect(loadPersonalBest(store)?.score).toBe(900);
  });

  it('survives corrupt or unavailable storage', () => {
    const store = mem();
    store.setItem('motionrush.personalBest.v1', '{not json');
    expect(loadPersonalBest(store)).toBeNull();
    expect(submitScore(pb(10), null).isNew).toBe(true);
  });
});
