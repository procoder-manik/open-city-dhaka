'use client';

import { useState } from 'react';
import {
  DEFAULT_IDENTITY,
  HERO_TITLES,
  NAME_MAX,
  TITLE_MAX,
  checkHeroText,
  formatHero,
  type HeroIdentity,
} from '@game/shared';
import styles from './play.module.css';

const KEY = 'hero.identity';

/** Saved identity (signed-in players only). Server profile replaces this in Phase 6. */
export function loadIdentity(): HeroIdentity | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as HeroIdentity;
    const n = checkHeroText(v.name ?? '', 'name');
    const t = checkHeroText(v.title ?? '', 'title');
    return n.ok && t.ok ? { name: n.value, title: t.value } : null;
  } catch {
    return null;
  }
}

function saveIdentity(id: HeroIdentity) {
  try {
    localStorage.setItem(KEY, JSON.stringify(id));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Pause-menu panel: pick a title (রংবাজ, গ্যাংস্টার…) or type one, and rename the hero.
 * Only for signed-in players; guests see "গ্রেট থিফ মোস্তফা" and a login prompt.
 */
export function HeroPanel({
  signedIn,
  current,
  onSave,
}: {
  signedIn: boolean;
  current: string;
  onSave: (id: HeroIdentity) => void;
}) {
  const saved = loadIdentity() ?? DEFAULT_IDENTITY;
  const [title, setTitle] = useState(saved.title);
  const [name, setName] = useState(saved.name);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!signedIn) {
    return (
      <div className={styles.heroPanel}>
        <p className={styles.heroCurrent}>🦹 {current}</p>
        <p className={styles.tip}>
          নিজের টাইটেল আর নাম দিতে (যেমন &quot;রংবাজ মোস্তফা&quot;) লগইন করতে হবে — লগইন শীঘ্রই আসছে।
        </p>
      </div>
    );
  }

  const save = () => {
    const t = checkHeroText(title, 'title');
    const n = checkHeroText(name, 'name');
    if (!t.ok) return setError(`টাইটেল: ${t.reason}`);
    if (!n.ok) return setError(`নাম: ${n.reason}`);
    const id = { title: t.value, name: n.value };
    saveIdentity(id);
    onSave(id);
    setError(null);
    setDone(true);
  };

  return (
    <div className={styles.heroPanel} data-testid="hero-panel">
      <p className={styles.heroCurrent}>🦹 {formatHero({ title, name })}</p>
      <div className={styles.menuRow}>
        {HERO_TITLES.map((t) => (
          <button
            key={t}
            type="button"
            className={`${styles.chip} ${title === t ? styles.chipActive : ''}`}
            onClick={() => {
              setTitle(t);
              setDone(false);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <label className={styles.field}>
        টাইটেল
        <input
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => {
            setTitle(e.target.value);
            setDone(false);
          }}
          data-testid="hero-title"
        />
      </label>
      <label className={styles.field}>
        নাম
        <input
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => {
            setName(e.target.value);
            setDone(false);
          }}
          data-testid="hero-name"
        />
      </label>
      {error && <p className={styles.formError}>{error}</p>}
      <button type="button" className="btn secondary" onClick={save} data-testid="hero-save">
        {done ? '✓ সেভ হয়েছে' : 'নাম সেভ করো'}
      </button>
    </div>
  );
}
