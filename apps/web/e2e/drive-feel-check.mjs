// Driving feel check: accelerate, brake to a stop, reverse, crash into a wall repeatedly.
// Usage (server on 3100): node e2e/drive-feel-check.mjs [vehicle-def]
import { chromium } from '@playwright/test';

const def = process.argv[2] ?? 'car-sedan';
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => localStorage.setItem('gfx.tier', 'lite'));
const page = await ctx.newPage();
await page.goto('http://localhost:3100/play?debug=1');
await page.getByTestId('play-btn').click();
await page.waitForFunction(() => window.__game?.store.getState().status === 'running', null, { timeout: 120000 });
const g = (fn, ...a) => page.evaluate(([f, args]) => window.__game[f](...args), [fn, a]);
const v = async () => (await page.evaluate(() => window.__game.debugInfo())).vehicle;
const log = async (label) => { const x = await v(); console.log(label, x ? `speed ${x.speedKmh} km/h dmg ${JSON.stringify(Object.values(x.damage).map((d) => Math.round(d)))}` : 'not in vehicle'); };
await g('debugEnterVehicle', def);
await g('debugDriveTo', 556, -600, 0.033); // straight Mirpur Road
await page.waitForTimeout(2500);
if (!process.env.QUICK) {
await page.keyboard.down('w'); await page.waitForTimeout(6000); await page.keyboard.up('w');
await log('after 6 s W:');
await page.keyboard.down('s');
for (let k = 1; k <= 10; k++) { await page.waitForTimeout(1000); await log(`S held ${k}s:`); }
await page.keyboard.up('s');
console.log('--- crash test: from Mirpur Road drive east into the buildings, 8 times');
for (let k = 1; k <= 8; k++) {
  await page.waitForFunction(() => !window.__game.store.getState().overlay, null, { timeout: 60000 });
  await g('debugSetWanted', 0);
  if (!(await v())) await g('debugEnterVehicle', def);
  await g('debugDriveTo', 556, -560 + k * 12, Math.PI / 2);
  await page.waitForTimeout(1500);
  await page.keyboard.down('w'); await page.waitForTimeout(4500); await page.keyboard.up('w');
  const i = await page.evaluate(() => { const d = window.__game.debugInfo(); const s = window.__game.store.getState(); return { pos: d.vehicle?.pos, overlay: s.overlay?.kind ?? null, wanted: d.wanted, health: s.health }; });
  await log(`crash ${k}:`);
  console.log('   ', JSON.stringify(i));
}
await page.keyboard.down('s'); await page.waitForTimeout(3000); await page.keyboard.up('s');
await log('reverse after crashes:');

}
console.log('--- ram traffic');
await g('debugSetWanted', 0);
let flung = 0;
for (let k = 0; k < 10 && flung === 0; k++) {
  const t = await page.evaluate(() => {
    const p = window.__game.debugInfo().player;
    return null;
  });
  // put the car 25 m behind a traffic car, pointing at it, and floor it
  const tc = await page.evaluate(() => window.__game.debugTraffic?.() ?? null);
  if (!tc) { console.log('no debugTraffic'); break; }
  const dmg0 = (await v())?.damage;
  // head-on: 18 m in front of it, facing it
  await g('debugDriveTo', tc.x + Math.sin(tc.yaw) * 18, tc.z + Math.cos(tc.yaw) * 18, tc.yaw + Math.PI);
  await page.waitForTimeout(400);
  await page.keyboard.down('w'); await page.waitForTimeout(4000); await page.keyboard.up('w');
  flung = await page.evaluate(() => window.__game.debugTraffic?.()?.flung ?? 0);
  console.log('ram try', k, 'flung cars', flung, 'own damage', JSON.stringify(dmg0), '->', JSON.stringify((await v())?.damage));
}
console.log('--- police: 2 snatches then wait');
await g('debugView', 3, 45, 0, 0.2);
await page.waitForTimeout(2000);
let ok = 0;
for (let k = 0; k < 20 && ok < 2; k++) { if (await g('debugTalk', 'ped', 'snatch')) ok++; await page.waitForTimeout(800); }
console.log('snatches', ok);
const w = await page.evaluate(() => ({ wanted: window.__game.debugInfo().wanted, heat: window.__game.debugInfo().heat, bribe: window.__game.store.getState().bribeCost }));
console.log('after snatches', JSON.stringify(w));
await page.waitForTimeout(40000);
console.log('40 s later', JSON.stringify(await page.evaluate(() => ({ wanted: window.__game.debugInfo().wanted, heat: window.__game.debugInfo().heat }))));
await browser.close();
