import type { CrimeKind } from './CrimeSystem';

/** Data-driven missions: steps checked against world facts each frame. Pure logic (unit tested). */
export type MissionStep =
  | {
      kind: 'goto';
      x: number;
      z: number;
      r: number;
      text: string;
      /** Fragile cargo: fail if the vehicle takes more than this much damage (%) on the way. */
      fragile?: number;
    }
  | { kind: 'enter'; vehicle: 'car' | 'cng' | 'bike' | 'any'; text: string }
  | { kind: 'talk'; npc: string; option: string; x: number; z: number; text: string }
  | { kind: 'wanted'; min: number; text: string }
  | { kind: 'lose'; text: string }
  /** Commit `count` crimes of a kind (counted from when the step starts). */
  | { kind: 'crime'; crime: CrimeKind; count: number; text: string }
  /** Reach a speed (km/h) in a vehicle. */
  | { kind: 'speed'; kmh: number; text: string }
  /**
   * Follow the mission target vehicle for `seconds` staying between `near` and `far` metres.
   * Closer than `near` for SPOT_SECONDS = spotted (fail); further than LOSE_DIST after starting = lost.
   */
  | { kind: 'tail'; seconds: number; near: number; far: number; text: string }
  /** Wreck the mission target vehicle (shoot, ram or grenade it). */
  | { kind: 'destroy'; text: string }
  | {
      kind: 'stay';
      x: number;
      z: number;
      r: number;
      seconds: number;
      text: string;
      /** Raise the wanted level when done (the finale). */
      heat?: number;
      /** Headline shown when the heat hits ({hero} placeholder allowed). */
      headline?: string;
    };

export interface MissionReward {
  taka: number;
  ammo?: number;
  grenades?: number;
  love?: number;
}

export interface MissionDef {
  id: string;
  title: string;
  /** Who gives it (dialogue speaker for the intro line). */
  giver: string;
  /** Giver's intro line (Bangla + English subtitle). */
  intro: string;
  introEn?: string;
  start: { x: number; z: number };
  steps: MissionStep[];
  /** Time limit in seconds (whole mission), if any. */
  time?: number;
  reward: MissionReward;
  /** Missions that must be passed first. */
  requires?: string[];
  /** A special vehicle put into traffic for `tail` / `destroy` steps, near (x, z). */
  target?: { kind: 'car' | 'cng' | 'bike' | 'bus'; x: number; z: number };
}

/** Tail: beyond this distance (after the tail began) the target is lost. */
export const LOSE_DIST = 140;
/** Tail: seconds allowed too close before being spotted. */
export const SPOT_SECONDS = 3;

export interface WorldFacts {
  x: number;
  z: number;
  vehicle: 'car' | 'cng' | 'bike' | null;
  wanted: number;
  /** Player can't act (wasted/busted). */
  down: boolean;
  /** Vehicle speed in km/h (0 on foot). */
  kmh?: number;
  /** Current vehicle's overall damage 0–100 (0 on foot). */
  vehicleDamage?: number;
  /** The mission target vehicle, if one is out. */
  target?: { x: number; z: number; alive: boolean } | null;
}

export type MissionEvent =
  | { type: 'start'; mission: MissionDef }
  /** Put the mission's target vehicle into the world. */
  | { type: 'spawnTarget'; mission: MissionDef }
  | { type: 'step'; mission: MissionDef; step: MissionStep; index: number }
  | { type: 'pass'; mission: MissionDef }
  | { type: 'fail'; mission: MissionDef; reason: string }
  | { type: 'heat'; amount: number; headline?: string };

export interface ActiveMission {
  def: MissionDef;
  step: number;
  timeLeft: number | null;
  stay: number;
  /** Crimes counted for a `crime` step. */
  crimes: number;
  /** Vehicle damage when a `fragile` step began. */
  baseDamage: number | null;
  /** Tail: seconds in range so far / seconds spent too close. */
  tail: number;
  close: number;
}

const START_RADIUS = 3.5;

export class MissionSystem {
  active: ActiveMission | null = null;
  readonly done = new Set<string>();
  private talked: Array<{ npc: string; option: string }> = [];
  private crimes: CrimeKind[] = [];
  /** Last known position of the target vehicle (marker + minimap). */
  private targetPos: { x: number; z: number } | null = null;
  /** Seconds before a failed/finished mission's start marker re-arms. */
  private cooldown = 0;

  constructor(readonly defs: MissionDef[]) {}

  available(): MissionDef[] {
    return this.defs.filter(
      (d) => !this.done.has(d.id) && (d.requires ?? []).every((r) => this.done.has(r)),
    );
  }

  /** Current objective target (marker + minimap), if it has a location. */
  target(): { x: number; z: number; r: number } | null {
    const s = this.active?.def.steps[this.active.step];
    if (!s) return null;
    if (s.kind === 'goto' || s.kind === 'stay') return { x: s.x, z: s.z, r: s.r };
    if (s.kind === 'talk') return { x: s.x, z: s.z, r: 2 };
    if ((s.kind === 'tail' || s.kind === 'destroy') && this.targetPos)
      return { ...this.targetPos, r: 3 };
    return null;
  }

  objective(): string | null {
    const a = this.active;
    if (!a) return null;
    const s = a.def.steps[a.step];
    if (!s) return null;
    if (s.kind === 'stay' && a.stay > 0)
      return `${s.text} (${Math.max(0, Math.ceil(s.seconds - a.stay))})`;
    if (s.kind === 'crime' && s.count > 1) return `${s.text} (${a.crimes}/${s.count})`;
    if (s.kind === 'tail') {
      const left = Math.max(0, Math.ceil(s.seconds - a.tail));
      return a.close > 0 ? `খুব কাছে! পিছিয়ে যাও (${left})` : `${s.text} (${left})`;
    }
    return s.text;
  }

