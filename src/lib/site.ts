/**
 * Where the site is mounted. Normally `/`. The static preview bundle (scripts/preview) is served
 * from an arbitrary path with no directory index, so it sets `data-root` (relative path back to the
 * site root) and `data-index` (index file name) on <html>, and runtime links go through here.
 */
function dataset(): DOMStringMap | undefined {
  return typeof document === 'undefined' ? undefined : document.documentElement.dataset;
}

export function sitePath(path: string): string {
  const d = dataset();
  const root = d?.root;
  if (!root) return path;
  const clean = path.replace(/^\//, '');
  if (/\.[a-z0-9]+$/i.test(clean)) return root + clean;
  const dir = clean.replace(/\/$/, '');
  return root + (dir ? dir + '/' : '') + (d?.index ?? '');
}

/**
 * Link for a Pagefind hit. Pagefind prefixes hits with the folder it was loaded from, so in the
 * preview the URL is already host-absolute; it only needs the explicit index file.
 */
export function hitHref(url: string): string {
  const d = dataset();
  if (!d?.root) return url;
  return url.replace(/\/$/, '') + '/' + (d.index ?? '');
}
