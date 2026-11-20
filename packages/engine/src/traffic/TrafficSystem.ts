import * as THREE from 'three/webgpu';
import type { QualityPreset } from '@game/shared';
import type { BodyDesc, KinematicInput } from '../physics/protocol';
import { MeshBuilder } from '../world/MeshBuilder';
import type { GraphEdge, RoadGraph } from '../world/city/RoadGraph';

export type TrafficKind = 'car' | 'cng' | 'bus' | 'rickshaw' | 'bike';

interface KindSpec {
  half: [number, number, number];
  speed: number;
  /** Relative spawn weight (Dhaka mix: lots of rickshaws and CNGs). */
  weight: number;
  colors: number[];
  minRank: number;
  /** Player-drivable vehicle def this can be carjacked into. */
  def: string | null;
}

export const TRAFFIC_KINDS: Record<TrafficKind, KindSpec> = {
  car: {
    half: [0.85, 0.7, 2.05],
    speed: 11,
    weight: 3,
    colors: [0xe8e8e8, 0x1c1c1e, 0xb02a2a, 0x8a9aa8, 0x2a4a7a, 0xd9d2c0],
    minRank: 2,
    def: 'car-sedan',
  },
  cng: {
    half: [0.66, 0.85, 1.3],
    speed: 8.5,
    weight: 3,
    colors: [0x2f8a3c, 0x2f8a3c, 0x3d9a48],
    minRank: 1,
    def: 'cng-auto',
  },
  bus: {
    half: [1.25, 1.6, 5.4],
    speed: 8,
    weight: 1,
    colors: [0xc8382e, 0x2a6ab0, 0xe0b030, 0x3a8a6a],
    minRank: 3,
    def: null,
  },
  rickshaw: {
    half: [0.55, 0.9, 1.15],
    speed: 3.6,
    weight: 3,
    colors: [0xd23a6a, 0x2a7ad2, 0xe0a020, 0x8a3ad2],
    minRank: 1,
    def: null,
  },
  bike: {
    half: [0.3, 0.6, 0.95],
    speed: 12,
    weight: 2,
    colors: [0x1a1a1a, 0xb02020, 0x2050b0],
    minRank: 1,
    def: 'bike-150',
  },
};
const KINDS = Object.keys(TRAFFIC_KINDS) as TrafficKind[];

export interface TrafficCar {
  slot: number;
  bodyId: number;
  active: boolean;
  kind: TrafficKind;
  edge: GraphEdge | null;
  from: number;
  t: number;
  speed: number;
  cruise: number;
  pos: THREE.Vector3;
  yaw: number;
  color: THREE.Color;
  /** Seconds stuck behind something (honks after a while). */
  blocked: number;
  /** Stunned after being hit / carjack fright. */
  stun: number;
  honkCooldown: number;
}

export interface TrafficObstacle {
  x: number;
  z: number;
  radius: number;
}

const PARK_Y = -80;

