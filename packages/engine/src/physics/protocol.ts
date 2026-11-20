import type { VehicleDef } from '@game/shared';

/** Messages between the main thread and the physics world (worker or inline). */

export type BodyShape =
  | { kind: 'box'; halfExtents: [number, number, number] }
  | { kind: 'capsule'; halfHeight: number; radius: number }
  | { kind: 'sphere'; radius: number };

export interface BodyDesc {
  id: number;
  shape: BodyShape;
  position: [number, number, number];
  /** Rotation around Y (radians). */
  yaw?: number;
  type: 'fixed' | 'dynamic';
  mass?: number;
  friction?: number;
  restitution?: number;
  /** Characters: no tipping over. */
  lockRotations?: boolean;
}

export interface VehicleBodyDesc {
  id: number;
  def: VehicleDef;
  position: [number, number, number];
  yaw: number;
}

export interface CharacterInput {
  bodyId: number;
  /** Desired horizontal velocity in world space (m/s). */
  vx: number;
  vz: number;
  jump: boolean;
  /** false = removed from the simulation (e.g. sitting in a vehicle). */
  enabled: boolean;
  /** Move instantly here (e.g. stepping out of a vehicle). */
  teleport?: [number, number, number];
}

export interface VehicleInput {
  bodyId: number;
  /** Total engine force (N), negative = reverse. */
  engine: number;
  brake: number;
  /** Front wheel angle (rad), positive = left. */
  steer: number;
  handbrake: boolean;
}

export interface StepInput {
  steps: number;
  dt: number;
  characters: CharacterInput[];
  vehicles: VehicleInput[];
}

/** Per body: id, px, py, pz, qx, qy, qz, qw, grounded(0/1), vx, vy, vz */
export const FLOATS_PER_BODY = 12;

/**
 * Per vehicle: id, speed (m/s along forward), wheelCount, then per wheel:
 * suspensionLength, rotation, steering, inContact(0/1)
 */
export const FLOATS_PER_WHEEL = 4;

export interface PhysicsFrame {
  transforms: Float32Array;
  vehicles: Float32Array;
}

export type ToPhysics =
  | { type: 'init'; bodies: BodyDesc[]; vehicles: VehicleBodyDesc[]; gravity: number }
  | { type: 'step'; input: StepInput }
  | { type: 'dispose' };

export type FromPhysics =
  { type: 'ready' } | { type: 'frame'; frame: PhysicsFrame } | { type: 'error'; message: string };
