// Full Act 3 play-through in the real game (headless). Real mechanics for crimes, shooting,
// ramming and grenades; the "tail" drives are simulated by keeping the player's car ~25 m
// behind the moving target with teleports (headless runs at ~5 FPS, too slow to steer).
// Usage (server on 3100): node e2e/act3-play.mjs <outDir> [tier]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '.';
const tier = process.argv[3] ?? 'lite';
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((t) => localStorage.setItem('gfx.tier', t), tier);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
await page.goto('http://localhost:3100/play?debug=1');
await page.getByTestId('play-btn').click();
await page.waitForFunction(() => window.__game?.store.getState().status === 'running', null, {
  timeout: 120000,
});
await page.evaluate(() => window.__game.setMuted(true));

const g = (fn, ...a) => page.evaluate(([f, args]) => window.__game[f](...args), [fn, a]);
const info = () => page.evaluate(() => window.__game.debugInfo());
const st = () => page.evaluate(() => window.__game.store.getState());
const wait = (ms) => page.waitForTimeout(ms);
const results = [];
let failed = false;

async function until(label, check, timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const i = await info();
    if (await check(i, await st())) return i;
    await wait(600);
  }
  throw new Error(`timeout: ${label} — mission=${JSON.stringify((await st()).mission)}`);
}
const step = (id, n) => (i) => i.mission?.id === id && i.mission.step >= n;
const passed = (id) => (i) => i.missionsDone.includes(id);

async function mission(id, title, fn) {
  const t0 = Date.now();
  try {
    await fn();
    await until(`${id} pass`, passed(id), 30000);
    const s = await st();
    results.push(
      `PASS ${title} (${Math.round((Date.now() - t0) / 1000)} s) "${s.missionCard?.sub}"`,
    );
  } catch (e) {
    failed = true;
    const i = await info();
    results.push(
      `FAIL ${title}: ${e.message} | player ${JSON.stringify(i.player)} mode ${i.mode} wanted ${i.wanted}`,
    );
    await page.screenshot({ path: `${out}/act3-fail-${id}.png` });
  }
  console.log(results.at(-1));
}

/** Phone the OC until the wanted level is gone (crashes can add a star after a bribe). */
async function clearWanted() {
  for (let k = 0; k < 6; k++) {
    if ((await info()).wanted === 0) return 'clean';
    await g('bribe');
    await wait(1500);
  }
  return `wanted ${(await info()).wanted}`;
}

/** Walk onto a start marker (approach from 2 m away so the trigger fires naturally). */
async function walkOn(x, z) {
  await page.waitForFunction(() => !window.__game.store.getState().overlay, null, {
    timeout: 60000,
  });
  await g('debugSetWanted', 0);
  await g('debugView', x, z + 2.5, 0, 0.2);
  await wait(1200);
  await g('debugView', x, z, 0, 0.2);
}

/** Keep the player's car `gap` m behind the moving target until the step advances. */
async function tailBehind(id, stepIndex, gap, seconds) {
  let prev = (await info()).target;
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000) {
    await wait(700);
    const i = await info();
    if (i.mission?.id !== id || i.mission.step > stepIndex) return i;
    const t = i.target;
    if (!t) continue;
    let hx = t.x - prev.x;
    let hz = t.z - prev.z;
    const L = Math.hypot(hx, hz);
    if (L > 0.3) {
      hx /= L;
      hz /= L;
      await g('debugDriveTo', t.x - hx * gap, t.z - hz * gap, Math.atan2(hx, hz));
    }
    prev = t;
  }
  return info();
}

/** Stand near the target and shoot it with the real pistol code until it is wrecked. */
async function shootTarget(id) {
  for (let k = 0; k < 40; k++) {
    const i = await info();
    if (!i.target || !i.target.alive || i.mission?.id !== id) return k;
    const t = i.target;
    if (i.mode !== 'foot' || Math.hypot(i.player[0] - t.x, i.player[2] - t.z) > 16) {
      await g('debugView', t.x + 9, t.z + 9, 0, 0.1);
      await wait(800);
    }
    const t2 = (await info()).target;
    if (!t2?.alive) return k;
    await g('debugFace', t2.x, t2.z);
    if ((await info()).ammo <= 0) return -1;
    await g('debugAttack', 'pistol');
    await wait(450);
  }
  return 40;
}

// Acts 1–2 were play-tested before; mark them done so Act 3 unlocks.
const BEFORE = [
  'a1-tea-debt',
  'a1-cng-parcel',
  'a1-oc-promotion',
  'a1-bike-race',
  'a1-thana-selfie',
  'a2-wedding-mishti',
  'a2-snatch-class',
  'a2-speed-test',
  'a2-carjack-order',
  'a2-kalyan-bazar',
];
for (const id of BEFORE) await g('debugMission', id, true);
await wait(1000);
console.log('blips', JSON.stringify((await st()).missionBlips));

// 1. Tail the rival's yellow car for 40 s (10–50 m), report home
await mission('a3-tail-rival', 'হলুদ গাড়ির পিছু', async () => {
  await walkOn(-74, 670);
  await until('starts', step('a3-tail-rival', 0));
  const t = (await info()).target;
  console.log('  target spawned at', t && [Math.round(t.x), Math.round(t.z)]);
  await g('debugEnterVehicle', 'car-sedan');
  await until('in car', step('a3-tail-rival', 1));
  await page.screenshot({ path: `${out}/act3-1-tail-start.png` });
  const i = await tailBehind('a3-tail-rival', 1, 25, 200);
  console.log('  after tail: step', i.mission?.step, 'objective', (await st()).mission?.objective);
  await page.screenshot({ path: `${out}/act3-1-tailing.png` });
  await until('tail done', step('a3-tail-rival', 2), 5000);
  await g('debugDriveTo', 9, 1.5, 0);
});

