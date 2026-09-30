import { bodyMetrics } from './calibration';
import { clamp, isVisible, toImagePoint } from './geometry';
import { LM, type Calibration, type GestureEvaluation, type PoseFrame, type Side } from './poseTypes';

/**
 * GUARD: both wrists above their corresponding shoulders.
 * "lift" = (shoulder.y - wrist.y) / torsoLength  — positive when the wrist is above the shoulder.
 */
export const GUARD_THRESHOLDS = {
  /** each wrist must be this far above its shoulder to enter GUARD */
  enterLift: 0.05,
  /** once active/holding, GUARD is kept until a wrist drops below this (hysteresis) */
  exitLift: -0.03,
  /** a hand at least this high (~upper chest) means the player is attempting GUARD */
  attemptLift: -0.55,
  /** below this a low hand is a "major" miss */
  minorLift: -0.25,
} as const;

interface HandLift {
  side: Side;
  lift: number;
  index: number;
}

function handLift(frame: PoseFrame, side: Side, torso: number): HandLift | null {
  const s = side === 'left' ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER;
  const e = side === 'left' ? LM.LEFT_ELBOW : LM.RIGHT_ELBOW;
  const w = side === 'left' ? LM.LEFT_WRIST : LM.RIGHT_WRIST;
  const lm = frame.image;
  if (!isVisible(lm[s])) return null;
  const shoulder = toImagePoint(lm[s], frame.aspect);
  if (isVisible(lm[w])) {
    const wrist = toImagePoint(lm[w], frame.aspect);
    return { side, lift: (shoulder.y - wrist.y) / torso, index: w };
  }
  // Wrist lost (often: hand raised out of the top of the frame). If the elbow is
  // already above the shoulder, the hand is certainly higher still.
  if (isVisible(lm[e])) {
    const elbow = toImagePoint(lm[e], frame.aspect);
    const elbowLift = (shoulder.y - elbow.y) / torso;
    if (elbowLift > 0) return { side, lift: elbowLift + 0.1, index: e };
  }
  return null;
}

export function evaluateGuard(
  frame: PoseFrame,
  calib: Calibration | null,
  relaxed = false,
): GestureEvaluation {
  const base = { gesture: 'GUARD' as const, focus: [], metrics: {} };
  const metrics = bodyMetrics(frame);
  if (!metrics) return { ...base, status: 'unknown', progress: 0, issue: null };
  const torso = calib?.torsoLength ?? metrics.torsoLength;
  const left = handLift(frame, 'left', torso);
  const right = handLift(frame, 'right', torso);
  if (!left || !right) {
    return {
      ...base,
      status: 'unknown',
      progress: 0,
      issue: {
        code: 'GUARD_HANDS_HIDDEN',
        message: 'Keep both hands visible to the camera.',
        region: 'arms',
        severity: 'minor',
      },
    };
  }

  const threshold = relaxed ? GUARD_THRESHOLDS.exitLift : GUARD_THRESHOLDS.enterLift;
  const lowest = Math.min(left.lift, right.lift);
  const highest = Math.max(left.lift, right.lift);
  const progress = clamp((lowest + 1) / (1 + GUARD_THRESHOLDS.enterLift));
  const m = { leftLift: left.lift, rightLift: right.lift };

  if (lowest >= threshold) {
    return {
      ...base,
      status: 'valid',
      progress: 1,
      issue: null,
      focus: [{ index: left.index }, { index: right.index }],
      metrics: m,
    };
  }
  if (highest < GUARD_THRESHOLDS.attemptLift) {
    return { ...base, status: 'idle', progress, issue: null, metrics: m };
  }

  const low = [left, right].filter((h) => h.lift < threshold);
  const severity = lowest > GUARD_THRESHOLDS.minorLift ? 'minor' : 'major';
  const focus = low.map((h) => ({ index: h.index, label: '↑' }));
  if (low.length === 1) {
    const side = low[0].side;
    return {
      ...base,
      status: 'partial',
      progress,
      focus,
      metrics: m,
      issue: {
        code: side === 'left' ? 'GUARD_LEFT_LOW' : 'GUARD_RIGHT_LOW',
        message: `Raise your ${side} hand above your shoulder.`,
        region: side === 'left' ? 'leftArm' : 'rightArm',
        severity,
      },
    };
  }
  return {
    ...base,
    status: 'partial',
    progress,
    focus,
    metrics: m,
    issue: {
      code: 'GUARD_BOTH_LOW',
      message: 'Raise both hands higher — above your shoulders.',
      region: 'arms',
      severity,
    },
  };
}
