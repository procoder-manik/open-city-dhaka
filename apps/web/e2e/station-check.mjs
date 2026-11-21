// Petrol pump + garage check in the real game. Exits 1 on any failure.
// Usage (server on 3100): node e2e/station-check.mjs <outDir> [tier]
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
let failed = false;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${extra}`);
  if (!ok) failed = true;
};
async function waitFor(fn, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await fn();
    if (r) return r;
    await wait(500);
  }
  return null;
}
await g('setHour', 13);
await g('setWeather', 'clear');
const s0 = await st();
check(
  s0.stations.length === 6,
  'stations on the map',
  JSON.stringify(s0.stations.map((s) => s[2])),
);

// 1. Low fuel warning
await g('debugEnterVehicle', 'car-sedan');
await wait(800);
await g('debugFuel', 0.1);
const warn = await waitFor(async () => {
  const sub = (await st()).subtitle;
  return sub && sub.name && /তেল/.test(sub.text) ? sub.text : null;
}, 20000);
check(!!warn, 'low-fuel line', warn ?? '');

// 2. Pump, poor: fills only what ৳120 buys, attendant complains
await g('debugMoney', 120);
await g('debugDriveTo', 88, -0.9, Math.atan2(75.7 - 89.2, -1 - -0.9));
const pill = await waitFor(async () => (await st()).station, 20000);
check(pill?.type === 'pump', 'pump status pill', JSON.stringify(pill));
await wait(2500);
await page.screenshot({ path: `${out}/station-pump.png` });
const poor = await waitFor(async () => {
  const s = await st();
  return s.taka <= 1 ? s : null;
}, 60000);
let i = await info();
check(
  !!poor && i.fuel > 0.3 && i.fuel < 0.45,
  'broke: ৳120 buys ~27% of a tank',
  `fuel ${i.fuel} taka ${(await st()).taka}`,
);

// 3. Leave and come back with money: fills to full, charged ~৳ for the rest of the tank
await g('debugDriveTo', 120, -0.9, 0);
await wait(2000);
await g('debugMoney', 2000);
const before = i.fuel;
await g('debugDriveTo', 88, -0.9, Math.atan2(75.7 - 89.2, -1 - -0.9));
const full = await waitFor(async () => {
  const j = await info();
  return j.fuel > 0.99 ? j : null;
}, 60000);
const spent = 2000 - (await st()).taka;
check(
  !!full && Math.abs(spent - (1 - before) * 450) < 15,
  'full tank paid by the litre',
  `fuel ${full?.fuel} spent ৳${spent} (expected ~৳${Math.round((1 - before) * 450)})`,
);

// 4. Garage: dent the car (grenade next to it) + wanted, then drive in → repaired + resprayed
await g('debugDriveTo', -640, 690, 0);
await wait(2500);
await g('debugExplode', 4, 0);
await wait(2500);
await g('debugSetWanted', 2);
i = await info();
const dmg0 = i.vehicleDmg;
console.log('  before garage: damage', dmg0, 'wanted', i.wanted, 'mode', i.mode);
if (i.mode !== 'vehicle') await g('debugEnterVehicle', 'car-sedan');
await g('debugMoney', 2000);
await g('debugDriveTo', -676.6, 695.7, Math.atan2(-663.8 - -676.6, 691.3 - 695.7));
const served = await waitFor(async () => {
  const s = await st();
  return s.station?.type === 'garage' && /শেষ/.test(s.station.text) ? s : null;
}, 60000);
await wait(800);
i = await info();
const s1 = await st();
check(
  !!served && i.vehicleDmg === 0 && i.wanted === 0 && s1.taka < 2000,
  'garage repaired + resprayed (wanted wiped)',
  `damage ${dmg0} → ${i.vehicleDmg}, wanted → ${i.wanted}, paid ৳${2000 - s1.taka}, "${s1.headline?.text ?? ''}"`,
);
await page.screenshot({ path: `${out}/station-garage.png` });
// Walk out and look at the garage
await g('debugView', -668, 712, Math.PI * 1.2, 0.05);
await wait(4000);
await page.screenshot({ path: `${out}/station-garage-outside.png` });
await g('debugView', 100, 10, Math.PI * 0.6, 0.05);
await wait(4000);
await page.screenshot({ path: `${out}/station-pump-outside.png` });

console.log('errors', errors.length ? JSON.stringify(errors.slice(0, 5)) : 'none');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
