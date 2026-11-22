import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as THREE_TSL from 'three/tsl';

/**
 * Realistic glTF character body driven by the procedural animation skeleton.
 *
 * The procedural rig (Humanoid) keeps computing every pose — gait, punches, guard, hit
 * reactions, riding — on its own invisible bones. Each frame we copy each driver bone's
 * rotation *change from its rest pose* onto the matching glTF bone (in character space),
 * after a one-off rest correction (the glTF arms rest in an A/T pose, ours hang down).
 * That way any rigged humanoid with the usual bone names can replace the procedural body.
 */

/** Driver (procedural) bone key → glTF bone name. */
export type DriverBones = Record<string, THREE.Object3D>;

export const BONE_MAP: Record<string, string> = {
  hips: 'Hips',
  spine: 'Spine02',
  chest: 'Spine',
  head: 'Head',
  thighL: 'LeftUpLeg',
  shinL: 'LeftLeg',
  footL: 'LeftFoot',
  thighR: 'RightUpLeg',
  shinR: 'RightLeg',
  footR: 'RightFoot',
  armL: 'LeftArm',
  foreL: 'LeftForeArm',
  armR: 'RightArm',
  foreR: 'RightForeArm',
};
/** Limbs whose rest direction is matched to the driver's (bone → child). */
const LIMB_CHILD: Record<string, string> = {
  thighL: 'LeftLeg',
  shinL: 'LeftFoot',
  thighR: 'RightLeg',
  shinR: 'RightFoot',
  armL: 'LeftForeArm',
  foreL: 'LeftHand',
  armR: 'RightForeArm',
  foreR: 'RightHand',
};

interface Loaded {
  scene: THREE.Group;
  hipsY: number;
}

let cache: Loaded | null = null;
let loading: Promise<Loaded | null> | null = null;

/** Load (once) the shared character model. Resolves null if it can't be loaded. */
export function preloadCharacterModel(url: string): Promise<Loaded | null> {
  loading ??= new Promise<Loaded | null>((resolve) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      url,
      (gltf) => {
        const scene = gltf.scene;
        scene.updateMatrixWorld(true);
        const hips = scene.getObjectByName('Hips');
        const hipsY = hips ? hips.getWorldPosition(new THREE.Vector3()).y : 1;
        cache = { scene, hipsY };
        resolve(cache);
      },
      undefined,
      (err) => {
        console.warn('[character] model failed to load, using procedural body:', err);
        resolve(null);
      },
    );
  });
  return loading;
}

export function characterModelReady(): boolean {
  return cache !== null;
}

export interface BodyTint {
  /** Multiplies skin pixels (warmer/darker South Asian tone). */
  skin: THREE.Color;
  /** Replaces the grey T-shirt colour. */
  shirt: THREE.Color;
  /** Trousers colour (painted over the legs). */
  pants: THREE.Color;
  shoes: THREE.Color;
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _rootInv = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

interface Pair {
  key: string;
  driver: THREE.Object3D;
  bone: THREE.Bone;
  /** Driver rest rotation (character space), inverted. */
  driverRestInv: THREE.Quaternion;
  /** glTF rest rotation (character space) after the rest-direction correction. */
  boneRest: THREE.Quaternion;
}

export class GltfBody {
  readonly object: THREE.Object3D;
  readonly mesh: THREE.SkinnedMesh;
  private pairs: Pair[] = [];
  private hips: THREE.Bone;
  private hipsRest = new THREE.Vector3();
  private driverHipsRest = new THREE.Vector3();
  private material: THREE.MeshStandardNodeMaterial;

  /**
   * @param root the character root (drivers + body live under it)
   * @param drivers procedural bones by BONE_MAP key, in their rest pose right now
   * @param hipHeight driver hip height (m) — the body is scaled to match it
   */
  constructor(root: THREE.Object3D, drivers: DriverBones, hipHeight: number, tint: BodyTint) {
    if (!cache) throw new Error('character model not loaded');
    this.object = SkeletonUtils.clone(cache.scene);
    this.object.scale.multiplyScalar(hipHeight / cache.hipsY);
    root.add(this.object);

    let mesh: THREE.SkinnedMesh | null = null;
    this.object.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh;
    });
    if (!mesh) throw new Error('character model has no skinned mesh');
    this.mesh = mesh;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.material = tintedMaterial(this.mesh.material as THREE.MeshStandardMaterial, tint);
    this.mesh.material = this.material;

    // Rest poses in character (root) space
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(_rootInv).invert();
    const rel = (o: THREE.Object3D, out: THREE.Quaternion) =>
      out.copy(_rootInv).multiply(o.getWorldQuaternion(_q2));
    const relPos = (o: THREE.Object3D, out: THREE.Vector3) =>
      root.worldToLocal(o.getWorldPosition(out));

