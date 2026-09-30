import type { GestureName } from '../motion/poseTypes';

export interface GestureInfo {
  name: GestureName;
  label: string;
  action: string;
  hazard: string;
  rule: string;
  tip: string;
}

export const GESTURE_INFO: Record<GestureName, GestureInfo> = {
  GUARD: {
    name: 'GUARD',
    label: 'Guard',
    action: 'Block the energy blast',
    hazard: 'Incoming blast',
    rule: 'Both wrists above your shoulders',
    tip: 'Bring both fists up beside your face and hold for a beat.',
  },
  DUCK: {
    name: 'DUCK',
    label: 'Duck',
    action: 'Dodge the laser sweep',
    hazard: 'Laser sweep',
    rule: 'Hips drop below your standing height, knees bent',
    tip: 'Squat down fast — bend your knees and sink your hips.',
  },
  PUNCH: {
    name: 'PUNCH',
    label: 'Punch',
    action: 'Smash the drone',
    hazard: 'Drone target',
    rule: 'One arm straight out at shoulder height, elbow > 155°',
    tip: 'Drive one fist forward or to the side and lock the elbow.',
  },
};
