import type { Metadata } from 'next';
import { brand } from '@game/shared';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'ক্রেডিট', alternates: { canonical: '/credits' } };

const OPEN_SOURCE: Array<[string, string, string]> = [
  ['three.js', 'MIT', 'https://threejs.org'],
  ['Rapier physics', 'Apache-2.0', 'https://rapier.rs'],
  ['Next.js & React', 'MIT', 'https://nextjs.org'],
  ['Better Auth', 'MIT', 'https://www.better-auth.com'],
  ['Drizzle ORM', 'Apache-2.0', 'https://orm.drizzle.team'],
  ['PGlite', 'Apache-2.0', 'https://pglite.dev'],
  ['Zustand', 'MIT', 'https://zustand.docs.pmnd.rs'],
  ['Zod', 'MIT', 'https://zod.dev'],
  ['Hind Siliguri font', 'SIL OFL 1.1', 'https://fonts.google.com/specimen/Hind+Siliguri'],
];

export default function CreditsPage() {
  return (
    <LegalPage title={`ক্রেডিট — ${brand.displayName}`}>
      <h2>ম্যাপ</h2>
      <p>
        মোহাম্মদপুরের রাস্তা, ভবন, পার্ক ও জায়গার নাম:{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          © OpenStreetMap contributors
        </a>{' '}
        (ODbL)। গেমের প্রয়োজনে সরল করা হয়েছে — নেভিগেশনের জন্য ব্যবহার কোরো না।
      </p>
      <h2>টেক্সচার ও শব্দ</h2>
      <p>
        ফটো টেক্সচার:{' '}
        <a href="https://polyhaven.com" target="_blank" rel="noopener noreferrer">
          Poly Haven
        </a>{' '}
        (CC0)। গাড়ির ইঞ্জিন, হর্ন, সাইরেন, গুলি ও বিস্ফোরণের শব্দ গেমের ভেতরেই কোড দিয়ে তৈরি। কণ্ঠ: আগে
        থেকে তৈরি AI ভয়েস (থাকলে) অথবা তোমার ডিভাইসের টেক্সট-টু-স্পিচ।
      </p>
      <h2>ওপেন সোর্স</h2>
      <ul>
        {OPEN_SOURCE.map(([name, lic, url]) => (
          <li key={name}>
            <a href={url} target="_blank" rel="noopener noreferrer">
              {name}
            </a>{' '}
            — {lic}
          </li>
        ))}
      </ul>
      <h2>বানানো</h2>
      <p>
        চরিত্র, গাড়ি ও শহরের সব মডেল কোড দিয়ে বানানো (প্রসিডিউরাল)। ডিজাইন ও কোডিংয়ে AI সহায়তা
        (Claude, Anthropic) নেওয়া হয়েছে।
      </p>
    </LegalPage>
  );
}
