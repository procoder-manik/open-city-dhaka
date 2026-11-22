/** Weapons, damage and hit tests. Pure logic (unit tested). */
export type WeaponId = 'fist' | 'pistol' | 'grenade';

export interface WeaponSpec {
  id: WeaponId;
  nameBn: string;
  /** Seconds between uses. */
  cooldown: number;
  damage: number;
  range: number;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  fist: { id: 'fist', nameBn: 'ঘুষি', cooldown: 0.42, damage: 34, range: 1.5 },
  pistol: { id: 'pistol', nameBn: 'পিস্তল', cooldown: 0.3, damage: 50, range: 70 },
  grenade: { id: 'grenade', nameBn: 'গ্রেনেড', cooldown: 1.1, damage: 120, range: 7.5 },
};
export const WEAPON_ORDER: WeaponId[] = ['fist', 'pistol', 'grenade'];

export interface Arsenal {
  weapon: WeaponId;
  ammo: number;
  grenades: number;
}

export function newArsenal(): Arsenal {
  return { weapon: 'fist', ammo: 24, grenades: 2 };
}

/** Next weapon that can actually be used (skips empty ones). */
export function nextWeapon(a: Arsenal): WeaponId {
  const i = WEAPON_ORDER.indexOf(a.weapon);
  for (let k = 1; k <= WEAPON_ORDER.length; k++) {
    const w = WEAPON_ORDER[(i + k) % WEAPON_ORDER.length]!;
    if (w === 'pistol' && a.ammo <= 0) continue;
    if (w === 'grenade' && a.grenades <= 0) continue;
    return w;
  }
  return 'fist';
}

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Distance along a normalised ray to a sphere, or null when it misses. */
export function raySphere(o: V3, d: V3, c: V3, r: number): number | null {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t >= 0) return t;
  const t2 = -b + Math.sqrt(disc);
  return t2 >= 0 ? 0 : null;
}

/** Distance along a ray to an axis-aligned box (slab test), or null. */
export function rayBox(o: V3, d: V3, min: V3, max: V3): number | null {
  let tmin = 0;
  let tmax = Infinity;
  for (const k of ['x', 'y', 'z'] as const) {
    if (Math.abs(d[k]) < 1e-9) {
      if (o[k] < min[k] || o[k] > max[k]) return null;
      continue;
    }
    let t1 = (min[k] - o[k]) / d[k];
    let t2 = (max[k] - o[k]) / d[k];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

/** Blast strength 1 at the centre → 0 at `radius` (smooth quadratic). */
export function blastFalloff(distance: number, radius: number): number {
  if (distance >= radius) return 0;
  const k = 1 - distance / radius;
  return k * k;
}

/** Chance a police bullet hits: worse at range and against a moving car. */
export function copHitChance(distance: number, inVehicle: boolean, playerSpeed: number): number {
  const base = inVehicle ? 0.3 : 0.5;
  return Math.max(0.05, base - distance * 0.015 - Math.min(playerSpeed, 15) * 0.012);
}

/** Desired police presence for a wanted level: foot cops and patrol cars. */
export function policeFor(stars: number): { cops: number; cars: number } {
  if (stars <= 0) return { cops: 0, cars: 0 };
  // Calm by default: 1 cop per star, patrol cars only from 4 stars
  return { cops: Math.min(5, stars), cars: Math.max(0, Math.min(2, stars - 3)) };
}
