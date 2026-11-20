import * as THREE from 'three/webgpu';

export interface HumanoidLook {
  skin: number;
  shirt: number;
  /** Lungi check colours [base, stripe]. */
  lungi: [number, number];
  hair: number;
  sandals: number;
}

export const MOSTOFA_LOOK: HumanoidLook = {
  skin: 0x9a6640,
  shirt: 0xd9d4c4,
  lungi: [0x1f4e8c, 0x2a8a6a],
  hair: 0x161210,
  sandals: 0x3a2a1e,
};

/** What the animator needs to know each frame. */
export interface LocomotionState {
  /** Horizontal speed (m/s). */
  speed: number;
  /** Horizontal distance moved this frame (m) — drives the gait so feet don't slide. */
  distance: number;
  grounded: boolean;
  /** Vertical velocity (m/s). */
  vy: number;
  /** Yaw change rate (rad/s), for leaning into turns. */
  turnRate: number;
  /** Forward acceleration (m/s²), for leaning on start/stop. */
  accel: number;
  riding: boolean;
}

const WALK_SPEED = 3.6;
const SPRINT_SPEED = 7.5;
const HIP_HEIGHT = 0.93;

const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const damp = (current: number, target: number, rate: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-rate * dt));

function lungiTexture(base: number, stripe: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  g.fillStyle = hex(base);
  g.fillRect(0, 0, 64, 64);
  g.globalAlpha = 0.55;
  g.fillStyle = hex(stripe);
  for (let i = 0; i < 64; i += 16) {
    g.fillRect(i, 0, 6, 64);
    g.fillRect(0, i, 64, 6);
  }
  g.globalAlpha = 0.35;
  g.fillStyle = '#ffffff';
  for (let i = 8; i < 64; i += 16) {
    g.fillRect(i, 0, 1, 64);
    g.fillRect(0, i, 64, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}

/** A joint: group at the pivot, with the visible part hanging below it. */
function limb(
  parent: THREE.Object3D,
  pos: [number, number, number],
  length: number,
  radius: number,
  mat: THREE.Material,
): THREE.Group {
  const joint = new THREE.Group();
  joint.position.set(...pos);
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 4, 8),
    mat,
  );
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  joint.add(mesh);
  parent.add(joint);
  return joint;
}

/**
 * Procedurally rigged & animated character. No downloaded assets: built from simple
 * shapes and animated with a distance-driven gait, so it's tiny and never foot-slides.
 * Will be swapped for a skinned model later without changing the controller API.
 */
export class Humanoid {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private hips: THREE.Group;
  private spine: THREE.Group;
  private chest: THREE.Group;
  private head: THREE.Group;
  private thigh: [THREE.Group, THREE.Group];
  private shin: [THREE.Group, THREE.Group];
  private foot: [THREE.Group, THREE.Group];
  private upperArm: [THREE.Group, THREE.Group];
  private foreArm: [THREE.Group, THREE.Group];
  private lungi: THREE.Mesh;

  private phase = 0;
  private moveBlend = 0;
  private runBlend = 0;
  private airBlend = 0;
  private rideBlend = 0;
  private landTimer = 0;
  private landStrength = 0;
  private bank = 0;
  private pitchLean = 0;
  private time = 0;
  private wasGrounded = true;
  private lastVy = 0;

