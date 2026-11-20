import * as THREE from 'three/webgpu';
import { dialogue, getVehicleDef } from '@game/content';
import {
  DEFAULT_IDENTITY,
  fillHero,
  type HeroIdentity,
  type QualityPreset,
  type VehicleDef,
} from '@game/shared';
import { Humanoid } from '../actors/Humanoid';
import { Npc, TALK_LABELS, defaultNpcs, type TalkOption } from '../actors/Npc';
import { PedestrianSystem } from '../actors/PedestrianSystem';
import { TRAFFIC_KINDS, TrafficSystem, type TrafficCar, type TrafficObstacle } from '../traffic/TrafficSystem';
import { RoadGraph } from '../world/city/RoadGraph';
import { seededRandom } from '../world/random';
import type { AudioEngine } from '../audio/AudioEngine';
import type { VoicePlayer } from '../audio/VoicePlayer';
import { CameraRig } from '../camera/CameraRig';
import {
  bribeCost,
  commitCrime,
  headlineFor,
  newCrimeState,
  payBribe,
  redeemGoodDeeds,
  stars,
  tickCrime,
  totalCrimes,
  type CrimeKind,
} from '../gameplay/CrimeSystem';
import { WantedBoards } from '../world/WantedBoards';
import type { CityBundle } from '../world/city/CityData';
import { CityWorld } from '../world/city/CityWorld';
import { DialogueSystem, type Subtitle } from '../dialogue/DialogueSystem';
import type { InputManager } from '../input/InputManager';
import {
  FLOATS_PER_BODY,
  FLOATS_PER_WHEEL,
  type BodyDesc,
  type CharacterInput,
  type KinematicInput,
  type PhysicsFrame,
  type VehicleBodyDesc,
  type VehicleInput,
} from '../physics/protocol';
import {
  applyImpact,
  burnFuel,
  enginePower,
  impactZone,
  newCondition,
  totalDamage,
  type DamageZone,
  type VehicleCondition,
} from '../vehicles/condition';
import { computeVehicleControls, parkedControls } from '../vehicles/controls';
import { VehicleVisual, type WheelState } from '../vehicles/VehicleVisual';
import { Environment } from '../world/Environment';
import { Particles } from '../world/Particles';
import { STREET, buildStreetBlock, type StreetResult } from '../world/StreetBlock';

const PLAYER_ID = 1;
const BALL_ID = 50;
const VEHICLE_ID_BASE = 10;
const NPC_ID_BASE = 100;
const TRAFFIC_ID_BASE = 400;
const STASH_ID = 990;
const STATIC_ID_BASE = 1000;
/** Hidden platform where spare (carjack) vehicles wait. */
const STASH_Y = -200;

const CAPSULE_HALF = 0.5;
const CAPSULE_RADIUS = 0.32;
const CAPSULE_CENTER = CAPSULE_HALF + CAPSULE_RADIUS; // feet → capsule centre
/** Real-world speeds (m/s): walk, jog, sprint. */
const WALK_SPEED = 1.6;
const JOG_SPEED = 3.6;
const SPRINT_SPEED = 7.2;
const GROUND_ACCEL = 10;
const ENTER_RANGE = 3.6;
const TALK_RANGE = 2.6;
const MAX_EXIT_SPEED = 14;

const CARJACK_NAMES: Record<string, string> = { car: 'প্রাইভেট কার', cng: 'সিএনজি', bike: 'মোটরসাইকেল' };

const damp = (current: number, target: number, rate: number, dt: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-rate * dt));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface SaveData {
  v: 1;
  taka: number;
  notoriety: number;
  publicLove: number;
  hour: number;
  crime: { heat: number; record: Record<string, number> };
}

export interface HudState {
  mode: 'foot' | 'vehicle';
  prompt: string | null;
  vehicleName: string | null;
  speedKmh: number;
  hour: number;
  taka: number;
  notoriety: number;
  publicLove: number;
  subtitle: Subtitle | null;
  talk: { name: string; options: Array<{ id: TalkOption; label: string }> } | null;
  fuel: number;
  damage: number;
  damageZones: Record<DamageZone, number>;
  engineDead: boolean;
  /** Player's hero, e.g. "গ্রেট থিফ মোস্তফা". */
  heroFull: string;
  wanted: number;
  crimes: number;
  bribeCost: number;
  /** Latest news headline (shown as a toast); id changes per headline. */
  headline: { id: number; text: string } | null;
  /** Player position + camera heading (minimap). */
  pos: [number, number];
  heading: number;
  /** Real-map area name shown on the HUD. */
  area: string;
}

/** Physics position/velocity with extrapolation + smoothing for jitter-free rendering. */
class SmoothedBody {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly quat = new THREE.Quaternion();
  readonly renderPos = new THREE.Vector3();
  readonly renderQuat = new THREE.Quaternion();
  grounded = false;
  private age = 0;
  private initialized = false;

  set(t: Float32Array, o: number) {
    this.pos.set(t[o + 1]!, t[o + 2]!, t[o + 3]!);
    this.quat.set(t[o + 4]!, t[o + 5]!, t[o + 6]!, t[o + 7]!);
    this.grounded = t[o + 8]! > 0.5;
    this.vel.set(t[o + 9]!, t[o + 10]!, t[o + 11]!);
    this.age = 0;
    if (!this.initialized) {
      this.renderPos.copy(this.pos);
      this.renderQuat.copy(this.quat);
      this.initialized = true;
    }
  }

  snap(p: THREE.Vector3) {
    this.pos.copy(p);
    this.renderPos.copy(p);
    this.vel.set(0, 0, 0);
  }

  update(dt: number) {
    this.age = Math.min(this.age + dt, 0.1);
    const k = 1 - Math.exp(-30 * dt);
    this.renderPos.x += (this.pos.x + this.vel.x * this.age - this.renderPos.x) * k;
    this.renderPos.y += (this.pos.y + this.vel.y * this.age - this.renderPos.y) * k;
    this.renderPos.z += (this.pos.z + this.vel.z * this.age - this.renderPos.z) * k;
    this.renderQuat.slerp(this.quat, k);
  }
}

interface VehicleEntity {
  id: number;
  def: VehicleDef;
  visual: VehicleVisual;
  body: SmoothedBody;
  speed: number;
  wheels: WheelState[];
  steer: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  cond: VehicleCondition;
  stolen: boolean;
  prevVel: THREE.Vector3;
  hasPrev: boolean;
  fxTimer: number;
  /** Spare vehicle used for carjacks (lives on the hidden stash until needed). */
  spare: boolean;
  /** Pending teleport: ignore stale physics frames until the body arrives. */
  tp: { x: number; y: number; z: number; yaw: number; sent: boolean; frames: number } | null;
}

