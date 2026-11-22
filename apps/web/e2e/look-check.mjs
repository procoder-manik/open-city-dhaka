// Visual check: same street at noon, evening and night (and a crowd/shop view).
// Usage (server on 3100): node e2e/look-check.mjs <outDir> [tier] [prefix]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '.';
const tier = process.argv[3] ?? 'medium';
const prefix = process.argv[4] ?? 'look';
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((t) => localStorage.setItem('gfx.tier', t), tier);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:3100/play?debug=1');
await page.getByTestId('play-btn').click();
await page.waitForFunction(() => window.__game?.store.getState().status === 'running', null, {
  timeout: 120000,
});
const g = (fn, ...a) => page.evaluate(([f, args]) => window.__game[f](...args), [fn, a]);
await g('setMuted', true);
await g('setWeather', 'clear');
for (const [name, hour] of [
  ['noon', 12.5],
  ['evening', 18.4],
  ['night', 22],
]) {
  await g('setHour', hour);
  await g('debugView', 3, 40, Math.PI * 0.9, 0.12);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${out}/${prefix}-${name}.png` });
}
// Night in the real city (Kalyan Bazar)
await g('debugView', -657, 686, 0.4, 0.1);
await page.waitForTimeout(6000);
await page.screenshot({ path: `${out}/${prefix}-night-city.png` });
// Faces: stand in front of Mofiz (tea seller) and look at him; then a punch mid-swing
await g('setHour', 13);
const mofiz = (await page.evaluate(() => window.__game.debugInfo())).npcs.find(
  (n) => n.id === 'mofiz',
).pos;
await g('debugView', mofiz[0] + 2.6, mofiz[2] + 0.4, Math.PI / 2 + 0.15, 0.02);
await page.waitForTimeout(5000);
await page.screenshot({ path: `${out}/${prefix}-faces.png` });
await g('debugAttack', 'fist');
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/${prefix}-punch-a.png` });
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/${prefix}-punch-b.png` });
console.log('errors', errors.length ? JSON.stringify(errors.slice(0, 3)) : 'none');
await browser.close();
