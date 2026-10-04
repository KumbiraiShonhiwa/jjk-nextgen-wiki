import { test, expect } from '@playwright/test';

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
test.beforeEach(async ({ page }) => {
  await page.route(FONT_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
});

/** The control is a Svelte island; wait until it has hydrated before interacting. */
const hydrated = (page: import('@playwright/test').Page) => page.locator('astro-island[ssr]').waitFor({ state: 'detached' });

// Sukuna's Domain Expansion is gated at anime-s2 in the fixtures.
const SUKUNA = '/characters/ryomen-sukuna';

test('content above the default level is hidden behind a placeholder', async ({ page }) => {
  await page.goto(SUKUNA);
  await expect(page.locator('html')).toHaveAttribute('data-spoiler', 'anime-s1');
  await expect(page.getByRole('link', { name: 'Malevolent Shrine' })).toBeHidden();
  await expect(page.locator("[data-redacted='anime-s2']").first()).toBeVisible();
  // Page metadata never leaks gated text.
  await expect(page).toHaveTitle('Ryomen Sukuna · JJK NextGen Wiki');
});

test('a saved level applies before first paint', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('jjk:spoiler-level', 'manga'));
  await page.goto(SUKUNA);
  await expect(page.getByRole('link', { name: 'Malevolent Shrine' })).toBeVisible();
  await expect(page.locator("[data-redacted='anime-s2']").first()).toBeHidden();
});

test('raising the level reveals content without a reload, and survives navigation', async ({ page }) => {
  await page.goto(SUKUNA);
  await hydrated(page);
  await page.getByRole('radio', { name: 'S2' }).click();
  await expect(page.getByRole('link', { name: 'Malevolent Shrine' })).toBeVisible();
  await page.getByRole('link', { name: '← Characters' }).click();
  await expect(page).toHaveURL(/\/characters$/);
  await expect(page.locator('html')).toHaveAttribute('data-spoiler', 'anime-s2');
});

test('the spoiler control is keyboard operable', async ({ page }) => {
  await page.goto(SUKUNA);
  await hydrated(page);
  await page.getByRole('radio', { name: 'S1' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'S2' })).toBeFocused();
  await expect(page.getByRole('radio', { name: 'S2' })).toHaveAttribute('aria-checked', 'true');
});

test('later-season and manga content stays hidden until the level is raised', async ({ page }) => {
  await page.goto('/characters/gojo-satoru');
  await expect(page.getByText('fight that decides his fate')).toBeHidden();
  await expect(page.locator("[data-redacted='manga']").first()).toBeVisible();
  await page.addInitScript(() => localStorage.setItem('jjk:spoiler-level', 'manga'));
  await page.goto('/characters/gojo-satoru');
  await expect(page.getByText('fight that decides his fate')).toBeVisible();
  await expect(page.getByText('sealed away during the Shibuya Incident')).toBeVisible();
});
