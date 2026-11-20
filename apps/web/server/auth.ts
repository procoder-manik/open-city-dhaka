import 'server-only';
import { randomBytes } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from './db';
import { schema } from './db/schema';

const isProd = process.env.NODE_ENV === 'production';

let generatedSecret: string | null = null;

function secret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (s && s.length >= 32) return s;
  if (isProd && process.env.VERCEL)
    throw new Error('BETTER_AUTH_SECRET (32+ chars) is required in production');
  if (!generatedSecret) {
    // Never fall back to a known string: random per process (sessions reset on restart).
    generatedSecret = randomBytes(32).toString('hex');
    if (isProd)
      console.warn(
        '[auth] BETTER_AUTH_SECRET not set — using a random secret; logins reset on restart.',
      );
  }
  return generatedSecret;
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
        baseURL: process.env.BETTER_AUTH_URL,
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
