import { describe, expect, it } from 'vitest';
import { evaluateDuck } from '../duckDetector';
import { evaluateGuard } from '../guardDetector';
import { LM } from '../poseTypes';
import { evaluatePunch } from '../punchDetector';
import { ASPECT, CALIB, makePose, worldLeg, worldRightArm } from '../simPoses';

const CX = ASPECT / 2;

const wrists = (ly: number, ry: number) => ({
  image: { [LM.LEFT_WRIST]: [CX + 0.12, ly] as [number, number], [LM.RIGHT_WRIST]: [CX - 0.12, ry] as [number, number] },
});

describe('GUARD', () => {
  it('is idle when standing', () => {
    expect(evaluateGuard(makePose(), CALIB).status).toBe('idle');
  });

  it('is valid with both wrists above the shoulders', () => {
    const ev = evaluateGuard(makePose(wrists(0.2, 0.2)), CALIB);
    expect(ev.status).toBe('valid');
    expect(ev.issue).toBeNull();
  });

  it('coaches the specific low hand', () => {
    const ev = evaluateGuard(makePose(wrists(0.2, 0.4)), CALIB);
    expect(ev.status).toBe('partial');
    expect(ev.issue?.code).toBe('GUARD_RIGHT_LOW');
    expect(ev.issue?.message).toBe('Raise your right hand above your shoulder.');
    expect(ev.issue?.region).toBe('rightArm');

    const left = evaluateGuard(makePose(wrists(0.45, 0.2)), CALIB);
    expect(left.issue?.code).toBe('GUARD_LEFT_LOW');
    expect(left.issue?.message).toContain('left hand');
  });

  it('asks for both hands higher when both are at chest height', () => {
    const ev = evaluateGuard(makePose(wrists(0.36, 0.36)), CALIB);
    expect(ev.status).toBe('partial');
    expect(ev.issue?.code).toBe('GUARD_BOTH_LOW');
    expect(ev.issue?.message).toMatch(/both hands higher/i);
  });

  it('applies hysteresis: slightly below the shoulder only holds when relaxed', () => {
    const pose = makePose(wrists(0.305, 0.305)); // lift ≈ -0.017
    expect(evaluateGuard(pose, CALIB, false).status).not.toBe('valid');
    expect(evaluateGuard(pose, CALIB, true).status).toBe('valid');
  });

  it('is unknown when a hand cannot be seen', () => {
    const ev = evaluateGuard(makePose({ visibility: { [LM.LEFT_WRIST]: 0.1, [LM.LEFT_ELBOW]: 0.1 } }), CALIB);
    expect(ev.status).toBe('unknown');
    expect(ev.issue?.code).toBe('GUARD_HANDS_HIDDEN');
  });
});

const hipsAt = (y: number) => ({
  [LM.LEFT_HIP]: [CX + 0.07, y] as [number, number],
  [LM.RIGHT_HIP]: [CX - 0.07, y] as [number, number],
  [LM.LEFT_KNEE]: [CX + 0.1, 0.8] as [number, number],
  [LM.RIGHT_KNEE]: [CX - 0.1, 0.8] as [number, number],
});