  constructor(look: HumanoidLook = MOSTOFA_LOOK) {
    const skin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.75 });
    const shirt = new THREE.MeshStandardMaterial({ color: look.shirt, roughness: 0.9 });
    const hair = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.6 });
    const sandal = new THREE.MeshStandardMaterial({ color: look.sandals, roughness: 0.8 });
    const lungiMat = new THREE.MeshStandardMaterial({
      map: lungiTexture(look.lungi[0], look.lungi[1]),
      roughness: 0.95,
      side: THREE.DoubleSide,
    });

    this.root.add(this.body);
    this.hips = new THREE.Group();
    this.hips.position.y = HIP_HEIGHT;
    this.body.add(this.hips);

    // Torso
    this.spine = new THREE.Group();
    this.spine.position.y = 0.05;
    this.hips.add(this.spine);
    const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.12, 4, 10), shirt);
    belly.position.y = 0.12;
    belly.scale.set(1.1, 1, 0.8);
    belly.castShadow = true;
    this.spine.add(belly);

    this.chest = new THREE.Group();
    this.chest.position.y = 0.24;
    this.spine.add(this.chest);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.16, 4, 10), shirt);
    torso.position.y = 0.12;
    torso.scale.set(1.2, 1, 0.75);
    torso.castShadow = true;
    this.chest.add(torso);
    // Collar
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.02, 6, 12), shirt);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.33;
    this.chest.add(collar);

    // Head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8), skin);
    neck.position.y = 0.37;
    this.chest.add(neck);
    this.head = new THREE.Group();
    this.head.position.y = 0.43;
    this.chest.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), skin);
    skull.scale.set(0.92, 1.08, 1);
    skull.position.y = 0.1;
    skull.castShadow = true;
    this.head.add(skull);
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      hair,
    );
    hairCap.scale.set(0.95, 1.05, 1.02);
    hairCap.position.set(0, 0.115, -0.008);
    this.head.add(hairCap);
    // Signature mustache + eyes + nose
    const mustache = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.018, 0.02), hair);
    mustache.position.set(0, 0.05, 0.098);
    this.head.add(mustache);
    const eyeGeo = new THREE.SphereGeometry(0.012, 6, 6);
    for (const x of [-0.035, 0.035]) {
      const eye = new THREE.Mesh(eyeGeo, hair);
      eye.position.set(x, 0.115, 0.093);
      this.head.add(eye);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.04, 6), skin);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.08, 0.108);
    this.head.add(nose);

    // Arms: short-sleeve shirt on upper arm, skin forearm
    const armX = 0.22;
    this.upperArm = [
      limb(this.chest, [armX, 0.27, 0], 0.3, 0.055, shirt),
      limb(this.chest, [-armX, 0.27, 0], 0.3, 0.055, shirt),
    ];
    this.foreArm = [
      limb(this.upperArm[0], [0, -0.29, 0], 0.27, 0.045, skin),
      limb(this.upperArm[1], [0, -0.29, 0], 0.27, 0.045, skin),
    ];
    for (const fa of this.foreArm) {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skin);
      hand.position.y = -0.29;
      fa.add(hand);
    }

    // Legs: skin (under lungi), sandals
    const legX = 0.1;
    this.thigh = [
      limb(this.hips, [legX, 0, 0], 0.44, 0.075, skin),
      limb(this.hips, [-legX, 0, 0], 0.44, 0.075, skin),
    ];
    this.shin = [
      limb(this.thigh[0], [0, -0.43, 0], 0.43, 0.058, skin),
      limb(this.thigh[1], [0, -0.43, 0], 0.43, 0.058, skin),
    ];
    this.foot = [new THREE.Group(), new THREE.Group()];
    this.foot.forEach((f, i) => {
      f.position.y = -0.43;
      this.shin[i]!.add(f);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.24), sandal);
      sole.position.set(0, -0.045, 0.05);
      sole.castShadow = true;
      f.add(sole);
    });

    // Lungi: flared tube from waist to mid-shin, follows the hips.
    this.lungi = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.68, 14, 1, true), lungiMat);
    this.lungi.position.y = -0.3;
    this.lungi.castShadow = true;
    this.hips.add(this.lungi);
    const knot = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 16), lungiMat);
    knot.rotation.x = Math.PI / 2;
    knot.position.y = 0.03;
    this.hips.add(knot);
  }

  /** Total height to the top of the head, for camera framing. */
  get height(): number {
    return 1.72;
  }

  update(dt: number, s: LocomotionState) {
    this.time += dt;
    const speed = s.riding ? 0 : s.speed;

    this.moveBlend = damp(this.moveBlend, clamp(speed / 1.2, 0, 1), 10, dt);
    this.runBlend = damp(
      this.runBlend,
      clamp((speed - WALK_SPEED * 1.05) / (SPRINT_SPEED - WALK_SPEED * 1.05), 0, 1),
      6,
      dt,
    );
    this.airBlend = damp(this.airBlend, !s.grounded && !s.riding ? 1 : 0, s.grounded ? 14 : 8, dt);
    this.rideBlend = damp(this.rideBlend, s.riding ? 1 : 0, 12, dt);

    // Landing impact
    if (s.grounded && !this.wasGrounded && !s.riding) {
      this.landStrength = clamp(-this.lastVy / 9, 0.25, 1);
      this.landTimer = 0.28;
    }
    this.wasGrounded = s.grounded;
    this.lastVy = s.vy;
    this.landTimer = Math.max(0, this.landTimer - dt);
    const land =
      this.landTimer > 0 ? Math.sin((this.landTimer / 0.28) * Math.PI) * this.landStrength : 0;

    // Gait phase advances with distance travelled (one cycle = two steps).
    const stride = lerp(1.45, 2.7, this.runBlend);
    if (!s.riding && s.grounded) this.phase += (s.distance / stride) * Math.PI * 2;
    const sn = Math.sin(this.phase);
    const cs = Math.cos(this.phase);

    const m = this.moveBlend;
    const r = this.runBlend;
    const legAmp = lerp(0.42, 0.85, r) * m;
    const kneeAmp = lerp(0.65, 1.45, r) * m;
    const armAmp = lerp(0.3, 0.95, r) * m;
    const elbow = lerp(0.18, 1.35, r);

    // --- Ground locomotion pose ---
    const thighL = -sn * legAmp;
    const thighR = sn * legAmp;
    const kneeL = 0.06 + Math.max(0, cs) * kneeAmp + land * 0.7;
    const kneeR = 0.06 + Math.max(0, -cs) * kneeAmp + land * 0.7;
    const bob = lerp(0.025, 0.06, r) * m;
    let hipY = HIP_HEIGHT - bob * Math.abs(sn) - land * 0.14;
    let thighs: [number, number] = [thighL - land * 0.35, thighR - land * 0.35];
    let knees: [number, number] = [kneeL, kneeR];
    let arms: [number, number] = [sn * armAmp, -sn * armAmp];
    let armSpread = 0.08;
    let forearms = -elbow * (0.4 + 0.6 * m);
    let spineLean = lerp(0.03, 0.2, r) * m + land * 0.25;

    // Idle breathing
    const breathe = Math.sin(this.time * 1.8) * (1 - m);
    this.chest.scale.set(1 + breathe * 0.01, 1 + breathe * 0.015, 1 + breathe * 0.02);

    // --- Air pose (jump / fall) ---
    const a = this.airBlend;
    if (a > 0.001) {
      const rising = s.vy > 0 ? 1 : 0;
      const airThigh = rising ? -0.75 : -0.35;
      const airKnee = rising ? 1.3 : 0.6;
      thighs = [lerp(thighs[0], airThigh + 0.15, a), lerp(thighs[1], airThigh - 0.2, a)];
      knees = [lerp(knees[0], airKnee, a), lerp(knees[1], airKnee * 0.7, a)];
      arms = [lerp(arms[0], -0.5, a), lerp(arms[1], -0.3, a)];
      armSpread = lerp(armSpread, 0.55, a);
      forearms = lerp(forearms, -0.6, a);
      spineLean = lerp(spineLean, 0.12, a);
    }

    // --- Riding pose (motorbike) ---
    const rd = this.rideBlend;
    if (rd > 0.001) {
      thighs = [lerp(thighs[0], -1.35, rd), lerp(thighs[1], -1.35, rd)];
      knees = [lerp(knees[0], 1.5, rd), lerp(knees[1], 1.5, rd)];
      arms = [lerp(arms[0], -1.05, rd), lerp(arms[1], -1.05, rd)];
      armSpread = lerp(armSpread, 0.18, rd);
      forearms = lerp(forearms, -0.45, rd);
      spineLean = lerp(spineLean, 0.3, rd);
      hipY = lerp(hipY, 0.0, rd);
    }

    this.hips.position.y = hipY;
    this.hips.rotation.y = sn * 0.14 * m * (1 - rd);
    this.chest.rotation.y = -sn * 0.2 * m * (1 - rd);
    this.thigh[0].rotation.x = thighs[0];
    this.thigh[1].rotation.x = thighs[1];
    this.shin[0].rotation.x = knees[0];
    this.shin[1].rotation.x = knees[1];
    this.foot[0].rotation.x = -(thighs[0] + knees[0]) * 0.6 + 0.1;
    this.foot[1].rotation.x = -(thighs[1] + knees[1]) * 0.6 + 0.1;
    this.upperArm[0].rotation.x = arms[0];
    this.upperArm[1].rotation.x = arms[1];
    this.upperArm[0].rotation.z = armSpread;
    this.upperArm[1].rotation.z = -armSpread;
    this.foreArm[0].rotation.x = forearms;
    this.foreArm[1].rotation.x = forearms;

    // Lean into acceleration and turns (whole body, pivoting at the feet).
    this.pitchLean = damp(this.pitchLean, clamp(s.accel * 0.025, -0.15, 0.2) * (1 - rd), 6, dt);
    this.spine.rotation.x = spineLean + this.pitchLean;
    const targetBank = clamp(-s.turnRate * s.speed * 0.035, -0.3, 0.3) * (1 - rd);
    this.bank = damp(this.bank, targetBank, 8, dt);
    this.body.rotation.z = this.bank;

    // Lungi sways with the stride
    this.lungi.rotation.x = -sn * 0.06 * m;
    this.lungi.scale.x = 1 + Math.abs(sn) * 0.08 * m;

    // Head stays steadier than the body
    this.head.rotation.x = -spineLean * 0.5;
    this.head.rotation.y = -this.chest.rotation.y * 0.6;
  }

  setVisible(v: boolean) {
    this.root.visible = v;
  }

  dispose() {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
      mat?.map?.dispose();
      mat?.dispose?.();
    });
  }
}
