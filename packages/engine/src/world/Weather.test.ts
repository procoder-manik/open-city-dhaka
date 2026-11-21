import { describe, expect, it } from 'vitest';
import { Blackout, WeatherCycle } from './Weather';

const step = (w: WeatherCycle, seconds: number, dt = 0.5) => {
  const ev = [];
  for (let t = 0; t < seconds; t += dt) ev.push(...w.update(dt));
  return ev;
};

describe('WeatherCycle', () => {
  it('stays dry, then a shower builds up gradually and ends', () => {
    const w = new WeatherCycle(() => 0.5, 60);
    expect(step(w, 50)).toEqual([]);
    expect(w.intensity).toBe(0);
    const ev = step(w, 30);
    expect(ev.some((e) => e.type === 'rainStart')).toBe(true);
    expect(w.intensity).toBeGreaterThan(0.15);
    expect(w.intensity).toBeLessThan(0.7); // ramps, never pops in
    const later = step(w, 600);
    expect(later.some((e) => e.type === 'rainStop')).toBe(true);
  });

  it('forced rain thunders and clear mode never rains', () => {
    const w = new WeatherCycle(() => 0.3, 5);
    w.setMode('rain');
    const ev = step(w, 120);
    expect(w.intensity).toBeCloseTo(0.85, 2);
    expect(ev.some((e) => e.type === 'thunder')).toBe(true);
    w.setMode('clear');
    step(w, 2000);
    expect(w.intensity).toBe(0);
  });

  it('roads dry slower than they get wet', () => {
    const w = new WeatherCycle(() => 0.5);
    w.intensity = 1;
    let wet = 0;
    for (let i = 0; i < 40; i++) wet = w.wetness(wet, 0.5);
    expect(wet).toBe(1);
    w.intensity = 0;
    for (let i = 0; i < 40; i++) wet = w.wetness(wet, 0.5);
    expect(wet).toBeGreaterThan(0.8);
  });
});

describe('Blackout', () => {
  const run = (b: Blackout, seconds: number, night: number) => {
    const ev = [];
    for (let t = 0; t < seconds; t += 0.25) ev.push(...b.update(0.25, night));
    return ev;
  };

  it('only cuts the power at night, then restores it with a flicker', () => {
    const b = new Blackout(() => 0.5, 10);
    expect(run(b, 60, 0)).toEqual([]); // daytime: never
    const ev = run(b, 40, 1);
    expect(ev[0]).toEqual({ type: 'cut' });
    expect(b.active).toBe(true);
    expect(b.level).toBe(1);
    const back = run(b, 40, 1);
    expect(back.some((e) => e.type === 'restore')).toBe(true);
    expect(b.active).toBe(false);
    run(b, 3, 1);
    expect(b.level).toBe(0);
  });

  it('a forced cut works any time', () => {
    const b = new Blackout(() => 0.5, 999);
    b.cut(5);
    run(b, 1, 0);
    expect(b.active).toBe(true);
    run(b, 5, 0);
    expect(b.active).toBe(false);
  });
});
