import * as THREE from 'three/webgpu';
import { raycastAABBs, type AABB } from './raycast';

const PITCH_MIN = -0.45;
const PITCH_MAX = 1.2;
const CLIP_PADDING = 0.25;
const MIN_DISTANCE = 0.6;

const damp = (current: number, target: number, rate: number, dt: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-rate * dt));

export interface CameraFollow {
  /** Point the camera orbits (e.g. character chest or vehicle roof). */
  pivot: THREE.Vector3;
  distance: number;
  /** Sideways offset for over-the-shoulder framing (m, + = right). */
  shoulder: number;
  /** Target field of view (deg). */
  fov: number;
  /** Heading to auto-align behind (vehicles), or null for free look. */
  autoAlignYaw: number | null;
  lookInput: { x: number; y: number };
}

/**
 * Third-person camera: orbit with look input, smooth follow, never clips into
 * walls (raycast against static boxes), FOV kicks and screen shake.
 */
export class CameraRig {
  yaw = 0.6;
  pitch = 0.28;
  private currentDistance: number;
  private pivot = new THREE.Vector3();
  private fov: number;
  private idleLook = 0;
  private shake = 0;
  private shakeTime = 0;
  private initialized = false;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private colliders: readonly AABB[] = [],
    startDistance = 4.2,
  ) {
    this.currentDistance = startDistance;
    this.fov = camera.fov;
  }

  setColliders(boxes: readonly AABB[]) {
    this.colliders = boxes;
  }

  /** Add trauma (0..1); decays quickly. */
  addShake(amount: number) {
    this.shake = Math.min(1, this.shake + amount);
  }

  /** Camera-relative basis on the ground plane. */
  get forward(): [number, number] {
    return [-Math.sin(this.yaw), -Math.cos(this.yaw)];
  }

  update(dt: number, f: CameraFollow) {
    // Look input
    const looking = Math.abs(f.lookInput.x) + Math.abs(f.lookInput.y) > 1e-4;
    this.yaw -= f.lookInput.x;
    this.pitch = THREE.MathUtils.clamp(this.pitch + f.lookInput.y, PITCH_MIN, PITCH_MAX);
    this.idleLook = looking ? 0 : this.idleLook + dt;

    // Vehicles: swing back behind the heading after a moment without look input.
    if (f.autoAlignYaw !== null && this.idleLook > 1.2) {
      const target = f.autoAlignYaw + Math.PI;
      let diff = target - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.yaw += diff * (1 - Math.exp(-2.5 * dt));
      this.pitch = damp(this.pitch, 0.22, 2, dt);
    }

    // Follow pivot (snappy vertically damped a bit for smooth stairs/jumps)
    if (!this.initialized) {
      this.pivot.copy(f.pivot);
      this.initialized = true;
    } else {
      this.pivot.x = damp(this.pivot.x, f.pivot.x, 18, dt);
      this.pivot.z = damp(this.pivot.z, f.pivot.z, 18, dt);
      this.pivot.y = damp(this.pivot.y, f.pivot.y, 10, dt);
    }

    // Over-the-shoulder offset
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    const px = this.pivot.x + rightX * f.shoulder;
    const py = this.pivot.y;
    const pz = this.pivot.z + rightZ * f.shoulder;

    const cp = Math.cos(this.pitch);
    const dx = Math.sin(this.yaw) * cp;
    const dy = Math.sin(this.pitch);
    const dz = Math.cos(this.yaw) * cp;

    // Collision: pull in fast when blocked, ease out slowly when clear.
    const hit = raycastAABBs(px, py, pz, dx, dy, dz, f.distance + CLIP_PADDING, this.colliders);
    const allowed = Math.max(MIN_DISTANCE, Math.min(f.distance, hit - CLIP_PADDING));
    this.currentDistance =
      allowed < this.currentDistance
        ? damp(this.currentDistance, allowed, 30, dt)
        : damp(this.currentDistance, allowed, 3, dt);
    const d = this.currentDistance;

    let cx = px + dx * d;
    let cy = py + dy * d;
    let cz = pz + dz * d;
    if (cy < 0.25) cy = 0.25;

    // Shake (smooth noise, decays)
    this.shakeTime += dt;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const s = this.shake * this.shake * 0.12;
    if (s > 0) {
      cx += Math.sin(this.shakeTime * 37) * s;
      cy += Math.sin(this.shakeTime * 43 + 1) * s;
      cz += Math.sin(this.shakeTime * 31 + 2) * s;
    }

    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(px, py, pz);

    this.fov = damp(this.fov, f.fov, 4, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
