import { describe, expect, it } from 'vitest';
import { ACT1 } from './act1';
import { ACT2 } from './act2';
import { MissionSystem, type MissionDef, type WorldFacts } from './Missions';

const DEF: MissionDef = {
  id: 'test',
  title: 'Test',
  giver: 'hero',
  intro: '',
  start: { x: 0, z: 0 },
  steps: [
    { kind: 'enter', vehicle: 'cng', text: 'get a CNG' },
    { kind: 'goto', x: 100, z: 0, r: 5, text: 'drive' },
    { kind: 'talk', npc: 'mofiz', option: 'greet', x: 0, z: 0, text: 'say hi' },
    { kind: 'stay', x: 0, z: 0, r: 3, seconds: 2, text: 'wait', heat: 2 },
    { kind: 'lose', text: 'lose cops' },
  ],
  time: 100,
  reward: { taka: 500 },
};

const at = (x: number, z: number, extra: Partial<WorldFacts> = {}): WorldFacts => ({
  x,
  z,
  vehicle: null,
  wanted: 0,
  down: false,
  ...extra,
});

describe('MissionSystem', () => {
  it('starts on the marker and runs steps in order to a pass', () => {
    const m = new MissionSystem([DEF]);
    expect(m.update(0.1, at(10, 10))).toEqual([]);
    expect(m.update(0.1, at(0.5, 0))[0]?.type).toBe('start');
    expect(m.objective()).toBe('get a CNG');
    m.update(0.1, at(0, 0, { vehicle: 'car' }));
    expect(m.active?.step).toBe(0);
    m.update(0.1, at(0, 0, { vehicle: 'cng' }));
    expect(m.target()).toEqual({ x: 100, z: 0, r: 5 });
    m.update(0.1, at(98, 0, { vehicle: 'cng' }));
    m.notifyTalk('mofiz', 'greet');
    m.update(0.1, at(0, 0));
    expect(m.active?.step).toBe(3);
    const heat = [...m.update(1, at(0, 0, { wanted: 0 })), ...m.update(1.1, at(0, 0))];
    expect(heat.some((e) => e.type === 'heat')).toBe(true);
    expect(m.active?.step).toBe(4);
    m.update(0.1, at(0, 0, { wanted: 2 }));
    const end = m.update(0.1, at(0, 0, { wanted: 0 }));
    expect(end.some((e) => e.type === 'pass')).toBe(true);
    expect(m.done.has('test')).toBe(true);
    expect(m.available()).toEqual([]);
  });

  it('fails on timeout and when the player goes down', () => {
    const m = new MissionSystem([DEF]);
    m.update(0.1, at(0, 0));
    expect(m.update(200, at(50, 50))[0]).toMatchObject({ type: 'fail', reason: 'time' });
    const m2 = new MissionSystem([DEF]);
    m2.update(0.1, at(0, 0));
    expect(m2.update(0.1, at(0, 0, { down: true }))[0]).toMatchObject({
      type: 'fail',
      reason: 'down',
    });
    expect(m2.active).toBeNull();
  });

  it('Acts 1–2 are well formed: unique ids, requirements exist, rewards positive', () => {
    const ALL = [...ACT1, ...ACT2];
    const ids = new Set(ALL.map((d) => d.id));
    expect(ids.size).toBe(ALL.length);
    for (const d of ALL) {
      expect(d.steps.length).toBeGreaterThan(0);
      expect(d.reward.taka).toBeGreaterThan(0);
      for (const r of d.requires ?? []) expect(ids.has(r)).toBe(true);
    }
    const m = new MissionSystem(ALL);
    expect(m.available().length).toBeGreaterThan(0);
    // Act 2 unlocks only after the Act 1 finale
    expect(m.available().some((d) => d.id.startsWith('a2-'))).toBe(false);
    for (const d of ACT1) m.done.add(d.id);
    expect(m.available().map((d) => d.id)).toEqual(['a2-wedding-mishti']);
  });

  it('crime steps count only crimes of that kind after the step starts', () => {
    const def: MissionDef = {
      id: 'c',
      title: 'c',
      giver: 'hero',
      intro: '',
      start: { x: 0, z: 0 },
      steps: [
        { kind: 'crime', crime: 'snatch', count: 2, text: 'snatch' },
        { kind: 'speed', kmh: 80, text: 'fast' },
      ],
      reward: { taka: 1 },
    };
    const m = new MissionSystem([def]);
    m.notifyCrime('snatch'); // before start: ignored
    m.update(0.1, at(0, 0));
    m.notifyCrime('snatch');
    m.notifyCrime('assault');
    m.update(0.1, at(0, 0));
    expect(m.objective()).toBe('snatch (1/2)');
    m.notifyCrime('snatch');
    m.update(0.1, at(0, 0));
    expect(m.active?.step).toBe(1);
    m.update(0.1, at(0, 0, { kmh: 120 })); // on foot doesn't count
    expect(m.active?.step).toBe(1);
    const ev = m.update(0.1, at(0, 0, { vehicle: 'bike', kmh: 85 }));
    expect(ev.some((e) => e.type === 'pass')).toBe(true);
  });

  it('fragile cargo fails when the vehicle takes too much damage', () => {
    const def: MissionDef = {
      id: 'f',
      title: 'f',
      giver: 'hero',
      intro: '',
      start: { x: 0, z: 0 },
      steps: [{ kind: 'goto', x: 500, z: 0, r: 5, fragile: 15, text: 'careful' }],
      reward: { taka: 1 },
    };
    const m = new MissionSystem([def]);
    m.update(0.1, at(0, 0));
    m.update(0.1, at(10, 0, { vehicle: 'car', vehicleDamage: 20 })); // old dents don't count
    m.update(0.1, at(20, 0, { vehicle: 'car', vehicleDamage: 30 }));
    expect(m.active).not.toBeNull();
    const ev = m.update(0.1, at(30, 0, { vehicle: 'car', vehicleDamage: 40 }));
    expect(ev[0]).toMatchObject({ type: 'fail', reason: 'damage' });
  });
});
