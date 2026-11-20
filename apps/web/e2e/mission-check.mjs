// Manual Phase 5 check: walk into the first mission marker and complete it.
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
const info = () => page.evaluate(() => window.__game.debugInfo());
const s0 = await info();
console.log('taka', s0.taka, 'mission', JSON.stringify(s0.mission));
await page.evaluate(() => window.__game.debugView(8.7, -12.5, Math.PI, 0.2));
await page.waitForTimeout(1500);
await page.evaluate(() => window.__game.debugView(8.7, -10.5, Math.PI, 0.2));
await page.waitForTimeout(2500);
let i = await info();
console.log('at marker → mission', JSON.stringify(i.mission));
await page.screenshot({ path: `${out}/mission-start.png` });
await page.evaluate(() => window.__game.debugTalk('rickshaw1', 'threaten'));
await page.waitForTimeout(1500);
i = await info();
console.log('after threaten → mission', JSON.stringify(i.mission));
await page.evaluate(() => window.__game.debugView(8.7, -10.5, 0, 0.2));
await page.waitForTimeout(2500);
i = await info();
console.log(
  'back → mission',
  JSON.stringify(i.mission),
  'done',
  JSON.stringify(i.missionsDone),
  'taka',
  i.taka,
);
await page.screenshot({ path: `${out}/mission-pass.png` });
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await browser.close();
