/**
 * Synthetic poses built from plausible body proportions. Used by the unit tests and by
 * the ?sim keyboard simulation mode (testing the full game flow without a camera).
 */
import { LM, type Calibration, type Landmark, type PoseFrame } from './poseTypes';

export const ASPECT = 16 / 9;
const CX = ASPECT / 2; // horizontal centre in isotropic units

type P2 = [number, number];
type P3 = [number, number, number];

/**
 * Standing pose. Image coords are given in isotropic units (frame heights) and converted
 * to MediaPipe-normalized x (x / aspect). The person faces the camera, so their LEFT side
 * appears on the image's right (larger x).
 */
export const STANDING_IMAGE: Record<number, P2> = {
  [LM.NOSE]: [CX, 0.18],
  [LM.LEFT_SHOULDER]: [CX + 0.1, 0.3],
  [LM.RIGHT_SHOULDER]: [CX - 0.1, 0.3],
  [LM.LEFT_ELBOW]: [CX + 0.12, 0.45],
  [LM.RIGHT_ELBOW]: [CX - 0.12, 0.45],
  [LM.LEFT_WRIST]: [CX + 0.13, 0.58],
  [LM.RIGHT_WRIST]: [CX - 0.13, 0.58],
  [LM.LEFT_HIP]: [CX + 0.07, 0.6],
  [LM.RIGHT_HIP]: [CX - 0.07, 0.6],
  [LM.LEFT_KNEE]: [CX + 0.07, 0.78],
  [LM.RIGHT_KNEE]: [CX - 0.07, 0.78],
  [LM.LEFT_ANKLE]: [CX + 0.07, 0.95],
  [LM.RIGHT_ANKLE]: [CX - 0.07, 0.95],
};

/** Metric world coords, hip-centred, y down, -z towards the camera. */
export const STANDING_WORLD: Record<number, P3> = {
  [LM.NOSE]: [0, -0.62, -0.05],
  [LM.LEFT_SHOULDER]: [0.18, -0.5, 0],
  [LM.RIGHT_SHOULDER]: [-0.18, -0.5, 0],
  [LM.LEFT_ELBOW]: [0.2, -0.22, 0],
  [LM.RIGHT_ELBOW]: [-0.2, -0.22, 0],
  [LM.LEFT_WRIST]: [0.21, 0.04, 0],
  [LM.RIGHT_WRIST]: [-0.21, 0.04, 0],
  [LM.LEFT_HIP]: [0.1, 0, 0],
  [LM.RIGHT_HIP]: [-0.1, 0, 0],
  [LM.LEFT_KNEE]: [0.1, 0.45, 0],
  [LM.RIGHT_KNEE]: [-0.1, 0.45, 0],
  [LM.LEFT_ANKLE]: [0.1, 0.9, 0],
  [LM.RIGHT_ANKLE]: [-0.1, 0.9, 0],
};

export interface PoseOverrides {
  image?: Record<number, P2>;
  world?: Record<number, P3>;
  visibility?: Record<number, number>;
  noWorld?: boolean;
}

/** `aspect` lets the simulator target portrait video; the body is re-centred horizontally. */
export function makePose(o: PoseOverrides = {}, timestamp = 0, aspect = ASPECT): PoseFrame {
  const img = { ...STANDING_IMAGE, ...o.image };
  const dx = aspect / 2 - CX;
  const wld = { ...STANDING_WORLD, ...o.world };
  const image: Landmark[] = [];
  const world: Landmark[] = [];
  for (let i = 0; i < 33; i++) {
    const vis = o.visibility?.[i] ?? (img[i] ? 0.95 : 0.9);
    const [x, y] = img[i] ?? [CX, 0.2];
    image.push({ x: (x + dx) / aspect, y, z: 0, visibility: vis });
    const [wx, wy, wz] = wld[i] ?? [0, -0.6, 0];
    world.push({ x: wx, y: wy, z: wz, visibility: vis });
  }
  return { image, world: o.noWorld ? null : world, aspect, timestamp };
}

export const CALIB: Calibration = {
  shoulderY: 0.3,
  hipY: 0.6,
  torsoLength: 0.3,
  shoulderWidth: 0.2,
  hipsVisible: true,
  legsVisible: true,
};

const rad = (d: number) => (d * Math.PI) / 180;

