'use client';

import type { Game, GamePrefs } from '@game/engine';

/** Everything the player sets in the pause menu, saved per device. */
export interface SavedSettings {
  prefs: GamePrefs;
  weather: 'auto' | 'clear' | 'rain';
  voiceMode: 'auto' | 'device' | 'off';
  /** Subtitle text size multiplier. */
  subtitleScale: number;
  /** Show the English line under the Bangla subtitle. */
  english: boolean;
}

const KEY = 'game.settings.v1';

export const DEFAULT_SETTINGS: SavedSettings = {
  prefs: { haptics: true, autoFire: true, batterySaver: false, easyControls: true },
  weather: 'auto',
  voiceMode: 'auto',
  subtitleScale: 1,
  english: true,
};

export function loadSettings(): SavedSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SavedSettings> | null;
    if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS;
    const p = (raw.prefs ?? {}) as Partial<GamePrefs>;
    const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
    return {
      prefs: {
        haptics: bool(p.haptics, true),
        autoFire: bool(p.autoFire, true),
        batterySaver: bool(p.batterySaver, false),
        easyControls: bool(p.easyControls, true),
      },
      weather: raw.weather === 'clear' || raw.weather === 'rain' ? raw.weather : 'auto',
      voiceMode: raw.voiceMode === 'device' || raw.voiceMode === 'off' ? raw.voiceMode : 'auto',
      subtitleScale:
        typeof raw.subtitleScale === 'number' ? Math.min(1.5, Math.max(0.8, raw.subtitleScale)) : 1,
      english: bool(raw.english, true),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: SavedSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode: settings last for this session only
  }
}

/** Push saved settings into a freshly created game. */
export function applySettings(g: Game, s: SavedSettings) {
  g.setPrefs(s.prefs);
  g.setWeather(s.weather);
  g.setVoiceMode(s.voiceMode);
}
