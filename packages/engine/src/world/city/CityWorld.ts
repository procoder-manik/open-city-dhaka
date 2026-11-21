import * as THREE from 'three/webgpu';
import type { QualityPreset } from '@game/shared';
import type { AABB } from '../../camera/raycast';
import type { BodyDesc } from '../../physics/protocol';
import { MeshBuilder } from '../MeshBuilder';
import { seededRandom } from '../random';
import {
  FACADE_CELLS,
  SIGN_COLS,
  SIGN_ROWS,
  facadeTextures,
  shopfrontTexture,
  signAtlas,
} from '../textures';
import { loadChunk, type CityBundle, type CityChunk } from './CityData';

const D = 0.1; // decimetres → metres
const FLOOR = 3.1;
const BAY = 3;

/** Dhaka wall palette (tints a neutral facade texture → one material for all walls). */
const PALETTE = [
  0xe6dfd1, 0xdcb3a0, 0xb8cdbd, 0xd8c6a4, 0xa9c0d0, 0xe2d08c, 0xb6b1a8, 0xa8664a, 0xcfae92,
  0xefe9dc, 0xd9cfc0, 0xc9b8a6,
];
const ROAD_Y: Record<string, number> = {
  footway: 0.004,
  path: 0.004,
  cycleway: 0.004,
  pedestrian: 0.006,
  service: 0.008,
  living_street: 0.009,
  residential: 0.01,
  unclassified: 0.01,
  tertiary: 0.012,
  tertiary_link: 0.012,
  secondary: 0.014,
  secondary_link: 0.014,
  primary: 0.016,
  primary_link: 0.016,
  trunk: 0.018,
  trunk_link: 0.018,
};
const MAJOR = new Set(['trunk', 'primary', 'secondary', 'tertiary']);
const WALKWAY = new Set(['footway', 'path', 'cycleway', 'pedestrian']);

interface LoadedChunk {
  key: string;
  group: THREE.Group;
  boxes: AABB[];
}

export interface CityMaterials {
  wall: THREE.MeshStandardMaterial;
  shop: THREE.MeshStandardMaterial;
  sign: THREE.MeshStandardMaterial;
  detail: THREE.MeshStandardMaterial;
  road: THREE.MeshStandardMaterial;
  walk: THREE.MeshStandardMaterial;
  mark: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
  park: THREE.MeshStandardMaterial;
}

/**
 * Streams the real Mohammadpur (OpenStreetMap) around the player in 256 m chunks:
 * roads with world-scale asphalt, sidewalks along main roads, lane dashes, extruded
 * buildings (one tinted facade material) with shops + Bangla signboards on road-
 * facing walls, rooftop water tanks, parks and water. ~8 draw calls per chunk.
 */
export class CityWorld {
  readonly group = new THREE.Group();
  readonly materials: CityMaterials;
  readonly nightMaterials: Array<{ material: THREE.MeshStandardMaterial; max: number }> = [];
  private loaded = new Map<string, LoadedChunk>();
  private loading = new Set<string>();
  private available: Set<string>;
  private timer = 0;
  private radius: number;
  private disposables: Array<{ dispose(): void }> = [];
  /** Bumped whenever the set of loaded chunks changes (camera colliders refresh). */
  version = 0;

