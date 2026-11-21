import * as THREE from 'three/webgpu';

export type ParticleKind = 'dust' | 'exhaust' | 'smoke' | 'blackSmoke' | 'debris' | 'spray';

interface P {
  alive: boolean;
  kind: ParticleKind;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  size0: number;
  size1: number;
  color: THREE.Color;
}

const KIND: Record<
  ParticleKind,
  { life: [number, number]; size: [number, number]; color: number; rise: number; drag: number }
> = {
  dust: { life: [0.8, 1.6], size: [0.4, 1.8], color: 0xb39b7c, rise: 0.25, drag: 1.6 },
  exhaust: { life: [0.5, 1.0], size: [0.12, 0.6], color: 0x8f8f8f, rise: 0.5, drag: 1.2 },
  smoke: { life: [1.2, 2.2], size: [0.4, 2.0], color: 0xbdbdbd, rise: 1.4, drag: 0.8 },
  blackSmoke: { life: [1.6, 2.8], size: [0.5, 2.6], color: 0x2a2a2a, rise: 1.8, drag: 0.7 },
  debris: { life: [0.6, 1.1], size: [0.08, 0.05], color: 0x3a3a3a, rise: -9, drag: 0.2 },
  spray: { life: [0.35, 0.7], size: [0.25, 1.1], color: 0xcfd8de, rise: -1.5, drag: 2.2 },
};

function softTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Pooled camera-facing particles in ONE instanced draw call: dust from tyres,
 * exhaust puffs, smoke from damaged engines, crash debris. Fades by shrinking +
 * blending towards the fog colour (cheap on phones, no per-particle materials).
 */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private pool: P[];
  private next = 0;
  private dummy = new THREE.Object3D();
  private tex: THREE.CanvasTexture;
  private fogColor = new THREE.Color(0xd8c0a0);

  constructor(max = 220) {
    this.tex = softTexture();
    const mat = new THREE.MeshBasicMaterial({
      map: this.tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
      fog: true,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.count = 0;
    this.pool = Array.from({ length: max }, () => ({
      alive: false,
      kind: 'dust' as ParticleKind,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      age: 0,
      life: 1,
      size0: 1,
      size1: 1,
      color: new THREE.Color(),
    }));
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
  }

  setFogColor(c: THREE.Color) {
    this.fogColor.copy(c);
  }

  emit(kind: ParticleKind, at: THREE.Vector3, vel?: THREE.Vector3, count = 1) {
    const k = KIND[kind];
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.next]!;
      this.next = (this.next + 1) % this.pool.length;
      p.alive = true;
      p.kind = kind;
      p.pos
        .copy(at)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.3,
            Math.random() * 0.1,
            (Math.random() - 0.5) * 0.3,
          ),
        );
      p.vel.set(
        (Math.random() - 0.5) * 0.8,
        k.rise * (0.6 + Math.random() * 0.6),
        (Math.random() - 0.5) * 0.8,
      );
      if (kind === 'debris')
        p.vel.set((Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6);
      if (vel) p.vel.add(vel);
      p.age = 0;
      p.life = k.life[0] + Math.random() * (k.life[1] - k.life[0]);
      p.size0 = k.size[0] * (0.7 + Math.random() * 0.6);
      p.size1 = k.size[1] * (0.7 + Math.random() * 0.6);
      p.color.setHex(k.color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08);
    }
  }

  update(dt: number, camera: THREE.Camera) {
    let n = 0;
    const tmp = new THREE.Color();
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      const k = KIND[p.kind];
      const t = p.age / p.life;
      p.vel.multiplyScalar(Math.exp(-k.drag * dt));
      if (p.kind === 'debris') p.vel.y -= 9.8 * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.02) {
        p.pos.y = 0.02;
        p.vel.y = Math.abs(p.vel.y) * 0.2;
      }
      const size = p.size0 + (p.size1 - p.size0) * Math.sqrt(t);
      const fade = Math.sin(Math.min(1, t * 1.4) * Math.PI); // in & out
      this.dummy.position.copy(p.pos);
      this.dummy.quaternion.copy(camera.quaternion);
      this.dummy.scale.setScalar(Math.max(0.001, size * (0.35 + 0.65 * fade)));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      tmp.copy(p.color).lerp(this.fogColor, 1 - fade * 0.85);
      this.mesh.setColorAt(n, tmp);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.tex.dispose();
  }
}
