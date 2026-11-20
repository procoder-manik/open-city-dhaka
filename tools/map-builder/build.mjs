// Build streamed game map chunks from the OSM export.
// Usage: node tools/map-builder/build.mjs
// In:  assets-src/osm/mohammadpur.json (from fetch-osm.mjs)
// Out: apps/web/public/assets/map/mohammadpur/{index.json, minimap.json, colliders.json, c_<i>_<j>.json}
// Coordinates in the output are decimetres (ints) in game space: the straightest
// stretch of Tajmahal Road is aligned with the hand-built street (origin, +Z).
// Map data © OpenStreetMap contributors (ODbL).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const src = join(root, 'assets-src', 'osm', 'mohammadpur.json');
const outDir = join(root, 'apps', 'web', 'public', 'assets', 'map', 'mohammadpur');

const CHUNK = 256; // metres
const SLICE = { halfX: 32, halfZ: 132 }; // hand-built Tajmahal Road block (keep clear)
const ANCHOR_ROAD = /tajmahal|তাজমহল/i;
const ANCHOR_LEN = 260;

const ROAD_WIDTH = {
  trunk: 16,
  trunk_link: 9,
  primary: 14,
  primary_link: 8,
  secondary: 11,
  secondary_link: 7,
  tertiary: 9,
  tertiary_link: 6,
  unclassified: 6.5,
  residential: 6.5,
  living_street: 5,
  service: 4.5,
  pedestrian: 4,
  footway: 2.4,
  path: 2,
  cycleway: 2.4,
};
const ROAD_RANK = {
  trunk: 5,
  primary: 5,
  secondary: 4,
  tertiary: 3,
  unclassified: 2,
  residential: 2,
  living_street: 1,
  service: 1,
};

// ---------- load & project ----------
const data = JSON.parse(readFileSync(src, 'utf8'));
const nodes = new Map();
for (const e of data.elements) if (e.type === 'node') nodes.set(e.id, e);
const ways = data.elements.filter((e) => e.type === 'way' && e.tags);
const lat0 = 23.7605;
const lon0 = 90.359;
const KX = 111320 * Math.cos((lat0 * Math.PI) / 180);
const KZ = 110540;
const proj = (n) => [(n.lon - lon0) * KX, -(n.lat - lat0) * KZ]; // x east, z south
const wayPts = (w) =>
  w.nodes
    .map((id) => nodes.get(id))
    .filter(Boolean)
    .map(proj);

