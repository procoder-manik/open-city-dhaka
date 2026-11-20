import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb } from './db';

export const BOARDS = {
  taka: { label: 'সবচেয়ে বড়লোক', unit: '৳' },
  missions: { label: 'মিশন মাস্টার', unit: 'মিশন' },
  notoriety: { label: 'সবচেয়ে কুখ্যাত', unit: '😈' },
  love: { label: 'জনতার প্রিয়', unit: '❤️' },
} as const;
export type Board = keyof typeof BOARDS;

export interface Row {
  rank: number;
  hero: string;
  value: number;
}

const ORDER: Record<Board, ReturnType<typeof sql>> = {
  taka: sql`taka`,
  missions: sql`missions`,
  notoriety: sql`notoriety`,
  love: sql`love`,
};

/**
 * Top players from cloud saves (slot 1). Shows only the public hero name — never emails.
 * Values come from client saves (clamped server-side), so this is a fun board, not a ranked one.
 */
export async function topPlayers(board: Board, limit = 20): Promise<Row[]> {
  const db = await getDb();
  const res = (await db.execute(sql`
    SELECT
      coalesce(p.hero_title || ' ' || p.hero_name, 'বেনামি মাস্তান') AS hero,
      least(coalesce((s.data->>'taka')::numeric, 0), 1e9)::bigint AS taka,
      CASE WHEN jsonb_typeof(s.data->'missions') = 'array'
        THEN jsonb_array_length(s.data->'missions') ELSE 0 END AS missions,
      least(coalesce((s.data->>'notoriety')::numeric, 0), 1e6)::bigint AS notoriety,
      least(coalesce((s.data->>'publicLove')::numeric, 0), 1e6)::bigint AS love
    FROM save_slot s
    LEFT JOIN profile p ON p.user_id = s.user_id
    WHERE s.slot = 1
    ORDER BY ${ORDER[board]} DESC, s.updated_at ASC
    LIMIT ${Math.max(1, Math.min(100, limit))}
  `)) as unknown as { rows: Array<Record<string, unknown>> };
  return res.rows.map((r, i) => ({
    rank: i + 1,
    hero: String(r.hero ?? ''),
    value: Number(r[board] ?? 0),
  }));
}
