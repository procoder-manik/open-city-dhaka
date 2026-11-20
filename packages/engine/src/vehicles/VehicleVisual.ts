import * as THREE from 'three/webgpu';
import type { VehicleDef } from '@game/shared';

export interface WheelState {
  suspension: number;
  rotation: number;
  steering: number;
}

const damp = (current: number, target: number, rate: number, dt: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-rate * dt));

function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  pos: [number, number, number],
  mat: THREE.Material,
  shadow = true,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  m.position.set(...pos);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  parent.add(m);
  return m;
}

function cyl(
  parent: THREE.Object3D,
  r: number,
  h: number,
  pos: [number, number, number],
  rot: [number, number, number],
  mat: THREE.Material,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/**
 * Procedural vehicle models (no downloaded assets) driven by physics state:
 * wheels follow suspension, steering and spin; bikes lean into turns.
 */
export class VehicleVisual {
  readonly root = new THREE.Group();
  /** Body that leans (bikes); rider attaches here. */
  readonly leanGroup = new THREE.Group();
  /** Where a visible rider sits (bikes only). */
  readonly seat = new THREE.Group();
  private wheels: Array<{
    pivot: THREE.Group;
    steer: THREE.Group;
    spin: THREE.Group;
    base: THREE.Vector3;
  }> = [];
  private lean = 0;
  private materials: THREE.Material[] = [];

  constructor(readonly def: VehicleDef) {
    this.root.add(this.leanGroup);
    const paint = this.mat(
      new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.35, metalness: 0.4 }),
    );
    const dark = this.mat(new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.7 }));
    const chrome = this.mat(
      new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.25, metalness: 0.9 }),
    );
    const glass = this.mat(
      new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.6 }),
    );
    const headlight = this.mat(
      new THREE.MeshStandardMaterial({
        color: 0xfff3c4,
        emissive: 0xffe9a0,
        emissiveIntensity: 0.6,
      }),
    );
    const taillight = this.mat(
      new THREE.MeshStandardMaterial({
        color: 0x8a1010,
        emissive: 0xff2020,
        emissiveIntensity: 0.4,
      }),
    );
    const tyre = this.mat(new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }));
    const rim = this.mat(
      new THREE.MeshStandardMaterial({ color: 0x8f949a, roughness: 0.4, metalness: 0.7 }),
    );

    switch (def.kind) {
      case 'car':
        this.buildCar(paint, dark, chrome, glass, headlight, taillight);
        break;
      case 'cng':
        this.buildCng(paint, dark, chrome, headlight, taillight);
        break;
      case 'bike':
        this.buildBike(paint, dark, chrome, headlight, taillight);
        break;
    }

    // Wheels
    for (const w of def.wheels) {
      const pivot = new THREE.Group();
      const base = new THREE.Vector3(...w.position);
      pivot.position.copy(base);
      const steer = new THREE.Group();
      const spin = new THREE.Group();
      pivot.add(steer);
      steer.add(spin);
      const width = def.kind === 'bike' ? 0.1 : def.kind === 'cng' ? 0.14 : 0.22;
      cyl(spin, w.radius, width, [0, 0, 0], [0, 0, Math.PI / 2], tyre);
      cyl(spin, w.radius * 0.6, width + 0.01, [0, 0, 0], [0, 0, Math.PI / 2], rim);
      // Spokes/marker so rotation is visible
      box(spin, [width + 0.02, w.radius * 1.1, 0.04], [0, 0, 0], rim, false);
      this.leanGroup.add(pivot);
      this.wheels.push({ pivot, steer, spin, base });
    }
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private buildCar(
    paint: THREE.Material,
    dark: THREE.Material,
    chrome: THREE.Material,
    glass: THREE.Material,
    head: THREE.Material,
    tail: THREE.Material,
  ) {
    const g = this.leanGroup;
    box(g, [1.72, 0.52, 4.1], [0, -0.18, 0], paint);
    box(g, [1.52, 0.5, 2.1], [0, 0.32, -0.25], glass);
    box(g, [1.56, 0.06, 2.0], [0, 0.6, -0.25], paint); // roof
    box(g, [1.74, 0.16, 0.25], [0, -0.32, 2.07], dark); // bumpers
    box(g, [1.74, 0.16, 0.25], [0, -0.32, -2.07], dark);
    box(g, [0.36, 0.12, 0.05], [0.6, -0.08, 2.06], head, false);
    box(g, [0.36, 0.12, 0.05], [-0.6, -0.08, 2.06], head, false);
    box(g, [0.36, 0.1, 0.05], [0.6, -0.06, -2.06], tail, false);
    box(g, [0.36, 0.1, 0.05], [-0.6, -0.06, -2.06], tail, false);
    box(g, [1.0, 0.1, 0.03], [0, -0.2, 2.07], chrome, false); // grille
    for (const x of [0.88, -0.88]) box(g, [0.06, 0.08, 0.16], [x, 0.18, 0.75], dark, false); // mirrors
  }

  private buildCng(
    paint: THREE.Material,
    dark: THREE.Material,
    chrome: THREE.Material,
    head: THREE.Material,
    tail: THREE.Material,
  ) {
    const g = this.leanGroup;
    const canopy = this.mat(new THREE.MeshStandardMaterial({ color: 0x24402c, roughness: 0.8 }));
    const plate = this.mat(new THREE.MeshStandardMaterial({ color: 0xf2f2ea, roughness: 0.6 }));
    const stripe = this.mat(new THREE.MeshStandardMaterial({ color: 0xf4c430, roughness: 0.5 }));
    box(g, [1.3, 0.55, 2.0], [0, -0.22, -0.2], paint); // rear body + passenger tub
    box(g, [0.95, 0.5, 0.8], [0, -0.2, 0.95], paint); // front nose
    box(g, [1.36, 0.08, 2.2], [0, 0.78, -0.05], canopy); // canopy roof
    box(g, [1.32, 0.7, 0.04], [0, 0.4, -1.18], canopy); // rear canopy panel
    box(g, [1.32, 0.06, 0.02], [0, 0.0, -1.22], stripe); // yellow stripe
    box(g, [0.42, 0.16, 0.02], [0, -0.32, -1.22], plate); // number plate
    for (const [x, z] of [
      [0.64, 0.95],
      [-0.64, 0.95],
      [0.64, -1.1],
      [-0.64, -1.1],
      [0.64, -0.2],
      [-0.64, -0.2],
    ] as const)
      box(g, [0.04, 0.95, 0.04], [x, 0.3, z], canopy);
    // Famous CNG cage: thin bars on the sides
    for (let z = -1.0; z <= 0.8; z += 0.18) {
      box(g, [0.015, 0.7, 0.015], [0.66, 0.4, z], dark, false);
      box(g, [0.015, 0.7, 0.015], [-0.66, 0.4, z], dark, false);
    }
    box(
      g,
      [1.2, 0.45, 0.08],
      [0, 0.18, 1.32],
      this.mat(new THREE.MeshStandardMaterial({ color: 0x2a3b48, roughness: 0.1 })),
    ); // windscreen
    box(g, [1.1, 0.4, 0.5], [0, 0.18, -0.85], canopy); // seat back
    box(g, [0.2, 0.14, 0.05], [0, -0.05, 1.36], head, false);
    box(g, [0.18, 0.1, 0.05], [0.5, -0.25, -1.21], tail, false);
    box(g, [0.18, 0.1, 0.05], [-0.5, -0.25, -1.21], tail, false);
    box(g, [0.9, 0.04, 0.04], [0, 0.0, 1.0], chrome, false); // handlebar
  }

  private buildBike(
    paint: THREE.Material,
    dark: THREE.Material,
    chrome: THREE.Material,
    head: THREE.Material,
    tail: THREE.Material,
  ) {
    const g = this.leanGroup;
    box(g, [0.22, 0.3, 0.95], [0, -0.12, 0], dark); // engine / frame
    box(g, [0.34, 0.24, 0.5], [0, 0.12, 0.28], paint); // tank
    box(g, [0.28, 0.1, 0.62], [0, 0.18, -0.25], dark); // seat
    box(g, [0.24, 0.16, 0.4], [0, 0.06, -0.6], paint); // tail
    cyl(g, 0.035, 0.75, [0.1, -0.05, 0.62], [0.35, 0, 0], chrome); // forks
    cyl(g, 0.035, 0.75, [-0.1, -0.05, 0.62], [0.35, 0, 0], chrome);
    cyl(g, 0.02, 0.7, [0, 0.36, 0.52], [0, 0, Math.PI / 2], chrome); // handlebar
    cyl(g, 0.05, 0.6, [0.16, -0.3, -0.35], [Math.PI / 2 - 0.15, 0, 0], chrome); // exhaust
    box(g, [0.16, 0.14, 0.08], [0, 0.26, 0.74], head, false);
    box(g, [0.14, 0.06, 0.04], [0, 0.12, -0.81], tail, false);
    this.seat.position.set(0, 0.22, -0.18);
    g.add(this.seat);
  }

  update(dt: number, speed: number, wheels: WheelState[]) {
    wheels.forEach((w, i) => {
      const v = this.wheels[i];
      if (!v) return;
      v.pivot.position.y = v.base.y - w.suspension;
      v.steer.rotation.y = w.steering;
      v.spin.rotation.x = w.rotation;
    });
    if (this.def.kind === 'bike') {
      const steer = wheels.find((_, i) => this.def.wheels[i]?.steer)?.steering ?? 0;
      const target = THREE.MathUtils.clamp(-steer * Math.abs(speed) * 0.11, -0.6, 0.6);
      this.lean = damp(this.lean, target, 6, dt);
      this.leanGroup.rotation.z = this.lean;
    }
  }

  dispose() {
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const m of this.materials) m.dispose();
  }
}
