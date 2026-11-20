import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { currentUserId } from '@/server/auth';
import { getDb } from '@/server/db';
import { saveSlot } from '@/server/db/schema';
import { allow, clientIp, json } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 64 * 1024;
const SaveData = z
  .object({
    taka: z.number().int().min(0).max(1e9),
    notoriety: z.number().int().min(0).max(1e6),
    publicLove: z.number().int().min(0).max(1e6),
    hour: z.number().min(0).max(24),
    crime: z.object({
      heat: z.number().min(0).max(5),
      record: z.record(z.string(), z.number().int().min(0).max(1e6)),
    }),
  })
  .passthrough();

/** GET ?slot=1 → { version, data } or 404. */
export async function GET(req: Request) {
  const uid = await currentUserId(req.headers);
  if (!uid) return json({ error: 'unauthorized' }, 401);
  const slot = Number(new URL(req.url).searchParams.get('slot') ?? 1);
  if (![1, 2, 3].includes(slot)) return json({ error: 'bad slot' }, 400);
  const db = await getDb();
  const [row] = await db
    .select()
    .from(saveSlot)
    .where(and(eq(saveSlot.userId, uid), eq(saveSlot.slot, slot)))
    .limit(1);
  if (!row) return json({ error: 'not found' }, 404);
  return json({ version: row.version, data: row.data, updatedAt: row.updatedAt });
}

/** PUT ?slot=1 body { data } → saves (size-limited, validated). */
export async function PUT(req: Request) {
  const uid = await currentUserId(req.headers);
  if (!uid) return json({ error: 'unauthorized' }, 401);
  if (!allow(`save:${uid}:${clientIp(req.headers)}`, 20))
    return json({ error: 'too many requests' }, 429);
  const slot = Number(new URL(req.url).searchParams.get('slot') ?? 1);
  if (![1, 2, 3].includes(slot)) return json({ error: 'bad slot' }, 400);
  const text = await req.text();
  if (text.length > MAX_BYTES) return json({ error: 'save too large' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const parsed = z.object({ data: SaveData }).safeParse(body);
  if (!parsed.success) return json({ error: 'invalid save' }, 422);
  const db = await getDb();
  const now = new Date();
  await db
    .insert(saveSlot)
    .values({ userId: uid, slot, version: 1, data: parsed.data.data, updatedAt: now })
    .onConflictDoUpdate({
      target: [saveSlot.userId, saveSlot.slot],
      set: { data: parsed.data.data, updatedAt: now },
    });
  return json({ ok: true, updatedAt: now });
}