/**
 * Vertical slice: Tajmahal Road block, Mostofa on foot, drivable car/CNG/bike with
 * fuel & damage, talking NPCs (greet/threaten/snatch/order/grab), sounds, dust & smoke.
 */
export class SliceScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly bodies: BodyDesc[] = [];
  readonly vehicleBodies: VehicleBodyDesc[] = [];
  readonly env: Environment;
  private street: StreetResult;
  private rig: CameraRig;
  private hero = new Humanoid();
  private player = new SmoothedBody();
  private ball = new SmoothedBody();
  private ballMesh: THREE.Mesh;
  private vehicles: VehicleEntity[] = [];
  private npcs: Npc[] = [];
  private particles: Particles;
  private dialogue: DialogueSystem;
  private driving: VehicleEntity | null = null;
  private moveVel = new THREE.Vector2();
  private facing = 0;
  private prevFacing = 0;
  private prevSpeed = 0;
  private accel = 0;
  private wasGrounded = true;
  private lastVy = 0;
  private pendingTeleport: [number, number, number] | null = null;
  private nearest: VehicleEntity | null = null;
  private talkTarget: Npc | null = null;
  private crashBarkCooldown = 0;
  private hornOn = false;
  private hud: HudState = {
    mode: 'foot',
    prompt: null,
    vehicleName: null,
    speedKmh: 0,
    hour: 17,
    taka: 120,
    notoriety: 0,
    publicLove: 0,
    subtitle: null,
    talk: null,
    fuel: 1,
    damage: 0,
    damageZones: { front: 0, rear: 0, left: 0, right: 0 },
    engineDead: false,
    heroFull: '',
    wanted: 0,
    crimes: 0,
    bribeCost: 0,
    headline: null,
    pos: [0, 0],
    heading: 0,
    area: 'তাজমহল রোড, মোহাম্মদপুর',
  };
  private city: CityWorld | null = null;
  private graph: RoadGraph | null = null;
  private traffic: TrafficSystem | null = null;
  private peds: PedestrianSystem | null = null;
  private carjackCar: TrafficCar | null = null;
  private driverBarkCooldown = 0;
  private cityVersion = -1;
  private identity: HeroIdentity = { ...DEFAULT_IDENTITY };
  private crime = newCrimeState();
  private boards: WantedBoards;
  private headlineId = 0;
  private recognizeCooldown = 0;
  private hudTimer = 0;
  private hudDirty = true;

  constructor(
    private readonly preset: QualityPreset,
    private readonly onHud: (s: HudState) => void,
    private readonly audio: AudioEngine | null = null,
    private readonly voice: VoicePlayer | null = null,
    cityBundle: CityBundle | null = null,
  ) {
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 900);
    this.env = new Environment(this.scene, preset, 17.2);

    this.street = buildStreetBlock(preset, 7, { cityMode: !!cityBundle });
    this.scene.add(this.street.group);
    this.street.bodies.forEach((b, i) => this.bodies.push({ ...b, id: STATIC_ID_BASE + i }));
    if (cityBundle) {
      // The real Mohammadpur around the hand-built Tajmahal Road block
      this.city = new CityWorld(cityBundle, preset, this.street.materials);
      this.scene.add(this.city.group);
      const base = STATIC_ID_BASE + this.street.bodies.length;
      this.city.physicsBodies().forEach((b, i) => this.bodies.push({ ...b, id: base + i }));
      if (cityBundle.roads?.length) {
        this.graph = new RoadGraph(cityBundle.roads, 1);
        this.traffic = new TrafficSystem(this.graph, preset, seededRandom(4242), TRAFFIC_ID_BASE);
        this.scene.add(this.traffic.group);
        this.bodies.push(...this.traffic.physicsBodies());
        this.traffic.onHonk = (c) => this.onTrafficHonk(c);
        this.peds = new PedestrianSystem(this.graph, preset, seededRandom(777));
        this.scene.add(this.peds.group);
      }
    }
    // Hidden stash platform for spare vehicles
    this.bodies.push({
      id: STASH_ID,
      shape: { kind: 'box', halfExtents: [30, 0.5, 10] },
      position: [0, STASH_Y - 0.5, 0],
      type: 'fixed',
    });

    this.particles = new Particles(preset.npcDensity < 0.5 ? 120 : 220);
    this.scene.add(this.particles.mesh);

    this.dialogue = new DialogueSystem(
      dialogue,
      (sub) => {
        this.hud.subtitle = sub;
        this.hudDirty = true;
      },
      (line, text) => this.voice?.speak(line, text),
      (t) => fillHero(t, this.identity),
      (sp) => (sp === 'hero' ? this.identity.name : undefined),
    );
    this.hud.heroFull = fillHero('{hero}', this.identity);

    this.boards = new WantedBoards();
    this.scene.add(this.boards.group);

    // Player
    const spawn = this.street.points.spawn!;
    this.bodies.push({
      id: PLAYER_ID,
      shape: { kind: 'capsule', halfHeight: CAPSULE_HALF, radius: CAPSULE_RADIUS },
      position: spawn,
      type: 'dynamic',
      mass: 75,
      friction: 0,
      lockRotations: true,
    });
    this.player.snap(new THREE.Vector3(...spawn));
    this.facing = Math.PI;
    this.hero.root.rotation.y = this.facing;
    this.hero.onFootstep = (s) => this.audio?.footstep(s);
    this.scene.add(this.hero.root);

    // NPCs (fixed colliders so you bump into them)
    defaultNpcs(STREET.roadHalf, STREET.footWidth, STREET.curbHeight).forEach((def, i) => {
      const npc = new Npc(def);
      if (!preset.shadows || preset.npcDensity < 1) npc.humanoid.setCastShadow(false);
      this.npcs.push(npc);
      this.scene.add(npc.humanoid.root);
      this.bodies.push({
        id: NPC_ID_BASE + i,
        shape: { kind: 'box', halfExtents: [0.22, 0.85, 0.22] },
        position: [def.position[0], def.position[1] + 0.85, def.position[2]],
        type: 'fixed',
      });
    });

    // Football
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 }),
    );
    this.ballMesh.castShadow = true;
    this.scene.add(this.ballMesh);
    const ballPos: [number, number, number] = [spawn[0] - 0.6, 0.6, spawn[2] - 3];
    this.bodies.push({
      id: BALL_ID,
      shape: { kind: 'sphere', radius: 0.11 },
      position: ballPos,
      type: 'dynamic',
      mass: 0.45,
      restitution: 0.6,
    });
    this.ball.snap(new THREE.Vector3(...ballPos));

    // Vehicles (parked on the left-hand carriageway, facing +Z)
    const parked: Array<[string, [number, number, number], boolean]> = [
      ['car-sedan', this.street.points.car!, false],
      ['cng-auto', this.street.points.cng!, false],
      ['bike-150', this.street.points.bike!, false],
      // Spares for carjacking traffic (one per drivable kind)
      ['car-sedan', [-12, STASH_Y + 0.95, 0], true],
      ['cng-auto', [0, STASH_Y + 0.95, 0], true],
      ['bike-150', [12, STASH_Y + 0.85, 0], true],
    ];
    parked.forEach(([defId, pos, spare], i) => {
      const def = getVehicleDef(defId);
      const id = VEHICLE_ID_BASE + i;
      this.vehicleBodies.push({ id, def, position: pos, yaw: 0 });
      const visual = new VehicleVisual(def);
      visual.root.position.set(...pos);
      visual.root.visible = !spare;
      this.scene.add(visual.root);
      const body = new SmoothedBody();
      body.snap(new THREE.Vector3(...pos));
      this.vehicles.push({
        id,
        def,
        visual,
        body,
        speed: 0,
        steer: 0,
        throttle: 0,
        brake: 0,
        handbrake: false,
        cond: newCondition(),
        stolen: false,
        prevVel: new THREE.Vector3(),
        hasPrev: false,
        fxTimer: 0,
        spare,
        tp: null,
        wheels: def.wheels.map(() => ({
          suspension: def.suspension.restLength,
          rotation: 0,
          steering: 0,
        })),
      });
    });

    this.rig = new CameraRig(this.camera, this.street.colliders);
    this.rig.yaw = this.facing + Math.PI + 0.5;
  }

  get exposure(): number {
    return this.env.exposure;
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Before physics: interactions + desired character velocity + vehicle controls. */
  preStep(
    dt: number,
    input: InputManager,
  ): { characters: CharacterInput[]; vehicles: VehicleInput[]; kinematic?: KinematicInput[] } {
    if (input.pressed('interact')) this.toggleVehicle();

    const vehicles: VehicleInput[] = this.vehicles.map((v) => {
      const teleport = v.tp && !v.tp.sent ? { x: v.tp.x, y: v.tp.y, z: v.tp.z, yaw: v.tp.yaw } : null;
      if (v.tp) v.tp.sent = true;
      const withTp = (c: Omit<VehicleInput, 'bodyId'>): VehicleInput =>
        teleport ? { bodyId: v.id, ...c, teleport } : { bodyId: v.id, ...c };
      if (v === this.driving) {
        const c = computeVehicleControls(
          v.def,
          { throttle: input.move.y, steer: input.move.x, handbrake: input.isDown('jump') },
          v.speed,
          v.steer,
          dt,
        );
        const power = enginePower(v.cond);
        c.engine *= power;
        v.throttle = power > 0 ? Math.max(0, input.move.y) : 0;
        v.brake = c.brake;
        v.handbrake = c.handbrake;
        v.steer = c.steer;
        burnFuel(v.cond, v.def.kind, input.move.y, dt);
        return withTp(c);
      }
      v.throttle = 0;
      v.handbrake = false;
      const c = parkedControls(v.def);
      v.steer = c.steer;
      return withTp(c);
    });

    // Horn
    const horn = !!this.driving && input.isDown('horn');
    if (horn !== this.hornOn) {
      this.hornOn = horn;
      this.audio?.horn(this.driving?.def.kind ?? 'car', horn);
      if (horn) this.npcReact('honked', 18);
    }

    let vx = 0;
    let vz = 0;
    if (!this.driving) {
      const sprint = input.isDown('sprint');
      const mag = Math.min(1, Math.hypot(input.move.x, input.move.y));
      // Joystick: small push = walk, full = jog; sprint button/key = sprint.
      const base =
        mag < 0.55
          ? WALK_SPEED * (mag / 0.55)
          : WALK_SPEED + (JOG_SPEED - WALK_SPEED) * ((mag - 0.55) / 0.45);
      const speed = sprint && mag > 0.1 ? SPRINT_SPEED : base;
      const [fx, fz] = this.rig.forward;
      const dx = mag > 0 ? (-fz * input.move.x + fx * input.move.y) / Math.max(mag, 1e-3) : 0;
      const dz = mag > 0 ? (fx * input.move.x + fz * input.move.y) / Math.max(mag, 1e-3) : 0;
      const len = Math.hypot(dx, dz) || 1;
      const k = 1 - Math.exp(-GROUND_ACCEL * dt);
      this.moveVel.x += ((dx / len) * speed - this.moveVel.x) * k;
      this.moveVel.y += ((dz / len) * speed - this.moveVel.y) * k;
      vx = this.moveVel.x;
      vz = this.moveVel.y;
    }

    const character: CharacterInput = {
      bodyId: PLAYER_ID,
      vx,
      vz,
      jump: !this.driving && input.pressed('jump'),
      enabled: !this.driving,
      ...(this.pendingTeleport ? { teleport: this.pendingTeleport } : {}),
    };
    this.pendingTeleport = null;
    const kinematic = this.traffic?.kinematic();
    return kinematic ? { characters: [character], vehicles, kinematic } : { characters: [character], vehicles };
  }

  private toggleVehicle() {
    if (this.driving) {
      const v = this.driving;
      if (Math.abs(v.speed) > MAX_EXIT_SPEED) return;
      const left = new THREE.Vector3(1, 0, 0).applyQuaternion(v.body.renderQuat);
      left.y = 0;
      left.normalize();
      const out = v.body.renderPos
        .clone()
        .addScaledVector(left, v.def.chassisHalfExtents[0] + 0.75);
      out.y = Math.max(out.y, 0.2) + CAPSULE_CENTER - 0.3;
      this.pendingTeleport = [out.x, out.y, out.z];
      this.player.snap(out);
      this.moveVel.set(0, 0);
      this.driving = null;
      this.scene.add(this.hero.root);
      this.hero.root.position.set(out.x, out.y - CAPSULE_CENTER, out.z);
      this.hero.root.rotation.set(0, this.facing, 0);
      this.hero.setVisible(true);
      this.audio?.setEngine(null);
      this.audio?.setSkid(0);
      if (this.hornOn) {
        this.audio?.horn('car', false);
        this.hornOn = false;
      }
      this.hudDirty = true;
    } else if (!this.nearest && this.carjackCar) {
      this.carjack(this.carjackCar);
    } else if (this.nearest) {
      const v = this.nearest;
      this.driving = v;
      if (!v.stolen) {
        v.stolen = true;
        this.crimeEvent('vehicleTheft');
      }
      if (v.def.kind === 'bike') {
        v.visual.seat.add(this.hero.root);
        this.hero.root.position.set(0, 0, 0);
        this.hero.root.rotation.set(0, 0, 0);
      } else {
        this.hero.setVisible(false);
      }
      this.rig.addShake(0.15);
      this.audio?.setEngine(v.def.kind);
      if (Math.random() < 0.5 && !this.dialogue.busy)
        this.dialogue.say('hero', 'enterVehicle', this.hero);
      this.hudDirty = true;
    }
  }

  // ---------------- Talking ----------------

  /** Player picked a talk option (menu button or number key). */
  chooseTalk(option: TalkOption): boolean {
    const npc = this.talkTarget;
    if (!npc || this.driving || !npc.options.includes(option)) return false;
    const sp = npc.def.speaker;
    const h = npc.humanoid;
    switch (option) {
      case 'greet':
        this.dialogue.interrupt('hero', 'greet', this.hero);
        this.dialogue.say(sp, 'greetReply', h, 0.25);
        this.hud.publicLove += 1;
        break;
      case 'threaten':
        this.dialogue.interrupt('hero', 'threaten', this.hero);
        this.dialogue.say(sp, 'threatenReply', h, 0.2);
        npc.fear = 1;
        this.hud.notoriety += 1;
        this.crimeEvent('threaten');
        break;
      case 'snatch': {
        const amount = Math.min(npc.wallet, 80 + Math.floor(Math.random() * 300));
        npc.wallet -= amount;
        npc.snatchCooldown = 90;
        npc.fear = 1;
        this.hud.taka += amount;
        this.hud.notoriety += 2;
        this.crimeEvent('snatch');
        this.dialogue.interrupt('hero', 'snatch', this.hero);
        this.dialogue.say(sp, 'snatched', h, 0.1);
        this.audio?.coin();
        break;
      }
      case 'order': {
        const price = npc.def.price ?? 10;
        if (this.hud.taka < price) {
          this.dialogue.interrupt('hero', 'broke', this.hero);
          break;
        }
        this.hud.taka -= price;
        this.hud.publicLove += 1;
        this.dialogue.interrupt('hero', 'order', this.hero);
        this.dialogue.say(
          sp,
          this.dialogue.has(sp, 'orderReply') ? 'orderReply' : 'greetReply',
          h,
          0.25,
        );
        this.audio?.coin();
        break;
      }
      case 'grab':
        this.dialogue.interrupt('hero', 'grab', this.hero);
        this.dialogue.say(sp, this.dialogue.has(sp, 'grabbed') ? 'grabbed' : 'snatched', h, 0.15);
        this.hud.notoriety += 1;
        npc.fear = 0.6;
        this.crimeEvent('grab');
        break;
    }
    this.hudDirty = true;
    return true;
  }

  /** Nearby NPCs bark at a situation (honk, near miss…), with per-NPC cooldown. */
  private npcReact(situation: string, radius: number, from?: THREE.Vector3) {
    const at = from ?? (this.driving ? this.driving.body.renderPos : this.player.renderPos);
    for (const npc of this.allNpcs()) {
      if (npc.barkCooldown > 0 || npc.position.distanceTo(at) > radius) continue;
      if (!this.dialogue.has(npc.def.speaker, situation)) continue;
      if (this.dialogue.busy && situation !== 'nearMiss' && situation !== 'bumped') continue;
      this.dialogue.interrupt(npc.def.speaker, situation, npc.humanoid);
      npc.barkCooldown = 6;
      return;
    }
  }

  // ---------------- Physics results ----------------

  applyFrame(frame: PhysicsFrame) {
    const t = frame.transforms;
    for (let o = 0; o < t.length; o += FLOATS_PER_BODY) {
      const id = t[o]!;
      if (id === PLAYER_ID) {
        if (!this.driving) this.player.set(t, o);
      } else if (id === BALL_ID) {
        this.ball.set(t, o);
      } else if (id >= VEHICLE_ID_BASE && id < VEHICLE_ID_BASE + this.vehicles.length) {
        const v = this.vehicles[id - VEHICLE_ID_BASE]!;
        if (v.tp) {
          // Skip stale frames from before the teleport landed
          const d = Math.hypot(t[o + 1]! - v.tp.x, t[o + 3]! - v.tp.z);
          if (d > 4 && ++v.tp.frames < 60) continue;
          v.tp = null;
          v.hasPrev = false;
        }
        v.body.set(t, o);
        this.detectImpact(v);
      }
    }
    const vs = frame.vehicles;
    let o = 0;
    while (o < vs.length) {
      const id = vs[o]!;
      const n = vs[o + 2]!;
      const v = this.vehicles[id - VEHICLE_ID_BASE];
      if (v) {
        v.speed = vs[o + 1]!;
        for (let w = 0; w < n; w++) {
          const b = o + 3 + w * FLOATS_PER_WHEEL;
          const ws = v.wheels[w];
          if (ws) {
            ws.suspension = vs[b]!;
            ws.rotation = vs[b + 1]!;
            ws.steering = vs[b + 2]!;
          }
        }
      }
      o += 3 + n * FLOATS_PER_WHEEL;
    }
  }

  /** Sudden velocity change between physics frames = collision → zone damage. */
  private detectImpact(v: VehicleEntity) {
    const vel = v.body.vel;
    if (!v.hasPrev) {
      v.prevVel.copy(vel);
      v.hasPrev = true;
      return;
    }
    const dv = vel.clone().sub(v.prevVel);
    v.prevVel.copy(vel);
    const mag = dv.length();
    if (mag < 2.5) return;
    const local = dv.clone().applyQuaternion(v.body.quat.clone().invert());
    const zone = impactZone(local.x, local.z);
    const added = applyImpact(v.cond, zone, mag, v.def.kind === 'car' ? 1.2 : 0.9);
    if (added <= 0) return;
    const strength = Math.min(1, mag / 14);
    this.audio?.crash(strength);
    this.particles.emit(
      'debris',
      v.body.renderPos.clone().add(new THREE.Vector3(0, 0.4, 0)),
      undefined,
      Math.round(4 + strength * 8),
    );
    this.particles.emit('dust', v.body.renderPos, undefined, 4);
    if (v === this.driving) {
      this.rig.addShake(0.3 + strength * 0.7);
      if (strength > 0.5) this.crimeEvent('crash');
      if (this.crashBarkCooldown <= 0 && strength > 0.3) {
        this.dialogue.interrupt('hero', 'crash', this.hero);
        this.crashBarkCooldown = 8;
      }
    }
    this.hudDirty = true;
  }

  // ---------------- Per-frame ----------------

  update(dt: number, input: InputManager) {
    this.crashBarkCooldown = Math.max(0, this.crashBarkCooldown - dt);
    for (const v of this.vehicles) {
      v.body.update(dt);
      v.visual.root.position.copy(v.body.renderPos);
      v.visual.root.quaternion.copy(v.body.renderQuat);
      v.visual.update(dt, v.speed, v.wheels);
      this.vehicleEffects(v, dt);
    }
    this.ball.update(dt);
    this.ballMesh.position.copy(this.ball.renderPos);
    this.ballMesh.quaternion.copy(this.ball.renderQuat);

    const pivot = new THREE.Vector3();
    if (this.driving) {
      const v = this.driving;
      this.hero.update(dt, {
        speed: 0,
        distance: 0,
        grounded: true,
        vy: 0,
        turnRate: 0,
        accel: 0,
        riding: true,
      });
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(v.body.renderQuat);
      const heading = Math.atan2(fwd.x, fwd.z);
      const speed = Math.abs(v.speed);
      pivot.copy(v.body.renderPos).y += v.def.camera.height;
      this.prevSpeed = speed;
      if (speed > 25) this.rig.addShake(dt * 0.15);
      this.rig.update(dt, {
        pivot,
        distance: v.def.camera.distance + Math.min(speed * 0.04, 2),
        shoulder: 0,
        fov: 62 + Math.min(speed * 0.35, 16),
        autoAlignYaw: speed > 2 ? heading : null,
        lookInput: input.look,
      });
      this.nearest = null;
      this.talkTarget = null;
      this.audio?.updateEngine(
        v.speed,
        v.throttle,
        v.def.maxSpeedKmh / 3.6,
        enginePower(v.cond) === 0,
      );
      // Near misses with NPCs
      if (speed > 6) this.npcReact('nearMiss', 2.8);
    } else {
      this.player.update(dt);
      const p = this.player.renderPos;
      this.hero.root.position.set(p.x, p.y - CAPSULE_CENTER, p.z);
      const hSpeed = Math.hypot(this.player.vel.x, this.player.vel.z);
      if (this.moveVel.lengthSq() > 0.04) {
        const target = Math.atan2(this.moveVel.x, this.moveVel.y);
        this.facing += wrapAngle(target - this.facing) * (1 - Math.exp(-12 * dt));
      }
      this.hero.root.rotation.y = this.facing;
      const turnRate = wrapAngle(this.facing - this.prevFacing) / Math.max(dt, 1e-3);
      this.prevFacing = this.facing;
      this.accel = damp(this.accel, (hSpeed - this.prevSpeed) / Math.max(dt, 1e-3), 8, dt);
      this.prevSpeed = hSpeed;

      const grounded = this.player.grounded;
      if (grounded && !this.wasGrounded && this.lastVy < -5)
        this.rig.addShake(Math.min(0.6, -this.lastVy / 25));
      this.wasGrounded = grounded;
      this.lastVy = this.player.vel.y;

      this.hero.update(dt, {
        speed: hSpeed,
        distance: hSpeed * dt,
        grounded,
        vy: this.player.vel.y,
        turnRate,
        accel: this.accel,
        riding: false,
      });

      const sprinting = hSpeed > JOG_SPEED + 0.8;
      pivot.set(p.x, p.y - CAPSULE_CENTER + 1.55, p.z);
      this.rig.update(dt, {
        pivot,
        distance: sprinting ? 4.1 : 3.6,
        shoulder: 0.45,
        fov: sprinting ? 68 : 60,
        autoAlignYaw: null,
        lookInput: input.look,
      });

      // Nearest vehicle & NPC
      let best: VehicleEntity | null = null;
      let bestD = ENTER_RANGE;
      for (const v of this.vehicles) {
        const d = Math.hypot(v.body.renderPos.x - p.x, v.body.renderPos.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = v;
        }
      }
      this.nearest = best;
      let bestNpc: Npc | null = null;
      let bestNpcD = TALK_RANGE;
      for (const npc of this.allNpcs()) {
        const d = Math.hypot(npc.position.x - p.x, npc.position.z - p.z);
        if (d < bestNpcD) {
          bestNpcD = d;
          bestNpc = npc;
        }
        // Bumping into someone while moving
        if (d < 0.8 && hSpeed > 1.8 && npc.barkCooldown <= 0) {
          this.dialogue.interrupt(npc.def.speaker, 'bumped', npc.humanoid);
          npc.barkCooldown = 5;
        }
      }
      if (bestNpc !== this.talkTarget) {
        this.talkTarget = bestNpc;
        this.hudDirty = true;
      }
      // Carjack: a stopped/slow traffic vehicle within reach (no parked one closer)
      const cj = !best && this.traffic ? this.traffic.carjackTarget(p.x, p.z, 4.2) : null;
      const usable = cj && this.spareFor(cj) ? cj : null;
      if (usable !== this.carjackCar) {
        this.carjackCar = usable;
        this.hudDirty = true;
      }
    }
    if (this.driving) this.carjackCar = null;
    this.updateStreetLife(dt);

    // NPC life: face the player, idle calls when the player is around
    const playerPos = this.driving ? this.driving.body.renderPos : this.player.renderPos;
    for (const npc of this.npcs) {
      npc.update(dt, playerPos);
      if (npc.idleTimer <= 0) {
        npc.idleTimer = 14 + Math.random() * 18;
        if (!this.dialogue.busy && npc.position.distanceTo(playerPos) < 14) {
          this.dialogue.say(npc.def.speaker, 'idle', npc.humanoid);
        }
      }
    }
    // Wanted level cools down; NPCs recognise a wanted hero
    tickCrime(this.crime, dt);
    this.recognizeCooldown = Math.max(0, this.recognizeCooldown - dt);
    if (stars(this.crime) >= 1 && this.recognizeCooldown <= 0 && !this.dialogue.busy) {
      for (const npc of this.allNpcs()) {
        if (
          npc.position.distanceTo(playerPos) < 6 &&
          this.dialogue.has(npc.def.speaker, 'recognized')
        ) {
          this.dialogue.say(npc.def.speaker, 'recognized', npc.humanoid);
          npc.fear = Math.max(npc.fear, 0.5);
          this.recognizeCooldown = 25;
          break;
        }
      }
    }
    this.boards.update({
      heroFull: fillHero('{hero}', this.identity),
      heroName: this.identity.name,
      stars: stars(this.crime),
      crimes: totalCrimes(this.crime),
      snatches: this.crime.record.snatch,
      thefts: this.crime.record.vehicleTheft,
      headline: this.hud.headline?.text ?? null,
    });
    this.dialogue.update(dt);

    const focus = this.driving ? this.driving.body.renderPos : this.player.renderPos;
    if (this.city) {
      this.city.update(dt, focus);
      if (this.city.version !== this.cityVersion) {
        this.cityVersion = this.city.version;
        this.rig.setColliders([...this.street.colliders, ...this.city.colliders()]);
      }
      for (const nm of this.city.nightMaterials)
        nm.material.emissiveIntensity = nm.max * this.env.night;
    }
    this.env.update(dt, focus, this.camera);
    for (const nm of this.street.nightMaterials)
      nm.material.emissiveIntensity = nm.max * this.env.night;
    for (const g of this.street.nightGlows) g.material.opacity = g.max * this.env.night;
    this.particles.setFogColor((this.scene.fog as THREE.Fog).color);
    this.particles.update(dt, this.camera);
    this.audio?.update(dt, this.env.night);

    this.publishHud(dt);
  }

  /** Dust, exhaust, damage smoke and tyre squeal. */
  private vehicleEffects(v: VehicleEntity, dt: number) {
    v.fxTimer -= dt;
    const speed = Math.abs(v.speed);
    const q = v.body.renderQuat;
    const local = v.body.vel.clone().applyQuaternion(q.clone().invert());
    const slip = Math.abs(local.x);
    const hardBrake = v.brake > v.def.brakeForce * 0.5 && speed > 6;
    const wheelspin = v.throttle > 0.8 && speed < 7;
    const skid = Math.min(
      1,
      Math.max(
        slip > 2 ? (slip - 2) / 4 : 0,
        hardBrake ? 0.6 : 0,
        v.handbrake && speed > 4 ? 0.8 : 0,
      ),
    );
    if (v === this.driving) this.audio?.setSkid(skid);
    if (v.fxTimer > 0) return;
    v.fxTimer = 0.06;
    const rear = new THREE.Vector3(
      0,
      -v.def.chassisHalfExtents[1] - 0.15,
      -v.def.chassisHalfExtents[2],
    )
      .applyQuaternion(q)
      .add(v.body.renderPos);
    if (skid > 0.2 || wheelspin)
      this.particles.emit('dust', rear, v.body.vel.clone().multiplyScalar(-0.1));
    if (
      v === this.driving &&
      (v.def.kind === 'cng' || v.def.kind === 'bike') &&
      Math.random() < 0.5
    ) {
      this.particles.emit('exhaust', rear.clone().add(new THREE.Vector3(0, 0.2, 0)));
    }
    const dmg = totalDamage(v.cond);
    const front = new THREE.Vector3(
      0,
      v.def.chassisHalfExtents[1],
      v.def.chassisHalfExtents[2] * 0.7,
    )
      .applyQuaternion(q)
      .add(v.body.renderPos);
    if (v.cond.damage.front > 80 || dmg >= 90) this.particles.emit('blackSmoke', front);
    else if (v.cond.damage.front > 45 && Math.random() < 0.6) this.particles.emit('smoke', front);
  }

  private publishHud(dt: number) {
    const prompt = this.driving
      ? Math.abs(this.driving.speed) <= MAX_EXIT_SPEED
        ? `নামো: ${this.driving.def.nameBn}`
        : null
      : this.nearest
        ? `ওঠো: ${this.nearest.def.nameBn}`
        : this.carjackCar
          ? `ছিনিয়ে নাও: ${CARJACK_NAMES[this.carjackCar.kind] ?? 'গাড়ি'}`
          : null;
    const mode = this.driving ? 'vehicle' : 'foot';
    const talk =
      !this.driving && this.talkTarget
        ? {
            name: dialogue.speakers[this.talkTarget.def.speaker]?.name ?? '',
            options: this.talkTarget.options.map((id) => ({
              id,
              label:
                id === 'order' && this.talkTarget?.def.orderName
                  ? `${this.talkTarget.def.orderName} অর্ডার (৳${this.talkTarget.def.price})`
                  : TALK_LABELS[id],
            })),
          }
        : null;
    this.hudTimer -= dt;
    const changed =
      this.hudDirty ||
      prompt !== this.hud.prompt ||
      mode !== this.hud.mode ||
      JSON.stringify(talk) !== JSON.stringify(this.hud.talk);
    if (changed || this.hudTimer <= 0) {
      const c = this.driving?.cond;
      this.hud = {
        ...this.hud,
        mode,
        prompt,
        talk,
        vehicleName: this.driving?.def.nameBn ?? null,
        speedKmh: this.driving ? Math.round(Math.abs(this.driving.speed) * 3.6) : 0,
        hour: this.env.hour,
        fuel: c ? c.fuel : 1,
        damage: c ? totalDamage(c) : 0,
        damageZones: c ? { ...c.damage } : { front: 0, rear: 0, left: 0, right: 0 },
        engineDead: c ? enginePower(c) === 0 : false,
        heroFull: fillHero('{hero}', this.identity),
        wanted: stars(this.crime),
        crimes: totalCrimes(this.crime),
        bribeCost: bribeCost(this.crime),
        pos: [Math.round(this.focusPos.x * 10) / 10, Math.round(this.focusPos.z * 10) / 10],
        heading: +this.rig.yaw.toFixed(3),
      };
      this.hudTimer = 0.1;
      this.hudDirty = false;
      this.onHud(this.hud);
    }
  }

  private get focusPos(): THREE.Vector3 {
    return this.driving ? this.driving.body.renderPos : this.player.renderPos;
  }

  get cityLoadedChunks(): number {
    return this.city?.loadedCount ?? 0;
  }

  debugInfo() {
    const r = (v: THREE.Vector3) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
    return {
      mode: this.hud.mode,
      player: r(this.player.renderPos),
      camera: r(this.camera.position),
      grounded: this.player.grounded,
      vehicle: this.driving
        ? {
            id: this.driving.def.id,
            pos: r(this.driving.body.renderPos),
            speedKmh: +(this.driving.speed * 3.6).toFixed(1),
            fuel: +this.driving.cond.fuel.toFixed(3),
            damage: { ...this.driving.cond.damage },
          }
        : null,
      nearest: this.nearest?.def.id ?? null,
      talkTarget: this.talkTarget?.def.id ?? null,
      taka: this.hud.taka,
      wanted: stars(this.crime),
      crimes: totalCrimes(this.crime),
      heroFull: fillHero('{hero}', this.identity),
      notoriety: this.hud.notoriety,
      subtitle: this.hud.subtitle?.text ?? null,
      vehicles: this.vehicles.map((v) => ({
        id: v.def.id,
        pos: r(v.body.renderPos),
        speed: +v.speed.toFixed(2),
      })),
      npcs: this.npcs.map((n) => ({ id: n.def.id, pos: r(n.position) })),
      hour: +this.env.hour.toFixed(2),
      cityChunks: this.city?.loadedCount ?? 0,
      traffic: this.traffic?.activeCount ?? 0,
      peds: this.peds?.active.length ?? 0,
      knocked: this.peds?.peds.filter((x) => x.active && x.state === 'knocked').length ?? 0,
      carjack: this.carjackCar?.kind ?? null,
    };
  }

  /** Testing/debug: carjack the nearest carjackable traffic vehicle (stops it first). */
  debugCarjack(): string | null {
    if (!this.traffic) return null;
    if (this.driving) this.toggleVehicle();
    const p = this.player.renderPos;
    let best: TrafficCar | null = null;
    let bestD = Infinity;
    for (const c of this.traffic.cars) {
      if (!c.active || !TRAFFIC_KINDS[c.kind].def || !this.spareFor(c)) continue;
      const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (!best) return null;
    best.speed = 0;
    this.carjack(best);
    return this.driving?.def.id ?? null;
  }

  /** Testing/debug: knock down the nearest pedestrian as if hit by a car. */
  debugKnockPedestrian(): boolean {
    const p = this.peds?.active[0];
    if (!p || !this.peds) return false;
    this.peds.knock(p, 0);
    return true;
  }

  // ---------------- Crime, bribe, good deeds, identity ----------------

  // ---------------- Street life: traffic, pedestrians, carjacking ----------------

  /** Talkable people: fixed NPCs + pedestrians currently walking around. */
  private allNpcs(): Npc[] {
    if (!this.peds) return this.npcs;
    const out = this.npcs.slice();
    for (const p of this.peds.peds)
      if (p.active && p.state !== 'knocked' && p.state !== 'getup') out.push(p.npc);
    return out;
  }

  /** A spare vehicle that can become this traffic car (not driven, not right next to the player). */
  private spareFor(c: TrafficCar): VehicleEntity | null {
    const defId = TRAFFIC_KINDS[c.kind].def;
    if (!defId) return null;
    const focus = this.focusPos;
    return (
      this.vehicles.find(
        (v) =>
          v.spare &&
          v.def.id === defId &&
          v !== this.driving &&
          (v.body.renderPos.y < STASH_Y + 20 || v.body.renderPos.distanceTo(focus) > 45),
      ) ?? null
    );
  }

  private carjack(c: TrafficCar) {
    const spare = this.spareFor(c);
    if (!spare || !this.traffic) return;
    const y = spare.def.kind === 'bike' ? 0.85 : 0.95;
    spare.tp = { x: c.pos.x, y, z: c.pos.z, yaw: c.yaw, sent: false, frames: 0 };
    const at = new THREE.Vector3(c.pos.x, y, c.pos.z);
    spare.body.snap(at);
    spare.body.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw);
    spare.body.renderQuat.copy(spare.body.quat);
    spare.visual.root.position.copy(at);
    spare.visual.root.quaternion.copy(spare.body.quat);
    spare.visual.root.visible = true;
    spare.cond = newCondition();
    spare.cond.fuel = 0.35 + Math.random() * 0.6;
    spare.speed = 0;
    spare.stolen = true;
    // The driver is dragged out and runs off screaming
    const left = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
    const out = at.clone().addScaledVector(left, TRAFFIC_KINDS[c.kind].half[0] + 0.9);
    const driver = this.peds?.spawnFleeing(out, this.player.renderPos) ?? null;
    this.traffic.stunNear(c.pos.x, c.pos.z, 25, 3);
    this.traffic.despawn(c);
    this.carjackCar = null;
    this.crimeEvent('carjack');
    this.dialogue.interrupt('hero', 'carjack', this.hero);
    this.dialogue.say('driver', 'carjacked', driver?.npc.humanoid ?? null, 0.5);
    this.peds?.scareAll(at, 10, 5);
    this.nearest = spare;
    this.toggleVehicle();
  }

  private onTrafficHonk(c: TrafficCar) {
    const focus = this.focusPos;
    const dx = c.pos.x - focus.x;
    const dz = c.pos.z - focus.z;
    const d = Math.hypot(dx, dz);
    // Pan: project onto the camera's right vector
    const [fx, fz] = this.rig.forward;
    const pan = Math.max(-1, Math.min(1, (dx * -fz + dz * fx) / Math.max(d, 1)));
    this.audio?.honkAt(d, -pan);
    if (d < 12 && this.driverBarkCooldown <= 0 && !this.dialogue.busy) {
      this.driverBarkCooldown = 10;
      this.dialogue.say('driver', 'blocked', null);
    }
  }

  /** Traffic + pedestrians tick; cars hitting people. */
  private updateStreetLife(dt: number) {
    this.driverBarkCooldown = Math.max(0, this.driverBarkCooldown - dt);
    if (!this.traffic || !this.peds) return;
    const focus = this.focusPos;
    const obstacles: TrafficObstacle[] = [];
    if (this.driving) {
      const v = this.driving;
      obstacles.push({ x: v.body.renderPos.x, z: v.body.renderPos.z, radius: v.def.chassisHalfExtents[0] + 0.6 });
    } else {
      obstacles.push({ x: this.player.renderPos.x, z: this.player.renderPos.z, radius: 0.5 });
    }
    for (const p of this.peds.peds)
      if (p.active && (p.state === 'knocked' || p.state === 'getup'))
        obstacles.push({ x: p.npc.position.x, z: p.npc.position.z, radius: 0.9 });
    this.traffic.update(dt, focus, obstacles);
    this.peds.update(dt, focus);

    // Player's vehicle knocking pedestrians down
    if (this.driving && Math.abs(this.driving.speed) > 3.5) {
      const v = this.driving;
      const inv = v.body.renderQuat.clone().invert();
      const [hx, , hz] = v.def.chassisHalfExtents;
      for (const p of this.peds.peds) {
        if (!p.active || p.state === 'knocked' || p.state === 'getup') continue;
        const local = p.npc.position.clone().sub(v.body.renderPos).applyQuaternion(inv);
        if (Math.abs(local.x) > hx + 0.35 || Math.abs(local.z) > hz + 0.35) continue;
        const vel = v.body.vel;
        this.peds.knock(p, Math.atan2(vel.x, vel.z), 4 + Math.abs(v.speed) * 0.2);
        p.npc.position.addScaledVector(vel.clone().setY(0).normalize(), 1.2);
        this.audio?.crash(0.25);
        this.rig.addShake(0.2);
        this.crimeEvent('hitPedestrian');
        this.dialogue.interrupt(p.npc.def.speaker, 'knocked', p.npc.humanoid);
        this.peds.scareAll(p.npc.position, 14, 6);
      }
    }
  }

  private crimeEvent(kind: CrimeKind) {
    const before = stars(this.crime);
    commitCrime(this.crime, kind);
    const text = headlineFor(kind, Math.random());
    if (text && (kind !== 'crash' || Math.random() < 0.5)) {
      this.hud.headline = { id: ++this.headlineId, text: fillHero(text, this.identity) };
    }
    if (stars(this.crime) > before) this.audio?.coin();
    this.hudDirty = true;
  }

  /** Phone OC Kamal Pasha and pay to clear the wanted level. */
  bribe(): 'paid' | 'refused' | 'clean' {
    if (stars(this.crime) === 0) {
      this.dialogue.interrupt('oc', 'clean', null);
      return 'clean';
    }
    this.dialogue.interrupt('hero', 'bribe', this.hero);
    const paid = payBribe(this.crime, this.hud.taka);
    if (paid > 0) {
      this.hud.taka -= paid;
      this.dialogue.say('oc', 'bribeOk', null, 0.3);
      this.audio?.coin();
    } else {
      this.dialogue.say('oc', 'bribeRefuse', null, 0.3);
    }
    this.hudDirty = true;
    return paid > 0 ? 'paid' : 'refused';
  }

  /** Spend good-deed points (❤️) to wipe crimes off the record. Returns crimes removed. */
  redeemGoodDeeds(): number {
    const spent = redeemGoodDeeds(this.crime, this.hud.publicLove);
    if (spent > 0) {
      this.hud.publicLove -= spent;
      this.crime.heat = Math.max(0, this.crime.heat - spent / 3);
      this.dialogue.interrupt('hero', 'redeem', this.hero);
      this.hudDirty = true;
    }
    return spent / 3;
  }

  /** Serializable progress (cloud/local save). */
  exportSave(): SaveData {
    return {
      v: 1,
      taka: this.hud.taka,
      notoriety: this.hud.notoriety,
      publicLove: this.hud.publicLove,
      hour: +this.env.hour.toFixed(2),
      crime: { heat: this.crime.heat, record: { ...this.crime.record } },
    };
  }

  importSave(s: Partial<SaveData>) {
    if (typeof s.taka === 'number') this.hud.taka = Math.max(0, Math.floor(s.taka));
    if (typeof s.notoriety === 'number') this.hud.notoriety = Math.max(0, Math.floor(s.notoriety));
    if (typeof s.publicLove === 'number')
      this.hud.publicLove = Math.max(0, Math.floor(s.publicLove));
    if (typeof s.hour === 'number') this.setHour(s.hour);
    if (s.crime) {
      this.crime.heat = Math.min(5, Math.max(0, s.crime.heat ?? 0));
      for (const k of Object.keys(this.crime.record) as Array<keyof typeof this.crime.record>) {
        const n = s.crime.record?.[k];
        if (typeof n === 'number') this.crime.record[k] = Math.max(0, Math.floor(n));
      }
    }
    this.hudDirty = true;
  }

  setIdentity(id: HeroIdentity) {
    this.identity = { ...id };
    this.hudDirty = true;
  }

  /** Testing/debug: get into a vehicle by definition id, wherever it is. */
  debugEnterVehicle(defId: string): boolean {
    if (this.driving) this.toggleVehicle();
    const v = this.vehicles.find((x) => x.def.id === defId);
    if (!v) return false;
    this.nearest = v;
    this.toggleVehicle();
    return true;
  }

  /** Testing/debug: put the player on foot at (x, z) with a camera yaw/pitch. */
  debugView(x: number, z: number, yaw: number, pitch = 0.2) {
    if (this.driving) this.toggleVehicle();
    const p = new THREE.Vector3(x, STREET.curbHeight + CAPSULE_CENTER + 0.1, z);
    this.pendingTeleport = [p.x, p.y, p.z];
    this.player.snap(p);
    this.rig.yaw = yaw;
    this.rig.pitch = pitch;
  }

  /** Testing/debug: talk to an NPC by id from anywhere. */
  debugTalk(npcId: string, option: TalkOption): boolean {
    const npc = this.npcs.find((n) => n.def.id === npcId);
    if (!npc) return false;
    this.talkTarget = npc;
    return this.chooseTalk(option);
  }

  setHour(h: number) {
    this.env.hour = ((h % 24) + 24) % 24;
  }

  dispose() {
    this.street.dispose();
    this.env.dispose();
    this.hero.dispose();
    for (const n of this.npcs) n.humanoid.dispose();
    for (const v of this.vehicles) v.visual.dispose();
    this.particles.dispose();
    this.boards.dispose();
    this.city?.dispose();
    this.traffic?.dispose();
    this.peds?.dispose();
    this.ballMesh.geometry.dispose();
    (this.ballMesh.material as THREE.Material).dispose();
  }
}
