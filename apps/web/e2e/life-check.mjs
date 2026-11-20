// Manual Phase 1.5 check: hero look, NPC talk, posters, crash damage, dashboard.
// Usage (server on 3100): node e2e/life-check.mjs <outDir> [tier]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '.';
const tier = process.argv[3] ?? 'mobile';
const browser = await chromium.launch({
  args: [
    '--enable-unsafe-webgpu',
    '--use-angle=swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
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
await page.waitForTimeout(2000);
const info = () => page.evaluate(() => window.__game.debugInfo());
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });

await shot('a-spawn');
console.log('npcs', JSON.stringify((await info()).npcs));

// Walk to the tourist (close to spawn): face -Z and walk
await page.keyboard.down('KeyS');
await page.waitForTimeout(900);
await page.keyboard.up('KeyS');
await page.waitForTimeout(400);
let i = await info();
console.log('talkTarget after walking', i.talkTarget, 'player', JSON.stringify(i.player));
console.log(
  'talk menu visible',
  await page
    .getByTestId('talk-menu')
    .isVisible()
    .catch(() => false),
);

// Conversations via debug hook (independent of where we walked)
console.log(
  'greet tourist',
  await page.evaluate(() => window.__game.debugTalk('tourist', 'greet')),
);
await page.waitForTimeout(900);
await shot('b-greet');
console.log('subtitle', (await info()).subtitle);
await page.waitForTimeout(3500);
console.log('subtitle 2', (await info()).subtitle);
const before = (await info()).taka;
console.log(
  'snatch rickshaw',
  await page.evaluate(() => window.__game.debugTalk('rickshaw1', 'snatch')),
);
await page.waitForTimeout(600);
i = await info();
console.log('taka', before, '->', i.taka, 'notoriety', i.notoriety, 'subtitle', i.subtitle);
await page.waitForTimeout(2500);
console.log('order tea', await page.evaluate(() => window.__game.debugTalk('mofiz', 'order')));
await page.waitForTimeout(800);
i = await info();
console.log('taka after tea', i.taka, 'subtitle', i.subtitle);

// Crash the car into the far building to test damage
await page.evaluate(() => window.__game.debugEnterVehicle('car-sedan'));
await page.waitForTimeout(300);
await page.keyboard.down('KeyW');
await page.waitForTimeout(1500);
await page.keyboard.down('KeyA'); // steer left → into the left-side shops
await page.waitForTimeout(2500);
await page.keyboard.up('KeyA');
await page.keyboard.up('KeyW');
await page.waitForTimeout(600);
i = await info();
console.log('car after crash', JSON.stringify(i.vehicle));
await shot('c-crash');
console.log(
  'dash damage text',
  await page
    .getByTestId('damage')
    .innerText()
    .catch(() => 'n/a'),
);
await page.keyboard.down('KeyH');
await page.waitForTimeout(300);
await page.keyboard.up('KeyH');

// Close-up of hero next to posters at the shutters, and the banner
await page.evaluate(() => window.__game.debugEnterVehicle('bike-150'));
await page.waitForTimeout(300);
await page.keyboard.press('KeyF');
await page.waitForTimeout(800);
await shot('d-hero');
console.log('errors', JSON.stringify(errors));
await browser.close();
