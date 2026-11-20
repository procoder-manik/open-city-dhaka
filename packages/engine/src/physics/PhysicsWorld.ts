import RAPIER from '@dimforge/rapier3d-compat';
import type { VehicleDef } from '@game/shared';
import {
  FLOATS_PER_BODY,
  FLOATS_PER_WHEEL,
  type BodyDesc,
  type PhysicsFrame,
  type StepInput,
  type VehicleBodyDesc,
} from './protocol';

let rapierReady: Promise<void> | null = null;
function initRapier(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

const JUMP_SPEED = 6.2;
const AIR_CONTROL = 0.08;

interface Entry {
  id: number;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  capsuleBottom: number;
}

interface VehicleEntry {
  id: number;
  def: VehicleDef;
  controller: RAPIER.DynamicRayCastVehicleController;
  driveWheels: number[];
  steerWheels: number[];
  rearWheels: number[];
}

const yawQuat = (yaw: number) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });

/**
 * The Rapier world. Runs inside the physics Web Worker, or on the main thread as a
 * fallback (same code either way).
 */
export class PhysicsWorld {
  private world!: RAPIER.World;
  private entries: Entry[] = [];
  private byId = new Map<number, Entry>();
  private grounded = new Map<number, boolean>();
  private vehicles: VehicleEntry[] = [];

  async init(bodies: BodyDesc[], gravity: number, vehicles: VehicleBodyDesc[] = []): Promise<void> {
    await initRapier();
    this.world = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
    for (const b of bodies) this.addBody(b);
    for (const v of vehicles) this.addVehicle(v);
  }

  private register(
    id: number,
    body: RAPIER.RigidBody,
    collider: RAPIER.Collider,
    capsuleBottom = 0,
  ) {
    const entry: Entry = { id, body, collider, capsuleBottom };
    this.entries.push(entry);
    this.byId.set(id, entry);
  }

  private addBody(b: BodyDesc) {
    const dynamic = b.type === 'dynamic';
    const rbDesc = (dynamic ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed())
      .setTranslation(...b.position)
      .setRotation(yawQuat(b.yaw ?? 0));
    if (b.lockRotations) rbDesc.lockRotations();
    if (dynamic) rbDesc.setCcdEnabled(b.shape.kind === 'capsule');
    const body = this.world.createRigidBody(rbDesc);

    let cDesc: RAPIER.ColliderDesc;
    let capsuleBottom = 0;
    switch (b.shape.kind) {
      case 'box':
        cDesc = RAPIER.ColliderDesc.cuboid(...b.shape.halfExtents);
        break;
      case 'sphere':
        cDesc = RAPIER.ColliderDesc.ball(b.shape.radius);
        break;
      case 'capsule':
        cDesc = RAPIER.ColliderDesc.capsule(b.shape.halfHeight, b.shape.radius);
        capsuleBottom = b.shape.halfHeight + b.shape.radius;
        break;
    }
    cDesc.setFriction(b.friction ?? 0.7).setRestitution(b.restitution ?? 0);
    if (b.mass !== undefined) cDesc.setMass(b.mass);
    this.register(b.id, body, this.world.createCollider(cDesc, body), capsuleBottom);
  }

