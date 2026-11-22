/** Per-zone damage (0 = new, 100 = wrecked) + fuel, GTA-style. Pure logic, unit-tested. */
export type DamageZone = 'front' | 'rear' | 'left' | 'right';

export interface VehicleCondition {
  damage: Record<DamageZone, number>;
  /** 0..1 */
  fuel: number;
}

export function newCondition(): VehicleCondition {
  return { damage: { front: 0, rear: 0, left: 0, right: 0 }, fuel: 0.85 };
}

/** Overall damage %, weighted so a wrecked front (engine) counts most. */
export function totalDamage(c: VehicleCondition): number {
  const d = c.damage;
  return Math.min(100, Math.round(d.front * 0.4 + d.rear * 0.2 + d.left * 0.2 + d.right * 0.2));
}

/** Engine power multiplier: front damage (engine) and empty tank reduce power. */
export function enginePower(c: VehicleCondition): number {
  if (c.fuel <= 0) return 0;
  if (totalDamage(c) >= 100 || c.damage.front >= 100) return 0;
  // Power only drops once the engine is badly hurt
  return 1 - Math.max(0, (c.damage.front - 60) / 40) * 0.5;
}

/**
 * Which zone an impact hit, from the change in velocity in vehicle-local space
 * (x = left, z = forward). A sudden stop moving forward = front hit.
 */
export function impactZone(localDvX: number, localDvZ: number): DamageZone {
  // Impact force points opposite to the velocity change.
  if (Math.abs(localDvZ) >= Math.abs(localDvX)) return localDvZ < 0 ? 'front' : 'rear';
  return localDvX < 0 ? 'left' : 'right';
}

/** Apply an impact with speed change `dv` (m/s). Returns damage added. */
export function applyImpact(
  c: VehicleCondition,
  zone: DamageZone,
  dv: number,
  toughness = 1,
): number {
  // Tough cars (owner feedback): bumps do nothing; a hard crash costs ~5–12 %, so it
  // takes 10+ big hits to wreck one.
  const threshold = 6;
  if (dv <= threshold) return 0;
  const add = Math.min(12, ((dv - threshold) * 1.6) / toughness);
  c.damage[zone] = Math.min(100, c.damage[zone] + add);
  return add;
}

/** Fuel use per second at full throttle (fraction of tank). */
export const FUEL_PER_SECOND = { car: 0.004, cng: 0.003, bike: 0.0025 } as const;

export function burnFuel(
  c: VehicleCondition,
  kind: keyof typeof FUEL_PER_SECOND,
  throttle: number,
  dt: number,
) {
  const idle = 0.08;
  c.fuel = Math.max(0, c.fuel - FUEL_PER_SECOND[kind] * (idle + Math.abs(throttle)) * dt);
}
