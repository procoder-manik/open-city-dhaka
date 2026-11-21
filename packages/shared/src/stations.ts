import { z } from 'zod';

/** Petrol pumps (refuel) and garages (repair + respray to lose the wanted level). */
export const StationSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['pump', 'garage']),
  /** Fictional business name shown on the sign (Bangla). */
  name: z.string().min(1),
  /** Centre of the forecourt, metres from Tajmahal Road (map anchor). */
  x: z.number(),
  z: z.number(),
  /** Point on the road the forecourt faces (sign + entrance side). */
  roadX: z.number(),
  roadZ: z.number(),
});
export const StationsSchema = z.array(StationSchema);
export type Station = z.infer<typeof StationSchema>;
