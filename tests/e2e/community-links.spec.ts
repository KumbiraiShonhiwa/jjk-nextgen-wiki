import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { communityLink } from '../../src/content/schemas';

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
test.beforeEach(async ({ page }) => {
  await page.route(FONT_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
});

const root = join(import.meta.dirname, '../../content');
const links = (JSON.parse(readFileSync(join(root, 'links/community.json'), 'utf8')) as unknown[]).map((l) => communityLink.parse(l));
const pageFor = (slug: string) => (existsSync(join(root, 'arcs', `${slug}.json`)) ? `/arcs/${slug}` : `/characters/${slug}`);
const LEVELS = ['none', 'anime-s1', 'anime-s2', 'anime-s3', 'manga'];

// The curated list may legitimately be empty; these tests run once it has links in it.
test.skip(links.length === 0, 'no community links curated yet');

for (const l of links) {
  for (const target of l.targets) {
    test(`${l.id} on ${target}: hidden below its level, an external link with safe rel above it`, async ({ page }) => {
      const anchor = page.locator(`a[href="${l.url}"]`);
      const lowest = LEVELS[Math.max(LEVELS.indexOf(l.level) - 1, 0)];

      if (LEVELS.indexOf(l.level) > 0) {
        await page.addInitScript((v) => localStorage.setItem('jjk:spoiler-level', v), lowest);
        await page.goto(pageFor(target));
        await expect(anchor).toBeHidden();
      }

      await page.addInitScript(() => localStorage.setItem('jjk:spoiler-level', 'manga'));
      await page.goto(pageFor(target));
      await expect(anchor).toBeVisible();
      await expect(anchor).toHaveAttribute('rel', /noopener/);
      await expect(anchor).toHaveAttribute('rel', /noreferrer/);
      await expect(anchor).toHaveAttribute('rel', /nofollow/);
      await expect(anchor).toHaveAttribute('target', '_blank');
    });
  }
}
