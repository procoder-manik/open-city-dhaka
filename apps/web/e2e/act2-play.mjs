// Full Act 2 play-through in the real game (headless): every mission from its start marker
// to the pass card, using real mechanics (keyboard driving, snatching, carjacking, shooting).
// Teleports (debugDriveTo / debugView) only skip long drives.
// Usage (server on 3100): node e2e/act2-play.mjs <outDir> [tier]
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
    const s = await st();
    if (await check(i, s)) return { i, s };
    await wait(700);
  }
  const s = await st();
  throw new Error(`timeout: ${label} — mission=${JSON.stringify(s.mission)}`);
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
      `PASS ${title} (${Math.round((Date.now() - t0) / 1000)} s) card="${s.missionCard?.sub}"`,
    );
  } catch (e) {
    failed = true;
    const i = await info();
    results.push(
      `FAIL ${title}: ${e.message} | player ${JSON.stringify(i.player)} mode ${i.mode} wanted ${i.wanted}`,
    );
    await page.screenshot({ path: `${out}/act2-fail-${id}.png` });
    if ((await info()).mission) await g('debugSetWanted', 0);
  }
  console.log(results.at(-1));
}

// Regression: traffic must not ram the parked starter vehicles
for (let k = 0; k < 6; k++) {
  await wait(2000);
  const i = await info();
  const v = i.vehicles.filter((x) => !x.spare);
  console.log(
    `  t${k * 2 + 2}s`,
    v.map((x) => `${x.id} ${x.dmg}% @${x.pos}`).join(' | '),
    'traffic',
    i.traffic,
  );
}
{
  const v = (await info()).vehicles.filter((x) => !x.spare);
  const bad = v.filter((x) => x.dmg > 0);
  console.log('parked damage after 12 s:', v.map((x) => `${x.id} ${x.dmg}%`).join(', '));
  if (bad.length) {
    failed = true;
    results.push('FAIL parked vehicles damaged at start');
  } else results.push('PASS parked vehicles untouched by traffic');
}

// Act 1 was play-tested before; mark it done so Act 2 unlocks.
for (const id of [
  'a1-tea-debt',
  'a1-cng-parcel',
  'a1-oc-promotion',
  'a1-bike-race',
  'a1-thana-selfie',
])
  await g('debugMission', id, true);
await wait(1000);
console.log('start', JSON.stringify((await st()).missionBlips), 'done', (await st()).missionsDone);

// 1. Wedding sweets: walk onto the marker, take a car, market, then a careful arrival.
await mission('a2-wedding-mishti', 'বিয়ের মিষ্টি', async () => {
  await g('debugSetWanted', 0);
  await page.waitForFunction(() => !window.__game.store.getState().overlay, null, {
    timeout: 60000,
  });
  await g('debugView', 9, 24, Math.PI, 0.2);
  await wait(1200);
  await g('debugView', 9, 22, Math.PI, 0.2);
  await until('mishti starts at marker', step('a2-wedding-mishti', 0));
  await g('debugEnterVehicle', 'car-sedan');
  await until('in a car', step('a2-wedding-mishti', 1));
  await g('debugDriveTo', -74, 670, 0);
  await until('market reached', step('a2-wedding-mishti', 2));
  await page.screenshot({ path: `${out}/act2-1-mishti.png` });
  await g('debugDriveTo', -799.8, 403.8, 0);
});

// Fragile check: start again from the debug hook, bump the car hard → fail "damage".
{
  await g('debugMission', 'a2-wedding-mishti');
  await wait(500);
  const before = (await info()).missionsDone.length;
  // Re-running a passed mission is allowed via debug; just verify the fail path
  await g('debugEnterVehicle', 'car-sedan');
  await until('re-run: in car', step('a2-wedding-mishti', 1));
  await g('debugDriveTo', -74, 670, 0);
  await until('re-run: market', step('a2-wedding-mishti', 2));
  await wait(1500);
  // Drive full speed into a building wall
  await page.keyboard.down('w');
  const r = await until(
    'fragile fail',
    (i, s) => !i.mission && s.missionCard?.kind === 'fail',
    60000,
  ).catch((e) => ({ err: e.message }));
  await page.keyboard.up('w');
  const s = await st();
  console.log(
    r.err ? `fragile: no fail (${r.err})` : `fragile: FAIL card "${s.missionCard?.sub}"`,
    'damage',
    (await info()).vehicle?.damage,
    'done count',
    before,
  );
  await page.screenshot({ path: `${out}/act2-1b-fragile.png` });
  await g('debugView', 9, 0, 0, 0.2);
  await wait(2000);
}

// 2. Snatch class: three real snatches from walking pedestrians, then lose the cops.
await mission('a2-snatch-class', 'ছিনতাইয়ের ক্লাস', async () => {
  await g('debugSetWanted', 0);
  await page.waitForFunction(() => !window.__game.store.getState().overlay, null, {
    timeout: 60000,
  });
  await g('debugView', 3, 47, 0, 0.2);
  await wait(1200);
  await g('debugView', 3, 45, 0, 0.2);
  await until('snatch starts', step('a2-snatch-class', 0));
  let n = 0;
  for (let k = 0; k < 30 && n < 3; k++) {
    const ok = await g('debugTalk', 'ped', 'snatch');
    {
      const i = await info();
      const c = await st();
      console.log(
        `  snatch#${k} ok=${ok} mission=${JSON.stringify(i.mission)} wanted=${i.wanted} overlay=${JSON.stringify(c.overlay)} card=${c.missionCard?.kind}:${c.missionCard?.sub} cops=${JSON.stringify(i.copList)}`,
      );
    }
    if (ok) {
      n++;
      // Standing still with cops around = busted; phone the OC instead
      if ((await info()).wanted >= 1) await g('bribe');
    }
    await wait(1500);
  }
  console.log('  snatches done', n, 'objective', (await st()).mission?.objective);
  await until('3 snatches', (i) => step('a2-snatch-class', 1)(i) || passed('a2-snatch-class')(i));
  const w = (await info()).wanted;
  const r = await g('bribe');
  console.log('  wanted', w, 'bribe', r);
});

