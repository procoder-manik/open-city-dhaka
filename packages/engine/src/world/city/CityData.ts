/** Map data produced by tools/map-builder/build.mjs (coordinates in decimetres). */

export interface CityIndex {
  v: number;
  name: string;
  chunk: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  slice: { halfX: number; halfZ: number };
  chunks: string[];
  pois: Array<{ n: string; k: string; x: number; z: number }>;
  roads: Array<{ n: string; x: number; z: number; a: number }>;
  attribution: string;
}

/** [type, widthDm, ax, az, bx, bz] */
export type RoadSeg = [string, number, number, number, number, number];
/** [levels, seed 0..999, flat polygon dm (CCW), front edge indices] */
export type Building = [number, number, number[], number[]];

export interface CityChunk {
  r: RoadSeg[];
  b: Building[];
  w: number[][];
  p: number[][];
  t: Array<[number, number[]]>;
}

/** [cx, cz, hx, hz, yawMilliRad, height] in dm */
export type ColliderRow = [number, number, number, number, number, number];

export interface CityBundle {
  base: string;
  index: CityIndex;
  colliders: ColliderRow[];
  /** Road segments [rank, ax, az, bx, bz] in metres (traffic & pedestrian graph). */
  roads: MinimapData['roads'];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Load the index + all colliders (needed before physics starts). */
export async function loadCity(base: string): Promise<CityBundle> {
  const [index, colliders, minimap] = await Promise.all([
    getJson<CityIndex>(`${base}/index.json`),
    getJson<ColliderRow[]>(`${base}/colliders.json`),
    getJson<MinimapData>(`${base}/minimap.json`).catch(() => ({ roads: [] })),
  ]);
  return { base, index, colliders, roads: minimap.roads };
}

export function loadChunk(base: string, key: string): Promise<CityChunk> {
  return getJson<CityChunk>(`${base}/c_${key}.json`);
}

export interface MinimapData {
  roads: Array<[number, number, number, number, number]>;
}

export function loadMinimap(base: string): Promise<MinimapData> {
  return getJson<MinimapData>(`${base}/minimap.json`);
}
