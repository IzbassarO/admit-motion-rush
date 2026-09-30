import { describe, expect, it } from 'vitest';
import { angleDeg, clamp, distance2, elevationDeg, isVisible, median, midpoint, toImagePoint } from '../geometry';

const v = (x: number, y: number, z = 0) => ({ x, y, z });

describe('geometry', () => {
  it('computes joint angles in 2D and 3D', () => {
    expect(angleDeg(v(1, 0), v(0, 0), v(0, 1))).toBeCloseTo(90);
    expect(angleDeg(v(-1, 0), v(0, 0), v(1, 0))).toBeCloseTo(180);
    expect(angleDeg(v(1, 0), v(0, 0), v(1, 1))).toBeCloseTo(45);
    expect(angleDeg(v(0, 0, 1), v(0, 0, 0), v(0, 1, 0))).toBeCloseTo(90);
  });

  it('returns NaN for degenerate angles', () => {
    expect(angleDeg(v(0, 0), v(0, 0), v(1, 0))).toBeNaN();
  });

  it('computes elevation with y pointing down', () => {
    expect(elevationDeg(v(0, 0), v(0, -1))).toBeCloseTo(90); // up
    expect(elevationDeg(v(0, 0), v(0, 1))).toBeCloseTo(-90); // down
    expect(elevationDeg(v(0, 0), v(1, 0))).toBeCloseTo(0); // sideways
    expect(elevationDeg(v(0, 0, 0), v(0, 0, -1))).toBeCloseTo(0); // towards camera
    expect(elevationDeg(v(0, 0), v(1, -1))).toBeCloseTo(45);
  });

  it('scales x by aspect ratio for isotropic image space', () => {
    const p = toImagePoint({ x: 0.5, y: 0.25, z: 0.3, visibility: 1 }, 16 / 9);
    expect(p.x).toBeCloseTo(8 / 9);
    expect(p.y).toBe(0.25);
    expect(p.z).toBe(0);
  });

  it('has working helpers', () => {
    expect(clamp(2)).toBe(1);
    expect(clamp(-1)).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNaN();
    expect(distance2(v(0, 0), v(3, 4))).toBe(5);
    expect(midpoint(v(0, 0), v(2, 4))).toEqual(v(1, 2));
    expect(isVisible({ x: 0, y: 0, z: 0, visibility: 0.4 })).toBe(false);
    expect(isVisible({ x: 0, y: 0, z: 0, visibility: 0.6 })).toBe(true);
    expect(isVisible(undefined)).toBe(false);
  });
});
