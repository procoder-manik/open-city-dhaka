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

const WALK_SPEED = 1.6;
const JOG_SPEED = 3.6;
const SPRINT_SPEED = 7.2;
const HIP_HEIGHT = 0.95;

const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
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

/** Limb joint: group at the pivot, visible part hanging below it. */
function limb(
  parent: THREE.Object3D,
  pos: [number, number, number],
  length: number,
  rTop: number,
  rBottom: number,
  mat: THREE.Material,
): THREE.Bone {
  const joint = new THREE.Bone();
  joint.position.set(...pos);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, length, 12, 1), mat);
  body.position.y = -length / 2;
  body.castShadow = true;
  joint.add(body);
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(rTop, 12, 8), mat);
  joint.add(capTop);
  const capBottom = new THREE.Mesh(new THREE.SphereGeometry(rBottom, 12, 8), mat);
  capBottom.position.y = -length;
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

    // ---- Torso ----
    const belly = look.belly ?? 0;
    this.spine = new THREE.Bone();
    this.spine.position.y = 0.05;
    this.hips.add(this.spine);
    const pelvis = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 12),
      look.top.kind === 'panjabi' ? topMat : bottomMat,
    );
    pelvis.scale.set(1.15, 0.7, 0.85);
    pelvis.castShadow = true;
    this.hips.add(pelvis);
    const abdomen = new THREE.Mesh(
      new THREE.SphereGeometry(0.155, 16, 12),
      look.top.kind === 'shirtOpen' ? underMat : topMat,
    );
    abdomen.position.y = 0.13;
    abdomen.scale.set(1.08 + belly * 0.15, 1.05, 0.78 + belly * 0.35);
    abdomen.castShadow = true;
    this.spine.add(abdomen);

    this.chest = new THREE.Bone();
    this.chest.position.y = 0.24;
    this.spine.add(this.chest);
    const torso = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 18, 14),
      look.top.kind === 'shirtOpen' ? underMat : topMat,
    );
    torso.position.y = 0.12;
    torso.scale.set(1.12, 1.0, 0.68);
    torso.castShadow = true;
    this.chest.add(torso);
    if (look.top.kind === 'shirtOpen') {
      // Open shirt: two front panels + back over the black tee
      for (const side of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, 0.03), topMat);
        panel.position.set(side * 0.13, 0.04, 0.13);
        panel.rotation.y = side * 0.35;
        panel.castShadow = true;
        this.chest.add(panel);
        const collar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.02), topMat);
        collar.position.set(side * 0.07, 0.29, 0.1);
        collar.rotation.z = side * 0.5;
        this.chest.add(collar);
      }
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.03), topMat);
      back.position.set(0, 0.06, -0.125);
      this.chest.add(back);
    }
    if (look.top.kind === 'panjabi') {
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.5, 14, 1, true), topMat);
      tail.position.y = -0.2;
      tail.material = topMat;
      this.hips.add(tail);
    }
    if (look.chain) {
      const chain = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.008, 6, 20), gold);
      chain.rotation.x = Math.PI / 2.4;
      chain.position.set(0, 0.25, 0.045);
      this.chest.add(chain);
    }

    // ---- Head & face ----
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.12, 12), skin);
    neck.position.y = 0.36;
    this.chest.add(neck);
    this.head = new THREE.Bone();
    this.head.position.y = 0.43;
    this.chest.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 18), skin);
    skull.scale.set(0.9, 1.1, 1.0);
    skull.position.y = 0.1;
    skull.castShadow = true;
    this.head.add(skull);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 10), skin);
    jaw.position.set(0, 0.035, 0.02);
    jaw.scale.set(0.95, 0.75, 1.0);
    this.head.add(jaw);
    for (const x of [-0.095, 0.095]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), skin);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.set(x, 0.1, 0);
      this.head.add(ear);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.045, 8), skin);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.085, 0.112);
    this.head.add(nose);

    // Eyes (white + iris) with eyelids for blinking
    for (const x of [-0.036, 0.036]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), white);
      eye.position.set(x, 0.112, 0.088);
      eye.scale.set(1.2, 0.8, 0.6);
      this.head.add(eye);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), dark);
      iris.position.set(x, 0.112, 0.097);
      this.head.add(iris);
      const lid = faceBone(
        this.head,
        [x, 0.124, 0.098],
        new THREE.BoxGeometry(0.04, 0.022, 0.012),
        skin,
      );
      lid.scale.y = 0.05;
      this.lids.push(lid);
      this.brows.push(
        faceBone(this.head, [x, 0.142, 0.096], new THREE.BoxGeometry(0.04, 0.008, 0.01), hair),
      );
    }
    // Mouth: lips + corners that lift for smiles
    this.mouth = faceBone(
      this.head,
      [0, 0.045, 0.1],
      new THREE.BoxGeometry(0.04, 0.008, 0.01),
      lip,
    );
    for (const x of [-0.022, 0.022]) {
      this.mouthCorners.push(
        faceBone(this.head, [x, 0.045, 0.097], new THREE.BoxGeometry(0.01, 0.007, 0.01), lip),
      );
    }
    if (look.mustache) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.012, 0.016), hair);
      m.position.set(0, 0.06, 0.104);
      this.head.add(m);
    }
    if (look.beard !== 'none') {
      const beardMat =
        look.beard === 'grey'
          ? mat(0xcfcac0, 0.7)
          : look.beard === 'stubble'
            ? mat(0x3a2b24, 0.9)
            : hair;
      const beard = new THREE.Mesh(
        new THREE.SphereGeometry(0.083, 16, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.4),
        beardMat,
      );
      beard.position.set(0, 0.06, 0.016);
      beard.scale.set(1.0, look.beard === 'full' || look.beard === 'grey' ? 1.25 : 1.0, 1.05);
      this.head.add(beard);
    }
    // Hair
    if (look.hairStyle !== 'bald') {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
        hair,
      );
      cap.scale.set(0.93, 1.0, 1.04);
      cap.position.set(0, 0.12, -0.006);
      this.head.add(cap);
      if (look.hairStyle === 'quiff') {
        const quiff = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), hair);
        quiff.scale.set(1.3, 0.55, 1.0);
        quiff.position.set(0.0, 0.21, 0.05);
        quiff.rotation.x = -0.3;
        this.head.add(quiff);
      }
      if (look.hairStyle === 'long') {
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.05), hair);
        back.position.set(0, 0.0, -0.09);
        this.head.add(back);
      }
    }
    if (look.cap != null) {
      const capMat = mat(look.cap, 0.8);
      const hat = new THREE.Mesh(
        new THREE.SphereGeometry(0.112, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
        capMat,
      );
      hat.position.set(0, 0.13, -0.004);
      this.head.add(hat);
      if (look === NPC_LOOKS.foreigner) {
        const brim = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.01, 0.1), capMat);
        brim.position.set(0, 0.165, 0.12);
        this.head.add(brim);
      }
    }
    if (look.sunglasses) {
      for (const x of [-0.036, 0.036]) {
        const lens = new THREE.Mesh(
          new THREE.BoxGeometry(0.048, 0.03, 0.006),
          mat(0x050608, 0.05, { metalness: 0.8 }),
        );
        lens.position.set(x, 0.113, 0.104);
        this.head.add(lens);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.005, 0.005), gold);
      bridge.position.set(0, 0.127, 0.104);
      this.head.add(bridge);
    }

    // ---- Arms ----
    const sleeveMat = look.top.kind === 'vest' ? skin : topMat;
    const armX = 0.215;
    this.upperArm = [
      limb(this.chest, [armX, 0.27, 0], 0.29, 0.052, 0.045, sleeveMat),
      limb(this.chest, [-armX, 0.27, 0], 0.29, 0.052, 0.045, sleeveMat),
    ];
    const longSleeve = look.top.kind === 'panjabi';
    this.foreArm = [
      limb(this.upperArm[0], [0, -0.29, 0], 0.26, 0.042, 0.034, longSleeve ? topMat : skin),
      limb(this.upperArm[1], [0, -0.29, 0], 0.26, 0.042, 0.034, longSleeve ? topMat : skin),
    ];
    for (const fa of this.foreArm) {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), skin);
      hand.scale.set(0.8, 1.15, 0.6);
      hand.position.y = -0.3;
      fa.add(hand);
    }

    // ---- Legs ----
    const legMat = look.bottom.kind === 'lungi' || look.bottom.kind === 'shorts' ? skin : bottomMat;
    const legX = 0.095;
    this.thigh = [
      limb(
        this.hips,
        [legX, 0, 0],
        0.44,
        look.bottom.kind === 'shorts' ? 0.07 : 0.074,
        0.058,
        look.bottom.kind === 'shorts' ? bottomMat : legMat,
      ),
      limb(
        this.hips,
        [-legX, 0, 0],
        0.44,
        look.bottom.kind === 'shorts' ? 0.07 : 0.074,
        0.058,
        look.bottom.kind === 'shorts' ? bottomMat : legMat,
      ),
    ];
    this.shin = [
      limb(this.thigh[0], [0, -0.44, 0], 0.43, 0.055, 0.042, legMat),
      limb(this.thigh[1], [0, -0.44, 0], 0.43, 0.055, 0.042, legMat),
    ];
    this.foot = [new THREE.Bone(), new THREE.Bone()];
    this.foot.forEach((f, i) => {
      f.position.y = -0.43;
      this.shin[i]!.add(f);
      if (look.shoes.kind === 'sneakers') {
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.26), shoeMat);
        shoe.position.set(0, -0.03, 0.045);
        shoe.castShadow = true;
        f.add(shoe);
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.02, 0.265), white);
        sole.position.set(0, -0.07, 0.045);
        f.add(sole);
      } else {
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.24), shoeMat);
        sole.position.set(0, -0.05, 0.05);
        f.add(sole);
        const toes = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.04, 0.1), skin);
        toes.position.set(0, -0.02, 0.1);
        f.add(toes);
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
  }

  /** Turn head towards a world point (NPCs looking at the player). */
  lookAt(world: THREE.Vector3, weight = 1) {
    const local = this.root.worldToLocal(world.clone());
    const yaw = clamp(Math.atan2(local.x, local.z), -1.1, 1.1);
    this.head.rotation.y = lerp(this.head.rotation.y, yaw, weight);
  }

  setVisible(v: boolean) {
    this.root.visible = v;
  }

  dispose() {
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.skeleton.dispose();
    }
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}
