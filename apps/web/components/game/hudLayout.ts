'use client';

import { useSyncExternalStore, type CSSProperties } from 'react';

/** Touch-button groups the player can move and resize. */
export const HUD_GROUPS = ['move', 'drive', 'combat', 'interact'] as const;
export type HudGroup = (typeof HUD_GROUPS)[number];
export type HudPlacement = { x: number; y: number; s: number };
export type HudLayout = Record<HudGroup, HudPlacement>;

export const HUD_GROUP_LABEL: Record<HudGroup, string> = {
  move: 'লাফ / দৌড়',
  drive: 'গাড়ির প্যাডেল',
  combat: 'অস্ত্র',
  interact: 'ওঠো / নামো',
};

export const MIN_SCALE = 0.7;
export const MAX_SCALE = 1.5;
const KEY = 'hud.layout.v1';
const DEFAULT: HudLayout = Object.fromEntries(
  HUD_GROUPS.map((g) => [g, { x: 0, y: 0, s: 1 }]),
) as HudLayout;

let current: HudLayout = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

const num = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

function load(): HudLayout {
  if (loaded) return current;
  loaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<
      Record<HudGroup, Partial<HudPlacement>>
    > | null;
    if (raw && typeof raw === 'object') {
      current = Object.fromEntries(
        HUD_GROUPS.map((g) => {
          const p = raw[g] ?? {};
          return [
            g,
            {
              x: num(p.x, -2000, 2000, 0),
              y: num(p.y, -2000, 2000, 0),
              s: num(p.s, MIN_SCALE, MAX_SCALE, 1),
            },
          ];
        }),
      ) as HudLayout;
    }
  } catch {
    // Private mode / bad JSON: defaults
  }
  return current;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
  for (const l of listeners) l();
}

export function setPlacement(g: HudGroup, p: Partial<HudPlacement>) {
  const prev = load()[g];
  current = {
    ...current,
    [g]: {
      x: p.x ?? prev.x,
      y: p.y ?? prev.y,
      s: Math.min(MAX_SCALE, Math.max(MIN_SCALE, p.s ?? prev.s)),
    },
  };
  save();
}

export function resetLayout() {
  current = DEFAULT;
  save();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useHudLayout(): HudLayout {
  return useSyncExternalStore(subscribe, load, () => DEFAULT);
}

/** Inline style for a group (individual transform properties keep the CSS `transform`). */
export function hudStyle(layout: HudLayout, g: HudGroup): CSSProperties {
  const p = layout[g];
  if (!p.x && !p.y && p.s === 1) return {};
  return { translate: `${p.x}px ${p.y}px`, scale: String(p.s) };
}
