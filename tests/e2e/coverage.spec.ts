import { test, expect } from '@playwright/test';

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
test.beforeEach(async ({ page }) => {
  await page.route(FONT_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
});

test('coverage reports the real record counts and is reachable from About', async ({ page }) => {
  await page.goto('/about');
  await page.getByRole('link', { name: 'Content coverage' }).click();
  await expect(page).toHaveURL(/\/about\/coverage$/);

  // 370 records today: 11 characters, 8 techniques, 4 domains, 10 arcs, 4 orgs, 3 locations,
  // 59 episodes, 271 chapters. The figures come from the records, so they move with the content.
  const totals = page.locator('dl').first();
  await expect(totals).toContainText('370');

  const row = page.getByRole('row', { name: /^chapters/ });
  await expect(row).toContainText('271');
});

test('a gated placeholder slug is hidden until the level is raised', async ({ page }) => {
  await page.goto('/about/coverage');
  // Malevolent Shrine is an anime-s2 domain and still a placeholder, so its slug names something
  // the default anime-s1 reader has not met.
  await expect(page.getByText('malevolent-shrine')).toBeHidden();
  await page.getByRole('radio', { name: 'Manga' }).click();
  await expect(page.getByText('malevolent-shrine')).toBeVisible();
});

test('source pages list the revision the text was read from', async ({ page }) => {
  await page.goto('/about/coverage');
  const row = page.getByRole('row', { name: /List of Jujutsu Kaisen chapters/ });
  await expect(row).toContainText('271');
});
