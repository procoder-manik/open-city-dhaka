// Manual diagnostic: boots the game in headless Chromium, prints engine stats.
// Usage (server running on 3100): node e2e/diagnose.mjs [desktop|phone]
import { chromium, devices } from '@playwright/test';

const mode = process.argv[2] ?? 'desktop';
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader'],
});
const context = await browser.newContext(
  mode === 'phone'
    ? { ...devices['Pixel 7'], viewport: { width: 915, height: 412 } }
    : { viewport: { width: 1280, height: 720 } },
);
const page = await context.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('http://localhost:3100/play');
await page.getByTestId('play-btn').click();
await page.getByTestId('stats').waitFor({ timeout: 30000 });
await page.waitForTimeout(5000);
const stats = await page.getByTestId('stats').innerText();
const sw = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? `registered (${reg.active ? 'active' : 'installing'})` : 'none';
});
await page.screenshot({ path: process.env.SHOT ?? `diagnose-${mode}.png` });
console.log(
  JSON.stringify({ mode, stats, sw, coi: await page.evaluate(() => crossOriginIsolated) }, null, 2),
);
console.log(logs.join('\n'));
await browser.close();
