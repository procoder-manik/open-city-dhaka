import { PhysicsWorld } from './PhysicsWorld';
import type {
  BodyDesc,
  CharacterInput,
  FromPhysics,
  PhysicsFrame,
  StepInput,
  ToPhysics,
  VehicleBodyDesc,
} from './protocol';

export type PhysicsMode = 'worker' | 'inline';

/**
 * Main-thread handle to physics. Prefers a Web Worker (keeps the render thread free);
 * falls back to running the same world inline if the worker can't start.
 */
export class PhysicsClient {
  private worker: Worker | null = null;
  private inline: PhysicsWorld | null = null;
  private busy = false;
  private pendingSteps = 0;
  /** Jumps/teleports issued while the worker was busy — never dropped. */
  private pendingJumps = new Set<number>();
  private pendingTeleports = new Map<number, [number, number, number]>();
  private pendingVehicleTeleports = new Map<
    number,
    { x: number; y: number; z: number; yaw: number }
  >();
  private pendingImpulses: NonNullable<StepInput['impulses']> = [];
  private latest: PhysicsFrame | null = null;
  mode: PhysicsMode = 'worker';

  /**
   * @param createWorker factory from the app, e.g.
   *   () => new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module' })
   *   Omit to run physics inline.
   */
  async init(
    bodies: BodyDesc[],
    vehicles: VehicleBodyDesc[],
    gravity = 9.81,
    createWorker?: () => Worker,
  ): Promise<PhysicsMode> {
    if (createWorker) {
      try {
        await this.initWorker(createWorker, bodies, vehicles, gravity);
        this.mode = 'worker';
        return this.mode;
      } catch (err) {
        console.warn('[physics] worker failed, falling back to inline:', err);
        this.worker?.terminate();
        this.worker = null;
      }
    }
    this.inline = new PhysicsWorld();
    await this.inline.init(bodies, gravity, vehicles);
    this.mode = 'inline';
    return this.mode;
  }

  private initWorker(
    createWorker: () => Worker,
    bodies: BodyDesc[],
    vehicles: VehicleBodyDesc[],
    gravity: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const worker = createWorker();
      this.worker = worker;
      const timeout = setTimeout(() => reject(new Error('physics worker init timeout')), 6000);
      worker.onerror = (e) => {
        clearTimeout(timeout);
        reject(new Error(e.message || 'physics worker error'));
      };
      worker.onmessage = (e: MessageEvent<FromPhysics>) => {
        const msg = e.data;
        if (msg.type === 'ready') {
          clearTimeout(timeout);
          worker.onmessage = (ev: MessageEvent<FromPhysics>) => this.onMessage(ev.data);
          resolve();
        } else if (msg.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(msg.message));
        }
      };
      this.post({ type: 'init', bodies, vehicles, gravity });
    });
  }

  private post(msg: ToPhysics) {
    this.worker?.postMessage(msg);
  }

  private onMessage(msg: FromPhysics) {
    if (msg.type === 'frame') {
      this.latest = msg.frame;
      this.busy = false;
    } else if (msg.type === 'error') {
      console.error('[physics]', msg.message);
      this.busy = false;
    }
  }

  /** Advance physics. In worker mode results arrive next frame (1 frame latency). */
  step(input: StepInput) {
    if (this.inline) {
      if (input.steps > 0 || input.characters.some((c) => c.teleport)) {
        this.latest = this.inline.step(input);
      }
      return;
    }
    // While the worker is busy, bank steps and one-off commands and send them together
    // next time, so simulation time and commands are never lost.
    this.pendingSteps = Math.min(this.pendingSteps + input.steps, 8);
    for (const v of input.vehicles)
      if (v.teleport) this.pendingVehicleTeleports.set(v.bodyId, v.teleport);
    if (input.impulses?.length) this.pendingImpulses.push(...input.impulses);
    for (const c of input.characters) {
      if (c.jump) this.pendingJumps.add(c.bodyId);
      if (c.teleport) this.pendingTeleports.set(c.bodyId, c.teleport);
    }
    if (
      this.busy ||
      (this.pendingSteps === 0 &&
        this.pendingTeleports.size === 0 &&
        this.pendingVehicleTeleports.size === 0)
    )
      return;
    this.busy = true;
    const characters: CharacterInput[] = input.characters.map((c) => {
      const teleport = this.pendingTeleports.get(c.bodyId);
      return {
        ...c,
        jump: this.pendingJumps.has(c.bodyId),
        ...(teleport ? { teleport } : {}),
      };
    });
    const vehicles = input.vehicles.map((v) => {
      const tp = this.pendingVehicleTeleports.get(v.bodyId);
      return tp ? { ...v, teleport: tp } : v;
    });
    const impulses = this.pendingImpulses;
    this.pendingImpulses = [];
    this.post({
      type: 'step',
      input: { ...input, steps: this.pendingSteps, characters, vehicles, impulses },
    });
    this.pendingVehicleTeleports.clear();
    this.pendingSteps = 0;
    this.pendingJumps.clear();
    this.pendingTeleports.clear();
  }

  /** Latest physics frame, consumed once. */
  takeFrame(): PhysicsFrame | null {
    const f = this.latest;
    this.latest = null;
    return f;
  }

  dispose() {
    if (this.worker) {
      this.post({ type: 'dispose' });
      this.worker.terminate();
      this.worker = null;
    }
    this.inline?.dispose();
    this.inline = null;
  }
}
