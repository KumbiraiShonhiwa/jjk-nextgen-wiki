import { test, expect } from '@playwright/test';

const PHONE = { width: 390, height: 844 };
const bar = (page: import('@playwright/test').Page) => page.locator('nav[aria-label="Quick navigation"]');

test('the tab bar is mobile only', async ({ page }) => {
  // The breakpoint lives in the component's scoped CSS, which outranks a Tailwind utility; a
  // `md:hidden` class silently lost that fight and left the bar on screen at desktop widths.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/arcs');
  await expect(bar(page)).toBeHidden();

  await page.setViewportSize(PHONE);
  await expect(bar(page)).toBeVisible();
});

test('the tab bar marks the current section and does not mark Home everywhere', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/arcs');
  await expect(bar(page).locator('[aria-current="page"]')).toHaveText(/Arcs/i);

  await page.goto('/');
  await expect(bar(page).locator('[aria-current="page"]')).toHaveText(/Home/i);
});

test('the search tab opens the palette', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/arcs');
  await bar(page).getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('dialog', { name: 'Search the wiki' })).toBeVisible();
});

test('every tab is a 44px tap target', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/characters');
  for (const item of await bar(page).locator('a, button').all()) {
    expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});
