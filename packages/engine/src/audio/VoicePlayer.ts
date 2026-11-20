import type { DialogueLine } from '@game/shared';

export type VoiceMode = 'auto' | 'recorded' | 'device' | 'off';

/** Per-character delivery for the device voice (rate, pitch). */
const DELIVERY: Record<string, { rate: number; pitch: number; lang: 'bn' | 'en' }> = {
  hero: { rate: 1.08, pitch: 0.85, lang: 'bn' },
  teaChacha: { rate: 0.85, pitch: 0.65, lang: 'bn' },
  rickshawWala: { rate: 1.2, pitch: 1.1, lang: 'bn' },
  shopkeeper: { rate: 1.0, pitch: 1.0, lang: 'bn' },
  foreigner: { rate: 0.95, pitch: 1.15, lang: 'en' },
};

/**
 * Speaks dialogue lines:
 * 1. Recorded/generated voice files (`/assets/voice/<id>.mp3`, listed in manifest.json) — best
 * 2. Device AI voice (Web Speech API, Bangla where the device has it) — free fallback
 * Subtitles always show regardless.
 */
export class VoicePlayer {
  private recorded = new Set<string>();
  private bnVoice: SpeechSynthesisVoice | null = null;
  private enVoice: SpeechSynthesisVoice | null = null;
  private audioEl: HTMLAudioElement | null = null;
  mode: VoiceMode = 'auto';
  muted = false;

  constructor(private readonly base = '/assets/voice') {}

  async init(): Promise<void> {
    try {
      const res = await fetch(`${this.base}/manifest.json`, { cache: 'no-cache' });
      if (res.ok) {
        const ids = (await res.json()) as unknown;
        if (Array.isArray(ids))
          for (const id of ids) if (typeof id === 'string') this.recorded.add(id);
      }
    } catch {
      /* no generated voices yet */
    }
    this.pickVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.addEventListener?.('voiceschanged', () => this.pickVoices());
    }
  }

  private pickVoices() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    const score = (v: SpeechSynthesisVoice) =>
      (v.lang === 'bn-BD' ? 3 : v.lang.startsWith('bn') ? 2 : 0) +
      (/google|natural|neural/i.test(v.name) ? 1 : 0);
    this.bnVoice =
      voices
        .filter((v) => v.lang.toLowerCase().startsWith('bn'))
        .sort((a, b) => score(b) - score(a))[0] ?? null;
    this.enVoice =
      voices.find((v) => /en-GB/i.test(v.lang) && /google|natural/i.test(v.name)) ??
      voices.find((v) => v.lang.startsWith('en')) ??
      null;
  }

  /** What will actually be used right now (for the settings label). */
  get effective(): 'recorded' | 'device' | 'off' {
    if (this.mode === 'off') return 'off';
    if ((this.mode === 'auto' || this.mode === 'recorded') && this.recorded.size > 0)
      return 'recorded';
    if ((this.mode === 'auto' || this.mode === 'device') && this.bnVoice) return 'device';
    return 'off';
  }

  get hasDeviceBangla(): boolean {
    return this.bnVoice !== null;
  }

  get recordedCount(): number {
    return this.recorded.size;
  }

  speak(line: DialogueLine) {
    if (this.muted || this.mode === 'off') return;
    const url = line.audio ?? (this.recorded.has(line.id) ? `${this.base}/${line.id}.mp3` : null);
    if (url && this.mode !== 'device') {
      this.stop();
      this.audioEl = new Audio(url);
      this.audioEl.volume = 1;
      void this.audioEl.play().catch(() => this.speakDevice(line));
      return;
    }
    if (this.mode === 'recorded') return;
    this.speakDevice(line);
  }

  private speakDevice(line: DialogueLine) {
    if (!('speechSynthesis' in window)) return;
    const d = DELIVERY[line.speaker] ?? { rate: 1, pitch: 1, lang: 'bn' as const };
    const voice = d.lang === 'en' ? (this.enVoice ?? this.bnVoice) : this.bnVoice;
    if (!voice) return;
    const text = d.lang === 'en' && this.enVoice ? line.en : line.bn;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = d.rate;
    u.pitch = d.pitch;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  stop() {
    this.audioEl?.pause();
    this.audioEl = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }
}
