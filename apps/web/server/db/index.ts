import 'server-only';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { schema } from './schema';

/**
 * Database: PostgreSQL via DATABASE_URL (Neon in production), or an embedded
 * PGlite database in `.data/` for local development — zero setup.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Idempotent bootstrap SQL (mirrors schema.ts). Bump BOOTSTRAP_VERSION when it changes. */
const BOOTSTRAP_VERSION = 1;
const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS "user" (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false, image text,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS session (
  id text PRIMARY KEY, expires_at timestamp NOT NULL, token text NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(),
  ip_address text, user_agent text,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS session_user_idx ON session(user_id);
CREATE TABLE IF NOT EXISTS account (
  id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token text, refresh_token text, id_token text,
  access_token_expires_at timestamp, refresh_token_expires_at timestamp,
  scope text, password text,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_user_idx ON account(user_id);
CREATE TABLE IF NOT EXISTS verification (
  id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS profile (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  hero_title text NOT NULL DEFAULT 'গ্রেট থিফ', hero_name text NOT NULL DEFAULT 'মোস্তফা',
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS save_slot (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  slot integer NOT NULL, version integer NOT NULL DEFAULT 1, data jsonb NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slot)
);
CREATE TABLE IF NOT EXISTS _meta (key text PRIMARY KEY, value text NOT NULL);
`;

let dbPromise: Promise<Db> | null = null;

async function create(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const pool = new Pool({ connectionString: url, max: 5 });
    await pool.query(BOOTSTRAP_SQL);
    await pool.query(
      `INSERT INTO _meta(key, value) VALUES ('bootstrap', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
      [String(BOOTSTRAP_VERSION)],
    );
    return drizzle(pool, { schema }) as unknown as Db;
  }
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL) {
    throw new Error('DATABASE_URL is required in production');
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { mkdirSync } = await import('node:fs');
  const dir = process.env.PGLITE_DIR ?? '.data/pglite';
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  await client.exec(BOOTSTRAP_SQL);
  return drizzle(client, { schema }) as unknown as Db;
}

/**
 * One database per process. Cached on globalThis because each Next route bundle gets its
 * own module instance — two PGlite instances on the same data dir would corrupt it.
 */
export function getDb(): Promise<Db> {
  const g = globalThis as unknown as { __gameDb?: Promise<Db> | null };
  dbPromise ??= g.__gameDb ?? null;
  dbPromise ??= create().catch((err) => {
    dbPromise = null;
    g.__gameDb = null;
    throw err;
  });
  g.__gameDb = dbPromise;
  return dbPromise;
}
