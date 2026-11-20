/// <reference lib="webworker" />
import { PhysicsWorld } from './PhysicsWorld';
import type { FromPhysics, ToPhysics } from './protocol';

/**
 * Physics worker body. The app owns the actual worker entry file (so its bundler
 * compiles it as a worker) and just calls this:
 *   import { startPhysicsWorker } from '@game/engine/physics-worker';
 *   startPhysicsWorker();
 */
export function startPhysicsWorker(): void {
  const ctx = self as unknown as DedicatedWorkerGlobalScope;
  const world = new PhysicsWorld();
  let ready = false;

  const post = (msg: FromPhysics, transfer: Transferable[] = []) => ctx.postMessage(msg, transfer);

  ctx.onmessage = async (e: MessageEvent<ToPhysics>) => {
    const msg = e.data;
    try {
      switch (msg.type) {
        case 'init':
          await world.init(msg.bodies, msg.gravity, msg.vehicles);
          ready = true;
          post({ type: 'ready' });
          break;
        case 'step': {
          if (!ready) return;
          const frame = world.step(msg.input);
          post({ type: 'frame', frame }, [frame.transforms.buffer, frame.vehicles.buffer]);
          break;
        }
        case 'dispose':
          world.dispose();
          ready = false;
          ctx.close();
          break;
      }
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}
