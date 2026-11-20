'use client';

import type { HeroIdentity } from '@game/shared';
import type { SaveData } from '@game/engine';

const GUEST_KEY = 'save.guest.v1';

/** Signed-in player's hero identity from the server (null if not signed in / error). */
export async function fetchProfile(): Promise<HeroIdentity | null> {
  try {
    const res = await fetch('/api/profile', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as HeroIdentity;
  } catch {
    return null;
  }
}

export async function saveProfile(
  id: HeroIdentity,
): Promise<{ ok: true; id: HeroIdentity } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(id),
    });
    const body = (await res.json()) as HeroIdentity & { error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? 'সেভ হয়নি' };
    return { ok: true, id: { title: body.title, name: body.name } };
  } catch {
    return { ok: false, error: 'সার্ভারে সমস্যা' };
  }
}

export async function loadProgress(signedIn: boolean): Promise<Partial<SaveData> | null> {
  if (signedIn) {
    try {
      const res = await fetch('/api/save?slot=1', { cache: 'no-store' });
      if (res.ok) return ((await res.json()) as { data: Partial<SaveData> }).data;
      if (res.status !== 404) return null;
    } catch {
      return null;
    }
  }
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    return raw ? (JSON.parse(raw) as Partial<SaveData>) : null;
  } catch {
    return null;
  }
}

/** Save progress: cloud for signed-in players (+ local copy), browser for guests. */
export async function saveProgress(signedIn: boolean, data: SaveData): Promise<void> {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable */
  }
  if (!signedIn) return;
  try {
    await fetch('/api/save?slot=1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
      keepalive: true,
    });
  } catch {
    /* offline: local copy kept */
  }
}
