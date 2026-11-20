import { expect, test } from '@playwright/test';
import rawBrand from '../../../brand.config.json' with { type: 'json' };

const active = rawBrand.presets[rawBrand.active as keyof typeof rawBrand.presets];

test('landing page shows the active brand name', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(new RegExp(active.shortName));
  await expect(page.getByRole('link', { name: /খেলা শুরু/ })).toBeVisible();
});

test('game boots: canvas renders and engine reports running', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/play');
  const play = page.getByTestId('play-btn');
  await expect(play).toBeEnabled({ timeout: 30_000 });
  await play.click();

  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('clock')).toHaveAttribute('data-status', 'running', {
    timeout: 30_000,
  });

  // Pause & resume via HUD button
  await page.getByTestId('pause-btn').click();
  await expect(page.getByTestId('resume-btn')).toBeVisible();
  await page.getByTestId('resume-btn').click();
  await expect(page.getByTestId('clock')).toHaveAttribute('data-status', 'running');

  expect(errors).toEqual([]);
});

test('health endpoint responds', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect((await res.json()).ok).toBe(true);
});

/** Debug handle exposed on window by /play?debug=1. */
interface DebugGame {
  store: { getState(): { status: string } };
  debugEnterVehicle(id: string): boolean;
  debugInfo(): { mode: string; vehicle: { speedKmh: number } | null };
}
type DebugWindow = Window & { __game?: DebugGame };

test('player can get into a vehicle and drive it', async ({ page }) => {
  await page.goto('/play?debug=1');
  await page.getByTestId('play-btn').click();
  await page.waitForFunction(
    () => (window as DebugWindow).__game?.store.getState().status === 'running',
    null,
    { timeout: 60_000 },
  );
  await page.evaluate(() => (window as DebugWindow).__game!.debugEnterVehicle('car-sedan'));
  await expect(page.getByTestId('speedo')).toBeVisible();
  await page.keyboard.down('KeyW');
  // Software rendering on CI can run slower than real time, so wait for speed, not a timer.
  await page.waitForFunction(
    () => Math.abs((window as DebugWindow).__game!.debugInfo().vehicle?.speedKmh ?? 0) > 10,
    null,
    { timeout: 30_000 },
  );
  await page.keyboard.up('KeyW');
  const info = await page.evaluate(() => (window as DebugWindow).__game!.debugInfo());
  expect(info.mode).toBe('vehicle');
  await page.keyboard.press('KeyS');
});

test('player can talk to an NPC and see Bangla subtitles', async ({ page }) => {
  await page.goto('/play?debug=1');
  await page.getByTestId('play-btn').click();
  await page.waitForFunction(
    () => (window as DebugWindow).__game?.store.getState().status === 'running',
    null,
    { timeout: 60_000 },
  );
  const ok = await page.evaluate(() =>
    (
      window as unknown as { __game: { debugTalk(id: string, o: string): boolean } }
    ).__game.debugTalk('mofiz', 'greet'),
  );
  expect(ok).toBe(true);
  await expect(page.getByTestId('subtitle')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('subtitle')).toContainText('মোস্তফা');
});

test('crimes raise the wanted level and show a headline', async ({ page }) => {
  await page.goto('/play?debug=1');
  await page.getByTestId('play-btn').click();
  await page.waitForFunction(
    () => (window as DebugWindow).__game?.store.getState().status === 'running',
    null,
    { timeout: 60_000 },
  );
  await page.evaluate(() =>
    (
      window as unknown as { __game: { debugTalk(id: string, o: string): boolean } }
    ).__game.debugTalk('rickshaw1', 'snatch'),
  );
  await expect(page.getByTestId('wanted')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('headline')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('bribe-btn')).toBeVisible();
});

test('player can create an account and is signed in on the game page', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto('/login');
  await page.getByTestId('switch-mode').click();
  await page.getByTestId('email').fill(email);
  await page.getByTestId('password').fill('supersecret123');
  await page.getByTestId('submit').click();
  await page.waitForURL('**/play', { timeout: 30_000 });
  await expect(page.getByTestId('signed-in')).toBeVisible({ timeout: 20_000 });
});
