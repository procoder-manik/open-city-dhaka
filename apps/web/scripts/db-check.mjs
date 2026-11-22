// Checks the PostgreSQL connection in apps/web/.env.local (DATABASE_URL) without printing it.
// Usage: pnpm db:check
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const envPath = fileURLToPath(new URL('../.env.local', import.meta.url));
let url = process.env.DATABASE_URL ?? '';
if (!url) {
  try {
    const line = readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('DATABASE_URL='));
    url = (line ?? '')
      .slice('DATABASE_URL='.length)
      .trim()
      .replace(/^["']|["']$/g, '');
  } catch {
    // no file
  }
}
if (!url) {
  console.info(
    '✗ DATABASE_URL is empty. Paste your Neon connection string into apps/web/.env.local',
  );
  process.exit(1);
}
let host = '?';
try {
  const u = new URL(url);
  host = u.hostname;
  if (!u.hostname.includes('pooler'))
    console.info('! Tip: use the *pooled* string (host contains "-pooler") for Vercel.');
  if (!/sslmode=require/.test(url))
    console.info('! Tip: the string should end with ?sslmode=require');
} catch {
  console.info('✗ DATABASE_URL is not a valid URL (it should start with postgresql://)');
  process.exit(1);
}
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
try {
  const t0 = Date.now();
  await client.connect();
  const v = await client.query('select version() as v, current_database() as db');
  const tables = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by 1",
  );
  console.info(`✓ Connected to ${host} in ${Date.now() - t0} ms`);
  console.info(`  database: ${v.rows[0].db} — ${String(v.rows[0].v).split(' on ')[0]}`);
  const names = tables.rows.map((r) => r.table_name);
  console.info(
    names.length
      ? `  tables: ${names.join(', ')}`
      : '  tables: none yet (the app creates them on the first request)',
  );
  await client.end();
} catch (e) {
  console.info(`✗ Could not connect to ${host}: ${e.message}`);
  process.exit(1);
}
