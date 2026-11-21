// Manual Phase 7 check: rain, wet roads, thunder, actor culling.
// Usage (server on 3100): node e2e/weather-check.mjs <outDir> [tier]
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
    return `${s.tier} fps=${s.fps} calls=${s.drawCalls} tris=${s.triangles}`;
  });
await page.evaluate(() => window.__game.setHour(13));
await page.evaluate(() => window.__game.debugView(3, 40, Math.PI * 0.9, 0.15));
await page.waitForTimeout(6000);
let i = await info();
console.log('dry: rain', i.rain, 'wet', i.wet, 'actorsDrawn', i.actorsDrawn, await stats());
await page.screenshot({ path: `${out}/weather-dry.png` });
await page.evaluate(() => window.__game.setWeather('rain'));
await page.waitForFunction(() => window.__game.debugInfo().rain > 0.6, null, { timeout: 240000 });
await page.waitForTimeout(3000);
i = await info();
console.log('rain: rain', i.rain, 'wet', i.wet, 'actorsDrawn', i.actorsDrawn, await stats());
await page.screenshot({ path: `${out}/weather-rain.png` });
await page.evaluate(() => window.__game.debugView(3, 40, -Math.PI * 0.1, 0.15));
await page.waitForTimeout(2500);
i = await info();
console.log('turned around: actorsDrawn', i.actorsDrawn, 'peds', i.peds, await stats());
await page.evaluate(() => window.__game.setWeather('clear'));
await page.waitForTimeout(4000);
i = await info();
console.log('clear: rain', i.rain, 'wet', i.wet);
console.log('errors', errors.length ? errors : 'none');
await browser.close();
