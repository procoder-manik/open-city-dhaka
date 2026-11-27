import type { VehicleDef } from '@game/shared';

export interface DriverInput {
  /** -1 (brake / reverse) .. 1 (accelerate) */
  throttle: number;
  /** -1 (left) .. 1 (right) */
  steer: number;
  handbrake: boolean;
}

export interface VehicleControls {
  engine: number;
  brake: number;
  /** Wheel angle (rad), positive = left (Rapier convention for +Z-forward vehicles). */
  steer: number;
  handbrake: boolean;
}

const STEER_SPEED = 3.4; // rad/s towards target (snappy, still smooth on a keyboard)
const STEER_RETURN = 5.5; // rad/s back to centre

/**
 * Arcade-realistic driving: throttle accelerates until top speed, pulling back brakes
 * first then reverses, steering gets lighter at speed and is smoothed so keyboard and
 * touch feel the same.
 */
export function computeVehicleControls(
  def: VehicleDef,
  input: DriverInput,
  /** Signed forward speed (m/s). */
  speed: number,
  prevSteer: number,
  dt: number,
): VehicleControls {
  const maxFwd = def.maxSpeedKmh / 3.6;
  const maxRev = def.reverseSpeedKmh / 3.6;
  const t = Math.max(-1, Math.min(1, input.throttle));
  let engine = 0;
  let brake = 0;

  if (t > 0.05) {
    if (speed < -0.8) {
      brake = def.brakeForce * t; // stop rolling backwards first
    } else {
      // Torque falls off towards top speed.
      const headroom = Math.max(0, 1 - Math.pow(Math.max(0, speed) / maxFwd, 3));
      engine = def.engineForce * t * headroom;
    }
  } else if (t < -0.05) {
    if (speed > 0.8) {
      brake = def.brakeForce * -t;
    } else if (speed > -maxRev) {
      engine = def.engineForce * 0.55 * t;
    }
  } else {
    brake = def.brakeForce * 0.06; // engine braking / rolling resistance
  }

  // Lighter steering at speed for stability.
  const speedFactor = 1 / (1 + Math.abs(speed) / 20);
  const target = -Math.max(-1, Math.min(1, input.steer)) * def.maxSteer * speedFactor;
  const rate =
    Math.abs(target) < Math.abs(prevSteer) || Math.sign(target) !== Math.sign(prevSteer)
      ? STEER_RETURN
      : STEER_SPEED;
  const maxDelta = rate * dt;
  const steer = prevSteer + Math.max(-maxDelta, Math.min(maxDelta, target - prevSteer));

  return { engine, brake, steer, handbrake: input.handbrake };
}

/** Brakes applied to an empty, parked vehicle. */
export function parkedControls(def: VehicleDef): VehicleControls {
  return { engine: 0, brake: def.brakeForce * 0.5, steer: 0, handbrake: false };
}
