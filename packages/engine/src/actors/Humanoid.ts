import { GltfBody, characterModelReady, type BodyTint } from './GltfBody';
import * as THREE from 'three/webgpu';

export type Emotion = 'neutral' | 'happy' | 'angry' | 'scared' | 'smug' | 'surprised';

export interface HumanoidLook {
  skin: number;
  hair: number;
  hairStyle: 'quiff' | 'short' | 'bald' | 'long';
  beard: 'none' | 'stubble' | 'full' | 'grey';
  mustache: boolean;
  top: {
    kind: 'shirtOpen' | 'shirt' | 'tshirt' | 'panjabi' | 'vest';
    color: number;
    under?: number;
  };
  bottom: { kind: 'jeans' | 'trousers' | 'lungi' | 'shorts'; color: number; check?: number };
  shoes: { kind: 'sneakers' | 'sandals'; color: number };
  sunglasses?: boolean;
  chain?: boolean;
  cap?: number | null;
  belly?: number;
  height?: number;
  /** 0 = normal walk, 1 = full swagger. */
  swagger?: number;
  /** false = always the code-built body (default: realistic model when the outfit fits). */
  realistic?: boolean;
}

/** Hero: smart young Dhaka mastan. */
export const MOSTOFA_LOOK: HumanoidLook = {
  skin: 0x8d5a3b,
  hair: 0x120d0b,
  hairStyle: 'quiff',
  beard: 'stubble',
  mustache: true,
  top: { kind: 'shirtOpen', color: 0x7a1424, under: 0x111214 },
  bottom: { kind: 'jeans', color: 0x2a3b57 },
  shoes: { kind: 'sneakers', color: 0xf2f2ee },
  sunglasses: true,
  chain: true,
  swagger: 1,
  height: 1.0,
};

export const NPC_LOOKS: Record<string, HumanoidLook> = {
  teaChacha: {
    skin: 0x7e5235,
    hair: 0xd8d4cc,
    hairStyle: 'short',
    beard: 'grey',
    mustache: false,
    top: { kind: 'panjabi', color: 0xf3efe4 },
    bottom: { kind: 'lungi', color: 0x2a5c3a, check: 0xd9c46a },
    shoes: { kind: 'sandals', color: 0x3a2a1e },
    cap: 0xf6f4ee,
    belly: 0.8,
    height: 0.97,
  },
  rickshawWala: {
    skin: 0x6e4429,
    hair: 0x15100d,
    hairStyle: 'short',
    beard: 'stubble',
    mustache: true,
    top: { kind: 'vest', color: 0xd6d0c2 },
    bottom: { kind: 'lungi', color: 0x7a2b2b, check: 0x2b4a7a },
    shoes: { kind: 'sandals', color: 0x2a221a },
    height: 0.96,
  },
  shopkeeper: {
    skin: 0x8a5a3c,
    hair: 0x15100d,
    hairStyle: 'short',
    beard: 'none',
    mustache: true,
    top: { kind: 'shirt', color: 0x8fb4d8 },
    bottom: { kind: 'trousers', color: 0x3a3a3a },
    shoes: { kind: 'sandals', color: 0x2a221a },
    belly: 0.5,
  },
  foreigner: {
    skin: 0xe8c4a8,
    hair: 0xc89a4a,
    hairStyle: 'short',
    beard: 'stubble',
    mustache: false,
    top: { kind: 'tshirt', color: 0x4f8f6a },
    bottom: { kind: 'shorts', color: 0xc8b48a },
    shoes: { kind: 'sneakers', color: 0x5a5a5a },
    cap: 0x2f4f7f,
    sunglasses: true,
    height: 1.04,
  },
};

/** What the animator needs to know each frame. */
export interface LocomotionState {
  speed: number;
  /** Horizontal distance moved this frame (m) — drives the gait so feet don't slide. */
  distance: number;
  grounded: boolean;
  vy: number;
  turnRate: number;
  accel: number;
  riding: boolean;
}

const PUNCH_TIME = 0.42;
const WALK_SPEED = 1.6;
const JOG_SPEED = 3.6;
const SPRINT_SPEED = 7.2;
const HIP_HEIGHT = 0.95;

const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const _sphere = new THREE.Sphere();
const damp = (current: number, target: number, rate: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-rate * dt));

function checkTexture(base: number, stripe: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  g.fillStyle = hex(base);
  g.fillRect(0, 0, 64, 64);
  g.globalAlpha = 0.5;
  g.fillStyle = hex(stripe);
  for (let i = 0; i < 64; i += 16) {
    g.fillRect(i, 0, 6, 64);
    g.fillRect(0, i, 64, 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}

function denimTexture(color: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, 64, 64);
  for (let i = -64; i < 64; i += 3) {
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 64, 64);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 4);
  return t;
}

/**
 * Smooth body segment turned on a lathe: `profile` is [radius, y] pairs from the top down.
 * `depth` squashes front-to-back (torsos are oval, not round).
 */
function lathe(profile: Array<[number, number]>, segs = 16, depth = 1): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)).reverse(),
    segs,
  );
  if (depth !== 1) g.scale(1, 1, depth);
  g.computeVertexNormals();
  return g;
}

/** Multiply a hex colour (skin shade for sockets/stubble). */
function darken(hex: number, k: number): number {
  return new THREE.Color(hex).multiplyScalar(k).getHex();
}

/** Radius along a limb: rTop → bulge (muscle belly at `at`) → rBottom, eased. */
function limbProfile(
  length: number,
  rTop: number,
  rBulge: number,
  rBottom: number,
  at: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const k = t < at ? t / at : (t - at) / (1 - at);
    const e = 0.5 - 0.5 * Math.cos(k * Math.PI);
    const r = t < at ? rTop + (rBulge - rTop) * e : rBulge + (rBottom - rBulge) * e;
    out.push([r, -t * length]);
  }
  return out;
}

/** Limb joint: bone at the pivot, a muscle-shaped segment hanging below it, round joints. */
function limb(
  parent: THREE.Object3D,
  pos: [number, number, number],
  length: number,
  rTop: number,
  rBottom: number,
  mat: THREE.Material,
  bulge = 1.08,
  bulgeAt = 0.3,
): THREE.Bone {
  const joint = new THREE.Bone();
  joint.position.set(...pos);
  const rMid = Math.max(rTop, rBottom) * bulge;
  const body = new THREE.Mesh(
    lathe(limbProfile(length, rTop, rMid, rBottom, bulgeAt), 14, 0.92),
    mat,
  );
  body.castShadow = true;
  joint.add(body);
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(rTop, 14, 10), mat);
  capTop.scale.set(1, 1, 0.92);
  joint.add(capTop);
  const capBottom = new THREE.Mesh(new THREE.SphereGeometry(rBottom, 12, 8), mat);
  capBottom.position.y = -length;
  capBottom.scale.set(1, 1, 0.92);
  joint.add(capBottom);
  parent.add(joint);
  return joint;
}

