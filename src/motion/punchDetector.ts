import { allVisible, angleDeg, clamp, distance3, elevationDeg, toImagePoint } from './geometry';
import { LM, type GestureEvaluation, type Landmark, type PoseFrame, type Side } from './poseTypes';

/**
 * PUNCH: one arm extended forward or sideways at roughly shoulder height.
 * - elbow angle (shoulder-elbow-wrist) above ~155°
 * - reach = |wrist - shoulder| / shoulderWidth above a minimum
 * - arm elevation within a band around horizontal (not pointing at the ceiling or the floor)
 * Angles and reach use MediaPipe's metric 3D world landmarks when available, so a
 * punch straight at the camera is measured correctly despite 2D foreshortening.
 */
export const PUNCH_THRESHOLDS = {
  enterElbowAngle: 155,
  exitElbowAngle: 145,
  enterReach: 1.2,
  exitReach: 1.05,
  /** 2D fallback (no world landmarks): reach relative to image shoulder width */
  enterReach2D: 1.25,
  exitReach2D: 1.1,
  minElevation: -40,
  maxElevation: 55,
  /** attempt detection: arm lifted off the body at least this much */
  attemptElevation: -60,
  attemptElbowAngle: 100,
  attemptReach: 0.8,
} as const;

interface ArmReading {
  side: Side;
  elbowAngle: number;
  reach: number;
  elevation: number;
  wrist: number;
  elbow: number;
}

function readArm(frame: PoseFrame, side: Side): ArmReading | null {
  const s = side === 'left' ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER;
  const e = side === 'left' ? LM.LEFT_ELBOW : LM.RIGHT_ELBOW;
  const w = side === 'left' ? LM.LEFT_WRIST : LM.RIGHT_WRIST;
  if (!allVisible(frame.image, [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, e, w])) return null;
  const src: Landmark[] = frame.world ?? frame.image.map((l) => toImagePoint(l, frame.aspect));
  const shoulderWidth = distance3(src[LM.LEFT_SHOULDER], src[LM.RIGHT_SHOULDER]);
  if (shoulderWidth < 1e-6) return null;
  const elbowAngle = angleDeg(src[s], src[e], src[w]);
  const reach = distance3(src[s], src[w]) / shoulderWidth;
  const elevation = elevationDeg(src[s], src[w]);
  if (![elbowAngle, reach, elevation].every(Number.isFinite)) return null;
  return { side, elbowAngle, reach, elevation, wrist: w, elbow: e };
}

function armScore(a: ArmReading, needReach: number): number {
  const angleP = clamp((a.elbowAngle - 90) / (PUNCH_THRESHOLDS.enterElbowAngle - 90));
  const reachP = clamp(a.reach / needReach);
  const elevP = a.elevation < PUNCH_THRESHOLDS.minElevation || a.elevation > PUNCH_THRESHOLDS.maxElevation ? 0.5 : 1;
  return Math.min(angleP, reachP) * elevP;
}

export function evaluatePunch(frame: PoseFrame, _calib: unknown = null, relaxed = false): GestureEvaluation {
  const base = { gesture: 'PUNCH' as const, focus: [], metrics: {} };
  const T = PUNCH_THRESHOLDS;
  const arms = (['left', 'right'] as const).map((s) => readArm(frame, s)).filter((a): a is ArmReading => !!a);
  if (arms.length === 0) {
    return {
      ...base,
      status: 'unknown',
      progress: 0,
      issue: {
        code: 'PUNCH_ARM_HIDDEN',
        message: 'Keep your arms inside the frame.',
        region: 'arms',
        severity: 'minor',
      },
    };
  }
  const world = !!frame.world;
  const needAngle = relaxed ? T.exitElbowAngle : T.enterElbowAngle;
  const needReach = world ? (relaxed ? T.exitReach : T.enterReach) : relaxed ? T.exitReach2D : T.enterReach2D;
  const inBand = (a: ArmReading) => a.elevation >= T.minElevation && a.elevation <= T.maxElevation;
  const valid = (a: ArmReading) => a.elbowAngle >= needAngle && a.reach >= needReach && inBand(a);

  const hit = arms.find(valid);
  if (hit) {
    return {
      ...base,
      status: 'valid',
      progress: 1,
      issue: null,
      focus: [{ index: hit.wrist }, { index: hit.elbow, label: `${Math.round(hit.elbowAngle)}°` }],
      metrics: { elbowAngle: hit.elbowAngle, reach: hit.reach, elevation: hit.elevation, side: hit.side === 'left' ? 0 : 1 },
    };
  }

  // Pick the arm that is most clearly being used for a punch attempt.
  const attempting = arms.filter(
    (a) => a.elevation > T.attemptElevation && (a.elbowAngle >= T.attemptElbowAngle || a.reach >= T.attemptReach),
  );
  const best = [...arms].sort((a, b) => armScore(b, needReach) - armScore(a, needReach))[0];
  const m = { elbowAngle: best.elbowAngle, reach: best.reach, elevation: best.elevation, side: best.side === 'left' ? 0 : 1 };
  const progress = armScore(best, needReach);
  if (attempting.length === 0) return { ...base, status: 'idle', progress, issue: null, metrics: m };

  const a = [...attempting].sort((x, y) => armScore(y, needReach) - armScore(x, needReach))[0];
  const region = a.side === 'left' ? 'leftArm' : 'rightArm';
  const angle = Math.round(a.elbowAngle);
  const mm = { elbowAngle: a.elbowAngle, reach: a.reach, elevation: a.elevation, side: a.side === 'left' ? 0 : 1 };
  const p = armScore(a, needReach);
  const severity = p > 0.7 ? 'minor' : 'major';

  if (a.elevation > T.maxElevation) {
    return {
      ...base,
      status: 'partial',
      progress: p,
      metrics: mm,
      focus: [{ index: a.wrist, label: '↓' }],
      issue: {
        code: 'PUNCH_TOO_HIGH',
        message: `Punch forward at shoulder height — your ${a.side} arm is pointing up.`,
        region,
        severity,
      },
    };
  }
  if (a.elevation < T.minElevation) {
    return {
      ...base,
      status: 'partial',
      progress: p,
      metrics: mm,
      focus: [{ index: a.wrist, label: '↑' }],
      issue: {
        code: 'PUNCH_TOO_LOW',
        message: `Raise your ${a.side} fist to shoulder height.`,
        region,
        severity,
      },
    };
  }
  if (a.elbowAngle < needAngle) {
    return {
      ...base,
      status: 'partial',
      progress: p,
      metrics: mm,
      focus: [{ index: a.elbow, label: `${angle}°` }],
      issue: {
        code: 'PUNCH_ELBOW',
        message: `Extend your ${a.side} elbow more — ${angle}°, target >${T.enterElbowAngle}°.`,
        region,
        severity,
      },
    };
  }
  return {
    ...base,
    status: 'partial',
    progress: p,
    metrics: mm,
    focus: [{ index: a.wrist, label: '→' }],
    issue: {
      code: 'PUNCH_REACH',
      message: `Reach further with your ${a.side} arm — drive the fist away from your shoulder.`,
      region,
      severity,
    },
  };
}
