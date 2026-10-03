import { test, expect, type Page } from '@playwright/test';

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;

/** Collects uncaught page errors and console errors (ignoring web-font requests). */
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (FONT_HOSTS.test(msg.location().url) || FONT_HOSTS.test(msg.text())) return;
    errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  // Keep runs hermetic: answer web-font requests locally instead of hitting the network.
  await page.route(FONT_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
});

const isReduced = (projectName: string) => projectName.includes('reduced-motion');

test('home page loads without page errors', async ({ page }, testInfo) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page).toHaveTitle(/JJK NextGen Wiki/);
  const heading = page.locator('h1[data-kinetic]');
  // Accessible name, not textContent: splitText keeps a visually hidden copy of the text for screen readers.
  await expect(page.getByRole('heading', { level: 1, name: 'Jujutsu Kaisen', exact: true })).toBeVisible();

  if (isReduced(testInfo.project.name)) {
    // Reduced motion: the kinetic heading must stay plain text, never split into letters.
    await page.waitForLoadState('networkidle');
    await expect(heading.locator('span')).toHaveCount(0);
  } else {
    // Full motion: Anime.js splits the heading into per-character spans.
    await expect.poll(() => heading.locator('span').count()).toBeGreaterThan(0);
  }

  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
});

test('character grid shows cards and a card opens its character page', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const cards = page.locator('[data-cascade] a[href^="/characters/"]');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);

  const first = cards.first();
  const href = await first.getAttribute('href');
  const name = (await first.locator('p').first().textContent())?.trim();
  expect(href).toBeTruthy();
  expect(name).toBeTruthy();

  await first.scrollIntoViewIfNeeded();
  await first.click();
  await expect(page).toHaveURL(new RegExp(`${href}/?$`));
  await expect(page.getByRole('heading', { level: 1, name: name!, exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('spoiler switch persists the chosen level to localStorage', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const group = page.getByRole('radiogroup', { name: 'Spoiler level' });
  await expect(group).toBeVisible();
  // SpoilerControl hydrates on idle; Astro drops the `ssr` attribute once the island is live.
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);

  const manga = group.getByRole('radio', { name: 'Manga' });
  await manga.click();
  await expect(manga).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => localStorage.getItem('jjk:spoiler-level'))).toBe('manga');

  await page.reload();
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await expect(
    page.getByRole('radiogroup', { name: 'Spoiler level' }).getByRole('radio', { name: 'Manga' }),
  ).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => localStorage.getItem('jjk:spoiler-level'))).toBe('manga');
  expect(errors).toEqual([]);
});
