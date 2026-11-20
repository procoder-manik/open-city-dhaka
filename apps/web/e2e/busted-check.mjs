// Manual check: 1-star wanted → cops run in and arrest a player standing still.
import { chromium } from '@playwright/test';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => localStorage.setItem('gfx.tier', 'lite'));
const page = await ctx.newPage();
await page.goto('http://localhost:3100/play?debug=1');
await page.getByTestId('play-btn').click();
await page.waitForFunction(() => window.__game?.store.getState().status === 'running', null, {
  timeout: 120000,
});
await page.waitForTimeout(3000);
await page.evaluate(() => window.__game.debugSetWanted(1));
let busted = false;
for (let t = 0; t < 50 && !busted; t++) {
  await page.waitForTimeout(1000);
  const i = await page.evaluate(() => window.__game.debugInfo());
  if (t % 10 === 0)
    console.log(
      t,
      JSON.stringify(i.copPos),
      JSON.stringify(i.player),
      'cops',
      i.cops,
      'arrest',
      await page.evaluate(() => window.__game.store.getState().arrest),
    );
  if (i.overlay === 'busted') {
    busted = true;
    console.log('BUSTED at', t, 's');
    await page.screenshot({ path: `${out}/busted.png` });
  }
}
console.log('busted', busted);
await browser.close();
