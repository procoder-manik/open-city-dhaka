import * as THREE from 'three/webgpu';
import type { QualityPreset } from '@game/shared';
import type { GraphEdge, RoadGraph } from '../world/city/RoadGraph';
import type { HumanoidLook } from './Humanoid';
import { Npc, type NpcDef } from './Npc';

const SKINS = [0x8d5a3b, 0x7e5235, 0x6e4429, 0x9a6a48, 0xa87a58, 0x5e3a24];
const HAIR = [0x120d0b, 0x15100d, 0x2a1d14, 0xd8d4cc];
const SHIRTS = [0xf3efe4, 0x8fb4d8, 0xd65a4a, 0x3a6a4a, 0xe8c050, 0x5a4a8a, 0xffffff, 0x2a2a2a];
const PANTS = [0x2a3b57, 0x3a3a3a, 0x5a4a3a, 0x1e1e22, 0x6a6a5a];
const KAMEEZ = [0xc8306a, 0x2a8aa0, 0xe0a030, 0x8a3ab0, 0x2a9a5a, 0xd04a3a, 0xf0e0c0];

/** Random Dhaka street look: office men, students, uncles in panjabi, women in salwar-kameez. */
export function randomLook(rand: () => number): { look: HumanoidLook; female: boolean } {
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]!;
  const female = rand() < 0.4;
  if (female) {
    return {
      female,
      look: {
        skin: pick(SKINS),
        hair: 0x120d0b,
        hairStyle: 'long',
        beard: 'none',
        mustache: false,
        top: { kind: 'panjabi', color: pick(KAMEEZ) },
        bottom: { kind: 'trousers', color: pick(KAMEEZ) },
        shoes: { kind: 'sandals', color: 0x5a3a2a },
        height: 0.92 + rand() * 0.05,
        swagger: 0,
      },
    };
  }
  const uncle = rand() < 0.3;
  return {
    female,
    look: {
      skin: pick(SKINS),
      hair: uncle ? pick(HAIR) : pick(HAIR.slice(0, 3)),
      hairStyle: rand() < 0.15 ? 'bald' : 'short',
      beard: uncle ? pick(['full', 'grey', 'stubble'] as const) : pick(['none', 'stubble'] as const),
      mustache: rand() < 0.5,
      top: uncle
        ? { kind: 'panjabi', color: pick([0xf3efe4, 0xe8e0c8, 0xd0d8e0]) }
        : { kind: rand() < 0.5 ? 'shirt' : 'tshirt', color: pick(SHIRTS) },
      bottom: uncle && rand() < 0.4
        ? { kind: 'lungi', color: pick([0x2a5c3a, 0x2b4a7a, 0x7a2b2b]), check: 0xd9c46a }
        : { kind: rand() < 0.5 ? 'jeans' : 'trousers', color: pick(PANTS) },
      shoes: { kind: rand() < 0.5 ? 'sandals' : 'sneakers', color: pick([0x2a221a, 0xf2f2ee, 0x3a3a3a]) },
      cap: uncle && rand() < 0.4 ? 0xf6f4ee : null,
      belly: uncle ? 0.3 + rand() * 0.5 : 0,
      height: 0.95 + rand() * 0.08,
      swagger: 0,
    },
  };
}

export type PedState = 'walk' | 'flee' | 'knocked' | 'getup';

export interface Pedestrian {
  npc: Npc;
  active: boolean;
  state: PedState;
  edge: GraphEdge | null;
  from: number;
  t: number;
  side: number;
  speed: number;
  timer: number;
  fleeFrom: THREE.Vector3;
  /** Fall direction (yaw) when knocked. */
  fallYaw: number;
  fall: number;
  /** Times knocked down / punched (dies → stays down longer). */
  hits: number;
  prevPos: THREE.Vector3;
}

/** Pooled pedestrians walking the real sidewalks, reacting to danger. */
export class PedestrianSystem {
  readonly peds: Pedestrian[] = [];
  readonly group = new THREE.Group();
  private target: number;
  private spawnTimer = 0;

