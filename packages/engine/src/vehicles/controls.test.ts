import { describe, expect, it } from 'vitest';
import { getVehicleDef, vehicleDefs } from '@game/content';
import { computeVehicleControls } from './controls';

const car = getVehicleDef('car-sedan');
const idle = { throttle: 0, steer: 0, handbrake: false };

describe('computeVehicleControls', () => {
  it('accelerates forward from standstill', () => {
    const c = computeVehicleControls(car, { ...idle, throttle: 1 }, 0, 0, 1 / 60);
    expect(c.engine).toBeCloseTo(car.engineForce);
    expect(c.brake).toBe(0);
  });

  it('cuts engine force at top speed', () => {
    const c = computeVehicleControls(
      car,
      { ...idle, throttle: 1 },
      car.maxSpeedKmh / 3.6,
      0,
      1 / 60,
    );
    expect(c.engine).toBeCloseTo(0);
  });

  it('brakes when pulling back while moving forward, reverses when stopped', () => {
    const braking = computeVehicleControls(car, { ...idle, throttle: -1 }, 10, 0, 1 / 60);
    expect(braking.brake).toBeGreaterThan(0);
    expect(braking.engine).toBe(0);
    const reversing = computeVehicleControls(car, { ...idle, throttle: -1 }, 0, 0, 1 / 60);
    expect(reversing.engine).toBeLessThan(0);
  });

  it('steers right with negative wheel angle, smoothed over time', () => {
    let steer = 0;
    for (let i = 0; i < 3; i++)
      steer = computeVehicleControls(car, { ...idle, steer: 1 }, 0, steer, 1 / 60).steer;
    expect(steer).toBeLessThan(0);
    expect(Math.abs(steer)).toBeLessThan(car.maxSteer);
    for (let i = 0; i < 120; i++)
      steer = computeVehicleControls(car, { ...idle, steer: 1 }, 0, steer, 1 / 60).steer;
    expect(steer).toBeCloseTo(-car.maxSteer, 2);
  });

  it('reduces steering lock at speed', () => {
    let slow = 0;
    let fast = 0;
    for (let i = 0; i < 200; i++) {
      slow = computeVehicleControls(car, { ...idle, steer: 1 }, 2, slow, 1 / 60).steer;
      fast = computeVehicleControls(car, { ...idle, steer: 1 }, 30, fast, 1 / 60).steer;
    }
    expect(Math.abs(fast)).toBeLessThan(Math.abs(slow) * 0.6);
  });

  it('every vehicle def has at least one drive and one steer wheel', () => {
    for (const d of vehicleDefs) {
      expect(d.wheels.some((w) => w.drive)).toBe(true);
      expect(d.wheels.some((w) => w.steer)).toBe(true);
    }
  });
});
