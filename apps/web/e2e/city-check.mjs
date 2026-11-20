// Manual Phase 2 check: real Mohammadpur map streaming, minimap, perf.
// Usage (server on 3100): node e2e/city-check.mjs <outDir> [tier]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '.';
const tier = process.argv[3] ?? 'mobile';
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
await page.waitForTimeout(6000);
const info = () => page.evaluate(() => window.__game.debugInfo());
const stats = () =>
  page.evaluate(() => {
    const s = window.__game.store.getState();
    return `${s.tier} fps=${s.fps} calls=${s.drawCalls} tris=${s.triangles} physics=${s.physicsMode}`;
  });
console.log('spawn chunks', (await info()).cityChunks, await stats());
await page.screenshot({ path: `${out}/city-spawn.png` });
// Look along the road beyond the block (north end at z=+130)
await page.evaluate(() => window.__game.debugView(3, 120, Math.PI, 0.25));
await page.waitForTimeout(5000);
await page.screenshot({ path: `${out}/city-north.png` });
// Teleport into the real streets beyond the block and look around
await page.evaluate(() => window.__game.debugView(-180, 300, 0.8, 0.35));
await page.waitForTimeout(8000);
const i = await info();
console.log(
  'far chunks',
  i.cityChunks,
  'player',
  JSON.stringify(i.player),
  'grounded',
  i.grounded,
  await stats(),
);
await page.screenshot({ path: `${out}/city-far.png` });
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await browser.close();
