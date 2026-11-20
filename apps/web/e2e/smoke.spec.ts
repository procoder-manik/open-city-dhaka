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
  await expect(page.getByTestId('stats')).toHaveAttribute('data-status', 'running', {
    timeout: 30_000,
  });

  // Pause & resume via HUD button
  await page.getByTestId('pause-btn').click();
  await expect(page.getByTestId('resume-btn')).toBeVisible();
  await page.getByTestId('resume-btn').click();
  await expect(page.getByTestId('stats')).toHaveAttribute('data-status', 'running');

  expect(errors).toEqual([]);
});

test('health endpoint responds', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect((await res.json()).ok).toBe(true);
});
