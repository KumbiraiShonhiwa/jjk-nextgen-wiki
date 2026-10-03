import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
test.beforeEach(async ({ page }) => {
  await page.route(FONT_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
});

/** One representative page per template, plus the interactive ones. */
const PAGES = [
  '/',
  '/characters',
  '/characters/gojo-satoru',
  '/techniques',
  '/techniques/limitless',
  '/domains',
  '/domains/unlimited-void',
  '/arcs',
  '/arcs/shibuya-incident',
  '/organizations',
  '/organizations/gojo-clan',
  '/graph',
  '/about',
  '/404',
];

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

async function scan(page: Page) {
  // Let entrance animations finish so contrast is measured on final colours.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`);
}

for (const scheme of ['light', 'dark'] as const) {
  for (const path of PAGES) {
    test(`${path} has no axe violations (${scheme})`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name.includes('reduced-motion'), 'axe results do not depend on motion');
      await page.emulateMedia({ colorScheme: scheme });
      // Highest level, so every gated block is on the page too.
      await page.addInitScript(() => localStorage.setItem('jjk:spoiler-level', 'manga'));
      await page.goto(path);
      expect(await scan(page)).toEqual([]);
    });
  }
}

test('the default (spoiler-hiding) state has no axe violations either', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('reduced-motion'));
  await page.goto('/characters/ryomen-sukuna');
  expect(await scan(page)).toEqual([]);
  await page.goto('/arcs/culling-game'); // spoiler wall
  expect(await scan(page)).toEqual([]);
});

test('the search palette and takeover dialogs have no axe violations when open', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('reduced-motion'));
  await page.goto('/');
  await page.locator('astro-island[ssr]').waitFor({ state: 'detached' });
  await page.keyboard.press('/');
  await page.getByRole('combobox').fill('gojo');
  await expect(page.getByRole('option').first()).toBeVisible();
  expect(await scan(page)).toEqual([]);

  await page.goto('/domains/unlimited-void');
  await page.getByRole('button', { name: 'Expand the domain' }).click();
  expect(await scan(page)).toEqual([]);
});
