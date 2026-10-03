import { test, expect } from '@playwright/test';

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
test.beforeEach(async ({ page }) => {
  await page.route(FONT_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
});

const DOMAIN = '/domains/unlimited-void';
const takeover = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Domain Expansion: Unlimited Void' });

test('expanding the domain opens the takeover and Escape returns focus to the button', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(DOMAIN);
  const opener = page.getByRole('button', { name: 'Expand the domain' });
  await opener.click();
  await expect(takeover(page)).toBeVisible();
  await expect(takeover(page).locator('[data-takeover-name]')).toContainText('Unlimited Void');

  await page.keyboard.press('Escape');
  await expect(takeover(page)).toBeHidden();
  await expect(opener).toBeFocused();
  // The split letters are undone, so the name is plain text again for the next run.
  await expect(takeover(page).locator('[data-takeover-name] span')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('clicking anywhere on the takeover closes it, and it can be replayed', async ({ page }) => {
  await page.goto(DOMAIN);
  const opener = page.getByRole('button', { name: 'Expand the domain' });
  for (let i = 0; i < 2; i++) {
    await opener.click();
    await expect(takeover(page)).toBeVisible();
    await page.getByRole('button', { name: 'Close and return to the page' }).click({ position: { x: 20, y: 20 } });
    await expect(takeover(page)).toBeHidden();
  }
});

test('the full-motion takeover reveals the Japanese name by scrambling', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('reduced-motion'), 'reduced motion shows the overlay without animation');
  await page.goto(DOMAIN);
  await page.getByRole('button', { name: 'Expand the domain' }).click();
  const ja = takeover(page).locator('[data-takeover-ja]');
  await expect(ja).toHaveText('無量空処', { timeout: 4000 });
});

test('a gated domain has no takeover until the level is raised', async ({ page }) => {
  // Malevolent Shrine is anime-s2; the default level is anime-s1.
  await page.goto('/domains/malevolent-shrine');
  await expect(page.getByRole('button', { name: 'Expand the domain' })).toBeHidden();
  await expect(page.getByRole('region', { name: 'Spoiler warning' })).toBeVisible();
});
