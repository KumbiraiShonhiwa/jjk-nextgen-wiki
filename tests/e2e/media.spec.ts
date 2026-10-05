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
  // Ranges are rendered from the arc records, not hard-coded.
  await expect(items.first()).toContainText('Chapters 1–18');
});

test('a season card past the spoiler level is hidden until the level is raised', async ({ page }) => {
  await page.goto('/media/anime');
  await expect(page.getByRole('link', { name: /Season 1/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Season 3/ })).toBeHidden();

  await page.getByRole('radio', { name: 'Manga' }).click();
  await expect(page.getByRole('link', { name: /Season 3/ })).toBeVisible();
});

test('a season page lists its episodes with titles, dates and arcs', async ({ page }) => {
  await page.goto('/media/anime/1');
  await expect(page.getByRole('heading', { level: 1, name: 'Season 1' })).toBeVisible();
  const items = page.locator('ol li');
  await expect(items).toHaveCount(24);
  // Ingested from Wikipedia, so these are real values rather than fixtures.
  await expect(items.first()).toContainText('Ryomen Sukuna');
  await expect(items.first()).toContainText('2020-10-03');
  await expect(items.first()).toContainText('Fearsome Womb');
});

test('a season above the spoiler level shows the wall, not its episode titles', async ({ page }) => {
  await page.goto('/media/anime/3');
  // Season 3 is anime-s3; the default level is anime-s1.
  await expect(page.getByText('Hidden at your spoiler level')).toBeVisible();
  await expect(page.getByText('Cursed Womb', { exact: false })).toBeHidden();
});

test('episode text credits Wikipedia under its licence', async ({ page }) => {
  await page.goto('/media/anime/1');
  const sources = page.getByRole('complementary', { name: 'Sources' });
  await expect(sources).toContainText('Wikipedia');
  await expect(sources.getByRole('link', { name: 'CC BY-SA 4.0' })).toBeVisible();
});
