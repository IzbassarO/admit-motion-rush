import { allVisible, distance2, isVisible, median, midpoint, toImagePoint } from './geometry';
import { LM, type Calibration, type Landmark, type PoseFrame } from './poseTypes';

/** Size / framing limits, as a fraction of the frame. */
export const FRAMING = {
  /** shoulder width as a fraction of frame WIDTH */
  minShoulderWidth: 0.07,
  maxShoulderWidth: 0.42,
  /** mean visibility of nose + shoulders required to trust the pose */
  minCoreVisibility: 0.6,
} as const;

export interface BodyMetrics {
  shoulderL: Landmark;
  shoulderR: Landmark;
  shoulderMid: { x: number; y: number };
  hipMid: { x: number; y: number } | null;
  /** image units (frame heights) */
  shoulderWidth: number;
  /** shoulder-mid to hip-mid, image units; estimated from shoulder width if hips hidden */
  torsoLength: number;
  hipsVisible: boolean;
  legsVisible: boolean;
}

/** Typical adult torso length / shoulder width ratio in a frontal view, used when hips are hidden. */
const TORSO_PER_SHOULDER = 1.35;

export function bodyMetrics(frame: PoseFrame): BodyMetrics | null {
  const lm = frame.image;
  if (!allVisible(lm, [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER])) return null;
  const p = (i: number) => toImagePoint(lm[i], frame.aspect);
  const shoulderL = p(LM.LEFT_SHOULDER);
  const shoulderR = p(LM.RIGHT_SHOULDER);
  const shoulderMid = midpoint(shoulderL, shoulderR);
  const shoulderWidth = distance2(shoulderL, shoulderR);
  const hipsVisible = allVisible(lm, [LM.LEFT_HIP, LM.RIGHT_HIP]);
  const hipMid = hipsVisible ? midpoint(p(LM.LEFT_HIP), p(LM.RIGHT_HIP)) : null;
  const torsoLength = hipMid ? distance2(shoulderMid, hipMid) : shoulderWidth * TORSO_PER_SHOULDER;
  const legsVisible =
    hipsVisible &&
    (allVisible(lm, [LM.LEFT_KNEE, LM.LEFT_ANKLE]) || allVisible(lm, [LM.RIGHT_KNEE, LM.RIGHT_ANKLE]));
  return { shoulderL, shoulderR, shoulderMid, hipMid, shoulderWidth, torsoLength, hipsVisible, legsVisible };
}

export type PoseQualityStatus = 'ok' | 'no_person' | 'low_confidence' | 'too_close' | 'too_far';

export interface PoseQuality {
  status: PoseQualityStatus;
  message: string;
  metrics: BodyMetrics | null;
}

const QUALITY_MESSAGES: Record<PoseQualityStatus, string> = {
  ok: '',
  no_person: 'No player detected — step into the frame.',
  low_confidence: 'Tracking is unsure — face the camera with better lighting.',
  too_close: 'Too close — take a step back.',
  too_far: 'Too far — come a little closer.',
};

export function assessPoseQuality(frame: PoseFrame | null): PoseQuality {
  const q = (status: PoseQualityStatus, metrics: BodyMetrics | null = null): PoseQuality => ({
    status,
    message: QUALITY_MESSAGES[status],
    metrics,
  });
  if (!frame || frame.image.length < 29) return q('no_person');
  const lm = frame.image;
  const core = [LM.NOSE, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER].map((i) => lm[i]?.visibility ?? 0);
  const coreVis = core.reduce((a, b) => a + b, 0) / core.length;
  if (coreVis < 0.3) return q('no_person');
  const metrics = bodyMetrics(frame);
  if (!metrics || coreVis < FRAMING.minCoreVisibility) return q('low_confidence', metrics);
  // shoulder width as a fraction of frame width
  const widthFraction = metrics.shoulderWidth / frame.aspect;
  if (widthFraction > FRAMING.maxShoulderWidth) return q('too_close', metrics);
  if (widthFraction < FRAMING.minShoulderWidth) return q('too_far', metrics);
  return q('ok', metrics);
}

/** A calibration sample must show a neutral standing pose: hips visible, both wrists below shoulders. */
export function isNeutralStance(frame: PoseFrame, metrics: BodyMetrics): boolean {
  if (!metrics.hipsVisible) return false;
  const lw = frame.image[LM.LEFT_WRIST];
  const rw = frame.image[LM.RIGHT_WRIST];
  const below = (w: Landmark | undefined) => !isVisible(w, 0.5) || w.y > metrics.shoulderMid.y + 0.05;
  return below(lw) && below(rw);
}

export function computeCalibration(samples: BodyMetrics[]): Calibration | null {
  const withHips = samples.filter((s) => s.hipMid);
  if (withHips.length < 5) return null;
  return {
    shoulderY: median(withHips.map((s) => s.shoulderMid.y)),
    hipY: median(withHips.map((s) => s.hipMid!.y)),
    torsoLength: median(withHips.map((s) => s.torsoLength)),
    shoulderWidth: median(withHips.map((s) => s.shoulderWidth)),
    hipsVisible: true,
    legsVisible: withHips.filter((s) => s.legsVisible).length / withHips.length >= 0.6,
  };
}

export type CalibrationHint =
  | { kind: 'quality'; message: string }
  | { kind: 'hips'; message: string }
  | { kind: 'arms'; message: string }
  | { kind: 'hold'; message: string };

/**
 * Collects neutral-pose samples for `durationMs` of *good* frames. Progress pauses
 * (but does not reset) while the player is not in a valid stance.
 */
export class CalibrationCollector {
  private samples: BodyMetrics[] = [];
  private accumulated = 0;
  private lastTs: number | null = null;
  hint: CalibrationHint = { kind: 'quality', message: QUALITY_MESSAGES.no_person };

  constructor(private readonly durationMs = 3000) {}

  get progress(): number {
    return Math.min(1, this.accumulated / this.durationMs);
  }

  get done(): boolean {
    return this.accumulated >= this.durationMs;
  }

  add(frame: PoseFrame | null, now: number): void {
    const dt = this.lastTs === null ? 0 : Math.min(100, now - this.lastTs);
    this.lastTs = now;
    const quality = assessPoseQuality(frame);
    if (quality.status !== 'ok' || !frame || !quality.metrics) {
      this.hint = { kind: 'quality', message: quality.message };
      return;
    }
    if (!quality.metrics.hipsVisible) {
      this.hint = { kind: 'hips', message: 'Step back until your hips are in the frame.' };
      return;
    }
    if (!isNeutralStance(frame, quality.metrics)) {
      this.hint = { kind: 'arms', message: 'Stand tall with your arms relaxed at your sides.' };
      return;
    }
    this.hint = { kind: 'hold', message: 'Hold still…' };
    this.samples.push(quality.metrics);
    if (this.samples.length > 300) this.samples.shift();
    this.accumulated += dt;
  }

  result(): Calibration | null {
    return this.done ? computeCalibration(this.samples) : null;
  }
}
