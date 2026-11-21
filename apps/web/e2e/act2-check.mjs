// Manual Act 2 check: unlock, carjack order steps, fragile sweets objective.
import { chromium } from '@playwright/test';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => localStorage.setItem('gfx.tier', 'lite'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:3100/play?debug=1');
await page.getByTestId('play-btn').click();
await page.waitForFunction(() => window.__game?.store.getState().status === 'running', null, {
  timeout: 120000,
});
await page.waitForTimeout(3000);
const g = (fn, ...a) => page.evaluate(([f, args]) => window.__game[f](...args), [fn, a]);
const info = () => page.evaluate(() => window.__game.debugInfo());
const store = () =>
  page.evaluate(() => {
    const s = window.__game.store.getState();
    return {
      mission: s.mission,
      done: s.missionsDone,
      total: s.missionsTotal,
      blips: s.missionBlips.length,
    };
  });
console.log('fresh', JSON.stringify(await store()));
for (const id of [
  'a1-tea-debt',
  'a1-cng-parcel',
  'a1-oc-promotion',
  'a1-bike-race',
  'a1-thana-selfie',
])
  await g('debugMission', id, true);
await page.waitForTimeout(800);
console.log('act1 done', JSON.stringify(await store()));
// Wedding sweets: start → enter a car → objective moves on
await g('debugMission', 'a2-wedding-mishti');
await page.waitForTimeout(1500);
console.log('mishti start', JSON.stringify((await store()).mission));
await g('debugEnterVehicle', 'car-sedan');
await page.waitForTimeout(1500);
console.log('mishti in car', JSON.stringify((await store()).mission));
await page.screenshot({ path: `${out}/act2-mishti.png` });
// Carjack order: a real carjack advances the step
await g('debugMission', 'a2-carjack-order');
await page.waitForTimeout(1000);
await g('debugView', 3, 40, Math.PI * 0.9, 0.2);
let jacked = null;
for (let k = 0; k < 20 && !jacked; k++) {
  await page.waitForTimeout(1500);
  jacked = await g('debugCarjack');
}
await page.waitForTimeout(1500);
const i = await info();
console.log('carjacked', jacked, 'mission', JSON.stringify(i.mission));
await page.screenshot({ path: `${out}/act2-carjack.png` });
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await browser.close();
