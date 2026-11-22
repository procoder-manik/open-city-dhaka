import { authUrl, trustedOrigins } from '@/lib/siteUrl';
import 'server-only';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from './db';
import { schema } from './db/schema';

const isProd = process.env.NODE_ENV === 'production';

const SECRET_KEY = '__gameAuthSecret';
const DEV_SECRET_FILE = join(process.cwd(), '.data', 'dev-auth-secret');

/**
 * Signing secret. Production: BETTER_AUTH_SECRET (required on Vercel). Otherwise a random
 * secret shared process-wide via globalThis (each Next route bundle has its own module
 * instance) and, in development, persisted to .data/ so logins survive restarts.
 */
function secret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (s && s.length >= 32) return s;
  if (isProd && process.env.VERCEL)
    throw new Error('BETTER_AUTH_SECRET (32+ chars) is required in production');
  const g = globalThis as unknown as Record<string, string | undefined>;
  if (g[SECRET_KEY]) return g[SECRET_KEY];
  let value: string | null = null;
  if (!isProd) {
    try {
      if (existsSync(DEV_SECRET_FILE)) value = readFileSync(DEV_SECRET_FILE, 'utf8').trim();
      if (!value || value.length < 32) {
        value = randomBytes(32).toString('hex');
        mkdirSync(dirname(DEV_SECRET_FILE), { recursive: true });
        writeFileSync(DEV_SECRET_FILE, value, { mode: 0o600 });
      }
    } catch {
      value = null;
    }
  }
  if (!value) {
    // Never fall back to a known string.
    value = randomBytes(32).toString('hex');
    if (isProd)
      console.warn(
        '[auth] BETTER_AUTH_SECRET not set — using a random secret; logins reset on restart.',
      );
  }
  g[SECRET_KEY] = value;
  return value;
}

const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

type Auth = ReturnType<typeof betterAuth>;
let authPromise: Promise<Auth> | null = null;

/**
 * Better Auth: email + password always; Google when GOOGLE_CLIENT_ID/SECRET are set.
 * Sessions are httpOnly cookies; built-in rate limiting and CSRF protection.
 */
export function getAuth(): Promise<Auth> {
  authPromise ??= getDb().then(
    (db) =>
      betterAuth({
        secret: secret(),
        baseURL: authUrl(),
        trustedOrigins: trustedOrigins(),
        database: drizzleAdapter(db, { provider: 'pg', schema }),
        emailAndPassword: {
          enabled: true,
          minPasswordLength: 8,
          maxPasswordLength: 128,
          autoSignIn: true,
        },
        socialProviders: googleEnabled
          ? {
              google: {
                clientId: process.env.GOOGLE_CLIENT_ID!,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
              },
            }
          : {},
        session: {
          expiresIn: 60 * 60 * 24 * 30,
          updateAge: 60 * 60 * 24,
        },
        // Players can delete their own account (password-confirmed); saves cascade.
        user: { deleteUser: { enabled: true } },
        rateLimit: { enabled: true, window: 60, max: 30 },
        advanced: { useSecureCookies: isProd && !!process.env.VERCEL },
      }) as unknown as Auth,
  );
  return authPromise;
}

export const GOOGLE_ENABLED = googleEnabled;

/** Current signed-in user id from request headers, or null. */
export async function currentUserId(headers: Headers): Promise<string | null> {
  const auth = await getAuth();
  const s = await auth.api.getSession({ headers });
  return s?.user?.id ?? null;
}
