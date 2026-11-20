// Manual check: custom hero name, crimes → wanted, headlines, posters/billboard, bribe.
// Usage (server on 3100): node e2e/identity-check.mjs <outDir> [tier]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '.';
const tier = process.argv[3] ?? 'medium';
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((t) => {
  localStorage.setItem('gfx.tier', t);
  localStorage.setItem('hero.identity', JSON.stringify({ title: 'রংবাজ', name: 'উমুক' }));
}, tier);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)));

await page.goto('http://localhost:3100/play?debug=1');
await page.getByTestId('play-btn').click();
await page.waitForFunction(() => window.__game?.store.getState().status === 'running', null, {
  timeout: 90000,
});
await page.waitForTimeout(2500);
const info = () => page.evaluate(() => window.__game.debugInfo());
console.log('hero', (await info()).heroFull);

// Crimes → wanted + headline
await page.evaluate(() => window.__game.debugTalk('rickshaw1', 'snatch'));
await page.waitForTimeout(400);
await page.evaluate(() => window.__game.debugTalk('tourist', 'snatch'));
await page.waitForTimeout(800);
let i = await info();
console.log('after 2 snatches: wanted', i.wanted, 'crimes', i.crimes, 'taka', i.taka);
console.log(
  'headline',
  await page
    .getByTestId('headline')
    .innerText()
    .catch(() => 'none'),
);
console.log('subtitle', i.subtitle);
await page.screenshot({ path: `${out}/id-hud.png` });

// Look at the billboard (left side, z=22) from the road
await page.evaluate(() => window.__game.debugEnterVehicle('car-sedan'));
await page.keyboard.down('KeyW');
await page.waitForTimeout(1100);
await page.keyboard.up('KeyW');
await page.keyboard.down('KeyS');
await page.waitForTimeout(900);
await page.keyboard.up('KeyS');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/id-billboard.png` });

// Bribe
const r = await page.evaluate(() => window.__game.bribe());
await page.waitForTimeout(1200);
i = await info();
console.log('bribe', r, '→ wanted', i.wanted, 'taka', i.taka, 'subtitle', i.subtitle);
await page.waitForTimeout(3500);
console.log('OC reply', (await info()).subtitle);
console.log('errors', JSON.stringify(errors));
await browser.close();
