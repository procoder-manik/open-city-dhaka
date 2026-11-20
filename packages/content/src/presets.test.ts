import { describe, expect, it } from 'vitest';
import { QUALITY_TIERS } from '@game/shared';
import { qualityPresets } from './index';

describe('quality presets', () => {
  it('defines every tier and passes schema validation', () => {
    for (const t of QUALITY_TIERS) expect(qualityPresets[t]).toBeDefined();
  });

  it('keeps min resolution ≤ max resolution', () => {
    for (const t of QUALITY_TIERS) {
      const p = qualityPresets[t];
      expect(p.minResolutionScale).toBeLessThanOrEqual(p.resolutionScale);
    }
  });

  it('caps mobile tiers at 30 FPS for battery and heat', () => {
    expect(qualityPresets.lite.fpsCap).toBe(30);
    expect(qualityPresets.mobile.fpsCap).toBe(30);
  });
});
