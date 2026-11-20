import type { Metadata } from 'next';
import Link from 'next/link';
import { BOARDS, topPlayers, type Board } from '@/server/leaderboard';
import styles from './leaderboard.module.css';

export const metadata: Metadata = {
  title: 'লিডারবোর্ড',
  description: 'মোহাম্মদপুরের সেরা মাস্তানরা — টাকা, মিশন, কুখ্যাতি আর জনপ্রিয়তায়।',
};
export const dynamic = 'force-dynamic';

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ by?: string }>;
}) {
  const { by } = await searchParams;
  const board: Board = by && by in BOARDS ? (by as Board) : 'taka';
  let rows: Awaited<ReturnType<typeof topPlayers>> = [];
  let failed = false;
  try {
    rows = await topPlayers(board);
  } catch {
    failed = true;
  }
  const meta = BOARDS[board];
  return (
    <main className={styles.main}>
      <div className={`panel ${styles.card}`}>
        <h1>🏆 লিডারবোর্ড</h1>
        <nav className={styles.tabs}>
          {(Object.keys(BOARDS) as Board[]).map((b) => (
            <Link key={b} href={`/leaderboard?by=${b}`} data-active={b === board || undefined}>
              {BOARDS[b].label}
            </Link>
          ))}
        </nav>
        {failed ? (
          <p className={styles.muted}>লিডারবোর্ড এখন লোড হচ্ছে না, একটু পরে আসো।</p>
        ) : rows.length === 0 ? (
          <p className={styles.muted}>এখনো কেউ নেই — লগইন করে খেলো, প্রথম তুমিই হও!</p>
        ) : (
          <ol className={styles.list} data-testid="leaderboard">
            {rows.map((r) => (
              <li key={r.rank}>
                <span className={styles.rank}>{r.rank.toLocaleString('bn-BD')}</span>
                <span className={styles.hero}>{r.hero}</span>
                <span className={styles.value}>
                  {meta.unit === '৳' ? '৳' : ''}
                  {r.value.toLocaleString('bn-BD')}
                  {meta.unit !== '৳' ? ` ${meta.unit}` : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className={styles.note}>
          লগইন করা খেলোয়াড়দের ক্লাউড সেভ থেকে। শুধু হিরোর নাম দেখানো হয়, ইমেইল কখনো না।
        </p>
        <div className={styles.links}>
          <Link href="/play" className="btn">
            খেলা শুরু ▶
          </Link>
          <Link href="/" className="btn secondary">
            হোম
          </Link>
        </div>
      </div>
    </main>
  );
}