  constructor(
    readonly bundle: CityBundle,
    private readonly preset: QualityPreset,
    shared: { road: THREE.MeshStandardMaterial; walk: THREE.MeshStandardMaterial },
  ) {
    this.available = new Set(bundle.index.chunks);
    this.radius = 180 + preset.chunkRadius * 90; // lite ~360 m, high ~540 m
    const keep = <T extends { dispose(): void }>(x: T) => (this.disposables.push(x), x);

    const facade = facadeTextures('#f3f0ea', 99);
    keep(facade.map);
    keep(facade.emissive);
    const wall = keep(
      new THREE.MeshStandardMaterial({
        map: facade.map,
        emissiveMap: facade.emissive,
        emissive: 0xffffff,
        emissiveIntensity: 0,
        vertexColors: true,
        roughness: 0.92,
      }),
    );
    const shopTex = keep(shopfrontTexture(77));
    const shop = keep(
      new THREE.MeshStandardMaterial({
        map: shopTex,
        emissiveMap: shopTex,
        emissive: 0xffd9a0,
        emissiveIntensity: 0,
        roughness: 0.85,
      }),
    );
    const signTex = keep(signAtlas(13));
    const sign = keep(
      new THREE.MeshStandardMaterial({
        map: signTex,
        emissiveMap: signTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.05,
        roughness: 0.6,
      }),
    );
    this.nightMaterials.push(
      { material: wall, max: 1.0 },
      { material: shop, max: 0.45 },
      { material: sign, max: 0.9 },
    );
    this.materials = {
      wall,
      shop,
      sign,
      detail: keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })),
      road: shared.road,
      walk: shared.walk,
      mark: keep(new THREE.MeshStandardMaterial({ color: 0xeeeae0, roughness: 0.7 })),
      water: keep(
        new THREE.MeshStandardMaterial({ color: 0x4d6a63, roughness: 0.12, metalness: 0.2 }),
      ),
      park: keep(new THREE.MeshStandardMaterial({ color: 0x5f7f43, roughness: 1 })),
    };

    // Ground under the whole map (dusty earth)
    const b = bundle.index.bounds;
    const w = b.maxX - b.minX + 400;
    const d = b.maxZ - b.minZ + 400;
    const ground = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(w, d)),
      keep(new THREE.MeshStandardMaterial({ color: 0x7d776a, roughness: 1 })),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((b.minX + b.maxX) / 2, -0.03, (b.minZ + b.maxZ) / 2);
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  /** Static physics bodies for every building + a ground slab covering the map. */
  physicsBodies(): Omit<BodyDesc, 'id'>[] {
    const b = this.bundle.index.bounds;
    const out: Omit<BodyDesc, 'id'>[] = [
      {
        shape: {
          kind: 'box',
          halfExtents: [(b.maxX - b.minX) / 2 + 300, 0.5, (b.maxZ - b.minZ) / 2 + 300],
        },
        position: [(b.minX + b.maxX) / 2, -0.5, (b.minZ + b.maxZ) / 2],
        type: 'fixed',
      },
    ];
    for (const [cx, cz, hx, hz, yaw, h] of this.bundle.colliders) {
      out.push({
        shape: {
          kind: 'box',
          halfExtents: [Math.max(0.3, hx * D), (h * D) / 2, Math.max(0.3, hz * D)],
        },
        position: [cx * D, (h * D) / 2, cz * D],
        yaw: yaw / 1000,
        type: 'fixed',
      });
    }
    return out;
  }

  /** Camera-collision boxes of loaded chunks. */
  colliders(): AABB[] {
    const out: AABB[] = [];
    for (const c of this.loaded.values()) out.push(...c.boxes);
    return out;
  }

  update(dt: number, focus: THREE.Vector3) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.4;
    const size = this.bundle.index.chunk;
    const r = this.radius;
    const want = new Set<string>();
    for (let i = Math.floor((focus.x - r) / size); i <= Math.floor((focus.x + r) / size); i++) {
      for (let j = Math.floor((focus.z - r) / size); j <= Math.floor((focus.z + r) / size); j++) {
        const k = `${i}_${j}`;
        if (!this.available.has(k)) continue;
        const ccx = (i + 0.5) * size;
        const ccz = (j + 0.5) * size;
        if (Math.hypot(ccx - focus.x, ccz - focus.z) < r + size * 0.71) want.add(k);
      }
    }
    // Unload far chunks
    for (const [k, c] of this.loaded) {
      if (want.has(k)) continue;
      this.group.remove(c.group);
      c.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.loaded.delete(k);
      this.version++;
    }
    // Load one new chunk per tick (nearest first) to avoid frame hitches
    const missing = [...want].filter((k) => !this.loaded.has(k) && !this.loading.has(k));
    missing.sort((a, b) => dist(a) - dist(b));
    function dist(k: string) {
      const [i, j] = k.split('_').map(Number) as [number, number];
      return Math.hypot((i + 0.5) * size - focus.x, (j + 0.5) * size - focus.z);
    }
    const next = missing[0];
    if (next) {
      this.loading.add(next);
      loadChunk(this.bundle.base, next)
        .then((data) => {
          this.loading.delete(next);
          if (this.loaded.has(next)) return;
          const built = this.build(next, data);
          this.loaded.set(next, built);
          this.group.add(built.group);
          this.version++;
        })
        .catch(() => this.loading.delete(next));
    }
  }

  get loadedCount(): number {
    return this.loaded.size;
  }

  private build(key: string, c: CityChunk): LoadedChunk {
    const group = new THREE.Group();
    const rand = seededRandom(key.split('_').reduce((s, n) => s * 31 + Number(n) + 7, 17));
    const roads = new MeshBuilder();
    const walks = new MeshBuilder();
    const marks = new MeshBuilder();
    const walls = new MeshBuilder();
    const shops = new MeshBuilder();
    const signs = new MeshBuilder();
    const details = new MeshBuilder();
    const parks = new MeshBuilder();
    const water = new MeshBuilder();
    const boxes: AABB[] = [];

    // ---- Roads (world-space UVs so overlapping joints never flicker) ----
    for (const [type, wdm, ax0, az0, bx0, bz0] of c.r) {
      const w = wdm * D;
      const ax = ax0 * D;
      const az = az0 * D;
      const bx = bx0 * D;
      const bz = bz0 * D;
      const y = ROAD_Y[type] ?? 0.01;
      const target = WALKWAY.has(type) ? walks : roads;
      ribbon(target, ax, az, bx, bz, w, y);
      disc(target, ax, az, w / 2, y);
      disc(target, bx, bz, w / 2, y);
      if (MAJOR.has(type)) {
        ribbon(walks, ax, az, bx, bz, w + 5, 0.003); // sidewalks
        disc(walks, ax, az, w / 2 + 2.5, 0.003);
        const L = Math.hypot(bx - ax, bz - az);
        for (let s = 2; s + 3 < L; s += 9) {
          const t0 = s / L;
          const t1 = (s + 3) / L;
          ribbon(
            marks,
            ax + (bx - ax) * t0,
            az + (bz - az) * t0,
            ax + (bx - ax) * t1,
            az + (bz - az) * t1,
            0.15,
            y + 0.003,
          );
        }
      }
    }

    // ---- Buildings ----
    for (const [levels, seed, flat, front] of c.b) {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < flat.length; i += 2) pts.push([flat[i]! * D, flat[i + 1]! * D]);
      const height = levels * FLOOR;
      const color = new THREE.Color(PALETTE[seed % PALETTE.length]!);
      const frontSet = new Set(front);
      let perim = (seed % 4) * BAY;
      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const [x1, z1] = pts[i]!;
        const [x2, z2] = pts[(i + 1) % pts.length]!;
        minX = Math.min(minX, x1);
        maxX = Math.max(maxX, x1);
        minZ = Math.min(minZ, z1);
        maxZ = Math.max(maxZ, z1);
        const L = Math.hypot(x2 - x1, z2 - z1);
        wallQuad(walls, x1, z1, x2, z2, height, perim, color);
        perim += L;
        if (frontSet.has(i) && levels >= 2) {
          const nx = (z2 - z1) / L;
          const nz = -(x2 - x1) / L;
          const n = Math.max(1, Math.round(L / 4.2));
          for (let s = 0; s < n; s++) {
            const t0 = s / n + 0.04 / n;
            const t1 = (s + 1) / n - 0.04 / n;
            const sx = x1 + (x2 - x1) * t0;
            const sz = z1 + (z2 - z1) * t0;
            const ex = x1 + (x2 - x1) * t1;
            const ez = z1 + (z2 - z1) * t1;
            const open = rand() < 0.65;
            facadeQuad(
              shops,
              sx + nx * 0.04,
              sz + nz * 0.04,
              ex + nx * 0.04,
              ez + nz * 0.04,
              0.05,
              2.7,
              open ? [0.5, 0, 1, 1] : [0, 0, 0.5, 1],
            );
            const si = Math.floor(rand() * SIGN_COLS * SIGN_ROWS);
            const col = si % SIGN_COLS;
            const row = Math.floor(si / SIGN_COLS);
            facadeQuad(
              signs,
              sx + nx * 0.12,
              sz + nz * 0.12,
              ex + nx * 0.12,
              ez + nz * 0.12,
              2.65,
              3.45,
              [
                col / SIGN_COLS,
                1 - (row + 1) / SIGN_ROWS,
                (col + 1) / SIGN_COLS,
                1 - row / SIGN_ROWS,
              ],
            );
          }
        }
      }
      roof(walls, pts, height, color.clone().multiplyScalar(0.72));
      if (levels >= 3) {
        const tanks = 1 + (seed % 2);
        for (let t = 0; t < tanks; t++) {
          const tx = minX + (maxX - minX) * (0.3 + 0.4 * rand());
          const tz = minZ + (maxZ - minZ) * (0.3 + 0.4 * rand());
          details.cylinder(0.6, 0.6, 1.25, [tx, height + 0.62, tz], 0x1d1d1d, 10);
        }
      }
      boxes.push([minX, 0, minZ, maxX, height, maxZ]);
    }

    // ---- Parks & water ----
    for (const flat of c.p) polygon(parks, flat, 0.007);
    for (const flat of c.w) polygon(water, flat, 0.02);
    for (const [wdm, flat] of c.t) {
      for (let i = 0; i + 3 < flat.length; i += 2) {
        ribbon(
          water,
          flat[i]! * D,
          flat[i + 1]! * D,
          flat[i + 2]! * D,
          flat[i + 3]! * D,
          wdm * D,
          0.02,
        );
        disc(water, flat[i + 2]! * D, flat[i + 3]! * D, (wdm * D) / 2, 0.02);
      }
    }

    const shadows = this.preset.shadowMapSize >= 2048;
    const add = (b: MeshBuilder, m: THREE.Material, cast = false) => {
      const mesh = b.build(m, { castShadow: cast && shadows, receiveShadow: true });
      if (mesh) group.add(mesh);
    };
    add(roads, this.materials.road);
    add(walks, this.materials.walk);
    add(marks, this.materials.mark);
    add(walls, this.materials.wall, true);
    add(shops, this.materials.shop);
    add(signs, this.materials.sign);
    add(details, this.materials.detail, true);
    add(parks, this.materials.park);
    add(water, this.materials.water);
    return { key, group, boxes };
  }

  dispose() {
    for (const c of this.loaded.values())
      c.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.loaded.clear();
    for (const d of this.disposables) d.dispose();
  }
}

