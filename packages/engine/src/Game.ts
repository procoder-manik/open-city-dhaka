import * as THREE from 'three/webgpu';
import { cdl, float, pass, vec3, vec4 } from 'three/tsl';
import { vignette } from 'three/addons/tsl/display/CRT.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { qualityPresets } from '@game/content';
import type { HeroIdentity, QualityTier } from '@game/shared';
import type { TalkOption } from './actors/Npc';
import { AudioEngine } from './audio/AudioEngine';
import { VoicePlayer, type VoiceMode } from './audio/VoicePlayer';
import { FixedStepLoop } from './core/FixedStepLoop';
import { InputManager } from './input/InputManager';
import { PhysicsClient } from './physics/PhysicsClient';
import { detectDevice, type DeviceInfo } from './platform/device';
import { DynamicResolution } from './platform/DynamicResolution';
import { pickQualityTier } from './platform/quality';
import { createRenderer, renderStats } from './render/createRenderer';
import { SliceScene, type SaveData } from './scenes/SliceScene';
import { loadCity, type CityBundle } from './world/city/CityData';
import { createGameStore, type GameStore } from './state/store';
import { setBanglaFont } from './world/textures';

export interface GameOptions {
  /** Element the canvas is mounted into (also the fullscreen root). */
  container: HTMLElement;
  /** Override auto-detected quality. */
  tier?: QualityTier;
  forceWebGL?: boolean;
  /** Creates the physics Web Worker (app-owned entry). Omit to run physics on the main thread. */
  createPhysicsWorker?: () => Worker;
  /** Base URL of the streamed city map (null = only the hand-built block). */
  mapBase?: string | null;
  /** Hero title + name (signed-in players can customise; guests get the default). */
  hero?: HeroIdentity;
  /** CSS font-family of the loaded Bangla web font (for signboards). */
  banglaFont?: string;
  /** Player pressed pause (Esc / Start / HUD). Back-gesture & tab-hide come from GameLock in the app. */
  onPauseRequest?: () => void;
}

export interface Game {
  readonly store: GameStore;
  readonly input: InputManager;
  readonly device: DeviceInfo;
  readonly canvas: HTMLCanvasElement;
  /** Positions etc. for debugging/tests. */
  debugInfo(): Record<string, unknown>;
  /** Debug: set time of day (0–24). */
  setHour(hour: number): void;
  /** Debug/tests: get into a vehicle by definition id (e.g. 'car-sedan'). */
  debugEnterVehicle(defId: string): boolean;
  /** Debug/tests: place the player and camera. */
  debugView(x: number, z: number, yaw: number, pitch?: number): void;
  /** Debug/tests: talk to an NPC by id from anywhere. */
  debugTalk(npcId: string, option: TalkOption): boolean;
  debugCarjack(): string | null;
  debugKnockPedestrian(): boolean;
  debugSetWanted(n: number): void;
  debugAttack(weapon: 'fist' | 'pistol' | 'grenade'): boolean;
  debugExplode(dx: number, dz: number): void;
  debugDamage(n: number): void;
  debugMission(id: string, pass?: boolean): boolean;
  /** Pick a talk option for the NPC in front of the player. */
  chooseTalk(option: TalkOption): boolean;
  setMuted(muted: boolean): void;
  /** Phone the OC and pay a bribe to clear the wanted level. */
  bribe(): 'paid' | 'refused' | 'clean';
  /** Spend good-deed points to wipe crimes off the record. */
  redeemGoodDeeds(): number;
  /** Change the hero's title/name (the app only allows this for signed-in players). */
  setHeroIdentity(id: HeroIdentity): void;
  /** Progress to store (cloud for signed-in players, browser for guests). */
  exportSave(): SaveData;
  importSave(data: Partial<SaveData>): void;
  /** Voice source: auto (generated files → device AI), device AI, or off. */
  setVoiceMode(mode: VoiceMode): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}

const STATS_INTERVAL_MS = 500;

