'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authClient, signOut } from '@/lib/auth-client';
import styles from './login.module.css';

interface Summary {
  hero: string | null;
  taka: number | null;
  missions: number | null;
}

/** Signed-in view: hero + cloud-save summary, change password, delete account, sign out. */
export function AccountPanel({ name, email }: { name: string; email: string }) {
  const [sum, setSum] = useState<Summary>({ hero: null, taka: null, missions: null });
  const [pwOpen, setPwOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [delPw, setDelPw] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const out: Summary = { hero: null, taka: null, missions: null };
      try {
        const p = await fetch('/api/profile').then((r) => (r.ok ? r.json() : null));
        if (p?.title) out.hero = `${p.title} ${p.name}`;
        const s = await fetch('/api/save?slot=1').then((r) => (r.ok ? r.json() : null));
        if (s?.data) {
          out.taka = Number(s.data.taka ?? 0);
          out.missions = Array.isArray(s.data.missions) ? s.data.missions.length : 0;
        }
      } catch {
        /* offline: keep blanks */
      }
      setSum(out);
    })();
  }, []);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await authClient.changePassword({
      currentPassword: cur,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (res.error) setMsg({ ok: false, text: res.error.message ?? 'পাসওয়ার্ড বদলানো গেল না' });
    else {
      setMsg({ ok: true, text: 'পাসওয়ার্ড বদলানো হয়েছে ✔' });
      setCur('');
      setNext('');
      setPwOpen(false);
    }
  };

  const deleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await authClient.deleteUser({ password: delPw });
    setBusy(false);
    if (res.error) setMsg({ ok: false, text: res.error.message ?? 'অ্যাকাউন্ট মোছা গেল না' });
    else window.location.assign('/');
  };

  return (
    <main className={styles.main}>
      <div className={`panel ${styles.card}`} data-testid="account">
        <h1>স্বাগতম, {name}!</h1>
        <p className={styles.muted}>{email}</p>
        <div className={styles.stats}>
          <div>
            <small>হিরো</small>
            <b>{sum.hero ?? 'গ্রেট থিফ মোস্তফা'}</b>
          </div>
          <div>
            <small>ক্লাউড সেভ</small>
            <b>
              {sum.taka === null
                ? 'এখনো নেই'
                : `৳${sum.taka.toLocaleString('bn-BD')} · মিশন ${(sum.missions ?? 0).toLocaleString('bn-BD')}`}
            </b>
          </div>
        </div>
        <Link href="/play" className="btn">
          খেলা শুরু করো ▶
        </Link>
        <Link href="/leaderboard" className="btn secondary">
          🏆 লিডারবোর্ড
        </Link>

        {msg && <p className={msg.ok ? styles.ok : styles.error}>{msg.text}</p>}

        {pwOpen ? (
          <form onSubmit={changePassword} className={styles.sub}>
            <label className={styles.field}>
              বর্তমান পাসওয়ার্ড
              <input
                type="password"
                required
                value={cur}
                onChange={(e) => setCur(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <label className={styles.field}>
              নতুন পাসওয়ার্ড (৮+ অক্ষর)
              <input
                type="password"
                required
                minLength={8}
                maxLength={128}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <button className="btn" type="submit" disabled={busy}>
              বদলাও
            </button>
          </form>
        ) : (
          <button type="button" className={styles.switch} onClick={() => setPwOpen(true)}>
            পাসওয়ার্ড বদলাও
          </button>
        )}

        <button
          type="button"
          className="btn secondary"
          onClick={() => signOut().then(() => window.location.assign('/'))}
          data-testid="logout"
        >
          লগআউট
        </button>

        {delOpen ? (
          <form onSubmit={deleteAccount} className={styles.sub}>
            <p className={styles.error}>
              সাবধান! অ্যাকাউন্ট, হিরোর নাম আর সব সেভ চিরতরে মুছে যাবে — আর ফেরত আনা যাবে না।
            </p>
            <label className={styles.field}>
              নিশ্চিত করতে পাসওয়ার্ড দাও
              <input
                type="password"
                required
                value={delPw}
                onChange={(e) => setDelPw(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <button className="btn secondary" type="submit" disabled={busy}>
              চিরতরে মুছে ফেলো
            </button>
          </form>
        ) : (
          <button type="button" className={styles.switch} onClick={() => setDelOpen(true)}>
            অ্যাকাউন্ট মুছে ফেলো
          </button>
        )}
      </div>
    </main>
  );
}
