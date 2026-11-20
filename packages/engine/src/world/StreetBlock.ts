import * as THREE from 'three/webgpu';
import type { QualityPreset } from '@game/shared';
import { boxToAABB, type AABB } from '../camera/raycast';
import type { BodyDesc } from '../physics/protocol';
import { MeshBuilder } from './MeshBuilder';
import { POSTER_COLS, POSTER_COUNT, POSTER_ROWS, bannerTexture, posterAtlas } from './posters';
import { seededRandom } from './random';
import {
  FACADE_CELLS,
  SIGN_COLS,
  SIGN_ROWS,
  asphaltTexture,
  facadeTextures,
  pavementTexture,
  shopfrontTexture,
  signAtlas,
} from './textures';

/** Street layout (metres). Road runs along Z; traffic keeps LEFT (Bangladesh). */
export const STREET = {
  roadHalf: 7.6,
  medianHalf: 0.6,
  footWidth: 3,
  curbHeight: 0.18,
  buildX: 10.8,
  zMin: -130,
  zMax: 130,
  floorHeight: 3.1,
  bay: 3,
} as const;

const WALL_COLORS = [
  '#e9cfa9',
  '#d9a77f',
  '#cfdccb',
  '#f1e4c6',
  '#bccbd8',
  '#e8bba6',
  '#ddd5bf',
  '#b3c6a8',
];
const AWNING_COLORS = [0x1e5aa8, 0xc0392b, 0x2e8b57, 0xe0a526, 0x7d3c98, 0x1f8a8a];

export interface StreetResult {
  group: THREE.Group;
  bodies: Omit<BodyDesc, 'id'>[];
  /** Static boxes for camera collision. */
  colliders: AABB[];
  /** Materials whose emissive glow follows night time. */
  nightMaterials: Array<{ material: THREE.MeshStandardMaterial; max: number }>;
  /** Additive light pools whose opacity follows night time. */
  nightGlows: Array<{ material: THREE.MeshBasicMaterial; max: number }>;
  /** Named points of interest (spawn, vehicle parking…). */
  points: Record<string, [number, number, number]>;
  dispose(): void;
}

/**
 * Tajmahal Road-style block in Mohammadpur: divided road, footpaths, 4–10 storey
 * buildings with shops and Bangla signboards, balconies, AC units, water tanks,
 * electric poles with tangled wires, a tea stall and a parked rickshaw.
 * Generated from a seed; heavy merging keeps it to ~20 draw calls.
 */
export interface StreetOptions {
  /** Where the CC0 PBR textures live (see tools/asset-pipeline/fetch-textures.mjs). */
  textureBase?: string;
}

