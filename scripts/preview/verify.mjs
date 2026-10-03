import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

/**
 * Serves preview/site from a nested prefix with NO directory-index fallback (like a bare file host)
 * and drives it: every request must stay under the prefix and succeed.
 */
const PREFIX = '/artifact/xyz/site/';
const ROOT = path.resolve('preview/site');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.json': 'application/json' };
const bad = [];

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = path.join(ROOT, decodeURIComponent(url.pathname.slice(PREFIX.length)));
  try {
    if (!url.pathname.startsWith(PREFIX) || !(await stat(file)).isFile()) throw new Error('miss');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    bad.push(`404 ${url.pathname}`);
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const origin = `http://localhost:${server.address().port}`;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
const page = await browser.newPage();
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
page.on('pageerror', (e) => bad.push(`pageerror ${e.message}`));
page.on('request', (r) => {
  const u = new URL(r.url());
  if (u.origin === origin && !u.pathname.startsWith(PREFIX)) bad.push(`outside prefix ${u.pathname}`);
});

const step = async (name, fn) => {
  await fn();
  console.log('ok', name);
};
await step('home', async () => {
  await page.goto(`${origin}${PREFIX}index.html`);
  await page.getByRole('heading', { level: 1 }).waitFor();
});
await step('nav to characters', async () => {
  await page.getByRole('link', { name: 'Characters', exact: true }).first().click();
  await page.getByRole('heading', { level: 1, name: 'Characters' }).waitFor();
});
await step('character page', async () => {
  await page.locator('[data-grid-item] a').first().click();
  await page.waitForURL(/characters\/.+\/index\.html/);
});
await step('graph page', async () => {
  await page.getByRole('link', { name: 'Graph', exact: true }).first().click();
  await page.locator('[data-graph]').waitFor();
});
await step('search', async () => {
  await page.locator('astro-island[ssr]').first().waitFor({ state: 'detached' });
  await page.keyboard.press('/');
  await page.getByRole('combobox').fill('gojo');
  await page.getByRole('option').first().waitFor({ timeout: 8000 });
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/(characters|organizations|techniques|domains|arcs)\/[^/]+\/index\.html/);
});

await browser.close();
server.close();
if (bad.length) {
  console.error([...new Set(bad)].join('\n'));
  process.exit(1);
}
console.log('preview bundle OK');
