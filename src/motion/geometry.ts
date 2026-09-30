import type { Landmark, Vec3 } from './poseTypes';

export const DEFAULT_MIN_VISIBILITY = 0.5;

export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));

export const toDeg = (rad: number): number => (rad * 180) / Math.PI;

export function isVisible(lm: Landmark | undefined, min = DEFAULT_MIN_VISIBILITY): lm is Landmark {
  return !!lm && Number.isFinite(lm.x) && Number.isFinite(lm.y) && (lm.visibility ?? 0) >= min;
}

export function allVisible(lms: Landmark[], indices: number[], min = DEFAULT_MIN_VISIBILITY): boolean {
  return indices.every((i) => isVisible(lms[i], min));
}

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export const length3 = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);

export const distance3 = (a: Vec3, b: Vec3): number => length3(sub(a, b));

export const distance2 = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y);

export const midpoint = (a: Vec3, b: Vec3): Vec3 => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
});

/**
 * Convert a normalized image landmark into isotropic image units: x is scaled by
 * the frame aspect ratio so that 1 unit in x equals 1 unit in y (the frame height).
 * z is dropped, image geometry is treated as 2D.
 */
export function toImagePoint(lm: Landmark, aspect: number): Landmark {
  return { x: lm.x * aspect, y: lm.y, z: 0, visibility: lm.visibility };
}

/**
 * Angle ABC in degrees (the angle at vertex B), in 3D. Returns NaN for degenerate input.
 * Pass points with z = 0 for a 2D angle.
 */
export function angleDeg(a: Vec3, b: Vec3, c: Vec3): number {
  const ba = sub(a, b);
  const bc = sub(c, b);
  const la = length3(ba);
  const lc = length3(bc);
  if (la < 1e-9 || lc < 1e-9) return NaN;
  const cos = clamp((ba.x * bc.x + ba.y * bc.y + ba.z * bc.z) / (la * lc), -1, 1);
  return toDeg(Math.acos(cos));
}

/**
 * Elevation of the vector from -> to above the horizontal plane, in degrees.
 * Coordinates are y-down (MediaPipe convention), so a target above `from` gives a positive value.
 * +90 = straight up, 0 = horizontal (sideways or towards the camera), -90 = straight down.
 */
export function elevationDeg(from: Vec3, to: Vec3): number {
  const d = sub(to, from);
  const horizontal = Math.hypot(d.x, d.z);
  if (horizontal < 1e-9 && Math.abs(d.y) < 1e-9) return NaN;
  return toDeg(Math.atan2(-d.y, horizontal));
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const round = (v: number): number => Math.round(v);
