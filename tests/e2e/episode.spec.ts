import { test, expect } from '@playwright/test';

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
test.beforeEach(async ({ page }) => {
  await page.route(FONT_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
});

test('an episode page shows its title, position, arc and summary', async ({ page }) => {
  await page.goto('/media/anime/1/1');
  await expect(page.getByRole('heading', { level: 1, name: 'Ryomen Sukuna' })).toBeVisible();
  await expect(page.getByText('Season 1 · Episode 1 of 24')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Fearsome Womb' }).first()).toBeVisible();
  await expect(page.getByText('Yuji Itadori is a high school student', { exact: false })).toBeVisible();
});

test('the summary names characters, labelled as mentions rather than a cast', async ({ page }) => {
  await page.goto('/media/anime/1/1');
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Named in this summary' }) });
  await expect(section).toContainText('who it names rather than everyone who appears');
  await expect(section.getByRole('link', { name: /Yuji Itadori/ })).toBeVisible();
});

test('episodes link to their neighbours', async ({ page }) => {
  await page.goto('/media/anime/1/2');
  await expect(page.getByRole('link', { name: '← Episode 1' })).toBeVisible();
  await page.getByRole('link', { name: 'Episode 3 →' }).click();
  await expect(page).toHaveURL(/\/media\/anime\/1\/3$/);
});

test('"I have watched this" raises the spoiler level and never lowers it', async ({ page }) => {
  await page.goto('/media/anime/2/1');
  await expect(page.locator('html')).toHaveAttribute('data-spoiler', 'anime-s1');
  await page.getByRole('button', { name: "I've watched this" }).click();
  await expect(page.locator('html')).toHaveAttribute('data-spoiler', 'anime-s2');

  // Revisiting an earlier episode must not walk a reader backwards.
  await page.goto('/media/anime/1/1');
  await page.getByRole('button', { name: "I've watched this" }).click();
  await expect(page.locator('html')).toHaveAttribute('data-spoiler', 'anime-s2');
});

test('an episode above the spoiler level is walled, title included', async ({ page }) => {
  await page.goto('/media/anime/3/1');
  await expect(page.getByText('Hidden at your spoiler level')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).not.toContainText('Episode');
});
