import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { DEFAULT_IDENTITY, checkHeroText } from '@game/shared';
import { currentUserId } from '@/server/auth';
import { getDb } from '@/server/db';
import { profile } from '@/server/db/schema';
import { allow, clientIp, json } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';

/** GET: the signed-in player's hero identity (default if none saved). */
export async function GET(req: Request) {
  const uid = await currentUserId(req.headers);
  if (!uid) return json({ error: 'unauthorized' }, 401);
  const db = await getDb();
  const [row] = await db.select().from(profile).where(eq(profile.userId, uid)).limit(1);
  return json({
    title: row?.heroTitle ?? DEFAULT_IDENTITY.title,
    name: row?.heroName ?? DEFAULT_IDENTITY.name,
  });
}

const Body = z.object({ title: z.string().max(64), name: z.string().max(64) });

/** PUT: set hero title + name (validated server-side with the same rules as the client). */
export async function PUT(req: Request) {
  const uid = await currentUserId(req.headers);
  if (!uid) return json({ error: 'unauthorized' }, 401);
  if (!allow(`profile:${uid}:${clientIp(req.headers)}`, 10))
    return json({ error: 'too many requests' }, 429);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'invalid body' }, 400);
  const t = checkHeroText(parsed.data.title, 'title');
  const n = checkHeroText(parsed.data.name, 'name');
  if (!t.ok) return json({ error: t.reason, field: 'title' }, 422);
  if (!n.ok) return json({ error: n.reason, field: 'name' }, 422);
  const db = await getDb();
  await db
    .insert(profile)
    .values({ userId: uid, heroTitle: t.value, heroName: n.value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: profile.userId,
      set: { heroTitle: t.value, heroName: n.value, updatedAt: new Date() },
    });
  return json({ title: t.value, name: n.value });
}
