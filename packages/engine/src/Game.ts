import type * as THREE from 'three/webgpu';
import { qualityPresets } from '@game/content';
import type { QualityTier } from '@game/shared';
import { FixedStepLoop } from './core/FixedStepLoop';
import { InputManager } from './input/InputManager';
import { PhysicsClient } from './physics/PhysicsClient';
import { detectDevice, type DeviceInfo } from './platform/device';
import { DynamicResolution } from './platform/DynamicResolution';
import { pickQualityTier } from './platform/quality';
import { createRenderer, renderStats } from './render/createRenderer';
import { TestScene } from './scenes/TestScene';
import { createGameStore, type GameStore } from './state/store';

export interface GameOptions {
  /** Element the canvas is mounted into (also the fullscreen root). */
  container: HTMLElement;
  /** Override auto-detected quality. */
  tier?: QualityTier;
  forceWebGL?: boolean;
  /** Creates the physics Web Worker (app-owned entry). Omit to run physics on the main thread. */
  createPhysicsWorker?: () => Worker;
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
  pause(): void;
  resume(): void;
  dispose(): void;
}

const STATS_INTERVAL_MS = 500;

export async function createGame(opts: GameOptions): Promise<Game> {
  const device = detectDevice();
  const tier = opts.tier ?? pickQualityTier(device);
  const preset = qualityPresets[tier];
  const store = createGameStore(tier);
  store.setState({ status: 'loading' });

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

  const world = new TestScene(preset);
  const physics = new PhysicsClient();
  const physicsMode = await physics.init(world.bodies, 9.81, opts.createPhysicsWorker);

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
      physics.step({ steps, dt: loop.step, characters: world.characterInputs(input) });
      const transforms = physics.takeTransforms();
      if (transforms) world.applyTransforms(transforms);
      world.updateVisuals(dt);
    }

    renderer.render(world.scene, world.camera as unknown as THREE.Camera);

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
    pause() {
      paused = true;
      input.clear();
      store.setState({ status: 'paused' });
    },
    resume() {
      paused = false;
      loop.reset();
      lastTime = performance.now();
      store.setState({ status: 'running' });
    },
    dispose() {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      input.dispose();
      physics.dispose();
      world.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
