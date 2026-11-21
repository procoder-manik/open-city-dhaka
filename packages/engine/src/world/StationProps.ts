import * as THREE from 'three/webgpu';
import type { QualityPreset, Station } from '@game/shared';
import type { BodyDesc } from '../physics/protocol';
import type { AABB } from '../camera/raycast';
import { MeshBuilder } from './MeshBuilder';
import { fitText, getBanglaFont } from './textures';

type Box = { size: [number, number, number]; pos: [number, number, number] };

/** Bangla signboard texture (fictional business name + a small English line). */
function signTexture(name: string, sub: string, bg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 14;
  g.strokeRect(10, 10, c.width - 20, c.height - 20);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, name, c.width / 2, 130, c.width - 80, 110, `700 {size}px ${getBanglaFont()}`);
  g.font = `600 52px ${getBanglaFont()}`;
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillText(sub, c.width / 2, 245);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Petrol pump forecourts (canopy, pillars, dispensers) and roadside garages (open shed),
 * each with a lit Bangla signboard facing the road. One merged mesh per station + signs,
 * fixed physics boxes for pillars/pumps/walls.
 */
export class StationProps {
  readonly group = new THREE.Group();
  readonly bodies: Omit<BodyDesc, 'id'>[] = [];
  readonly colliders: AABB[] = [];
  /** Emissive materials to light up at night (multiply by the night factor). */
  readonly nightMaterials: Array<{ material: THREE.MeshStandardMaterial; max: number }> = [];
  private disposables: Array<{ dispose(): void }> = [];

  constructor(stations: Station[], preset: QualityPreset) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    this.disposables.push(mat);
    for (const s of stations) {
      const yaw = Math.atan2(s.roadX - s.x, s.roadZ - s.z);
      const root = new THREE.Group();
      root.position.set(s.x, 0, s.z);
      root.rotation.y = yaw;
      const b = new MeshBuilder();
      const solid: Box[] = [];
      if (s.type === 'pump') {
        b.box([14, 0.06, 12], [0, 0.03, 0], 0x8f8d86);
        b.box([11, 0.45, 8], [0, 5.3, 0], 0xf2f2ef);
        b.box([11.3, 0.55, 0.25], [0, 5.25, 4.1], 0xc8302a);
        b.box([11.3, 0.55, 0.25], [0, 5.25, -4.1], 0xc8302a);
        for (const x of [-4.5, 4.5])
          for (const z of [-3, 3]) solid.push({ size: [0.4, 5.1, 0.4], pos: [x, 2.55, z] });
        for (const x of [-2.3, 2.3]) {
          b.box([1, 0.3, 3.2], [x, 0.15, 0], 0xb8b5aa);
          solid.push({ size: [1, 0.3, 3.2], pos: [x, 0.15, 0] });
          for (const z of [-0.8, 0.8]) {
            b.box([0.6, 1.7, 0.5], [x, 1.15, z], 0xd8352a);
            b.box([0.62, 0.35, 0.52], [x, 1.75, z], 0xf5f5f5);
          }
        }
        // Sign pole by the road
        b.box([0.25, 6.6, 0.25], [6.2, 3.3, 5.2], 0x5a5a5a);
      } else {
        b.box([12.6, 0.06, 12], [0, 0.03, 0], 0x7d776c);
        solid.push({ size: [12.6, 4.6, 0.3], pos: [0, 2.3, -6] });
        solid.push({ size: [0.3, 4.6, 12], pos: [-6.3, 2.3, 0] });
        solid.push({ size: [0.3, 4.6, 12], pos: [6.3, 2.3, 0] });
        b.box([13.2, 0.25, 12.8], [0, 4.72, -0.2], 0x6d7b84);
        // Spray booth stripe, tyres and oil drums
        b.box([12, 0.6, 0.05], [0, 1.6, -5.83], 0x2a6ab0);
        for (let i = 0; i < 4; i++)
          b.cylinder(0.38, 0.38, 0.25, [-5.3, 0.13 + i * 0.26, -4.6], 0x1c1c1c, 12);
        for (const z of [-2, -0.9]) b.cylinder(0.32, 0.32, 0.9, [5.4, 0.45, z], 0x2f6a3a, 10);
      }
      for (const w of solid) {
        b.box(w.size, w.pos, s.type === 'pump' ? 0xe5e5e0 : 0xb9a98e);
        const off = new THREE.Vector3(...w.pos).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        const half: [number, number, number] = [w.size[0] / 2, w.size[1] / 2, w.size[2] / 2];
        this.bodies.push({
          shape: { kind: 'box', halfExtents: half },
          position: [s.x + off.x, off.y, s.z + off.z],
          yaw,
          type: 'fixed',
        });
        // Camera: axis-aligned bounds of the rotated box
        const c = Math.abs(Math.cos(yaw));
        const sn = Math.abs(Math.sin(yaw));
        const hx = half[0] * c + half[2] * sn;
        const hz = half[0] * sn + half[2] * c;
        this.colliders.push([
          s.x + off.x - hx,
          off.y - half[1],
          s.z + off.z - hz,
          s.x + off.x + hx,
          off.y + half[1],
          s.z + off.z + hz,
        ]);
      }
      const mesh = b.build(mat, { castShadow: preset.shadows, receiveShadow: true });
      if (mesh) root.add(mesh);

      // Signboard (two faces so it reads from both directions)
      const tex = signTexture(
        s.name,
        s.type === 'pump' ? 'পেট্রোল • অকটেন • ডিজেল • সিএনজি' : 'মেরামত • রং • টায়ার',
        s.type === 'pump' ? '#b3261e' : '#1f4f8f',
      );
      const signMat = new THREE.MeshStandardMaterial({
        map: tex,
        emissiveMap: tex,
        emissive: 0xffffff,
        emissiveIntensity: 0.05,
        roughness: 0.6,
      });
      this.nightMaterials.push({ material: signMat, max: 0.9 });
      this.disposables.push(tex, signMat);
      const w = s.type === 'pump' ? 4.4 : 8;
      const h = w * (320 / 1024);
      const geo = new THREE.PlaneGeometry(w, h);
      this.disposables.push(geo);
      const at: [number, number, number] = s.type === 'pump' ? [6.2, 7.1, 5.35] : [0, 5.5, 6.05];
      for (const flip of [0, Math.PI]) {
        const sign = new THREE.Mesh(geo, signMat);
        sign.position.set(at[0], at[1], at[2] + (flip ? -0.02 : 0.02));
        sign.rotation.y = flip;
        root.add(sign);
      }
      this.group.add(root);
    }
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) m.geometry.dispose();
    });
    for (const d of this.disposables) d.dispose();
  }
}