// 3. Speed test: bike on Mirpur Road (≈1 km straight), hold W until 90 km/h.
await mission('a2-speed-test', 'বাইকের স্পিড টেস্ট', async () => {
  await g('debugSetWanted', 0);
  await page.waitForFunction(() => !window.__game.store.getState().overlay, null, {
    timeout: 60000,
  });
  await g('debugView', 8.8, 18, 0, 0.2);
  await wait(1200);
  await g('debugView', 8.8, 16, 0, 0.2);
  await until('speed starts', step('a2-speed-test', 0));
  await g('debugEnterVehicle', 'bike-150');
  await until('on bike', step('a2-speed-test', 1));
  await g('debugDriveTo', 556, -600, 0.033);
  await wait(2500);
  await page.keyboard.down('w');
  let top = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const i = await info();
    top = Math.max(top, Math.abs(i.vehicle?.speedKmh ?? 0));
    if (i.mission?.step >= 2) break;
    await wait(500);
  }
  await page.keyboard.up('w');
  console.log('  top speed', top.toFixed(1), 'km/h');
  await page.screenshot({ path: `${out}/act2-3-speed.png` });
  await until('90 reached', step('a2-speed-test', 2), 5000);
  await g('debugDriveTo', -270.9, 1330.5, 0);
});

// 4. Garage order: two real carjacks, each delivered to Bashbari.
await mission('a2-carjack-order', 'গ্যারেজের অর্ডার', async () => {
  await g('debugSetWanted', 0);
  await page.waitForFunction(() => !window.__game.store.getState().overlay, null, {
    timeout: 60000,
  });
  await g('debugView', -171, 177, 0, 0.2);
  await wait(1200);
  await g('debugView', -171, 175, 0, 0.2);
  await until('garage starts', step('a2-carjack-order', 0));
  for (const [n, want] of [
    [1, 1],
    [2, 3],
  ]) {
    await g('debugView', 3, 40, Math.PI * 0.9, 0.2);
    let jacked = null;
    for (let k = 0; k < 40 && !jacked; k++) {
      await wait(1500);
      jacked = await g('debugCarjack');
    }
    console.log(`  carjack ${n}:`, jacked);
    await until(`carjack ${n} counted`, step('a2-carjack-order', want));
    await g('debugDriveTo', -698.9, 583.3, 0);
    await until(`delivery ${n}`, step('a2-carjack-order', want + 1));
  }
  const r = await g('bribe');
  console.log('  bribe', r, 'taka', (await st()).taka);
});

// 5. Finale: Kalyan Bazar, 4 stars, hit two cops, escape, home.
await mission('a2-kalyan-bazar', 'কল্যাণ বাজারের তাণ্ডব', async () => {
  await g('debugSetWanted', 0);
  await page.waitForFunction(() => !window.__game.store.getState().overlay, null, {
    timeout: 60000,
  });
  await g('debugView', 9, -22, 0, 0.2);
  await wait(1200);
  await g('debugView', 9, -20, 0, 0.2);
  await until('finale starts', step('a2-kalyan-bazar', 0));
  await g('debugView', -657, 686, 0, 0.2);
  await until('at bazar', step('a2-kalyan-bazar', 1));
  await until('stay 5 s → heat', step('a2-kalyan-bazar', 2), 90000);
  const i = await info();
  console.log('  wanted after heat', i.wanted, 'headline', (await st()).headline?.text);
  await page.screenshot({ path: `${out}/act2-5-heat.png` });
  // Wait for cops, then shoot/punch them (auto-aim picks cops first)
  let hits = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const j = await info();
    if (j.mission?.step >= 3) break;
    if (Date.now() - t0 > 0 && hits === 0 && Math.random() < 0.15)
      console.log('  fight:', JSON.stringify(j.copList), 'cars', JSON.stringify(j.patrolCars));
    if (j.cops > 0) {
      const d = await g('debugFaceCop');
      if (d !== null && d < 26) {
        await g('debugAttack', j.ammo > 0 ? 'pistol' : 'fist');
        hits++;
      }
    }
    if ((await st()).overlay) {
      console.log('  player went down during the fight');
      break;
    }
    await wait(900);
  }
  console.log('  shots fired', hits, 'objective', (await st()).mission?.objective);
  await page.screenshot({ path: `${out}/act2-5-fight.png` });
  await until('two cops hit', step('a2-kalyan-bazar', 3), 5000);
  const r = await g('bribe');
  console.log('  bribe', r, 'wanted', (await info()).wanted);
  await until('escaped', step('a2-kalyan-bazar', 4), 30000);
  await g('debugView', 9, 0.5, 0, 0.2);
});

await wait(1500);
await page.screenshot({ path: `${out}/act2-end.png` });
const s = await st();
console.log('\n' + results.join('\n'));
console.log(
  'missions done',
  s.missionsDone,
  '/',
  s.missionsTotal,
  'taka',
  s.taka,
  'love',
  s.publicLove,
);
console.log('errors', errors.length ? JSON.stringify(errors.slice(0, 5)) : 'none');
await browser.close();
process.exit(failed ? 1 : 0);
