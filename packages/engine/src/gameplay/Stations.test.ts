import { describe, expect, it } from 'vitest';
import type { Station } from '@game/shared';
import {
  RESPRAY_TAKA,
  REPAIR_TAKA_PER_PERCENT,
  SERVICE_SECONDS,
  StationSystem,
  TANK_TAKA,
  type StationFacts,
} from './Stations';

const PUMP: Station = { id: 'p', type: 'pump', name: 'P', x: 0, z: 0, roadX: 0, roadZ: 10 };
const GARAGE: Station = { id: 'g', type: 'garage', name: 'G', x: 100, z: 0, roadX: 100, roadZ: 10 };

const facts = (o: Partial<StationFacts> = {}): StationFacts => ({
  x: 0,
  z: 0,
  vehicle: 'car',
  speed: 0,
  fuel: 0.5,
  damage: 0,
  wanted: 0,
  copNear: false,
  taka: 1000,
  ...o,
});

describe('StationSystem — pump', () => {
  it('fills a stopped vehicle over time and charges for it', () => {
    const s = new StationSystem([PUMP]);
    let fuel = 0.5;
    let taka = 1000;
    let done = null;
    for (let i = 0; i < 40 && !done; i++) {
      for (const e of s.update(0.25, facts({ fuel, taka }))) {
        if (e.type === 'fuel') {
          fuel += e.add;
          taka -= e.cost;
        }
        if (e.type === 'fuelDone') done = e;
      }
    }
    expect(fuel).toBeCloseTo(1, 3);
    expect(1000 - taka).toBeCloseTo(TANK_TAKA.car * 0.5, 0);
    expect(done).toMatchObject({ reason: 'full', spent: Math.round(TANK_TAKA.car * 0.5) });
    // Served: nothing more until you leave and come back
    expect(s.update(1, facts({ fuel: 0.2 }))).toEqual([]);
    s.update(1, facts({ x: 50 }));
    expect(s.update(0.25, facts({ fuel: 0.2 }))[0]?.type).toBe('fuel');
  });

  it("doesn't fill while moving, stops when broke, ignores people on foot", () => {
    const s = new StationSystem([PUMP]);
    expect(s.update(1, facts({ speed: 5 }))).toEqual([]);
    expect(s.update(1, facts({ vehicle: null }))).toEqual([]);
    const broke = new StationSystem([PUMP]);
    let spent = 0;
    let end = null;
    for (let i = 0; i < 20 && !end; i++)
      for (const e of broke.update(0.25, facts({ fuel: 0.1, taka: 90 - spent }))) {
        if (e.type === 'fuel') spent += e.cost;
        if (e.type === 'fuelDone') end = e;
      }
    expect(end).toMatchObject({ reason: 'broke' });
    expect(spent).toBeCloseTo(90, 3);
  });
});

describe('StationSystem — garage', () => {
  const at = (o: Partial<StationFacts> = {}) => facts({ x: 100, ...o });
  const serve = (s: StationSystem, f: StationFacts) => {
    let out = null;
    for (let t = 0; t <= SERVICE_SECONDS + 0.5 && !out; t += 0.5)
      out = s.update(0.5, f).find((e) => e.type === 'service') ?? null;
    return out;
  };

  it('repairs and resprays (wipes wanted) after a short wait', () => {
    const s = new StationSystem([GARAGE]);
    expect(s.update(0.5, at({ damage: 40, wanted: 2 }))).toEqual([]);
    expect(serve(s, at({ damage: 40, wanted: 2 }))).toMatchObject({
      repaired: true,
      resprayed: true,
      cost: 40 * REPAIR_TAKA_PER_PERCENT + RESPRAY_TAKA,
      note: 'ok',
    });
  });

  it('no respray with a cop watching; nothing to do; too poor', () => {
    expect(
      serve(new StationSystem([GARAGE]), at({ damage: 10, wanted: 3, copNear: true })),
    ).toMatchObject({
      repaired: true,
      resprayed: false,
      note: 'seen',
    });
    expect(serve(new StationSystem([GARAGE]), at())).toMatchObject({ note: 'nothing' });
    expect(serve(new StationSystem([GARAGE]), at({ wanted: 1, taka: 100 }))).toMatchObject({
      note: 'broke',
      cost: 0,
    });
  });
});
