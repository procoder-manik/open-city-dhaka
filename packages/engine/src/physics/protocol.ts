/** Messages between the main thread and the physics world (worker or inline). */

export type BodyShape =
  | { kind: 'box'; halfExtents: [number, number, number] }
  | { kind: 'capsule'; halfHeight: number; radius: number }
  | { kind: 'sphere'; radius: number };

export interface BodyDesc {
  id: number;
  shape: BodyShape;
  position: [number, number, number];
  type: 'fixed' | 'dynamic';
  mass?: number;
  friction?: number;
  restitution?: number;
  /** Characters: no tipping over. */
  lockRotations?: boolean;
}

export interface CharacterInput {
  bodyId: number;
  /** Desired horizontal velocity in world space (m/s). */
  vx: number;
  vz: number;
  jump: boolean;
}

export interface StepInput {
  steps: number;
  dt: number;
  characters: CharacterInput[];
}

/** Per body: id, px, py, pz, qx, qy, qz, qw, grounded(0/1) */
export const FLOATS_PER_BODY = 9;

export type ToPhysics =
  | { type: 'init'; bodies: BodyDesc[]; gravity: number }
  | { type: 'step'; input: StepInput }
  | { type: 'dispose' };

export type FromPhysics =
  | { type: 'ready' }
  | { type: 'frame'; transforms: Float32Array }
  | { type: 'error'; message: string };
