import Link from 'next/link';
import styles from './legal.module.css';

/** Simple readable page shell for privacy / terms / credits. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <main className={styles.main}>
      <article className={`panel ${styles.doc}`}>
        <h1>{title}</h1>
        {updated && <p className={styles.updated}>সর্বশেষ আপডেট: {updated}</p>}
        {children}
        <nav className={styles.nav}>
          <Link href="/">হোম</Link>
          <Link href="/play">খেলো</Link>
          <Link href="/privacy">প্রাইভেসি</Link>
          <Link href="/terms">শর্তাবলি</Link>
          <Link href="/credits">ক্রেডিট</Link>
        </nav>
      </article>
    </main>
  );
}