  constructor(
    private readonly graph: RoadGraph,
    preset: QualityPreset,
    private readonly rand: () => number,
  ) {
    const pool = Math.round(5 + preset.npcDensity * 13); // 8 lite … 18 high
    this.target = pool;
    for (let i = 0; i < pool; i++) {
      const { look, female } = randomLook(rand);
      const def: NpcDef = {
        id: `ped${i}`,
        speaker: female ? 'aunty' : 'pedestrian',
        kind: 'person',
        position: [0, -50, 0],
        facing: 0,
        look,
      };
      const npc = new Npc(def);
      npc.humanoid.setCastShadow(preset.shadows && preset.npcDensity >= 1);
      npc.humanoid.root.visible = false;
      npc.humanoid.root.rotation.order = 'YXZ';
      this.group.add(npc.humanoid.root);
      this.peds.push({
        npc,
        active: false,
        state: 'walk',
        edge: null,
        from: 0,
        t: 0,
        side: 1,
        speed: 1.3,
        timer: 0,
        fleeFrom: new THREE.Vector3(),
        fallYaw: 0,
        fall: 0,
        hits: 0,
        prevPos: new THREE.Vector3(),
      });
    }
  }

  get active(): Pedestrian[] {
    return this.peds.filter((p) => p.active);
  }

  private spawn(p: Pedestrian, focus: THREE.Vector3, minR: number, maxR: number) {
    const e = this.graph.edgeNear(focus.x, focus.z, minR, maxR, this.rand, 1);
    if (!e) return;
    p.edge = e;
    p.from = this.rand() < 0.5 ? e.a : e.b;
    p.t = this.rand() * e.length;
    p.side = this.rand() < 0.5 ? 1 : -1;
    p.speed = 1.1 + this.rand() * 0.5;
    p.state = 'walk';
    p.fall = 0;
    p.hits = 0;
    p.active = true;
    p.npc.fear = 0;
    p.npc.wallet = 50 + Math.floor(this.rand() * 600);
    p.npc.humanoid.root.visible = true;
    p.npc.humanoid.root.rotation.set(0, 0, 0, 'YXZ');
    this.sidewalkPose(p, p.npc.position);
    p.prevPos.copy(p.npc.position);
  }

  despawn(p: Pedestrian) {
    p.active = false;
    p.npc.humanoid.root.visible = false;
    p.npc.position.set(0, -50, 0);
  }

  /** Spawn a specific person at a spot, fleeing (a carjacked driver). */
  spawnFleeing(at: THREE.Vector3, from: THREE.Vector3): Pedestrian | null {
    const p = this.peds.find((x) => !x.active) ?? this.peds.find((x) => x.state === 'walk');
    if (!p) return null;
    this.spawn(p, at, 0, 60);
    p.npc.position.copy(at).setY(0);
    p.prevPos.copy(p.npc.position);
    this.scare(p, from, 7);
    return p;
  }

  private sidewalkPose(p: Pedestrian, out: THREE.Vector3): number {
    const e = p.edge!;
    const a = this.graph.nodes[p.from]!;
    const b = this.graph.nodes[this.graph.other(e, p.from)]!;
    const dx = (b.x - a.x) / (e.length || 1);
    const dz = (b.z - a.z) / (e.length || 1);
    const off = (e.width / 2 + 1.3) * p.side;
    out.set(a.x + dx * p.t + dz * off, 0, a.z + dz * p.t - dx * off);
    return Math.atan2(dx, dz);
  }

  scare(p: Pedestrian, from: THREE.Vector3, seconds: number) {
    if (p.state === 'knocked' || p.state === 'getup') return;
    p.state = 'flee';
    p.timer = seconds;
    p.fleeFrom.copy(from);
    p.npc.fear = 1;
    p.npc.humanoid.setEmotion('scared', seconds);
  }

  /** Everyone within `radius` runs (gunshot, explosion, crash). */
  scareAll(from: THREE.Vector3, radius: number, seconds = 6) {
    for (const p of this.peds)
      if (p.active && p.npc.position.distanceTo(from) < radius) this.scare(p, from, seconds);
  }

  /** Knock down (hit by a car, punched, blast). */
  knock(p: Pedestrian, fromYaw: number, seconds = 4) {
    p.state = 'knocked';
    p.timer = seconds;
    p.fallYaw = fromYaw;
    // Face the hit so the fall goes backwards, along the push
    p.npc.humanoid.root.rotation.y = fromYaw + Math.PI;
    p.hits += 1;
    p.npc.fear = 1;
    p.npc.humanoid.setEmotion('scared', seconds + 2);
  }

