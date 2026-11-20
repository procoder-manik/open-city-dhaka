import * as THREE from 'three/webgpu';
import { raycastAABBs, type AABB } from '../camera/raycast';

interface Grenade {
  mesh: THREE.Mesh;
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
}

interface Fireball {
  mesh: THREE.Mesh;
  t: number;
  alive: boolean;
}

const GRAVITY = 9.81;

/**
 * Thrown grenades (ballistic, bounce off ground & walls), explosion fireballs + flash,
 * muzzle flashes and bullet tracers. All pooled; a handful of draw calls.
 */
export class Projectiles {
  readonly group = new THREE.Group();
  private grenades: Grenade[] = [];
  private fireballs: Fireball[] = [];
  private light = new THREE.PointLight(0xffa040, 0, 30, 2);
  private lightT = 0;
  private muzzle: THREE.Mesh;
  private muzzleT = 0;
  private tracer: THREE.Line;
  private tracerT = 0;
  private materials: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  /** Called when a grenade goes off. */
  onExplode: ((at: THREE.Vector3) => void) | null = null;

  constructor() {
    const gGeo = new THREE.SphereGeometry(0.07, 10, 8);
    const gMat = new THREE.MeshStandardMaterial({
      color: 0x3b4a2a,
      roughness: 0.6,
      metalness: 0.3,
    });
    const fGeo = new THREE.SphereGeometry(1, 16, 12);
    this.geos.push(gGeo, fGeo);
    this.materials.push(gMat);
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(gGeo, gMat);
      mesh.visible = false;
      mesh.castShadow = true;
      this.group.add(mesh);
      this.grenades.push({
        mesh,
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        fuse: 0,
      });
    }
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffa040,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.materials.push(mat);
      const mesh = new THREE.Mesh(fGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.fireballs.push({ mesh, t: 0, alive: false });
    }
    this.light.visible = false;
    this.group.add(this.light);
    const mMat = new THREE.MeshBasicMaterial({
      color: 0xffe080,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mGeo = new THREE.SphereGeometry(0.09, 8, 6);
    this.geos.push(mGeo);
    this.materials.push(mMat);
    this.muzzle = new THREE.Mesh(mGeo, mMat);
    this.muzzle.visible = false;
    this.group.add(this.muzzle);
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const tMat = new THREE.LineBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.8 });
    this.geos.push(tGeo);
    this.materials.push(tMat);
    this.tracer = new THREE.Line(tGeo, tMat);
    this.tracer.visible = false;
    this.tracer.frustumCulled = false;
    this.group.add(this.tracer);
  }

  throwGrenade(from: THREE.Vector3, vel: THREE.Vector3): boolean {
    const g = this.grenades.find((x) => !x.alive);
    if (!g) return false;
    g.alive = true;
    g.pos.copy(from);
    g.vel.copy(vel);
    g.fuse = 2.2;
    g.mesh.visible = true;
    return true;
  }

  get liveGrenades(): number {
    return this.grenades.filter((g) => g.alive).length;
  }

  shot(from: THREE.Vector3, to: THREE.Vector3) {
    this.muzzle.position.copy(from);
    this.muzzle.visible = true;
    this.muzzleT = 0.05;
    const a = this.tracer.geometry.getAttribute('position') as THREE.BufferAttribute;
    a.setXYZ(0, from.x, from.y, from.z);
    a.setXYZ(1, to.x, to.y, to.z);
    a.needsUpdate = true;
    this.tracer.visible = true;
    this.tracerT = 0.06;
    this.flashLight(from, 3, 0.05);
  }

  explode(at: THREE.Vector3) {
    const f = this.fireballs.find((x) => !x.alive) ?? this.fireballs[0]!;
    f.alive = true;
    f.t = 0;
    f.mesh.position.copy(at);
    f.mesh.visible = true;
    this.flashLight(at, 60, 0.5);
    this.onExplode?.(at.clone());
  }

  private flashLight(at: THREE.Vector3, intensity: number, seconds: number) {
    this.light.position.copy(at).y += 0.8;
    this.light.intensity = intensity;
    this.light.visible = true;
    this.lightT = seconds;
  }

  update(dt: number, boxes: readonly AABB[]) {
    for (const g of this.grenades) {
      if (!g.alive) continue;
      g.fuse -= dt;
      g.vel.y -= GRAVITY * dt;
      const step = g.vel.length() * dt;
      if (step > 1e-4) {
        const d = g.vel.clone().normalize();
        const hit = raycastAABBs(g.pos.x, g.pos.y, g.pos.z, d.x, d.y, d.z, step + 0.07, boxes);
        if (hit < Infinity) {
          // Bounce off the wall: reflect horizontal velocity, lose energy
          g.vel.x *= -0.4;
          g.vel.z *= -0.4;
        }
      }
      g.pos.addScaledVector(g.vel, dt);
      if (g.pos.y < 0.07) {
        g.pos.y = 0.07;
        g.vel.y = Math.abs(g.vel.y) * 0.35;
        g.vel.x *= 0.6;
        g.vel.z *= 0.6;
        if (g.vel.y < 0.4) g.vel.y = 0;
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += dt * 8;
      if (g.fuse <= 0) {
        g.alive = false;
        g.mesh.visible = false;
        this.explode(g.pos);
      }
    }
    for (const f of this.fireballs) {
      if (!f.alive) continue;
      f.t += dt;
      const k = f.t / 0.7;
      f.mesh.scale.setScalar(0.6 + Math.sqrt(Math.min(1, k)) * 3.4);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.95 * (1 - k));
      (f.mesh.material as THREE.MeshBasicMaterial).color.setHSL(0.08 - k * 0.06, 1, 0.6 - k * 0.3);
      if (k >= 1) {
        f.alive = false;
        f.mesh.visible = false;
      }
    }
    if (this.lightT > 0) {
      this.lightT -= dt;
      this.light.intensity *= Math.exp(-8 * dt);
      if (this.lightT <= 0) this.light.visible = false;
    }
    if (this.muzzleT > 0 && (this.muzzleT -= dt) <= 0) this.muzzle.visible = false;
    if (this.tracerT > 0 && (this.tracerT -= dt) <= 0) this.tracer.visible = false;
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
