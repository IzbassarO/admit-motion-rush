import { describe, expect, it } from 'vitest';
import { performanceTitle } from '../rank';
import { COACH_BONUS, GameSession, type GameEvent } from '../session';

const guardOnly = () => 0; // rng → always GUARD
const hitOf = (events: GameEvent[]) => events.find((e) => e.type === 'hit') as Extract<GameEvent, { type: 'hit' }> | undefined;

function started() {
  const s = new GameSession(60_000, guardOnly);
  s.start(0);
  const [p] = s.update(900, []);
  expect(p.type).toBe('prompt');
  return s;
}

describe('correction bonus', () => {
  it('partial → same gesture completed → bonus exactly once', () => {
    const s = started();
    s.update(1000, []);
    s.markCoached();
    s.markCoached(); // repeated coaching on the same prompt must not stack
    const scoreBefore = s.score;
    const hit = hitOf(s.update(1600, ['GUARD']))!;
    expect(hit.corrected).toBe(true);
    expect(hit.coachBonus).toBe(COACH_BONUS);
    expect(s.score - scoreBefore).toBe(hit.points + COACH_BONUS);
    expect(s.correctionsMade).toBe(1);

    // next prompt without coaching → no bonus
    s.update(2300, []); // new prompt
    const hit2 = hitOf(s.update(2800, ['GUARD']))!;
    expect(hit2.corrected).toBe(false);
    expect(hit2.coachBonus).toBe(0);
    expect(s.correctionsMade).toBe(1);
  });

  it('partial → timeout → no bonus, and the flag does not leak into the next prompt', () => {
    const s = started();
    s.markCoached();
    const miss = s.update(900 + 3200, []);
    expect(miss[0].type).toBe('miss');
    s.update(900 + 3200 + 700, []); // next prompt
    const hit = hitOf(s.update(900 + 3200 + 1200, ['GUARD']))!;
    expect(hit.corrected).toBe(false);
    expect(s.correctionsMade).toBe(0);
  });

  it('partial GUARD → PUNCH performed while GUARD requested → wrong move, no bonus', () => {
    const s = started();
    s.markCoached();
    const [e] = s.update(1500, ['PUNCH']);
    expect(e.type).toBe('wrong');
    expect(s.correctionsMade).toBe(0);
    expect(s.score).toBe(0);
  });

  it('coaching reported with no active prompt is ignored', () => {
    const s = new GameSession(60_000, guardOnly);
    s.start(0);
    s.markCoached(); // before first prompt
    s.update(900, []);
    const hit = hitOf(s.update(1300, ['GUARD']))!;
    expect(hit.corrected).toBe(false);
  });

  it('reports correctionsMade in results', () => {
    const s = started();
    s.markCoached();
    s.update(1500, ['GUARD']);
    expect(s.results(null).correctionsMade).toBe(1);
  });
});

describe('tracking loss', () => {
  it('never turns into a miss while the pose is lost', () => {
    const s = started(); // prompt at 900, window 3200 ms
    // tracking lost for 5 s — far longer than the window
    for (let t = 1000; t <= 6000; t += 100) expect(s.update(t, [], false)).toEqual([]);
    expect(s.snapshot(6000).prompt).not.toBeNull();
    // tracking back: the remaining window still applies (≈100 ms used before loss)
    expect(s.update(6100, [], true)).toEqual([]);
    const hit = hitOf(s.update(7000, ['GUARD'], true))!;
    expect(hit.reactionMs).toBeLessThan(1500);
  });

  it('times out normally once tracking is back', () => {
    const s = started();
    for (let t = 1000; t <= 2000; t += 100) s.update(t, [], false);
    let missed = false;
    for (let t = 2100; t <= 6000 && !missed; t += 100) missed = s.update(t, []).some((e) => e.type === 'miss');
    expect(missed).toBe(true);
  });
});

describe('performance title', () => {
  it('uses deterministic thresholds', () => {
    expect(performanceTitle({ correct: 20, accuracy: 0.9 }).title).toBe('Motion Master');
    expect(performanceTitle({ correct: 14, accuracy: 0.75 }).title).toBe('Reflex Pro');
    expect(performanceTitle({ correct: 7, accuracy: 0.55 }).title).toBe('Motion Ready');
    expect(performanceTitle({ correct: 2, accuracy: 1 }).title).toBe('Reflex Rookie');
    expect(performanceTitle({ correct: 30, accuracy: 0.4 }).title).toBe('Reflex Rookie');
  });
});