/** Simple Dhaka traffic: instanced vehicles following the real road graph on the left lane. */
export class TrafficSystem {
  readonly group = new THREE.Group();
  readonly cars: TrafficCar[] = [];
  private meshes = new Map<TrafficKind, THREE.InstancedMesh>();
  private materials: THREE.Material[] = [];
  private spawnTimer = 0;
  private target: number;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);
  private up = new THREE.Vector3(0, 1, 0);
  /** Called when a traffic vehicle honks: (car, distance to focus). */
  onHonk: ((car: TrafficCar) => void) | null = null;

  constructor(
    private readonly graph: RoadGraph,
    preset: QualityPreset,
    private readonly rand: () => number,
    idBase: number,
  ) {
    const pool = Math.round(6 + preset.trafficDensity * 18); // 10 lite … 24 high
    this.target = pool;
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      metalness: 0.2,
    });
    this.materials.push(mat);
    const perKind = Math.ceil(pool * 0.6);
    for (const kind of KINDS) {
      const geo = buildGeometry(kind);
      const mesh = new THREE.InstancedMesh(geo, mat, perKind);
      mesh.count = 0;
      mesh.castShadow = preset.shadows;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(perKind * 3), 3);
      this.meshes.set(kind, mesh);
      this.group.add(mesh);
    }
    for (let i = 0; i < pool; i++) {
      this.cars.push({
        slot: i,
        bodyId: idBase + i,
        active: false,
        kind: 'car',
        edge: null,
        from: 0,
        t: 0,
        speed: 0,
        cruise: 0,
        pos: new THREE.Vector3(i * 12, PARK_Y, 0),
        yaw: 0,
        color: new THREE.Color(),
        blocked: 0,
        stun: 0,
        honkCooldown: 0,
      });
    }
    this.perKind = perKind;
  }

  private perKind: number;

  /** One kinematic box per pool slot (sized for a car; buses use the same — rare & slow). */
  physicsBodies(): BodyDesc[] {
    return this.cars.map((c) => ({
      id: c.bodyId,
      shape: { kind: 'box', halfExtents: [0.9, 0.7, 2.1] },
      position: [c.pos.x, c.pos.y, c.pos.z],
      type: 'kinematic',
    }));
  }

  kinematic(): KinematicInput[] {
    return this.cars.map((c) => ({
      bodyId: c.bodyId,
      x: c.pos.x,
      y: c.active ? c.pos.y + 0.75 : PARK_Y,
      z: c.active ? c.pos.z : c.slot * 12,
      yaw: c.yaw,
    }));
  }

  get activeCount(): number {
    let n = 0;
    for (const c of this.cars) if (c.active) n++;
    return n;
  }

  private pickKind(rank: number): TrafficKind {
    const ok = KINDS.filter((k) => TRAFFIC_KINDS[k].minRank <= rank);
    let total = 0;
    for (const k of ok) total += TRAFFIC_KINDS[k].weight;
    let r = this.rand() * total;
    for (const k of ok) {
      r -= TRAFFIC_KINDS[k].weight;
      if (r <= 0) return k;
    }
    return 'cng';
  }

  private spawn(c: TrafficCar, focus: THREE.Vector3, minR: number, maxR: number): boolean {
    const e = this.graph.edgeNear(focus.x, focus.z, minR, maxR, this.rand, 2);
    if (!e) return false;
    c.kind = this.pickKind(e.rank);
    const spec = TRAFFIC_KINDS[c.kind];
    c.edge = e;
    c.from = this.rand() < 0.5 ? e.a : e.b;
    c.t = this.rand() * e.length * 0.8;
    c.cruise = spec.speed * (0.8 + this.rand() * 0.35) * (e.rank >= 4 ? 1.15 : 1);
    c.speed = c.cruise * 0.6;
    c.color.setHex(spec.colors[Math.floor(this.rand() * spec.colors.length)]!);
    c.blocked = 0;
    c.stun = 0;
    c.active = true;
    this.place(c, 0);
    return true;
  }

  /** Lane pose: left-hand traffic → keep to the left of the travel direction. */
  private place(c: TrafficCar, dt: number) {
    const e = c.edge!;
    const a = this.graph.nodes[c.from]!;
    const b = this.graph.nodes[this.graph.other(e, c.from)]!;
    const dx = (b.x - a.x) / (e.length || 1);
    const dz = (b.z - a.z) / (e.length || 1);
    const lane = Math.max(1.4, e.width * 0.27);
    const x = a.x + dx * c.t + dz * lane;
    const z = a.z + dz * c.t - dx * lane;
    const yaw = Math.atan2(dx, dz);
    if (dt <= 0) {
      c.pos.set(x, 0, z);
      c.yaw = yaw;
      return;
    }
    // Smooth the corner jumps between edges
    const k = 1 - Math.exp(-8 * dt);
    c.pos.x += (x - c.pos.x) * k;
    c.pos.z += (z - c.pos.z) * k;
    c.pos.y = 0;
    c.yaw += Math.atan2(Math.sin(yaw - c.yaw), Math.cos(yaw - c.yaw)) * (1 - Math.exp(-6 * dt));
  }

  /** Remove a car from the road (carjacked). */
  despawn(c: TrafficCar) {
    c.active = false;
    c.edge = null;
    c.pos.set(c.slot * 12, PARK_Y, 0);
  }

  /** A stopped or slow carjackable vehicle within `range` of (x, z). */
  carjackTarget(x: number, z: number, range: number): TrafficCar | null {
    let best: TrafficCar | null = null;
    let bestD = range;
    for (const c of this.cars) {
      if (!c.active || !TRAFFIC_KINDS[c.kind].def || c.speed > 4) continue;
      const d = Math.hypot(c.pos.x - x, c.pos.z - z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  /** Everything within `radius` of a point gets a scare (stops, honks). */
  stunNear(x: number, z: number, radius: number, seconds: number) {
    for (const c of this.cars)
      if (c.active && Math.hypot(c.pos.x - x, c.pos.z - z) < radius)
        c.stun = Math.max(c.stun, seconds);
  }

  update(dt: number, focus: THREE.Vector3, obstacles: TrafficObstacle[]) {
    // Keep the pool topped up around the player
    this.spawnTimer -= dt;
    for (const c of this.cars) {
      if (!c.active) continue;
      if (Math.hypot(c.pos.x - focus.x, c.pos.z - focus.z) > 230) this.despawn(c);
    }
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.25;
      const free = this.cars.find((c) => !c.active);
      if (free && this.activeCount < this.target) {
        const first = this.activeCount < this.target / 2;
        this.spawn(free, focus, first ? 25 : 90, first ? 160 : 200);
      }
    }

    for (const c of this.cars) {
      if (!c.active || !c.edge) continue;
      const spec = TRAFFIC_KINDS[c.kind];
      c.honkCooldown = Math.max(0, c.honkCooldown - dt);
      c.stun = Math.max(0, c.stun - dt);
      // Look ahead for vehicles / people
      const fx = Math.sin(c.yaw);
      const fz = Math.cos(c.yaw);
      let gap = Infinity;
      for (const o of this.cars) {
        if (o === c || !o.active) continue;
        const rx = o.pos.x - c.pos.x;
        const rz = o.pos.z - c.pos.z;
        const ahead = rx * fx + rz * fz;
        if (ahead <= 0 || ahead > 18) continue;
        const side = Math.abs(rx * fz - rz * fx);
        if (side > 1.8) continue;
        gap = Math.min(gap, ahead - spec.half[2] - TRAFFIC_KINDS[o.kind].half[2]);
      }
      let person = false;
      for (const o of obstacles) {
        const rx = o.x - c.pos.x;
        const rz = o.z - c.pos.z;
        const ahead = rx * fx + rz * fz;
        if (ahead <= 0 || ahead > 14) continue;
        if (Math.abs(rx * fz - rz * fx) > spec.half[0] + o.radius + 0.6) continue;
        const g = ahead - spec.half[2] - o.radius;
        if (g < gap) {
          gap = g;
          person = true;
        }
      }
      const safe = Math.max(0, gap - 1.5);
      let want = c.stun > 0 ? 0 : Math.min(c.cruise, safe * 1.1);
      if (gap < 1.2) want = 0;
      // Slow down for corners
      const edgeLeft = c.edge.length - c.t;
      if (edgeLeft < 8) want = Math.min(want, Math.max(3, c.cruise * 0.55));
      const accel = want > c.speed ? 2.5 : 7;
      c.speed += Math.sign(want - c.speed) * Math.min(Math.abs(want - c.speed), accel * dt);
      if (want < 0.5 && gap < 6) {
        c.blocked += dt;
        if (c.blocked > (person ? 0.6 : 2.5) && c.honkCooldown <= 0) {
          c.honkCooldown = 2.5 + this.rand() * 4;
          this.onHonk?.(c);
        }
      } else c.blocked = 0;

      c.t += c.speed * dt;
      while (c.edge && c.t >= c.edge.length) {
        c.t -= c.edge.length;
        const node = this.graph.other(c.edge, c.from);
        const next = this.graph.nextEdge(node, c.edge.id, this.rand, 2);
        c.from = node;
        c.edge = next;
      }
      this.place(c, dt);
    }
    this.syncInstances();
  }

  private syncInstances() {
    const counts = new Map<TrafficKind, number>();
    for (const c of this.cars) {
      if (!c.active) continue;
      const mesh = this.meshes.get(c.kind)!;
      const i = counts.get(c.kind) ?? 0;
      if (i >= this.perKind) continue;
      counts.set(c.kind, i + 1);
      this.q.setFromAxisAngle(this.up, c.yaw);
      this.m.compose(c.pos, this.q, this.s);
      mesh.setMatrixAt(i, this.m);
      mesh.setColorAt(i, c.color);
    }
    for (const [kind, mesh] of this.meshes) {
      mesh.count = counts.get(kind) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose() {
    for (const m of this.meshes.values()) m.geometry.dispose();
    for (const m of this.materials) m.dispose();
  }
}

/**
 * Low-poly traffic models, built facing +Z with the ground at y=0. White parts take the
 * per-instance paint colour (instanceColor multiplies vertex colour); others are fixed.
 */
function buildGeometry(kind: TrafficKind): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const PAINT = 0xffffff;
  const DARK = 0x1a1a1c;
  const GLASS = 0x26303a;
  const wheel = (x: number, z: number, r: number, w = 0.22) =>
    b.cylinder(r, r, w, [x, r, z], DARK, 10, [0, 0, Math.PI / 2]);
  switch (kind) {
    case 'car':
      b.box([1.7, 0.55, 4.1], [0, 0.6, 0], PAINT);
      b.box([1.5, 0.48, 2.1], [0, 1.1, -0.25], GLASS);
      b.box([1.52, 0.06, 2.0], [0, 1.36, -0.25], PAINT);
      for (const [x, z] of [
        [0.78, 1.35],
        [-0.78, 1.35],
        [0.78, -1.35],
        [-0.78, -1.35],
      ] as const)
        wheel(x, z, 0.32);
      b.box([1.5, 0.12, 0.05], [0, 0.72, 2.06], 0xfff1c0);
      b.box([1.5, 0.1, 0.05], [0, 0.72, -2.06], 0xb01818);
      break;
    case 'cng':
      b.box([1.3, 0.5, 2.5], [0, 0.55, 0], PAINT);
      b.box([1.32, 0.95, 1.6], [0, 1.25, -0.35], PAINT);
      b.box([1.36, 0.08, 2.4], [0, 1.76, -0.05], PAINT);
      b.box([1.1, 0.55, 0.06], [0, 1.3, 0.82], GLASS);
      b.box([0.06, 0.6, 1.2], [0.67, 1.3, -0.4], 0x2a2a2a);
      b.box([0.06, 0.6, 1.2], [-0.67, 1.3, -0.4], 0x2a2a2a);
      wheel(0, 1.05, 0.24, 0.16);
      wheel(0.55, -0.85, 0.24, 0.16);
      wheel(-0.55, -0.85, 0.24, 0.16);
      break;
    case 'bus':
      b.box([2.5, 2.6, 10.8], [0, 1.75, 0], PAINT);
      b.box([2.52, 0.75, 9.6], [0, 2.3, -0.2], GLASS);
      b.box([2.2, 0.9, 0.06], [0, 2.1, 5.41], GLASS);
      b.box([2.52, 0.25, 10.82], [0, 0.6, 0], 0xe8e2d0);
      for (const [x, z] of [
        [1.1, 3.6],
        [-1.1, 3.6],
        [1.1, -3.4],
        [-1.1, -3.4],
      ] as const)
        wheel(x, z, 0.5, 0.35);
      break;
    case 'rickshaw':
      // Hood (painted), seat, frame, big rear wheels, front wheel, puller
      b.box([1.0, 0.85, 0.08], [0, 1.55, -0.55], PAINT);
      b.box([1.0, 0.08, 0.85], [0, 1.98, -0.2], PAINT);
      b.box([1.0, 0.15, 0.6], [0, 0.95, -0.55], 0x7a1a3a);
      b.box([0.1, 0.1, 1.9], [0, 0.6, 0.1], 0x3a3a3a);
      wheel(0.5, -0.6, 0.38, 0.06);
      wheel(-0.5, -0.6, 0.38, 0.06);
      wheel(0, 1.0, 0.33, 0.06);
      b.box([0.36, 0.55, 0.24], [0, 1.35, 0.75], 0xd6d0c2); // puller (vest)
      b.box([0.3, 0.6, 0.22], [0, 0.75, 0.75], 0x7a2b2b); // lungi
      b.box([0.2, 0.22, 0.2], [0, 1.75, 0.75], 0x6e4429); // head
      break;
    case 'bike':
      b.box([0.3, 0.35, 1.4], [0, 0.7, 0], PAINT);
      b.box([0.32, 0.12, 0.7], [0, 0.92, -0.2], DARK);
      wheel(0, 0.68, 0.3, 0.1);
      wheel(0, -0.68, 0.3, 0.1);
      b.box([0.38, 0.6, 0.26], [0, 1.3, -0.1], 0x3a5a7a); // rider
      b.box([0.24, 0.26, 0.24], [0, 1.75, -0.05], 0x222222); // helmet
      break;
  }
  const tmpMat = new THREE.MeshBasicMaterial();
  const geo = b.build(tmpMat)!.geometry;
  tmpMat.dispose();
  return geo;
}
