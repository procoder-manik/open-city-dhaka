import { z } from 'zod';
import rawSite from '../../../site.config.json';

const Url = z
  .string()
  .url()
  .refine((u) => u.startsWith('https://'), 'must be https')
  .nullable();

const SiteSchema = z.object({
  /** Public site address, e.g. https://gtm.example.com (null → derived from env / localhost). */
  siteUrl: Url.optional().default(null),
  donateUrl: Url,
  donateNote: z.string(),
  feedbackFormUrl: Url,
  facebookUrl: Url,
  youtubeUrl: Url,
});

export type SiteConfig = z.infer<typeof SiteSchema>;

/** Website links (donate, feedback Google Form, socials). Null = hidden. */
export const site: SiteConfig = SiteSchema.parse(rawSite);
