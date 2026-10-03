import { test, expect } from '@playwright/test';

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
test.beforeEach(async ({ page }) => {
  await page.route(FONT_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
});

test('filtering the character grid by affiliation reflows it and can be undone', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/characters');
  const items = page.locator('[data-grid-item]');
  const all = await items.count();
  const visible = () => items.evaluateAll((els) => els.filter((e) => !e.hasAttribute('hidden')).length);
  expect(await visible()).toBe(all);

  const filters = page.locator('[data-grid-filters] [data-filter]:not([data-filter=""]):visible');
  await filters.first().click();
  await expect(filters.first()).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(visible).toBeLessThan(all);
  expect(await visible()).toBeGreaterThan(0);

  await page.locator('[data-filter=""]').click();
  await expect.poll(visible).toBe(all);
  expect(errors).toEqual([]);
});
