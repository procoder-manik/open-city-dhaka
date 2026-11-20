import { describe, expect, it } from 'vitest';
import { dialogue } from '@game/content';
import { DialogueSystem } from './DialogueSystem';

describe('DialogueSystem', () => {
  it('never repeats the same line twice in a row', () => {
    const d = new DialogueSystem(dialogue, () => {});
    let prev = '';
    for (let i = 0; i < 50; i++) {
      const l = d.pick('hero', 'greet')!;
      expect(l.id).not.toBe(prev);
      prev = l.id;
    }
  });

  it('plays a queued conversation in order with subtitles', () => {
    const subs: Array<string | null> = [];
    const d = new DialogueSystem(dialogue, (s) => subs.push(s?.speaker ?? null));
    d.say('hero', 'greet', null);
    d.say('teaChacha', 'greetReply', null, 0.2);
    for (let t = 0; t < 20; t += 0.1) d.update(0.1);
    expect(subs.filter(Boolean)).toEqual(['hero', 'teaChacha']);
    expect(subs.at(-1)).toBeNull();
    expect(d.busy).toBe(false);
  });

  it('every speaker used in lines is declared, and every NPC has core reactions', () => {
    for (const l of dialogue.lines) expect(dialogue.speakers[l.speaker]).toBeDefined();
    const d = new DialogueSystem(dialogue, () => {});
    for (const npc of ['teaChacha', 'rickshawWala', 'shopkeeper', 'foreigner']) {
      for (const s of ['greetReply', 'threatenReply', 'snatched', 'bumped']) {
        expect(d.has(npc, s), `${npc}:${s}`).toBe(true);
      }
    }
  });
});
