/** Axis-aligned box: [minX, minY, minZ, maxX, maxY, maxZ]. */
export type AABB = [number, number, number, number, number, number];

/**
 * Distance along a normalised ray to the first AABB hit, or Infinity.
 * Slab method; boxes containing the origin are ignored (so a pivot inside a
 * collider never "hits" it).
 */
export function raycastAABBs(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  boxes: readonly AABB[],
): number {
  let best = Infinity;
  const ix = 1 / dx;
  const iy = 1 / dy;
  const iz = 1 / dz;
  for (const b of boxes) {
    if (ox > b[0] && ox < b[3] && oy > b[1] && oy < b[4] && oz > b[2] && oz < b[5]) continue;
    let t1 = (b[0] - ox) * ix;
    let t2 = (b[3] - ox) * ix;
    let tmin = Math.min(t1, t2);
    let tmax = Math.max(t1, t2);
    t1 = (b[1] - oy) * iy;
    t2 = (b[4] - oy) * iy;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    t1 = (b[2] - oz) * iz;
    t2 = (b[5] - oz) * iz;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmax >= Math.max(tmin, 0) && tmin < best && tmin <= maxDist) best = Math.max(tmin, 0);
  }
  return best;
}

export function boxToAABB(
  center: [number, number, number],
  half: [number, number, number],
  margin = 0,
): AABB {
  return [
    center[0] - half[0] - margin,
    center[1] - half[1] - margin,
    center[2] - half[2] - margin,
    center[0] + half[0] + margin,
    center[1] + half[1] + margin,
    center[2] + half[2] + margin,
  ];
}