  private addVehicle(v: VehicleBodyDesc) {
    const { def } = v;
    const [hx, hy, hz] = def.chassisHalfExtents;
    const rbDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(...v.position)
      .setRotation(yawQuat(v.yaw))
      .setLinearDamping(0.05)
      .setAngularDamping(0.6)
      .setCcdEnabled(true);
    if (def.lockRoll) rbDesc.enabledRotations(false, true, false);
    const body = this.world.createRigidBody(rbDesc);

    // Box inertia, centre of mass lowered for stability.
    const m = def.mass;
    const w = hx * 2;
    const h = hy * 2;
    const d = hz * 2;
    const inertia = {
      x: (m / 12) * (h * h + d * d),
      y: (m / 12) * (w * w + d * d),
      z: (m / 12) * (w * w + h * h),
    };
    const cDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setFriction(0.3)
      .setRestitution(0.05)
      .setMassProperties(m, { x: 0, y: def.centerOfMassY, z: 0 }, inertia, {
        x: 0,
        y: 0,
        z: 0,
        w: 1,
      });
    const collider = this.world.createCollider(cDesc, body);
    this.register(v.id, body, collider);

    const controller = this.world.createVehicleController(body);
    controller.indexUpAxis = 1;
    controller.setIndexForwardAxis = 2;
    def.wheels.forEach((wheel, i) => {
      const [x, y, z] = wheel.position;
      controller.addWheel(
        { x, y, z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        def.suspension.restLength,
        wheel.radius,
      );
      controller.setWheelSuspensionStiffness(i, def.suspension.stiffness);
      controller.setWheelSuspensionCompression(i, def.suspension.compression);
      controller.setWheelSuspensionRelaxation(i, def.suspension.relaxation);
      controller.setWheelMaxSuspensionTravel(i, def.suspension.maxTravel);
      controller.setWheelFrictionSlip(i, def.frictionSlip);
      controller.setWheelSideFrictionStiffness(i, def.sideFriction);
    });

    this.vehicles.push({
      id: v.id,
      def,
      controller,
      driveWheels: def.wheels.flatMap((w, i) => (w.drive ? [i] : [])),
      steerWheels: def.wheels.flatMap((w, i) => (w.steer ? [i] : [])),
      rearWheels: def.wheels.flatMap((w, i) => (w.position[2] < 0 ? [i] : [])),
    });
  }

  private isGrounded(e: Entry): boolean {
    const p = e.body.translation();
    const ray = new RAPIER.Ray(
      { x: p.x, y: p.y - e.capsuleBottom + 0.05, z: p.z },
      { x: 0, y: -1, z: 0 },
    );
    const hit = this.world.castRay(ray, 0.18, true, undefined, undefined, e.collider);
    return hit !== null;
  }

  step(input: StepInput): PhysicsFrame {
    this.world.timestep = input.dt;

    // One-off commands (enable/disable, teleport) before simulating.
    for (const c of input.characters) {
      const e = this.byId.get(c.bodyId);
      if (!e) continue;
      if (c.teleport) {
        e.body.setTranslation({ x: c.teleport[0], y: c.teleport[1], z: c.teleport[2] }, true);
        e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      if (e.body.isEnabled() !== c.enabled) e.body.setEnabled(c.enabled);
    }

    const vehicleInputs = new Map(input.vehicles.map((v) => [v.bodyId, v]));

    for (let i = 0; i < input.steps; i++) {
      for (const c of input.characters) {
        const e = this.byId.get(c.bodyId);
        if (!e || !c.enabled) continue;
        const grounded = this.isGrounded(e);
        this.grounded.set(e.id, grounded);
        const v = e.body.linvel();
        const blend = grounded ? 1 : AIR_CONTROL;
        const vx = v.x + (c.vx - v.x) * blend;
        const vz = v.z + (c.vz - v.z) * blend;
        const vy = grounded && c.jump && i === 0 ? JUMP_SPEED : v.y;
        e.body.setLinvel({ x: vx, y: vy, z: vz }, true);
      }

      for (const veh of this.vehicles) {
        const ctrl = veh.controller;
        const cmd = vehicleInputs.get(veh.id);
        const engine = cmd?.engine ?? 0;
        const brake = cmd?.brake ?? veh.def.brakeForce * 0.4; // parked: hold still
        const perDrive = veh.driveWheels.length ? engine / veh.driveWheels.length : 0;
        veh.def.wheels.forEach((_, w) => {
          ctrl.setWheelEngineForce(w, veh.driveWheels.includes(w) ? perDrive : 0);
          const rear = veh.rearWheels.includes(w);
          const hb = cmd?.handbrake && rear;
          ctrl.setWheelBrake(w, hb ? veh.def.brakeForce * 1.5 : brake);
          ctrl.setWheelSideFrictionStiffness(
            w,
            hb ? veh.def.sideFriction * 0.35 : veh.def.sideFriction,
          );
        });
        for (const w of veh.steerWheels) ctrl.setWheelSteering(w, cmd?.steer ?? 0);
        ctrl.updateVehicle(input.dt);
      }

      this.world.step();
    }
    return { transforms: this.snapshot(), vehicles: this.vehicleSnapshot() };
  }

  private snapshot(): Float32Array {
    const out = new Float32Array(this.entries.length * FLOATS_PER_BODY);
    let o = 0;
    for (const e of this.entries) {
      const t = e.body.translation();
      const r = e.body.rotation();
      const v = e.body.linvel();
      out[o++] = e.id;
      out[o++] = t.x;
      out[o++] = t.y;
      out[o++] = t.z;
      out[o++] = r.x;
      out[o++] = r.y;
      out[o++] = r.z;
      out[o++] = r.w;
      out[o++] = this.grounded.get(e.id) ? 1 : 0;
      out[o++] = v.x;
      out[o++] = v.y;
      out[o++] = v.z;
    }
    return out;
  }

  private vehicleSnapshot(): Float32Array {
    const size = this.vehicles.reduce((n, v) => n + 3 + v.def.wheels.length * FLOATS_PER_WHEEL, 0);
    const out = new Float32Array(size);
    let o = 0;
    for (const v of this.vehicles) {
      const c = v.controller;
      out[o++] = v.id;
      out[o++] = c.currentVehicleSpeed();
      out[o++] = v.def.wheels.length;
      for (let w = 0; w < v.def.wheels.length; w++) {
        out[o++] = c.wheelSuspensionLength(w) ?? v.def.suspension.restLength;
        out[o++] = c.wheelRotation(w) ?? 0;
        out[o++] = c.wheelSteering(w) ?? 0;
        out[o++] = c.wheelIsInContact(w) ? 1 : 0;
      }
    }
    return out;
  }

  dispose() {
    for (const v of this.vehicles) this.world?.removeVehicleController(v.controller);
    this.world?.free();
    this.entries = [];
    this.vehicles = [];
    this.byId.clear();
  }
}