    const byName = (n: string) => this.object.getObjectByName(n) as THREE.Bone | undefined;
    this.hips = byName('Hips')!;
    for (const [key, name] of Object.entries(BONE_MAP)) {
      const bone = byName(name);
      const driver = drivers[key];
      if (!bone || !driver) continue;
      const driverRest = rel(driver, new THREE.Quaternion());
      const boneRest = rel(bone, new THREE.Quaternion());
      const childName = LIMB_CHILD[key];
      if (childName) {
        // Turn the glTF limb so it points where the driver limb points at rest (down)
        const child = byName(childName);
        if (child) {
          const gDir = relPos(child, new THREE.Vector3()).sub(relPos(bone, _v)).normalize();
          const dDir = new THREE.Vector3(0, -1, 0).applyQuaternion(driverRest);
          boneRest.premultiply(new THREE.Quaternion().setFromUnitVectors(gDir, dDir));
        }
      }
      this.pairs.push({ key, driver, bone, driverRestInv: driverRest.invert(), boneRest });
    }
    this.hipsRest.copy(this.hips.position);
    this.driverHipsRest.copy(relPos(drivers.hips!, new THREE.Vector3()));
  }

  /** Copy the driver pose onto the realistic body. Call after the drivers are posed. */
  sync(root: THREE.Object3D, driverHips: THREE.Object3D) {
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(_rootInv);
    const rootQ = _rootInv.clone();
    _rootInv.invert();
    // Hips follow the driver's bob / crouch (translation delta in character space)
    const now = root.worldToLocal(driverHips.getWorldPosition(_v));
    const delta = now.sub(this.driverHipsRest);
    const parent = this.hips.parent!;
    const restWorld = parent.localToWorld(_v2.copy(this.hipsRest));
    const restLocalToRoot = root.worldToLocal(restWorld);
    restLocalToRoot.add(delta);
    this.hips.position.copy(parent.worldToLocal(root.localToWorld(restLocalToRoot)));
    // Rotations, parents before children (BONE_MAP order)
    for (const p of this.pairs) {
      // driver delta in character space
      _q.copy(_rootInv).multiply(p.driver.getWorldQuaternion(_q2)).multiply(p.driverRestInv);
      // desired bone world rotation = root * delta * boneRest
      const desired = _q2.copy(rootQ).multiply(_q).multiply(p.boneRest);
      const parentWorld = p.bone.parent!.getWorldQuaternion(new THREE.Quaternion());
      p.bone.quaternion.copy(parentWorld.invert().multiply(desired));
      p.bone.updateMatrixWorld(true);
    }
  }

  dispose() {
    this.object.parent?.remove(this.object);
    this.material.dispose();
  }
}

/**
 * Clone the model's material with a dressing shader. The optimiser baked a `_REGION`
 * attribute (x = legs, y = feet, z = torso) from bind-pose height; with it we paint long
 * trousers over the legs, shoes on the feet and the shirt colour on the torso (keeping the
 * fabric's shading), and warm the skin to the character's tone.
 */
function tintedMaterial(
  src: THREE.MeshStandardMaterial,
  tint: BodyTint,
): THREE.MeshStandardNodeMaterial {
  const T = THREE_TSL;
  const m = new THREE.MeshStandardNodeMaterial();
  m.copy(src as unknown as THREE.MeshStandardNodeMaterial);
  const map = src.map;
  if (!map) return m;
  const c = T.texture(map).rgb;
  const maxc = T.max(c.r, T.max(c.g, c.b));
  const minc = T.min(c.r, T.min(c.g, c.b));
  const sat = maxc.sub(minc).div(maxc.add(0.001));
  const lum = c.dot(T.vec3(0.299, 0.587, 0.114));
  // Skin: warm (red > green > blue), clearly saturated, not too dark
  const skin = T.smoothstep(0.06, 0.13, c.r.sub(c.b))
    .mul(T.smoothstep(0.22, 0.3, sat)) // warm-grey cotton is ~0.05–0.18, skin ~0.3+
    .mul(T.step(c.g, c.r))
    .mul(T.smoothstep(0.25, 0.35, maxc));
  const region = T.attribute('_region', 'vec3');
  const legs = region.x;
  const feet = region.y;
  const torso = region.z.mul(T.float(1).sub(skin));
  // Fabric keeps the texture's folds/shading (relative brightness)
  // Gentle: the source cotton is blotchy, so keep only a hint of its light/dark variation
  const fold = lum.sub(0.55).mul(0.55).add(0.92).clamp(0.72, 1.06);
  const skinCol = c.mul(T.uniform(tint.skin));
  const shirtCol = T.uniform(tint.shirt).mul(fold);
  const pantsCol = T.uniform(tint.pants).mul(fold.mul(0.9));
  const shoeCol = T.uniform(tint.shoes).mul(fold.mul(0.85));
  let out = T.mix(c, skinCol, skin);
  out = T.mix(out, shirtCol, torso);
  out = T.mix(out, pantsCol, legs);
  out = T.mix(out, shoeCol, feet);
  m.colorNode = out;
  return m;
}
