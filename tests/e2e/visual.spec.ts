import { test, expect } from '@playwright/test';

/**
 * Pixel regression for the five templates (doc 11, A11).
 *
 * Opt-in: run with `VISUAL=1 pnpm test:e2e tests/e2e/visual.spec.ts`.
 *
 * It is not part of the default run because a baseline is per platform. Playwright names snapshots
 * `…-chromium-win32.png` / `…-chromium-linux.png`, and a baseline recorded on a developer's Windows
 * machine will not match CI's Linux renderer: different font rasterisation, different subpixel
 * rounding. Committing Windows baselines would make CI fail on a missing Linux snapshot; recording
 * them in CI on the fly would compare an image against itself and assert nothing.
 *
 * To record Linux baselines without a Linux machine, use the official image, which matches CI:
 *
 *   docker run --rm -v "$PWD":/w -w /w mcr.microsoft.com/playwright:v1.63.0-noble \
 *     sh -c "corepack pnpm install --frozen-lockfile && corepack pnpm build && \
 *            VISUAL=1 corepack pnpm test:e2e tests/e2e/visual.spec.ts --update-snapshots"
 *
 * Commit the resulting `tests/e2e/visual.spec.ts-snapshots/` and drop the skip below.
 */
const PAGES = [
  { path: '/', name: 'home' },
  { path: '/characters', name: 'characters' },
  { path: '/characters/gojo-satoru', name: 'character' },
  { path: '/arcs', name: 'arcs' },
  { path: '/graph', name: 'graph' },
];

test.skip(!process.env.VISUAL, 'set VISUAL=1 and record baselines on Linux first; see the note at the top of this file');

// Only the full-motion project: the reduced-motion run renders the same frames by design.
test.describe('visual regression', () => {
  for (const { path, name } of PAGES) {
    test(`${name} matches its baseline`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name.includes('reduced-motion'));
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      await page.goto(path);
      // Let entrance motion finish, then freeze everything so a mid-flight frame is never captured.
      await page.waitForTimeout(1500);
      await page.addStyleTag({
        content: `*, *::before, *::after { animation: none !important; transition: none !important; }
                  [data-hero-canvas] { visibility: hidden !important; }`,
      });
      await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 });
    });
  }
});