/** A small bone with one part hanging on it (eyelids, brows, mouth, cloth). */
function faceBone(
  parent: THREE.Object3D,
  pos: [number, number, number],
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
): THREE.Bone {
  const bone = new THREE.Bone();
  bone.position.set(...pos);
  bone.add(new THREE.Mesh(geo, mat));
  parent.add(bone);
  return bone;
}

/** Merge parts into one geometry with vertex colours and rigid skin weights. */
function mergeSkinned(
  parts: Array<{ geo: THREE.BufferGeometry; bone: number; color: THREE.Color }>,
): THREE.BufferGeometry {
  let vCount = 0;
  let iCount = 0;
  for (const p of parts) {
    const n = p.geo.getAttribute('position').count;
    vCount += n;
    iCount += p.geo.index ? p.geo.index.count : n;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const col = new Float32Array(vCount * 3);
  const si = new Uint16Array(vCount * 4);
  const sw = new Float32Array(vCount * 4);
  const idx = new Uint32Array(iCount);
  let v = 0;
  let i = 0;
  for (const p of parts) {
    const g = p.geo;
    const n = g.getAttribute('position').count;
    pos.set(g.getAttribute('position').array as Float32Array, v * 3);
    const nAttr = g.getAttribute('normal');
    if (nAttr) nor.set(nAttr.array as Float32Array, v * 3);
    const uAttr = g.getAttribute('uv');
    if (uAttr) uv.set(uAttr.array as Float32Array, v * 2);
    for (let k = 0; k < n; k++) {
      col[(v + k) * 3] = p.color.r;
      col[(v + k) * 3 + 1] = p.color.g;
      col[(v + k) * 3 + 2] = p.color.b;
      si[(v + k) * 4] = p.bone;
      sw[(v + k) * 4] = 1;
    }
    if (g.index) {
      const a = g.index.array;
      for (let k = 0; k < a.length; k++) idx[i + k] = a[k]! + v;
      i += a.length;
    } else {
      for (let k = 0; k < n; k++) idx[i + k] = v + k;
      i += n;
    }
    v += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

const EMOTION_FACE: Record<
  Emotion,
  { brow: number; browY: number; smile: number; mouthW: number; eyeOpen: number }
> = {
  neutral: { brow: 0, browY: 0, smile: 0, mouthW: 1, eyeOpen: 1 },
  happy: { brow: -0.1, browY: 0.004, smile: 1, mouthW: 1.25, eyeOpen: 0.8 },
  angry: { brow: 0.45, browY: -0.006, smile: -0.7, mouthW: 0.9, eyeOpen: 0.85 },
  scared: { brow: -0.35, browY: 0.01, smile: -0.4, mouthW: 0.8, eyeOpen: 1.25 },
  smug: { brow: 0.15, browY: 0.002, smile: 0.6, mouthW: 1.1, eyeOpen: 0.7 },
  surprised: { brow: -0.3, browY: 0.014, smile: 0, mouthW: 0.85, eyeOpen: 1.35 },
};

/**
 * Procedurally built, animated human: outfit from a look, expressive face (blink,
 * brows, mouth, emotions, talking), distance-driven gait (no foot sliding) with
 * walk → jog → sprint blending, swagger, jump/land, riding pose, idle gestures.
 * Placeholder for a skinned glTF character with blendshapes (same API).
 */
export class Humanoid {
  readonly root = new THREE.Group();
  readonly look: HumanoidLook;
  private body = new THREE.Bone();
  private hips: THREE.Bone;
  private spine: THREE.Bone;
  private chest: THREE.Bone;
  private head: THREE.Bone;
  private thigh: [THREE.Bone, THREE.Bone];
  private shin: [THREE.Bone, THREE.Bone];
  private foot: [THREE.Bone, THREE.Bone];
  private upperArm: [THREE.Bone, THREE.Bone];
  private foreArm: [THREE.Bone, THREE.Bone];
  private skirt: THREE.Bone | null = null;
  private lids: THREE.Bone[] = [];
  private brows: THREE.Bone[] = [];
  private mouth: THREE.Bone;
  private mouthCorners: THREE.Bone[] = [];
  /** The baked, skinned body (1 draw call; +1 for textured cloth like a lungi). */
  readonly meshes: THREE.SkinnedMesh[] = [];
  private materials: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];

  private phase = 0;
  private moveBlend = 0;
  private runBlend = 0;
  private sprintBlend = 0;
  private airBlend = 0;
  private rideBlend = 0;
  private landTimer = 0;
  private landStrength = 0;
  private bank = 0;
  private pitchLean = 0;
  private time = Math.random() * 10;
  private wasGrounded = true;
  private lastVy = 0;
  private lastStepSign = 1;

  // Face state
  private emotion: Emotion = 'neutral';
  private emotionTimer = 0;
  private face = { ...EMOTION_FACE.neutral };
  private blinkTimer = 2 + Math.random() * 3;
  private blinkT = 0;
  private talkTimer = 0;
  private gesture = 0;
  /** Called on each footstep (for sounds). */
  onFootstep: ((strength: number) => void) | null = null;

  // Combat poses
  private punchT = 0;
  private punchSide = 1;
  private aimBlend = 0;
  /** Hold the right arm out aiming a pistol. */
  aiming = false;
  /** Hands up (arrested). */
  handsUp = false;
  private handsUpBlend = 0;
  private throwT = 0;
  /** Fists up (boxing guard) while fighting with bare hands. */
  guard = false;
  private guardBlend = 0;
  private reactT = 0;
  private reactSide = 1;
  private gunMesh: THREE.Mesh | null = null;

  constructor(look: HumanoidLook = MOSTOFA_LOOK) {
    this.look = look;
    const mat = (
      color: number,
      rough = 0.8,
      extra: Partial<THREE.MeshStandardMaterialParameters> = {},
    ) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
      this.materials.push(m);
      return m;
    };
    const skin = mat(look.skin, 0.6);
    const hair = mat(look.hair, 0.55);
    const topMat = mat(look.top.color, 0.85);
    const underMat = mat(look.top.under ?? look.top.color, 0.9);
    let bottomMat: THREE.MeshStandardMaterial;
    if (look.bottom.kind === 'jeans') {
      const t = denimTexture(look.bottom.color);
      this.textures.push(t);
      bottomMat = mat(0xffffff, 0.9, { map: t });
    } else if (look.bottom.kind === 'lungi') {
      const t = checkTexture(look.bottom.color, look.bottom.check ?? 0xffffff);
      this.textures.push(t);
      bottomMat = mat(0xffffff, 0.95, { map: t, side: THREE.DoubleSide });
    } else {
      bottomMat = mat(look.bottom.color, 0.9);
    }
    const shoeMat = mat(look.shoes.color, 0.7);
    const dark = mat(0x0d0b0a, 0.5);
    const white = mat(0xf4f1ea, 0.4);
    const lip = mat(0x5a2a22, 0.6);
    const gold = mat(0xd4a33a, 0.25, { metalness: 0.9 });

    const s = look.height ?? 1;
    this.root.scale.setScalar(s);
    this.root.add(this.body);
    this.hips = new THREE.Bone();
    this.hips.position.y = HIP_HEIGHT;
    this.body.add(this.hips);

    // ---- Torso: one smooth oval body (hips → waist → chest → shoulders) ----
    const belly = look.belly ?? 0;
    this.spine = new THREE.Bone();
    this.spine.position.y = 0.05;
    this.hips.add(this.spine);
    const lowerMat = look.top.kind === 'shirtOpen' ? underMat : topMat;
    const pelvis = new THREE.Mesh(
      lathe(
        [
          [0.15, 0.09],
          [0.165, 0.02],
          [0.17, -0.05],
          [0.15, -0.11],
          [0.09, -0.15],
        ],
        18,
        0.74,
      ),
      look.top.kind === 'panjabi' ? topMat : bottomMat,
    );
    pelvis.castShadow = true;
    this.hips.add(pelvis);
    if (look.bottom.kind === 'jeans' && look.top.kind !== 'panjabi') {
      const belt = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.012, 6, 28), mat(0x2a1e16, 0.5));
      belt.rotation.x = Math.PI / 2;
      belt.scale.set(1, 0.74, 1);
      belt.position.y = 0.075;
      this.hips.add(belt);
    }
    const abdomen = new THREE.Mesh(
      lathe(
        [
          [0.14 + belly * 0.02, 0.27],
          [0.135 + belly * 0.03, 0.18],
          [0.14 + belly * 0.05, 0.08],
          [0.152, 0.0],
          [0.15, -0.04],
        ],
        18,
        0.7 + belly * 0.22,
      ),
      lowerMat,
    );
    abdomen.castShadow = true;
    this.spine.add(abdomen);

    this.chest = new THREE.Bone();
    this.chest.position.y = 0.24;
    this.spine.add(this.chest);
    // Rib cage → chest → shoulder line → neck base (V-taper)
    const torso = new THREE.Mesh(
      lathe(
        [
          [0.06, 0.37],
          [0.13, 0.33],
          [0.19, 0.27],
          [0.195, 0.2],
          [0.18, 0.1],
          [0.155, 0.0],
          [0.14, -0.06],
        ],
        20,
        0.62,
      ),
      lowerMat,
    );
    torso.castShadow = true;
    this.chest.add(torso);
    const traps = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), lowerMat);
    traps.scale.set(1.55, 0.45, 0.75);
    traps.position.set(0, 0.315, -0.01);
    this.chest.add(traps);
    if (look.top.kind === 'shirtOpen') {
      for (const side of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.46, 0.025), topMat);
        panel.position.set(side * 0.125, 0.08, 0.115);
        panel.rotation.y = side * 0.38;
        panel.castShadow = true;
        this.chest.add(panel);
        const collar = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.02), topMat);
        collar.position.set(side * 0.065, 0.32, 0.075);
        collar.rotation.set(-0.3, 0, side * 0.55);
        this.chest.add(collar);
      }
      const back = new THREE.Mesh(
        lathe(
          [
            [0.135, 0.31],
            [0.2, 0.24],
            [0.2, 0.1],
            [0.16, -0.02],
            [0.155, -0.2],
          ],
          16,
          0.64,
        ),
        topMat,
      );
      back.scale.set(1.03, 1, 1.04);
      this.chest.add(back);
    }
    if (look.top.kind === 'panjabi') {
      const tail = new THREE.Mesh(
        lathe(
          [
            [0.17, 0.05],
            [0.2, -0.2],
            [0.24, -0.48],
          ],
          16,
          0.8,
        ),
        topMat,
      );
      this.hips.add(tail);
    }
    if (look.chain) {
      const chain = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.006, 6, 24), gold);
      chain.rotation.x = Math.PI / 2.4;
      chain.position.set(0, 0.29, 0.035);
      chain.scale.set(1, 0.8, 1);
      this.chest.add(chain);
    }

    // ---- Neck, head & face ----
    const neck = new THREE.Mesh(
      lathe(
        [
          [0.047, 0.48],
          [0.045, 0.42],
          [0.055, 0.34],
        ],
        14,
        0.95,
      ),
      skin,
    );
    this.chest.add(neck);
    this.head = new THREE.Bone();
    this.head.position.y = 0.43;
    this.chest.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.104, 28, 20), skin);
    skull.scale.set(0.86, 1.06, 1.02);
    skull.position.set(0, 0.105, -0.008);
    skull.castShadow = true;
    this.head.add(skull);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.085, 22, 16), skin);
    face.scale.set(0.92, 1.12, 0.82);
    face.position.set(0, 0.075, 0.03);
    this.head.add(face);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.062, 18, 12), skin);
    jaw.scale.set(1.12, 0.72, 1.0);
    jaw.position.set(0, 0.03, 0.035);
    this.head.add(jaw);
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), skin);
    chin.scale.set(1.2, 0.9, 0.9);
    chin.position.set(0, 0.012, 0.082);
    this.head.add(chin);
    for (const x of [-0.048, 0.048]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), skin);
      cheek.scale.set(1, 0.8, 0.8);
      cheek.position.set(x, 0.083, 0.072);
      this.head.add(cheek);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), skin);
      ear.scale.set(0.35, 1.0, 0.7);
      ear.position.set(x * 1.92, 0.1, 0.0);
      this.head.add(ear);
      const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), skin);
      lobe.position.set(x * 1.9, 0.074, 0.004);
      this.head.add(lobe);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.048, 0.02), skin);
    bridge.position.set(0, 0.1, 0.1);
    bridge.rotation.x = -0.32;
    this.head.add(bridge);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 10), skin);
    tip.position.set(0, 0.075, 0.112);
    this.head.add(tip);
    for (const x of [-0.013, 0.013]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), skin);
      wing.position.set(x, 0.072, 0.104);
      this.head.add(wing);
    }

    // Eyes: socket shade, white, brown iris, pupil, lids (blink) + brows
    const socket = mat(darken(look.skin, 0.8), 0.7);
    const irisMat = mat(0x3b2416, 0.3);
    for (const x of [-0.034, 0.034]) {
      const sock = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), socket);
      sock.scale.set(1.25, 0.8, 0.5);
      sock.position.set(x, 0.112, 0.083);
      this.head.add(sock);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0145, 14, 10), white);
      eye.scale.set(1.15, 0.78, 0.7);
      eye.position.set(x, 0.112, 0.091);
      this.head.add(eye);
      const ir = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 12, 8), irisMat);
      ir.scale.set(1, 1, 0.5);
      ir.position.set(x, 0.112, 0.1005);
      this.head.add(ir);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 8, 6), dark);
      pupil.position.set(x, 0.112, 0.104);
      this.head.add(pupil);
      const lid = faceBone(
        this.head,
        [x, 0.122, 0.098],
        new THREE.SphereGeometry(0.017, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
        skin,
      );
      lid.scale.y = 0.05;
      this.lids.push(lid);
      const brow = new THREE.CapsuleGeometry(0.0045, 0.03, 4, 8);
      brow.rotateZ(Math.PI / 2 + (x < 0 ? -0.12 : 0.12));
      this.brows.push(faceBone(this.head, [x, 0.138, 0.095], brow, hair));
    }
    const lips = new THREE.CapsuleGeometry(0.0075, 0.026, 4, 10);
    lips.rotateZ(Math.PI / 2);
    lips.scale(1, 1, 0.8);
    this.mouth = faceBone(this.head, [0, 0.041, 0.097], lips, lip);
    for (const x of [-0.02, 0.02]) {
      this.mouthCorners.push(
        faceBone(this.head, [x, 0.046, 0.094], new THREE.SphereGeometry(0.0055, 8, 6), lip),
      );
    }
    const upperLip = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.028, 4, 10), lip);
    upperLip.rotation.z = Math.PI / 2;
    upperLip.position.set(0, 0.052, 0.098);
    this.head.add(upperLip);
    if (look.mustache) {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.04, 4, 10), hair);
      m.rotation.z = Math.PI / 2;
      m.position.set(0, 0.06, 0.103);
      m.scale.set(1, 1, 0.8);
      this.head.add(m);
    }
    if (look.beard !== 'none') {
      const beardMat =
        look.beard === 'grey'
          ? mat(0xcfcac0, 0.8)
          : look.beard === 'stubble'
            ? mat(darken(look.skin, 0.62), 0.95)
            : hair;
      const beard = new THREE.Mesh(
        new THREE.SphereGeometry(0.068, 20, 12, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.42),
        beardMat,
      );
      beard.position.set(0, 0.07, 0.03);
      beard.scale.set(
        1.15,
        look.beard === 'full' || look.beard === 'grey' ? 1.35 : 1.05,
        look.beard === 'stubble' ? 1.04 : 1.12,
      );
      this.head.add(beard);
    }
    if (look.hairStyle !== 'bald') {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
        hair,
      );
      cap.scale.set(0.9, 1.02, 1.07);
      cap.position.set(0, 0.112, -0.012);
      this.head.add(cap);
      for (const x of [-0.083, 0.083]) {
        const burn = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.03), hair);
        burn.position.set(x, 0.1, 0.035);
        this.head.add(burn);
      }
      if (look.hairStyle === 'quiff') {
        const quiff = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 10), hair);
        quiff.scale.set(1.35, 0.6, 1.05);
        quiff.position.set(0.0, 0.205, 0.045);
        quiff.rotation.x = -0.35;
        this.head.add(quiff);
      }
      if (look.hairStyle === 'long') {
        const back = new THREE.Mesh(
          lathe(
            [
              [0.1, 0.16],
              [0.105, 0.05],
              [0.09, -0.08],
              [0.07, -0.14],
            ],
            18,
            0.85,
          ),
          hair,
        );
        back.position.set(0, 0.0, -0.025);
        this.head.add(back);
      }
    }
    if (look.cap != null) {
      const capMat = mat(look.cap, 0.8);
      const hat = new THREE.Mesh(
        new THREE.SphereGeometry(0.113, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.45),
        capMat,
      );
      hat.position.set(0, 0.125, -0.006);
      this.head.add(hat);
      if (look === NPC_LOOKS.foreigner) {
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.008, 18), capMat);
        brim.scale.set(1, 1, 0.7);
        brim.position.set(0, 0.16, 0.1);
        this.head.add(brim);
      }
    }
    if (look.sunglasses) {
      const lensMat = mat(0x050608, 0.05, { metalness: 0.8 });
      for (const x of [-0.035, 0.035]) {
        const lens = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.016, 4, 10), lensMat);
        lens.rotation.z = Math.PI / 2;
        lens.scale.set(1, 1, 0.3);
        lens.position.set(x, 0.112, 0.106);
        this.head.add(lens);
      }
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.005, 0.005), gold);
      frame.position.set(0, 0.126, 0.106);
      this.head.add(frame);
      for (const x of [-0.072, 0.072]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.1), gold);
        arm.position.set(x, 0.118, 0.06);
        this.head.add(arm);
      }
    }

    // ---- Arms: deltoid, biceps, forearm, hand with fingers ----
    const sleeveMat = look.top.kind === 'vest' ? skin : topMat;
    const armX = 0.205;
    this.upperArm = [
      limb(this.chest, [armX, 0.27, 0], 0.29, 0.058, 0.043, sleeveMat, 1.06, 0.35),
      limb(this.chest, [-armX, 0.27, 0], 0.29, 0.058, 0.043, sleeveMat, 1.06, 0.35),
    ];
    for (const ua of this.upperArm) {
      const delt = new THREE.Mesh(new THREE.SphereGeometry(0.058, 16, 12), sleeveMat);
      delt.scale.set(1.0, 0.95, 1.0);
      delt.position.set(0, -0.015, 0);
      ua.add(delt);
    }
    const longSleeve = look.top.kind === 'panjabi';
    const foreMat = longSleeve ? topMat : skin;
    this.foreArm = [
      limb(this.upperArm[0], [0, -0.29, 0], 0.26, 0.044, 0.032, foreMat, 1.1, 0.25),
      limb(this.upperArm[1], [0, -0.29, 0], 0.26, 0.044, 0.032, foreMat, 1.1, 0.25),
    ];
    this.foreArm.forEach((fa, i) => {
      const side = i === 0 ? 1 : -1;
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10), skin);
      palm.scale.set(0.95, 1.1, 0.48);
      palm.position.set(0, -0.3, 0);
      fa.add(palm);
      for (let f = 0; f < 4; f++) {
        const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.036, 4, 8), skin);
        finger.position.set((f - 1.5) * 0.017, -0.35, 0.01);
        finger.rotation.x = 0.55;
        fa.add(finger);
      }
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.03, 4, 8), skin);
      thumb.position.set(-side * 0.028, -0.31, 0.022);
      thumb.rotation.set(0.6, 0, side * 0.6);
      fa.add(thumb);
    });

    // ---- Legs: thigh, knee, calf, shoe ----
    const legMat = look.bottom.kind === 'lungi' || look.bottom.kind === 'shorts' ? skin : bottomMat;
    const legX = 0.092;
    const thighMat = look.bottom.kind === 'shorts' ? bottomMat : legMat;
    this.thigh = [
      limb(this.hips, [legX, 0, 0], 0.44, 0.085, 0.056, thighMat, 1.0, 0.2),
      limb(this.hips, [-legX, 0, 0], 0.44, 0.085, 0.056, thighMat, 1.0, 0.2),
    ];
    this.shin = [
      limb(this.thigh[0], [0, -0.44, 0], 0.43, 0.056, 0.038, legMat, 1.12, 0.3),
      limb(this.thigh[1], [0, -0.44, 0], 0.43, 0.056, 0.038, legMat, 1.12, 0.3),
    ];
    this.foot = [new THREE.Bone(), new THREE.Bone()];
    this.foot.forEach((f, i) => {
      f.position.y = -0.43;
      this.shin[i]!.add(f);
      if (look.shoes.kind === 'sneakers') {
        const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.16, 6, 14), shoeMat);
        upper.rotation.x = Math.PI / 2;
        upper.scale.set(1.0, 1.0, 0.72);
        upper.position.set(0, -0.035, 0.045);
        upper.castShadow = true;
        f.add(upper);
        const sole = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.17, 4, 14), white);
        sole.rotation.x = Math.PI / 2;
        sole.scale.set(1.04, 1.0, 0.3);
        sole.position.set(0, -0.067, 0.045);
        f.add(sole);
      } else {
        const sole = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.17, 4, 12), shoeMat);
        sole.rotation.x = Math.PI / 2;
        sole.scale.set(1.0, 1.0, 0.22);
        sole.position.set(0, -0.06, 0.05);
        f.add(sole);
        const top = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.12, 4, 12), skin);
        top.rotation.x = Math.PI / 2;
        top.scale.set(0.95, 1, 0.55);
        top.position.set(0, -0.035, 0.05);
        f.add(top);
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.03), shoeMat);
        strap.position.set(0, -0.022, 0.08);
        f.add(strap);
      }
    });

    if (look.bottom.kind === 'lungi') {
      this.skirt = faceBone(
        this.hips,
        [0, -0.32, 0],
        new THREE.CylinderGeometry(0.19, 0.25, 0.72, 16, 1, true),
        bottomMat,
      );
    }

    this.bake();
    this.tryRealisticBody(look);
  }

  /** Realistic glTF body for outfits it can show (T-shirt/shirt + jeans/trousers, short hair). */
  private realBody: GltfBody | null = null;
  private tryRealisticBody(look: HumanoidLook) {
    const fits =
      look.realistic !== false &&
      (look.top.kind === 'shirtOpen' || look.top.kind === 'shirt' || look.top.kind === 'tshirt') &&
      (look.bottom.kind === 'jeans' || look.bottom.kind === 'trousers') &&
      look.hairStyle !== 'long';
    if (!fits || !characterModelReady()) return;
    try {
      const div = (c: THREE.Color, r: number, g: number, b: number, max: number) =>
        c.setRGB(Math.min(max, c.r / r), Math.min(max, c.g / g), Math.min(max, c.b / b));
      const tint: BodyTint = {
        skin: div(new THREE.Color(look.skin), 0.86, 0.64, 0.54, 1.2),
        shirt: new THREE.Color(look.top.color),
        pants: new THREE.Color(look.bottom.color),
        shoes: new THREE.Color(look.shoes.color),
      };
      this.realBody = new GltfBody(
        this.root,
        {
          hips: this.hips,
          spine: this.spine,
          chest: this.chest,
          head: this.head,
          thighL: this.thigh[0],
          shinL: this.shin[0],
          footL: this.foot[0],
          thighR: this.thigh[1],
          shinR: this.shin[1],
          footR: this.foot[1],
          armL: this.upperArm[0],
          foreL: this.foreArm[0],
          armR: this.upperArm[1],
          foreR: this.foreArm[1],
        },
        HIP_HEIGHT,
        tint,
      );
      // The code-built mesh is no longer drawn (its bones keep driving the pose)
      for (const m of this.meshes) {
        m.parent?.remove(m);
        m.geometry.dispose();
      }
      this.meshes.length = 0;
      this.meshes.push(this.realBody.mesh);
    } catch (err) {
      console.warn('[character] realistic body failed, using procedural:', err);
      this.realBody = null;
    }
  }

  /**
   * Bake all parts into ONE skinned mesh (rigidly bound to the joint bones) plus one
   * per textured cloth. ~1–2 draw calls per character instead of ~60 — this is how
   * real game characters work, and a modelled glTF character can replace it later.
   */
  private bake() {
    this.root.updateMatrixWorld(true);
    const rootInv = this.root.matrixWorld.clone().invert();
    const bones: THREE.Bone[] = [];
    this.root.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
    });
    const boneIndex = new Map(bones.map((b, i) => [b, i]));
    const parts: THREE.Mesh[] = [];
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) parts.push(o as THREE.Mesh);
    });

    const groups = new Map<
      THREE.Texture | null,
      Array<{ geo: THREE.BufferGeometry; bone: number; color: THREE.Color; doubleSide: boolean }>
    >();
    for (const m of parts) {
      let b: THREE.Object3D | null = m.parent;
      while (b && !(b as THREE.Bone).isBone) b = b.parent;
      const mat = m.material as THREE.MeshStandardMaterial;
      const geo = m.geometry.clone();
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, m.matrixWorld));
      const key = mat.map ?? null;
      const list = groups.get(key) ?? [];
      list.push({
        geo,
        bone: boneIndex.get(b as THREE.Bone) ?? 0,
        color: mat.color.clone(),
        doubleSide: mat.side === THREE.DoubleSide,
      });
      groups.set(key, list);
      m.parent?.remove(m);
      m.geometry.dispose();
    }
    for (const mat of this.materials) mat.dispose();
    this.materials = [];

    const skeleton = new THREE.Skeleton(bones);
    for (const [map, list] of groups) {
      const geometry = mergeSkinned(list);
      for (const l of list) l.geo.dispose();
      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.72,
        ...(map ? { map, side: THREE.DoubleSide } : {}),
      });
      this.materials.push(material);
      const mesh = new THREE.SkinnedMesh(geometry, material);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      mesh.bind(skeleton);
      this.meshes.push(mesh);
    }
  }

  /**
   * Skinned meshes skip three's frustum culling (bind-pose bounds are wrong once posed),
   * so cull by hand: hide the meshes when the character is off-screen or too far.
   * Returns whether it is drawn (callers may skip animation work when not).
   */
  cull(frustum: THREE.Frustum, cam: THREE.Vector3, maxDist: number): boolean {
    const p = this.root.position;
    _sphere.center.set(p.x, p.y + 0.9, p.z);
    _sphere.radius = 1.3;
    const show = p.distanceToSquared(cam) < maxDist * maxDist && frustum.intersectsSphere(_sphere);
    for (const m of this.meshes) m.visible = show;
    return show;
  }

  setCastShadow(on: boolean) {
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = on;
    });
  }

  get height(): number {
    return 1.75 * (this.look.height ?? 1);
  }

  /** Show an emotion on the face for `seconds` (then back to neutral). */
  setEmotion(e: Emotion, seconds = 3) {
    this.emotion = e;
    this.emotionTimer = seconds;
  }

  /** Move the mouth (and gesture) as if talking for `seconds`. */
  talk(seconds: number) {
    this.talkTimer = Math.max(this.talkTimer, seconds);
  }

  get isTalking(): boolean {
    return this.talkTimer > 0;
  }

  private updateFace(dt: number) {
    if (this.emotionTimer > 0) {
      this.emotionTimer -= dt;
      if (this.emotionTimer <= 0) this.emotion = 'neutral';
    }
    const target = EMOTION_FACE[this.emotion];
    for (const k of Object.keys(this.face) as Array<keyof typeof this.face>) {
      this.face[k] = damp(this.face[k], target[k], 10, dt);
    }

    // Natural blinking (faster blinks when scared)
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkT = 0.14;
      this.blinkTimer = (this.emotion === 'scared' ? 0.8 : 2.2) + Math.random() * 3.5;
    }
    let closed = 0;
    if (this.blinkT > 0) {
      this.blinkT -= dt;
      closed = Math.sin((1 - this.blinkT / 0.14) * Math.PI);
    }
    const open = clamp(this.face.eyeOpen, 0.4, 1.4);
    const lidScale = clamp(0.05 + (1.2 - open) * 0.5 + closed, 0.05, 1);
    for (const lid of this.lids) {
      lid.scale.y = lidScale;
      lid.position.y = 0.124 - (lidScale - 0.05) * 0.009;
    }
    this.brows.forEach((b, i) => {
      const side = i === 0 ? -1 : 1;
      b.rotation.z = side * this.face.brow * 0.6;
      b.position.y = 0.142 + this.face.browY;
    });

    // Talking: jaw flaps with irregular rhythm
    let open01 = 0;
    if (this.talkTimer > 0) {
      this.talkTimer -= dt;
      const t = this.time * 14;
      open01 = clamp(0.35 + 0.35 * Math.sin(t) + 0.3 * Math.sin(t * 1.7 + 1.3), 0, 1);
    }
    this.mouth.scale.set(
      this.face.mouthW,
      1 + open01 * 2.8 + (this.emotion === 'surprised' ? 1.8 : 0),
      1,
    );
    this.mouth.position.y = 0.045 - open01 * 0.006;
    this.mouthCorners.forEach((c) => {
      c.position.y = 0.045 + this.face.smile * 0.007;
    });
  }

  update(dt: number, s: LocomotionState) {
    this.time += dt;
    this.updateFace(dt);
    const speed = s.riding ? 0 : s.speed;
    const swagger = this.look.swagger ?? 0;

    this.moveBlend = damp(this.moveBlend, clamp(speed / 0.9, 0, 1), 10, dt);
    this.runBlend = damp(
      this.runBlend,
      clamp((speed - WALK_SPEED * 1.3) / (JOG_SPEED - WALK_SPEED * 1.3), 0, 1),
      6,
      dt,
    );
    this.sprintBlend = damp(
      this.sprintBlend,
      clamp((speed - JOG_SPEED) / (SPRINT_SPEED - JOG_SPEED), 0, 1),
      5,
      dt,
    );
    this.airBlend = damp(this.airBlend, !s.grounded && !s.riding ? 1 : 0, s.grounded ? 14 : 8, dt);
    this.rideBlend = damp(this.rideBlend, s.riding ? 1 : 0, 12, dt);

    if (s.grounded && !this.wasGrounded && !s.riding) {
      this.landStrength = clamp(-this.lastVy / 9, 0.25, 1);
      this.landTimer = 0.3;
      this.onFootstep?.(1.4 * this.landStrength);
    }
    this.wasGrounded = s.grounded;
    this.lastVy = s.vy;
    this.landTimer = Math.max(0, this.landTimer - dt);
    const land =
      this.landTimer > 0 ? Math.sin((this.landTimer / 0.3) * Math.PI) * this.landStrength : 0;

    // Real stride lengths: walk ≈ 1.5 m/cycle·2, jog ≈ 2.4, sprint ≈ 3.6 (two steps per cycle)
    const r = this.runBlend;
    const sp = this.sprintBlend;
    const stride = lerp(lerp(1.5, 2.4, r), 3.6, sp);
    if (!s.riding && s.grounded) this.phase += (s.distance / stride) * Math.PI * 2;
    const sn = Math.sin(this.phase);
    const cs = Math.cos(this.phase);
    if (Math.sign(sn) !== this.lastStepSign && this.moveBlend > 0.3 && s.grounded && !s.riding) {
      this.lastStepSign = Math.sign(sn) || 1;
      this.onFootstep?.(0.4 + r * 0.4 + sp * 0.3);
    }

    const m = this.moveBlend;
    const legAmp = lerp(lerp(0.38, 0.7, r), 0.95, sp) * m;
    const kneeAmp = lerp(lerp(0.55, 1.2, r), 1.7, sp) * m;
    const armAmp = lerp(lerp(0.25 + swagger * 0.12, 0.75, r), 1.05, sp) * m;
    const elbow = lerp(lerp(0.15, 1.2, r), 1.5, sp);

    const kneeL = 0.05 + Math.max(0, cs) * kneeAmp + land * 0.75;
    const kneeR = 0.05 + Math.max(0, -cs) * kneeAmp + land * 0.75;
    const bob = lerp(lerp(0.02, 0.045, r), 0.07, sp) * m;
    let hipY = HIP_HEIGHT - bob * Math.abs(sn) - land * 0.15;
    let thighs: [number, number] = [-sn * legAmp - land * 0.4, sn * legAmp - land * 0.4];
    let knees: [number, number] = [kneeL, kneeR];
    let arms: [number, number] = [sn * armAmp, -sn * armAmp];
    let armSpread = 0.1 + swagger * 0.06 * (1 - r);
    let forearms = -elbow * (0.35 + 0.65 * m);
    let spineLean = lerp(lerp(-0.03 * swagger, 0.12, r), 0.28, sp) * m + land * 0.25;

    // Idle: breathing, weight shift, and gestures while talking
    const idle = 1 - m;
    const breathe = Math.sin(this.time * 1.7) * idle;
    this.chest.scale.set(1 + breathe * 0.01, 1 + breathe * 0.012, 1 + breathe * 0.02);
    this.gesture = damp(this.gesture, this.talkTimer > 0 ? 1 : 0, 6, dt);
    if (idle > 0.01) {
      const shift = Math.sin(this.time * 0.6) * 0.03 * idle;
      this.hips.position.x = shift;
      const g = this.gesture * idle;
      arms = [
        lerp(arms[0], -0.5 + Math.sin(this.time * 5) * 0.25, g),
        lerp(arms[1], -0.15, g * 0.5),
      ];
      forearms = lerp(forearms, -1.1 + Math.sin(this.time * 6) * 0.3, g);
      if (swagger > 0 && g < 0.1) armSpread = lerp(armSpread, 0.16, idle); // relaxed cool stance
    }

    // Air
    const a = this.airBlend;
    if (a > 0.001) {
      const rising = s.vy > 0;
      const airThigh = rising ? -0.8 : -0.35;
      const airKnee = rising ? 1.35 : 0.6;
      thighs = [lerp(thighs[0], airThigh + 0.2, a), lerp(thighs[1], airThigh - 0.25, a)];
      knees = [lerp(knees[0], airKnee, a), lerp(knees[1], airKnee * 0.7, a)];
      arms = [lerp(arms[0], -0.6, a), lerp(arms[1], -0.35, a)];
      armSpread = lerp(armSpread, 0.6, a);
      forearms = lerp(forearms, -0.7, a);
      spineLean = lerp(spineLean, 0.12, a);
    }

    // Riding (bike)
    const rd = this.rideBlend;
    if (rd > 0.001) {
      thighs = [lerp(thighs[0], -1.35, rd), lerp(thighs[1], -1.35, rd)];
      knees = [lerp(knees[0], 1.55, rd), lerp(knees[1], 1.55, rd)];
      arms = [lerp(arms[0], -1.05, rd), lerp(arms[1], -1.05, rd)];
      armSpread = lerp(armSpread, 0.2, rd);
      forearms = lerp(forearms, -0.45, rd);
      spineLean = lerp(spineLean, 0.3, rd);
      hipY = lerp(hipY, 0.0, rd);
    }

    this.hips.position.y = hipY;
    // Pelvis drops on the swing side, shoulders counter (natural gait)
    this.hips.rotation.z = sn * 0.06 * m * (1 - r * 0.5) * (1 - rd);
    // Swagger: shoulders roll more than hips, slight lean back
    this.hips.rotation.y = sn * (0.12 + swagger * 0.06) * m * (1 - rd);
    this.chest.rotation.y = -sn * (0.18 + swagger * 0.1) * m * (1 - rd);
    this.chest.rotation.z = sn * swagger * 0.05 * m * (1 - r) * (1 - rd);
    this.thigh[0].rotation.x = thighs[0];
    this.thigh[1].rotation.x = thighs[1];
    this.shin[0].rotation.x = knees[0];
    this.shin[1].rotation.x = knees[1];
    this.foot[0].rotation.x = -(thighs[0] + knees[0]) * 0.6 + 0.08;
    this.foot[1].rotation.x = -(thighs[1] + knees[1]) * 0.6 + 0.08;
    this.upperArm[0].rotation.x = arms[0];
    this.upperArm[1].rotation.x = arms[1];
    this.upperArm[0].rotation.z = armSpread;
    this.upperArm[1].rotation.z = -armSpread;
    this.foreArm[0].rotation.x = forearms;
    this.foreArm[1].rotation.x = forearms;

    this.pitchLean = damp(this.pitchLean, clamp(s.accel * 0.025, -0.15, 0.2) * (1 - rd), 6, dt);
    this.spine.rotation.x = spineLean + this.pitchLean;
    const targetBank = clamp(-s.turnRate * s.speed * 0.035, -0.3, 0.3) * (1 - rd);
    this.bank = damp(this.bank, targetBank, 8, dt);
    this.body.rotation.z = this.bank;

    if (this.skirt) {
      this.skirt.rotation.x = -sn * 0.06 * m;
      this.skirt.scale.x = 1 + Math.abs(sn) * 0.08 * m;
    }
    // Head stays level and nods slightly when talking
    this.head.rotation.x =
      -spineLean * 0.5 + (this.talkTimer > 0 ? Math.sin(this.time * 7) * 0.05 : 0);
    this.head.rotation.y = -this.chest.rotation.y * 0.6;
    this.combatPose(dt);
    this.realBody?.sync(this.root, this.hips);
  }

  /** Turn head towards a world point (NPCs looking at the player). */
  lookAt(world: THREE.Vector3, weight = 1) {
    const local = this.root.worldToLocal(world.clone());
    const yaw = clamp(Math.atan2(local.x, local.z), -1.1, 1.1);
    this.head.rotation.y = lerp(this.head.rotation.y, yaw, weight);
    this.realBody?.sync(this.root, this.hips);
  }

  setVisible(v: boolean) {
    this.root.visible = v;
  }

  /** Punch: wind-up → strike (hips + shoulders turn, step in) → recover. Alternates hands. */
  punch() {
    this.punchT = PUNCH_TIME;
    this.punchSide = 1 - this.punchSide;
  }

  /** Got hit: head snaps back, body staggers away from the blow. */
  hitReact(fromLeft = Math.random() < 0.5) {
    this.reactT = 0.45;
    this.reactSide = fromLeft ? 1 : -1;
    this.setEmotion('angry', 2.5);
  }

  /** Overarm throw (grenade). */
  throwArm() {
    this.throwT = 0.45;
  }

  /** Show/hide a pistol in the right hand. */
  setGun(on: boolean) {
    if (on && !this.gunMesh) {
      const g = new THREE.BoxGeometry(0.035, 0.11, 0.16);
      g.translate(0, -0.03, 0.05);
      const m = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.4, metalness: 0.7 });
      this.materials.push(m);
      this.gunMesh = new THREE.Mesh(g, m);
      this.gunMesh.position.set(0, -0.27, 0.02);
      this.foreArm[1].add(this.gunMesh);
    }
    if (this.gunMesh) this.gunMesh.visible = on;
  }

  private combatPose(dt: number) {
    const R = 1 as const;
    // Aiming: right arm straight out in front
    this.aimBlend = damp(this.aimBlend, this.aiming ? 1 : 0, 14, dt);
    const a = this.aimBlend;
    if (a > 0.01) {
      this.upperArm[R].rotation.x = lerp(this.upperArm[R].rotation.x, -1.5, a);
      this.upperArm[R].rotation.z = lerp(this.upperArm[R].rotation.z, 0.05, a);
      this.foreArm[R].rotation.x = lerp(this.foreArm[R].rotation.x, -0.05, a);
    }
    // Boxing guard: both fists up by the chin, elbows in
    this.guardBlend = damp(this.guardBlend, this.guard && !this.aiming ? 1 : 0, 10, dt);
    const gb = this.guardBlend;
    if (gb > 0.01) {
      for (const i of [0, 1] as const) {
        this.upperArm[i].rotation.x = lerp(this.upperArm[i].rotation.x, -0.95, gb);
        this.upperArm[i].rotation.z = lerp(this.upperArm[i].rotation.z, i === 0 ? 0.25 : -0.25, gb);
        this.foreArm[i].rotation.x = lerp(this.foreArm[i].rotation.x, -1.95, gb);
      }
    }
    if (this.punchT > 0) {
      this.punchT = Math.max(0, this.punchT - dt);
      const t = 1 - this.punchT / PUNCH_TIME;
      const i = this.punchSide === 0 ? 0 : 1;
      const turn = i === 0 ? 1 : -1;
      // 0–30 %: chamber (fist pulls back, shoulders turn away)
      // 30–55 %: strike (arm snaps straight, hips + shoulders drive through)
      // 55–100 %: recover to guard
      let armX: number;
      let foreX: number;
      let twist: number;
      let lean: number;
      if (t < 0.3) {
        const k = t / 0.3;
        armX = lerp(-0.9, -0.55, k);
        foreX = lerp(-1.9, -2.2, k);
        twist = -0.25 * k;
        lean = 0;
      } else if (t < 0.55) {
        const k = Math.sin(((t - 0.3) / 0.25) * Math.PI * 0.5);
        armX = lerp(-0.55, -1.6, k);
        foreX = lerp(-2.2, -0.08, k);
        twist = lerp(-0.25, 0.6, k);
        lean = 0.16 * k;
      } else {
        const k = (t - 0.55) / 0.45;
        const e = k * k * (3 - 2 * k);
        armX = lerp(-1.6, -0.95, e);
        foreX = lerp(-0.08, -1.9, e);
        twist = lerp(0.6, 0, e);
        lean = lerp(0.16, 0, e);
      }
      const ua = this.upperArm[i];
      const fa = this.foreArm[i];
      ua.rotation.x = armX;
      ua.rotation.z = turn * -0.12;
      fa.rotation.x = foreX;
      // Off hand stays up protecting the face
      const off = i === 0 ? 1 : 0;
      this.upperArm[off].rotation.x = lerp(this.upperArm[off].rotation.x, -0.95, 0.8);
      this.foreArm[off].rotation.x = lerp(this.foreArm[off].rotation.x, -1.95, 0.8);
      this.chest.rotation.y += turn * twist;
      this.hips.rotation.y += turn * twist * 0.5;
      this.spine.rotation.x += lean;
      this.head.rotation.y -= turn * twist * 0.5; // eyes stay on the target
    }
    if (this.reactT > 0) {
      this.reactT = Math.max(0, this.reactT - dt);
      const k = Math.sin((this.reactT / 0.45) * Math.PI);
      this.spine.rotation.x -= 0.32 * k;
      this.head.rotation.x -= 0.45 * k;
      this.head.rotation.z += this.reactSide * 0.25 * k;
      this.chest.rotation.z += this.reactSide * 0.18 * k;
      for (const j of [0, 1] as const) {
        this.upperArm[j].rotation.z += (j === 0 ? 0.5 : -0.5) * k;
        this.upperArm[j].rotation.x -= 0.4 * k;
      }
    }
    if (this.throwT > 0) {
      this.throwT = Math.max(0, this.throwT - dt);
      const t = 1 - this.throwT / 0.45;
      // Wind up behind the head, then whip forward
      const x = t < 0.45 ? lerp(0, -2.7, t / 0.45) : lerp(-2.7, -0.9, (t - 0.45) / 0.55);
      this.upperArm[R].rotation.x = x;
      this.foreArm[R].rotation.x = t < 0.45 ? -1.2 : -0.2;
    }
    this.handsUpBlend = damp(this.handsUpBlend, this.handsUp ? 1 : 0, 8, dt);
    const h = this.handsUpBlend;
    if (h > 0.01) {
      for (const i of [0, 1] as const) {
        const ua = this.upperArm[i];
        ua.rotation.x = lerp(ua.rotation.x, -2.9, h);
        ua.rotation.z = lerp(ua.rotation.z, i === 0 ? 0.35 : -0.35, h);
        this.foreArm[i].rotation.x = lerp(this.foreArm[i].rotation.x, -0.5, h);
      }
    }
  }

  dispose() {
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.skeleton.dispose();
    }
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.realBody?.dispose();
  }
}
