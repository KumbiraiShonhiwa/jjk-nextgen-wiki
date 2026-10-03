#!/usr/bin/env node
/**
 * Per-route bundle budgets. For every built HTML page, sums the gzip size of its HTML, the CSS it
 * links, and the JS it loads (scripts, island renderers and components, plus their static imports).
 * Fails when a route is over budget. Run after `pnpm build`:  node scripts/check-budgets.mjs
 *
 *   --json   print the measurements as JSON (used by tests)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, posix, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve(process.argv.find((a) => a.startsWith('--dist='))?.slice(7) ?? 'dist');
const budgetFile = resolve(process.argv.find((a) => a.startsWith('--budgets='))?.slice(10) ?? 'budgets.json');
const asJson = process.argv.includes('--json');
const KIB = 1024;

export function gzipSize(buf) {
  return gzipSync(buf, { level: 9 }).length;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'pagefind') continue; // search index, loaded on demand
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Asset URLs (/_astro/..) that a page refers to. */
export function assetRefs(html) {
  const out = new Set();
  for (const m of html.matchAll(/(?:src|href|component-url|renderer-url)="(\/_astro\/[^"]+\.(?:js|css))"/g)) out.add(m[1]);
  // Inlined module scripts import their chunks directly.
  for (const m of html.matchAll(/import\(?\s*["'](\/_astro\/[^"']+\.js)["']/g)) out.add(m[1]);
  return out;
}

/** Relative static imports of a built JS chunk, resolved to site URLs. */
export function staticImports(code, url) {
  const out = [];
  for (const m of code.matchAll(/(?:\bfrom|\bimport)\s*["'](\.{1,2}\/[^"']+\.js)["']/g)) out.push(posix.join(posix.dirname(url), m[1]));
  return out;
}

const cache = new Map();
function chunk(url) {
  if (!cache.has(url)) {
    const file = join(root, url);
    cache.set(url, existsSync(file) ? readFileSync(file) : null);
  }
  return cache.get(url);
}

export function measureRoute(html) {
  const seen = new Set();
  const stack = [...assetRefs(html)];
  while (stack.length) {
    const url = stack.pop();
    if (seen.has(url)) continue;
    seen.add(url);
    const buf = chunk(url);
    if (buf && url.endsWith('.js')) stack.push(...staticImports(buf.toString('utf8'), url));
  }
  const sum = (ext) => [...seen].filter((u) => u.endsWith(ext)).reduce((n, u) => n + (chunk(u) ? gzipSize(chunk(u)) : 0), 0);
  return { html: gzipSize(Buffer.from(html)), css: sum('.css'), js: sum('.js') };
}

function main() {
  const budgets = JSON.parse(readFileSync(budgetFile, 'utf8'));
  const rows = [];
  for (const file of walk(root)) {
    if (!file.endsWith('.html')) continue;
    const route = '/' + relative(root, file).replace(/index\.html$/, '').replace(/\.html$/, '').replace(/\/$/, '');
    const m = measureRoute(readFileSync(file, 'utf8'));
    const limit = { ...budgets.route, ...(budgets.overrides[route] ?? {}) };
    const over = ['js', 'css', 'html'].filter((k) => m[k] > limit[k] * KIB);
    rows.push({ route: route === '/' ? '/' : route, ...m, limit, over });
  }
  rows.sort((a, b) => b.js - a.js);

  if (asJson) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    const kb = (n) => (n / KIB).toFixed(1).padStart(6);
    console.log('route'.padEnd(36), '  js(KiB)  css(KiB)  html(KiB)');
    for (const r of rows.slice(0, 12)) {
      console.log(r.route.padEnd(36), kb(r.js), '  ', kb(r.css), '  ', kb(r.html), r.over.length ? `  OVER: ${r.over.join(',')}` : '');
    }
    if (rows.length > 12) console.log(`... ${rows.length - 12} more routes, all within budget or listed above`);
  }
  const failing = rows.filter((r) => r.over.length);
  if (failing.length) {
    for (const r of failing) console.error(`::error title=bundle budget::${r.route} is over budget for ${r.over.join(', ')}`);
    process.exit(1);
  }
  if (!asJson) console.log(`\nAll ${rows.length} routes are within budget.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
