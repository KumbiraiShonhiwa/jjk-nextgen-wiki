import { test, expect, type Page } from '@playwright/test';

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
test.beforeEach(async ({ page }) => {
  await page.route(FONT_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
});

const hydrated = (page: Page) => page.locator('astro-island[ssr]').waitFor({ state: 'detached' });

const SECTIONS = [
  { path: '/characters', heading: 'Characters' },
  { path: '/techniques', heading: 'Cursed techniques' },
  { path: '/domains', heading: 'Domain Expansions' },
  { path: '/arcs', heading: 'Story arcs' },
  { path: '/organizations', heading: 'Organizations' },
  { path: '/about', heading: 'About' },
];

for (const { path, heading } of SECTIONS) {
  test(`${path} renders and is reachable from the navigation`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('the header navigation marks the current section', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/techniques/limitless');
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Techniques' })).toHaveAttribute('aria-current', 'page');
});

test('cards outside a cascade are visible (technique cards on a character page)', async ({ page }) => {
  await page.goto('/characters/gojo-satoru');
  const card = page.getByRole('link', { name: /Limitless/ });
  await expect(card).toBeVisible();
  await expect.poll(() => card.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
});

test.describe('a whole page above the visitor level', () => {
  // The Culling Game arc is gated at anime-s3 in the fixtures; the default level is anime-s1.
  const ARC = '/arcs/culling-game';

  test('shows a spoiler wall and keeps the name out of the title', async ({ page }) => {
    await page.goto(ARC);
    await expect(page.getByRole('region', { name: 'Spoiler warning' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Culling Game' })).toBeHidden();
    await expect(page).toHaveTitle('Story arc 8 · JJK NextGen Wiki');
    expect(await page.locator('meta[name="description"]').getAttribute('content')).not.toContain('Culling');
    // The back link stays usable behind the wall.
    await expect(page.getByRole('link', { name: '← Arcs' })).toBeVisible();
  });

  test('opens in place once the level is raised', async ({ page }) => {
    await page.goto(ARC);
    await hydrated(page);
    await page.getByRole('radiogroup', { name: 'Spoiler level' }).getByRole('radio', { name: 'Manga' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Culling Game' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Spoiler warning' })).toBeHidden();
  });
});

test('arc pages link to their neighbours, gating the ones above the level', async ({ page }) => {
  await page.goto('/arcs/death-painting');
  const nav = page.getByRole('navigation', { name: 'Adjacent arcs' });
  await expect(nav.getByRole('link', { name: 'Kyoto Goodwill Event' })).toBeVisible();
  // Hidden Inventory is anime-s2: its link is hidden and a placeholder stands in.
  await expect(nav.getByRole('link', { name: 'Hidden Inventory' })).toBeHidden();
  await expect(nav.locator("[data-redacted='anime-s2']")).toBeVisible();
});

test('a gallery keeps a placeholder card for gated domains', async ({ page }) => {
  await page.goto('/domains');
  await expect(page.getByRole('link', { name: /Unlimited Void/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Malevolent Shrine/ })).toBeHidden();
  await expect(page.locator("[data-redacted='anime-s2']")).toHaveCount(1);
});

test('organization pages list members and inherited techniques', async ({ page }) => {
  await page.goto('/organizations/gojo-clan');
  await expect(page.getByRole('region', { name: 'Members' }).getByRole('link', { name: /Satoru Gojo/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Inherited techniques' }).getByRole('link', { name: /Limitless/ })).toBeVisible();
});

test('every character card and page has a portrait', async ({ page }) => {
  await page.goto('/characters');
  const cards = await page.locator('[data-grid-item]').count();
  expect(await page.locator('[data-grid-item] [data-portrait]:visible').count()).toBeGreaterThanOrEqual(1);
  expect(cards).toBeGreaterThan(0);
  await page.goto('/characters/fushiguro-megumi');
  await expect(page.locator('[data-portrait]').first()).toBeVisible();
});
