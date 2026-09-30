import { bodyMetrics } from './calibration';
import { evaluateDuck } from './duckDetector';
import { evaluateGuard } from './guardDetector';
import { evaluatePunch } from './punchDetector';
import { GESTURES, type Calibration, type GestureEvaluation, type GestureName, type PoseFrame } from './poseTypes';

/**
 * Temporal rules on top of the per-frame detectors:
 * - holdMs: the gesture must be valid continuously this long before it fires (stability window)
 * - releaseMs: after firing, the gesture must be released for this long before it can fire again
 * - cooldownMs: minimum time between two fires of the same gesture
 * - globalGapMs: minimum time between any two fires
 * While a gesture is holding or active, the detector runs with relaxed (exit) thresholds — hysteresis.
 */
export const TIMING = {
  holdMs: { GUARD: 180, DUCK: 150, PUNCH: 70 } as Record<GestureName, number>,
  minValidFrames: 2,
  releaseMs: 150,
  cooldownMs: 450,
  globalGapMs: 250,
} as const;

type Detector = (frame: PoseFrame, calib: Calibration | null, relaxed: boolean) => GestureEvaluation;

const DETECTORS: Record<GestureName, Detector> = {
  GUARD: evaluateGuard,
  DUCK: evaluateDuck,
  PUNCH: evaluatePunch,
};

interface GestureState {
  validSince: number | null;
  validFrames: number;
  active: boolean;
  /** true once released long enough to fire again */
  armed: boolean;
  invalidSince: number | null;
  lastFired: number;
}

export interface EngineOutput {
  evaluations: Record<GestureName, GestureEvaluation>;
  /** gestures that fired on this frame (usually 0 or 1) */
  fired: GestureName[];
  /** gestures currently held (fired and not yet released) */
  active: GestureName[];
  /** gestures valid right now but still inside their stability window */
  holding: GestureName[];
}

const freshState = (): GestureState => ({
  validSince: null,
  validFrames: 0,
  active: false,
  armed: true,
  invalidSince: null,
  lastFired: -Infinity,
});

export class GestureEngine {
  private states: Record<GestureName, GestureState> = {
    GUARD: freshState(),
    DUCK: freshState(),
    PUNCH: freshState(),
  };
  private lastAnyFire = -Infinity;
  private calib: Calibration | null;

  constructor(calib: Calibration | null) {
    this.calib = calib ? { ...calib } : null;
  }

  get calibration(): Calibration | null {
    return this.calib;
  }

  reset(): void {
    for (const g of GESTURES) this.states[g] = freshState();
    this.lastAnyFire = -Infinity;
  }

  /** Is the gesture currently held (e.g. from a previous prompt)? */
  isActive(g: GestureName): boolean {
    return this.states[g].active || !this.states[g].armed;
  }

  update(frame: PoseFrame | null, now: number): EngineOutput {
    const evaluations = {} as Record<GestureName, GestureEvaluation>;
    const fired: GestureName[] = [];
    const active: GestureName[] = [];
    const holding: GestureName[] = [];

    for (const g of GESTURES) {
      const st = this.states[g];
      const relaxed = st.active || st.validSince !== null;
      const ev: GestureEvaluation = frame
        ? DETECTORS[g](frame, this.calib, relaxed)
        : { gesture: g, status: 'unknown', progress: 0, issue: null, focus: [], metrics: {} };
      evaluations[g] = ev;

      if (ev.status === 'valid') {
        st.invalidSince = null;
        if (st.validSince === null) st.validSince = now;
        st.validFrames++;
        const stable = now - st.validSince >= TIMING.holdMs[g] && st.validFrames >= TIMING.minValidFrames;
        if (
          !st.active &&
          st.armed &&
          stable &&
          now - st.lastFired >= TIMING.cooldownMs &&
          now - this.lastAnyFire >= TIMING.globalGapMs
        ) {
          st.active = true;
          st.armed = false;
          st.lastFired = now;
          this.lastAnyFire = now;
          fired.push(g);
        } else if (!st.active) {
          holding.push(g);
        }
      } else {
        st.validSince = null;
        st.validFrames = 0;
        if (st.invalidSince === null) st.invalidSince = now;
        st.active = false;
        if (!st.armed && now - st.invalidSince >= TIMING.releaseMs) st.armed = true;
      }
      if (st.active) active.push(g);
    }

    this.adaptBaseline(frame, evaluations);
    return { evaluations, fired, active, holding };
  }

  /**
   * Slowly follow small drifts of the standing hip height (player shuffling, camera
   * nudged) while the player is clearly standing. Never adapts during a duck attempt.
   */
  private adaptBaseline(frame: PoseFrame | null, ev: Record<GestureName, GestureEvaluation>): void {
    if (!frame || !this.calib || ev.DUCK.status !== 'idle') return;
    const drop = ev.DUCK.metrics.hipDrop;
    if (drop === undefined || Math.abs(drop) > 0.06) return;
    const knee = ev.DUCK.metrics.kneeAngle;
    if (knee !== undefined && knee < 160) return;
    const m = bodyMetrics(frame);
    if (!m?.hipMid) return;
    const a = 0.02;
    this.calib.hipY += (m.hipMid.y - this.calib.hipY) * a;
    this.calib.shoulderY += (m.shoulderMid.y - this.calib.shoulderY) * a;
  }
}
