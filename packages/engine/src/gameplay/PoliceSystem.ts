import * as THREE from 'three/webgpu';
import type { QualityPreset } from '@game/shared';
import type { HumanoidLook } from '../actors/Humanoid';
import { Npc } from '../actors/Npc';
import type { BodyDesc, KinematicInput } from '../physics/protocol';
import { MeshBuilder } from '../world/MeshBuilder';
import type { GraphEdge, RoadGraph } from '../world/city/RoadGraph';
import { copHitChance, policeFor } from './Combat';

const COP_LOOK: HumanoidLook = {
  skin: 0x7e5235,
  hair: 0x15100d,
  hairStyle: 'short',
  beard: 'none',
  mustache: true,
  top: { kind: 'shirt', color: 0x2b3f5c },
  bottom: { kind: 'trousers', color: 0x1d2633 },
  shoes: { kind: 'sneakers', color: 0x111111 },
  cap: 0x1d2633,
  belly: 0.35,
  height: 1.0,
  swagger: 0.2,
};

export type CopState = 'chase' | 'shoot' | 'down' | 'leave';

export interface Cop {
  npc: Npc;
  active: boolean;
  state: CopState;
  health: number;
  timer: number;
  shootCd: number;
  fall: number;
  speed: number;
  /** Road-graph waypoint for long chases (around buildings). */
  wp: THREE.Vector3 | null;
  wpNode: number;
  /** Preferred side when steering around obstacles. */
  side: number;
  /** Seconds chasing without getting closer (stuck behind a building). */
  stuck: number;
  best: number;
}

export interface PoliceCar {
  slot: number;
  bodyId: number;
  active: boolean;
  edge: GraphEdge | null;
  from: number;
  t: number;
  speed: number;
  pos: THREE.Vector3;
  yaw: number;
  /** Arrived near the player and dropped its cops. */
  parked: boolean;
  /** Seconds without getting closer to the player (greedy routing can circle). */
  stuck: number;
  /** Closest it has been to the player this run. */
  best: number;
}

export type PoliceEvent =
  | { type: 'shot'; cop: Cop; hit: boolean; from: THREE.Vector3 }
  | { type: 'bark'; cop: Cop | null; situation: string }
  | { type: 'arrest' };

export interface PoliceContext {
  stars: number;
  player: THREE.Vector3;
  inVehicle: boolean;
  playerSpeed: number;
  /** True while the player can't be arrested (already wasted/busted). */
  frozen: boolean;
  blocked: (x: number, z: number) => boolean;
}

const PARK_Y = -90;
const COP_RUN = 5.3;

/** Wanted-level response: foot cops chase/shoot/arrest; patrol cars drive in on the road graph. */
export class PoliceSystem {
  readonly group = new THREE.Group();
  readonly cops: Cop[] = [];
  readonly cars: PoliceCar[] = [];
  /** 0..1 progress of an arrest in progress (HUD). */
  arrest = 0;
  private carMesh: THREE.InstancedMesh;
  private lightMesh: THREE.InstancedMesh;
  private materials: THREE.Material[] = [];
  private spawnTimer = 0;
  private barkTimer = 3;
  private flash = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private one = new THREE.Vector3(1, 1, 1);
  private up = new THREE.Vector3(0, 1, 0);
  private red = new THREE.Color(0xff2020);
  private blue = new THREE.Color(0x2060ff);

