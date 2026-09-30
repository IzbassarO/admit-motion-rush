import { describe, expect, it } from 'vitest';
import { assessPoseQuality, framingReport } from '../calibration';
import { evaluateDuck } from '../duckDetector';
import { coachMessage } from '../errorCoach';
import { evaluateGuard } from '../guardDetector';
import { LM } from '../poseTypes';
import { evaluatePunch } from '../punchDetector';
import { ASPECT, CALIB, makePose, SIM_POSES, worldRightArm } from '../simPoses';

const CX = ASPECT / 2;
const ok = assessPoseQuality(makePose());

describe('structured coach card', () => {
  it('PUNCH: headline, real elbow measurement, target and action', () => {
    const ev = evaluatePunch(makePose({ world: worldRightArm(138) }));
    const m = coachMessage('PUNCH', ev, ok)!;
    expect(m.headline).toBe('Extend your arm');
    expect(m.measure).toEqual({ label: 'Elbow', value: '138°', target: '155°+' });
    expect(m.action).toBe('Straighten your right elbow');
  });

  it('DUCK: knee measurement from the detector', () => {
    const ev = evaluateDuck(makePose(SIM_POSES.halfDuck), CALIB);
    const m = coachMessage('DUCK', ev, ok)!;
    expect(m.headline).toBe('Go lower');
    expect(m.measure).toEqual({ label: 'Knee', value: '124°', target: '≤115°' });
    expect(m.action).toBe('Lower your hips a little more');
  });

  it('GUARD: side-specific headline without invented numbers', () => {
    const ev = evaluateGuard(makePose(SIM_POSES.guardLeftOnly), CALIB);
    const m = coachMessage('GUARD', ev, ok)!;
    expect(m.headline).toBe('Right hand higher');
    expect(m.action).toBe('Raise your right wrist above your shoulder');
    expect(m.measure).toBeUndefined();
  });

  it('tracking problems use an actionable headline', () => {
    const m = coachMessage('GUARD', null, assessPoseQuality(null))!;
    expect(m.headline).toBe('Step back into frame');
  });
});

describe('framing report', () => {
  it('is ready with a full body in frame', () => {
    const r = framingReport(makePose());
    expect(r).toMatchObject({ person: true, upperBody: true, distance: 'ok', knees: true, ready: true, confidence: 'good' });
  });

  it('asks for knees when they are hidden but still allows calibration', () => {
    const r = framingReport(makePose({ visibility: { [LM.LEFT_KNEE]: 0.1, [LM.RIGHT_KNEE]: 0.1 } }));
    expect(r.ready).toBe(true);
    expect(r.knees).toBe(false);
    expect(r.message).toMatch(/knees/);
  });

  it('is not ready when hips are hidden', () => {
    const r = framingReport(makePose({ visibility: { [LM.LEFT_HIP]: 0.1, [LM.RIGHT_HIP]: 0.1 } }));
    expect(r.ready).toBe(false);
    expect(r.message).toMatch(/full upper body/);
  });

  it('reports distance problems and no person', () => {
    const far = makePose({ image: { [LM.LEFT_SHOULDER]: [CX + 0.05, 0.3], [LM.RIGHT_SHOULDER]: [CX - 0.05, 0.3] } });
    expect(framingReport(far)).toMatchObject({ distance: 'too_far', ready: false, message: 'Move closer to the camera.' });
    expect(framingReport(null)).toMatchObject({ person: false, ready: false, confidence: 'none' });
  });
});
