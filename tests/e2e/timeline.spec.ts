import { test, expect, type Page } from '@playwright/test';

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
test.beforeEach(async ({ page }) => {
  await page.route(FONT_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  // Short viewport so the arc list is longer than the screen and really scrolls.
  await page.setViewportSize({ width: 1000, height: 480 });
});

/** Current scaleY of the rail fill, from its computed matrix. */
const railScale = (page: Page) =>
  page.locator('[data-rail-fill]').evaluate((el) => {
    const t = getComputedStyle(el).transform;
    // matrix(a, b, c, d, tx, ty): scaleY is d.
    return t === 'none' ? 1 : Number(t.match(/matrix\(([^)]+)\)/)?.[1]?.split(',')[3] ?? NaN);
  });

const markerColour = (page: Page, i: number) => page.locator('[data-marker]').nth(i).evaluate((el) => getComputedStyle(el).backgroundColor);

test('the rail fills with scroll position and rewinds when scrolling back', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('reduced-motion'), 'reduced motion shows a static full rail');
  await page.goto('/arcs');
  await page.waitForLoadState('networkidle');

  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(() => railScale(page)).toBeLessThan(0.15);

  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => railScale(page)).toBeGreaterThan(0.85);

  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(() => railScale(page)).toBeLessThan(0.15);
});

test('markers light up as the rail passes them, and the last one stays dark until reached', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('reduced-motion'));
  await page.goto('/arcs');
  await page.waitForLoadState('networkidle');
  const last = (await page.locator('[data-marker]').count()) - 1;

  await page.evaluate(() => scrollTo(0, 0));
  const dark = await markerColour(page, last);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => markerColour(page, last)).not.toBe(dark);
  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(() => markerColour(page, last)).toBe(dark);
});

test('reduced motion shows a full rail with every marker lit and nothing scrubbed', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('reduced-motion'));
  await page.goto('/arcs');
  expect(await railScale(page)).toBe(1);
  const colours = await page.locator('[data-marker]').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  expect(new Set(colours).size).toBe(1);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  expect(await railScale(page)).toBe(1);
});
