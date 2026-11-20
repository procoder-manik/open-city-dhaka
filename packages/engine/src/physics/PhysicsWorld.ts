import RAPIER from '@dimforge/rapier3d-compat';
import { FLOATS_PER_BODY, type BodyDesc, type StepInput } from './protocol';

let rapierReady: Promise<void> | null = null;
function initRapier(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

interface Entry {
  id: number;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  dynamic: boolean;
  capsuleBottom: number;
}

/**
 * The Rapier world. Runs inside the physics Web Worker, or on the main thread as a
 * fallback (same code either way).
 */
export class PhysicsWorld {
  private world!: RAPIER.World;
  private entries: Entry[] = [];
  private byId = new Map<number, Entry>();
  private grounded = new Map<number, boolean>();

  async init(bodies: BodyDesc[], gravity: number): Promise<void> {
    await initRapier();
    this.world = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
    for (const b of bodies) this.addBody(b);
  }

  private addBody(b: BodyDesc) {
    const dynamic = b.type === 'dynamic';
    const rbDesc = (
      dynamic ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed()
    ).setTranslation(...b.position);
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
    const collider = this.world.createCollider(cDesc, body);

    const entry: Entry = { id: b.id, body, collider, dynamic, capsuleBottom };
    this.entries.push(entry);
    this.byId.set(b.id, entry);
  }

  private isGrounded(e: Entry): boolean {
    const p = e.body.translation();
    const ray = new RAPIER.Ray(
      { x: p.x, y: p.y - e.capsuleBottom + 0.05, z: p.z },
      { x: 0, y: -1, z: 0 },
    );
    const hit = this.world.castRay(ray, 0.15, true, undefined, undefined, e.collider);
    return hit !== null;
  }

  step(input: StepInput): Float32Array {
    this.world.timestep = input.dt;
    for (let i = 0; i < input.steps; i++) {
      for (const c of input.characters) {
        const e = this.byId.get(c.bodyId);
        if (!e) continue;
        const grounded = this.isGrounded(e);
        this.grounded.set(e.id, grounded);
        const v = e.body.linvel();
        // Responsive on the ground, a bit of air control in the air.
        const blend = grounded ? 1 : 0.08;
        const vx = v.x + (c.vx - v.x) * blend;
        const vz = v.z + (c.vz - v.z) * blend;
        const vy = grounded && c.jump && i === 0 ? 6.5 : v.y;
        e.body.setLinvel({ x: vx, y: vy, z: vz }, true);
      }
      this.world.step();
    }
    return this.snapshot();
  }

  private snapshot(): Float32Array {
    const out = new Float32Array(this.entries.length * FLOATS_PER_BODY);
    let o = 0;
    for (const e of this.entries) {
      const t = e.body.translation();
      const r = e.body.rotation();
      out[o++] = e.id;
      out[o++] = t.x;
      out[o++] = t.y;
      out[o++] = t.z;
      out[o++] = r.x;
      out[o++] = r.y;
      out[o++] = r.z;
      out[o++] = r.w;
      out[o++] = this.grounded.get(e.id) ? 1 : 0;
    }
    return out;
  }

  dispose() {
    this.world?.free();
    this.entries = [];
    this.byId.clear();
  }
}
