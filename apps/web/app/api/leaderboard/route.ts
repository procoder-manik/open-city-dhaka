import { BOARDS, topPlayers, type Board } from '@/server/leaderboard';
import { allow, clientIp, json } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';

/** GET ?by=taka|missions|notoriety|love → top 20 (public hero names only). */
export async function GET(req: Request) {
  if (!allow(`lb:${clientIp(req.headers)}`, 60)) return json({ error: 'too many requests' }, 429);
  const by = new URL(req.url).searchParams.get('by') ?? 'taka';
  if (!(by in BOARDS)) return json({ error: 'bad board' }, 400);
  return json({ board: by, rows: await topPlayers(by as Board) });
}
