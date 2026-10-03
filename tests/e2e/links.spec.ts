import { test, expect } from '@playwright/test';

/**
 * Crawls the built site from the home page and asserts every internal link resolves.
 * Static HTML is enough here, so this uses the request fixture, not a browser page.
 */
test('every internal link resolves', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'link integrity does not depend on motion settings');

  const seen = new Set<string>();
  const queue = ['/'];
  const broken: string[] = [];

  while (queue.length) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);

    const res = await request.get(path);
    if (!res.ok()) {
      broken.push(`${path} → ${res.status()}`);
      continue;
    }
    if (!res.headers()['content-type']?.includes('text/html')) continue;

    const html = await res.text();
    for (const [, href] of html.matchAll(/href="(\/[^"#?]*)/g)) {
      const clean = href.length > 1 ? href.replace(/\/$/, '') : href;
      // Assets are covered by the build; only pages are crawled.
      if (/\.(css|js|svg|png|woff2?|ico|xml|json)$/.test(clean) || clean.startsWith('/_astro/')) continue;
      if (!seen.has(clean)) queue.push(clean);
    }
  }

  expect(broken).toEqual([]);
  // Sanity check that the crawl reached the entity pages, not just the home page.
  expect(seen.size).toBeGreaterThan(30);
});

test('unknown URLs get the 404 page', async ({ page }) => {
  const res = await page.goto('/characters/not-a-character');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Exorcised' })).toBeVisible();
});
