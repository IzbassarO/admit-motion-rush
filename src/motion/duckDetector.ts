import { bodyMetrics } from './calibration';
import { allVisible, angleDeg, clamp, toImagePoint } from './geometry';
import { LM, type Calibration, type GestureEvaluation, type Landmark, type PoseFrame } from './poseTypes';

/**
 * DUCK: hips lowered relative to the calibrated standing baseline AND (when legs
 * are visible) knees bent into a real squat.
 * hipDrop = (hipY - baselineHipY) / baselineTorsoLength
 */
export const DUCK_THRESHOLDS = {
  /** hips must drop at least this fraction of torso length */
  enterHipDrop: 0.2,
  exitHipDrop: 0.14,
  /** knee angle (hip-knee-ankle) must be at most this, degrees */
  enterKneeAngle: 115,
  exitKneeAngle: 128,
  /** without visible knees we require a deeper hip drop instead */
  hipsOnlyEnterDrop: 0.3,
  hipsOnlyExitDrop: 0.22,
  /** without visible hips (they left the frame) use shoulder drop */
  shouldersOnlyEnterDrop: 0.35,
  shouldersOnlyExitDrop: 0.27,
  /** attempt detection */
  attemptHipDrop: 0.07,
  attemptKneeAngle: 155,
} as const;

interface KneeReading {
  angle: number;
  index: number;
}

function kneeAngles(frame: PoseFrame): KneeReading[] {
  const legs = [
    [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE],
    [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  ] as const;
  const out: KneeReading[] = [];
  for (const [h, k, a] of legs) {
    if (!allVisible(frame.image, [h, k, a])) continue;
    // Prefer metric 3D world landmarks: a frontal squat foreshortens the thigh in 2D.
    const src: Landmark[] = frame.world ?? frame.image.map((l) => toImagePoint(l, frame.aspect));
    const angle = angleDeg(src[h], src[k], src[a]);
    if (Number.isFinite(angle)) out.push({ angle, index: k });
  }
  return out;
}

export function evaluateDuck(
  frame: PoseFrame,
  calib: Calibration | null,
  relaxed = false,
): GestureEvaluation {
  const base = { gesture: 'DUCK' as const, focus: [], metrics: {} };
  const metrics = bodyMetrics(frame);
  if (!metrics || !calib) return { ...base, status: 'unknown', progress: 0, issue: null };
  const T = DUCK_THRESHOLDS;

  // --- Mode A: hips hidden (dropped out of frame). Use shoulder drop. ---
  if (!metrics.hipMid) {
    const drop = (metrics.shoulderMid.y - calib.shoulderY) / calib.torsoLength;
    const need = relaxed ? T.shouldersOnlyExitDrop : T.shouldersOnlyEnterDrop;
    const progress = clamp(drop / T.shouldersOnlyEnterDrop);
    const m = { shoulderDrop: drop };
    if (drop >= need) return { ...base, status: 'valid', progress: 1, issue: null, metrics: m };
    if (drop < T.attemptHipDrop) return { ...base, status: 'idle', progress, issue: null, metrics: m };
    return {
      ...base,
      status: 'partial',
      progress,
      metrics: m,
      issue: {
        code: 'DUCK_NOT_LOW',
        message: `Go lower — dropped ${Math.round(progress * 100)}% of the target depth.`,
        region: 'body',
        severity: progress > 0.6 ? 'minor' : 'major',
      },
    };
  }

  const hipDrop = (metrics.hipMid.y - calib.hipY) / calib.torsoLength;
  const knees = kneeAngles(frame);
  const hipFocus = [{ index: LM.LEFT_HIP }, { index: LM.RIGHT_HIP }];

  // --- Mode B: hips visible but knees/ankles not. Stricter hip-drop rule. ---
  if (knees.length === 0) {
    const need = relaxed ? T.hipsOnlyExitDrop : T.hipsOnlyEnterDrop;
    const progress = clamp(hipDrop / T.hipsOnlyEnterDrop);
    const m = { hipDrop };
    if (hipDrop >= need) return { ...base, status: 'valid', progress: 1, issue: null, metrics: m };
    if (hipDrop < T.attemptHipDrop) return { ...base, status: 'idle', progress, issue: null, metrics: m };
    return {
      ...base,
      status: 'partial',
      progress,
      metrics: m,
      focus: hipFocus,
      issue: {
        code: 'DUCK_NOT_LOW',
        message: `Drop your hips lower — ${Math.round(progress * 100)}% of the target depth.`,
        region: 'hips',
        severity: progress > 0.6 ? 'minor' : 'major',
      },
    };
  }

  // --- Mode C: full legs visible. Hip drop + knee angle. ---
  const knee = knees.reduce((a, k) => a + k.angle, 0) / knees.length;
  const kneeRounded = Math.round(knee);
  const needDrop = relaxed ? T.exitHipDrop : T.enterHipDrop;
  const needKnee = relaxed ? T.exitKneeAngle : T.enterKneeAngle;
  const dropOk = hipDrop >= needDrop;
  const kneeOk = knee <= needKnee;
  const kneeProgress = clamp((180 - knee) / (180 - T.enterKneeAngle));
  const dropProgress = clamp(hipDrop / T.enterHipDrop);
  const progress = Math.min(kneeProgress, dropProgress);
  const m = { hipDrop, kneeAngle: knee };
  const kneeFocus = knees.map((k) => ({ index: k.index, label: `${kneeRounded}°` }));

  if (dropOk && kneeOk) {
    return { ...base, status: 'valid', progress: 1, issue: null, focus: kneeFocus, metrics: m };
  }
  if (hipDrop < T.attemptHipDrop && knee > T.attemptKneeAngle) {
    return { ...base, status: 'idle', progress, issue: null, metrics: m };
  }
  const severity = progress > 0.65 ? 'minor' : 'major';
  if (!kneeOk) {
    return {
      ...base,
      status: 'partial',
      progress,
      metrics: m,
      focus: kneeFocus,
      issue: {
        code: dropOk ? 'DUCK_KNEES' : 'DUCK_NOT_LOW',
        message: dropOk
          ? `Bend your knees more — knee angle ${kneeRounded}°, target <${T.enterKneeAngle}°.`
          : `Go lower — knee angle ${kneeRounded}°, target <${T.enterKneeAngle}°.`,
        region: 'legs',
        severity,
      },
    };
  }
  // knees bent enough but hips not lowered (e.g. leaning back / knees forward)
  return {
    ...base,
    status: 'partial',
    progress,
    metrics: m,
    focus: hipFocus,
    issue: {
      code: 'DUCK_NOT_LOW',
      message: `Sink your hips lower — ${Math.round(dropProgress * 100)}% of the target depth.`,
      region: 'hips',
      severity,
    },
  };
}
