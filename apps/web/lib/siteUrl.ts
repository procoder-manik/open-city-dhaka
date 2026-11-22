import { site } from '@game/shared';

const isLocal = (u: string | undefined) => !!u && /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(u);

/** Vercel's own production address (set automatically on Vercel), if any. */
export function vercelUrl(): string | null {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}` : null;
}

/**
 * Public base URL: site.config.json → NEXT_PUBLIC_SITE_URL → Vercel production URL → localhost.
 * On Vercel a localhost value (copied from .env.local by mistake) is ignored.
 */
export function siteUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  const fromEnv = env && !(process.env.VERCEL && isLocal(env)) ? env : vercelUrl();
  return (site.siteUrl ?? fromEnv ?? 'http://localhost:3000').replace(/\/$/, '');
}

/** Auth base URL: BETTER_AUTH_URL, unless it points to localhost while running on Vercel. */
export function authUrl(): string | undefined {
  const env = process.env.BETTER_AUTH_URL;
  if (env && !(process.env.VERCEL && isLocal(env))) return env.replace(/\/$/, '');
  return vercelUrl() ?? env;
}

/** Origins allowed to call the auth API: the site itself + this deployment's Vercel URLs. */
export function trustedOrigins(): string[] {
  const out = new Set<string>();
  const add = (u: string | null | undefined) => u && out.add(u.replace(/\/$/, ''));
  add(authUrl());
  add(siteUrl());
  add(vercelUrl());
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL])
    if (host) add(`https://${host}`);
  return [...out];
}