// ---------------- geometry helpers ----------------

/** Flat strip from a to b, width w, at height y, world-space UVs (4.5 m tiles). */
function ribbon(
  b: MeshBuilder,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  w: number,
  y: number,
) {
  const L = Math.hypot(bx - ax, bz - az);
  if (L < 0.01) return;
  const px = ((bz - az) / L) * (w / 2);
  const pz = (-(bx - ax) / L) * (w / 2);
  const v = [ax - px, y, az - pz, bx - px, y, bz - pz, bx + px, y, bz + pz, ax + px, y, az + pz];
  const uv: number[] = [];
  for (let i = 0; i < 12; i += 3) uv.push(v[i]! / 4.5, v[i + 2]! / 4.5);
  // winding so the face points up
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3),
  );
  const cross = (v[3]! - v[0]!) * (v[8]! - v[2]!) - (v[5]! - v[2]!) * (v[6]! - v[0]!);
  g.setIndex(cross < 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  b.add(g);
}

/** Octagon to round off road joints. */
function disc(b: MeshBuilder, x: number, z: number, r: number, y: number) {
  const n = 8;
  const pos = [x, y, z];
  const uv = [x / 4.5, z / 4.5];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    pos.push(px, y, pz);
    uv.push(px / 4.5, pz / 4.5);
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(0, 1 + ((i + 1) % n), 1 + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      new Array((n + 1) * 3).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  g.setIndex(idx);
  b.add(g);
}

/** Outward-facing wall (polygon is CCW in x/z), facade UVs: 1 cell = 1 bay × 1 floor. */
function wallQuad(
  b: MeshBuilder,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  h: number,
  u0: number,
  color: THREE.Color,
) {
  const L = Math.hypot(x2 - x1, z2 - z1);
  if (L < 0.05) return;
  const nx = (z2 - z1) / L;
  const nz = -(x2 - x1) / L;
  const ua = u0 / BAY / FACADE_CELLS;
  const ub = (u0 + L) / BAY / FACADE_CELLS;
  const vb = h / FLOOR / FACADE_CELLS;
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([x1, 0, z1, x2, 0, z2, x2, h, z2, x1, h, z1], 3),
  );
  g.setAttribute('uv', new THREE.Float32BufferAttribute([ua, 0, ub, 0, ub, vb, ua, vb], 2));
  g.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3),
  );
  g.setIndex([0, 2, 1, 0, 3, 2]);
  b.add(g, color);
}

