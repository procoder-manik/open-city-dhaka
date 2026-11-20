import * as THREE from 'three/webgpu';

/** Glowing GTA-style cylinders: yellow = mission start, blue = current objective. */
export class MissionMarkers {
  readonly group = new THREE.Group();
  private starts: THREE.Mesh[] = [];
  private target: THREE.Mesh;
  private geo = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true);
  private startMat: THREE.MeshBasicMaterial;
  private targetMat: THREE.MeshBasicMaterial;
  private t = 0;

  constructor() {
    const mk = (color: number) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
    this.startMat = mk(0xffc21a);
    this.targetMat = mk(0x3aa0ff);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(this.geo, this.startMat);
      m.visible = false;
      m.renderOrder = 5;
      this.starts.push(m);
      this.group.add(m);
    }
    this.target = new THREE.Mesh(this.geo, this.targetMat);
    this.target.visible = false;
    this.target.renderOrder = 5;
    this.group.add(this.target);
  }

  update(
    dt: number,
    starts: Array<{ x: number; z: number }>,
    target: { x: number; z: number; r: number } | null,
  ) {
    this.t += dt;
    const pulse = 0.85 + Math.sin(this.t * 3) * 0.15;
    this.starts.forEach((m, i) => {
      const s = starts[i];
      m.visible = !!s;
      if (!s) return;
      m.position.set(s.x, 1.1, s.z);
      m.scale.set(1.3 * pulse, 2.2, 1.3 * pulse);
    });
    this.target.visible = !!target;
    if (target) {
      const r = Math.min(target.r, 6);
      this.target.position.set(target.x, 2, target.z);
      this.target.scale.set(r * pulse, 4, r * pulse);
    }
    this.startMat.opacity = 0.3 + Math.sin(this.t * 3) * 0.08;
    this.targetMat.opacity = 0.3 + Math.sin(this.t * 3 + 1) * 0.08;
  }

  dispose() {
    this.geo.dispose();
    this.startMat.dispose();
    this.targetMat.dispose();
  }
}
