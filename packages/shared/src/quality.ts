import { z } from 'zod';

export const QUALITY_TIERS = ['lite', 'mobile', 'medium', 'high', 'ultra'] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

export const QualityPresetSchema = z.object({
  label: z.string(),
  /** Render resolution multiplier relative to CSS pixels × devicePixelRatio cap. */
  resolutionScale: z.number().min(0.3).max(1),
  maxPixelRatio: z.number().min(0.5).max(3),
  minResolutionScale: z.number().min(0.3).max(1),
  shadows: z.boolean(),
  shadowMapSize: z.number().int().positive(),
  antialias: z.boolean(),
  chunkRadius: z.number().int().min(1).max(8),
  npcDensity: z.number().min(0).max(1),
  trafficDensity: z.number().min(0).max(1),
  maxTextureSize: z.number().int().positive(),
  fpsCap: z.number().int().min(0),
  targetFps: z.number().int().positive(),
  postFx: z.object({
    bloom: z.boolean(),
    ssao: z.boolean(),
    motionBlur: z.boolean(),
  }),
});

export type QualityPreset = z.infer<typeof QualityPresetSchema>;

export const QualityPresetsSchema = z.object(
  Object.fromEntries(QUALITY_TIERS.map((t) => [t, QualityPresetSchema])) as Record<
    QualityTier,
    typeof QualityPresetSchema
  >,
);
export type QualityPresets = z.infer<typeof QualityPresetsSchema>;
