// Manual driving check for every vehicle: acceleration, top speed, braking, steering.
// Usage (server on 3100): node e2e/drive-check.mjs <outDir>
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '.';
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
await ctx.addInitScript(() => localStorage.setItem('gfx.tier', 'lite'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

for (const id of ['car-sedan', 'cng-auto', 'bike-150']) {
  await page.goto('http://localhost:3100/play?debug=1');
  await page.getByTestId('play-btn').click();
  await page.waitForFunction(() => window.__game?.store.getState().status === 'running', null, {
    timeout: 60000,
  });
  await page.waitForTimeout(1500);
  await page.evaluate((v) => window.__game.debugEnterVehicle(v), id);
  await page.waitForTimeout(300);
  const v = async () => (await page.evaluate(() => window.__game.debugInfo())).vehicle;
  const start = await v();
  await page.keyboard.down('KeyW');
  const samples = [];
  for (let t = 1; t <= 5; t++) {
    await page.waitForTimeout(1000);
    samples.push((await v()).speedKmh);
  }
  await page.screenshot({ path: `${out}/drive-${id}.png` });
  // steer right while driving
  const before = await v();
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyD');
  const afterTurn = await v();
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyS');
  let brakeTime = 0;
  for (; brakeTime < 8000; brakeTime += 250) {
    await page.waitForTimeout(250);
    if (Math.abs((await v()).speedKmh) < 3) break;
  }
  await page.keyboard.up('KeyS');
  const end = await v();
  console.log(
    JSON.stringify({
      id,
      start: start.pos,
      speedPerSecond: samples,
      turnRight: { before: before.pos, after: afterTurn.pos },
      stopMs: brakeTime,
      end: end.pos,
      upright: end.pos[1] > 0.3,
    }),
  );
}
console.log('errors', JSON.stringify(errors));
await browser.close();
