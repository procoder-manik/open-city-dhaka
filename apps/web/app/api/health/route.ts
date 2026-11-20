import { brand } from '@game/shared';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { ok: true, game: brand.slug, time: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
