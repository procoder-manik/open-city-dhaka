import { describe, expect, it } from 'vitest';
import { boxToAABB, raycastAABBs } from './raycast';

const wall = boxToAABB([5, 2, 0], [0.5, 2, 5]); // wall from x=4.5 to 5.5

describe('raycastAABBs', () => {
  it('hits a wall in front of the ray', () => {
    expect(raycastAABBs(0, 1, 0, 1, 0, 0, 10, [wall])).toBeCloseTo(4.5);
  });

  it('misses when pointing away or out of range', () => {
    expect(raycastAABBs(0, 1, 0, -1, 0, 0, 10, [wall])).toBe(Infinity);
    expect(raycastAABBs(0, 1, 0, 1, 0, 0, 3, [wall])).toBe(Infinity);
  });

  it('ignores a box that contains the ray origin', () => {
    expect(raycastAABBs(5, 1, 0, 1, 0, 0, 10, [wall])).toBe(Infinity);
  });

  it('returns the nearest of several boxes', () => {
    const near = boxToAABB([2, 1, 0], [0.2, 1, 1]);
    expect(raycastAABBs(0, 1, 0, 1, 0, 0, 10, [wall, near])).toBeCloseTo(1.8);
  });

  it('handles diagonal rays', () => {
    const d = Math.SQRT1_2;
    const t = raycastAABBs(0, 1, -4.5 + 0.0001, d, 0, d, 20, [wall]);
    expect(t).toBeCloseTo(4.5 / d, 2);
  });
});
