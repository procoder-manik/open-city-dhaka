import * as THREE from 'three/webgpu';
import { getVehicleDef } from '@game/content';
import type { QualityPreset, VehicleDef } from '@game/shared';
import { Humanoid } from '../actors/Humanoid';
import { CameraRig } from '../camera/CameraRig';
import type { InputManager } from '../input/InputManager';
import {
  FLOATS_PER_BODY,
  FLOATS_PER_WHEEL,
  type BodyDesc,
  type CharacterInput,
  type PhysicsFrame,
  type VehicleBodyDesc,
  type VehicleInput,
} from '../physics/protocol';
import { computeVehicleControls, parkedControls } from '../vehicles/controls';
import { VehicleVisual, type WheelState } from '../vehicles/VehicleVisual';
import { Environment } from '../world/Environment';
import { buildStreetBlock, type StreetResult } from '../world/StreetBlock';

const PLAYER_ID = 1;
const BALL_ID = 50;
const VEHICLE_ID_BASE = 10;
const STATIC_ID_BASE = 1000;

const CAPSULE_HALF = 0.5;
const CAPSULE_RADIUS = 0.32;
const CAPSULE_CENTER = CAPSULE_HALF + CAPSULE_RADIUS; // feet → capsule centre
const WALK_SPEED = 3.6;
const SPRINT_SPEED = 7.5;
const GROUND_ACCEL = 14;
const ENTER_RANGE = 3.6;
const MAX_EXIT_SPEED = 14;

const damp = (current: number, target: number, rate: number, dt: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-rate * dt));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface HudState {
  mode: 'foot' | 'vehicle';
  prompt: string | null;
  vehicleName: string | null;
  speedKmh: number;
  hour: number;
}

/** Physics position/velocity with extrapolation + smoothing for jitter-free rendering. */
class SmoothedBody {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly quat = new THREE.Quaternion();
  readonly renderPos = new THREE.Vector3();
  readonly renderQuat = new THREE.Quaternion();
  grounded = false;
  private age = 0;
  private initialized = false;

  set(t: Float32Array, o: number) {
    this.pos.set(t[o + 1]!, t[o + 2]!, t[o + 3]!);
    this.quat.set(t[o + 4]!, t[o + 5]!, t[o + 6]!, t[o + 7]!);
    this.grounded = t[o + 8]! > 0.5;
    this.vel.set(t[o + 9]!, t[o + 10]!, t[o + 11]!);
    this.age = 0;
    if (!this.initialized) {
      this.renderPos.copy(this.pos);
      this.renderQuat.copy(this.quat);
      this.initialized = true;
    }
  }

  snap(p: THREE.Vector3) {
    this.pos.copy(p);
    this.renderPos.copy(p);
    this.vel.set(0, 0, 0);
  }

  update(dt: number) {
    this.age = Math.min(this.age + dt, 0.1);
    const tx = this.pos.x + this.vel.x * this.age;
    const ty = this.pos.y + this.vel.y * this.age;
    const tz = this.pos.z + this.vel.z * this.age;
    const k = 1 - Math.exp(-30 * dt);
    this.renderPos.x += (tx - this.renderPos.x) * k;
    this.renderPos.y += (ty - this.renderPos.y) * k;
    this.renderPos.z += (tz - this.renderPos.z) * k;
    this.renderQuat.slerp(this.quat, k);
  }
}

interface VehicleEntity {
  id: number;
  def: VehicleDef;
  visual: VehicleVisual;
  body: SmoothedBody;
  speed: number;
  wheels: WheelState[];
  steer: number;
}

/**
 * Phase 1 vertical slice: Tajmahal Road block, Mostofa on foot, three drivable
 * vehicles (car, CNG, motorbike), day–night and a collision-aware camera.
 */
