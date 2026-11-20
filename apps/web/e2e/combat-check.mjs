// Manual Phase 4 check: punches, pistol, grenade, police chase, wasted / busted.
// Usage (server on 3100): node e2e/combat-check.mjs <outDir> [tier]
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
await page.waitForTimeout(5000);
const info = () => page.evaluate(() => window.__game.debugInfo());
const g = (fn, ...a) => page.evaluate(([f, args]) => window.__game[f](...args), [fn, a]);
let i = await info();
console.log('start health', i.health, 'weapon', i.weapon, 'ammo', i.ammo, 'grenades', i.grenades);
await g('debugAttack', 'pistol');
await page.waitForTimeout(400);
i = await info();
console.log('after shot ammo', i.ammo, 'wanted', i.wanted, 'subtitle', i.subtitle);
await page.screenshot({ path: `${out}/combat-shot.png` });
await g('debugSetWanted', 3);
await page.waitForTimeout(12000);
i = await info();
console.log('wanted 3 → cops', i.cops, 'cars', i.policeCars, 'health', i.health);
await page.screenshot({ path: `${out}/combat-police.png` });
await g('debugAttack', 'grenade');
await page.waitForTimeout(3500);
i = await info();
console.log('after grenade grenades', i.grenades, 'copsDown', i.copsDown, 'health', i.health);
await page.screenshot({ path: `${out}/combat-grenade.png` });
await g('debugDamage', 500);
await page.waitForTimeout(1500);
i = await info();
console.log('overlay', i.overlay);
await page.screenshot({ path: `${out}/combat-wasted.png` });
await page.waitForTimeout(5500);
i = await info();
console.log(
  'after respawn overlay',
  i.overlay,
  'health',
  i.health,
  'wanted',
  i.wanted,
  'cops',
  i.cops,
);
// Busted: wanted 1, stand still and wait for cops
await g('debugSetWanted', 1);
await page.waitForTimeout(25000);
i = await info();
console.log('busted test overlay', i.overlay, 'cops', i.cops, 'ammo', i.ammo);
await page.screenshot({ path: `${out}/combat-busted.png` });
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await browser.close();