  constructor(
    private readonly graph: RoadGraph | null,
    preset: QualityPreset,
    private readonly rand: () => number,
    idBase: number,
  ) {
    for (let i = 0; i < 6; i++) {
      const npc = new Npc({
        id: `cop${i}`,
        speaker: 'police',
        kind: 'person',
        position: [0, -60, 0],
        facing: 0,
        look: { ...COP_LOOK, skin: [0x7e5235, 0x8d5a3b, 0x6e4429][i % 3]! },
      });
      npc.humanoid.setCastShadow(preset.shadows && preset.shadowMapSize >= 2048);
      npc.humanoid.setGun(true);
      npc.humanoid.root.visible = false;
      npc.humanoid.root.rotation.order = 'YXZ';
      this.group.add(npc.humanoid.root);
      this.cops.push({
        npc,
        active: false,
        state: 'chase',
        health: 100,
        timer: 0,
        shootCd: 0,
        fall: 0,
        speed: COP_RUN,
        wp: null,
        wpNode: -1,
        side: i % 2 ? 1 : -1,
        stuck: 0,
        best: Infinity,
      });
    }
    for (let i = 0; i < 3; i++)
      this.cars.push({
        slot: i,
        bodyId: idBase + i,
        active: false,
        edge: null,
        from: 0,
        t: 0,
        speed: 0,
        pos: new THREE.Vector3(i * 12, PARK_Y, 40),
        yaw: 0,
        parked: false,
        stuck: 0,
        best: Infinity,
      });
    const body = new MeshBuilder();
    // Pickup: navy cab, white doors stripe, open bed with bench
    body.box([1.8, 0.6, 4.6], [0, 0.65, 0], 0x22365e);
    body.box([1.82, 0.16, 4.62], [0, 0.78, 0], 0xf0f0f0);
    body.box([1.7, 0.6, 1.9], [0, 1.25, 0.75], 0x22365e);
    body.box([1.6, 0.42, 1.7], [0, 1.3, 0.78], 0x223040);
    body.box([1.7, 0.35, 0.08], [0, 1.13, -2.26], 0x22365e);
    body.box([0.08, 0.35, 2.2], [0.86, 1.13, -1.1], 0x22365e);
    body.box([0.08, 0.35, 2.2], [-0.86, 1.13, -1.1], 0x22365e);
    for (const [x, z] of [
      [0.82, 1.5],
      [-0.82, 1.5],
      [0.82, -1.5],
      [-0.82, -1.5],
    ] as const)
      body.cylinder(0.36, 0.36, 0.26, [x, 0.36, z], 0x1a1a1c, 10, [0, 0, Math.PI / 2]);
    body.box([1.6, 0.12, 0.05], [0, 0.8, 2.31], 0xfff1c0);
    const carMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.45,
      metalness: 0.3,
    });
    const tmp = new THREE.MeshBasicMaterial();
    this.carMesh = new THREE.InstancedMesh(body.build(tmp)!.geometry, carMat, 3);
    this.carMesh.castShadow = preset.shadows;
    this.carMesh.frustumCulled = false;
    this.carMesh.count = 0;
    const bar = new MeshBuilder();
    bar.box([0.6, 0.14, 0.3], [0.32, 1.62, 0.75], 0xffffff);
    bar.box([0.6, 0.14, 0.3], [-0.32, 1.62, 0.75], 0xffffff);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.lightMesh = new THREE.InstancedMesh(bar.build(tmp)!.geometry, lightMat, 6);
    this.lightMesh.frustumCulled = false;
    this.lightMesh.count = 0;
    this.lightMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(18), 3);
    tmp.dispose();
    this.materials.push(carMat, lightMat);
    this.group.add(this.carMesh, this.lightMesh);
  }

  physicsBodies(): BodyDesc[] {
    return this.cars.map((c) => ({
      id: c.bodyId,
      shape: { kind: 'box', halfExtents: [0.9, 0.75, 2.3] },
      position: [c.pos.x, c.pos.y, c.pos.z],
      type: 'kinematic',
    }));
  }

  kinematic(): KinematicInput[] {
    return this.cars.map((c) => ({
      bodyId: c.bodyId,
      x: c.active ? c.pos.x : c.slot * 12,
      y: c.active ? 0.8 : PARK_Y,
      z: c.active ? c.pos.z : 40,
      yaw: c.yaw,
    }));
  }

  get activeCops(): Cop[] {
    return this.cops.filter((c) => c.active);
  }

  /** Any conscious cop within `r` metres. */
  copNear(p: THREE.Vector3, r: number): boolean {
    return this.cops.some(
      (c) => c.active && c.state !== 'down' && c.npc.position.distanceTo(p) < r,
    );
  }

  /** Cop takes damage (punch/bullet/blast). Returns true if it was knocked down. */
  hurt(cop: Cop, damage: number, fromYaw: number): boolean {
    if (!cop.active || cop.state === 'down') return false;
    cop.health -= damage;
    if (cop.health > 0) return false;
    cop.state = 'down';
    cop.timer = 25;
    cop.npc.humanoid.aiming = false;
    cop.npc.humanoid.root.rotation.y = fromYaw + Math.PI;
    cop.npc.humanoid.setEmotion('scared', 25);
    return true;
  }

  /** Everyone stands down (bribe paid / respawn). */
  standDown() {
    for (const c of this.cops) if (c.active && c.state !== 'down') c.state = 'leave';
    this.arrest = 0;
  }

  clearAll() {
    for (const c of this.cops) this.despawnCop(c);
    for (const c of this.cars) this.despawnCar(c);
    this.arrest = 0;
  }

  private despawnCop(c: Cop) {
    c.active = false;
    c.npc.humanoid.root.visible = false;
    c.npc.position.set(0, -60, 0);
  }

  private despawnCar(c: PoliceCar) {
    c.active = false;
    c.edge = null;
    c.pos.set(c.slot * 12, PARK_Y, 40);
  }

  private spawnCop(at: THREE.Vector3): Cop | null {
    const c = this.cops.find((x) => !x.active);
    if (!c) return null;
    c.active = true;
    c.state = 'chase';
    c.health = 100;
    c.fall = 0;
    c.shootCd = 1.5 + this.rand() * 1.5;
    c.speed = COP_RUN * (0.9 + this.rand() * 0.15);
    c.npc.position.copy(at).setY(0);
    c.npc.humanoid.root.visible = true;
    c.npc.humanoid.root.rotation.set(0, 0, 0, 'YXZ');
    c.npc.humanoid.setEmotion('angry', 30);
    c.wp = null;
    c.wpNode = -1;
    c.stuck = 0;
    c.best = Infinity;
    return c;
  }

  private spawnPoint(player: THREE.Vector3, minR: number, maxR: number, rank = 1): THREE.Vector3 {
    const e = this.graph?.edgeNear(player.x, player.z, minR, maxR, this.rand, rank);
    if (e && this.graph) {
      const a = this.graph.nodes[e.a]!;
      return new THREE.Vector3(a.x, 0, a.z);
    }
    const ang = this.rand() * Math.PI * 2;
    const r = minR + this.rand() * (maxR - minR);
    return new THREE.Vector3(player.x + Math.cos(ang) * r, 0, player.z + Math.sin(ang) * r);
  }

  update(dt: number, ctx: PoliceContext): PoliceEvent[] {
    const events: PoliceEvent[] = [];
    const want = policeFor(ctx.stars);
    const p = ctx.player;
    this.flash += dt;

    // Spawning
    this.spawnTimer -= dt;
    const conscious = this.cops.filter(
      (c) => c.active && c.state !== 'down' && c.state !== 'leave',
    ).length;
    if (this.spawnTimer <= 0 && ctx.stars > 0) {
      this.spawnTimer = 2.5;
      // Foot cops come with the car — but don't wait for a car that can't get through
      if (conscious < want.cops && this.cars.every((c) => !c.active || c.parked || c.stuck > 8)) {
        const at = this.spawnPoint(p, 30, 55);
        if (this.spawnCop(at)) events.push({ type: 'bark', cop: null, situation: 'chase' });
      }
      const carsActive = this.cars.filter((c) => c.active).length;
      if (carsActive < want.cars && this.graph) {
        const car = this.cars.find((c) => !c.active);
        const e = this.graph.edgeNear(p.x, p.z, 90, 160, this.rand, 2);
        if (car && e) {
          car.active = true;
          car.parked = false;
          car.edge = e;
          car.from = e.a;
          car.t = 0;
          car.speed = 8;
          car.stuck = 0;
          car.best = Infinity;
          const a = this.graph.nodes[e.a]!;
          car.pos.set(a.x, 0, a.z);
        }
      }
    }

    // Patrol cars: greedy route toward the player, stop and drop cops
    // Player far from every road (courtyard, field): cars can't get within 16 m, so they
    // may pull over once they stop getting closer. On a road they keep routing.
    const offRoad = !this.graph?.edgeNear(p.x, p.z, 0, 14, this.rand, 1);
    for (const car of this.cars) {
      if (!car.active) continue;
      const d = Math.hypot(car.pos.x - p.x, car.pos.z - p.z);
      if (ctx.stars === 0 && d > 70) {
        this.despawnCar(car);
        continue;
      }
      if (car.parked || !car.edge || !this.graph) {
        car.speed = 0;
        if (ctx.stars > 0 && car.parked && d > 60) {
          car.parked = false; // player got away → follow again
          car.stuck = 0;
          car.best = d;
        }
        continue;
      }
      if (d < car.best - 0.5) {
        car.best = d;
        car.stuck = 0;
      } else car.stuck += dt;
      // Close enough — or it stopped getting closer (player off-road / routing loop):
      // pull over and let the cops run the rest
      if (ctx.stars > 0 && (d < 16 || (car.stuck > 10 && d < 70 && offRoad))) {
        car.parked = true;
        for (let k = 0; k < 2; k++) {
          const side = new THREE.Vector3(
            Math.cos(car.yaw) * (k ? -1.6 : 1.6),
            0,
            -Math.sin(car.yaw) * (k ? -1.6 : 1.6),
          );
          this.spawnCop(car.pos.clone().add(side));
        }
        events.push({ type: 'bark', cop: null, situation: 'chase' });
        continue;
      }
      car.speed = Math.min(15, car.speed + 4 * dt);
      car.t += car.speed * dt;
      while (car.edge && car.t >= car.edge.length) {
        car.t -= car.edge.length;
        const node = this.graph.other(car.edge, car.from);
        car.edge = this.towardPlayer(node, car.edge, p);
        car.from = node;
      }
      const e = car.edge!;
      const a = this.graph.nodes[car.from]!;
      const b = this.graph.nodes[this.graph.other(e, car.from)]!;
      const dx = (b.x - a.x) / (e.length || 1);
      const dz = (b.z - a.z) / (e.length || 1);
      const k = 1 - Math.exp(-8 * dt);
      car.pos.x += (a.x + dx * car.t + dz * 1.6 - car.pos.x) * k;
      car.pos.z += (a.z + dz * car.t - dx * 1.6 - car.pos.z) * k;
      const yaw = Math.atan2(dx, dz);
      car.yaw +=
        Math.atan2(Math.sin(yaw - car.yaw), Math.cos(yaw - car.yaw)) * (1 - Math.exp(-6 * dt));
    }

    // Foot cops
    let arresting = false;
    for (const c of this.cops) {
      if (!c.active) continue;
      const npc = c.npc;
      npc.tick(dt);
      const h = npc.humanoid;
      const root = h.root;
      const to = new THREE.Vector3(p.x - npc.position.x, 0, p.z - npc.position.z);
      const dist = to.length();
      let speed = 0;
      if (ctx.stars === 0 && c.state !== 'down') c.state = 'leave';
      if (c.state === 'down') {
        c.timer -= dt;
        c.fall = Math.min(1, c.fall + dt * 4);
        if (c.timer <= 0 || dist > 120) this.despawnCop(c);
      } else if (c.state === 'leave') {
        h.aiming = false;
        to.negate();
        speed = 1.6;
        if (dist > 60) this.despawnCop(c);
      } else {
        // Shoot from range at 2+ stars, otherwise run in to arrest
        const shooter = ctx.stars >= 3 && dist < 22 && dist > 3;
        c.state = shooter ? 'shoot' : 'chase';
        // Stuck behind a building for a while → give up; a fresh cop spawns elsewhere
        if (!shooter && dist > 8) {
          if (dist < c.best - 0.5) {
            c.best = dist;
            c.stuck = 0;
          } else c.stuck += dt;
          if (c.stuck > 8) {
            this.despawnCop(c);
            continue;
          }
        } else c.stuck = 0;
        h.aiming = shooter;
        if (!shooter) speed = dist > 1.3 ? c.speed * (dist < 4 ? 0.6 : 1) : 0;
        else speed = dist > 12 ? c.speed * 0.5 : 0;
        if (shooter && !ctx.frozen) {
          c.shootCd -= dt;
          if (c.shootCd <= 0) {
            c.shootCd = 0.9 + this.rand() * 0.9;
            const hit = this.rand() < copHitChance(dist, ctx.inVehicle, ctx.playerSpeed);
            events.push({ type: 'shot', cop: c, hit, from: npc.position.clone().setY(1.4) });
          }
        }
        if (
          dist < 1.8 &&
          !ctx.frozen &&
          (ctx.inVehicle ? ctx.playerSpeed < 1.5 : ctx.playerSpeed < 2.2)
        )
          arresting = true;
        if (dist > 140) this.despawnCop(c);
      }
      if (speed > 0 && dist > 0.01) {
        const dir = c.state === 'leave' ? to : this.chaseDir(c, p, dist);
        dir.setY(0).normalize();
        const base = Math.atan2(dir.x, dir.z);
        // Steer around obstacles: try straight, then fan out on the preferred side first
        for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4]) {
          const a = base + off * c.side;
          const nx = npc.position.x + Math.sin(a) * speed * dt;
          const nz = npc.position.z + Math.cos(a) * speed * dt;
          if (!ctx.blocked(nx, nz)) {
            npc.position.x = nx;
            npc.position.z = nz;
            if (Math.abs(off) >= 1.6) c.side = -c.side; // came round a corner: reset preference
            break;
          }
        }
      }
      if (c.state !== 'down' && dist > 0.01) {
        const face =
          c.state === 'leave'
            ? Math.atan2(to.x, to.z)
            : Math.atan2(p.x - npc.position.x, p.z - npc.position.z);
        root.rotation.y +=
          Math.atan2(Math.sin(face - root.rotation.y), Math.cos(face - root.rotation.y)) *
          (1 - Math.exp(-10 * dt));
      }
      root.position.copy(npc.position);
      root.rotation.x = -c.fall * (Math.PI / 2 - 0.08);
      root.position.y = c.fall * 0.12;
      h.update(dt, {
        speed,
        distance: speed * dt,
        grounded: true,
        vy: 0,
        turnRate: 0,
        accel: 0,
        riding: false,
      });
    }
    this.arrest = arresting ? Math.min(1, this.arrest + dt / 1.6) : Math.max(0, this.arrest - dt);
    if (this.arrest >= 1) {
      this.arrest = 0;
      events.push({ type: 'arrest' });
    }

    this.barkTimer -= dt;
    if (this.barkTimer <= 0 && ctx.stars > 0) {
      this.barkTimer = 7 + this.rand() * 6;
      const near = this.cops.find(
        (c) => c.active && c.state !== 'down' && c.npc.position.distanceTo(p) < 25,
      );
      if (near) events.push({ type: 'bark', cop: near, situation: 'chase' });
    }
    this.syncCars();
    return events;
  }

  /** Direct line when close; otherwise follow road-graph nodes toward the player. */
  private chaseDir(c: Cop, p: THREE.Vector3, dist: number): THREE.Vector3 {
    const pos = c.npc.position;
    if (dist < 18 || !this.graph) {
      c.wp = null;
      return new THREE.Vector3(p.x - pos.x, 0, p.z - pos.z);
    }
    const g = this.graph;
    if (!c.wp || Math.hypot(c.wp.x - pos.x, c.wp.z - pos.z) < 1.5) {
      if (!c.wp || c.wpNode < 0) {
        c.wpNode = g.nearestNode(pos.x, pos.z);
      } else {
        // Arrived: next node is the neighbour closest to the player
        const n = g.nodes[c.wpNode]!;
        let best = c.wpNode;
        let bestD = Math.hypot(n.x - p.x, n.z - p.z);
        for (const id of n.edges) {
          const o = g.other(g.edges[id]!, n.id);
          const on = g.nodes[o]!;
          const d = Math.hypot(on.x - p.x, on.z - p.z);
          if (d < bestD) {
            bestD = d;
            best = o;
          }
        }
        if (best === c.wpNode) {
          c.wp = null;
          c.wpNode = -1;
          return new THREE.Vector3(p.x - pos.x, 0, p.z - pos.z);
        }
        c.wpNode = best;
      }
      const n = g.nodes[c.wpNode]!;
      c.wp = new THREE.Vector3(n.x, 0, n.z);
    }
    return new THREE.Vector3(c.wp.x - pos.x, 0, c.wp.z - pos.z);
  }

  /** At a junction pick the edge whose far end is closest to the player. */
  private towardPlayer(node: number, from: GraphEdge, p: THREE.Vector3): GraphEdge {
    const g = this.graph!;
    const n = g.nodes[node]!;
    let best: GraphEdge | null = null;
    let bestD = Infinity;
    for (const id of n.edges) {
      const e = g.edges[id]!;
      if (e.id === from.id && n.edges.length > 1) continue;
      const o = g.nodes[g.other(e, node)]!;
      const d = Math.hypot(o.x - p.x, o.z - p.z) + this.rand() * 15;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best ?? from;
  }

  private syncCars() {
    let n = 0;
    let l = 0;
    const blink = Math.floor(this.flash * 6) % 2 === 0;
    for (const c of this.cars) {
      if (!c.active) continue;
      this.q.setFromAxisAngle(this.up, c.yaw);
      this.m.compose(c.pos, this.q, this.one);
      this.carMesh.setMatrixAt(n++, this.m);
      this.lightMesh.setMatrixAt(l, this.m);
      this.lightMesh.setColorAt(l++, blink ? this.red : this.blue);
    }
    this.carMesh.count = n;
    this.lightMesh.count = l;
    this.carMesh.instanceMatrix.needsUpdate = true;
    this.lightMesh.instanceMatrix.needsUpdate = true;
    if (this.lightMesh.instanceColor) this.lightMesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    for (const c of this.cops) c.npc.humanoid.dispose();
    this.carMesh.geometry.dispose();
    this.lightMesh.geometry.dispose();
    for (const m of this.materials) m.dispose();
  }
}
