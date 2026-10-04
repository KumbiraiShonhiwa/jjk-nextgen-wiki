import { describe, expect, it } from 'vitest';
import { assetRefs, dynamicImports, gzipSize, staticImports } from '../../scripts/check-budgets.mjs';

describe('assetRefs', () => {
  it('finds scripts, stylesheets and island entry points, once each', () => {
    const html = `
      <link rel="stylesheet" href="/_astro/Base.abc.css">
      <script type="module" src="/_astro/page.def.js"></script>
      <astro-island component-url="/_astro/SearchPalette.1.js" renderer-url="/_astro/client.2.js"></astro-island>
      <astro-island component-url="/_astro/SearchPalette.1.js" renderer-url="/_astro/client.2.js"></astro-island>
      <script type="module">import("/_astro/inline.3.js")</script>
      <a href="/characters/gojo-satoru">link</a>`;
    expect([...assetRefs(html)].sort()).toEqual([
      '/_astro/Base.abc.css',
      '/_astro/SearchPalette.1.js',
      '/_astro/client.2.js',
      '/_astro/inline.3.js',
      '/_astro/page.def.js',
    ]);
  });

  it('ignores pages and non-asset URLs', () => {
    expect(assetRefs('<a href="/arcs">x</a><img src="/favicon.svg">').size).toBe(0);
  });
});

describe('staticImports', () => {
  it('resolves relative chunk imports against the importing file', () => {
    const code = `import{a}from"./split.1.js";import"./stagger.2.js";export{a};`;
    expect(staticImports(code, '/_astro/page.js')).toEqual(['/_astro/split.1.js', '/_astro/stagger.2.js']);
  });
  it('leaves dynamic imports out: they load on demand, not with the route', () => {
    expect(staticImports(`const m=()=>import("./lazy.3.js")`, '/_astro/page.js')).toEqual([]);
  });
  it('ignores bare and absolute specifiers', () => {
    expect(staticImports(`import x from"svelte";import y from"/abs.js"`, '/_astro/a.js')).toEqual([]);
  });
});

describe('dynamicImports', () => {
  it('resolves import() targets against the importing file, so lazy weight is measurable', () => {
    const code = `const hero=()=>import("./webgl.4.js");const b=()=>import( './three.5.js' )`;
    expect(dynamicImports(code, '/_astro/page.js')).toEqual(['/_astro/webgl.4.js', '/_astro/three.5.js']);
  });
  it('leaves static imports out: those already count towards js', () => {
    expect(dynamicImports(`import{a}from"./split.1.js"`, '/_astro/page.js')).toEqual([]);
  });
  it('ignores bare and absolute specifiers', () => {
    expect(dynamicImports(`import("svelte");import("/pagefind/pagefind.js")`, '/_astro/a.js')).toEqual([]);
  });
});

describe('gzipSize', () => {
  it('measures compressed bytes, so repetition is cheap', () => {
    const repeated = Buffer.from('abcdefgh'.repeat(10_000));
    expect(gzipSize(repeated)).toBeLessThan(repeated.length / 50);
  });
});
