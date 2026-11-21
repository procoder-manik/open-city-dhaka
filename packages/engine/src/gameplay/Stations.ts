import type { Station } from '@game/shared';

/**
 * Petrol pumps and garages (pure logic, unit tested).
 * Pump: stop on the forecourt → the tank fills, paid as it goes (stops when full or broke).
 * Garage: stop inside for a moment → repair (per damage %) + respray, which wipes the
 * wanted level — unless a cop is watching. One service per visit (leave to re-arm).
 */
export type StationVehicle = 'car' | 'cng' | 'bike';

/** Price of a full tank (৳). CNG runs on gas: cheaper. */
export const TANK_TAKA: Record<StationVehicle, number> = { car: 450, cng: 260, bike: 180 };
/** Tank fraction filled per second. */
export const FILL_RATE = 0.2;
export const REPAIR_TAKA_PER_PERCENT = 8;
export const RESPRAY_TAKA = 500;
/** Seconds to wait inside a garage before the job is done. */
export const SERVICE_SECONDS = 2.5;
/** Forecourt / workshop radius (m). */
export const ZONE_R = 7.5;
/** Counts as stopped below this speed (m/s). */
export const STOPPED = 1.5;

export interface StationFacts {
  x: number;
  z: number;
  vehicle: StationVehicle | null;
  /** |speed| in m/s */
  speed: number;
  /** 0..1 */
  fuel: number;
  /** overall damage 0..100 */
  damage: number;
  wanted: number;
  /** A cop within sight of the garage. */
  copNear: boolean;
  taka: number;
}

export type StationEvent =
  | { type: 'fuel'; station: Station; add: number; cost: number }
  | { type: 'fuelDone'; station: Station; spent: number; reason: 'full' | 'broke' }
  | {
      type: 'service';
      station: Station;
      repaired: boolean;
      resprayed: boolean;
      cost: number;
      /** Why something was skipped. */
      note: 'ok' | 'broke' | 'seen' | 'nothing';
    };

export interface StationStatus {
  station: Station;
  /** Pump: filling now. Garage: seconds until the job is done (null = done this visit). */
  filling: boolean;
  wait: number | null;
}

export class StationSystem {
  /** Station the player's vehicle is parked at, if any. */
  current: StationStatus | null = null;
  private servedAt: string | null = null;
  private wait = 0;
  private spent = 0;

  constructor(readonly stations: Station[]) {}

  /** Nearest station of any type within the zone radius. */
  at(x: number, z: number): Station | null {
    let best: Station | null = null;
    let bd = ZONE_R;
    for (const s of this.stations) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  update(dt: number, f: StationFacts): StationEvent[] {
    const ev: StationEvent[] = [];
    const s = f.vehicle ? this.at(f.x, f.z) : null;
    if (!s) {
      // Left the forecourt: re-arm, report an unfinished fill
      this.servedAt = null;
      this.wait = 0;
      this.spent = 0;
      this.current = null;
      return ev;
    }
    const stopped = f.speed < STOPPED;
    const done = this.servedAt === s.id;
    this.current = { station: s, filling: false, wait: done ? null : SERVICE_SECONDS - this.wait };
    if (done || !stopped || !f.vehicle) {
      if (!stopped) this.wait = 0;
      return ev;
    }

    if (s.type === 'pump') {
      const tank = TANK_TAKA[f.vehicle];
      const room = Math.max(0, 1 - f.fuel);
      if (room < 0.005) {
        this.finish(s, 'full', ev);
        return ev;
      }
      const affordable = f.taka / tank;
      if (affordable <= 0.0001) {
        this.finish(s, 'broke', ev);
        return ev;
      }
      const add = Math.min(FILL_RATE * dt, room, affordable);
      const cost = add * tank;
      this.spent += cost;
      this.current.filling = true;
      ev.push({ type: 'fuel', station: s, add, cost });
      if (add >= room - 1e-6) this.finish(s, 'full', ev);
      else if (add >= affordable - 1e-6) this.finish(s, 'broke', ev);
      return ev;
    }

    // Garage
    this.wait += dt;
    this.current.wait = Math.max(0, SERVICE_SECONDS - this.wait);
    if (this.wait < SERVICE_SECONDS) return ev;
    this.servedAt = s.id;
    this.current.wait = null;
    const repairCost = Math.round(f.damage * REPAIR_TAKA_PER_PERCENT);
    const wantRespray = f.wanted > 0;
    if (repairCost === 0 && !wantRespray) {
      ev.push({
        type: 'service',
        station: s,
        repaired: false,
        resprayed: false,
        cost: 0,
        note: 'nothing',
      });
      return ev;
    }
    const canRespray = wantRespray && !f.copNear;
    const cost = repairCost + (canRespray ? RESPRAY_TAKA : 0);
    if (cost > f.taka) {
      ev.push({
        type: 'service',
        station: s,
        repaired: false,
        resprayed: false,
        cost: 0,
        note: 'broke',
      });
      return ev;
    }
    ev.push({
      type: 'service',
      station: s,
      repaired: repairCost > 0,
      resprayed: canRespray,
      cost,
      note: wantRespray && f.copNear ? 'seen' : 'ok',
    });
    return ev;
  }

  private finish(s: Station, reason: 'full' | 'broke', ev: StationEvent[]) {
    ev.push({ type: 'fuelDone', station: s, spent: Math.round(this.spent), reason });
    this.servedAt = s.id;
    this.spent = 0;
    if (this.current) this.current.filling = false;
  }
}
