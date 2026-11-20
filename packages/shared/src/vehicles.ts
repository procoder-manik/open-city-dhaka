import { z } from 'zod';

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const VEHICLE_KINDS = ['car', 'cng', 'bike'] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

export const WheelDefSchema = z.object({
  /** Suspension attachment point, chassis-local (m). Vehicles face +Z. */
  position: Vec3,
  radius: z.number().positive(),
  steer: z.boolean(),
  drive: z.boolean(),
});

export const VehicleDefSchema = z.object({
  id: z.string(),
  kind: z.enum(VEHICLE_KINDS),
  name: z.string(),
  nameBn: z.string(),
  /** Mass incl. driver, kg. */
  mass: z.number().positive(),
  chassisHalfExtents: Vec3,
  /** Centre of mass offset (lower = harder to flip). */
  centerOfMassY: z.number(),
  wheels: z.array(WheelDefSchema).min(2),
  suspension: z.object({
    restLength: z.number().positive(),
    stiffness: z.number().positive(),
    compression: z.number().positive(),
    relaxation: z.number().positive(),
    maxTravel: z.number().positive(),
  }),
  frictionSlip: z.number().positive(),
  sideFriction: z.number().positive(),
  /** Total engine force across drive wheels (N). */
  engineForce: z.number().positive(),
  brakeForce: z.number().positive(),
  maxSteer: z.number().positive(),
  maxSpeedKmh: z.number().positive(),
  reverseSpeedKmh: z.number().positive(),
  /** Two-wheelers: keep upright in physics, lean visually. */
  lockRoll: z.boolean(),
  camera: z.object({ distance: z.number().positive(), height: z.number() }),
  color: z.string(),
});

export type WheelDef = z.infer<typeof WheelDefSchema>;
export type VehicleDef = z.infer<typeof VehicleDefSchema>;
export const VehicleDefsSchema = z.array(VehicleDefSchema);
