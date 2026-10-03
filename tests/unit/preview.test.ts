import { afterEach, describe, expect, it } from 'vitest';
import { relativeTarget, rewriteCss, rewriteHtml } from '../../scripts/preview/relativize.mjs';
import { hitHref, sitePath } from '../../src/lib/site';

describe('relativeTarget', () => {
  it('turns directory URLs into index files relative to the page', () => {
    expect(relativeTarget('index.html', '/')).toBe('index.html');
    expect(relativeTarget('index.html', '/characters')).toBe('characters/index.html');
    expect(relativeTarget('characters/index.html', '/techniques')).toBe('../techniques/index.html');
    expect(relativeTarget('characters/gojo/index.html', '/')).toBe('../../index.html');
  });
  it('keeps assets, query strings and hashes, and leaves other URLs alone', () => {
    expect(relativeTarget('arcs/index.html', '/_astro/a.css')).toBe('../_astro/a.css');
    expect(relativeTarget('arcs/index.html', '/arcs/x?y=1#z')).toBe('x/index.html?y=1#z');
    expect(relativeTarget('arcs/index.html', 'https://example.com/a')).toBe('https://example.com/a');
    expect(relativeTarget('arcs/index.html', '//cdn.example/a.js')).toBe('//cdn.example/a.js');
    expect(relativeTarget('arcs/index.html', 'relative/ok')).toBe('relative/ok');
  });
});

describe('rewriteHtml / rewriteCss', () => {
  it('rewrites href, src and island URLs and marks the root', () => {
    const html = '<html lang="en"><a href="/graph">g</a><script src="/_astro/a.js"></script><astro-island component-url="/_astro/c.js"></astro-island></html>';
    const out = rewriteHtml(html, 'characters/index.html');
    expect(out).toContain('href="../graph/index.html"');
    expect(out).toContain('src="../_astro/a.js"');
    expect(out).toContain('component-url="../_astro/c.js"');
    expect(out).toContain('data-root="../"');
    expect(out).toContain('data-index="index.html"');
    expect(rewriteHtml('<html><a href="/">x</a></html>', 'index.html')).toContain('data-root="./"');
  });
  it('drops the client router so every navigation is a full page load', () => {
    const html = '<html><meta name="astro-view-transitions-enabled" content="true"><meta name="astro-view-transitions-fallback" content="animate"><script type="module" src="/_astro/ClientRouter.astro_x.js"></script><script src="/_astro/Base.js"></script></html>';
    const out = rewriteHtml(html, 'index.html');
    expect(out).not.toContain('view-transitions');
    expect(out).not.toContain('ClientRouter');
    expect(out).toContain('src="_astro/Base.js"');
  });
  it('rewrites css url() references', () => {
    expect(rewriteCss('a{src:url(/_astro/f.woff2)}b{src:url("/_astro/g.woff")}', '_astro/b.css')).toBe('a{src:url(f.woff2)}b{src:url("g.woff")}');
  });
});

describe('sitePath', () => {
  afterEach(() => {
    delete document.documentElement.dataset.root;
    delete document.documentElement.dataset.index;
  });
  it('is the identity on a normally mounted site', () => {
    expect(sitePath('/characters/gojo-satoru')).toBe('/characters/gojo-satoru');
  });
  it('leaves search hits alone on a normally mounted site and adds the index file in the preview', () => {
    expect(hitHref('/characters/gojo-satoru')).toBe('/characters/gojo-satoru');
    document.documentElement.dataset.root = '../';
    document.documentElement.dataset.index = 'index.html';
    expect(hitHref('/a/b/site/characters/gojo-satoru')).toBe('/a/b/site/characters/gojo-satoru/index.html');
    expect(hitHref('/a/b/site/characters/gojo-satoru/')).toBe('/a/b/site/characters/gojo-satoru/index.html');
  });
  it('resolves against the preview root', () => {
    document.documentElement.dataset.root = '../';
    document.documentElement.dataset.index = 'index.html';
    expect(sitePath('/characters/gojo-satoru')).toBe('../characters/gojo-satoru/index.html');
    expect(sitePath('/')).toBe('../index.html');
    expect(sitePath('/pagefind/pagefind.js')).toBe('../pagefind/pagefind.js');
  });
});
