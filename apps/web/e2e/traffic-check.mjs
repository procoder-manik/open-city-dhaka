// Manual Phase 3 check: traffic, pedestrians, carjacking.
// Usage (server on 3100): node e2e/traffic-check.mjs <outDir> [tier]
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
const info = () => page.evaluate(() => window.__game.debugInfo());
const stats = () =>
  page.evaluate(() => {
    const s = window.__game.store.getState();
    return `${s.tier} fps=${s.fps} calls=${s.drawCalls} tris=${s.triangles} physics=${s.physicsMode}`;
  });
await page.waitForTimeout(8000);
let i = await info();
console.log('traffic', i.traffic, 'peds', i.peds, await stats());
await page.evaluate(() => window.__game.debugView(3, 40, Math.PI * 0.9, 0.2));
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/traffic-street.png` });
const jacked = await page.evaluate(() => window.__game.debugCarjack());
await page.waitForTimeout(2500);
i = await info();
console.log('carjacked into', jacked, 'mode', i.mode, 'vehicle', JSON.stringify(i.vehicle), 'wanted', i.wanted);
await page.screenshot({ path: `${out}/traffic-carjack.png` });
const knocked = await page.evaluate(() => window.__game.debugKnockPedestrian());
await page.waitForTimeout(800);
i = await info();
console.log('knock', knocked, 'knocked now', i.knocked, 'traffic', i.traffic, 'peds', i.peds, await stats());
console.log('subtitle', i.subtitle);
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await browser.close();
