import { PhysicsWorld } from './PhysicsWorld';
import type { BodyDesc, FromPhysics, StepInput, ToPhysics } from './protocol';

export type PhysicsMode = 'worker' | 'inline';

/**
 * Main-thread handle to physics. Prefers a Web Worker (keeps the render thread free);
 * falls back to running the same world inline if workers/WASM-in-worker fail.
 */
export class PhysicsClient {
  private worker: Worker | null = null;
  private inline: PhysicsWorld | null = null;
  private busy = false;
  private pendingSteps = 0;
  private pendingJumps = new Set<number>();
  private latest: Float32Array | null = null;
  mode: PhysicsMode = 'worker';

  /**
   * @param createWorker factory from the app, e.g.
   *   () => new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module' })
   *   Omit to run physics inline.
   */
  async init(
    bodies: BodyDesc[],
    gravity = 9.81,
    createWorker?: () => Worker,
  ): Promise<PhysicsMode> {
    if (createWorker) {
      try {
        await this.initWorker(createWorker, bodies, gravity);
        this.mode = 'worker';
        return this.mode;
      } catch (err) {
        console.warn('[physics] worker failed, falling back to inline:', err);
        this.worker?.terminate();
        this.worker = null;
      }
    }
    this.inline = new PhysicsWorld();
    await this.inline.init(bodies, gravity);
    this.mode = 'inline';
    return this.mode;
  }

  private initWorker(
    createWorker: () => Worker,
    bodies: BodyDesc[],
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
      this.post({ type: 'init', bodies, gravity });
    });
  }

  private post(msg: ToPhysics) {
    this.worker?.postMessage(msg);
  }

  private onMessage(msg: FromPhysics) {
    if (msg.type === 'frame') {
      this.latest = msg.transforms;
      this.busy = false;
    } else if (msg.type === 'error') {
      console.error('[physics]', msg.message);
      this.busy = false;
    }
  }

  /** Advance physics. In worker mode results arrive next frame (1 frame latency). */
  step(input: StepInput) {
    if (input.steps === 0) return;
    if (this.inline) {
      this.latest = this.inline.step(input);
      return;
    }
    // While the worker is busy, bank the steps and send them together next time,
    // so simulation time never gets lost and messages never pile up.
    this.pendingSteps = Math.min(this.pendingSteps + input.steps, 8);
    for (const c of input.characters) if (c.jump) this.pendingJumps.add(c.bodyId);
    if (this.busy) return;
    this.busy = true;
    const characters = input.characters.map((c) => ({
      ...c,
      jump: this.pendingJumps.has(c.bodyId),
    }));
    this.post({ type: 'step', input: { ...input, steps: this.pendingSteps, characters } });
    this.pendingSteps = 0;
    this.pendingJumps.clear();
  }

  /** Latest transforms snapshot (see FLOATS_PER_BODY layout), consumed once. */
  takeTransforms(): Float32Array | null {
    const t = this.latest;
    this.latest = null;
    return t;
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
