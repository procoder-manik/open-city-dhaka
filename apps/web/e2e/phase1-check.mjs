// Manual Phase 1 check: screenshots + driving measurements in headless Chromium.
// Usage (server on 3100): node e2e/phase1-check.mjs <outDir> [tier]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '.';
const tier = process.argv[3] ?? 'medium';
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((t) => localStorage.setItem('gfx.tier', t), tier);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto('http://localhost:3100/play?debug=1');
await page.getByTestId('play-btn').click();
await page.waitForFunction(() => window.__game?.store.getState().status === 'running', null, {
  timeout: 60000,
});
await page.waitForTimeout(2500);
const info = () => page.evaluate(() => window.__game.debugInfo());
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const hold = async (keys, ms) => {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
};

console.log('spawn', JSON.stringify(await info()));
await shot('01-spawn');

// Walk & sprint
await hold(['KeyW'], 1200);
await shot('02-walk');
await hold(['ShiftLeft', 'KeyW'], 1500);
await shot('03-sprint');
await page.keyboard.press('Space');
await page.waitForTimeout(250);
await shot('04-jump');
console.log('after walk', JSON.stringify(await info()));

// Back to the car: reload for a clean spawn, walk is non-deterministic
await page.evaluate(() => window.__game.setHour(17.4));
await page.reload();
await page.getByTestId('play-btn').click();
await page.waitForFunction(() => window.__game?.store.getState().status === 'running', null, {
  timeout: 60000,
});
await page.waitForTimeout(2500);
console.log('nearest at spawn', (await info()).nearest);

// Enter nearest (bike is closest to spawn), ride
await page.keyboard.press('KeyF');
await page.waitForTimeout(400);
let i = await info();
console.log('entered', i.mode, i.vehicle?.id);
await hold(['KeyW'], 2500);
i = await info();
console.log('after 2.5s throttle', JSON.stringify(i.vehicle));
await shot('05-ride');
await hold(['KeyW', 'KeyA'], 1200);
await shot('06-turn');
await hold(['KeyS'], 2500);
i = await info();
console.log('after braking', JSON.stringify(i.vehicle));
await page.keyboard.press('KeyF');
await page.waitForTimeout(500);
i = await info();
console.log('exited', i.mode, 'player', JSON.stringify(i.player), 'grounded', i.grounded);
await shot('07-exit');

// Dusk & night
await page.evaluate(() => window.__game.setHour(18.8));
await page.waitForTimeout(1200);
await shot('08-dusk');
await page.evaluate(() => window.__game.setHour(21));
await page.waitForTimeout(1200);
await shot('09-night');
await page.evaluate(() => window.__game.setHour(12));
await page.waitForTimeout(1200);
await shot('10-noon');

console.log(
  'stats',
  JSON.stringify(
    await page.evaluate(() => {
      const s = window.__game.store.getState();
      return {
        fps: s.fps,
        backend: s.backend,
        tier: s.tier,
        calls: s.drawCalls,
        tris: s.triangles,
        physics: s.physicsMode,
      };
    }),
  ),
);
console.log('errors', JSON.stringify(errors));
await browser.close();
