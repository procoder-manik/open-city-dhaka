import Link from 'next/link';
import { brand, site } from '@game/shared';
import styles from './landing.module.css';

const FEATURES = [
  { title: 'যেকোনো গাড়ি চুরি', text: 'রিকশা, CNG, বাইক, বাস — সব তোমার।' },
  { title: 'তোমার নামেই ওয়ান্টেড', text: 'লগইন করে নিজের টাইটেল দাও — রংবাজ, গ্যাংস্টার, ডন…' },
  { title: 'পুলিশ? ঘুষ আছে!', text: 'ওসি কামাল পাশাকে ফোন দাও, ফাইল গায়েব।' },
  { title: 'আসল মোহাম্মদপুর', text: 'আসাদ গেট, টাউন হল, বেড়িবাঁধ।' },
  { title: 'সব ডিভাইসে', text: 'মোবাইল, ট্যাব, ল্যাপটপ, পিসি — ব্রাউজারেই।' },
  { title: 'বাংলায় কথা', text: 'চা-ওয়ালা, রিকশাওয়ালা, বিদেশি — সবাই কথা বলে।' },
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
          {site.donateUrl && (
            <a
              href={site.donateUrl}
              className="btn secondary"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="donate-link"
            >
              ❤️ ডোনেট করো
            </a>
          )}
        </div>
        <p className={styles.hint}>
          ফ্রি · কোনো ডাউনলোড লাগবে না · মোবাইলে &quot;Add to Home Screen&quot; দিলে অ্যাপের মতো ফুল
          স্ক্রিন
        </p>
        {site.donateUrl && <p className={styles.hint}>{site.donateNote}</p>}
      </section>

      <section className={styles.features} aria-label="Features">
        {FEATURES.map((f) => (
          <div key={f.title} className={`panel ${styles.card}`}>
            <h2>{f.title}</h2>
            <p>{f.text}</p>
          </div>
        ))}
      </section>

      {(site.feedbackFormUrl || site.facebookUrl || site.youtubeUrl) && (
        <section className={styles.community} aria-label="Community">
          {site.feedbackFormUrl && (
            <a
              href={site.feedbackFormUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn secondary"
            >
              📝 মতামত / বাগ রিপোর্ট
            </a>
          )}
          {site.facebookUrl && (
            <a
              href={site.facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn secondary"
            >
              Facebook
            </a>
          )}
          {site.youtubeUrl && (
            <a
              href={site.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn secondary"
            >
              YouTube
            </a>
          )}
        </section>
      )}

      <footer className={styles.footer}>
        <span>Early development build · Phase 1.5</span>
        <span>Map data © OpenStreetMap contributors</span>
        <span>Textures: Poly Haven (CC0)</span>
      </footer>
    </main>
  );
}