export class SliceScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly bodies: BodyDesc[] = [];
  readonly vehicleBodies: VehicleBodyDesc[] = [];
  readonly env: Environment;
  private street: StreetResult;
  private rig: CameraRig;
  private hero = new Humanoid();
  private player = new SmoothedBody();
  private ball = new SmoothedBody();
  private ballMesh: THREE.Mesh;
  private vehicles: VehicleEntity[] = [];
  private driving: VehicleEntity | null = null;
  private moveVel = new THREE.Vector2();
  private facing = 0;
  private prevFacing = 0;
  private prevSpeed = 0;
  private accel = 0;
  private wasGrounded = true;
  private lastVy = 0;
  private pendingTeleport: [number, number, number] | null = null;
  private nearest: VehicleEntity | null = null;
  private hud: HudState = { mode: 'foot', prompt: null, vehicleName: null, speedKmh: 0, hour: 17 };
  private hudTimer = 0;

  constructor(
    private readonly preset: QualityPreset,
    private readonly onHud: (s: HudState) => void,
  ) {
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 900);
    this.env = new Environment(this.scene, preset, 17.2);

    this.street = buildStreetBlock(preset);
    this.scene.add(this.street.group);
    this.street.bodies.forEach((b, i) => this.bodies.push({ ...b, id: STATIC_ID_BASE + i }));

    // Player
    const spawn = this.street.points.spawn!;
    this.bodies.push({
      id: PLAYER_ID,
      shape: { kind: 'capsule', halfHeight: CAPSULE_HALF, radius: CAPSULE_RADIUS },
      position: spawn,
      type: 'dynamic',
      mass: 70,
      friction: 0,
      lockRotations: true,
    });
    this.player.snap(new THREE.Vector3(...spawn));
    this.facing = Math.PI; // face the road
    this.hero.root.rotation.y = this.facing;
    this.scene.add(this.hero.root);

    // A football to kick around
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 }),
    );
    this.ballMesh.castShadow = true;
    this.scene.add(this.ballMesh);
    const ballPos: [number, number, number] = [spawn[0] - 0.6, 0.6, spawn[2] - 3];
    this.bodies.push({
      id: BALL_ID,
      shape: { kind: 'sphere', radius: 0.11 },
      position: ballPos,
      type: 'dynamic',
      mass: 0.45,
      restitution: 0.6,
    });
    this.ball.snap(new THREE.Vector3(...ballPos));

    // Vehicles (parked on the left-hand carriageway, facing +Z)
    const parked: Array<[string, string]> = [
      ['car-sedan', 'car'],
      ['cng-auto', 'cng'],
      ['bike-150', 'bike'],
    ];
    parked.forEach(([defId, point], i) => {
      const def = getVehicleDef(defId);
      const pos = this.street.points[point]!;
      const id = VEHICLE_ID_BASE + i;
      this.vehicleBodies.push({ id, def, position: pos, yaw: 0 });
      const visual = new VehicleVisual(def);
      visual.root.position.set(...pos);
      this.scene.add(visual.root);
      const body = new SmoothedBody();
      body.snap(new THREE.Vector3(...pos));
      this.vehicles.push({
        id,
        def,
        visual,
        body,
        speed: 0,
        steer: 0,
        wheels: def.wheels.map(() => ({
          suspension: def.suspension.restLength,
          rotation: 0,
          steering: 0,
        })),
      });
    });

    this.rig = new CameraRig(this.camera, this.street.colliders);
    this.rig.yaw = this.facing + Math.PI + 0.5;
  }

  get exposure(): number {
    return this.env.exposure;
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Before physics: interactions + desired character velocity + vehicle controls. */
  preStep(
    dt: number,
    input: InputManager,
  ): { characters: CharacterInput[]; vehicles: VehicleInput[] } {
    if (input.pressed('interact')) this.toggleVehicle();

    const vehicles: VehicleInput[] = this.vehicles.map((v) => {
      const c =
        v === this.driving
          ? computeVehicleControls(
              v.def,
              { throttle: input.move.y, steer: input.move.x, handbrake: input.isDown('jump') },
              v.speed,
              v.steer,
              dt,
            )
          : parkedControls(v.def);
      v.steer = c.steer;
      return { bodyId: v.id, ...c };
    });

    let vx = 0;
    let vz = 0;
    if (!this.driving) {
      const sprint = input.isDown('sprint');
      const mag = Math.hypot(input.move.x, input.move.y);
      const speed = (sprint ? SPRINT_SPEED : WALK_SPEED) * Math.min(1, mag);
      const [fx, fz] = this.rig.forward;
      // right = (-fz, fx) on the ground plane
      const dx = mag > 0 ? (-fz * input.move.x + fx * input.move.y) / mag : 0;
      const dz = mag > 0 ? (fx * input.move.x + fz * input.move.y) / mag : 0;
      const k = 1 - Math.exp(-GROUND_ACCEL * dt);
      this.moveVel.x += (dx * speed - this.moveVel.x) * k;
      this.moveVel.y += (dz * speed - this.moveVel.y) * k;
      vx = this.moveVel.x;
      vz = this.moveVel.y;
    }

    const character: CharacterInput = {
      bodyId: PLAYER_ID,
      vx,
      vz,
      jump: !this.driving && input.pressed('jump'),
      enabled: !this.driving,
      ...(this.pendingTeleport ? { teleport: this.pendingTeleport } : {}),
    };
    this.pendingTeleport = null;
    return { characters: [character], vehicles };
  }

  private toggleVehicle() {
    if (this.driving) {
      const v = this.driving;
      if (Math.abs(v.speed) > MAX_EXIT_SPEED) return;
      // Step out on the vehicle's left (footpath side when keeping left).
      const left = new THREE.Vector3(1, 0, 0).applyQuaternion(v.body.renderQuat);
      left.y = 0;
      left.normalize();
      const out = v.body.renderPos
        .clone()
        .addScaledVector(left, v.def.chassisHalfExtents[0] + 0.75);
      out.y = Math.max(out.y, 0.2) + CAPSULE_CENTER - 0.3;
      this.pendingTeleport = [out.x, out.y, out.z];
      this.player.snap(out);
      this.moveVel.set(0, 0);
      this.driving = null;
      this.scene.add(this.hero.root);
      this.hero.root.position.set(out.x, out.y - CAPSULE_CENTER, out.z);
      this.hero.root.rotation.set(0, this.facing, 0);
      this.hero.setVisible(true);
    } else if (this.nearest) {
      const v = this.nearest;
      this.driving = v;
      if (v.def.kind === 'bike') {
        v.visual.seat.add(this.hero.root);
        this.hero.root.position.set(0, 0, 0);
        this.hero.root.rotation.set(0, 0, 0);
      } else {
        this.hero.setVisible(false);
      }
      this.rig.addShake(0.15);
    }
  }

  applyFrame(frame: PhysicsFrame) {
    const t = frame.transforms;
    for (let o = 0; o < t.length; o += FLOATS_PER_BODY) {
      const id = t[o]!;
      if (id === PLAYER_ID) {
        if (!this.driving) this.player.set(t, o);
      } else if (id === BALL_ID) {
        this.ball.set(t, o);
      } else if (id >= VEHICLE_ID_BASE && id < VEHICLE_ID_BASE + this.vehicles.length) {
        this.vehicles[id - VEHICLE_ID_BASE]!.body.set(t, o);
      }
    }
    const vs = frame.vehicles;
    let o = 0;
    while (o < vs.length) {
      const id = vs[o]!;
      const n = vs[o + 2]!;
      const v = this.vehicles[id - VEHICLE_ID_BASE];
      if (v) {
        v.speed = vs[o + 1]!;
        for (let w = 0; w < n; w++) {
          const b = o + 3 + w * FLOATS_PER_WHEEL;
          const ws = v.wheels[w];
          if (ws) {
            ws.suspension = vs[b]!;
            ws.rotation = vs[b + 1]!;
            ws.steering = vs[b + 2]!;
          }
        }
      }
      o += 3 + n * FLOATS_PER_WHEEL;
    }
  }

  /** After physics: animation, camera, lighting, HUD. */
  update(dt: number, input: InputManager) {
    for (const v of this.vehicles) {
      v.body.update(dt);
      v.visual.root.position.copy(v.body.renderPos);
      v.visual.root.quaternion.copy(v.body.renderQuat);
      v.visual.update(dt, v.speed, v.wheels);
    }
    this.ball.update(dt);
    this.ballMesh.position.copy(this.ball.renderPos);
    this.ballMesh.quaternion.copy(this.ball.renderQuat);

    const pivot = new THREE.Vector3();
    if (this.driving) {
      const v = this.driving;
      this.hero.update(dt, {
        speed: 0,
        distance: 0,
        grounded: true,
        vy: 0,
        turnRate: 0,
        accel: 0,
        riding: true,
      });
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(v.body.renderQuat);
      const heading = Math.atan2(fwd.x, fwd.z);
      const speed = Math.abs(v.speed);
      pivot.copy(v.body.renderPos).y += v.def.camera.height;
      // Hard impact → shake
      if (this.prevSpeed - speed > 6) this.rig.addShake(Math.min(1, (this.prevSpeed - speed) / 12));
      this.prevSpeed = speed;
      if (speed > 25) this.rig.addShake(dt * 0.15);
      this.rig.update(dt, {
        pivot,
        distance: v.def.camera.distance + Math.min(speed * 0.04, 2),
        shoulder: 0,
        fov: 62 + Math.min(speed * 0.35, 16),
        autoAlignYaw: speed > 2 ? heading : null,
        lookInput: input.look,
      });
      this.nearest = null;
    } else {
      this.player.update(dt);
      const p = this.player.renderPos;
      this.hero.root.position.set(p.x, p.y - CAPSULE_CENTER, p.z);
      const hSpeed = Math.hypot(this.player.vel.x, this.player.vel.z);
      // Face movement direction (from intended velocity: responsive, no physics jitter)
      if (this.moveVel.lengthSq() > 0.04) {
        const target = Math.atan2(this.moveVel.x, this.moveVel.y);
        this.facing += wrapAngle(target - this.facing) * (1 - Math.exp(-12 * dt));
      }
      this.hero.root.rotation.y = this.facing;
      const turnRate = wrapAngle(this.facing - this.prevFacing) / Math.max(dt, 1e-3);
      this.prevFacing = this.facing;
      this.accel = damp(this.accel, (hSpeed - this.prevSpeed) / Math.max(dt, 1e-3), 8, dt);
      this.prevSpeed = hSpeed;

      const grounded = this.player.grounded;
      if (grounded && !this.wasGrounded && this.lastVy < -5)
        this.rig.addShake(Math.min(0.6, -this.lastVy / 25));
      this.wasGrounded = grounded;
      this.lastVy = this.player.vel.y;

      this.hero.update(dt, {
        speed: hSpeed,
        distance: hSpeed * dt,
        grounded,
        vy: this.player.vel.y,
        turnRate,
        accel: this.accel,
        riding: false,
      });

      const sprinting = hSpeed > WALK_SPEED + 0.8;
      pivot.set(p.x, p.y - CAPSULE_CENTER + 1.55, p.z);
      this.rig.update(dt, {
        pivot,
        distance: sprinting ? 4.1 : 3.6,
        shoulder: 0.45,
        fov: sprinting ? 68 : 60,
        autoAlignYaw: null,
        lookInput: input.look,
      });

      // Nearest enterable vehicle
      let best: VehicleEntity | null = null;
      let bestD = ENTER_RANGE;
      for (const v of this.vehicles) {
        const d = Math.hypot(v.body.renderPos.x - p.x, v.body.renderPos.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = v;
        }
      }
      this.nearest = best;
    }

    const focus = this.driving ? this.driving.body.renderPos : this.player.renderPos;
    this.env.update(dt, focus, this.camera);
    for (const nm of this.street.nightMaterials)
      nm.material.emissiveIntensity = nm.max * this.env.night;
    for (const g of this.street.nightGlows) g.material.opacity = g.max * this.env.night;

    this.publishHud(dt);
  }

  private publishHud(dt: number) {
    const prompt = this.driving
      ? Math.abs(this.driving.speed) <= MAX_EXIT_SPEED
        ? `নামো: ${this.driving.def.nameBn}`
        : null
      : this.nearest
        ? `ওঠো: ${this.nearest.def.nameBn}`
        : null;
    const mode = this.driving ? 'vehicle' : 'foot';
    this.hudTimer -= dt;
    const changed = prompt !== this.hud.prompt || mode !== this.hud.mode;
    if (changed || this.hudTimer <= 0) {
      this.hud = {
        mode,
        prompt,
        vehicleName: this.driving?.def.nameBn ?? null,
        speedKmh: this.driving ? Math.round(Math.abs(this.driving.speed) * 3.6) : 0,
        hour: this.env.hour,
      };
      this.hudTimer = 0.1;
      this.onHud(this.hud);
    }
  }

  debugInfo() {
    const r = (v: THREE.Vector3) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
    return {
      mode: this.hud.mode,
      player: r(this.player.renderPos),
      camera: r(this.camera.position),
      grounded: this.player.grounded,
      vehicle: this.driving
        ? {
            id: this.driving.def.id,
            pos: r(this.driving.body.renderPos),
            speedKmh: +(this.driving.speed * 3.6).toFixed(1),
          }
        : null,
      nearest: this.nearest?.def.id ?? null,
      vehicles: this.vehicles.map((v) => ({
        id: v.def.id,
        pos: r(v.body.renderPos),
        speed: +v.speed.toFixed(2),
      })),
      hour: +this.env.hour.toFixed(2),
    };
  }

  /** Testing/debug: get into a vehicle by definition id, wherever it is. */
  debugEnterVehicle(defId: string): boolean {
    if (this.driving) this.toggleVehicle();
    const v = this.vehicles.find((x) => x.def.id === defId);
    if (!v) return false;
    this.nearest = v;
    this.toggleVehicle();
    return true;
  }

  /** Testing/debug: jump the clock. */
  setHour(h: number) {
    this.env.hour = ((h % 24) + 24) % 24;
  }

  dispose() {
    this.street.dispose();
    this.env.dispose();
    this.hero.dispose();
    for (const v of this.vehicles) v.visual.dispose();
    this.ballMesh.geometry.dispose();
    (this.ballMesh.material as THREE.Material).dispose();
  }
}