  notifyTalk(npc: string, option: string) {
    this.talked.push({ npc, option });
  }

  notifyCrime(kind: CrimeKind) {
    if (this.active) this.crimes.push(kind);
  }

  start(def: MissionDef): MissionEvent {
    this.active = {
      def,
      step: 0,
      timeLeft: def.time ?? null,
      stay: 0,
      crimes: 0,
      baseDamage: null,
      tail: 0,
      close: 0,
    };
    this.targetPos = null;
    this.talked = [];
    this.crimes = [];
    return { type: 'start', mission: def };
  }

  /** Events to emit right after `start` (target vehicle). */
  startExtras(def: MissionDef): MissionEvent[] {
    return def.target ? [{ type: 'spawnTarget', mission: def }] : [];
  }

  fail(reason: string): MissionEvent | null {
    if (!this.active) return null;
    const mission = this.active.def;
    this.active = null;
    this.cooldown = 6;
    return { type: 'fail', mission, reason };
  }

  update(dt: number, f: WorldFacts): MissionEvent[] {
    const events: MissionEvent[] = [];
    this.cooldown = Math.max(0, this.cooldown - dt);
    const a = this.active;
    if (!a) {
      if (f.down || this.cooldown > 0) return events;
      for (const d of this.available()) {
        if (Math.hypot(f.x - d.start.x, f.z - d.start.z) < START_RADIUS) {
          events.push(this.start(d), ...this.startExtras(d));
          break;
        }
      }
      this.talked = [];
      this.crimes = [];
      return events;
    }
    if (f.down) {
      const e = this.fail('down');
      if (e) events.push(e);
      return events;
    }
    if (a.timeLeft !== null) {
      a.timeLeft -= dt;
      if (a.timeLeft <= 0) {
        const e = this.fail('time');
        if (e) events.push(e);
        return events;
      }
    }
    if (f.target) this.targetPos = { x: f.target.x, z: f.target.z };
    const cur = a.def.steps[a.step];
    if (cur?.kind === 'tail' && f.target) {
      const d = Math.hypot(f.x - f.target.x, f.z - f.target.z);
      if (d < cur.near) a.close += dt;
      else a.close = Math.max(0, a.close - dt * 0.5);
      const why = !f.target.alive
        ? 'destroyed'
        : a.tail > 0 && d > LOSE_DIST
          ? 'lost'
          : a.close > SPOT_SECONDS
            ? 'spotted'
            : null;
      if (why) {
        const e = this.fail(why);
        if (e) events.push(e);
        return events;
      }
    }
    if (cur?.kind === 'goto' && cur.fragile !== undefined && f.vehicle) {
      const dmg = f.vehicleDamage ?? 0;
      if (a.baseDamage === null) a.baseDamage = dmg;
      else if (dmg - a.baseDamage > cur.fragile) {
        const e = this.fail('damage');
        if (e) events.push(e);
        return events;
      }
    }
    // Several instant steps may complete in one frame
    for (let guard = 0; guard < 4; guard++) {
      const s = a.def.steps[a.step];
      if (!s) break;
      if (!this.check(s, a, f, dt, events)) break;
      events.push({ type: 'step', mission: a.def, step: s, index: a.step });
      a.step += 1;
      a.stay = 0;
      a.crimes = 0;
      a.baseDamage = null;
      a.tail = 0;
      a.close = 0;
      this.talked = [];
      this.crimes = [];
      if (a.step >= a.def.steps.length) {
        this.done.add(a.def.id);
        this.active = null;
        this.cooldown = 4;
        events.push({ type: 'pass', mission: a.def });
        break;
      }
      // Let a heat bump reach the world before checking the next step
      if (s.kind === 'stay' && s.heat) break;
    }
    return events;
  }

  private check(
    s: MissionStep,
    a: ActiveMission,
    f: WorldFacts,
    dt: number,
    events: MissionEvent[],
  ): boolean {
    switch (s.kind) {
      case 'goto':
        return Math.hypot(f.x - s.x, f.z - s.z) < s.r;
      case 'enter':
        return s.vehicle === 'any' ? f.vehicle !== null : f.vehicle === s.vehicle;
      case 'talk':
        return this.talked.some((t) => t.npc === s.npc && t.option === s.option);
      case 'wanted':
        return f.wanted >= s.min;
      case 'lose':
        return f.wanted === 0;
      case 'crime':
        a.crimes += this.crimes.filter((k) => k === s.crime).length;
        this.crimes = [];
        return a.crimes >= s.count;
      case 'speed':
        return f.vehicle !== null && (f.kmh ?? 0) >= s.kmh;
      case 'tail': {
        if (!f.target) return false;
        const d = Math.hypot(f.x - f.target.x, f.z - f.target.z);
        if (d >= s.near && d <= s.far) a.tail += dt;
        return a.tail >= s.seconds;
      }
      case 'destroy':
        return !!f.target && !f.target.alive;
      case 'stay':
        if (Math.hypot(f.x - s.x, f.z - s.z) > s.r) {
          a.stay = 0;
          return false;
        }
        a.stay += dt;
        if (a.stay < s.seconds) return false;
        if (s.heat) events.push({ type: 'heat', amount: s.heat, headline: s.headline });
        return true;
    }
  }
}
