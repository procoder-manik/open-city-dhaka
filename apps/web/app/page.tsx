import Link from 'next/link';
import { brand } from '@game/shared';
import styles from './landing.module.css';

const FEATURES = [
  { title: 'যেকোনো গাড়ি চুরি', text: 'রিকশা, CNG, বাইক, বাস — সব তোমার।' },
  { title: 'মারামারি আর গোলাগুলি', text: 'লাঠি, বন্দুক, গ্রেনেড, পুলিশের তাড়া।' },
  { title: 'আসল মোহাম্মদপুর', text: 'আসাদ গেট, টাউন হল, বেড়িবাঁধ।' },
  { title: 'সব ডিভাইসে', text: 'মোবাইল, ট্যাব, ল্যাপটপ, পিসি — ব্রাউজারেই।' },
];

export default function LandingPage() {
  return (
    <main className={styles.main}>
      <div className={styles.glow} aria-hidden />
      <section className={styles.hero}>
        <p className={styles.edition}>{brand.editionName}</p>
        <h1 className={styles.logo}>{brand.shortName}</h1>
        <p className={styles.fullName}>
          {brand.fullName}
          <span className={styles.nameBn}>{brand.nameBn}</span>
        </p>
        <p className={styles.tagline}>
          {brand.tagline} · {brand.taglineBn}
        </p>
        <div className={styles.ctaRow}>
          <Link href="/play" className="btn">
            খেলা শুরু করো ▶
          </Link>
        </div>
        <p className={styles.hint}>
          ফ্রি · কোনো ডাউনলোড লাগবে না · মোবাইলে &quot;Add to Home Screen&quot; দিলে অ্যাপের মতো ফুল
          স্ক্রিন
        </p>
      </section>

      <section className={styles.features} aria-label="Features">
        {FEATURES.map((f) => (
          <div key={f.title} className={`panel ${styles.card}`}>
            <h2>{f.title}</h2>
            <p>{f.text}</p>
          </div>
        ))}
      </section>

      <footer className={styles.footer}>
        <span>Early development build · Phase 0</span>
        <span>Map data © OpenStreetMap contributors</span>
      </footer>
    </main>
  );
}
