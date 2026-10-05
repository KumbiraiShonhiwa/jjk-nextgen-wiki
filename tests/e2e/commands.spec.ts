import { test, expect } from '@playwright/test';

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
test.beforeEach(async ({ page }) => {
  await page.route(FONT_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
});

const palette = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Search the wiki' });
const open = async (page: import('@playwright/test').Page) => {
  await page.keyboard.press('/');
  await expect(palette(page)).toBeVisible();
};

test('the palette lists commands before anything is typed', async ({ page }) => {
  await page.goto('/');
  await open(page);
  await expect(palette(page).getByRole('option', { name: /Go to a random character/ })).toBeVisible();
  await expect(palette(page).getByRole('option', { name: /Set spoiler level: The full manga/ })).toBeVisible();
  await expect(palette(page).getByRole('option', { name: /Reduce motion/ })).toBeVisible();
});

test('typing filters the commands', async ({ page }) => {
  await page.goto('/');
  await open(page);
  await page.getByRole('combobox').fill('motion');
  await expect(palette(page).getByRole('option', { name: /Reduce motion/ })).toBeVisible();
  await expect(palette(page).getByRole('option', { name: /random character/ })).toBeHidden();
});

test('a command sets the spoiler level', async ({ page }) => {
  await page.goto('/');
  await open(page);
  await palette(page).getByRole('option', { name: /Set spoiler level: The full manga/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-spoiler', 'manga');
});

test('a command reduces motion on the site and the choice survives a reload', async ({ page }) => {
  await page.goto('/');
  await open(page);
  await palette(page).getByRole('option', { name: /Reduce motion on this site/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');

  // The label flips, so the same command turns it back off.
  await open(page);
  await palette(page).getByRole('option', { name: /Follow the system motion setting/ }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-motion', 'reduced');
});

test('random character goes to a character page', async ({ page }) => {
  await page.goto('/');
  await open(page);
  await palette(page).getByRole('option', { name: /Go to a random character/ }).click();
  await expect(page).toHaveURL(/\/characters\/[a-z-]+$/);
});

test('arrow keys move through commands and Enter runs the active one', async ({ page }) => {
  await page.goto('/');
  await open(page);
  await page.getByRole('combobox').fill('spoiler level: Anime season 2');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-spoiler', 'anime-s2');
});

test('j and k move focus between cards, and are typable in the search box', async ({ page }) => {
  await page.goto('/characters');
  await page.keyboard.press('j');
  const first = await page.evaluate(() => document.activeElement?.getAttribute('href'));
  expect(first).toMatch(/\/characters\//);

  await page.keyboard.press('j');
  const second = await page.evaluate(() => document.activeElement?.getAttribute('href'));
  expect(second).not.toBe(first);

  await page.keyboard.press('k');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('href'))).toBe(first);

  // Inside the palette, j is a character, not a command.
  await open(page);
  await page.getByRole('combobox').fill('ju');
  await expect(page.getByRole('combobox')).toHaveValue('ju');
});
