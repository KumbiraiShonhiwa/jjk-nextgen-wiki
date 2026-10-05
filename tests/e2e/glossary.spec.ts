import { test, expect } from '@playwright/test';

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
test.beforeEach(async ({ page }) => {
  await page.route(FONT_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
});

test('the glossary lists terms A–Z and links to an entry', async ({ page }) => {
  await page.goto('/glossary');
  await expect(page.getByRole('heading', { level: 1, name: 'Glossary' })).toBeVisible();
  await page.getByRole('link', { name: 'Cursed energy' }).click();
  await expect(page).toHaveURL(/\/glossary\/cursed-energy$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Cursed energy' })).toBeVisible();
});

test('a term above the spoiler level is hidden in the index and walled on its page', async ({ page }) => {
  await page.goto('/glossary');
  await expect(page.getByRole('link', { name: 'Heavenly Restriction' })).toBeHidden();

  await page.goto('/glossary/heavenly-restriction');
  await expect(page.getByText('Hidden at your spoiler level')).toBeVisible();

  await page.getByRole('radio', { name: 'Manga' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Heavenly Restriction' })).toBeVisible();
});

test('a first mention in body text opens a definition without JavaScript', async ({ page }) => {
  await page.goto('/characters/mahito');
  const trigger = page.locator('.term-trigger').first();
  await expect(trigger).toBeVisible();

  const popover = page.locator('.term-popover').first();
  await expect(popover).toBeHidden();
  await trigger.click();
  await expect(popover).toBeVisible();
  await expect(popover).toContainText('ranks sorcerers');
  await expect(popover.getByRole('link', { name: 'Full entry' })).toBeVisible();
});

test('a term is linked once per page, not on every mention', async ({ page }) => {
  await page.goto('/characters/mahito');
  const slugs = await page.locator('.term-trigger').evaluateAll((els) =>
    els.map((e) => e.getAttribute('popovertarget')),
  );
  expect(new Set(slugs).size).toBe(slugs.length);
});

test('the mention trigger is reachable by keyboard', async ({ page }) => {
  await page.goto('/characters/mahito');
  const trigger = page.locator('.term-trigger').first();
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.term-popover').first()).toBeVisible();
});
