import { test, expect, type Page } from '@playwright/test';

/**
 * Layout invariants for the five page templates, at the three widths the design system names
 * (doc 07). These are the regressions that slipped through review in this project: a fixed element
 * that stayed visible at desktop width, and an oversized hero that could push the page sideways.
 *
 * Deliberately not pixel snapshots. Those need baselines per platform, and baselines generated on
 * a Windows machine do not match CI's Linux renderer. See visual.spec.ts for the pixel pass and
 * how to generate its baselines.
 */
const TEMPLATES = [
  { path: '/', name: 'home' },
  { path: '/characters', name: 'index grid' },
  { path: '/characters/gojo-satoru', name: 'entity page' },
  { path: '/arcs', name: 'timeline' },
  { path: '/graph', name: 'graph' },
];

const WIDTHS = [
  { width: 390, height: 844, label: 'phone' },
  { width: 768, height: 1024, label: 'tablet' },
  { width: 1280, height: 900, label: 'desktop' },
];

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
test.beforeEach(async ({ page }) => {
  await page.route(FONT_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
});

/**
 * Whether a reader can actually scroll the page sideways, driven by a horizontal wheel as a
 * trackpad swipe would be.
 *
 * Neither `scrollWidth - clientWidth` nor `window.scrollTo` works here. The hero's seal is
 * deliberately oversized and bled past the viewport edge, and `html { overflow-x: clip }` absorbs
 * it: the box still measures 125px wider and still responds to a programmatic scroll, but the
 * viewport does not move for a user. Only the wheel reflects what someone actually experiences.
 */
async function canScrollSideways(page: Page) {
  const size = page.viewportSize()!;
  await page.mouse.move(size.width / 2, size.height / 2);
  await page.mouse.wheel(300, 0);
  await page.waitForTimeout(250);
  const moved = await page.evaluate(() => window.scrollX !== 0);
  await page.evaluate(() => window.scrollTo(0, window.scrollY));
  return moved;
}

for (const { path, name } of TEMPLATES) {
  for (const { width, height, label } of WIDTHS) {
    test(`${name} at ${label} has no horizontal overflow and keeps its landmarks`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(path);
      await page.waitForTimeout(400);

      expect(await canScrollSideways(page), 'page scrolls sideways').toBe(false);

      // Every header control has to be reachable: at 390px the logo, search, spoiler control and
      // menu together measured 418px, so the control and the menu sat off the right edge.
      const viewportWidth = page.viewportSize()!.width;
      for (const control of await page.locator('header button, header summary').all()) {
        // The mobile menu's summary is display:none above `md`, so it has no box to measure.
        const box = await control.boundingBox();
        if (!box) continue;
        expect(box.x + box.width, 'a header control extends past the viewport').toBeLessThanOrEqual(viewportWidth + 1);
      }

      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Primary' })).toBeAttached();
      await expect(page.getByRole('contentinfo')).toBeAttached();

      // The bottom bar is a phone affordance; at tablet width and up it must be gone.
      const tabbar = page.locator('nav[aria-label="Quick navigation"]');
      if (width < 768) await expect(tabbar).toBeVisible();
      else await expect(tabbar).toBeHidden();
    });
  }
}

test('the footer is reachable past the fixed tab bar on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/characters');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  const clear = await page.evaluate(() => {
    const link = document.querySelector('footer a[href="/about"]')!.getBoundingClientRect();
    const bar = document.querySelector('nav[aria-label="Quick navigation"]')!.getBoundingClientRect();
    return bar.top - link.bottom;
  });
  expect(clear, 'gap between the last footer link and the tab bar').toBeGreaterThan(0);
});