// ---------- anchor: straightest 260 m of Tajmahal Road ----------
function bestAnchor() {
  let best = null;
  for (const w of ways) {
    if (!w.tags.highway || !ANCHOR_ROAD.test(w.tags.name ?? '')) continue;
    const pts = wayPts(w);
    // densify
    const dense = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(L / 5));
      for (let k = 0; k < n; k++) dense.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    dense.push(pts.at(-1));
    for (let i = 0; i < dense.length; i++) {
      let j = i;
      let len = 0;
      while (j < dense.length - 1 && len < ANCHOR_LEN) {
        len += Math.hypot(dense[j + 1][0] - dense[j][0], dense[j + 1][1] - dense[j][1]);
        j++;
      }
      if (len < ANCHOR_LEN * 0.95) continue;
      const a = dense[i];
      const b = dense[j];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const L = Math.hypot(dx, dz);
      let dev = 0;
      for (let k = i; k <= j; k++) {
        const p = dense[k];
        dev = Math.max(dev, Math.abs(((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / L));
      }
      if (!best || dev < best.dev) best = { dev, a, b };
    }
  }
  if (!best) throw new Error('Tajmahal Road not found in OSM data');
  return best;
}
const anchor = bestAnchor();
const cx = (anchor.a[0] + anchor.b[0]) / 2;
const cz = (anchor.a[1] + anchor.b[1]) / 2;
const ang = Math.atan2(anchor.b[0] - anchor.a[0], anchor.b[1] - anchor.a[1]); // heading of +Z
const cosA = Math.cos(-ang);
const sinA = Math.sin(-ang);
/** World (projected) → game space: anchor centre at origin, road along +Z. */
function toGame([x, z]) {
  const dx = x - cx;
  const dz = z - cz;
  return [dx * cosA + dz * sinA, -dx * sinA + dz * cosA];
}
console.log(
  `Anchor: Tajmahal Road, max deviation ${anchor.dev.toFixed(1)} m, heading ${((ang * 180) / Math.PI).toFixed(1)}°`,
);

const inSlice = (x, z, pad = 0) =>
  Math.abs(x) < SLICE.halfX + pad && Math.abs(z) < SLICE.halfZ + pad;
const dm = (v) => Math.round(v * 10);
const chunkKey = (x, z) => `${Math.floor(x / CHUNK)}_${Math.floor(z / CHUNK)}`;
const chunks = new Map();
const chunk = (k) => {
  if (!chunks.has(k)) chunks.set(k, { r: [], b: [], w: [], p: [], t: [] });
  return chunks.get(k);
};
const hash = (n) => {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---------- roads ----------
const roadSegs = []; // for front-edge detection + minimap
const names = new Map();
for (const w of ways) {
  const type = w.tags.highway;
  if (!type || !(type in ROAD_WIDTH)) continue;
  const width = Number.parseFloat(w.tags.width) || ROAD_WIDTH[type];
  const pts = wayPts(w).map(toGame);
  const anchorRoad = ANCHOR_ROAD.test(w.tags.name ?? '');
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const seg = { type, width, ax, az, bx, bz };
    roadSegs.push(seg);
    if (inSlice(mx, mz, anchorRoad ? 4 : 0)) continue; // the hand-built block draws its own road
    chunk(chunkKey(mx, mz)).r.push([type, dm(width), dm(ax), dm(az), dm(bx), dm(bz)]);
  }
  const nm = w.tags['name:bn'] ?? w.tags.name;
  if (nm && (ROAD_RANK[type] ?? 0) >= 2 && pts.length > 1) {
    const mid = pts[Math.floor(pts.length / 2)];
    const prev = pts[Math.max(0, Math.floor(pts.length / 2) - 1)];
    const len = pts.reduce(
      (s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0),
      0,
    );
    const cur = names.get(nm);
    if (!cur || len > cur.len)
      names.set(nm, {
        len,
        x: mid[0],
        z: mid[1],
        a: Math.atan2(mid[0] - prev[0], mid[1] - prev[1]),
      });
  }
}

// Spatial grid for road proximity
const GRID = 32;
const grid = new Map();
for (const s of roadSegs) {
  if ((ROAD_RANK[s.type] ?? 0) < 1) continue;
  const minX = Math.floor(Math.min(s.ax, s.bx) / GRID);
  const maxX = Math.floor(Math.max(s.ax, s.bx) / GRID);
  const minZ = Math.floor(Math.min(s.az, s.bz) / GRID);
  const maxZ = Math.floor(Math.max(s.az, s.bz) / GRID);
  for (let i = minX; i <= maxX; i++)
    for (let j = minZ; j <= maxZ; j++) {
      const k = `${i},${j}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(s);
    }
}
function nearRoad(x, z, extra) {
  const list = grid.get(`${Math.floor(x / GRID)},${Math.floor(z / GRID)}`) ?? [];
  for (const s of list) {
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
    const d = Math.hypot(s.ax + dx * t - x, s.az + dz * t - z);
    if (d < s.width / 2 + extra) return true;
  }
  return false;
}

// ---------- geometry helpers ----------
const area = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
};
function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), q) <= 0) lo.pop();
    lo.push(q);
  }
  const up = [];
  for (const q of p.reverse()) {
    while (up.length >= 2 && cross(up.at(-2), up.at(-1), q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** Minimum-area oriented box: [cx, cz, hx, hz, yaw]. */
function obb(pts) {
  const h = hull(pts);
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const [x1, z1] = h[i];
    const [x2, z2] = h[(i + 1) % h.length];
    const yaw = Math.atan2(x2 - x1, z2 - z1);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    let minU = Infinity,
      maxU = -Infinity,
      minV = Infinity,
      maxV = -Infinity;
    for (const [x, z] of h) {
      const u = x * c - z * s;
      const v = x * s + z * c;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const a = (maxU - minU) * (maxV - minV);
    if (!best || a < best.a) {
      const mu = (minU + maxU) / 2;
      const mv = (minV + maxV) / 2;
      best = {
        a,
        cx: mu * c + mv * s,
        cz: -mu * s + mv * c,
        hx: (maxU - minU) / 2,
        hz: (maxV - minV) / 2,
        yaw,
      };
    }
  }
  return best;
}

// ---------- buildings ----------
const colliders = [];
let kept = 0;
for (const w of ways) {
  if (!w.tags.building || w.nodes.length < 4) continue;
  let pts = wayPts(w).map(toGame);
  if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
  if (pts.length < 3) continue;
  const a = area(pts);
  if (Math.abs(a) < 12) continue;
  if (a < 0) pts = pts.reverse(); // CCW
  const bx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const bz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  if (inSlice(bx, bz, 6) || pts.some(([x, z]) => inSlice(x, z, 1))) continue;
  const r = hash(w.id);
  let levels = Number.parseInt(w.tags['building:levels'], 10);
  if (!Number.isFinite(levels) || levels < 1) {
    const h = Number.parseFloat(w.tags.height);
    levels = Number.isFinite(h)
      ? Math.max(1, Math.round(h / 3.1))
      : Math.abs(a) < 60
        ? 2 + Math.floor(r * 3)
        : 4 + Math.floor(r * 6);
  }
  levels = Math.min(levels, 22);
  // Edges facing a road get shops + signboards
  const front = [];
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    const L = Math.hypot(x2 - x1, z2 - z1);
    if (L < 3.5) continue;
    const nx = (z2 - z1) / L; // outward normal for CCW
    const nz = -(x2 - x1) / L;
    if (nearRoad((x1 + x2) / 2 + nx * 6, (z1 + z2) / 2 + nz * 6, 6)) front.push(i);
  }
  const o = obb(pts);
  const height = levels * 3.1 + 0.6;
  colliders.push([dm(o.cx), dm(o.cz), dm(o.hx), dm(o.hz), Math.round(o.yaw * 1000), dm(height)]);
  chunk(chunkKey(bx, bz)).b.push([
    levels,
    Math.floor(r * 1000),
    pts.flatMap(([x, z]) => [dm(x), dm(z)]),
    front,
  ]);
  kept++;
}

// ---------- water & parks ----------
for (const w of ways) {
  const t = w.tags;
  const isWaterArea = t.natural === 'water';
  const isPark =
    /park|playground|pitch/.test(t.leisure ?? '') ||
    /grass|recreation_ground/.test(t.landuse ?? '');
  const isRiver = !!t.waterway;
  if (!isWaterArea && !isPark && !isRiver) continue;
  const pts = wayPts(w).map(toGame);
  if (pts.length < 2) continue;
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const mz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  if (inSlice(mx, mz)) continue;
  const flat = pts.flatMap(([x, z]) => [dm(x), dm(z)]);
  if (isRiver) {
    const width = { river: 40, canal: 14, drain: 4, stream: 6, ditch: 3 }[t.waterway] ?? 6;
    chunk(chunkKey(mx, mz)).t.push([dm(width), flat]);
  } else if (isWaterArea) chunk(chunkKey(mx, mz)).w.push(flat);
  else chunk(chunkKey(mx, mz)).p.push(flat);
}

// ---------- POIs ----------
const pois = [];
for (const e of data.elements) {
  if (e.type !== 'node' || !e.tags?.name) continue;
  const kind = e.tags.amenity ?? e.tags.place;
  if (!kind) continue;
  const [x, z] = toGame(proj(e));
  pois.push({ n: e.tags['name:bn'] ?? e.tags.name, k: kind, x: Math.round(x), z: Math.round(z) });
}

// ---------- write ----------
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
let minX = Infinity,
  maxX = -Infinity,
  minZ = Infinity,
  maxZ = -Infinity;
for (const s of roadSegs) {
  minX = Math.min(minX, s.ax, s.bx);
  maxX = Math.max(maxX, s.ax, s.bx);
  minZ = Math.min(minZ, s.az, s.bz);
  maxZ = Math.max(maxZ, s.az, s.bz);
}
let bytes = 0;
const keys = [];
for (const [k, c] of chunks) {
  if (!c.r.length && !c.b.length && !c.w.length && !c.p.length && !c.t.length) continue;
  const text = JSON.stringify(c);
  bytes += text.length;
  writeFileSync(join(outDir, `c_${k}.json`), text);
  keys.push(k);
}
const minimap = roadSegs
  .filter((s) => (ROAD_RANK[s.type] ?? 0) >= 1 || s.type === 'footway')
  .map((s) => [
    ROAD_RANK[s.type] ?? 0,
    Math.round(s.ax),
    Math.round(s.az),
    Math.round(s.bx),
    Math.round(s.bz),
  ]);
writeFileSync(join(outDir, 'minimap.json'), JSON.stringify({ roads: minimap }));
writeFileSync(join(outDir, 'colliders.json'), JSON.stringify(colliders));
const index = {
  v: 1,
  name: 'Mohammadpur',
  chunk: CHUNK,
  bounds: {
    minX: Math.floor(minX),
    maxX: Math.ceil(maxX),
    minZ: Math.floor(minZ),
    maxZ: Math.ceil(maxZ),
  },
  slice: SLICE,
  chunks: keys,
  pois,
  roads: [...names.entries()].map(([n, v]) => ({
    n,
    x: Math.round(v.x),
    z: Math.round(v.z),
    a: +v.a.toFixed(2),
  })),
  attribution: 'Map data © OpenStreetMap contributors (ODbL)',
};
writeFileSync(join(outDir, 'index.json'), JSON.stringify(index));
console.log(
  `buildings ${kept}, chunks ${keys.length}, chunk data ${(bytes / 1e6).toFixed(2)} MB, colliders ${colliders.length}, minimap segs ${minimap.length}, pois ${pois.length}, named roads ${names.size}`,
);
console.log(
  `bounds x ${index.bounds.minX}..${index.bounds.maxX}, z ${index.bounds.minZ}..${index.bounds.maxZ}`,
);
