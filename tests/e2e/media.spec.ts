import { test, expect } from '@playwright/test';

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
test.beforeEach(async ({ page }) => {
  await page.route(FONT_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
});

test('the media index links to both halves', async ({ page }) => {
  await page.goto('/media');
  await expect(page.getByRole('heading', { level: 1, name: 'Media' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Manga/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Anime/ })).toBeVisible();
});

test('the manga page lists arcs in chapter order', async ({ page }) => {
  await page.goto('/media/manga');
  const items = page.locator('ol li:visible');
  await expect(items.first()).toContainText('Fearsome Womb');
  // Chapter ranges are rendered from the arc records, not hard-coded.
  await expect(items.first()).toContainText('Chapters 1–18');
});

test('a season past the spoiler level is hidden, and appears when the level is raised', async ({ page }) => {
  await page.goto('/media/anime');
  // Default is anime-s1: season 1 is visible, season 3 is not.
  await expect(page.getByRole('heading', { name: 'Season 1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Season 3' })).toBeHidden();

  await page.getByRole('radio', { name: 'Manga' }).click();
  await expect(page.getByRole('heading', { name: 'Season 3' })).toBeVisible();
});

test('the anime page never names a hidden arc in its markup at the default level', async ({ page }) => {
  await page.goto('/media/anime');
  // Culling Game is anime-s3; its name must not be readable on screen at the default level.
  await expect(page.getByText('Culling Game', { exact: false })).toBeHidden();
});
