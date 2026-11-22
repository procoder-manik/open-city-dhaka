import * as THREE from 'three/webgpu';
import { dialogue, getVehicleDef, stations } from '@game/content';
import {
  DEFAULT_IDENTITY,
  fillHero,
  type HeroIdentity,
  type QualityPreset,
  type VehicleDef,
} from '@game/shared';
import { Blackout, Rain, WeatherCycle, type WeatherMode } from '../world/Weather';
import { DEFAULT_PREFS, type GamePrefs } from '../state/prefs';
import { StationSystem } from '../gameplay/Stations';
import { StationProps } from '../world/StationProps';
import { Humanoid } from '../actors/Humanoid';
import { Npc, TALK_LABELS, defaultNpcs, type TalkOption } from '../actors/Npc';
import { PedestrianSystem } from '../actors/PedestrianSystem';
import {
  TRAFFIC_KINDS,
  TrafficSystem,
  type TrafficCar,
  type TrafficObstacle,
} from '../traffic/TrafficSystem';
import { RoadGraph } from '../world/city/RoadGraph';
import { raycastAABBs, type AABB } from '../camera/raycast';
import {
  WEAPONS,
  blastFalloff,
  newArsenal,
  nextWeapon,
  raySphere,
  type Arsenal,
  type WeaponId,
} from '../gameplay/Combat';
import { PoliceSystem, type Cop } from '../gameplay/PoliceSystem';
import { Projectiles } from '../gameplay/Projectiles';
import { MissionSystem, type MissionEvent } from '../gameplay/Missions';
import { MissionMarkers } from '../gameplay/MissionMarkers';
import { ACT1 } from '../gameplay/act1';
import { ACT2 } from '../gameplay/act2';
import { ACT3 } from '../gameplay/act3';

const MISSIONS = [...ACT1, ...ACT2, ...ACT3];
import type { Pedestrian } from '../actors/PedestrianSystem';
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
  type ImpulseInput,
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
const POLICE_ID_BASE = 450;
const STASH_ID = 990;
/** Easy keyboard controls: turn speed (rad/s) for A/D. */
const EASY_TURN = 2.8;
const STATION_ID_BASE = 900;
const RESPRAY_COLORS = [0x1d5c96, 0x8a1d1d, 0x2f6b3a, 0x202020, 0xd9d2c0, 0x6b2f80];
const STATIC_ID_BASE = 1000;
/** Hidden platform where spare (carjack) vehicles wait. */
const STASH_Y = -200;
const _frustum = new THREE.Frustum();
const _projScreen = new THREE.Matrix4();

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