describe('DUCK', () => {
  it('is idle when standing', () => {
    expect(evaluateDuck(makePose(), CALIB).status).toBe('idle');
  });

  it('needs a calibration', () => {
    expect(evaluateDuck(makePose(), null).status).toBe('unknown');
  });

  it('is valid for a real squat (hips low, knees bent)', () => {
    const ev = evaluateDuck(
      makePose({ image: hipsAt(0.72), world: { ...worldLeg('left', 95), ...worldLeg('right', 95) } }),
      CALIB,
    );
    expect(ev.status).toBe('valid');
    expect(ev.metrics.kneeAngle).toBeCloseTo(95, 0);
  });

  it('coaches a half squat with the measured knee angle', () => {
    const ev = evaluateDuck(
      makePose({ image: hipsAt(0.64), world: { ...worldLeg('left', 124), ...worldLeg('right', 124) } }),
      CALIB,
    );
    expect(ev.status).toBe('partial');
    expect(ev.issue?.code).toBe('DUCK_NOT_LOW');
    expect(ev.issue?.message).toBe('Go lower — knee angle 124°, target <115°.');
    expect(ev.focus.some((f) => f.label === '124°')).toBe(true);
  });

  it('asks for more knee bend when hips dropped but legs are straight-ish', () => {
    const ev = evaluateDuck(
      makePose({ image: hipsAt(0.7), world: { ...worldLeg('left', 135), ...worldLeg('right', 135) } }),
      CALIB,
    );
    expect(ev.issue?.code).toBe('DUCK_KNEES');
    expect(ev.issue?.message).toContain('135°');
  });

  it('falls back to a stricter hip-drop rule when knees are hidden', () => {
    const hidden = { [LM.LEFT_KNEE]: 0.1, [LM.RIGHT_KNEE]: 0.1, [LM.LEFT_ANKLE]: 0.1, [LM.RIGHT_ANKLE]: 0.1 };
    const shallow = evaluateDuck(makePose({ image: hipsAt(0.67), visibility: hidden }), CALIB);
    expect(shallow.status).toBe('partial'); // 0.23 torso drop < 0.30
    const deep = evaluateDuck(makePose({ image: hipsAt(0.7), visibility: hidden }), CALIB);
    expect(deep.status).toBe('valid');
  });

  it('uses shoulder drop when hips leave the frame', () => {
    const hidden = { [LM.LEFT_HIP]: 0.1, [LM.RIGHT_HIP]: 0.1 };
    const shoulders = { [LM.LEFT_SHOULDER]: [CX + 0.1, 0.42] as [number, number], [LM.RIGHT_SHOULDER]: [CX - 0.1, 0.42] as [number, number] };
    const ev = evaluateDuck(makePose({ image: shoulders, visibility: hidden }), CALIB);
    expect(ev.status).toBe('valid');
  });
});

describe('PUNCH', () => {
  it('is idle with arms hanging', () => {
    expect(evaluatePunch(makePose()).status).toBe('idle');
  });

  it('is valid for a straight arm towards the camera (3D world landmarks)', () => {
    const ev = evaluatePunch(makePose({ world: worldRightArm(175) }));
    expect(ev.status).toBe('valid');
    expect(ev.metrics.elbowAngle).toBeGreaterThan(170);
  });

  it('coaches a bent elbow with the measured angle', () => {
    const ev = evaluatePunch(makePose({ world: worldRightArm(136) }));
    expect(ev.status).toBe('partial');
    expect(ev.issue?.code).toBe('PUNCH_ELBOW');
    expect(ev.issue?.message).toBe('Extend your right elbow more — 136°, target >155°.');
    expect(ev.issue?.region).toBe('rightArm');
  });

  it('rejects a straight arm pointing at the ceiling', () => {
    const ev = evaluatePunch(makePose({ world: worldRightArm(175, 80) }));
    expect(ev.status).toBe('partial');
    expect(ev.issue?.code).toBe('PUNCH_TOO_HIGH');
  });

  it('accepts a sideways punch in 2D when world landmarks are missing', () => {
    const ev = evaluatePunch(
      makePose({
        noWorld: true,
        image: { [LM.RIGHT_ELBOW]: [CX - 0.25, 0.3], [LM.RIGHT_WRIST]: [CX - 0.38, 0.3] },
      }),
    );
    expect(ev.status).toBe('valid');
  });

  it('uses hysteresis on the elbow angle', () => {
    const pose = makePose({ world: worldRightArm(150) });
    expect(evaluatePunch(pose, null, false).status).toBe('partial');
    expect(evaluatePunch(pose, null, true).status).toBe('valid');
  });
});