export function buildStreetBlock(
  preset: QualityPreset,
  seed = 7,
  opts: StreetOptions = {},
): StreetResult {
  const rand = seededRandom(seed);
  const group = new THREE.Group();
  const bodies: Omit<BodyDesc, 'id'>[] = [];
  const colliders: AABB[] = [];
  const nightMaterials: StreetResult['nightMaterials'] = [];
  const nightGlows: StreetResult['nightGlows'] = [];
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];
  const track = <T extends THREE.Material>(m: T) => (materials.push(m), m);
  const tex = <T extends THREE.Texture>(t: T) => (textures.push(t), t);

  const addStatic = (
    center: [number, number, number],
    half: [number, number, number],
    camera = true,
  ) => {
    bodies.push({ shape: { kind: 'box', halfExtents: half }, position: center, type: 'fixed' });
    if (camera) colliders.push(boxToAABB(center, half));
  };

  const { roadHalf, medianHalf, footWidth, curbHeight, buildX, zMin, zMax, floorHeight, bay } =
    STREET;
  const length = zMax - zMin;
  const zMid = (zMin + zMax) / 2;

  // ---------- Ground, road, footpaths, median ----------
  addStatic([0, -0.5, 0], [300, 0.5, 300], false);
  const groundMat = track(new THREE.MeshStandardMaterial({ color: 0x6f6a5d, roughness: 1 }));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  group.add(ground);

  // Real CC0 photo textures (Poly Haven): 1024 px on desktop tiers, 512 px on phones;
  // normal maps everywhere except Lite. Canvas textures remain as instant fallback.
  const texBase = opts.textureBase ?? '/assets/textures';
  const texSize = preset.maxTextureSize >= 2048 ? 1024 : 512;
  const useNormals = preset.maxTextureSize > 1024 || preset.shadows;
  const loader = new THREE.TextureLoader();
  const pbr = (name: string) => {
    const map = tex(loader.load(`${texBase}/${name}_diff_${texSize}.jpg`));
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 8;
    let normalMap: THREE.Texture | null = null;
    if (useNormals) {
      normalMap = tex(loader.load(`${texBase}/${name}_nor_${texSize}.jpg`));
      normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    }
    return normalMap ? { map, normalMap, normalScale: new THREE.Vector2(0.8, 0.8) } : { map };
  };

  const roadMat = track(new THREE.MeshStandardMaterial({ ...pbr('asphalt'), roughness: 0.9 }));
  void asphaltTexture; // canvas fallback kept for offline/tests
  const road = new MeshBuilder().ground(0, 0.005, zMid, roadHalf * 2, length, [
    (roadHalf * 2) / 4.5,
    length / 4.5,
  ]);
  // Cross lane surfaces (galis) at the gaps
  road.ground(-buildX - 15, 0.004, 33, 30, 6, [7, 1.5]);
  road.ground(buildX + 15, 0.004, -47, 30, 6, [7, 1.5]);
  group.add(road.build(roadMat, { castShadow: false })!);

  void pavementTexture;
  const pathMat = track(
    new THREE.MeshStandardMaterial({ ...pbr('pavement'), roughness: 0.92, vertexColors: true }),
  );
  const paths = new MeshBuilder();
  for (const side of [-1, 1] as const) {
    const cx = side * (roadHalf + footWidth / 2);
    paths.box([footWidth, curbHeight, length], [cx, curbHeight / 2, zMid], 0xffffff, 0, 1.6);
    addStatic([cx, curbHeight / 2, zMid], [footWidth / 2, curbHeight / 2, length / 2], false);
    // Curb stones: painted black/yellow stripes near the crossing
    paths.box(
      [0.2, curbHeight + 0.02, length],
      [side * (roadHalf + 0.1), curbHeight / 2 + 0.01, zMid],
      0xbdb6a6,
    );
  }
  // Median with plants
  paths.box([medianHalf * 2, 0.3, length], [0, 0.15, zMid], 0xd7d2c4);
  addStatic([0, 0.15, zMid], [medianHalf, 0.15, length / 2], false);
  for (let z = zMin + 2; z < zMax; z += 9) {
    if (Math.abs(z + 20) < 6) continue; // gap for zebra crossing
    paths.box([medianHalf * 1.6, 0.05, 3], [0, 0.31, z], 0x5a4632);
  }
  group.add(paths.build(pathMat)!);

  const plantMat = track(
    new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 0.9, flatShading: true }),
  );
  const plants = new MeshBuilder();
  for (let z = zMin + 2; z < zMax; z += 9) {
    if (Math.abs(z + 20) < 6) continue;
    for (let k = -1; k <= 1; k++) {
      const g = new THREE.IcosahedronGeometry(0.35 + rand() * 0.2, 0);
      g.translate((rand() - 0.5) * 0.4, 0.55, z + k * 0.9);
      plants.add(g, new THREE.Color().setHSL(0.28 + rand() * 0.06, 0.5, 0.25 + rand() * 0.1));
    }
  }
  group.add(
    plants.build(
      track(
        new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true, vertexColors: true }),
      ),
    )!,
  );
  plantMat.dispose();

  // Road markings
  const markMat = track(new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.7 }));
  const marks = new MeshBuilder();
  for (const side of [-1, 1]) {
    const laneX = side * (medianHalf + (roadHalf - medianHalf) / 2);
    for (let z = zMin; z < zMax; z += 9) {
      if (Math.abs(z + 20) < 4) continue;
      marks.ground(laneX, 0.012, z, 0.15, 3);
    }
    marks.ground(side * (roadHalf - 0.3), 0.012, zMid, 0.12, length);
  }
  for (let x = -roadHalf + 0.6; x < roadHalf - 0.4; x += 1.1) {
    if (Math.abs(x) < medianHalf + 0.2) continue;
    marks.ground(x, 0.013, -20, 0.55, 4); // zebra crossing
  }
  group.add(marks.build(markMat, { castShadow: false })!);

  // ---------- Buildings ----------
  const facades = WALL_COLORS.slice(0, 4).map((c, i) => {
    const t = facadeTextures(c, seed * 31 + i);
    tex(t.map);
    tex(t.emissive);
    const m = track(
      new THREE.MeshStandardMaterial({
        map: t.map,
        emissiveMap: t.emissive,
        emissive: 0xffffff,
        emissiveIntensity: 0,
        roughness: 0.9,
      }),
    );
    nightMaterials.push({ material: m, max: 1.1 });
    return { builder: new MeshBuilder(), material: m };
  });
  const walls = new MeshBuilder();
  const signs = new MeshBuilder();
  const shops = new MeshBuilder();
  const details = new MeshBuilder(); // balconies, AC units, awnings, tanks, rebar
  const posters = new MeshBuilder();
  const awnings = new MeshBuilder(); // corrugated tin sheets
  let posterIdx = 0;
  const posterUV = (i: number): [number, number, number, number] => {
    const k = i % POSTER_COUNT;
    const col = k % POSTER_COLS;
    const row = Math.floor(k / POSTER_COLS);
    return [
      col / POSTER_COLS,
      1 - (row + 1) / POSTER_ROWS,
      (col + 1) / POSTER_COLS,
      1 - row / POSTER_ROWS,
    ];
  };
  const skyline = new MeshBuilder();

  const usedSigns = new Set<number>();
  const pickSign = () => {
    let i = Math.floor(rand() * SIGN_COLS * SIGN_ROWS);
    for (let k = 0; k < 8 && usedSigns.has(i); k++) i = Math.floor(rand() * SIGN_COLS * SIGN_ROWS);
    usedSigns.add(i);
    return i;
  };
  const galis = [
    { side: -1, z0: 30, z1: 36 },
    { side: 1, z0: -50, z1: -44 },
  ];

  for (const side of [-1, 1] as const) {
    const dir: 1 | -1 = side === -1 ? 1 : -1; // facade faces the road
    let z: number = zMin;
    while (z < zMax - 4) {
      const gali = galis.find((g) => g.side === side && z + 0.1 >= g.z0 - 0.5 && z < g.z1);
      if (gali) {
        z = gali.z1;
        continue;
      }
      const bays = 2 + Math.floor(rand() * 3);
      let width = bays * bay + rand() * 0.6;
      const nextGali = galis.find((g) => g.side === side && g.z0 > z && g.z0 < z + width);
      if (nextGali) width = nextGali.z0 - z;
      if (width < 3) {
        z += width;
        continue;
      }
      const depth = 12 + rand() * 5;
      const floors = 4 + Math.floor(rand() * 6);
      const height = floors * floorHeight + 0.6;
      const cz = z + width / 2;
      const cx = side * (buildX + depth / 2);
      const frontX = side * buildX;
      const wallColor = WALL_COLORS[Math.floor(rand() * WALL_COLORS.length)]!;
      const variant = Math.floor(rand() * facades.length);

      walls.box([depth, height, width], [cx, height / 2, cz], wallColor, 0, 2.2);
      addStatic([cx, height / 2, cz], [depth / 2, height / 2, width / 2]);
      // Parapet
      walls.box([depth, 0.9, 0.2], [cx, height + 0.45, z + 0.1], wallColor);
      walls.box([depth, 0.9, 0.2], [cx, height + 0.45, z + width - 0.1], wallColor);
      walls.box([0.2, 0.9, width], [frontX + side * 0.1, height + 0.45, cz], wallColor);

      // Upper-floor facade (floors 1..n-1), UVs tile the 4×4 facade texture
      const facadeH = (floors - 1) * floorHeight;
      const u0 = Math.floor(rand() * FACADE_CELLS) / FACADE_CELLS;
      facades[variant]!.builder.facadeX(
        frontX - side * 0.02,
        floorHeight + facadeH / 2,
        cz,
        width - 0.1,
        facadeH,
        dir,
        [u0, 0, u0 + width / bay / FACADE_CELLS, (floors - 1) / FACADE_CELLS],
      );

      // Ground floor: shopfronts (shutter or open), signboard, awning
      const shopCount = Math.max(1, Math.round(width / 4.2));
      const shopW = width / shopCount;
      for (let s = 0; s < shopCount; s++) {
        const sz = z + shopW * (s + 0.5);
        const open = rand() < 0.65;
        shops.facadeX(
          frontX - side * 0.03,
          1.35,
          sz,
          shopW - 0.35,
          2.6,
          dir,
          open ? [0.5, 0, 1, 1] : [0, 0, 0.5, 1],
        );
        // Posters glued on closed shutters, and small ones on shop pillars
        if (!open || rand() < 0.35) {
          const n = open ? 1 : 2 + Math.floor(rand() * 2);
          for (let k = 0; k < n; k++) {
            const pz = open ? z + shopW * s + 0.2 : sz + (k - (n - 1) / 2) * 0.72;
            const size = open ? 0.32 : 0.62;
            const py = open ? 1.9 : 1.1 + rand() * 0.5;
            posters.facadeX(
              frontX - side * 0.05,
              py,
              pz,
              size,
              size,
              dir,
              posterUV(posterIdx + Math.floor(rand() * 7)),
            );
            posterIdx++;
          }
        }
        const si = pickSign();
        const col = si % SIGN_COLS;
        const row = Math.floor(si / SIGN_COLS);
        signs.facadeX(frontX - side * 0.12, 3.05, sz, shopW - 0.25, 0.85, dir, [
          col / SIGN_COLS,
          1 - (row + 1) / SIGN_ROWS,
          (col + 1) / SIGN_COLS,
          1 - row / SIGN_ROWS,
        ]);
        if (open && rand() < 0.7) {
          const awning = new THREE.BoxGeometry(1.4, 0.05, shopW - 0.3);
          awning.rotateZ(side * 0.25);
          awning.translate(frontX - side * 0.7, 2.55, sz);
          awnings.add(awning, AWNING_COLORS[Math.floor(rand() * AWNING_COLORS.length)]);
        }
      }

      // Balconies + AC units per floor
      for (let f = 1; f < floors; f++) {
        const y = f * floorHeight;
        if (rand() < 0.6) {
          const bw = Math.min(width - 0.6, 2.4 + rand() * 2);
          const bz = cz + (rand() - 0.5) * (width - bw);
          details.box([0.9, 0.12, bw], [frontX - side * 0.45, y + 0.05, bz], wallColor);
          details.box([0.05, 0.9, bw], [frontX - side * 0.88, y + 0.55, bz], 0x3d3d3d); // grill rail
          if (rand() < 0.5)
            details.box(
              [0.02, 0.5, bw * 0.7],
              [frontX - side * 0.7, y + 1.3, bz],
              [0xd84343, 0x3f8fd8, 0xe5c44a][f % 3],
            ); // laundry
        }
        if (rand() < 0.45) {
          details.box(
            [0.35, 0.45, 0.8],
            [frontX - side * 0.2, y + 2.3, z + 0.6 + rand() * (width - 1.2)],
            0xe8e8e6,
          );
        }
      }
      // Rooftop water tanks (black, iconic) and some rebar
      const tanks = 1 + Math.floor(rand() * 2);
      for (let t = 0; t < tanks; t++) {
        details.cylinder(
          0.65,
          0.65,
          1.3,
          [cx + (rand() - 0.5) * depth * 0.5, height + 1.25, z + 1.2 + rand() * (width - 2.4)],
          0x1d1d1d,
          12,
        );
      }
      if (rand() < 0.35) {
        for (let r = 0; r < 6; r++) {
          details.cylinder(
            0.02,
            0.02,
            1.6,
            [cx + (rand() - 0.5) * depth * 0.8, height + 0.8, z + 0.5 + rand() * (width - 1)],
            0x6b4a32,
            4,
          );
        }
      }
      z += width;
    }

    // Background skyline rows (cheap, no detail) so the city feels dense.
    for (let zz = zMin; zz < zMax; zz += 9 + rand() * 6) {
      const h = 10 + rand() * 26;
      const w = 7 + rand() * 7;
      const d = 10 + rand() * 10;
      const x = side * (buildX + 20 + d / 2 + rand() * 8);
      skyline.box([d, h, w], [x, h / 2, zz], WALL_COLORS[Math.floor(rand() * WALL_COLORS.length)]);
      addStatic([x, h / 2, zz], [d / 2, h / 2, w / 2]);
    }
  }
  // Road ends: buildings across the far ends (keeps the slice enclosed).
  for (const zEnd of [zMin - 8, zMax + 8]) {
    skyline.box([60, 30, 14], [0, 15, zEnd], WALL_COLORS[2]);
    addStatic([0, 15, zEnd], [30, 15, 7]);
  }

  const wallMat = track(
    new THREE.MeshStandardMaterial({ ...pbr('plaster'), roughness: 0.95, vertexColors: true }),
  );
  wallMat.color.setScalar(1.25); // plaster photo is darker than paint; keep wall colours bright
  const tinMat = track(
    new THREE.MeshStandardMaterial({
      ...pbr('tin'),
      roughness: 0.7,
      metalness: 0.35,
      vertexColors: true,
    }),
  );
  group.add(walls.build(wallMat)!);
  for (const f of facades) group.add(f.builder.build(f.material, { castShadow: false })!);

  const signTex = tex(signAtlas(seed));
  const signMat = track(
    new THREE.MeshStandardMaterial({
      map: signTex,
      emissiveMap: signTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.05,
      roughness: 0.6,
    }),
  );
  nightMaterials.push({ material: signMat, max: 0.9 });
  group.add(signs.build(signMat, { castShadow: false })!);

  const shopTex = tex(shopfrontTexture(seed));
  const shopMat = track(
    new THREE.MeshStandardMaterial({
      map: shopTex,
      emissiveMap: shopTex,
      emissive: 0xffd9a0,
      emissiveIntensity: 0,
      roughness: 0.85,
    }),
  );
  nightMaterials.push({ material: shopMat, max: 0.45 });
  group.add(shops.build(shopMat, { castShadow: false })!);

  const detailMat = track(new THREE.MeshStandardMaterial({ roughness: 0.85, vertexColors: true }));
  group.add(details.build(detailMat)!);
  const awningMesh = awnings.build(tinMat);
  if (awningMesh) group.add(awningMesh);
  group.add(skyline.build(wallMat, { castShadow: false })!);

  // ---------- Electric poles, street lights, wires ----------
  const poles = new MeshBuilder();
  const lampMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfff1c9,
      emissive: 0xffd27a,
      emissiveIntensity: 0,
      roughness: 0.4,
    }),
  );
  nightMaterials.push({ material: lampMat, max: 3 });
  const lamps = new MeshBuilder();
  const wirePoints: number[] = [];
  const poleTops: Array<[number, number, number]> = [];
  for (const side of [-1, 1]) {
    const px = side * (roadHalf + 0.5);
    let prev: [number, number, number] | null = null;
    for (let z = zMin + 6; z < zMax; z += 22) {
      poles.cylinder(0.11, 0.16, 9, [px, 4.5, z], 0xd8d2c8, 8);
      poles.box([0.12, 0.12, 2.2], [px, 8.3, z], 0x6a655c, side * 0.0);
      poles.box([1.6, 0.08, 0.08], [px - side * 0.8, 7.3, z], 0x6a655c); // lamp arm
      poles.box([0.4, 0.25, 0.35], [px + side * 0.25, 6.2, z], 0x56585a); // transformer box
      lamps.box([0.5, 0.12, 0.25], [px - side * 1.55, 7.22, z], 0xffffff);
      // Posters stacked on every pole, facing the road (classic Dhaka)
      const poleDir: 1 | -1 = side === -1 ? 1 : -1;
      for (let k = 0; k < 2; k++) {
        posters.facadeX(
          px - side * 0.17,
          1.9 + k * 0.62,
          z,
          0.5,
          0.58,
          poleDir,
          posterUV(posterIdx + Math.floor(rand() * 9)),
        );
        posterIdx++;
      }
      addStatic([px, 4.5, z], [0.16, 4.5, 0.16], false);
      const top: [number, number, number] = [px, 8.3, z];
      poleTops.push(top);
      if (prev) {
        for (const [ox, oz] of [
          [0, -0.9],
          [0, -0.3],
          [0, 0.3],
          [0, 0.9],
        ] as const) {
          sagWire(
            wirePoints,
            [prev[0] + ox, prev[1], prev[2] + oz],
            [top[0] + ox, top[1], top[2] + oz],
            0.6 + rand() * 0.5,
          );
        }
      }
      prev = top;
    }
  }
  // Tangled wires from poles into buildings + across the road (the Dhaka look)
  for (const top of poleTops) {
    const n = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const toBuilding = rand() < 0.7;
      const end: [number, number, number] = toBuilding
        ? [Math.sign(top[0]) * buildX, 4 + rand() * 6, top[2] + (rand() - 0.5) * 10]
        : [-top[0], 7.5 + rand(), top[2] + (rand() - 0.5) * 8];
      sagWire(wirePoints, [top[0], top[1] - rand() * 1.2, top[2]], end, 0.4 + rand() * 1.2);
    }
  }
  // Fake street-lamp light: soft additive pools on the road (no real lights = cheap on phones).
  const poolTex = tex(lightPoolTexture());
  const poolMat = track(
    new THREE.MeshBasicMaterial({
      map: poolTex,
      color: 0xffc77a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  nightGlows.push({ material: poolMat, max: 0.85 });
  const pools = new MeshBuilder();
  for (const side of [-1, 1]) {
    for (let z = zMin + 6; z < zMax; z += 22) {
      pools.ground(side * (roadHalf - 1.2), 0.03, z, 9, 9);
    }
  }
  const poolMesh = pools.build(poolMat, { castShadow: false, receiveShadow: false })!;
  poolMesh.renderOrder = 2;
  group.add(poolMesh);
  group.add(
    poles.build(
      track(
        new THREE.MeshStandardMaterial({ ...pbr('concrete'), roughness: 0.9, vertexColors: true }),
      ),
    )!,
  );
  group.add(lamps.build(lampMat, { castShadow: false })!);
  // Poster atlas (one draw call) + a political banner across the road
  const posterTex = tex(posterAtlas(seed + 5));
  const posterMat = track(
    new THREE.MeshStandardMaterial({
      map: posterTex,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  group.add(posters.build(posterMat, { castShadow: false })!);
  const bannerMat = track(
    new THREE.MeshStandardMaterial({
      map: tex(bannerTexture()),
      roughness: 0.95,
      side: THREE.DoubleSide,
    }),
  );
  for (const bz of [-38, 72]) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(roadHalf * 2 - 1.5, 1.35), bannerMat);
    banner.position.set(0, 6.3, bz);
    banner.rotation.y = bz > 0 ? Math.PI : 0;
    banner.castShadow = preset.shadows;
    group.add(banner);
    sagWire(wirePoints, [-(roadHalf + 0.5), 7.4, bz], [roadHalf + 0.5, 7.4, bz], 0.4);
  }

  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePoints, 3));
  const wires = new THREE.LineSegments(
    wireGeo,
    track(new THREE.LineBasicMaterial({ color: 0x151515 })),
  );
  group.add(wires);

  // ---------- Props: tea stall, parked rickshaw ----------
  const props = new MeshBuilder();
  const teaX = roadHalf + footWidth - 0.9;
  const teaZ = -12;
  props.box([1.6, 1.0, 2.2], [teaX, curbHeight + 0.5, teaZ], 0x8b5a2b); // counter
  props.box([1.8, 0.06, 2.6], [teaX, curbHeight + 2.25, teaZ], 0x2c6fb0); // tarp roof
  for (const [dx, dz] of [
    [0.8, 1.2],
    [-0.8, 1.2],
    [0.8, -1.2],
    [-0.8, -1.2],
  ] as const)
    props.box([0.06, 2.2, 0.06], [teaX + dx, curbHeight + 1.1, teaZ + dz], 0x4a3a2a);
  props.cylinder(0.14, 0.18, 0.32, [teaX, curbHeight + 1.16, teaZ - 0.4], 0xb8b8b8, 10); // kettle
  for (let j = 0; j < 4; j++)
    props.cylinder(
      0.09,
      0.09,
      0.26,
      [teaX + 0.4, curbHeight + 1.13, teaZ + 0.2 + j * 0.22],
      0xc9e6f2,
      8,
    ); // biscuit jars
  props.box([0.5, 0.45, 1.8], [teaX - 1.3, curbHeight + 0.22, teaZ], 0x6b4a2b); // bench
  addStatic([teaX, curbHeight + 0.5, teaZ], [0.8, 0.5, 1.1]);

  const rkX = roadHalf - 1.1;
  const rkZ = -17;
  buildRickshaw(props, rkX, rkZ);
  addStatic([rkX, 0.75, rkZ], [0.55, 0.75, 1.3], false);
  group.add(
    props.build(track(new THREE.MeshStandardMaterial({ roughness: 0.8, vertexColors: true })))!,
  );

  // Shadow-casting only where it matters on low tiers
  if (!preset.shadows) group.traverse((o) => ((o as THREE.Mesh).castShadow = false));

  return {
    group,
    bodies,
    colliders,
    nightMaterials,
    nightGlows,
    points: {
      spawn: [roadHalf + footWidth * 0.5, curbHeight + 1.1, 0],
      car: [roadHalf - 2.2, 0.95, 7],
      cng: [roadHalf - 2.3, 0.95, -6],
      bike: [roadHalf - 0.9, 0.85, 2.5],
    },
    dispose() {
      group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}

function lightPoolTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Sagging wire between two points, as line segments (catenary-ish parabola). */
function sagWire(
  out: number[],
  a: [number, number, number],
  b: [number, number, number],
  sag: number,
) {
  const N = 8;
  let px = a[0];
  let py = a[1];
  let pz = a[2];
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[2] + (b[2] - a[2]) * t;
    const y = a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t);
    out.push(px, py, pz, x, y, z);
    px = x;
    py = y;
    pz = z;
  }
}

/** Colourful cycle-rickshaw (decoration). Faces +Z. */
function buildRickshaw(b: MeshBuilder, x: number, z: number) {
  const wheel = (wx: number, wz: number, r: number) => {
    b.cylinder(r, r, 0.06, [x + wx, r, z + wz], 0x1a1a1a, 14, [0, 0, Math.PI / 2]);
    b.cylinder(r * 0.15, r * 0.15, 0.08, [x + wx, r, z + wz], 0xc0c0c0, 8, [0, 0, Math.PI / 2]);
  };
  wheel(0, 1.05, 0.33);
  wheel(0.5, -0.55, 0.36);
  wheel(-0.5, -0.55, 0.36);
  b.box([0.08, 0.08, 1.6], [x, 0.55, z + 0.25], 0x2a2a2a); // frame
  b.box([0.2, 0.06, 0.35], [x, 0.95, z + 0.75], 0x3a1f12); // driver seat
  b.box([1.0, 0.5, 0.55], [x, 0.75, z - 0.55], 0xd81b60); // passenger box (painted)
  b.box([1.0, 0.12, 0.6], [x, 1.05, z - 0.5], 0x1565c0); // seat cushion
  b.box([1.02, 0.5, 0.1], [x, 1.35, z - 0.82], 0xf9a825); // backrest art panel
  // Folding hood (rickshaw art colours)
  for (let i = 0; i < 4; i++) {
    const a = (i / 3) * 1.2;
    b.box(
      [1.06, 0.05, 0.42],
      [x, 1.55 + Math.sin(a) * 0.35, z - 0.85 + Math.cos(a) * 0.35],
      [0x00897b, 0xe53935, 0xfdd835, 0x5e35b1][i],
    );
  }
  b.cylinder(0.02, 0.02, 0.7, [x, 1.05, z + 1.05], 0xc0c0c0, 6, [0, 0, Math.PI / 2]); // handlebar
}
