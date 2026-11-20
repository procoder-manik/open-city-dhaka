import { describe, expect, it } from 'vitest';
import {
  applyImpact,
  burnFuel,
  enginePower,
  impactZone,
  newCondition,
  totalDamage,
} from './condition';

describe('vehicle condition', () => {
  it('maps impacts to the right zone', () => {
    expect(impactZone(0, -10)).toBe('front'); // was moving forward, stopped hard
    expect(impactZone(0, 8)).toBe('rear');
    expect(impactZone(-6, 1)).toBe('left');
    expect(impactZone(6, 1)).toBe('right');
  });

  it('ignores gentle bumps and caps damage at 100', () => {
    const c = newCondition();
    expect(applyImpact(c, 'front', 1.5)).toBe(0);
    for (let i = 0; i < 10; i++) applyImpact(c, 'front', 20);
    expect(c.damage.front).toBe(100);
    expect(totalDamage(c)).toBe(40);
  });

  it('engine dies with a wrecked front or an empty tank', () => {
    const c = newCondition();
    expect(enginePower(c)).toBe(1);
    c.damage.front = 50;
    expect(enginePower(c)).toBeCloseTo(0.7);
    c.fuel = 0;
    expect(enginePower(c)).toBe(0);
  });

  it('burns more fuel at full throttle', () => {
    const a = newCondition();
    const b = newCondition();
    burnFuel(a, 'car', 0, 10);
    burnFuel(b, 'car', 1, 10);
    expect(b.fuel).toBeLessThan(a.fuel);
  });
});
