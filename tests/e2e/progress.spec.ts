import { test, expect, type Page } from '@playwright/test';

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
test.beforeEach(async ({ page }) => {
  await page.route(FONT_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
});

/** The marked title block, which is what progress hides. */
const marked = (page: Page, key: string) => page.locator(`[data-ep="${key}"], [data-ch="${key}"]`);
/** The whole row, which keeps its number and its control whatever the progress is. */
const row = (page: Page, key: string) => page.locator('li').filter({ has: page.locator(`[data-ep="${key}"], [data-ch="${key}"]`) });

test('setting progress hides later episodes and keeps earlier ones', async ({ page }) => {
  // Season 2 is above the default bucket, so raise it first; progress is a filter on top.
  await page.goto('/media/anime/2');
  await page.getByRole('radio', { name: 'Manga' }).click();
  await expect(marked(page, 's2e5')).toBeVisible();
  await expect(marked(page, 's2e6')).toBeVisible();

  await row(page, 's2e5').getByRole('button', { name: /watched up to here/ }).click();

  await expect(marked(page, 's2e5')).toBeVisible();
  await expect(marked(page, 's2e6')).toBeHidden();
  await expect(marked(page, 's2e23')).toBeHidden();

  // The row itself stays, so a reader can always move their progress forward.
  await expect(row(page, 's2e6').getByRole('button', { name: /watched up to here/ })).toBeVisible();
});

test('progress survives navigation and reload, and can be cleared', async ({ page }) => {
  await page.goto('/media/anime/2');
  await page.getByRole('radio', { name: 'Manga' }).click();
  await row(page, 's2e5').getByRole('button', { name: /watched up to here/ }).click();

  await page.reload();
  await expect(marked(page, 's2e6')).toBeHidden();
  await expect(page.getByText('Showing up to season 2, episode 5.')).toBeVisible();

  await page.getByRole('button', { name: /Show everything at my spoiler level again/ }).click();
  await expect(marked(page, 's2e6')).toBeVisible();
});

test('progress only ever hides more than the bucket, never less', async ({ page }) => {
  // At the default bucket the whole of season 3 is hidden. Setting reading progress must not
  // reveal any of it.
  await page.goto('/media/anime/3');
  await expect(page.getByText('Hidden at your spoiler level')).toBeVisible();

  await page.goto('/media/manga/1');
  await row(page, 'ch3').getByRole('button', { name: /read up to here/ }).click();

  await page.goto('/media/anime/3');
  await expect(page.getByText('Hidden at your spoiler level')).toBeVisible();
});

test('reading progress hides later chapters within a volume', async ({ page }) => {
  await page.goto('/media/manga/1');
  await expect(page.locator('[data-ch="ch5"]')).toBeVisible();

  await row(page, 'ch3').getByRole('button', { name: /read up to here/ }).click();
  await expect(page.locator('[data-ch="ch3"]')).toBeVisible();
  await expect(page.locator('[data-ch="ch5"]')).toBeHidden();
});

test('setting progress raises the bucket to match, but never lowers it', async ({ page }) => {
  await page.goto('/media/manga/1');
  await expect(page.locator('html')).toHaveAttribute('data-spoiler', 'anime-s1');

  // Chapter 3 implies anime-s1, which is where we already are: nothing moves.
  await row(page, 'ch3').getByRole('button', { name: /read up to here/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-spoiler', 'anime-s1');

  // A later volume implies a later bucket, so the bucket follows.
  await page.getByRole('radio', { name: 'Manga' }).click();
  await page.goto('/media/manga/10');
  await page.locator('li').filter({ has: page.locator('[data-ch]') }).first().getByRole('button', { name: /read up to here/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-spoiler', 'manga');
});

test('with no progress set nothing is generated, so bucket gating is untouched', async ({ page }) => {
  await page.goto('/media/anime/1');
  expect(await page.locator('#jjk-progress-style').count()).toBe(0);
  await expect(marked(page, 's1e24')).toBeVisible();
});

test('the episode page records progress and does not move a reader backwards', async ({ page }) => {
  await page.goto('/media/anime/2/5');
  await page.getByRole('button', { name: "I've watched this" }).click();
  await expect(page.getByText('Progress saved: season 2, episode 5.')).toBeVisible();

  // Revisiting an earlier episode leaves progress where it was.
  await page.goto('/media/anime/1/1');
  await page.getByRole('button', { name: "I've watched this" }).click();
  await page.goto('/media/anime/2');
  await expect(page.getByText('Showing up to season 2, episode 5.')).toBeVisible();
});
