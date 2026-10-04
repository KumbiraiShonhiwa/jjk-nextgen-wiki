#!/usr/bin/env node
/**
 * Per-route bundle budgets. For every built HTML page, sums the gzip size of its HTML, the CSS it
 * links, and the JS it loads (scripts, island renderers and components, plus their static imports).
 * Fails when a route is over budget. Run after `pnpm build`:  node scripts/check-budgets.mjs
 *
 *   --json   print the measurements as JSON (used by tests)
 *
 * `js` counts only what the route loads up front. Chunks reached through a dynamic `import()`
 * (the WebGL hero, ADR-007) load on demand and so are measured separately as `lazy`: they don't
 * block first paint, but they are still bytes a visitor downloads, so they get their own limit
 * rather than being invisible.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, posix, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
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

/** Relative `import()` targets of a built JS chunk, resolved to site URLs. Loaded on demand, not with the route. */
export function dynamicImports(code, url) {
  const out = [];
  for (const m of code.matchAll(/\bimport\s*\(\s*["'](\.{1,2}\/[^"']+\.js)["']\s*\)/g)) out.push(posix.join(posix.dirname(url), m[1]));
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
  const deferred = [];
  const stack = [...assetRefs(html)];
  while (stack.length) {
    const url = stack.pop();
    if (seen.has(url)) continue;
    seen.add(url);
    const buf = chunk(url);
    if (buf && url.endsWith('.js')) {
      const code = buf.toString('utf8');
      stack.push(...staticImports(code, url));
      deferred.push(...dynamicImports(code, url));
    }
  }

  // Everything reachable only through an import(), plus whatever those chunks pull in statically.
  const lazy = new Set();
  const lazyStack = [...deferred];
  while (lazyStack.length) {
    const url = lazyStack.pop();
    if (seen.has(url) || lazy.has(url)) continue;
    lazy.add(url);
    const buf = chunk(url);
    if (buf && url.endsWith('.js')) {
      const code = buf.toString('utf8');
      lazyStack.push(...staticImports(code, url), ...dynamicImports(code, url));
    }
  }

  const sum = (urls, ext) => [...urls].filter((u) => u.endsWith(ext)).reduce((n, u) => n + (chunk(u) ? gzipSize(chunk(u)) : 0), 0);
  return { html: gzipSize(Buffer.from(html)), css: sum(seen, '.css'), js: sum(seen, '.js'), lazy: sum(lazy, '.js') };
}

function main() {
  const budgets = JSON.parse(readFileSync(budgetFile, 'utf8'));
  const rows = [];
  for (const file of walk(root)) {
    if (!file.endsWith('.html')) continue;
    // Split on the platform separator and rejoin with "/", so a route key is the same on Windows
    // and Linux. Without this, `overrides` entries never match on Windows.
    const route = ('/' + relative(root, file).split(sep).join('/')).replace(/index\.html$/, '').replace(/\.html$/, '').replace(/(?!^)\/$/, '');
    const m = measureRoute(readFileSync(file, 'utf8'));
    const limit = { ...budgets.route, ...(budgets.overrides[route] ?? {}) };
    const over = ['js', 'css', 'html', 'lazy'].filter((k) => limit[k] !== undefined && m[k] > limit[k] * KIB);
    rows.push({ route: route === '/' ? '/' : route, ...m, limit, over });
  }
  rows.sort((a, b) => b.js - a.js);

  if (asJson) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    const kb = (n) => (n / KIB).toFixed(1).padStart(6);
    console.log('route'.padEnd(36), '  js(KiB)  css(KiB)  html(KiB)  lazy(KiB)');
    for (const r of rows.slice(0, 12)) {
      console.log(r.route.padEnd(36), kb(r.js), '  ', kb(r.css), '  ', kb(r.html), '  ', kb(r.lazy), r.over.length ? `  OVER: ${r.over.join(',')}` : '');
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

// pathToFileURL, not a `file://` template: on Windows argv[1] is a `C:\…` path, which never
// matches import.meta.url, so the template form silently skipped the whole check locally.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
