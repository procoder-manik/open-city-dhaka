import { site } from '@game/shared';

/** Public base URL: site.config.json → NEXT_PUBLIC_SITE_URL → Vercel production URL → localhost. */
export function siteUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null);
  return (site.siteUrl ?? fromEnv ?? 'http://localhost:3000').replace(/\/$/, '');
}