const CARJACK_NAMES: Record<string, string> = {
  car: 'প্রাইভেট কার',
  cng: 'সিএনজি',
  bike: 'মোটরসাইকেল',
};

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
  ammo?: number;
  grenades?: number;
  health?: number;
  missions?: string[];
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
  /** Someone to talk to nearby (menu closed): show "E — কথা বলো". */
  talkHint: string | null;
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
  health: number;
  weapon: WeaponId;
  weaponName: string;
  ammo: number;
  grenades: number;
  /** Full-screen state after death / arrest. */
  overlay: { kind: 'wasted' | 'busted'; title: string; sub: string } | null;
  /** 0..1 arrest progress (cop has a hand on you). */
  arrest: number;
  /** Recently hurt (red flash id). */
  hurtId: number;
  mission: {
    title: string;
    objective: string;
    time: number | null;
    target: [number, number] | null;
  } | null;
  /** Big centre card: mission started / passed / failed. id changes per card. */
  missionCard: { id: number; kind: 'start' | 'pass' | 'fail'; title: string; sub: string } | null;
  /** Mission start locations (minimap). */
  missionBlips: Array<[number, number]>;
  missionsDone: number;
  missionsTotal: number;
  /** Petrol pump / garage the player is parked at: what's happening there. */
  station: { type: 'pump' | 'garage'; name: string; text: string } | null;
  /** Static minimap icons: [x, z, type]. */
  stations: Array<[number, number, 'pump' | 'garage']>;
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
  private actorsDrawn = 0;
  private weather: WeatherCycle;
  private rain: Rain;
  private wetness = 0;
  private ramCd = 0;
  /** Seconds the hero keeps fists up after a punch. */
  private guardTimer = 0;
  private stationProps: StationProps;
  private stationSys = new StationSystem(stations);
  private fuelSpent = 0;
  private lowFuelWarned = new WeakSet<object>();
  private prefs: GamePrefs = { ...DEFAULT_PREFS };
  private blackout = new Blackout(seededRandom(1971));
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
  /** Talk menu opened with E / the talk button. */
  private talkOpen = false;
  private talkToggles = 0;
  /** This frame the hero is steered tank-style (easy keyboard controls). */
  private easyMove = false;
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
    talkHint: null,
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
    health: 100,
    weapon: 'fist',
    weaponName: WEAPONS.fist.nameBn,
    ammo: 0,
    grenades: 0,
    overlay: null,
    arrest: 0,
    hurtId: 0,
    mission: null,
    missionCard: null,
    missionBlips: [],
    missionsDone: 0,
    missionsTotal: MISSIONS.length,
    station: null,
    stations: stations.map((s) => [s.x, s.z, s.type] as [number, number, 'pump' | 'garage']),
  };
  private city: CityWorld | null = null;
  private graph: RoadGraph | null = null;
  private traffic: TrafficSystem | null = null;
  private peds: PedestrianSystem | null = null;
  private carjackCar: TrafficCar | null = null;
  private police: PoliceSystem;
  private projectiles = new Projectiles();
  private missions = new MissionSystem(MISSIONS);
  private markers = new MissionMarkers();
  private cardId = 0;
  private missionHudTimer = 0;
  private health = 100;
  private hurtCalm = 0;
  private arsenal: Arsenal = newArsenal();
  private fireCd = 0;
  private shootCrimeCd = 0;
  private aiming = false;
  private overlay: { kind: 'wasted' | 'busted'; t: number } | null = null;
  private deathFall = 0;
  private cityBoxes: AABB[] = [];
  private impulses: ImpulseInput[] = [];
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
    this.police = new PoliceSystem(this.graph, preset, seededRandom(31337), POLICE_ID_BASE);
    this.scene.add(this.police.group);
    this.bodies.push(...this.police.physicsBodies());
    // Petrol pumps + garages
    this.stationProps = new StationProps(stations, preset);
    this.scene.add(this.stationProps.group);
    this.stationProps.bodies.forEach((b, i) => this.bodies.push({ ...b, id: STATION_ID_BASE + i }));
    this.scene.add(this.projectiles.group);
    this.scene.add(this.markers.group);
    this.projectiles.onExplode = (at) => this.explosion(at);
    // Hidden stash platform for spare vehicles
    this.bodies.push({
      id: STASH_ID,
      shape: { kind: 'box', halfExtents: [30, 0.5, 10] },
      position: [0, STASH_Y - 0.5, 0],
      type: 'fixed',
    });

    this.particles = new Particles(preset.npcDensity < 0.5 ? 120 : 220);
    this.weather = new WeatherCycle(seededRandom(2024));
    this.rain = new Rain(
      preset,
      [this.street.materials.road, this.street.materials.walk],
      seededRandom(99),
    );
    this.scene.add(this.rain.object);
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
    this.hero.root.rotation.order = 'YXZ';
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
  ): {
    characters: CharacterInput[];
    vehicles: VehicleInput[];
    kinematic?: KinematicInput[];
    impulses?: ImpulseInput[];
  } {
    const frozen = !!this.overlay;
    if (!frozen && input.pressed('interact')) this.toggleVehicle();
    if (!frozen && input.pressed('talk')) this.openTalk();
    if (!frozen && !this.driving) this.combatInput(input);
    else this.aiming = false;

    const vehicles: VehicleInput[] = this.vehicles.map((v) => {
      const teleport =
        v.tp && !v.tp.sent ? { x: v.tp.x, y: v.tp.y, z: v.tp.z, yaw: v.tp.yaw } : null;
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
        // Wet roads: less traction (bikes and CNGs feel it most)
        const grip = 1 - this.wetness * (v.def.kind === 'car' ? 0.28 : 0.38);
        return withTp(grip < 0.99 ? { ...c, grip } : c);
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
      const sprint = input.isDown('sprint') && !this.aiming;
      const mag = frozen
        ? 0
        : Math.min(1, Math.hypot(input.move.x, input.move.y)) * (this.aiming ? 0.55 : 1);
      // Joystick: small push = walk, full = jog; sprint button/key = sprint.
      const base =
        mag < 0.55
          ? WALK_SPEED * (mag / 0.55)
          : WALK_SPEED + (JOG_SPEED - WALK_SPEED) * ((mag - 0.55) / 0.45);
      const speed = sprint && mag > 0.1 ? SPRINT_SPEED : base;
      const k = 1 - Math.exp(-GROUND_ACCEL * dt);
      this.easyMove =
        this.prefs.easyControls && input.lastDevice === 'keyboard' && !this.aiming && !frozen;
      if (this.easyMove) {
        // Easy: A/D turn on the spot, W forward, S backward (slower). Camera follows.
        this.facing -= input.move.x * EASY_TURN * dt;
        const fwd = input.move.y;
        const spd =
          fwd >= 0 ? (sprint && fwd > 0.1 ? SPRINT_SPEED : JOG_SPEED * fwd) : WALK_SPEED * fwd;
        const tx = Math.sin(this.facing) * spd;
        const tz = Math.cos(this.facing) * spd;
        this.moveVel.x += (tx - this.moveVel.x) * k;
        this.moveVel.y += (tz - this.moveVel.y) * k;
      } else {
        const [fx, fz] = this.rig.forward;
        const dx = mag > 0 ? (-fz * input.move.x + fx * input.move.y) / Math.max(mag, 1e-3) : 0;
        const dz = mag > 0 ? (fx * input.move.x + fz * input.move.y) / Math.max(mag, 1e-3) : 0;
        const len = Math.hypot(dx, dz) || 1;
        this.moveVel.x += ((dx / len) * speed - this.moveVel.x) * k;
        this.moveVel.y += ((dz / len) * speed - this.moveVel.y) * k;
      }
      vx = this.moveVel.x;
      vz = this.moveVel.y;
    }

    const character: CharacterInput = {
      bodyId: PLAYER_ID,
      vx,
      vz,
      jump: !this.driving && !frozen && input.pressed('jump'),
      enabled: !this.driving,
      ...(this.pendingTeleport ? { teleport: this.pendingTeleport } : {}),
    };
    this.pendingTeleport = null;
    const kinematic = [...(this.traffic?.kinematic() ?? []), ...this.police.kinematic()];
    const impulses = this.impulses;
    this.impulses = [];
    return { characters: [character], vehicles, kinematic, impulses };
  }

  private toggleVehicle(force = false) {
    if (this.driving) {
      const v = this.driving;
      if (!force && Math.abs(v.speed) > MAX_EXIT_SPEED) return;
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
  /** Open / close the talk menu with the person in front (E key or the talk button). */
  openTalk(): boolean {
    if (this.driving) return false;
    if (!this.talkTarget) {
      // A step too far still counts: nearest person within a forgiving range
      const p = this.player.renderPos;
      let best: Npc | null = null;
      let bd = TALK_RANGE + 1.0;
      for (const n of this.allNpcs()) {
        const d = Math.hypot(n.position.x - p.x, n.position.z - p.z);
        if (d < bd) {
          bd = d;
          best = n;
        }
      }
      if (!best) return false;
      this.talkTarget = best;
    }
    this.talkOpen = !this.talkOpen;
    this.talkToggles++;
    if (this.talkOpen) {
      this.talkTarget.humanoid.lookAt(this.player.renderPos);
      this.dialogue.say(this.talkTarget.def.speaker, 'idle', this.talkTarget.humanoid);
    }
    this.hudDirty = true;
    return this.talkOpen;
  }

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
        this.health = Math.min(100, this.health + 25);
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
    this.missions.notifyTalk(npc.def.id, option);
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
    if (v === this.driving) this.haptic(Math.round(30 + strength * 90));
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
      if (this.aiming) {
        const [fx, fz] = this.rig.forward;
        this.facing += wrapAngle(Math.atan2(fx, fz) - this.facing) * (1 - Math.exp(-20 * dt));
      } else if (!this.easyMove && this.moveVel.lengthSq() > 0.04) {
        const target = Math.atan2(this.moveVel.x, this.moveVel.y);
        this.facing += wrapAngle(target - this.facing) * (1 - Math.exp(-12 * dt));
      }
      this.hero.root.rotation.y = this.facing;
      this.hero.root.rotation.x = -this.deathFall * (Math.PI / 2 - 0.08);
      this.hero.root.position.y += this.deathFall * 0.12;
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
        distance: this.aiming ? 2.3 : sprinting ? 4.1 : 3.6,
        shoulder: this.aiming ? 0.75 : 0.45,
        fov: this.aiming ? 48 : sprinting ? 68 : 60,
        // Easy controls: the camera swings behind the hero by itself
        autoAlignYaw: this.easyMove ? this.facing : null,
        alignDelay: 0.6,
        alignRate: 3.5,
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
      // An open conversation stays open until you really walk away (no flicker at the edge)
      if (this.talkOpen && this.talkTarget && bestNpc !== this.talkTarget) {
        const t = this.talkTarget.position;
        if (Math.hypot(t.x - p.x, t.z - p.z) < TALK_RANGE + 1.5) bestNpc = this.talkTarget;
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
    this.updateCombat(dt);
    this.updateMissions(dt);

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
    // Wanted level cools down (only while no cop can see you); NPCs recognise a wanted hero
    if (this.police.copNear(this.focusPos, 40)) this.crime.calm = 0;
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
        this.cityBoxes = [
          ...this.street.colliders,
          ...this.city.colliders(),
          ...this.stationProps.colliders,
        ];
        this.rig.setColliders(this.cityBoxes);
      }
    }
    this.updateBlackout(dt);
    this.ramMissionCar(dt);
    this.guardTimer = Math.max(0, this.guardTimer - dt);
    this.hero.guard = !this.driving && this.arsenal.weapon === 'fist' && this.guardTimer > 0;
    this.updateStations(dt);
    const lit = this.env.night * (1 - this.blackout.level);
    if (this.city) {
      for (const nm of this.city.nightMaterials) nm.material.emissiveIntensity = nm.max * lit;
      for (const gl of this.city.nightGlows) gl.material.opacity = gl.max * lit;
    }
    this.updateWeather(dt);
    this.env.update(dt, focus, this.camera);
    for (const nm of this.street.nightMaterials) nm.material.emissiveIntensity = nm.max * lit;
    for (const nm of this.stationProps.nightMaterials)
      nm.material.emissiveIntensity = 0.05 + nm.max * lit;
    for (const g of this.street.nightGlows) g.material.opacity = g.max * lit;
    this.particles.setFogColor((this.scene.fog as THREE.Fog).color);
    this.particles.update(dt, this.camera);
    this.audio?.update(dt, this.env.night);
    this.cullActors();

    this.publishHud(dt);
  }

  /** Damage the mission target; wrecks it with a blast when it runs out of health. */
  private hitMissionCar(amount: number) {
    const c = this.traffic?.missionCar;
    if (!c) return;
    const at = c.pos.clone().setY(0.6);
    if (this.traffic!.damageMission(amount)) {
      this.particles.emit('blackSmoke', at, undefined, 14);
      this.projectiles.explode(at.clone().setY(0.3));
      this.hud.headline = {
        id: ++this.headlineId,
        text: fillHero('হলুদ গাড়ি দাউ দাউ করে জ্বলছে! পেছনে নাকি {hero}', this.identity),
      };
    } else this.particles.emit('smoke', at, undefined, 2);
  }

  /** Ramming the mission target with the player's vehicle. */
  private ramMissionCar(dt: number) {
    this.ramCd = Math.max(0, this.ramCd - dt);
    const v = this.driving;
    const c = this.traffic?.missionCar;
    if (!v || !c || this.ramCd > 0) return;
    const p = v.body.renderPos;
    const d = Math.hypot(p.x - c.pos.x, p.z - c.pos.z);
    const reach = v.def.chassisHalfExtents[2] + 2.3;
    if (d >= reach || d < 0.01) return;
    // Closing speed along the line between them (rear-end, head-on or T-bone)
    const nx = (c.pos.x - p.x) / d;
    const nz = (c.pos.z - p.z) / d;
    const vel = v.body.vel;
    const closing =
      vel.x * nx + vel.z * nz - c.speed * (Math.sin(c.yaw) * nx + Math.cos(c.yaw) * nz);
    if (closing > 4) {
      this.ramCd = 0.6;
      this.hitMissionCar(closing * 7);
      this.audio?.crash(Math.min(1, closing / 14));
      this.rig.addShake(0.3);
    }
  }

  /** Petrol pumps (refuel) and garages (repair + respray), low-fuel warnings. */
  private updateStations(dt: number) {
    const v = this.driving;
    const kind = v?.def.kind;
    const vk = kind === 'car' || kind === 'cng' || kind === 'bike' ? kind : null;
    const f = this.focusPos;
    const events = this.stationSys.update(dt, {
      x: f.x,
      z: f.z,
      vehicle: vk,
      speed: v ? Math.abs(v.speed) : 0,
      fuel: v?.cond.fuel ?? 1,
      damage: v ? totalDamage(v.cond) : 0,
      wanted: stars(this.crime),
      // Only a cop right at the door stops a respray (they spawn 30–55 m out)
      copNear: this.police.copNear(f, 20),
      taka: this.hud.taka,
    });
    for (const e of events) {
      if (e.type === 'fuel' && v) {
        v.cond.fuel = Math.min(1, v.cond.fuel + e.add);
        this.hud.taka = Math.max(0, this.hud.taka - e.cost);
        this.fuelSpent += e.cost;
        this.lowFuelWarned.delete(v);
      } else if (e.type === 'fuelDone') {
        this.audio?.coin();
        this.dialogue.say('pumpBoy', e.reason === 'full' ? 'fuelFull' : 'fuelBroke', null);
        this.fuelSpent = 0;
      } else if (e.type === 'service' && v) {
        this.hud.taka = Math.max(0, this.hud.taka - e.cost);
        if (e.repaired) {
          v.cond.damage = { front: 0, rear: 0, left: 0, right: 0 };
          this.audio?.coin();
        }
        if (e.resprayed) {
          this.crime.heat = 0;
          this.crime.calm = 0;
          this.police.standDown();
          v.visual.setPaint(RESPRAY_COLORS[Math.floor(Math.random() * RESPRAY_COLORS.length)]!);
          this.hud.headline = {
            id: ++this.headlineId,
            text: fillHero('রং বদলে গেল! পুলিশ এখন অন্য গাড়ি খুঁজতেছে — {hero} হাওয়া', this.identity),
          };
        }
        const line =
          e.note === 'seen'
            ? 'garageSeen'
            : e.note === 'broke'
              ? 'garageBroke'
              : e.note === 'nothing'
                ? 'garageNothing'
                : 'garageDone';
        this.dialogue.say('mechanic', line, null);
      }
      this.hudDirty = true;
    }
    // Status pill
    const cur = this.stationSys.current;
    let station: HudState['station'] = null;
    if (cur && v) {
      const s = cur.station;
      const pct = Math.round(v.cond.fuel * 100);
      const text =
        s.type === 'pump'
          ? cur.filling
            ? `তেল ভরা হচ্ছে… ${pct}% · ৳${Math.round(this.fuelSpent)}`
            : cur.wait === null
              ? `ট্যাংক ${pct}% — রাস্তায় নামো`
              : 'গাড়ি থামাও, তেল ভরবে'
          : cur.wait === null
            ? 'কাজ শেষ — বের হও'
            : Math.abs(v.speed) < 1.5
              ? `মেরামত ও রং হচ্ছে… ${Math.ceil(cur.wait)}`
              : 'ভেতরে থামাও: মেরামত + রং (ওয়ান্টেড মুছে যায়)';
      station = { type: s.type, name: s.name, text };
    }
    if (JSON.stringify(station) !== JSON.stringify(this.hud.station)) {
      this.hud.station = station;
      this.hudDirty = true;
    }
    // Low fuel
    if (v && v.cond.fuel < 0.15 && !this.lowFuelWarned.has(v)) {
      this.lowFuelWarned.add(v);
      if (!this.overlay)
        this.dialogue.say('hero', v.cond.fuel <= 0 ? 'outOfFuel' : 'lowFuel', this.hero);
    }
  }

  /** Testing/debug: set the player's cash. */
  debugMoney(taka: number) {
    this.hud.taka = Math.max(0, Math.round(taka));
    this.hudDirty = true;
  }

  /** Testing/debug: set the current vehicle's fuel (0..1). */
  debugFuel(f: number) {
    if (this.driving) this.driving.cond.fuel = Math.max(0, Math.min(1, f));
  }

  /** Load-shedding at night: lights out, people complain, crimes are seen less. */
  private updateBlackout(dt: number) {
    for (const e of this.blackout.update(dt, this.env.night)) {
      if (e.type === 'cut') this.onPowerCut();
      else {
        this.audio?.powerCut(false);
        if (!this.overlay) this.dialogue.say('hero', 'powerBack', this.hero, 0.3);
      }
    }
  }

  private onPowerCut() {
    this.hud.headline = {
      id: ++this.headlineId,
      text: 'লোডশেডিং! মোহাম্মদপুরে আবার কারেন্ট নাই — অন্ধকারে কেউ কিছু দেখে না',
    };
    this.hudDirty = true;
    this.audio?.powerCut(true);
    if (!this.overlay) this.dialogue.say('hero', 'blackout', this.hero, 0.4);
    const near = this.nearestTalker(16, 'blackout');
    if (near) this.dialogue.say(near.def.speaker, 'blackout', near.humanoid, 2.5);
  }

  /** Testing/debug: cut the power now. */
  debugBlackout(seconds = 30) {
    this.blackout.cut(seconds);
    this.onPowerCut();
  }

  /** Monsoon: rain streaks, wet roads, grey sky, thunder, people complaining. */
  private updateWeather(dt: number) {
    if (this.preset.rainDrops <= 0 && this.weather.mode === 'auto') return;
    for (const e of this.weather.update(dt)) {
      if (e.type === 'rainStart') {
        if (!this.overlay) this.dialogue.say('hero', 'rainStart', this.hero, 0.6);
        const near = this.nearestTalker(14, 'rain');
        if (near) this.dialogue.say(near.def.speaker, 'rain', near.humanoid, 3.5);
      } else if (e.type === 'thunder') {
        this.env.flash = e.distance < 0.5 ? 1 : 0.45;
        this.audio?.thunder(e.distance);
        if (e.distance < 0.25 && Math.random() < 0.5 && !this.overlay)
          this.dialogue.say('hero', 'thunder', this.hero, 1.2);
      }
    }
    const i = this.weather.intensity;
    this.wetness = this.weather.wetness(this.wetness, dt);
    this.env.wet = i;
    this.rain.update(dt, i, this.wetness, this.camera);
    this.audio?.setRain(i * (this.driving ? 0.7 : 1));
  }

  setPrefs(p: GamePrefs) {
    this.prefs = { ...p };
  }

  /** Short vibration on phones (no-op where unsupported or turned off). */
  private haptic(pattern: number | number[]) {
    if (!this.prefs.haptics || typeof navigator === 'undefined' || !navigator.vibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // Some browsers throw before the first user gesture
    }
  }

  setWeather(mode: WeatherMode) {
    this.weather.setMode(mode);
    if (mode === 'clear') {
      this.weather.intensity = Math.min(this.weather.intensity, 0.1);
    }
  }

  /** A pedestrian or street NPC near the player that has lines for `rain`. */
  private nearestTalker(r: number, situation: string): Npc | null {
    const me = this.driving ? this.driving.body.renderPos : this.player.renderPos;
    let best: Npc | null = null;
    let bd = r * r;
    const list = [...this.npcs, ...(this.peds?.active.map((p) => p.npc) ?? [])];
    for (const n of list) {
      if (!this.dialogue.has(n.def.speaker, situation)) continue;
      const d = n.position.distanceToSquared(me);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  /** Hide NPC / pedestrian / cop meshes that are off-screen or far (they skip frustum culling). */
  private cullActors() {
    this.camera.updateMatrixWorld();
    _projScreen.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreen);
    const cam = this.camera.position;
    const far = this.preset.chunkRadius >= 3 ? 110 : 75;
    let drawn = 0;
    const each = (h: { cull: Humanoid['cull'] }, on: boolean) => {
      if (on && h.cull(_frustum, cam, far)) drawn++;
    };
    for (const n of this.npcs) each(n.humanoid, n.humanoid.root.visible);
    for (const p of this.peds?.peds ?? []) each(p.npc.humanoid, p.active);
    for (const c of this.police.cops) each(c.npc.humanoid, c.active);
    this.actorsDrawn = drawn;
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
    const wet = this.wetness > 0.3;
    if ((skid > 0.2 || wheelspin) && !wet)
      this.particles.emit('dust', rear, v.body.vel.clone().multiplyScalar(-0.1));
    // Rooster tails of spray off wet tarmac
    if (wet && speed > 4 && Math.random() < this.wetness * Math.min(1, speed / 12)) {
      const up = new THREE.Vector3(0, 1.2 + speed * 0.05, 0);
      this.particles.emit('spray', rear, v.body.vel.clone().multiplyScalar(-0.15).add(up), 2);
    }
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
    const prompt = this.overlay
      ? null
      : this.driving
        ? Math.abs(this.driving.speed) <= MAX_EXIT_SPEED
          ? `নামো: ${this.driving.def.nameBn}`
          : null
        : this.nearest
          ? `ওঠো: ${this.nearest.def.nameBn}`
          : this.carjackCar
            ? `ছিনিয়ে নাও: ${CARJACK_NAMES[this.carjackCar.kind] ?? 'গাড়ি'}`
            : null;
    const mode = this.driving ? 'vehicle' : 'foot';
    if (!this.talkTarget || this.driving) this.talkOpen = false;
    const talkHint =
      !this.driving && this.talkTarget && !this.talkOpen
        ? (dialogue.speakers[this.talkTarget.def.speaker]?.name ?? '')
        : null;
    const talk =
      !this.driving && this.talkTarget && this.talkOpen
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
      talkHint !== this.hud.talkHint ||
      JSON.stringify(talk) !== JSON.stringify(this.hud.talk);
    if (changed || this.hudTimer <= 0) {
      const c = this.driving?.cond;
      this.hud = {
        ...this.hud,
        mode,
        prompt,
        talk,
        talkHint,
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
        health: Math.round(this.health),
        weapon: this.arsenal.weapon,
        weaponName: WEAPONS[this.arsenal.weapon].nameBn,
        ammo: this.arsenal.ammo,
        grenades: this.arsenal.grenades,
        arrest: +this.police.arrest.toFixed(2),
        overlay: this.overlay
          ? this.overlay.kind === 'wasted'
            ? { kind: 'wasted', title: 'খতম!', sub: 'হাসপাতালের বিল কাটা গেল' }
            : { kind: 'busted', title: 'ধরা খাইলা!', sub: 'থানায় "চা-পানি" দিয়া ছাড়া পাইলা' }
          : null,
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
        dmg: totalDamage(v.cond),
        spare: !!v.spare,
      })),
      npcs: this.npcs.map((n) => ({ id: n.def.id, pos: r(n.position) })),
      hour: +this.env.hour.toFixed(2),
      cityChunks: this.city?.loadedCount ?? 0,
      traffic: this.traffic?.activeCount ?? 0,
      peds: this.peds?.active.length ?? 0,
      actorsDrawn: this.actorsDrawn,
      rain: Math.round(this.weather.intensity * 100) / 100,
      blackout: this.blackout.active,
      talkOpen: this.talkOpen,
      talkToggles: this.talkToggles,
      station: this.hud.station,
      vehicleDmg: this.driving ? totalDamage(this.driving.cond) : null,
      fuel: this.driving ? +this.driving.cond.fuel.toFixed(3) : null,
      heat: +this.crime.heat.toFixed(2),
      target: this.traffic?.missionState
        ? {
            ...this.traffic.missionState,
            hp: this.traffic.missionCar?.hp ?? 0,
            yaw: +(this.traffic.missionCar?.yaw ?? 0).toFixed(3),
          }
        : null,
      wet: Math.round(this.wetness * 100) / 100,
      knocked: this.peds?.peds.filter((x) => x.active && x.state === 'knocked').length ?? 0,
      carjack: this.carjackCar?.kind ?? null,
      health: Math.round(this.health),
      weapon: this.arsenal.weapon,
      ammo: this.arsenal.ammo,
      grenades: this.arsenal.grenades,
      cops: this.police.activeCops.length,
      copPos: this.police.activeCops.map((c) => [
        +c.npc.position.x.toFixed(1),
        +c.npc.position.z.toFixed(1),
        c.state,
      ]),
      copsDown: this.police.activeCops.filter((c) => c.state === 'down').length,
      patrolCars: this.police.cars
        .filter((c) => c.active)
        .map((c) => ({
          pos: [Math.round(c.pos.x), Math.round(c.pos.z)],
          parked: c.parked,
          stuck: +c.stuck.toFixed(1),
        })),
      copList: this.police.activeCops.map((c) => ({
        state: c.state,
        pos: [Math.round(c.npc.position.x), Math.round(c.npc.position.z)],
      })),
      policeCars: this.police.cars.filter((c) => c.active).length,
      overlay: this.overlay?.kind ?? null,
      mission: this.missions.active
        ? {
            id: this.missions.active.def.id,
            step: this.missions.active.step,
            objective: this.missions.objective(),
          }
        : null,
      missionsDone: [...this.missions.done],
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

  // ---------------- Combat: fists, pistol, grenades; police; wasted / busted ----------------

  private combatInput(input: InputManager) {
    if (input.pressed('weapon')) {
      this.arsenal.weapon = nextWeapon(this.arsenal);
      this.hudDirty = true;
    }
    const w = this.arsenal.weapon;
    this.aiming = w === 'pistol' && input.isDown('aim');
    if (input.pressed('melee')) this.punch();
    else if (input.pressed('fire')) {
      if (w === 'fist') this.punch();
      else if (w === 'pistol') this.shoot();
      else this.throwGrenade();
    }
    if (input.pressed('throw') && this.arsenal.grenades > 0) this.throwGrenade();
    // Touch auto-fire: shoot when a cop is under the crosshair (only while wanted)
    if (
      this.prefs.autoFire &&
      input.lastDevice === 'touch' &&
      w === 'pistol' &&
      this.arsenal.ammo > 0 &&
      this.fireCd <= 0 &&
      stars(this.crime) > 0 &&
      this.autoFireTarget()
    )
      this.shoot();
  }

  /** A standing cop in front of the camera, within pistol range, in line of sight. */
  private autoFireTarget(): boolean {
    const t = this.pickAimTarget();
    if (!t) return false;
    return this.police.cops.some(
      (c) => c.active && c.state !== 'down' && c.npc.position.distanceTo(t) < 2,
    );
  }

  private get chest(): THREE.Vector3 {
    const p = this.player.renderPos;
    return new THREE.Vector3(p.x, p.y - CAPSULE_CENTER + 1.4, p.z);
  }

  /** Everything a bullet or fist can hit. */
  private targets(): Array<{ pos: THREE.Vector3; cop?: Cop; ped?: Pedestrian; npc?: Npc }> {
    const out: Array<{ pos: THREE.Vector3; cop?: Cop; ped?: Pedestrian; npc?: Npc }> = [];
    for (const c of this.police.cops)
      if (c.active && c.state !== 'down')
        out.push({ pos: c.npc.position.clone().setY(1.1), cop: c });
    for (const p of this.peds?.peds ?? [])
      if (p.active && p.state !== 'knocked' && p.state !== 'getup')
        out.push({ pos: p.npc.position.clone().setY(1.1), ped: p });
    for (const n of this.npcs)
      out.push({ pos: n.position.clone().setY(n.position.y + 1.1), npc: n });
    return out;
  }

  private punch() {
    if (this.fireCd > 0) return;
    this.fireCd = WEAPONS.fist.cooldown;
    this.hero.punch();
    this.guardTimer = 4;
    const fwd = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    const me = this.player.renderPos;
    let hit = false;
    for (const t of this.targets()) {
      const to = t.pos.clone().sub(me).setY(0);
      const d = to.length();
      if (d > WEAPONS.fist.range || (d > 0.3 && to.normalize().dot(fwd) < 0.5)) continue;
      hit = true;
      this.hitTarget(t, WEAPONS.fist.damage, this.facing, 'punch');
      break;
    }
    this.audio?.punch(hit);
    if (hit) {
      this.rig.addShake(0.12);
      if (Math.random() < 0.3 && !this.dialogue.busy) this.dialogue.say('hero', 'punch', this.hero);
    }
  }

  private hitTarget(
    t: { pos: THREE.Vector3; cop?: Cop; ped?: Pedestrian; npc?: Npc },
    damage: number,
    yaw: number,
    how: 'punch' | 'bullet',
  ) {
    if (t.cop) {
      const down = this.police.hurt(t.cop, damage, yaw);
      if (!down) t.cop.npc.humanoid.hitReact(Math.random() < 0.5);
      this.crimeEvent('copAssault');
      if (!this.dialogue.busy || down)
        this.dialogue.interrupt('police', down ? 'hurt' : 'hit', t.cop.npc.humanoid);
    } else if (t.ped && this.peds) {
      this.peds.knock(t.ped, yaw, how === 'bullet' ? 30 : 3.5);
      t.ped.npc.position.add(
        new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(0.5),
      );
      this.crimeEvent('assault');
      if (how === 'punch')
        this.dialogue.interrupt(t.ped.npc.def.speaker, 'punched', t.ped.npc.humanoid);
      this.peds.scareAll(t.pos, 12, 6);
    } else if (t.npc) {
      t.npc.fear = 1;
      t.npc.humanoid.hitReact(Math.random() < 0.5);
      t.npc.humanoid.setEmotion('scared', 6);
      this.crimeEvent('assault');
      this.dialogue.interrupt(t.npc.def.speaker, 'threatenReply', t.npc.humanoid);
    }
  }

  /** Auto-aim: the most central threat in front of the camera (cops first). */
  private pickAimTarget(): THREE.Vector3 | null {
    const [fx, fz] = this.rig.forward;
    const me = this.chest;
    let best: THREE.Vector3 | null = null;
    let bestScore = -Infinity;
    for (const t of this.targets()) {
      const to = t.pos.clone().sub(me);
      const d = to.length();
      if (d > 28 || d < 0.5) continue;
      const cos = (to.x * fx + to.z * fz) / Math.hypot(to.x, to.z);
      if (cos < 0.82) continue;
      if (raycastAABBs(me.x, me.y, me.z, to.x / d, to.y / d, to.z / d, d, this.cityBoxes) < d)
        continue;
      const score = cos * 2 - d * 0.03 + (t.cop ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = t.pos;
      }
    }
    return best;
  }

  private shoot() {
    if (this.fireCd > 0) return;
    if (this.arsenal.ammo <= 0) {
      this.audio?.click();
      this.arsenal.weapon = nextWeapon(this.arsenal);
      this.hudDirty = true;
      return;
    }
    this.fireCd = WEAPONS.pistol.cooldown;
    this.arsenal.ammo -= 1;
    this.hudDirty = true;
    const o = this.chest;
    let dir: THREE.Vector3;
    if (this.aiming) {
      // Through the crosshair: camera ray → first thing hit → direction from the gun
      const cd = new THREE.Vector3();
      this.camera.getWorldDirection(cd);
      const cp = this.camera.position;
      const far = Math.min(
        80,
        raycastAABBs(cp.x, cp.y, cp.z, cd.x, cd.y, cd.z, 80, this.cityBoxes),
      );
      dir = cp.clone().addScaledVector(cd, far).sub(o).normalize();
    } else {
      const t = this.pickAimTarget();
      if (t) dir = t.clone().sub(o).normalize();
      else {
        const [fx, fz] = this.rig.forward;
        dir = new THREE.Vector3(fx, -0.02, fz).normalize();
      }
    }
    // A little spread when firing from the hip
    if (!this.aiming)
      dir
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.03,
            (Math.random() - 0.5) * 0.02,
            (Math.random() - 0.5) * 0.03,
          ),
        )
        .normalize();
    this.facing = Math.atan2(dir.x, dir.z);
    this.hero.aiming = true;
    this.aimHold = 0.6;
    const range = WEAPONS.pistol.range;
    let best = Math.min(
      range,
      raycastAABBs(o.x, o.y, o.z, dir.x, dir.y, dir.z, range, this.cityBoxes),
    );
    let hit: ReturnType<SliceScene['targets']>[number] | null = null;
    for (const t of this.targets()) {
      const d = raySphere(o, dir, t.pos, 0.45);
      if (d !== null && d < best) {
        best = d;
        hit = t;
      }
    }
    let car: TrafficCar | null = null;
    for (const c of this.traffic?.cars ?? []) {
      if (!c.active) continue;
      const d = raySphere(o, dir, new THREE.Vector3(c.pos.x, 0.9, c.pos.z), 1.4);
      if (d !== null && d < best) {
        best = d;
        car = c;
        hit = null;
      }
    }
    const end = o.clone().addScaledVector(dir, best);
    const muzzle = o
      .clone()
      .addScaledVector(dir, 0.55)
      .add(
        new THREE.Vector3(Math.cos(this.facing), 0, -Math.sin(this.facing)).multiplyScalar(-0.2),
      );
    this.projectiles.shot(muzzle, end);
    this.audio?.gunshot(0);
    this.haptic(15);
    this.rig.addShake(0.18);
    this.rig.pitch = Math.max(-0.6, this.rig.pitch - 0.015); // recoil kick
    if (hit) this.hitTarget(hit, WEAPONS.pistol.damage, Math.atan2(dir.x, dir.z), 'bullet');
    else if (car) {
      if (car.mission) this.hitMissionCar(20);
      this.traffic?.stunNear(car.pos.x, car.pos.z, 4, 6);
      this.particles.emit('debris', end, undefined, 5);
    } else if (best < range) this.particles.emit('dust', end, undefined, 3);
    // Gunfire terrifies the street
    this.peds?.scareAll(o, 45, 8);
    this.traffic?.stunNear(o.x, o.z, 25, 2.5);
    if (this.shootCrimeCd <= 0) {
      this.shootCrimeCd = 6;
      this.crimeEvent('shooting');
      const ped = this.peds?.active.find((p) => p.npc.position.distanceTo(o) < 25);
      if (ped) this.dialogue.interrupt(ped.npc.def.speaker, 'gunfire', ped.npc.humanoid);
      else if (Math.random() < 0.4) this.dialogue.say('hero', 'shoot', this.hero);
    }
  }

  private aimHold = 0;

  private throwGrenade() {
    if (this.fireCd > 0 || this.arsenal.grenades <= 0) return;
    this.fireCd = WEAPONS.grenade.cooldown;
    this.arsenal.grenades -= 1;
    if (this.arsenal.grenades <= 0 && this.arsenal.weapon === 'grenade')
      this.arsenal.weapon = nextWeapon(this.arsenal);
    this.hudDirty = true;
    const [fx, fz] = this.rig.forward;
    this.facing = Math.atan2(fx, fz);
    this.hero.throwArm();
    const from = this.chest.add(new THREE.Vector3(fx * 0.4, 0.4, fz * 0.4));
    // Throw harder when the camera looks up
    const up = 4.5 + Math.max(0, -this.rig.pitch) * 6;
    this.projectiles.throwGrenade(
      from,
      new THREE.Vector3(fx * 11, up, fz * 11).add(this.player.vel.clone().setY(0)),
    );
    if (Math.random() < 0.5) this.dialogue.say('hero', 'grenade', this.hero);
  }

  private explosion(at: THREE.Vector3) {
    const R = WEAPONS.grenade.range;
    const focus = this.focusPos;
    const dist = at.distanceTo(focus);
    this.audio?.explosion(dist);
    if (dist < 25) this.haptic([60, 30, Math.round(120 - dist * 3)]);
    this.rig.addShake(Math.min(1.2, 14 / (dist + 4)));
    this.particles.emit('debris', at.clone().setY(0.3), undefined, 22);
    this.particles.emit('blackSmoke', at.clone().setY(0.6), undefined, 10);
    this.particles.emit('dust', at, undefined, 12);
    this.crimeEvent('shooting');
    // People
    for (const p of this.peds?.peds ?? []) {
      if (!p.active) continue;
      const d = p.npc.position.distanceTo(at);
      if (d < R) {
        this.peds?.knock(p, Math.atan2(p.npc.position.x - at.x, p.npc.position.z - at.z), 20);
        p.npc.position.add(
          p.npc.position
            .clone()
            .sub(at)
            .setY(0)
            .normalize()
            .multiplyScalar(blastFalloff(d, R) * 3),
        );
      }
    }
    this.peds?.scareAll(at, 50, 10);
    for (const c of this.police.cops) {
      if (!c.active) continue;
      const d = c.npc.position.distanceTo(at);
      if (d < R)
        this.police.hurt(
          c,
          WEAPONS.grenade.damage * blastFalloff(d, R) + 20,
          Math.atan2(c.npc.position.x - at.x, c.npc.position.z - at.z),
        );
    }
    for (const n of this.npcs) {
      if (n.position.distanceTo(at) < R * 2) {
        n.fear = 1;
        n.humanoid.setEmotion('scared', 8);
      }
    }
    this.traffic?.stunNear(at.x, at.z, 35, 6);
    const mc = this.traffic?.missionCar;
    if (mc) {
      const d = Math.hypot(mc.pos.x - at.x, mc.pos.z - at.z);
      if (d < R * 1.5) this.hitMissionCar(120 * blastFalloff(d, R * 1.5) + 30);
    }
    // Vehicles get thrown and damaged
    for (const v of this.vehicles) {
      const d = v.body.renderPos.distanceTo(at);
      if (d > R * 1.3 || v.body.renderPos.y < STASH_Y + 20) continue;
      const k = blastFalloff(d, R * 1.3);
      const away = v.body.renderPos.clone().sub(at).setY(0).normalize();
      const mass = v.def.mass;
      this.impulses.push({
        bodyId: v.id,
        x: away.x * mass * 9 * k,
        y: mass * 7 * k,
        z: away.z * mass * 9 * k,
        torque: [away.z * mass * 3 * k, 0, -away.x * mass * 3 * k],
      });
      const local = at.clone().sub(v.body.renderPos).applyQuaternion(v.body.quat.clone().invert());
      applyImpact(v.cond, impactZone(local.x, local.z), 30 * k + 5, 1.5);
      this.hudDirty = true;
    }
    // The player
    const pd = this.driving ? dist : this.player.renderPos.distanceTo(at);
    if (pd < R) this.damagePlayer((this.driving ? 45 : 110) * blastFalloff(pd, R), at);
  }

  private damagePlayer(amount: number, from?: THREE.Vector3) {
    if (this.overlay || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.hurtCalm = 0;
    this.hud.hurtId += 1;
    this.haptic(Math.min(120, 25 + amount * 3));
    this.rig.addShake(Math.min(0.5, amount / 40));
    if (!this.driving && amount > 5) this.hero.setEmotion('angry', 2);
    if (from && !this.driving) this.particles.emit('dust', this.player.renderPos, undefined, 2);
    this.hudDirty = true;
    if (this.health <= 0) this.wasted();
  }

  private wasted() {
    if (this.overlay) return;
    if (this.driving) this.toggleVehicle(true);
    this.overlay = { kind: 'wasted', t: 5 };
    this.haptic([200, 80, 300]);
    this.aiming = false;
    this.hero.aiming = false;
    this.dialogue.interrupt('hero', 'wasted', this.hero);
    this.audio?.setSiren(0);
    this.hudDirty = true;
  }

  private busted() {
    if (this.overlay) return;
    if (this.driving) this.toggleVehicle(true);
    this.overlay = { kind: 'busted', t: 5 };
    this.haptic([80, 60, 80]);
    this.aiming = false;
    this.hero.aiming = false;
    this.hero.handsUp = true;
    this.dialogue.interrupt('police', 'arrest', null);
    this.dialogue.say('hero', 'arrested', this.hero, 0.4);
    this.hudDirty = true;
  }

  /** Back on the street after death (hospital) or arrest (thana). */
  private respawn() {
    const kind = this.overlay?.kind;
    this.overlay = null;
    this.deathFall = 0;
    this.hero.handsUp = false;
    this.health = 100;
    this.crime.heat = 0;
    this.crime.calm = 0;
    this.police.clearAll();
    if (kind === 'wasted')
      this.hud.taka = Math.max(0, this.hud.taka - Math.min(this.hud.taka, 200));
    else {
      this.hud.taka = Math.max(0, this.hud.taka - Math.min(this.hud.taka, 300));
      this.arsenal.ammo = 0; // police keep the gun's bullets
      if (this.arsenal.weapon === 'pistol') this.arsenal.weapon = 'fist';
    }
    const spawn = this.street.points.spawn!;
    const p = new THREE.Vector3(...spawn);
    this.pendingTeleport = [p.x, p.y, p.z];
    this.player.snap(p);
    this.moveVel.set(0, 0);
    this.hero.root.rotation.set(0, this.facing, 0, 'YXZ');
    this.dialogue.say('hero', 'respawn', this.hero, 0.8);
    this.hudDirty = true;
  }

  private updateCombat(dt: number) {
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.shootCrimeCd = Math.max(0, this.shootCrimeCd - dt);
    this.aimHold = Math.max(0, this.aimHold - dt);
    this.hero.aiming = !this.driving && !this.overlay && (this.aiming || this.aimHold > 0);
    this.hero.setGun(!this.driving && this.arsenal.weapon === 'pistol');
    this.projectiles.update(dt, this.cityBoxes);

    // Health: slow regeneration up to 50 after a quiet spell (GTA-style)
    this.hurtCalm += dt;
    if (!this.overlay && this.hurtCalm > 8 && this.health < 50) {
      this.health = Math.min(50, this.health + dt * 2);
      this.hudDirty = true;
    }

    // Overlay (wasted / busted) countdown
    if (this.overlay) {
      this.overlay.t -= dt;
      if (this.overlay.kind === 'wasted') this.deathFall = Math.min(1, this.deathFall + dt * 3);
      if (this.overlay.t <= 0) this.respawn();
    }

    const focus = this.focusPos;
    const boxes = this.cityBoxes;
    const events = this.police.update(dt, {
      stars: stars(this.crime),
      player: focus,
      inVehicle: !!this.driving,
      playerSpeed: this.driving
        ? Math.abs(this.driving.speed)
        : Math.hypot(this.player.vel.x, this.player.vel.z),
      frozen: !!this.overlay,
      blocked: (x, z) => {
        for (const b of boxes)
          if (x > b[0] - 0.3 && x < b[3] + 0.3 && z > b[2] - 0.3 && z < b[5] + 0.3 && b[4] > 0.5)
            return true;
        return false;
      },
    });
    for (const e of events) {
      if (e.type === 'shot') {
        const d = e.from.distanceTo(focus);
        this.audio?.gunshot(d);
        const target = focus.clone().setY(focus.y + (this.driving ? 0.3 : 0));
        if (!e.hit)
          target.add(
            new THREE.Vector3(
              (Math.random() - 0.5) * 3,
              Math.random() * 1.5,
              (Math.random() - 0.5) * 3,
            ),
          );
        this.projectiles.shot(
          e.from.clone().add(target.clone().sub(e.from).normalize().multiplyScalar(0.6)),
          target,
        );
        this.peds?.scareAll(e.from, 35, 6);
        if (e.hit) {
          if (this.driving) {
            applyImpact(this.driving.cond, 'front', 4, 1);
            this.damagePlayer(3 + Math.random() * 3, e.from);
          } else this.damagePlayer(7 + Math.random() * 6, e.from);
        }
      } else if (e.type === 'arrest') {
        this.busted();
      } else if (e.type === 'bark' && !this.dialogue.busy) {
        this.dialogue.say('police', e.situation, e.cop?.npc.humanoid ?? null);
      }
    }
    // Siren: nearest patrol car
    let dCar = Infinity;
    for (const c of this.police.cars)
      if (c.active) dCar = Math.min(dCar, Math.hypot(c.pos.x - focus.x, c.pos.z - focus.z));
    const s = stars(this.crime);
    this.audio?.setSiren(this.overlay || s === 0 ? 0 : Math.max(s >= 2 ? 0.2 : 0, 1 - dCar / 140));
    if (Math.abs(this.police.arrest - this.hud.arrest) > 0.05) this.hudDirty = true;
  }

  // ---------------- Missions ----------------

  private card(kind: 'start' | 'pass' | 'fail', title: string, sub: string) {
    this.hud.missionCard = { id: ++this.cardId, kind, title, sub };
    this.hudDirty = true;
  }

  private updateMissions(dt: number) {
    const f = this.focusPos;
    const kind = this.driving?.def.kind;
    const events = this.missions.update(dt, {
      x: f.x,
      z: f.z,
      vehicle: kind === 'car' || kind === 'cng' || kind === 'bike' ? kind : null,
      kmh: this.driving ? Math.abs(this.driving.speed) * 3.6 : 0,
      vehicleDamage: this.driving ? totalDamage(this.driving.cond) : 0,
      target: this.traffic?.missionState ?? null,
      wanted: stars(this.crime),
      down: !!this.overlay,
    });
    for (const e of events) this.onMissionEvent(e);
    const starts = this.missions.active ? [] : this.missions.available().map((m) => m.start);
    this.markers.update(dt, starts, this.missions.target());
    this.missionHudTimer -= dt;
    if (this.missionHudTimer <= 0 || events.length) {
      this.missionHudTimer = 0.25;
      const a = this.missions.active;
      const t = this.missions.target();
      const next = a
        ? {
            title: a.def.title,
            objective: this.missions.objective() ?? '',
            time: a.timeLeft === null ? null : Math.ceil(a.timeLeft),
            target: t ? ([t.x, t.z] as [number, number]) : null,
          }
        : null;
      const blips = starts.map((s) => [s.x, s.z] as [number, number]);
      if (
        JSON.stringify(next) !== JSON.stringify(this.hud.mission) ||
        blips.length !== this.hud.missionBlips.length ||
        this.missions.done.size !== this.hud.missionsDone
      ) {
        this.hud.mission = next;
        this.hud.missionBlips = blips;
        this.hud.missionsDone = this.missions.done.size;
        this.hudDirty = true;
      }
    }
  }

  private onMissionEvent(e: MissionEvent) {
    switch (e.type) {
      case 'start': {
        const m = e.mission;
        this.card('start', m.title, m.time ? `সময়: ${Math.round(m.time / 60)} মিনিট` : 'মিশন শুরু');
        const giver =
          this.npcs.find((n) => n.def.speaker === m.giver)?.humanoid ??
          (m.giver === 'hero' ? this.hero : null);
        this.dialogue.sayLine(
          {
            id: `mission.${m.id}.intro`,
            speaker: m.giver,
            situation: 'missionIntro',
            emotion: 'smug',
            bn: m.intro,
            en: m.introEn ?? '',
          },
          giver,
          0,
          true,
        );
        this.dialogue.say('hero', 'missionStart', this.hero, 0.3);
        this.audio?.coin();
        break;
      }
      case 'spawnTarget': {
        const t = e.mission.target;
        if (t && this.traffic?.spawnMission(t.kind, t.x, t.z)) {
          this.hud.headline = {
            id: ++this.headlineId,
            text: 'হলুদ গাড়িটা খুঁজে বের করো — মিনিম্যাপে নীল দাগ',
          };
        }
        break;
      }
      case 'step':
        this.audio?.coin();
        break;
      case 'heat':
        this.crime.heat = Math.max(this.crime.heat, e.amount);
        this.crime.calm = 0;
        this.hud.headline = {
          id: ++this.headlineId,
          text: fillHero(
            e.headline ?? 'থানার সামনে সেলফি! {hero}-কে ধরতে পুলিশের দৌড়',
            this.identity,
          ),
        };
        break;
      case 'pass': {
        this.traffic?.clearMission();
        const r = e.mission.reward;
        this.hud.taka += r.taka;
        if (r.ammo) this.arsenal.ammo += r.ammo;
        if (r.grenades) this.arsenal.grenades += r.grenades;
        if (r.love) this.hud.publicLove += r.love;
        const extra = [r.ammo ? `+${r.ammo} গুলি` : '', r.grenades ? `+${r.grenades} গ্রেনেড` : '']
          .filter(Boolean)
          .join(' · ');
        this.card(
          'pass',
          'মিশন পাস!',
          `${e.mission.title} · +৳${r.taka}${extra ? ' · ' + extra : ''}`,
        );
        this.dialogue.interrupt('hero', 'missionPass', this.hero);
        if (this.dialogue.has(e.mission.giver, 'missionPass'))
          this.dialogue.say(e.mission.giver, 'missionPass', null, 2.5);
        this.audio?.coin();
        break;
      }
      case 'fail':
        this.traffic?.clearMission();
        this.card(
          'fail',
          'মিশন ফেল',
          e.reason === 'time'
            ? 'সময় শেষ!'
            : e.reason === 'damage'
              ? 'মিষ্টি সব ভর্তা হয়ে গেছে!'
              : e.reason === 'lost'
                ? 'হলুদ গাড়িটা হারিয়ে গেছে!'
                : e.reason === 'spotted'
                  ? 'বেশি কাছে গেছিলা — ধরা পড়ে গেছো!'
                  : e.reason === 'destroyed'
                    ? 'আরে! পিছু নিতে বলছিলাম, উড়াইতে না!'
                    : e.mission.title,
        );
        if (e.reason !== 'down' && e.reason !== 'debug')
          this.dialogue.interrupt('hero', 'missionFail', this.hero);
        break;
    }
    this.hudDirty = true;
  }

  /** Testing/debug: start a mission by id (anywhere) or mark it passed. */
  debugMission(id: string, pass = false): boolean {
    const def = MISSIONS.find((m) => m.id === id);
    if (!def) return false;
    if (pass) {
      this.missions.done.add(id);
      this.hudDirty = true;
      return true;
    }
    if (this.missions.active) this.missions.fail('debug');
    this.onMissionEvent(this.missions.start(def));
    for (const x of this.missions.startExtras(def)) this.onMissionEvent(x);
    return true;
  }

  /** Testing/debug: set the wanted level directly. */
  debugSetWanted(n: number) {
    this.crime.heat = Math.max(0, Math.min(5, n));
    this.crime.calm = 0;
    this.hudDirty = true;
  }

  /** Testing/debug: fire / punch / throw once with a given weapon. */
  debugAttack(weapon: WeaponId): boolean {
    if (this.driving || this.overlay) return false;
    this.arsenal.weapon = weapon;
    this.fireCd = 0;
    if (weapon === 'fist') this.punch();
    else if (weapon === 'pistol') this.shoot();
    else this.throwGrenade();
    return true;
  }

  /** Testing/debug: explode a grenade at an offset from the player. */
  debugExplode(dx: number, dz: number) {
    const p = this.focusPos;
    this.projectiles.explode(new THREE.Vector3(p.x + dx, 0.2, p.z + dz));
  }

  /** Testing/debug: take damage. */
  debugDamage(n: number) {
    this.damagePlayer(n);
  }

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
    // Every street vehicle (driven, parked or abandoned) blocks traffic, so traffic never
    // drives through a parked car (kinematic traffic would shove and wreck it).
    for (const v of this.vehicles) {
      if (v.body.renderPos.y < STASH_Y + 20) continue;
      obstacles.push({
        x: v.body.renderPos.x,
        z: v.body.renderPos.z,
        radius: v.def.chassisHalfExtents[2],
        halfWidth: v.def.chassisHalfExtents[0],
      });
    }
    if (!this.driving)
      obstacles.push({ x: this.player.renderPos.x, z: this.player.renderPos.z, radius: 0.5 });
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
    const heat0 = this.crime.heat;
    commitCrime(this.crime, kind);
    // In a blackout fewer people see it
    if (this.blackout.active) this.crime.heat = heat0 + (this.crime.heat - heat0) * 0.5;
    this.missions.notifyCrime(kind);
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
      this.police.standDown();
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
      ammo: this.arsenal.ammo,
      grenades: this.arsenal.grenades,
      health: Math.round(this.health),
      missions: [...this.missions.done],
    };
  }

  importSave(s: Partial<SaveData>) {
    if (typeof s.taka === 'number') this.hud.taka = Math.max(0, Math.floor(s.taka));
    if (typeof s.notoriety === 'number') this.hud.notoriety = Math.max(0, Math.floor(s.notoriety));
    if (typeof s.publicLove === 'number')
      this.hud.publicLove = Math.max(0, Math.floor(s.publicLove));
    if (typeof s.hour === 'number') this.setHour(s.hour);
    if (typeof s.ammo === 'number')
      this.arsenal.ammo = Math.max(0, Math.min(999, Math.floor(s.ammo)));
    if (typeof s.grenades === 'number')
      this.arsenal.grenades = Math.max(0, Math.min(20, Math.floor(s.grenades)));
    if (typeof s.health === 'number') this.health = Math.max(20, Math.min(100, s.health));
    if (Array.isArray(s.missions))
      for (const id of s.missions)
        if (MISSIONS.some((m) => m.id === id)) this.missions.done.add(id);
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

  /** Testing/debug: turn the camera (and aim) toward a world point; returns its distance. */
  debugFace(x: number, z: number): number {
    const me = this.player.renderPos;
    this.rig.yaw = Math.atan2(-(x - me.x), -(z - me.z));
    return +Math.hypot(x - me.x, z - me.z).toFixed(1);
  }

  /** Testing/debug: turn the camera toward the nearest standing cop; returns its distance. */
  debugFaceCop(): number | null {
    const me = this.player.renderPos;
    let best: Cop | null = null;
    let bd = Infinity;
    for (const c of this.police.activeCops) {
      if (c.state === 'down') continue;
      const d = c.npc.position.distanceTo(me);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (!best) return null;
    this.rig.yaw = Math.atan2(-(best.npc.position.x - me.x), -(best.npc.position.z - me.z));
    return +bd.toFixed(1);
  }

  /** Testing/debug: move the vehicle being driven to (x, z) facing `yaw` (keeps the player in it). */
  debugDriveTo(x: number, z: number, yaw = 0): boolean {
    const v = this.driving;
    if (!v) return false;
    const y = v.def.kind === 'bike' ? 0.85 : 0.95;
    v.tp = { x, y, z, yaw, sent: false, frames: 0 };
    const at = new THREE.Vector3(x, y, z);
    v.body.snap(at);
    v.body.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    v.body.renderQuat.copy(v.body.quat);
    this.rig.yaw = yaw + Math.PI;
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
    // 'ped' = the nearest walking pedestrian that can still be robbed
    const npc =
      npcId === 'ped'
        ? ([...(this.peds?.active ?? [])]
            .map((p) => p.npc)
            .filter((n) => n.snatchCooldown <= 0)
            .sort(
              (a, b) =>
                a.position.distanceToSquared(this.player.renderPos) -
                b.position.distanceToSquared(this.player.renderPos),
            )[0] ?? null)
        : this.npcs.find((n) => n.def.id === npcId);
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
    this.rain.dispose();
    this.stationProps.dispose();
    this.boards.dispose();
    this.city?.dispose();
    this.traffic?.dispose();
    this.peds?.dispose();
    this.police.dispose();
    this.projectiles.dispose();
    this.markers.dispose();
    this.ballMesh.geometry.dispose();
    (this.ballMesh.material as THREE.Material).dispose();
  }
}
