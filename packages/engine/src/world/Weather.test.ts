import { describe, expect, it } from 'vitest';
import { WeatherCycle } from './Weather';

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
