import { z } from 'zod';
import rawBrand from '../../../brand.config.json';

const BrandPresetSchema = z.object({
  status: z.string(),
  shortName: z.string().min(1),
  fullName: z.string().min(1),
  displayName: z.string().min(1),
  nameBn: z.string().min(1),
  tagline: z.string(),
  taglineBn: z.string(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  logoDir: z.string(),
  domain: z.string().nullable(),
});

const BrandConfigSchema = z
  .object({
    active: z.string(),
    presets: z.record(z.string(), BrandPresetSchema),
    shared: z.object({
      currentEdition: z.string(),
      editionFormat: z.string(),
      hero: z.object({ name: z.string(), nameBn: z.string() }),
    }),
  })
  .refine((c) => c.active in c.presets, {
    message: 'brand.config.json: "active" must match a key in "presets"',
  });

export type BrandPreset = z.infer<typeof BrandPresetSchema>;
export type Brand = BrandPreset & {
  key: string;
  edition: string;
  editionName: string;
  hero: { name: string; nameBn: string };
};

export function resolveBrand(input: unknown): Brand {
  const config = BrandConfigSchema.parse(input);
  const preset = config.presets[config.active]!;
  const edition = config.shared.currentEdition;
  const editionName = config.shared.editionFormat
    .replace('{shortName}', preset.shortName)
    .replace('{edition}', edition);
  return { ...preset, key: config.active, edition, editionName, hero: config.shared.hero };
}

/** The active brand. Never hard-code the game name — always use this. */
export const brand: Brand = resolveBrand(rawBrand);

/** Replace {game}, {hero}, {edition} placeholders in UI/dialogue text. */
export function brandText(text: string, b: Brand = brand): string {
  return text
    .replaceAll('{game}', b.displayName)
    .replaceAll('{hero}', b.hero.name)
    .replaceAll('{edition}', b.editionName);
}
