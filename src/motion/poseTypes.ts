/** MediaPipe Pose landmark indices we use (person's anatomical left/right). */
export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Landmark extends Vec3 {
  visibility: number;
}

/**
 * One frame of pose data, decoupled from MediaPipe's own types.
 * - `image`: normalized [0..1] image coordinates, y pointing down.
 * - `world`: metric 3D coordinates centred on the hips (y down), if available.
 * - `aspect`: video width / height, used to make image-space geometry isotropic.
 */
export interface PoseFrame {
  image: Landmark[];
  world: Landmark[] | null;
  aspect: number;
  timestamp: number;
}

export type GestureName = 'GUARD' | 'DUCK' | 'PUNCH';
export const GESTURES: readonly GestureName[] = ['GUARD', 'DUCK', 'PUNCH'];

export type Side = 'left' | 'right';

export type BodyRegion = 'leftArm' | 'rightArm' | 'arms' | 'legs' | 'hips' | 'body';

export type IssueCode =
  | 'GUARD_LEFT_LOW'
  | 'GUARD_RIGHT_LOW'
  | 'GUARD_BOTH_LOW'
  | 'GUARD_HANDS_HIDDEN'
  | 'DUCK_NOT_LOW'
  | 'DUCK_KNEES'
  | 'DUCK_BODY_HIDDEN'
  | 'PUNCH_ELBOW'
  | 'PUNCH_REACH'
  | 'PUNCH_TOO_HIGH'
  | 'PUNCH_TOO_LOW'
  | 'PUNCH_ARM_HIDDEN';

export interface FormIssue {
  code: IssueCode;
  message: string;
  region: BodyRegion;
  /** minor = close to valid, major = far off */
  severity: 'minor' | 'major';
}

/** A landmark the overlay should highlight, optionally with a metric label (e.g. "124°"). */
export interface FocusPoint {
  index: number;
  label?: string;
}

export type EvaluationStatus =
  /** gesture rules satisfied on this frame */
  | 'valid'
  /** the player is clearly attempting the gesture but the form is off */
  | 'partial'
  /** not attempting */
  | 'idle'
  /** required landmarks not visible enough to judge */
  | 'unknown';

export interface GestureEvaluation {
  gesture: GestureName;
  status: EvaluationStatus;
  /** 0..1 how close the pose is to a valid gesture */
  progress: number;
  issue: FormIssue | null;
  focus: FocusPoint[];
  metrics: Record<string, number>;
}

/** Standing baseline captured during the 3-second calibration (image units, x scaled by aspect). */
export interface Calibration {
  shoulderY: number;
  hipY: number;
  torsoLength: number;
  shoulderWidth: number;
  hipsVisible: boolean;
  legsVisible: boolean;
}
