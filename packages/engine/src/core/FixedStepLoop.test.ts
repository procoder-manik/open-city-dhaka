import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from './FixedStepLoop';

describe('FixedStepLoop', () => {
  it('runs one step per 1/60 s', () => {
    const loop = new FixedStepLoop(1 / 60);
    expect(loop.advance(1 / 60).steps).toBe(1);
    expect(loop.advance(2 / 60).steps).toBe(2);
  });

  it('accumulates partial frames', () => {
    const loop = new FixedStepLoop(1 / 60);
    expect(loop.advance(1 / 120).steps).toBe(0);
    const r = loop.advance(1 / 120 + 1e-6);
    expect(r.steps).toBe(1);
  });

  it('caps steps on long frames (no spiral of death)', () => {
    const loop = new FixedStepLoop(1 / 60, 5);
    expect(loop.advance(2).steps).toBe(5);
    expect(loop.advance(0).steps).toBeLessThanOrEqual(1);
  });

  it('ignores negative time and returns alpha in [0,1)', () => {
    const loop = new FixedStepLoop(1 / 60);
    expect(loop.advance(-1).steps).toBe(0);
    const { alpha } = loop.advance(1 / 90);
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
  });
});