async function waitForFont(family: string | undefined) {
  if (!family || !document.fonts?.load) return;
  try {
    await Promise.race([
      document.fonts.load(`700 40px ${family}`, 'বাংলা'),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* fall back to system Bangla fonts */
  }
}

export async function createGame(opts: GameOptions): Promise<Game> {
  const device = detectDevice();
  const tier = opts.tier ?? pickQualityTier(device);
  const preset = qualityPresets[tier];
  const store = createGameStore(tier);
  store.setState({ status: 'loading' });

  setBanglaFont(opts.banglaFont);
  await waitForFont(opts.banglaFont);

  const { renderer, backend } = await createRenderer(preset, {
    forceWebGL: opts.forceWebGL ?? false,
  });
  const canvas = renderer.domElement as HTMLCanvasElement;
  opts.container.appendChild(canvas);

  const initialInput = device.formFactor === 'desktop' ? 'keyboard' : 'touch';
  const input = new InputManager(
    canvas,
    { onDeviceChange: (d) => store.setState({ lastInput: d }) },
    initialInput,
  );
  store.setState({ lastInput: initialInput });
  const requestPause = () => opts.onPauseRequest?.();

  // Audio (Web Audio). Browsers unlock it on a user gesture — we resume on any input.
  let audio: AudioEngine | null = null;
  try {
    audio = new AudioEngine();
    audio.resume();
  } catch (err) {
    console.warn('[audio] unavailable:', err);
  }
  const unlockAudio = () => audio?.resume();
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  const voice = new VoicePlayer();
  await Promise.race([voice.init(), new Promise((r) => setTimeout(r, 1500))]);
  store.setState({
    voiceMode: voice.mode,
    voiceEffective: voice.effective,
    deviceBangla: voice.hasDeviceBangla,
  });

  // Real Mohammadpur map (OpenStreetMap). Falls back to the hand-built block if it can't load.
  let city: CityBundle | null = null;
  const mapBase = opts.mapBase === undefined ? '/assets/map/mohammadpur' : opts.mapBase;
  if (mapBase) {
    try {
      city = await Promise.race([
        loadCity(mapBase),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('map timeout')), 15000)),
      ]);
    } catch (err) {
      console.warn('[map] city unavailable, using the street block only:', err);
    }
  }

  const world = new SliceScene(preset, (hud) => store.setState(hud), audio, voice, city);
  if (opts.hero) world.setIdentity(opts.hero);
  const physics = new PhysicsClient();
  const physicsMode = await physics.init(
    world.bodies,
    world.vehicleBodies,
    9.81,
    opts.createPhysicsWorker,
  );

  // Post-processing: bloom on Medium+ (signboards and lights glow at dusk).
  let pipeline: THREE.RenderPipeline | null = null;
  if (preset.postFx.bloom) {
    try {
      pipeline = new THREE.RenderPipeline(renderer);
      const scenePass = pass(world.scene, world.camera);
      const color = scenePass.getTextureNode('output');
      const lit = color.add(bloom(color, 0.35, 0.35, 0.8));
      // "Natural Dhaka" grade: warm highlights, slightly cool shadows, gentle
      // contrast + saturation, soft vignette — the cinematic open-world look.
      const graded = cdl(
        lit.rgb,
        vec3(1.05, 1.0, 0.93),
        vec3(-0.004, 0.0, 0.008),
        vec3(1.06, 1.04, 1.02),
        float(1.1),
      );
      pipeline.outputNode = vec4(vignette(graded.rgb, float(0.32), float(0.55)), float(1));
    } catch (err) {
      console.warn('[render] bloom unavailable:', err);
      pipeline = null;
    }
  }

  const loop = new FixedStepLoop(1 / 60);
  const dynRes = new DynamicResolution(
    preset.targetFps,
    preset.minResolutionScale,
    preset.resolutionScale,
  );
  const basePixelRatio = Math.min(device.pixelRatio, preset.maxPixelRatio);

  const applySize = () => {
    const w = Math.max(1, opts.container.clientWidth);
    const h = Math.max(1, opts.container.clientHeight);
    renderer.setPixelRatio(basePixelRatio * dynRes.scale);
    renderer.setSize(w, h, false);
    world.setAspect(w / h);
  };
  applySize();
  const resizeObserver = new ResizeObserver(applySize);
  resizeObserver.observe(opts.container);

  let paused = false;
  let lastTime = performance.now();
  let lastRender = 0;
  let frames = 0;
  let statsStart = lastTime;
  let frameMsSum = 0;
  const minFrameMs = preset.fpsCap > 0 ? 1000 / preset.fpsCap - 1 : 0;

  const frame = (time: number) => {
    if (minFrameMs && time - lastRender < minFrameMs) return;
    const frameMs = time - lastTime;
    lastTime = time;
    lastRender = time;
    const dt = Math.min(frameMs / 1000, 0.1);

    input.update(dt);
    if (input.pressed('pause')) requestPause();

    if (!paused) {
      const { steps } = loop.advance(dt);
      const cmds = world.preStep(dt, input);
      physics.step({ steps, dt: loop.step, ...cmds });
      const physicsFrame = physics.takeFrame();
      if (physicsFrame) world.applyFrame(physicsFrame);
      world.update(dt, input);
      renderer.toneMappingExposure = world.exposure;
    }

    if (pipeline) pipeline.render();
    else renderer.render(world.scene, world.camera);

    if (dynRes.sample(frameMs)) applySize();

    frames++;
    frameMsSum += frameMs;
    if (time - statsStart >= STATS_INTERVAL_MS) {
      const { drawCalls, triangles } = renderStats(renderer);
      store.setState({
        fps: Math.round((frames * 1000) / (time - statsStart)),
        frameMs: Math.round((frameMsSum / frames) * 10) / 10,
        drawCalls,
        triangles,
        resolutionScale: dynRes.scale,
      });
      frames = 0;
      frameMsSum = 0;
      statsStart = time;
    }
  };

  renderer.setAnimationLoop(frame);
  store.setState({ status: 'running', backend, physicsMode });

  return {
    store,
    input,
    device,
    canvas,
    debugInfo() {
      return { ...world.debugInfo(), physicsMode, paused };
    },
    setHour(hour: number) {
      world.setHour(hour);
    },
    debugEnterVehicle(defId: string) {
      return world.debugEnterVehicle(defId);
    },
    debugView(x: number, z: number, yaw: number, pitch?: number) {
      world.debugView(x, z, yaw, pitch);
    },
    debugCarjack() {
      return world.debugCarjack();
    },
    debugKnockPedestrian() {
      return world.debugKnockPedestrian();
    },
    debugSetWanted(n: number) {
      world.debugSetWanted(n);
    },
    debugAttack(weapon: 'fist' | 'pistol' | 'grenade') {
      return world.debugAttack(weapon);
    },
    debugExplode(dx: number, dz: number) {
      world.debugExplode(dx, dz);
    },
    debugDamage(n: number) {
      world.debugDamage(n);
    },
    debugMission(id: string, pass?: boolean) {
      return world.debugMission(id, pass);
    },
    debugTalk(npcId: string, option: TalkOption) {
      return world.debugTalk(npcId, option);
    },
    bribe() {
      return world.bribe();
    },
    redeemGoodDeeds() {
      return world.redeemGoodDeeds();
    },
    setHeroIdentity(id: HeroIdentity) {
      world.setIdentity(id);
    },
    exportSave() {
      return world.exportSave();
    },
    importSave(data: Partial<SaveData>) {
      world.importSave(data);
    },
    chooseTalk(option: TalkOption) {
      return world.chooseTalk(option);
    },
    setMuted(muted: boolean) {
      audio?.setMuted(muted);
      voice.muted = muted;
      if (muted) voice.stop();
      store.setState({ muted });
    },
    setVoiceMode(mode: VoiceMode) {
      voice.mode = mode;
      voice.stop();
      store.setState({ voiceMode: mode, voiceEffective: voice.effective });
    },
    pause() {
      paused = true;
      audio?.setPaused(true);
      voice.stop();
      input.clear();
      store.setState({ status: 'paused' });
    },
    resume() {
      paused = false;
      audio?.setPaused(false);
      audio?.resume();
      loop.reset();
      lastTime = performance.now();
      store.setState({ status: 'running' });
    },
    dispose() {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      audio?.dispose();
      voice.stop();
      input.dispose();
      physics.dispose();
      pipeline?.dispose();
      world.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
