import { describe, expect, it } from 'vitest';
import rawBrand from '../../../brand.config.json';
import { brand, brandText, resolveBrand } from './brand';

describe('brand config', () => {
  it('resolves the active preset from brand.config.json', () => {
    expect(brand.key).toBe(rawBrand.active);
    expect(brand.displayName.length).toBeGreaterThan(0);
    expect(brand.editionName).toBe(`${brand.shortName}: ${brand.edition}`);
  });

  it('switches name by changing only "active"', () => {
    for (const key of Object.keys(rawBrand.presets)) {
      const b = resolveBrand({ ...rawBrand, active: key });
      expect(b.key).toBe(key);
      expect(b.editionName.startsWith(b.shortName)).toBe(true);
    }
  });

  it('rejects an "active" key that has no preset', () => {
    expect(() => resolveBrand({ ...rawBrand, active: 'nope' })).toThrow();
  });

  it('fills {game}/{hero}/{edition} placeholders', () => {
    expect(brandText('{hero} in {game}')).toBe(`${brand.hero.name} in ${brand.displayName}`);
  });
});
