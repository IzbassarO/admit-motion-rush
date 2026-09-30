import { describe, expect, it } from 'vitest';
import { assessPoseQuality } from '../calibration';
import { CoachSmoother, coachMessage, MistakeTracker, type CoachMessage } from '../errorCoach';
import { GestureEngine, TIMING } from '../gestureEngine';
import { evaluateGuard } from '../guardDetector';
import { LM, type FormIssue } from '../poseTypes';
import { ASPECT, CALIB, makePose } from '../simPoses';

const CX = ASPECT / 2;
const guardPose = makePose({ image: { [LM.LEFT_WRIST]: [CX + 0.12, 0.2], [LM.RIGHT_WRIST]: [CX - 0.12, 0.2] } });
const neutral = makePose();

function run(engine: GestureEngine, pose: typeof neutral, from: number, to: number, step = 33) {
  const fired: { t: number; g: string }[] = [];
  for (let t = from; t <= to; t += step) for (const g of engine.update(pose, t).fired) fired.push({ t, g });
  return fired;
}

describe('GestureEngine', () => {
  it('fires only after the stability window', () => {
    const e = new GestureEngine(CALIB);
    const fired = run(e, guardPose, 0, 1000);
    expect(fired).toHaveLength(1);
    expect(fired[0].g).toBe('GUARD');
    expect(fired[0].t).toBeGreaterThanOrEqual(TIMING.holdMs.GUARD);
  });

  it('does not fire a single-frame blip', () => {
    const e = new GestureEngine(CALIB);
    e.update(guardPose, 0);
    expect(run(e, neutral, 33, 600)).toHaveLength(0);
  });

  it('does not re-fire while held, and re-arms after release', () => {
    const e = new GestureEngine(CALIB);
    expect(run(e, guardPose, 0, 2000)).toHaveLength(1); // held 2 s → one event
    expect(e.isActive('GUARD')).toBe(true);
    run(e, neutral, 2033, 2400); // release
    expect(e.isActive('GUARD')).toBe(false);
    expect(run(e, guardPose, 2433, 3000)).toHaveLength(1);
  });

  it('treats a missing pose as not valid', () => {
    const e = new GestureEngine(CALIB);
    run(e, guardPose, 0, 100);
    const out = e.update(null, 133);
    expect(out.evaluations.GUARD.status).toBe('unknown');
    expect(out.fired).toHaveLength(0);
  });
});

describe('Error coach', () => {
  const okQuality = assessPoseQuality(neutral);

  it('prefers framing problems over form issues', () => {
    const ev = evaluateGuard(makePose({ image: { [LM.LEFT_WRIST]: [CX + 0.12, 0.2] } }), CALIB);
    const bad = assessPoseQuality(null);
    expect(coachMessage('GUARD', ev, bad)?.key).toBe('q:no_person');
    expect(coachMessage('GUARD', ev, okQuality)?.text).toBe('Raise your right hand above your shoulder.');
  });

  it('smooths flicker', () => {
    const s = new CoachSmoother(200, 800);
    const a: CoachMessage = { key: 'a', text: 'A', tone: 'warn', issue: null };
    const b: CoachMessage = { key: 'b', text: 'B', tone: 'warn', issue: null };
    expect(s.update(a, 0)).toBeNull(); // not yet stable
    expect(s.update(a, 250)?.key).toBe('a');
    expect(s.update(b, 300)?.key).toBe('a'); // b not stable yet
    expect(s.update(b, 600)?.key).toBe('a'); // a still within min visible time
    expect(s.update(b, 1100)?.key).toBe('b');
    // same issue, updated text (e.g. live angle) passes through immediately
    expect(s.update({ ...b, text: 'B2' }, 1110)?.text).toBe('B2');
  });

  it('tracks the most common mistake across prompts, ignoring brief noise', () => {
    const t = new MistakeTracker(250);
    const issue = (code: FormIssue['code']): FormIssue => ({ code, message: '', region: 'legs', severity: 'minor' });
    t.observe(issue('DUCK_NOT_LOW'), 400);
    t.observe(issue('PUNCH_ELBOW'), 100);
    expect(t.endPrompt()).toBe('DUCK_NOT_LOW');
    t.observe(issue('PUNCH_ELBOW'), 100); // below threshold
    expect(t.endPrompt()).toBeNull();
    t.observe(issue('DUCK_NOT_LOW'), 300);
    t.endPrompt();
    t.observe(issue('PUNCH_ELBOW'), 300);
    t.endPrompt();
    expect(t.mostCommon()).toEqual({ code: 'DUCK_NOT_LOW', label: 'Not ducking low enough', count: 2 });
  });
});