// 1b. Spotted: run it again (debug start) and drive right up to the target
{
  await g('debugMission', 'a3-tail-rival');
  await wait(800);
  if (!(await info()).vehicle) await g('debugEnterVehicle', 'car-sedan');
  await until('re-run in car', step('a3-tail-rival', 1)).catch(() => null);
  const t0 = Date.now();
  let card = null;
  while (Date.now() - t0 < 60000) {
    const i = await info();
    if (!i.mission) {
      card = (await st()).missionCard;
      break;
    }
    const t = i.target;
    if (t) await g('debugDriveTo', t.x + 4, t.z + 4, 0);
    await wait(700);
  }
  const ok = card?.kind === 'fail';
  console.log(`${ok ? 'PASS' : 'FAIL'} tail: too close gets you spotted → "${card?.sub}"`);
  if (!ok) failed = true;
  await g('debugView', 9, 0, 0, 0.2);
  await wait(2000);
}

// 2. Wreck the extortion car by shooting it
await mission('a3-extortion-car', 'চান্দাবাজের গাড়ি', async () => {
  await walkOn(-663, 693);
  await until('starts', step('a3-extortion-car', 0));
  const shots = await shootTarget('a3-extortion-car');
  console.log('  shots to wreck', shots, 'target', JSON.stringify((await info()).target));
  await page.screenshot({ path: `${out}/act3-2-wreck.png` });
  await until('wrecked', step('a3-extortion-car', 1), 10000);
  console.log('  wanted', (await info()).wanted, '→', await clearWanted());
});

// 3. Market loot: stay 6 s (3 stars), careful drive to the garage, escape
await mission('a3-market-loot', 'টাউন হলে দিনে-দুপুরে', async () => {
  await walkOn(9, 30);
  await until('starts', step('a3-market-loot', 0));
  await g('debugView', -74, 668, 0, 0.2);
  await until('at market', step('a3-market-loot', 1));
  await until('loot (stay) done', step('a3-market-loot', 2), 90000);
  console.log(
    '  wanted after loot',
    (await info()).wanted,
    'headline',
    (await st()).headline?.text,
  );
  await g('debugEnterVehicle', 'car-sedan');
  await until('in car', step('a3-market-loot', 3));
  await g('debugDriveTo', -698.9, 583.3, 0);
  await until('garage', step('a3-market-loot', 4));
  console.log('  wanted', (await info()).wanted, '→', await clearWanted());
});

// 4. Bribe CNG: tail 25 s, then ram it with the car
await mission('a3-cng-bribe', 'ঘুষের সিএনজি', async () => {
  if ((await info()).vehicle) await g('debugView', 392, 362, 0, 0.2);
  await walkOn(392, 360);
  await until('starts', step('a3-cng-bribe', 0));
  await g('debugEnterVehicle', 'car-sedan');
  await until('in car', step('a3-cng-bribe', 1));
  await tailBehind('a3-cng-bribe', 1, 22, 150);
  await until('tail done', step('a3-cng-bribe', 2), 5000);
  // Ram: pull in 18 m ahead of the CNG, face it and floor it (head-on)
  let rams = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    const i = await info();
    if (i.mission?.step >= 3 || !i.target?.alive) break;
    const t = i.target;
    const fx = Math.sin(t.yaw);
    const fz = Math.cos(t.yaw);
    await g('debugDriveTo', t.x + fx * 18, t.z + fz * 18, t.yaw + Math.PI);
    await wait(300);
    await page.keyboard.down('w');
    await wait(2500);
    await page.keyboard.up('w');
    rams++;
  }
  console.log('  ram attempts', rams, 'target', JSON.stringify((await info()).target));
  await until('rammed to bits', step('a3-cng-bribe', 3), 10000);
  console.log('  wanted', (await info()).wanted, '→', await clearWanted());
});

// 5. Finale: grenade the OC's jeep, 5 stars at the thana, escape, home
await mission('a3-oc-double-game', 'ওসির ডাবল গেম', async () => {
  if ((await info()).vehicle) await g('debugView', 9, -28, 0, 0.2);
  await walkOn(9, -30);
  await until('starts', step('a3-oc-double-game', 0));
  let blasts = 0;
  while (blasts < 6) {
    const i = await info();
    if (!i.target?.alive || i.mission?.step >= 1) break;
    const t = i.target;
    await g('debugView', t.x + 7, t.z + 7, 0, 0.1);
    await wait(500);
    const t2 = (await info()).target;
    const me = (await info()).player;
    await g('debugExplode', t2.x - me[0], t2.z - me[2]);
    blasts++;
    await wait(1500);
  }
  console.log('  grenades', blasts, 'target', JSON.stringify((await info()).target));
  await page.screenshot({ path: `${out}/act3-5-jeep.png` });
  await until('jeep destroyed', step('a3-oc-double-game', 1), 10000);
  await page.waitForFunction(() => !window.__game.store.getState().overlay, null, {
    timeout: 60000,
  });
  await g('debugView', -383, 1080, 0, 0.2);
  await until('5 stars at the thana', step('a3-oc-double-game', 2), 60000);
  console.log('  wanted', (await info()).wanted, 'headline', (await st()).headline?.text);
  console.log('  escape:', await clearWanted(), 'taka', (await st()).taka);
  await until('escaped', step('a3-oc-double-game', 3), 30000);
  await g('debugView', 9, 0.5, 0, 0.2);
});

await wait(1500);
const s = await st();
console.log('\n' + results.join('\n'));
console.log('missions done', s.missionsDone, '/', s.missionsTotal, 'taka', s.taka);
console.log('errors', errors.length ? JSON.stringify(errors.slice(0, 5)) : 'none');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
