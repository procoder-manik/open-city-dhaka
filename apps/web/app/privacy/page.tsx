import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import styles from '@/components/legal.module.css';

export const metadata: Metadata = { title: 'প্রাইভেসি নীতি', alternates: { canonical: '/privacy' } };

export default function PrivacyPage() {
  return (
    <LegalPage title="প্রাইভেসি নীতি (Privacy Policy)" updated="২১ নভেম্বর ২০২৬">
      <p>
        আমরা যতটা সম্ভব কম তথ্য রাখি। গেস্ট হিসেবে খেললে কোনো অ্যাকাউন্ট লাগে না — অগ্রগতি শুধু তোমার
        ব্রাউজারেই (localStorage) থাকে।
      </p>
      <h2>লগইন করলে যা রাখা হয়</h2>
      <ul>
        <li>নাম ও ইমেইল (অ্যাকাউন্ট চেনার জন্য)। পাসওয়ার্ড কখনো সরাসরি রাখা হয় না — শুধু নিরাপদ হ্যাশ।</li>
        <li>Google দিয়ে লগইন করলে Google থেকে নাম, ইমেইল ও ছবির লিংক।</li>
        <li>হিরোর টাইটেল ও নাম, আর গেম সেভ (টাকা, মিশন, ওয়ান্টেড রেকর্ড ইত্যাদি)।</li>
        <li>লগইন সেশনের জন্য একটি নিরাপদ (httpOnly) কুকি, আর সেশনের সাথে IP ও ব্রাউজারের নাম।</li>
      </ul>
      <h2>যা আমরা করি না</h2>
      <ul>
        <li>কোনো বিজ্ঞাপন বা থার্ড-পার্টি ট্র্যাকার নেই। তথ্য কারো কাছে বিক্রি করা হয় না।</li>
        <li>লিডারবোর্ডে শুধু তোমার দেওয়া হিরোর নাম দেখায় — ইমেইল কখনো না।</li>
        <li>
          NPC-দের কণ্ঠ তৈরি হয় তোমার ডিভাইসেই বা আগে থেকে তৈরি অডিও ফাইল থেকে — তোমার মাইক্রোফোন
          ব্যবহার হয় না।
        </li>
      </ul>
      <h2>তোমার নিয়ন্ত্রণ</h2>
      <p>
        <a href="/account">অ্যাকাউন্ট পেজ</a> থেকে যেকোনো সময় পাসওয়ার্ড বদলাতে বা অ্যাকাউন্ট চিরতরে মুছে
        ফেলতে পারো — তাতে হিরোর নাম আর সব সেভও মুছে যায়। প্রশ্ন থাকলে হোম পেজের মতামত ফর্ম ব্যবহার করো।
      </p>
      <p className={styles.en}>
        English summary: guests are not tracked (progress stays in your browser). Accounts store
        name, email, a password hash, hero name and game saves, plus a session cookie. No ads, no
        third-party trackers, nothing sold. Leaderboards show only hero names. You can delete your
        account and all saves from the Account page at any time.
      </p>
    </LegalPage>
  );
}
