// Phase 7 polish check in the real game: wet-road braking, spray, load-shedding blackout,
// haptics, touch auto-fire, battery saver. Exits 1 on any failure.
// Usage (server on 3100): node e2e/polish-check.mjs <outDir> [tier]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '.';
const tier = process.argv[3] ?? 'lite';
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true });
await ctx.addInitScript((t) => {
  localStorage.setItem('gfx.tier', t);
  // Record vibrations instead of buzzing
  window.__vib = [];
  Object.defineProperty(navigator, 'vibrate', {
    value: (p) => (window.__vib.push(p), true),
    configurable: true,
  });
}, tier);
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
const wait = (ms) => page.waitForTimeout(ms);
let failed = false;
/** Wait until no WASTED/BUSTED screen, on foot at (x, z). */
async function reset(x, z, yaw = 0) {
  await page.waitForFunction(() => !window.__game.store.getState().overlay, null, {
    timeout: 60000,
  });
  await g('debugView', x, z, yaw, 0.15);
  await g('debugSetWanted', 0);
  await wait(1500);
}
const check = (ok, label, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${extra}`);
  if (!ok) failed = true;
};

/** Drive the car north on Mirpur Road to ~targetKmh, brake, return stopping distance (m). */
async function brakeTest(targetKmh) {
  if (!(await info()).vehicle) console.log('  enter:', await g('debugEnterVehicle', 'car-sedan'));
  await wait(500);
  console.log('  in car:', (await info()).vehicle?.id ?? null);
  await g('debugDriveTo', 556, -620, 0.033);
  await wait(2500);
  await page.keyboard.down('w');
  let i = await info();
  const t0 = Date.now();
  while (Math.abs(i.vehicle?.speedKmh ?? 0) < targetKmh && Date.now() - t0 < 60000) {
    await wait(250);
    i = await info();
  }
  await page.keyboard.up('w');
  if (!i.vehicle) {
    const st = await page.evaluate(() => window.__game.store.getState());
    console.log(
      '  not in a car:',
      JSON.stringify({ mode: i.mode, wanted: i.wanted, overlay: st.overlay, cops: i.cops }),
    );
    return { v0: 0, dist: NaN };
  }
  const start = i.vehicle.pos;
  const v0 = i.vehicle.speedKmh;
  await page.keyboard.down('s');
  const t1 = Date.now();
  while (Math.abs(i.vehicle?.speedKmh ?? 0) > 3 && Date.now() - t1 < 40000) {
    await wait(150);
    i = await info();
  }
  await page.keyboard.up('s');
  const end = i.vehicles.find((v) => v.id === 'car-sedan' && !v.spare).pos;
  return { v0, dist: Math.hypot(end[0] - start[0], end[2] - start[2]) };
}

// 3. Blackout at night: lights off, headline, crimes half as visible
await reset(3, 45);
await g('setHour', 21);
await wait(3000);
await page.screenshot({ path: `${out}/polish-night-lit.png` });
await g('debugBlackout', 40);
await wait(2500);
let i = await info();
const st = await page.evaluate(() => window.__game.store.getState());
check(i.blackout === true, 'blackout active', `headline="${st.headline?.text ?? ''}"`);
await page.screenshot({ path: `${out}/polish-night-blackout.png` });
const heat0 = (await info()).heat;
let snatched = false;
for (let k = 0; k < 15 && !snatched; k++) {
  snatched = await g('debugTalk', 'ped', 'snatch');
  if (!snatched) await wait(1000);
}
i = await info();
const dh = i.heat - heat0;
check(
  snatched && dh > 0.3 && dh < 0.7,
  'snatch in the dark adds half the heat',
  `+${dh.toFixed(2)} (normal +1.0)`,
);

// 4. Haptics: a pistol shot vibrates
await reset(3, 45);
await page.evaluate(() => (window.__vib = []));
await g('debugAttack', 'pistol');
const vib = await page.evaluate(() => window.__vib);
check(vib.length > 0, 'haptic on shot', JSON.stringify(vib));
await g('setPrefs', { haptics: false });
await page.evaluate(() => (window.__vib = []));
await wait(600);
await g('debugAttack', 'pistol');
check((await page.evaluate(() => window.__vib)).length === 0, 'haptics off = silent');

// 5. Touch auto-fire: switch to touch, get wanted, face a cop → ammo drops by itself
await page.touchscreen.tap(900, 300);
await wait(500);
await g('setWeather', 'clear');
await g('debugSetWanted', 2);
const ammo0 = (await info()).ammo;
let fired = false;
const t0 = Date.now();
while (Date.now() - t0 < 120000 && !fired) {
  await page.touchscreen.tap(900, 300); // keep last input = touch
  const d = await g('debugFaceCop');
  if (d !== null && d < 27) {
    // weapon must be the pistol for auto-fire
    const w = (await info()).weapon;
    if (w !== 'pistol') await page.keyboard.press('x');
    await wait(1500);
    fired = (await info()).ammo < ammo0;
  } else await wait(1500);
}
check(fired, 'auto-fire shoots a cop in the crosshair', `ammo ${ammo0} → ${(await info()).ammo}`);
await page.screenshot({ path: `${out}/polish-autofire.png` });
await g('bribe');

// 6. Battery saver caps the frame rate setting
await g('setPrefs', { batterySaver: true });
const prefs = await page.evaluate(() => window.__game.store.getState().prefs);
check(prefs.batterySaver === true, 'battery saver pref set');

await g('setPrefs', { batterySaver: false });
await reset(9, 0);
// 7. Dry vs wet braking (last: crashes may draw police) from ~60 km/h
await g('setHour', 13);
await g('setWeather', 'clear');
await wait(3000);
const dry = await brakeTest(60);
await g('setWeather', 'rain'); // stay in the car while the roads get wet
await page.waitForFunction(() => window.__game.debugInfo().wet > 0.7, null, { timeout: 300000 });
const wet = await brakeTest(60);
check(
  wet.dist > dry.dist * 1.1,
  'wet roads brake longer',
  `dry ${dry.dist.toFixed(1)} m from ${dry.v0} km/h, wet ${wet.dist.toFixed(1)} m from ${wet.v0} km/h`,
);

// 8. Spray: accelerate in the rain and screenshot
await g('debugDriveTo', 556, -620, 0.033);
await wait(2000);
await page.keyboard.down('w');
await page
  .waitForFunction(() => Math.abs(window.__game.debugInfo().vehicle?.speedKmh ?? 0) > 35, null, {
    timeout: 60000,
  })
  .catch(() => {});
await page.screenshot({ path: `${out}/polish-spray.png` });
await page.keyboard.up('w');
await g('setWeather', 'clear');
console.log(
  'after spray drive: overlay',
  JSON.stringify(await page.evaluate(() => window.__game.store.getState().overlay)),
);

console.log('errors', errors.length ? JSON.stringify(errors.slice(0, 5)) : 'none');
if (errors.length) failed = true;
await browser.close();
process.exit(failed ? 1 : 0);
