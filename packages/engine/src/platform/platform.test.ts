import { describe, expect, it } from 'vitest';
import { DynamicResolution } from './DynamicResolution';
import { pickQualityTier } from './quality';

describe('pickQualityTier', () => {
  it('uses lite for software rendering', () => {
    expect(
      pickQualityTier({ formFactor: 'desktop', gpu: 'Google SwiftShader', memoryGb: 8, cores: 8 }),
    ).toBe('lite');
  });

  it('uses lite for low-memory phones and mobile for normal phones', () => {
    expect(pickQualityTier({ formFactor: 'phone', gpu: 'Mali-G57', memoryGb: 3, cores: 8 })).toBe(
      'lite',
    );
    expect(
      pickQualityTier({ formFactor: 'phone', gpu: 'Adreno (TM) 710', memoryGb: 6, cores: 8 }),
    ).toBe('mobile');
    expect(
      pickQualityTier({ formFactor: 'phone', gpu: 'Apple GPU', memoryGb: null, cores: 6 }),
    ).toBe('mobile');
  });

  it('picks medium for strong tablets', () => {
    expect(
      pickQualityTier({ formFactor: 'tablet', gpu: 'Apple GPU', memoryGb: null, cores: 8 }),
    ).toBe('medium');
    expect(pickQualityTier({ formFactor: 'tablet', gpu: 'Mali-G52', memoryGb: 4, cores: 8 })).toBe(
      'mobile',
    );
  });

  it('picks high for gaming GPUs and medium for integrated', () => {
    expect(
      pickQualityTier({
        formFactor: 'desktop',
        gpu: 'ANGLE (NVIDIA GeForce RTX 3060)',
        memoryGb: 8,
        cores: 12,
      }),
    ).toBe('high');
    expect(
      pickQualityTier({
        formFactor: 'desktop',
        gpu: 'ANGLE (Intel(R) Iris(R) Xe Graphics)',
        memoryGb: 8,
        cores: 8,
      }),
    ).toBe('medium');
  });
});

describe('DynamicResolution', () => {
  it('lowers scale when frames are slow, never below min', () => {
    const dr = new DynamicResolution(60, 0.5, 1, 0.1, 0);
    for (let i = 0; i < 200; i++) dr.sample(40);
    expect(dr.scale).toBe(0.5);
  });

  it('raises scale back up when there is headroom, never above max', () => {
    const dr = new DynamicResolution(30, 0.5, 0.8, 0.1, 0);
    dr.reset(30, 0.5);
    for (let i = 0; i < 200; i++) dr.sample(10);
    expect(dr.scale).toBe(0.8);
  });

  it('holds steady inside the budget band', () => {
    const dr = new DynamicResolution(60, 0.5, 1, 0.05, 0);
    for (let i = 0; i < 200; i++) dr.sample(1000 / 60);
    expect(dr.scale).toBe(1);
  });
});
