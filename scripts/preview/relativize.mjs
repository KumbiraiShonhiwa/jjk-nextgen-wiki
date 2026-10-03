import path from 'node:path';

/**
 * Rewrites root-absolute URLs ("/characters", "/_astro/x.css") to paths relative to the file that
 * contains them, so a built site works when served from any folder and without directory indexes.
 * Directory URLs become explicit index files.
 */
const INDEX = 'index.html';

export function relativeTarget(fromFile, url) {
  if (!url.startsWith('/') || url.startsWith('//')) return url;
  const m = url.match(/^([^?#]*)(.*)$/);
  let target = m[1].replace(/^\//, '');
  const suffix = m[2];
  if (!/\.[a-z0-9]+$/i.test(target)) target = (target ? target.replace(/\/$/, '') + '/' : '') + INDEX;
  const rel = path.posix.relative(path.posix.dirname(fromFile), target) || INDEX;
  return rel + suffix;
}

const ATTRS = 'href|src|action|component-url|renderer-url|before-hydration-url';

export function rewriteHtml(html, file) {
  const depth = path.posix.dirname(file) === '.' ? 0 : path.posix.dirname(file).split('/').length;
  const root = depth === 0 ? './' : '../'.repeat(depth);
  // Client-side navigation swaps documents, which breaks relative URLs at different depths; use full page loads.
  const plain = html
    .replace(/<meta name="astro-view-transitions-[a-z]+" content="[^"]*">/g, '')
    .replace(/<script[^>]*ClientRouter[^>]*><\/script>/g, '');
  const out = plain.replace(new RegExp(`(\\s(?:${ATTRS})=")(/[^"]*)"`, 'g'), (_, pre, url) => `${pre}${relativeTarget(file, url)}"`);
  return out.replace(/<html\b([^>]*)>/i, (_, attrs) => `<html${attrs} data-root="${root}" data-index="${INDEX}">`);
}

export function rewriteCss(css, file) {
  return css.replace(/url\((['"]?)(\/[^)'"]*)\1\)/g, (_, q, url) => `url(${q}${relativeTarget(file, url)}${q})`);
}
