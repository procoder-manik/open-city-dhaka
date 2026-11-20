'use client';

import Link from 'next/link';
import { useState } from 'react';
import { brand } from '@game/shared';
import { signIn, signUp, useSession } from '@/lib/auth-client';
import { AccountPanel } from './AccountPanel';
import styles from './login.module.css';

type Mode = 'signin' | 'signup';

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const { data: session, isPending } = useSession();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === 'signup'
          ? await signUp.email({ name: name.trim() || 'Player', email: email.trim(), password })
          : await signIn.email({ email: email.trim(), password });
      if (res.error) setError(res.error.message ?? 'কিছু একটা ভুল হয়েছে');
      else window.location.assign('/play');
    } catch {
      setError('সার্ভারে সমস্যা, একটু পরে চেষ্টা করো');
    } finally {
      setBusy(false);
    }
  };

  if (isPending) return <main className={styles.main} />;

  if (session?.user) return <AccountPanel name={session.user.name} email={session.user.email} />;

  return (
    <main className={styles.main}>
      <form className={`panel ${styles.card}`} onSubmit={submit} data-testid="login-form">
        <p className={styles.edition}>{brand.displayName}</p>
        <h1>{mode === 'signin' ? 'লগইন' : 'নতুন অ্যাকাউন্ট'}</h1>
        <p className={styles.muted}>
          লগইন করলে নিজের হিরোর নাম/টাইটেল দিতে পারবে, আর খেলা সেভ থাকবে।
        </p>
        {mode === 'signup' && (
          <label className={styles.field}>
            নাম
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="name"
            />
          </label>
        )}
        <label className={styles.field}>
          ইমেইল
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            data-testid="email"
          />
        </label>
        <label className={styles.field}>
          পাসওয়ার্ড
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            data-testid="password"
          />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button className="btn" type="submit" disabled={busy} data-testid="submit">
          {busy ? '…' : mode === 'signin' ? 'লগইন' : 'অ্যাকাউন্ট খোলো'}
        </button>
        {googleEnabled && (
          <button
            className="btn secondary"
            type="button"
            onClick={() => signIn.social({ provider: 'google', callbackURL: '/play' })}
          >
            Google দিয়ে লগইন
          </button>
        )}
        <button
          type="button"
          className={styles.switch}
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          data-testid="switch-mode"
        >
          {mode === 'signin' ? 'অ্যাকাউন্ট নেই? নতুন খোলো' : 'আগে থেকে অ্যাকাউন্ট আছে? লগইন'}
        </button>
        <Link href="/play" className={styles.switch}>
          লগইন ছাড়াই খেলো (গেস্ট)
        </Link>
      </form>
    </main>
  );
}
