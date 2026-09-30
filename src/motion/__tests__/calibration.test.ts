import { describe, expect, it } from 'vitest';
import { assessPoseQuality, bodyMetrics, CalibrationCollector, computeCalibration } from '../calibration';
import { LM } from '../poseTypes';
import { ASPECT, makePose } from '../simPoses';

const CX = ASPECT / 2;

describe('pose quality', () => {
  it('accepts a well framed standing pose', () => {
    expect(assessPoseQuality(makePose()).status).toBe('ok');
  });

  it('reports no person', () => {
    expect(assessPoseQuality(null).status).toBe('no_person');
    const vis = Object.fromEntries([...Array(33).keys()].map((i) => [i, 0.05]));
    expect(assessPoseQuality(makePose({ visibility: vis })).status).toBe('no_person');
  });

  it('reports low confidence when the core is uncertain', () => {
    const q = assessPoseQuality(makePose({ visibility: { [LM.NOSE]: 0.4, [LM.LEFT_SHOULDER]: 0.55, [LM.RIGHT_SHOULDER]: 0.55 } }));
    expect(q.status).toBe('low_confidence');
  });

  it('detects too close / too far from shoulder width', () => {
    const far = makePose({ image: { [LM.LEFT_SHOULDER]: [CX + 0.05, 0.3], [LM.RIGHT_SHOULDER]: [CX - 0.05, 0.3] } });
    expect(assessPoseQuality(far).status).toBe('too_far');
    const close = makePose({ image: { [LM.LEFT_SHOULDER]: [CX + 0.45, 0.3], [LM.RIGHT_SHOULDER]: [CX - 0.45, 0.3] } });
    expect(assessPoseQuality(close).status).toBe('too_close');
  });
});

describe('calibration', () => {
  it('measures torso length and shoulder width', () => {
    const m = bodyMetrics(makePose())!;
    expect(m.torsoLength).toBeCloseTo(0.3);
    expect(m.shoulderWidth).toBeCloseTo(0.2);
    expect(m.hipsVisible).toBe(true);
    expect(m.legsVisible).toBe(true);
  });

  it('computes a median baseline', () => {
    const samples = [0.58, 0.6, 0.6, 0.61, 0.9].map((hy) =>
      bodyMetrics(makePose({ image: { [LM.LEFT_HIP]: [CX + 0.07, hy], [LM.RIGHT_HIP]: [CX - 0.07, hy] } }))!,
    );
    const c = computeCalibration(samples)!;
    expect(c.hipY).toBeCloseTo(0.6); // outlier 0.9 ignored by the median
    expect(computeCalibration(samples.slice(0, 3))).toBeNull();
  });

  it('collects 3 s of neutral frames and pauses otherwise', () => {
    const c = new CalibrationCollector(3000);
    let t = 0;
    for (; t <= 1500; t += 33) c.add(makePose(), t);
    expect(c.progress).toBeGreaterThan(0.45);
    expect(c.done).toBe(false);

    // arms raised: not neutral, progress must not advance
    const before = c.progress;
    const raised = makePose({ image: { [LM.LEFT_WRIST]: [CX + 0.1, 0.1], [LM.RIGHT_WRIST]: [CX - 0.1, 0.1] } });
    for (let i = 0; i < 20; i++, t += 33) c.add(raised, t);
    expect(c.progress).toBe(before);
    expect(c.hint.kind).toBe('arms');

    for (; !c.done && t < 10_000; t += 33) c.add(makePose(), t);
    expect(c.done).toBe(true);
    const r = c.result()!;
    expect(r.hipY).toBeCloseTo(0.6);
    expect(r.torsoLength).toBeCloseTo(0.3);
    expect(r.legsVisible).toBe(true);
  });

  it('asks the player to step back when hips are hidden', () => {
    const c = new CalibrationCollector();
    c.add(makePose({ visibility: { [LM.LEFT_HIP]: 0.1, [LM.RIGHT_HIP]: 0.1 } }), 0);
    expect(c.hint.kind).toBe('hips');
  });
});