  update(dt: number, focus: THREE.Vector3, isWalkable?: (x: number, z: number) => boolean) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.3;
      const free = this.peds.find((p) => !p.active);
      const count = this.peds.length - this.peds.filter((p) => !p.active).length;
      if (free && count < this.target) this.spawn(free, focus, count < this.target / 2 ? 12 : 45, 75);
    }
    for (const p of this.peds) {
      if (!p.active) continue;
      const npc = p.npc;
      npc.tick(dt);
      if (npc.position.distanceTo(focus) > 95) {
        this.despawn(p);
        continue;
      }
      const root = npc.humanoid.root;
      let speed = 0;
      p.prevPos.copy(npc.position);
      if (p.state === 'walk' && p.edge) {
        p.t += p.speed * dt;
        while (p.edge && p.t >= p.edge.length) {
          p.t -= p.edge.length;
          const node = this.graph.other(p.edge, p.from);
          p.edge = this.graph.nextEdge(node, p.edge.id, this.rand, 1);
          p.from = node;
        }
        const target = new THREE.Vector3();
        const yaw = this.sidewalkPose(p, target);
        // Ease toward the sidewalk line (smooth corners / return after fleeing)
        const k = 1 - Math.exp(-3 * dt);
        npc.position.x += (target.x - npc.position.x) * k;
        npc.position.z += (target.z - npc.position.z) * k;
        root.rotation.y += wrap(yaw - root.rotation.y) * (1 - Math.exp(-6 * dt));
        speed = p.speed;
      } else if (p.state === 'flee') {
        p.timer -= dt;
        const away = npc.position.clone().sub(p.fleeFrom).setY(0);
        if (away.lengthSq() < 0.01) away.set(this.rand() - 0.5, 0, this.rand() - 0.5);
        away.normalize();
        const run = 4.6;
        const nx = npc.position.x + away.x * run * dt;
        const nz = npc.position.z + away.z * run * dt;
        if (!isWalkable || isWalkable(nx, nz)) {
          npc.position.x = nx;
          npc.position.z = nz;
        }
        root.rotation.y += wrap(Math.atan2(away.x, away.z) - root.rotation.y) * (1 - Math.exp(-10 * dt));
        speed = run;
        if (p.timer <= 0) {
          p.state = 'walk';
          // Re-attach to the closest sidewalk position on the current edge
          if (p.edge) this.reattach(p);
        }
      } else if (p.state === 'knocked') {
        p.timer -= dt;
        p.fall = Math.min(1, p.fall + dt * 4);
        if (p.timer <= 0) p.state = 'getup';
      } else if (p.state === 'getup') {
        p.fall = Math.max(0, p.fall - dt * 1.5);
        if (p.fall <= 0) this.scare(p, p.fleeFrom.copy(npc.position).add(new THREE.Vector3(Math.sin(p.fallYaw), 0, Math.cos(p.fallYaw))), 5);
      }
      root.position.copy(npc.position);
      // Falling over: pitch the whole body backwards around the feet
      root.rotation.x = -p.fall * (Math.PI / 2 - 0.08);
      root.position.y = npc.position.y + p.fall * 0.12;
      npc.humanoid.update(dt, {
        speed,
        distance: speed * dt,
        grounded: true,
        vy: 0,
        turnRate: 0,
        accel: p.state === 'flee' ? 0 : -npc.fear * 3,
        riding: false,
      });
    }
  }

  private reattach(p: Pedestrian) {
    const e = p.edge!;
    const a = this.graph.nodes[p.from]!;
    const b = this.graph.nodes[this.graph.other(e, p.from)]!;
    const dx = (b.x - a.x) / (e.length || 1);
    const dz = (b.z - a.z) / (e.length || 1);
    const rx = p.npc.position.x - a.x;
    const rz = p.npc.position.z - a.z;
    p.t = Math.max(0, Math.min(e.length, rx * dx + rz * dz));
    p.side = rx * dz - rz * dx >= 0 ? 1 : -1;
  }

  dispose() {
    for (const p of this.peds) p.npc.humanoid.dispose();
  }
}

function wrap(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
