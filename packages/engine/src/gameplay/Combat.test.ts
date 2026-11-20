import { describe, expect, it } from 'vitest';
import {
  blastFalloff,
  copHitChance,
  newArsenal,
  nextWeapon,
  policeFor,
  rayBox,
  raySphere,
} from './Combat';

describe('Combat', () => {
  it('ray hits a sphere in front and misses one behind', () => {
    const o = { x: 0, y: 1, z: 0 };
    const d = { x: 0, y: 0, z: 1 };
    expect(raySphere(o, d, { x: 0, y: 1, z: 10 }, 0.5)).toBeCloseTo(9.5);
    expect(raySphere(o, d, { x: 0, y: 1, z: -10 }, 0.5)).toBeNull();
    expect(raySphere(o, d, { x: 3, y: 1, z: 10 }, 0.5)).toBeNull();
  });

  it('ray hits a box', () => {
    const t = rayBox(
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 5, y: 0, z: -1 },
      { x: 6, y: 3, z: 1 },
    );
    expect(t).toBeCloseTo(5);
    expect(
      rayBox(
        { x: 0, y: 5, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 5, y: 0, z: -1 },
        { x: 6, y: 3, z: 1 },
      ),
    ).toBeNull();
  });

  it('blast falls off to zero at the radius', () => {
    expect(blastFalloff(0, 8)).toBe(1);
    expect(blastFalloff(4, 8)).toBeCloseTo(0.25);
    expect(blastFalloff(9, 8)).toBe(0);
  });

  it('cycles only to usable weapons', () => {
    const a = newArsenal();
    expect(nextWeapon(a)).toBe('pistol');
    a.ammo = 0;
    expect(nextWeapon(a)).toBe('grenade');
    a.grenades = 0;
    expect(nextWeapon(a)).toBe('fist');
  });

  it('scales police with stars and misses more at range', () => {
    expect(policeFor(0)).toEqual({ cops: 0, cars: 0 });
    expect(policeFor(1).cars).toBe(0);
    expect(policeFor(5)).toEqual({ cops: 6, cars: 3 });
    expect(copHitChance(5, false, 0)).toBeGreaterThan(copHitChance(25, false, 0));
    expect(copHitChance(10, true, 15)).toBeLessThan(copHitChance(10, false, 0));
  });
});