/** Vertical textured quad between two ground points (shops, signs) facing outward. */
function facadeQuad(
  b: MeshBuilder,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  y0: number,
  y1: number,
  uv: [number, number, number, number],
) {
  const L = Math.hypot(x2 - x1, z2 - z1);
  if (L < 0.05) return;
  const nx = (z2 - z1) / L;
  const nz = -(x2 - x1) / L;
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([x1, y0, z1, x2, y0, z2, x2, y1, z2, x1, y1, z1], 3),
  );
  g.setAttribute(
    'uv',
    // Seen from outside (along -n) x1 is on the viewer's right, so u runs x2 → x1;
    // otherwise Bangla signboards read mirrored.
    new THREE.Float32BufferAttribute([uv[2], uv[1], uv[0], uv[1], uv[0], uv[3], uv[2], uv[3]], 2),
  );
  g.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3),
  );
  g.setIndex([0, 2, 1, 0, 3, 2]);
  b.add(g);
}

/** Flat roof (triangulated polygon) using a plain patch of the facade texture. */
function roof(b: MeshBuilder, pts: Array<[number, number]>, h: number, color: THREE.Color) {
  const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
  let tris: number[][];
  try {
    tris = THREE.ShapeUtils.triangulateShape(contour, []);
  } catch {
    return;
  }
  const pos: number[] = [];
  for (const [x, z] of pts) pos.push(x, h, z);
  const idx: number[] = [];
  for (const [a, c, d] of tris as Array<[number, number, number]>) {
    const ax = pts[a]![0],
      az = pts[a]![1];
    const cross = (pts[c]![0] - ax) * (pts[d]![1] - az) - (pts[c]![1] - az) * (pts[d]![0] - ax);
    if (cross < 0) idx.push(a, c, d);
    else idx.push(a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      new Array(pts.length * 2).fill(0).map((_, i) => (i % 2 ? 0.12 : 0.01)),
      2,
    ),
  );
  g.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      new Array(pts.length * 3).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  g.setIndex(idx);
  b.add(g, color);
}

/** Flat polygon (parks, ponds) from a flat dm array. */
function polygon(b: MeshBuilder, flat: number[], y: number) {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i]! * D, flat[i + 1]! * D]);
  if (pts.length > 2 && pts[0]![0] === pts.at(-1)![0] && pts[0]![1] === pts.at(-1)![1]) pts.pop();
  if (pts.length < 3) return;
  roof(b, pts, y, new THREE.Color(0xffffff));
}
