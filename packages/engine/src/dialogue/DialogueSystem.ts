import type { DialogueFile, DialogueLine } from '@game/shared';
import type { Humanoid } from '../actors/Humanoid';

export interface Subtitle {
  speaker: string;
  name: string;
  color: string;
  text: string;
  en: string;
}

interface Queued {
  line: DialogueLine;
  actor: Humanoid | null;
  delay: number;
}

/**
 * Picks context lines (no immediate repeats), queues them as a conversation,
 * shows subtitles, drives the speaker's face (emotion + talking mouth) and plays
 * the recorded voice when one exists.
 */
export class DialogueSystem {
  private bySituation = new Map<string, DialogueLine[]>();
  private lastId = new Map<string, string>();
  private queue: Queued[] = [];
  private current: { sub: Subtitle; timer: number } | null = null;

  constructor(
    private readonly data: DialogueFile,
    private readonly onSubtitle: (s: Subtitle | null) => void,
    /** Called when a line starts (voice playback). */
    private readonly onSpeak?: (line: DialogueLine) => void,
  ) {
    for (const l of data.lines) {
      const key = `${l.speaker}:${l.situation}`;
      const list = this.bySituation.get(key) ?? [];
      list.push(l);
      this.bySituation.set(key, list);
    }
  }

  has(speaker: string, situation: string): boolean {
    return this.bySituation.has(`${speaker}:${situation}`);
  }

  /** Weighted random pick, never the same line twice in a row for a speaker+situation. */
  pick(speaker: string, situation: string, rand: () => number = Math.random): DialogueLine | null {
    const key = `${speaker}:${situation}`;
    const list = this.bySituation.get(key);
    if (!list?.length) return null;
    const last = this.lastId.get(key);
    const pool = list.length > 1 ? list.filter((l) => l.id !== last) : list;
    const total = pool.reduce((s, l) => s + (l.weight ?? 1), 0);
    let r = rand() * total;
    let chosen = pool[0]!;
    for (const l of pool) {
      r -= l.weight ?? 1;
      if (r <= 0) {
        chosen = l;
        break;
      }
    }
    this.lastId.set(key, chosen.id);
    return chosen;
  }

  /** Queue a line; `delay` seconds after the previous one finishes. */
  say(speaker: string, situation: string, actor: Humanoid | null, delay = 0): DialogueLine | null {
    const line = this.pick(speaker, situation);
    if (line) this.queue.push({ line, actor, delay });
    return line;
  }

  /** Interrupt everything and say this now (barks: bumped, crash…). */
  interrupt(speaker: string, situation: string, actor: Humanoid | null): DialogueLine | null {
    this.queue = [];
    this.current = null;
    return this.say(speaker, situation, actor);
  }

  get busy(): boolean {
    return this.current !== null || this.queue.length > 0;
  }

  static duration(text: string): number {
    return Math.min(6, Math.max(1.8, text.length * 0.07));
  }

  update(dt: number) {
    if (this.current) {
      this.current.timer -= dt;
      if (this.current.timer > 0) return;
      this.current = null;
      if (!this.queue.length) this.onSubtitle(null);
    }
    const next = this.queue[0];
    if (!next) return;
    if (next.delay > 0) {
      next.delay -= dt;
      return;
    }
    this.queue.shift();
    const { line, actor } = next;
    const speaker = this.data.speakers[line.speaker];
    const dur = DialogueSystem.duration(line.bn);
    const sub: Subtitle = {
      speaker: line.speaker,
      name: speaker?.name ?? line.speaker,
      color: speaker?.color ?? '#ffffff',
      text: line.bn,
      en: line.en,
    };
    this.current = { sub, timer: dur };
    actor?.setEmotion(line.emotion, dur + 1);
    actor?.talk(dur * 0.85);
    this.onSpeak?.(line);
    this.onSubtitle(sub);
  }
}
