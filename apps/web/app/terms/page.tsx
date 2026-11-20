import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import styles from '@/components/legal.module.css';

export const metadata: Metadata = { title: 'শর্তাবলি', alternates: { canonical: '/terms' } };

export default function TermsPage() {
  return (
    <LegalPage title="শর্তাবলি (Terms of Use)" updated="২১ নভেম্বর ২০২৬">
      <h2>এটা কাল্পনিক কমেডি</h2>
      <p>
        গেমের সব চরিত্র, ঘটনা, সংলাপ ও সংবাদ শিরোনাম কাল্পনিক ও হাস্যরসাত্মক। বাস্তব কোনো ব্যক্তি, দল,
        প্রতিষ্ঠান বা ব্র্যান্ডকে বোঝানো হয়নি। জায়গার নাম ও রাস্তার নকশা OpenStreetMap থেকে নেওয়া — শুধু
        পরিচিত পরিবেশ বানানোর জন্য। বাস্তবে চুরি, ছিনতাই, ঘুষ বা মারামারি অপরাধ — গেমেরটা গেমেই থাকুক।
      </p>
      <h2>বয়স ও কনটেন্ট</h2>
      <p>গেমে কার্টুনধর্মী মারামারি, অস্ত্র ও অপরাধের কমেডি আছে। ১৩ বছরের বেশি বয়সীদের জন্য উপযুক্ত।</p>
      <h2>তোমার দেওয়া নাম</h2>
      <ul>
        <li>হিরোর নাম/টাইটেলে বাস্তব কোনো মানুষের নাম, গালি, ঘৃণাসূচক বা অশ্লীল শব্দ ব্যবহার করবে না।</li>
        <li>নিয়ম ভাঙলে নাম বদলে দেওয়া বা অ্যাকাউন্ট বন্ধ করা হতে পারে।</li>
      </ul>
      <h2>ন্যায্য ব্যবহার</h2>
      <ul>
        <li>
          সার্ভারে হ্যাক, স্প্যাম বা অতিরিক্ত অনুরোধ পাঠানো নিষেধ। লিডারবোর্ডে চিটিং করলে মুছে ফেলা হবে।
        </li>
        <li>গেম “যেমন আছে তেমন” দেওয়া হচ্ছে; বাগ থাকতে পারে, সেভ হারাতে পারে, ফিচার বদলাতে পারে।</li>
        <li>ডোনেশন সম্পূর্ণ স্বেচ্ছায় — এর বিনিময়ে গেমে কোনো সুবিধা দেওয়া হয় না।</li>
      </ul>
      <p className={styles.en}>
        English summary: this is a fictional comedy; any resemblance to real people is unintended.
        Real-world crime is not okay. Suitable for ages 13+. Don&apos;t use real people&apos;s names
        or offensive words as hero names. No hacking/spamming/leaderboard cheating. Provided as-is;
        donations are voluntary and grant no in-game advantage.
      </p>
    </LegalPage>
  );
}
