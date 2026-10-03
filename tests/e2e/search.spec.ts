import { test, expect, type Page } from '@playwright/test';

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
test.beforeEach(async ({ page }) => {
  await page.route(FONT_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
});

const hydrated = (page: Page) => page.locator('astro-island[ssr]').waitFor({ state: 'detached' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Search the wiki' });
const results = (page: Page) => palette(page).getByRole('option');

async function search(page: Page, q: string) {
  await page.keyboard.press('/');
  await expect(palette(page)).toBeVisible();
  await palette(page).getByRole('combobox').fill(q);
}

test('"/" opens the palette and Enter opens the top result', async ({ page }) => {
  await page.goto('/');
  await hydrated(page);
  await search(page, 'Limitless');
  await expect(results(page).first()).toContainText('Limitless');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/techniques\/limitless$/);
  await expect(palette(page)).toBeHidden();
});

test('Ctrl+K opens the palette, arrows move the selection, Escape closes it', async ({ page }) => {
  await page.goto('/');
  await hydrated(page);
  await page.keyboard.press('Control+k');
  await palette(page).getByRole('combobox').fill('Gojo');
  await expect(results(page).nth(1)).toBeVisible();
  await expect(results(page).first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(results(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(palette(page)).toBeHidden();
});

test('results never include pages above the spoiler level', async ({ page }) => {
  await page.goto('/');
  await hydrated(page);
  // The Culling Game arc page is gated at anime-s3; the default level is anime-s1.
  await search(page, 'colonies');
  await expect(palette(page)).toContainText('No results at your spoiler level');
  await expect(results(page)).toHaveCount(0);

  await page.keyboard.press('Escape');
  await page.getByRole('radiogroup', { name: 'Spoiler level' }).getByRole('radio', { name: 'Manga' }).click();
  await search(page, 'colonies');
  await expect(results(page).first()).toContainText('Culling Game');
});

test('gated text on a spoiler-free page is not searchable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('jjk:spoiler-level', 'manga'));
  await page.goto('/');
  await hydrated(page);
  // Sukuna's page is level none, so its anime-s2 domain link must not be indexed on it,
  // even for a manga reader. The domain's own page (anime-s2) is the right result.
  await search(page, 'Malevolent Shrine');
  await expect(results(page).first()).toContainText('Malevolent Shrine');
  await expect(results(page).filter({ hasText: 'Ryomen Sukuna' })).toHaveCount(0);
});
