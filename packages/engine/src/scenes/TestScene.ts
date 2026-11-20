import * as THREE from 'three/webgpu';
import type { QualityPreset } from '@game/shared';
import type { InputManager } from '../input/InputManager';
import { FLOATS_PER_BODY, type BodyDesc, type CharacterInput } from '../physics/protocol';

const PLAYER_ID = 1;
const WALK_SPEED = 3.6;
const SPRINT_SPEED = 7.5;
const CAMERA_DISTANCE = 5.5;
const PITCH_MIN = -0.35;
const PITCH_MAX = 1.15;

/** Warm "Golden Dhaka" palette for the placeholder street. */
const BUILDING_COLORS = [
  0xe8c39e, 0xd9a07a, 0xc9d6c4, 0xf0e2c0, 0xb7c9d8, 0xe6b8a2, 0xd8d0b8, 0xa9bfa3,
];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Phase 0 test scene: a lit street block with buildings, physics crates and a
 * controllable capsule character with a third-person camera. Replaced by real
 * content in Phase 1.
 */
export class TestScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly bodies: BodyDesc[] = [];
  private meshes = new Map<number, THREE.Object3D>();
  private player!: THREE.Group;
  private yaw = 0.6;
  private pitch = 0.32;
  private camTarget = new THREE.Vector3(0, 1.4, 0);
  private velocity = new THREE.Vector2();
  private facing = 0;
  private nextId = 2;

  constructor(private readonly preset: QualityPreset) {
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 600);
    this.buildEnvironment();
    this.buildStreet();
    this.buildCrates();
    this.buildPlayer();
  }

  private addBody(desc: Omit<BodyDesc, 'id'>, mesh: THREE.Object3D, id = this.nextId++): number {
    this.bodies.push({ ...desc, id });
    mesh.position.set(...desc.position);
    this.meshes.set(id, mesh);
    this.scene.add(mesh);
    return id;
  }

  private buildEnvironment() {
    const sky = new THREE.Color(0xf3c08a);
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(0xe9b98a, 40, 220);

    this.scene.add(new THREE.HemisphereLight(0xffe2b8, 0x3d5560, 1.4));

    const sun = new THREE.DirectionalLight(0xffc690, 3.2);
    sun.position.set(-40, 35, 25);
    sun.castShadow = this.preset.shadows;
    sun.shadow.mapSize.set(this.preset.shadowMapSize, this.preset.shadowMapSize);
    const c = sun.shadow.camera;
    c.left = -40;
    c.right = 40;
    c.top = 40;
    c.bottom = -40;
    c.near = 1;
    c.far = 150;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun, sun.target);
  }

  private buildStreet() {
    // Ground (physics: one big fixed box)
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(400, 1, 400),
      new THREE.MeshStandardMaterial({ color: 0x8c8a7e, roughness: 0.95 }),
    );
    ground.receiveShadow = true;
    this.addBody(
      {
        shape: { kind: 'box', halfExtents: [200, 0.5, 200] },
        position: [0, -0.5, 0],
        type: 'fixed',
      },
      ground,
    );

    // Road with lane markings
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 400),
      new THREE.MeshStandardMaterial({ color: 0x3b3b3d, roughness: 0.85 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    road.receiveShadow = true;
    this.scene.add(road);

    const stripeGeo = new THREE.PlaneGeometry(0.25, 3);
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 });
    const stripes = new THREE.InstancedMesh(stripeGeo, stripeMat, 60);
    const m = new THREE.Matrix4();
    const rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    for (let i = 0; i < 60; i++) {
      m.makeTranslation(0, 0.02, -180 + i * 6).multiply(rot);
      stripes.setMatrixAt(i, m);
    }
    this.scene.add(stripes);

    // Footpaths
    for (const side of [-1, 1]) {
      const path = new THREE.Mesh(
        new THREE.BoxGeometry(3, 0.2, 400),
        new THREE.MeshStandardMaterial({ color: 0xa79f8f, roughness: 0.9 }),
      );
      path.receiveShadow = true;
      this.addBody(
        {
          shape: { kind: 'box', halfExtents: [1.5, 0.1, 200] },
          position: [side * 7.5, 0.1, 0],
          type: 'fixed',
        },
        path,
      );
    }

    // Buildings along both sides (Dhaka-style: 4–10 floors, tightly packed)
    const rand = seededRandom(42);
    for (const side of [-1, 1]) {
      let z = -120;
      while (z < 120) {
        const width = 7 + rand() * 6;
        const depth = 10 + rand() * 6;
        const floors = 4 + Math.floor(rand() * 7);
        const height = floors * 3.1;
        const color = BUILDING_COLORS[Math.floor(rand() * BUILDING_COLORS.length)]!;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(depth, height, width),
          new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.addBody(
          {
            shape: { kind: 'box', halfExtents: [depth / 2, height / 2, width / 2] },
            position: [side * (9 + depth / 2), height / 2, z + width / 2],
            type: 'fixed',
          },
          mesh,
        );
        z += width + 0.4;
      }
    }
  }

  private buildCrates() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xc0813f, roughness: 0.8 });
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < 3 - layer; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.addBody(
          {
            shape: { kind: 'box', halfExtents: [0.5, 0.5, 0.5] },
            position: [-3 + i * 1.05 + layer * 0.5, 0.5 + layer * 1.02 + 2, -8],
            type: 'dynamic',
            mass: 8,
          },
          mesh,
        );
      }
    }
    // A ball to kick around
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xd63a2f, roughness: 0.5 }),
    );
    ball.castShadow = true;
    this.addBody(
      {
        shape: { kind: 'sphere', radius: 0.35 },
        position: [2, 3, -4],
        type: 'dynamic',
        mass: 1,
        restitution: 0.5,
      },
      ball,
    );
  }

  private buildPlayer() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 1.0, 6, 14),
      new THREE.MeshStandardMaterial({ color: 0x2f6f4f, roughness: 0.7 }),
    );
    body.castShadow = true;
    g.add(body);
    // "Face" marker so facing direction is visible
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.12, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.6 }),
    );
    nose.position.set(0, 0.45, 0.32);
    g.add(nose);
    this.player = g;
    this.addBody(
      {
        shape: { kind: 'capsule', halfHeight: 0.5, radius: 0.35 },
        position: [0, 1.2, 0],
        type: 'dynamic',
        mass: 70,
        friction: 0,
        lockRotations: true,
      },
      g,
      PLAYER_ID,
    );
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Read input → desired character velocity for physics. */
  characterInputs(input: InputManager): CharacterInput[] {
    this.yaw -= input.look.x;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.look.y, PITCH_MIN, PITCH_MAX);

    const speed = input.isDown('sprint') ? SPRINT_SPEED : WALK_SPEED;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin) on the XZ plane
    const vx = (cos * input.move.x - sin * input.move.y) * speed;
    const vz = (-sin * input.move.x - cos * input.move.y) * speed;
    this.velocity.set(vx, vz);
    return [{ bodyId: PLAYER_ID, vx, vz, jump: input.pressed('jump') }];
  }

  applyTransforms(t: Float32Array) {
    for (let o = 0; o < t.length; o += FLOATS_PER_BODY) {
      const mesh = this.meshes.get(t[o]!);
      if (!mesh || mesh === this.player) {
        if (mesh) mesh.position.set(t[o + 1]!, t[o + 2]!, t[o + 3]!);
        continue;
      }
      mesh.position.set(t[o + 1]!, t[o + 2]!, t[o + 3]!);
      mesh.quaternion.set(t[o + 4]!, t[o + 5]!, t[o + 6]!, t[o + 7]!);
    }
  }

  /** Smooth facing + third-person camera follow. */
  updateVisuals(dt: number) {
    if (this.velocity.lengthSq() > 0.05) {
      const targetFacing = Math.atan2(this.velocity.x, this.velocity.y);
      let diff = targetFacing - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * Math.min(1, dt * 12);
      this.player.rotation.y = this.facing;
    }

    const p = this.player.position;
    const follow = 1 - Math.exp(-dt * 10);
    this.camTarget.x += (p.x - this.camTarget.x) * follow;
    this.camTarget.y += (p.y + 0.9 - this.camTarget.y) * follow;
    this.camTarget.z += (p.z - this.camTarget.z) * follow;

    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.camTarget.x + Math.sin(this.yaw) * cp * CAMERA_DISTANCE,
      this.camTarget.y + Math.sin(this.pitch) * CAMERA_DISTANCE,
      this.camTarget.z + Math.cos(this.yaw) * cp * CAMERA_DISTANCE,
    );
    if (this.camera.position.y < 0.3) this.camera.position.y = 0.3;
    this.camera.lookAt(this.camTarget);
  }

  debugInfo() {
    const r = (v: THREE.Vector3) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
    return {
      player: r(this.player.position),
      camera: r(this.camera.position),
      camTarget: r(this.camTarget),
      yaw: +this.yaw.toFixed(3),
      pitch: +this.pitch.toFixed(3),
      velocity: [+this.velocity.x.toFixed(2), +this.velocity.y.toFixed(2)],
    };
  }

  dispose() {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }
}
