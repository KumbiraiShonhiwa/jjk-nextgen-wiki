import { test, expect } from '@playwright/test';

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
test.beforeEach(async ({ page }) => {
  await page.route(FONT_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.setViewportSize({ width: 1280, height: 900 });
});

const node = (page: import('@playwright/test').Page, slug: string) => page.locator(`[data-node="${slug}"]`);

test('renders every connection as an edge and as an accessible list row', async ({ page }) => {
  await page.goto('/graph');
  const edges = page.locator('[data-graph] line[data-from]');
  const rows = page.locator('details tbody tr');
  expect(await edges.count()).toBeGreaterThan(5);
  expect(await rows.count()).toBe(await edges.count());
  await expect(node(page, 'itadori-yuji')).toBeVisible();
});

test('a node is a link to the character page', async ({ page }) => {
  await page.goto('/graph');
  await node(page, 'itadori-yuji').getByText('Yuji Itadori').click();
  await expect(page).toHaveURL(/\/characters\/itadori-yuji$/);
});

test('relationship filters hide and restore edges of that kind', async ({ page }) => {
  await page.goto('/graph');
  const classmates = page.locator('line[data-kind="classmate"]');
  const toggle = page.getByRole('button', { name: 'Classmate' });
  await expect(classmates.first()).toBeAttached();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  for (const l of await classmates.all()) await expect(l).toHaveAttribute('data-off', '');
  await toggle.click();
  await expect(classmates.first()).not.toHaveAttribute('data-off');
});

test('highlighting an organization lights its members only', async ({ page }) => {
  await page.goto('/graph');
  await page.getByRole('button', { name: 'Gojo Clan' }).click();
  await expect(page.locator('[data-graph]')).toHaveAttribute('data-dim', '');
  await expect(node(page, 'gojo-satoru')).toHaveAttribute('data-lit', '');
  await expect(node(page, 'itadori-yuji')).not.toHaveAttribute('data-lit');
});

test('dragging a node stretches its edges, does not navigate, and springs home', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('reduced-motion'), 'dragging is a full-motion enhancement');
  await page.goto('/graph');
  const dot = node(page, 'itadori-yuji').locator('[data-dot]');
  const edge = page.locator('line[data-from="itadori-yuji"]').first();
  await expect(page.locator('[data-graph]')).not.toHaveAttribute('data-intro');
  const home = (await dot.boundingBox())!;
  const x2Before = await edge.getAttribute('x1');

  await page.mouse.move(home.x + home.width / 2, home.y + home.height / 2);
  await page.mouse.down();
  await page.mouse.move(home.x + 160, home.y + 110, { steps: 12 });
  await expect.poll(async () => (await dot.boundingBox())!.x - home.x).toBeGreaterThan(60);
  await expect.poll(() => edge.getAttribute('x1')).not.toBe(x2Before);
  await page.mouse.up();

  await expect(page).toHaveURL(/\/graph$/);
  await expect.poll(async () => Math.abs((await dot.boundingBox())!.x - home.x), { timeout: 4000 }).toBeLessThan(1.5);
});

test('reduced motion shows the graph immediately with no intro state', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('reduced-motion'));
  await page.goto('/graph');
  await expect(page.locator('[data-graph]')).not.toHaveAttribute('data-intro');
  await expect.poll(() => node(page, 'gojo-satoru').locator('[data-drag]').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
});