/** World coordinates for a leg whose hip-knee-ankle angle is `deg` (bending in the y-z plane). */
export function worldLeg(side: 'left' | 'right', deg: number, hipY = 0): Record<number, P3> {
  const x = side === 'left' ? 0.1 : -0.1;
  const hip: P3 = [x, hipY, 0];
  // thigh goes forward (towards camera) and down; place knee 0.45 m from hip at 45° to vertical for a bent leg
  const thighTilt = rad((180 - deg) / 2);
  const knee: P3 = [x, hipY + 0.45 * Math.cos(thighTilt), -0.45 * Math.sin(thighTilt)];
  // shin tilts back by the same amount so the angle at the knee is `deg`
  const ankle: P3 = [x, knee[1] + 0.45 * Math.cos(thighTilt), knee[2] + 0.45 * Math.sin(thighTilt)];
  return side === 'left'
    ? { [LM.LEFT_HIP]: hip, [LM.LEFT_KNEE]: knee, [LM.LEFT_ANKLE]: ankle }
    : { [LM.RIGHT_HIP]: hip, [LM.RIGHT_KNEE]: knee, [LM.RIGHT_ANKLE]: ankle };
}

/**
 * World coordinates for a right arm pointing forward (towards the camera) with the
 * given elbow angle; the forearm bends outward in the x-z plane. `pitchUp` rotates the
 * whole arm upward (degrees).
 */
export function worldRightArm(elbowDeg: number, pitchUp = 0): Record<number, P3> {
  const s: P3 = [-0.18, -0.5, 0];
  const p = rad(pitchUp);
  // upper arm forward (−z) pitched up
  const e: P3 = [s[0], s[1] - 0.3 * Math.sin(p), s[2] - 0.3 * Math.cos(p)];
  const bend = rad(180 - elbowDeg);
  const dirF = [0, -Math.sin(p), -Math.cos(p)]; // forward direction of the upper arm
  const w: P3 = [
    e[0] - 0.28 * Math.sin(bend),
    e[1] + 0.28 * Math.cos(bend) * dirF[1],
    e[2] + 0.28 * Math.cos(bend) * dirF[2],
  ];
  return { [LM.RIGHT_SHOULDER]: s, [LM.RIGHT_ELBOW]: e, [LM.RIGHT_WRIST]: w };
}

type PoseName = 'neutral' | 'guard' | 'guardLeftOnly' | 'duck' | 'halfDuck' | 'punch' | 'bentPunch';

const shiftDown = (ids: number[], dy: number): Record<number, P2> =>
  Object.fromEntries(ids.map((i) => [i, [STANDING_IMAGE[i][0], STANDING_IMAGE[i][1] + dy]]));

const UPPER = [LM.NOSE, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_ELBOW, LM.RIGHT_ELBOW, LM.LEFT_WRIST, LM.RIGHT_WRIST];

export const SIM_POSES: Record<PoseName, PoseOverrides> = {
  neutral: {},
  guard: {
    image: {
      [LM.LEFT_ELBOW]: [CX + 0.16, 0.33],
      [LM.RIGHT_ELBOW]: [CX - 0.16, 0.33],
      [LM.LEFT_WRIST]: [CX + 0.1, 0.2],
      [LM.RIGHT_WRIST]: [CX - 0.1, 0.2],
    },
    world: {
      [LM.LEFT_ELBOW]: [0.24, -0.38, -0.1],
      [LM.RIGHT_ELBOW]: [-0.24, -0.38, -0.1],
      [LM.LEFT_WRIST]: [0.14, -0.64, -0.15],
      [LM.RIGHT_WRIST]: [-0.14, -0.64, -0.15],
    },
  },
  guardLeftOnly: {
    image: { [LM.LEFT_ELBOW]: [CX + 0.16, 0.33], [LM.LEFT_WRIST]: [CX + 0.1, 0.2], [LM.RIGHT_WRIST]: [CX - 0.13, 0.4] },
    world: { [LM.LEFT_ELBOW]: [0.24, -0.38, -0.1], [LM.LEFT_WRIST]: [0.14, -0.64, -0.15] },
  },
  duck: {
    image: {
      ...shiftDown(UPPER, 0.12),
      [LM.LEFT_HIP]: [CX + 0.07, 0.72],
      [LM.RIGHT_HIP]: [CX - 0.07, 0.72],
      [LM.LEFT_KNEE]: [CX + 0.12, 0.8],
      [LM.RIGHT_KNEE]: [CX - 0.12, 0.8],
    },
    world: { ...worldLeg('left', 95), ...worldLeg('right', 95) },
  },
  halfDuck: {
    image: {
      ...shiftDown(UPPER, 0.04),
      [LM.LEFT_HIP]: [CX + 0.07, 0.64],
      [LM.RIGHT_HIP]: [CX - 0.07, 0.64],
    },
    world: { ...worldLeg('left', 124), ...worldLeg('right', 124) },
  },
  punch: {
    image: { [LM.RIGHT_ELBOW]: [CX - 0.12, 0.31], [LM.RIGHT_WRIST]: [CX - 0.14, 0.32] },
    world: worldRightArm(175),
  },
  bentPunch: {
    image: { [LM.RIGHT_ELBOW]: [CX - 0.12, 0.32], [LM.RIGHT_WRIST]: [CX - 0.19, 0.33] },
    world: worldRightArm(136),
  },
};

export type SimPoseName = PoseName;
